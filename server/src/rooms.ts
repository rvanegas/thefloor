import { newId, type Db } from './db';
import type { RoomView } from '../../core/protocol';

/**
 * How long after a boot a room closed by the restart may be taken up again.
 *
 * Presence does not survive a restart, so every room open at the crash is
 * closed by `restore` — and then everybody who was in it reconnects and steps
 * back in, which is the empty-to-occupied transition that opens a room. Within
 * this window that is the same sitting resuming rather than a new one; past it,
 * nobody came back and the room really did end at the restart.
 */
export const ROOM_RESUME_MS = 10 * 60_000;

/**
 * How long LiveKit keeps a room standing after its last participant leaves —
 * its `room.departure_timeout`, which `bin/provision-livekit` does not set, so
 * this is LiveKit's default. **A room here is meant to be that room**: one
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
  closed_by_restart: number;
}

/**
 * **A room is a sitting**: a channel's span from the first member stepping in
 * to the last stepping out, written on those two transitions by the channel
 * registry and never inferred afterwards. Being present is holding a
 * connection to the channel's LiveKit room, so this is that room's lifetime:
 * LiveKit creates it on the first connection and deletes it
 * `ROOM_DEPARTURE_MS` after the last, which is why a return inside that
 * window is the same room. It is the unit the *Record* tab is
 * laid out in and the unit whose audio is shared whole.
 *
 * Bounded by members, because `channelEmptied` is — and that moment also ends
 * every guest's seat, so it is the end of the room for everybody in it.
 *
 * Nothing before 2026-10-09 has one, and nothing is reconstructed —
 * `usage_spans` could, and the application does not read it. **A recording
 * that falls in no room stands as one of its own** in what `forChannel`
 * lists: a span exactly as long as the run, recorded and not transcribed,
 * so the recordings made before rooms existed open the log rather than
 * vanishing from it.
 */
export class Rooms {
  constructor(private db: Db) {}

  /** The channel has gone from nobody present to somebody. */
  opened(channelId: string, now: number): void {
    const last = this.db
      .prepare(
        'SELECT * FROM rooms WHERE channel_id = ? ORDER BY opened_at DESC LIMIT 1'
      )
      .get(channelId) as RoomRow | undefined;
    if (last && last.closed_at === null) return;
    const window = last?.closed_by_restart === 1 ? ROOM_RESUME_MS : ROOM_DEPARTURE_MS;
    if (last && last.closed_at !== null && now - last.closed_at <= window) {
      this.db
        .prepare('UPDATE rooms SET closed_at = NULL, closed_by_restart = 0 WHERE id = ?')
        .run(last.id);
      return;
    }
    this.db
      .prepare('INSERT INTO rooms (id, channel_id, opened_at) VALUES (?, ?, ?)')
      .run(newId('room'), channelId, now);
  }

  /** The last member present has stepped out. */
  closed(channelId: string, now: number): void {
    this.db
      .prepare('UPDATE rooms SET closed_at = ? WHERE channel_id = ? AND closed_at IS NULL')
      .run(now, channelId);
  }

  /**
   * Closes every room the previous process left open, marked so that the
   * people reconnecting within `ROOM_RESUME_MS` resume it. See `opened`.
   */
  restore(now: number): void {
    this.db
      .prepare('UPDATE rooms SET closed_at = ?, closed_by_restart = 1 WHERE closed_at IS NULL')
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
    const rooms: RoomView[] = [];
    for (const row of rows) {
      const until = row.closed_at ?? now;
      const recordingIds = (
        recordingsIn.all(channelId, row.opened_at, until) as Array<{ id: string }>
      ).map((r) => r.id);
      const transcribed = !!transcribedIn.get(channelId, row.opened_at, until);
      if (recordingIds.length === 0 && !transcribed) continue;
      rooms.push({
        id: row.id,
        openedAt: row.opened_at,
        closedAt: row.closed_at,
        recordingIds,
        transcribed,
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
        transcribed: false,
        standIn: true,
      });
    }
    return rooms.sort((a, b) => a.openedAt - b.openedAt);
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
