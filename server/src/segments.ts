import { isTranscribingLive } from '../../core/channel';
import type { ChannelState } from '../../core/types';
import { newId, type Db } from './db';

export interface SegmentRow {
  id: string;
  channel_id: string;
  started_at: number;
  ended_at: number | null;
  recording_id: string | null;
  text: number;
}

/**
 * **A segment is a stretch of a room kept one way throughout** — as audio, as
 * text, or as both — since 2026-10-10. The record is a sequence of them, one
 * or more per room, and every change of what is kept is a clean break: Audio
 * or Text switched, a Pause, a Resume. Where both are kept they cover exactly
 * the same span, because core ends the audio's run and begins another
 * whenever the text changes under it (`restartOnTextChange`), so a recording
 * is exactly one segment's audio, never part of one and never two.
 *
 * Written on the transitions, by the channel registry, as rooms are: what is
 * kept is the running run's id and whether the live transcript is listening
 * (`isTranscribingLive`), and when that pair changes the open segment closes
 * and, if anything is still kept, the next opens at the same instant. One
 * that would close at the moment it opened was never anything, and goes.
 *
 * Nothing before 2026-10-10 has one; `Rooms.forChannel` derives them for the
 * rooms that came before.
 */
export class Segments {
  constructor(private db: Db) {}

  /** Follows one committed transition of a channel. */
  follow(before: ChannelState, after: ChannelState, now: number): void {
    const was = kept(before);
    const is = kept(after);
    if (was.run === is.run && was.text === is.text) return;
    // The reducer's own instant where a run began or ended, so that a
    // segment and its recording agree to the millisecond.
    const at =
      is.run !== null && is.run !== was.run
        ? (after.recording.startedAt ?? now)
        : was.run !== null && after.lastRecording?.runId === was.run
          ? after.lastRecording.endedAt
          : now;
    this.close(after.id, at);
    if (is.run === null && !is.text) return;
    this.db
      .prepare(
        `INSERT INTO segments (id, channel_id, started_at, recording_id, text)
         VALUES (?, ?, ?, ?, ?)`
      )
      .run(newId('seg'), after.id, at, is.run, is.text ? 1 : 0);
  }

  /**
   * Closes whatever the previous process left open, at the boot — which
   * ended every run and every room, and so everything they kept.
   */
  restore(now: number): void {
    this.db.prepare('UPDATE segments SET ended_at = ? WHERE ended_at IS NULL').run(now);
  }

  /** A channel's segments that began inside a span, oldest first. */
  within(channelId: string, from: number, until: number): SegmentRow[] {
    return this.db
      .prepare(
        `SELECT * FROM segments
         WHERE channel_id = ? AND started_at >= ? AND started_at <= ?
         ORDER BY started_at`
      )
      .all(channelId, from, until) as unknown as SegmentRow[];
  }

  /** The segment a recording's audio is, if it was made since segments were. */
  ofRecording(recordingId: string): SegmentRow | undefined {
    return this.db
      .prepare('SELECT * FROM segments WHERE recording_id = ?')
      .get(recordingId) as SegmentRow | undefined;
  }

  private close(channelId: string, now: number): void {
    // Nothing kept for no time at all: two changes in one instant.
    this.db
      .prepare('DELETE FROM segments WHERE channel_id = ? AND ended_at IS NULL AND started_at >= ?')
      .run(channelId, now);
    this.db
      .prepare('UPDATE segments SET ended_at = ? WHERE channel_id = ? AND ended_at IS NULL')
      .run(now, channelId);
  }
}

/** What a channel is keeping: the running run, and whether the text is. */
function kept(state: ChannelState): { run: string | null; text: boolean } {
  return {
    run: state.recording.status === 'recording' ? state.recording.runId : null,
    text: isTranscribingLive(state),
  };
}
