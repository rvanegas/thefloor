import type { ChannelState, Clip } from '../../core/types';
import type { PasteView } from '../../core/protocol';
import { pasteHomeSql, type Db } from './db';

export interface PasteRow {
  id: string;
  channel_id: string;
  author_id: string;
  display_name: string;
  pasted_at: number;
  text: string;
  working?: string | null;
  /** The segment it is part of, or null where it is one of its own. */
  segment_id?: string | null;
}

/**
 * **What has been pasted into a channel, kept in its *Record*** — since
 * 2026-10-15, when the *Clipboard* tab went — and never deleted.
 *
 * **It breaks nothing.** A segment is a stretch kept one way throughout, and
 * every change of *what is kept* ends one; a paste is not such a change. One
 * made while audio or text is being kept falls inside that segment, which
 * carries on, so a recording is still exactly one segment's audio. Rodrigo's
 * choice over the clean break, which would have cut a recording in two at
 * every paste.
 *
 * **It is part of the segment being transcribed when it is made**, since
 * 2026-11-18, and kept with that segment's id (`pasteHomeSql`): it is filed
 * with it, and read by Claude inside it at its moment. Made while nothing is
 * transcribed — nothing kept, or audio alone — it is a segment of its own, the
 * instant it was made. Rodrigo's, so that choosing what of the *Record* Claude
 * reads by segment takes what was pasted into one with it.
 *
 * Written on the transition, by the channel registry, as rooms and segments
 * are: the reducer's `clip` changing to a new one is a paste, whatever route
 * it came by — the app, a guest's page, an old build's *Clipboard* tab, which
 * all go on filling that slot. A clear empties the slot and writes nothing.
 * The id is the clip's, minted by the server before the reducer saw it.
 */
export class Pastes {
  constructor(
    private db: Db,
    /** Who somebody is called now, member or guest. */
    private nameOf: (id: string) => string
  ) {}

  /** Follows one committed transition of a channel. */
  follow(before: ChannelState, after: ChannelState): void {
    const clip = after.clip;
    if (!clip || clip.id === before.clip?.id) return;
    this.write(after.id, clip);
  }

  /** A channel's pastes made inside a span, oldest first, as segments are. */
  within(channelId: string, from: number, until: number): PasteRow[] {
    return this.db
      .prepare(
        `SELECT * FROM pastes
         WHERE channel_id = ? AND pasted_at >= ? AND pasted_at <= ?
         ORDER BY pasted_at, id`
      )
      .all(channelId, from, until) as unknown as PasteRow[];
  }

  /**
   * Writes one paste to the log directly. `follow` is the ordinary way in;
   * this is also called for a reply from Claude that arrives after everybody
   * has left, when there is no transition for `follow` to see.
   */
  write(channelId: string, clip: Clip): void {
    this.db
      .prepare(
        `INSERT OR IGNORE INTO pastes
           (id, channel_id, author_id, display_name, pasted_at, text, segment_id)
         VALUES (?, ?, ?, ?, ?, ?, (${pasteHomeSql('?', '?')}))`
      )
      .run(
        clip.id,
        channelId,
        clip.authorId,
        this.nameOf(clip.authorId),
        clip.pastedAt,
        clip.text,
        channelId,
        clip.pastedAt,
        clip.pastedAt
      );
  }

  /**
   * Keeps beside a reply of Claude's the library calls it made before it, as
   * JSON — server-side only: the *Record* reads it for the next press, and
   * nothing carries it on the wire yet.
   */
  keepWorking(id: string, working: unknown): void {
    this.db.prepare('UPDATE pastes SET working = ? WHERE id = ?').run(JSON.stringify(working), id);
  }

  /** What `keepWorking` kept for a paste, or null. */
  working(id: string): unknown {
    const row = this.db.prepare('SELECT working FROM pastes WHERE id = ?').get(id) as
      | { working: string | null }
      | undefined;
    return row?.working ? JSON.parse(row.working) : null;
  }
}

/**
 * A paste as the wire carries it, and the segment it is part of when that
 * segment began at `startedAt` — the caller's, since only a segment it lists
 * is one the paste may name.
 */
export function pasteView(row: PasteRow, home?: { id: string; startedAt: number }): PasteView {
  return {
    authorId: row.author_id,
    displayName: row.display_name,
    text: row.text,
    ...(home ? { segmentId: home.id, offsetMs: row.pasted_at - home.startedAt } : {}),
  };
}
