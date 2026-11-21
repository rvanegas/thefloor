/**
 * A *reading*: a library document spoken aloud into *Listen*, and the map
 * from a moment of its audio back to the sentence being said, since
 * 2026-11-20. See
 * planning/decision/2026-11-20-a-library-document-is-read-aloud-in-listen.md.
 *
 * **Here rather than on the server** because both ends use the map. The
 * server writes each sentence as a *Played audio* line once playback has
 * passed it, and tells Claude where the room has got to. The app draws the
 * sentence now playing under the progress bar. Two lookups would be two
 * answers.
 *
 * **Words map onto the text one to one.** AssemblyAI's `WordBoundaries`
 * gives each whitespace-separated token of the request's text as it was
 * sent, markup included (`##`, `*friend*.`), checked against the API on
 * 2026-11-20. So the times are matched to the text's own tokens in order.
 * A word that does not match is looked for a few places ahead, and a token
 * left without one borrows its neighbour's time rather than throwing the
 * sentence away.
 */

/** One sentence of a reading, at its place in the audio. */
export interface ReadingSentence {
  startMs: number;
  endMs: number;
  /** As it is drawn and written into the *Record*: the markup taken out. */
  text: string;
}

/** One spoken word, as the provider timed it, in milliseconds into the audio. */
export interface TimedWord {
  word: string;
  startMs: number;
  endMs: number;
}

/**
 * A document's markdown made ready to speak: frontmatter, comments, code
 * blocks and images left out, and each link reduced to its words. Headings,
 * emphasis and list marks are kept, since the provider says nothing for
 * them, and they are what tells a heading from the paragraph after it.
 */
export function speakableText(markdown: string): string {
  return markdown
    .replace(/^﻿/, '')
    .replace(/^---\n[\s\S]*?\n---\n/, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/^(```|~~~)[^\n]*\n[\s\S]*?^\1[^\n]*$/gm, '')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/<\/?[a-zA-Z][^>]*>/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** A token's words alone, as a line shows them: emphasis, heading and quote marks dropped. */
export function plainWord(token: string): string {
  return token
    .replace(/^[#>*+\-]+$/, '')
    .replace(/^\d+\.$/, '')
    .replace(/[*_`]+/g, '')
    .replace(/^#+/, '');
}

/** Abbreviations that end in a full stop without ending a sentence. */
const ABBREVIATIONS = /^(e\.g|i\.e|etc|vs|cf|mr|mrs|ms|dr|st|no|p|pp)\.$/i;

/** Whether a token ends a sentence by its own punctuation. */
function endsSentence(token: string): boolean {
  const bare = token.replace(/["'”’)\]*_`]+$/, '');
  return /[.!?…]$/.test(bare) && !ABBREVIATIONS.test(plainWord(bare));
}

/** A line that begins a block of its own: a heading, a list item, a quote. */
const BLOCK_START = /^\s*(#{1,6}\s|[-*+]\s|>|\d+[.)]\s)/;

interface Token {
  text: string;
  /** Whether the line it ends finishes a block, so a sentence too. */
  blockEnd: boolean;
}

function tokensOf(text: string): Token[] {
  const lines = text.split('\n');
  const tokens: Token[] = [];
  lines.forEach((line, index) => {
    const words = line.split(/\s+/).filter(Boolean);
    if (words.length === 0) return;
    const next = lines[index + 1];
    const blockEnd =
      next === undefined || next.trim() === '' || BLOCK_START.test(next) || /^\s*#/.test(line);
    words.forEach((word, at) => tokens.push({ text: word, blockEnd: blockEnd && at === words.length - 1 }));
  });
  return tokens;
}

/** How far ahead an unmatched word is looked for before the token borrows a time. */
const LOOKAHEAD = 6;

/**
 * Each token's time: the word the provider gave for it, matched in order.
 * Unmatched tokens take the end of the one before.
 */
function timed(tokens: Token[], words: readonly TimedWord[]): Array<{ startMs: number; endMs: number } | null> {
  const times: Array<{ startMs: number; endMs: number } | null> = [];
  let next = 0;
  for (const token of tokens) {
    let found = -1;
    for (let at = next; at < Math.min(words.length, next + LOOKAHEAD); at += 1) {
      if (words[at].word === token.text) {
        found = at;
        break;
      }
    }
    if (found === -1 && next < words.length && tokens.length === words.length) found = next;
    if (found === -1) {
      times.push(null);
      continue;
    }
    times.push({ startMs: words[found].startMs, endMs: words[found].endMs });
    next = found + 1;
  }
  // A token left without a time sits where the one before it ended.
  let last = { startMs: 0, endMs: 0 };
  return times.map((time) => {
    if (time) {
      last = time;
      return time;
    }
    return { startMs: last.endMs, endMs: last.endMs };
  });
}

/**
 * One request's text and its words, at its offset in the whole audio, as
 * sentences. A request's end is always a sentence's end, since the text is
 * cut between sentences where it can be (`speechPieces` on the server).
 */
export function sentencesOf(
  text: string,
  words: readonly TimedWord[],
  offsetMs = 0
): ReadingSentence[] {
  const tokens = tokensOf(text);
  const times = timed(tokens, words);
  const sentences: ReadingSentence[] = [];
  let open: { startMs: number; endMs: number; words: string[] } | null = null;
  tokens.forEach((token, index) => {
    const time = times[index]!;
    const word = plainWord(token.text);
    if (word) {
      open ??= { startMs: time.startMs, endMs: time.endMs, words: [] };
      open.words.push(word);
      open.endMs = Math.max(open.endMs, time.endMs);
    }
    const last = index === tokens.length - 1;
    if (open && (token.blockEnd || endsSentence(token.text) || last)) {
      sentences.push({
        startMs: open.startMs + offsetMs,
        endMs: open.endMs + offsetMs,
        text: open.words.join(' '),
      });
      open = null;
    }
  });
  return sentences;
}

/**
 * The sentence being said at `ms`: the last that has begun, or -1 before the
 * first. Between two sentences it is the one just finished, which is what a
 * paused screen should go on showing.
 */
export function sentenceAt(sentences: readonly ReadingSentence[], ms: number): number {
  let low = 0;
  let high = sentences.length - 1;
  let found = -1;
  while (low <= high) {
    const middle = (low + high) >> 1;
    if (sentences[middle].startMs <= ms) {
      found = middle;
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }
  return found;
}

/**
 * Where in its document a reading is at `ms`, in the share of its sentences
 * already begun: the figure Claude is told, rounded to a whole percent.
 */
export function readingProgress(sentences: readonly ReadingSentence[], ms: number): number {
  if (sentences.length === 0) return 0;
  return Math.round(((sentenceAt(sentences, ms) + 1) / sentences.length) * 100);
}
