/**
 * Reading a transcript, as opposed to producing one.
 *
 * The server stores what the provider returned: one row per utterance, each
 * tagged with the stem it came from and with which voice inside that stem said
 * it. Neither of those is what a person wants on a screen, and the two ends had
 * better agree about the difference, which is why this is here rather than in
 * either of them.
 *
 * Three jobs, in the order they run:
 *
 *   - **What is here at all.** A voice can be declared gone — the provider
 *     heard a second speaker where there was one person, and somebody said so.
 *   - **What to call it.** A letter, a declared name, or the stem's own name,
 *     and which of those depends on facts about the whole transcript.
 *   - **Where one entry ends**, which depends on the line before it.
 *
 * The order is not arrangeable. Removing a voice can leave a stem holding one,
 * which un-letters it; renaming two voices to one name is what lets their runs
 * merge. Each step's input is the last step's output.
 *
 * **All of it is a view.** Nothing here edits a line, and no declaration is
 * ever folded into the stored text — which is what makes every one of them
 * clearable, re-settable, and free. Getting the voices wrong costs a tap to
 * put right, never a second run of a paid transcription.
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

/** The least a line has to carry to be named. */
type Voiced = Pick<TranscriptLine, 'identity' | 'speaker'>;

/** A line once it has been through `readable`, which is how it travels. */
export type NamedLine<L> = L & { displayName: string | null };

/**
 * What somebody said about one voice in one transcript.
 *
 * Both fields are declarations rather than edits: the lines are untouched and
 * the text is never rewritten, so any of this can be said differently later.
 * Removing is the sharpest case — it is what somebody reaches for when the
 * provider invented a speaker, and it would be a poor trade to answer a
 * probably-wrong label by destroying text that was paid for.
 *
 * An **absent** declaration is the default naming, which is why clearing one
 * is a delete rather than a value. There is no third state to represent and
 * nothing to reset to.
 */
export interface VoiceDeclaration {
  /** What to call it instead. Absent leaves the default naming alone. */
  name?: string;
  /** Whether to drop it from the transcript entirely. */
  removed?: boolean;
}

/** Declarations for one transcript, by `voiceKey`. */
export type VoiceDeclarations = Record<string, VoiceDeclaration>;

/**
 * The character that joins the two halves of a voice's key.
 *
 * A NUL, because it is the one thing a display name, an account id and a
 * provider's speaker label all cannot contain — so no identity can spell
 * another one's key.
 */
export const VOICE_SEPARATOR = '\u0000';

/**
 * How one voice is addressed, everywhere it has to be a single string — a map
 * key, a wire field, a row's identity.
 *
 * An unlabelled stem gets the empty string rather than a missing half, so the
 * key of a voice is the same whether it came from a row where `speaker` is
 * NULL or from a line where it is `null`.
 */
export function voiceKey(identity: string, speaker: string | null): string {
  return `${identity}${VOICE_SEPARATOR}${speaker ?? ''}`;
}

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
 * plays into a room may be an interview, and for a member's stem is usually
 * the provider failing to attribute a "Yeah." rather than a second person.
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
 * Which is exactly what a declaration answers, and why one wins over this.
 */
export function voiceName(
  name: string,
  speaker: string | null,
  multiVoice: boolean
): string {
  return multiVoice && speaker ? `${name} (${speaker})` : name;
}

/**
 * A transcript as it is meant to be read: the removed voices gone, every line
 * named.
 *
 * `nameOf` is how the caller turns a stem into a name, which is not the same
 * question on both sides of the wire — the server has frozen participant names
 * and a live account table behind it, and can answer for an identity nobody
 * declared anything about. Null from it means the stem could not be named at
 * all, which stays null: a made-up name is worse than none.
 *
 * The letters are worked out **after** the removals, so a stem left holding one
 * voice loses its letter. That is the point of removing a spurious one: the
 * evidence that made the label worth showing is what was just taken away.
 */
export function readable<L extends TranscriptLine>(
  lines: readonly L[],
  nameOf: (identity: string) => string | null,
  voices: VoiceDeclarations = {}
): Array<NamedLine<L>> {
  const kept = lines.filter(
    (line) => !voices[voiceKey(line.identity, line.speaker)]?.removed
  );
  const many = multiVoiceStems(kept);
  return kept.map((line) => {
    const declared = voices[voiceKey(line.identity, line.speaker)]?.name;
    const base = nameOf(line.identity);
    return {
      ...line,
      displayName: declared
        ? declared
        : base === null
          ? null
          : voiceName(base, line.speaker, many.has(line.identity)),
    };
  });
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
 * Runs of the same voice into single entries.
 *
 * A speaker label per utterance is what the provider deals in, and a screen
 * that repeats it is a screen where one person saying four sentences looks
 * like four people. Consecutive lines from the same voice become one entry
 * with the sentences as paragraphs, which means **adjacent entries always name
 * different voices** — the label alternates, and carries information every
 * time it appears.
 *
 * **Grouped by the name, not by the label**, which is what makes collapsing
 * work: declare `Rodrigo (A)` and `Rodrigo (B)` both to be Rodrigo and the run
 * the spurious label split is whole again, with no separate merging step. The
 * identity is in the key as well, so two people who happen to share a display
 * name are still two people — a coincidence of names is not a declaration.
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

/** One voice in one transcript, as the screen that names them lists it. */
export interface VoiceEntry {
  identity: string;
  speaker: string | null;
  /** The key to declare against, so the caller never builds one by hand. */
  key: string;
  /** What it is called now, declaration and all. */
  displayName: string | null;
  /** What it would be called with nothing declared, so a screen can offer it. */
  defaultName: string | null;
  /** How many lines it holds — the difference between a speaker and a hiccup. */
  lines: number;
  /** The first thing it said, so somebody can tell which voice this is. */
  sample: string;
  declaration: VoiceDeclaration;
}

/**
 * Every voice in a transcript, for the screen that names them.
 *
 * Built from the **unfiltered** lines, deliberately: a removed voice has to
 * stay on that screen or removing one would be a decision nobody could take
 * back. Its `lines` and `sample` are what it holds, not what is showing.
 */
export function voiceRoster<L extends TranscriptLine>(
  lines: readonly L[],
  nameOf: (identity: string) => string | null,
  voices: VoiceDeclarations = {}
): VoiceEntry[] {
  // Twice, because the screen shows both answers: what this voice is called
  // now, and what it would go back to being. Neither run removes anything —
  // a roster that hid the removed voices could not offer to restore them.
  const named = readable(lines, nameOf, namesOnly(voices));
  const plain = readable(lines, nameOf, {});
  const roster = new Map<string, VoiceEntry>();

  for (const [n, line] of named.entries()) {
    const key = voiceKey(line.identity, line.speaker);
    const seen = roster.get(key);
    if (seen) {
      seen.lines++;
      continue;
    }
    roster.set(key, {
      identity: line.identity,
      speaker: line.speaker,
      key,
      displayName: line.displayName,
      defaultName: plain[n].displayName,
      lines: 1,
      sample: line.text,
      declaration: voices[key] ?? {},
    });
  }
  return [...roster.values()];
}

/** The declarations with the removals taken out, names left alone. */
function namesOnly(voices: VoiceDeclarations): VoiceDeclarations {
  const out: VoiceDeclarations = {};
  for (const [key, voice] of Object.entries(voices)) {
    if (voice.name) out[key] = { name: voice.name };
  }
  return out;
}
