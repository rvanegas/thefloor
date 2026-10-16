/**
 * Reading a transcript, as opposed to producing one.
 *
 * The server stores what the provider returned: one row per line, each tagged
 * with the stem it came from. A stem is one microphone, so the stem is the
 * speaker and its name is the speaker's name — the participant's display name
 * as frozen with the run, or the played audio's label. See
 * planning/decision/2026-10-09-a-stem-is-one-voice.md.
 *
 * **Except where somebody asked for voices to be told apart**, since
 * 2026-10-16: the shared track always, and a member's own microphone when
 * they switched *Several voices* on for the room. Those lines carry the
 * provider's letter, and a stem that came back with more than one is named
 * `Name (A)`, `Name (B)`. Bare letters, never renamed. See
 * planning/decision/2026-10-16-separating-voices-is-a-choice-per-room.md.
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
  /**
   * The provider's letter for a voice within this one stem, or null where
   * voices were not asked for. Absent from a server that predates it.
   */
  speaker?: string | null;
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
 *
 * **A letter goes on the name only where the stem holds more than one** among
 * the lines given. A separated stem that came back with one voice is that
 * voice, and `Rodrigo (A)` alone on a page says less than `Rodrigo`.
 */
export function readable<L extends TranscriptLine>(
  lines: readonly L[],
  nameOf: (identity: string) => string | null
): Array<NamedLine<L>> {
  return lettered(
    lines.map((line) => ({ ...line, displayName: nameOf(line.identity) }))
  );
}

/**
 * Lines already named, with each voice's letter put on the name where its
 * stem holds more than one among them — `readable`'s rule, for the live
 * transcript too, whose names are frozen on the server with the line and
 * whose letters are therefore applied wherever the lines are gathered.
 */
export function lettered<
  L extends { identity: string; displayName: string | null; speaker?: string | null },
>(lines: readonly L[]): L[] {
  const letters = new Map<string, Set<string>>();
  for (const line of lines) {
    if (!line.speaker) continue;
    const seen = letters.get(line.identity) ?? new Set<string>();
    seen.add(line.speaker);
    letters.set(line.identity, seen);
  }
  if (letters.size === 0) return [...lines];
  return lines.map((line) => {
    const several = (letters.get(line.identity)?.size ?? 0) > 1;
    return several
      ? { ...line, displayName: voiceName(line.displayName, line.speaker) }
      : line;
  });
}

/**
 * A stem's name with one of its voices' letters: `Rodrigo (B)`. The name
 * alone where there is no letter; null where there is no name, as `readable`
 * explains, since a letter is no name either.
 */
export function voiceName(
  name: string | null,
  speaker: string | null | undefined
): string | null {
  if (name === null) return null;
  return speaker ? `${name} (${speaker})` : name;
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
