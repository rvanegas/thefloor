import { newId, type Db } from './db';
import type { RoomView, SegmentView } from '../../core/protocol';
import type { Segments } from './segments';

/**
 * How long LiveKit keeps a room standing after its last participant leaves —
 * its `room.departure_timeout`, which `bin/provision-livekit` sets to this
 * (LiveKit's own default, written down so that it is not an assumption). **A room here is meant to be that room**: one
 * LiveKit room from creation to deletion, of which `mediaRoom` is the name.
 * Somebody stepping back in inside this window finds the same LiveKit room
 * still standing, so the sitting carries on rather than a second beginning.
 * Change it with the config, or the two stop agreeing.
 */
export const ROOM_DEPARTURE_MS = 20_000;

export interface RoomRow {
  id: string;
  channel_id: string;
  opened_at: number;
  closed_at: number | null;
  closed_by_boot: number;
}

/**
 * **A room is one LiveKit room, from creation to deletion**: a channel's
 * sitting, from the first person here to the last one gone, written on those
 * two transitions of `peopleHere` by the channel registry and never inferred
 * afterwards. Everybody here holds a connection to the channel's LiveKit room
 * — members present and guests alike, and the transcription listener and the
 * shared track's participant follow the same count — so LiveKit creates it on
 * the first and deletes it `ROOM_DEPARTURE_MS` after the last, and a return
 * inside that window is the same room. A restart deletes it too; see
 * `restore`. It is the unit the *Record* tab is laid out in and the unit whose
 * audio is shared whole.
 *
 * Everybody here leaves together at the end: the guests go with the last
 * member (`settleEmpty` in core, `Guests.channelEmptied` here), so a room
 * ends for everybody in it at once. Their apps then drop the LiveKit
 * connection a moment later, which is the only gap between the two.
 *
 * Nothing before 2026-10-09 has one, and nothing is reconstructed —
 * `usage_spans` could, and the application does not read it. **A recording
 * that falls in no room stands as one of its own** in what `forChannel`
 * lists: a span exactly as long as the run, recorded, and transcribed only
 * if that recording was by batch — so the recordings made before rooms
 * existed open the log rather than vanishing from it.
 */
export class Rooms {
  /** Where each room's segments are read from; set by the registry. */
  segments?: Segments;

  constructor(private db: Db) {}

  /** The channel has gone from nobody here to somebody. */
  opened(channelId: string, now: number): void {
    const last = this.db
      .prepare(
        'SELECT * FROM rooms WHERE channel_id = ? ORDER BY opened_at DESC LIMIT 1'
      )
      .get(channelId) as RoomRow | undefined;
    if (last && last.closed_at === null) return;
    if (
      last &&
      last.closed_at !== null &&
      last.closed_by_boot === 0 &&
      now - last.closed_at <= ROOM_DEPARTURE_MS
    ) {
      this.db.prepare('UPDATE rooms SET closed_at = NULL WHERE id = ?').run(last.id);
      return;
    }
    this.db
      .prepare('INSERT INTO rooms (id, channel_id, opened_at) VALUES (?, ?, ?)')
      .run(newId('room'), channelId, now);
  }

  /** The last person here has gone. */
  closed(channelId: string, now: number): void {
    this.db
      .prepare('UPDATE rooms SET closed_at = ? WHERE channel_id = ? AND closed_at IS NULL')
      .run(now, channelId);
  }

  /**
   * Closes every room the previous process left open, at the boot. A restart
   * ends the LiveKit room — `restore` in the registry deletes every revived
   * channel's — so the people reconnecting are in a new one, and so is the
   * sitting — even for the people back inside `ROOM_DEPARTURE_MS`, which
   * after a restart is nearly everybody.
   */
  restore(now: number): void {
    this.db
      .prepare('UPDATE rooms SET closed_at = ?, closed_by_boot = 1 WHERE closed_at IS NULL')
      .run(now);
  }

