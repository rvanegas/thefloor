import type { ChannelState, Clip } from '../../core/types';
import type { PasteView } from '../../core/protocol';
import { shownSteps, type KeptStep, type KeptTitle } from '../../core/working';
import { pasteHomeSql, type Db } from './db';

export interface PasteRow {
  id: string;
  channel_id: string;
  author_id: string;
  display_name: string;
  pasted_at: number;
  text: string;
  working?: string | null;
  /** The documents the room let a reply of Claude's read, as JSON, their text included. */
  documents?: string | null;
  /** The segment it is part of, or null where it is one of its own. */
  segment_id?: string | null;
}

/**
 * **What has been pasted into a channel, kept in its *Record*** — since
 * 2026-10-15, when the *Clipboard* tab went. **Deleted since 2026-11-18**:
 * with the text of the segment it is part of, or on its own where it is a
 * segment of its own (`deleteSegment`, `deletePaste`).
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

  /** A channel's pastes made inside a span, oldest first, as segments are; not the deleted. */
  within(channelId: string, from: number, until: number): PasteRow[] {
    return this.db
      .prepare(
        `SELECT * FROM pastes
         WHERE channel_id = ? AND pasted_at >= ? AND pasted_at <= ? AND deleted_at IS NULL
         ORDER BY pasted_at, id`
      )
      .all(channelId, from, until) as unknown as PasteRow[];
  }

  /** How many pastes are part of a segment, the deleted left out. */
  countInSegment(segmentId: string): number {
    const row = this.db
      .prepare('SELECT COUNT(*) AS n FROM pastes WHERE segment_id = ? AND deleted_at IS NULL')
      .get(segmentId) as { n: number };
    return row.n;
  }

  /** Marks deleted every paste that is part of a segment. */
  markInSegment(segmentId: string, now: number): void {
    this.db
      .prepare('UPDATE pastes SET deleted_at = ? WHERE segment_id = ? AND deleted_at IS NULL')
      .run(now, segmentId);
  }

  /** Marks one paste deleted; whether there was one to mark. */
  markOne(channelId: string, id: string, now: number): boolean {
    return (
      Number(
        this.db
          .prepare('UPDATE pastes SET deleted_at = ? WHERE id = ? AND channel_id = ? AND deleted_at IS NULL')
          .run(now, id, channelId).changes ?? 0
      ) > 0
    );
  }

  /** Removes what was marked deleted on or before `cutoff`. */
  sweep(cutoff: number): void {
    this.db.prepare('DELETE FROM pastes WHERE deleted_at IS NOT NULL AND deleted_at <= ?').run(cutoff);
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
   * JSON: the *Record* reads it for the next press, and since 2026-11-20 the
   * wire carries what the room is shown of it (`pasteView`).
   */
  keepWorking(id: string, working: unknown): void {
    this.db.prepare('UPDATE pastes SET working = ? WHERE id = ?').run(JSON.stringify(working), id);
  }

  /**
   * Keeps beside a reply of Claude's the documents the room let it read
   * before it, with their text, as JSON — server-side only, since
   * 2026-11-20: every later press that reads the reply reads them with it.
   */
  keepDocuments(id: string, documents: unknown): void {
    this.db.prepare('UPDATE pastes SET documents = ? WHERE id = ?').run(JSON.stringify(documents), id);
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
  const working = row.working ? shownWorking(row.working, row.documents ?? null) : [];
  return {
    authorId: row.author_id,
    displayName: row.display_name,
    text: row.text,
    ...(home ? { segmentId: home.id, offsetMs: row.pasted_at - home.startedAt } : {}),
    ...(working.length ? { working } : {}),
  };
}

/**
 * What the room is shown of a reply's kept working (`shownSteps`), the
 * titles of the documents it read taken from what the room let it read.
 * Never a document's text: only each one's name and title leave here.
 */
export function shownWorking(working: string, documents: string | null): ReturnType<typeof shownSteps> {
  const steps = JSON.parse(working) as KeptStep[];
  const read = documents
    ? (JSON.parse(documents) as KeptTitle[]).map(({ name, title }) => ({ name, title }))
    : [];
  return shownSteps(steps, read);
}
