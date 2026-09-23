/**
 * What to call a channel that nobody has named.
 *
 * The answer is a **description, not a name**, and the difference is the whole
 * point. A name is one string every member reads; this is written from one
 * viewer's side and says who else is in there, so you and the person you are
 * talking to see different words for the same channel.
 *
 * **The screens draw it as a name anyway, and deliberately, since
 * 2026-09-13.** The muted italic that used to mark it is gone; where the
 * difference matters it is stated rather than styled, the settings field
 * carrying this string as its placeholder. See `name` in core/types.ts.
 *
 * Shared by both screens and by the push title so that a channel does not
 * answer to one thing on the lock screen and another once you have tapped it.
 * That was already the stated intent in the server's copy of this logic; it
 * was not true, because there were three copies and they had drifted.
 *
 * **The words are an argument and the shape is not**, since the app learned a
 * second language. What is decided here is structural — two names then a
 * count, where the cap falls, that the count is of people and not of names —
 * and that must not be decided twice. What is *said* is three short phrases,
 * and Spanish builds two of them differently. So the phrases come in and core
 * imports nothing, which is what `__tests__/purity.test.ts` requires of it.
 */

/**
 * The three phrases `describeChannel` assembles, supplied by the caller.
 *
 * `andOthers` takes the count rather than a finished string because a
 * language may inflect on it, and `pair` takes both names because a language
 * may not join them with a word at all.
 */
export interface NamingWords {
  justYou: () => string;
  pair: (first: string, second: string) => string;
  andOthers: (shown: string, rest: number) => string;
}

/**
 * The English phrases, and the default.
 *
 * A default rather than a required argument so that the server — which has no
 * viewer to have a language, and composes for a lock screen it cannot read —
 * keeps working unchanged, and so that `nameRecording` cannot accidentally
 * become translatable. Localising what the server sends is the push
 * notification problem, which is not this.
 */
export const ENGLISH_NAMING: NamingWords = {
  justYou: () => 'Just you',
  pair: (first, second) => `${first} and ${second}`,
  andOthers: (shown, rest) => `${shown} and ${rest} other${rest === 1 ? '' : 's'}`,
};

/** Beyond this many names the list stops and counts the rest. */
const NAMES_SHOWN = 2;

/**
 * `others` is everyone but the viewer, already resolved to display names and
 * in roster order. Empty is a real state, not an error: everyone else can
 * leave a channel and it stays yours, with your description and your
 * recordings still hanging off it.
 */
export function describeChannel(
  others: string[],
  words: NamingWords = ENGLISH_NAMING
): string {
  if (others.length === 0) return words.justYou();
  if (others.length === 1) return others[0];
  if (others.length === 2) return words.pair(others[0], others[1]);

  // Two names and a count rather than the whole roster, because this renders
  // on one line in a list row and the cap is six.
  const rest = others.length - NAMES_SHOWN;
  return words.andOthers(others.slice(0, NAMES_SHOWN).join(', '), rest);
}

/**
 * What a recording is called, from the names of everyone who took part.
 *
 * Everyone, including whoever is reading — which is the difference from
 * `describeChannel` and the whole point. A channel is labelled from the
 * viewer's side because it is a place you are in; a recording is an artefact,
 * one thing that exists once, and two people discussing it have to be
 * discussing the same thing by the same name.
 *
 * Decided when the run stops and stored, never recomputed. See
 * planning/decisions/DECISIONS*.md.
 *
 * **Which is also why it is not translated, and takes no `NamingWords`.** It
 * is written into the row once, in whatever language the machine that stopped
 * the recording happened to be speaking, and read back by everybody who was
 * there. A stored name that rendered per viewer would make two people
 * discussing one artefact use two names for it — the thing the paragraph
 * above says this function exists to prevent — and a name recomputed in the
 * reader's language would be a different name every time the reader changed
 * their phone. English, always, deliberately.
 */
export function nameRecording(participants: string[]): string {
  // Never empty in practice — a run with nobody in it is discarded rather than
  // filed — but a label is a poor place to throw.
  if (participants.length === 0) return 'Nobody';
  return describeChannel(participants, ENGLISH_NAMING);
}