  /**
   * A channel's rooms that kept something, oldest first: a finished recording
   * or a line of live transcript inside its span. A sitting nobody recorded or
   * transcribed left nothing to show and is not one. A finished recording
   * inside no sitting is listed as a room of its own, `standIn` — see above.
   */
  forChannel(channelId: string, now: number): RoomView[] {
    const rows = this.db
      .prepare('SELECT * FROM rooms WHERE channel_id = ? ORDER BY opened_at')
      .all(channelId) as unknown as RoomRow[];
    const recordingsIn = this.db.prepare(
      `SELECT id FROM recordings
       WHERE channel_id = ? AND ended_at IS NOT NULL AND deleted_at IS NULL
         AND started_at >= ? AND started_at <= ?
       ORDER BY started_at`
    );
    const recordingsOf = this.db.prepare(
      `SELECT id, started_at, ended_at FROM recordings
       WHERE channel_id = ? AND ended_at IS NOT NULL AND deleted_at IS NULL
       ORDER BY started_at`
    );
    const transcribedIn = this.db.prepare(
      'SELECT 1 FROM live_lines WHERE channel_id = ? AND start_at >= ? AND start_at <= ? LIMIT 1'
    );
    // A batch transcript is the room's text as much as a live line is, since
    // 2026-10-10: it is drawn in the log the same way and shared with it.
    const batchOf = this.db.prepare(
      `SELECT 1 FROM transcripts
       WHERE recording_id = ? AND state = 'ready' AND deleted_at IS NULL`
    );
    const anyBatch = (ids: readonly string[]) => ids.some((id) => !!batchOf.get(id));
    const rooms: RoomView[] = [];
    for (const row of rows) {
      const until = row.closed_at ?? now;
      const recordingIds = (
        recordingsIn.all(channelId, row.opened_at, until) as Array<{ id: string }>
      ).map((r) => r.id);
      const transcribed =
        !!transcribedIn.get(channelId, row.opened_at, until) || anyBatch(recordingIds);
      if (recordingIds.length === 0 && !transcribed) continue;
      rooms.push({
        id: row.id,
        openedAt: row.opened_at,
        closedAt: row.closed_at,
        recordingIds,
        transcribed,
        segments: this.segmentsOf(channelId, row.opened_at, until, recordingIds),
      });
    }
    const placed = new Set(rooms.flatMap((room) => room.recordingIds));
    const strays = (
      recordingsOf.all(channelId) as Array<{ id: string; started_at: number; ended_at: number }>
    ).filter((r) => !placed.has(r.id));
    for (const stray of strays) {
      rooms.push({
        id: standInId(stray.id),
        openedAt: stray.started_at,
        closedAt: stray.ended_at,
        recordingIds: [stray.id],
        transcribed: anyBatch([stray.id]),
        segments: [
          {
            id: standInId(stray.id),
            startedAt: stray.started_at,
            endedAt: stray.ended_at,
            recordingId: stray.id,
            text: false,
          },
        ],
        standIn: true,
      });
    }
    return rooms.sort((a, b) => a.openedAt - b.openedAt);
  }

  /**
   * A room's segments: as written, or for a room from before they were,
   * derived — each finished recording one, kept as text too if any live line
   * fell inside it, and the live lines between recordings one text segment
   * per gap, from the first such line to the last. A recording without a
   * row of its own in a room that has rows was still being filed, and is
   * left to the next read.
   */
  private segmentsOf(
    channelId: string,
    from: number,
    until: number,
    recordingIds: readonly string[]
  ): SegmentView[] {
    const written = this.segments?.within(channelId, from, until) ?? [];
    if (written.length > 0) {
      return written.map((row) => ({
        id: row.id,
        startedAt: row.started_at,
        endedAt: row.ended_at,
        recordingId: row.recording_id,
        text: row.text === 1,
      }));
    }
    const runs = recordingIds
      .map(
        (id) =>
          this.db
            .prepare('SELECT id, started_at, ended_at FROM recordings WHERE id = ?')
            .get(id) as { id: string; started_at: number; ended_at: number }
      )
      .filter((r) => !!r);
    const linesIn = this.db.prepare(
      `SELECT MIN(start_at) first, MAX(end_at) last FROM live_lines
       WHERE channel_id = ? AND start_at >= ? AND start_at < ?`
    );
    const derived: SegmentView[] = [];
    let gapFrom = from;
    for (const run of [...runs, null]) {
      const gapUntil = run ? run.started_at : until + 1;
      const gap = linesIn.get(channelId, gapFrom, gapUntil) as {
        first: number | null;
        last: number | null;
      };
      if (gap.first !== null && gap.last !== null) {
        derived.push({
          id: `derived_${channelId}_${gap.first}`,
          startedAt: gap.first,
          endedAt: gap.last,
          recordingId: null,
          text: true,
        });
      }
      if (!run) break;
      const inside = linesIn.get(channelId, run.started_at, run.ended_at + 1) as {
        first: number | null;
      };
      derived.push({
        id: `derived_${run.id}`,
        startedAt: run.started_at,
        endedAt: run.ended_at,
        recordingId: run.id,
        text: inside.first !== null,
      });
      gapFrom = run.ended_at + 1;
    }
    return derived;
  }

  /** One room of one channel, or nothing. */
  get(channelId: string, roomId: string): RoomRow | undefined {
    return this.db
      .prepare('SELECT * FROM rooms WHERE id = ? AND channel_id = ?')
      .get(roomId, channelId) as RoomRow | undefined;
  }
}

/** The id a recording's stand-in room is listed under; see `Rooms`. */
export function standInId(recordingId: string): string {
  return `standin_${recordingId}`;
}
