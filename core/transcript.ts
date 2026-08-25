/**
 * Reading a transcript, as opposed to producing one.
 *
 * The server stores what the provider returned: one row per utterance, each
 * tagged with the stem it came from and — since 2026-08-24 — with which voice
 * inside that stem said it. Neither of those is what a person wants on a
 * screen, and the two ends had better agree about the difference, which is why
 * this is here rather than in either of them.
 *
 * Two jobs, and they are separate on purpose:
 *
 *   - `multiVoiceStems` and `voiceName` decide **what to call a line**, which
 *     turns on a fact about the whole transcript rather than the line.
 *   - `intoBlocks` decides **where one entry ends**, which turns on the line
 *     before it.
 */

/** One utterance, as it is stored and as it travels. */
export interface TranscriptLine {
  identity: string;
  /** Which voice within that stem, when the provider labelled one. */
  speaker: string | null;
  startMs: number;
  endMs: number;
  text: string;
  confidence: number | null;
}

/** The least a line has to carry to be named and grouped. */
type Voiced = Pick<TranscriptLine, 'identity' | 'speaker'>;

/**
 * Which stems came back carrying more than one voice.
 *
 * `speaker_labels` is asked of every stem, so nearly all of them answer with a
 * single label that merely confirms what the identity already said. Those are
 * the ones that must **not** be labelled on screen: a "(A)" beside a named
 * participant who was the only person on their microphone is noise, and worse,
 * it reads as an answer to a question nobody asked.
 *
 * A stem with two labels is a different thing entirely. It is the provider
 * reporting that it heard two voices in audio this system had assumed was one
 * — which for the played-media stem is the ordinary case, since what somebody
 * plays into a room may be an interview, and for a member's stem is evidence
 * of bleed. Both are worth showing, and both need the letter to show it with.
 *
 * Computed over the whole transcript rather than per block, so a voice that
 * speaks once keeps the stem labelled throughout. A name that appeared and
 * disappeared down the page would read as two different people.
 */
export function multiVoiceStems(lines: readonly Voiced[]): Set<string> {
  const seen = new Map<string, Set<string>>();
  for (const line of lines) {
    if (line.speaker === null) continue;
    let voices = seen.get(line.identity);
    if (!voices) seen.set(line.identity, (voices = new Set()));
    voices.add(line.speaker);
  }
  const many = new Set<string>();
  for (const [identity, voices] of seen) {
    if (voices.size > 1) many.add(identity);
  }
  return many;
}

/**
 * What to put above a line, given the stem's name and whether that stem turned
 * out to hold more than one voice.
 *
 * The letter is the provider's own label, passed through rather than
 * translated into a name. Naming it would be a guess — the system knows there
 * were two voices and knows nothing whatsoever about who the second one was.
 */
export function voiceName(
  name: string,
  speaker: string | null,
  multiVoice: boolean
): string {
  return multiVoice && speaker ? `${name} (${speaker})` : name;
}

/** Consecutive lines from one voice, which is one entry on screen. */
export interface TranscriptBlock<L extends Voiced> {
  identity: string;
  speaker: string | null;
  startMs: number;
  endMs: number;
  /** In order. Each keeps its own time, so a jump lands on the paragraph. */
  lines: L[];
}

/**
 * Runs of the same voice into single entries.
 *
 * A speaker label per utterance is what the provider deals in, and a screen
 * that repeats it is a screen where one person saying four sentences looks
 * like four people. Consecutive lines from the same voice become one entry
 * with the sentences as paragraphs, which means **adjacent entries always name
 * different voices** — the label alternates, and carries information every
 * time it appears.
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
export function intoBlocks<L extends Voiced & { startMs: number; endMs: number }>(
  lines: readonly L[]
): Array<TranscriptBlock<L>> {
  const blocks: Array<TranscriptBlock<L>> = [];
  for (const line of lines) {
    const last = blocks[blocks.length - 1];
    if (last && last.identity === line.identity && last.speaker === line.speaker) {
      last.lines.push(line);
      // Not necessarily the last line's end: two utterances from one voice can
      // overlap, and an entry that ended before its own text did would put a
      // subtitle out before the words were finished.
      last.endMs = Math.max(last.endMs, line.endMs);
      continue;
    }
    blocks.push({
      identity: line.identity,
      speaker: line.speaker,
      startMs: line.startMs,
      endMs: line.endMs,
      lines: [line],
    });
  }
  return blocks;
}
