import type { ChannelState, Clip } from '../../core/types';
import type { PasteView } from '../../core/protocol';
import type { Db } from './db';

export interface PasteRow {
  id: string;
  channel_id: string;
  author_id: string;
  display_name: string;
  pasted_at: number;
  text: string;
}

/**
 * **What has been pasted into a channel, kept in its *Record*** — since
 * 2026-10-15, when the *Clipboard* tab went. Each paste stands in the log as a
 * segment of its own at the instant it was made, and is never deleted.
 *
 * **It breaks nothing.** A segment is a stretch kept one way throughout, and
 * every change of *what is kept* ends one; a paste is not such a change. One
 * made while audio or text is being kept falls inside that segment, which
 * carries on, so a recording is still exactly one segment's audio. Rodrigo's
 * choice over the clean break, which would have cut a recording in two at
 * every paste.
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

  private write(channelId: string, clip: Clip): void {
    this.db
      .prepare(
        `INSERT OR IGNORE INTO pastes
           (id, channel_id, author_id, display_name, pasted_at, text)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(clip.id, channelId, clip.authorId, this.nameOf(clip.authorId), clip.pastedAt, clip.text);
  }
}

/** A paste as the wire carries it inside its segment. */
export function pasteView(row: PasteRow): PasteView {
  return { authorId: row.author_id, displayName: row.display_name, text: row.text };
}
