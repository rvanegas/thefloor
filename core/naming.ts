/**
 * What to call a channel that nobody has named.
 *
 * The answer is a **description, not a name**, and the difference is the whole
 * point. A name is one string every member reads; this is written from one
 * viewer's side and says who else is in there, so you and the person you are
 * talking to see different words for the same channel. The interface has to
 * admit that rather than dress it as a name — see the muted italic in
 * HomeView and ChannelView, and planning/DECISIONS*.md.
 *
 * Shared by both screens and by the push title so that a channel does not
 * answer to one thing on the lock screen and another once you have tapped it.
 * That was already the stated intent in the server's copy of this logic; it
 * was not true, because there were three copies and they had drifted.
 */

/** Beyond this many names the list stops and counts the rest. */
const NAMES_SHOWN = 2;

/**
 * `others` is everyone but the viewer, already resolved to display names and
 * in roster order. Empty is a real state, not an error: everyone else can
 * leave a channel and it stays yours, with your description and your
 * recordings still hanging off it.
 */
export function describeChannel(others: string[]): string {
  if (others.length === 0) return 'Just you';
  if (others.length === 1) return others[0];
  if (others.length === 2) return `${others[0]} and ${others[1]}`;

  // Two names and a count rather than the whole roster, because this renders
  // on one line in a list row and the cap is six.
  const rest = others.length - NAMES_SHOWN;
  return `${others.slice(0, NAMES_SHOWN).join(', ')} and ${rest} other${
    rest === 1 ? '' : 's'
  }`;
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
 * planning/DECISIONS*.md.
 */
export function nameRecording(participants: string[]): string {
  // Never empty in practice — a run with nobody in it is discarded rather than
  // filed — but a label is a poor place to throw.
  if (participants.length === 0) return 'Nobody';
  return describeChannel(participants);
}
