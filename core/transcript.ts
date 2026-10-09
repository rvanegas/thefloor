/**
 * Reading a transcript, as opposed to producing one.
 *
 * The server stores what the provider returned: one row per line, each tagged
 * with the stem it came from. A stem is one microphone and is taken to hold
 * exactly one voice, so the stem is the speaker and its name is the speaker's
 * name — the participant's display name as frozen with the run, or the played
 * audio's label. Nothing about who said what is asked of the provider, and
 * nothing about it is editable. See
 * planning/decision/2026-10-09-a-stem-is-one-voice.md.
 *
 * Two jobs, and the two ends had better agree about both, which is why this is
 * here rather than in either of them: what to call each line, and where one
 * entry ends.
 */

/** One utterance, as it is stored and as it travels. */
export interface TranscriptLine {
  identity: string;
  startMs: number;
  endMs: number;
  text: string;
  confidence: number | null;
}

/** A line once it has been through `readable`, which is how it travels. */
export type NamedLine<L> = L & { displayName: string | null };

/**
 * A transcript as it is meant to be read: every line named after its stem.
 *
 * `nameOf` is how the caller turns a stem into a name, which is not the same
 * question on both sides of the wire — the server has frozen participant names
 * and a live account table behind it. Null from it means the stem could not be
 * named at all, which stays null: a made-up name is worse than none.
 */
export function readable<L extends TranscriptLine>(
  lines: readonly L[],
  nameOf: (identity: string) => string | null
): Array<NamedLine<L>> {
  return lines.map((line) => ({ ...line, displayName: nameOf(line.identity) }));
}

/** Consecutive lines under one name, which is one entry on screen. */
export interface TranscriptBlock<L> {
  identity: string;
  displayName: string | null;
  startMs: number;
  endMs: number;
  /** In order. Each keeps its own time, so a jump lands on the paragraph. */
  lines: L[];
}

/**
 * Runs of the same speaker into single entries.
 *
 * A name per line is what is stored, and a screen that repeats it is a screen
 * where one person saying four sentences looks like four people. Consecutive
 * lines from the same stem become one entry
 * with the sentences as paragraphs, which means **adjacent entries always name
 * different speakers** — the label alternates, and carries information every
 * time it appears.
 *
 * **Grouped by the stem, not by the name**, so two people who happen to share
 * a display name are still two people.
 *
 * The lines are kept rather than joined here. Each one has its own start, and
 * a transcript is something people jump around inside; collapsing four
 * paragraphs to one timestamp would cost precision that the grouping was never
 * meant to spend. Whoever renders decides whether to spend it.
 *
 * Expects the input in the order it was said, which is what `linesFor`
 * returns. Given anything else it still groups correctly and the entries come
 * out in whatever order they arrived.
 */
export function intoBlocks<
  L extends {
    identity: string;
    displayName: string | null;
    startMs: number;
    endMs: number;
  },
>(lines: readonly L[]): Array<TranscriptBlock<L>> {
  const blocks: Array<TranscriptBlock<L>> = [];
  for (const line of lines) {
    const last = blocks[blocks.length - 1];
    if (
      last &&
      last.identity === line.identity &&
      last.displayName === line.displayName
    ) {
      last.lines.push(line);
      // Not necessarily the last line's end: two utterances from one voice can
      // overlap, and an entry that ended before its own text did would put a
      // subtitle out before the words were finished.
      last.endMs = Math.max(last.endMs, line.endMs);
      continue;
    }
    blocks.push({
      identity: line.identity,
      displayName: line.displayName,
      startMs: line.startMs,
      endMs: line.endMs,
      lines: [line],
    });
  }
  return blocks;
}
