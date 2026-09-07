/**
 * The name somebody may choose for themselves, written with an `@`.
 *
 * A second name, and deliberately not a replacement for the first. A display
 * name is what people call somebody and is neither unique nor typeable — two
 * cousins may both be "Mum" to different readers, and either may hold a space
 * and an emoji. A username is the opposite of all of that: one owner, one
 * spelling, and a spelling you can say out loud and somebody else can type.
 * They answer different questions and this application asks both.
 *
 * **One thing reads it, as of 2026-09-06: the invite link.** A username is
 * drawn on a profile and is the first half of `/i/<username>/<pin>`, which is
 * how somebody hands out an invitation to become a contact. Still no search,
 * no mention and no sign-in — and the one reader is a name arriving in a URL
 * that was handed over, never a name being looked up, which is the line this
 * file's strictness exists to keep drawable.
 *
 * That strictness is why the link is legible at all: a name that is typed by
 * somebody who *heard* it has to survive being heard, and every character that
 * is not a letter, a digit or an underscore is one that survives badly.
 *
 * In `core/` rather than in either end, for the reason `im.ts` is: the server
 * decides what may be stored and the app decides what to say about a field
 * somebody is typing into, and a rule written twice is two rules. The app must
 * be able to refuse before the round trip — a screen that says nothing until
 * the server does turns an obvious mistake into a wait.
 *
 * **Uniqueness is not here and cannot be.** Whether a name is taken is a fact
 * about the database, so it is enforced by the unique index in `server/db.ts`
 * and reported by the route. What this file settles is whether a string is a
 * username at all.
 */

/**
 * The most characters a username may hold.
 *
 * Thirty, which is Instagram's, and it is a display constraint rather than a
 * storage one: it is drawn under a display name capped at forty, and a handle
 * longer than the name above it reads as the name having been typed twice.
 *
 * There is a floor as well, and it is the more consequential of the two, since
 * a cap only ever refuses a name nobody would type twice. Five, which is
 * Telegram's, and the reasoning is theirs: the short names are a fixed and
 * tiny supply — 63 of one character, some 4,000 of two, about a quarter of a
 * million of three — against an unbounded supply of longer ones, and they would
 * otherwise go to whoever signed up first and never come back. A floor cannot
 * be raised later without taking names off people, so the cheap moment to
 * choose one is before any exist.
 */
export const MAX_USERNAME_LENGTH = 30;

/** The fewest a username may hold. See above for why there is a floor at all. */
export const MIN_USERNAME_LENGTH = 5;

/**
 * What a username may be made of: letters, digits and the underscore, and
 * nothing else.
 *
 * ASCII deliberately, where a display name is anything somebody can type. The
 * point of a username is that it goes through a keyboard other than its
 * owner's — and a name in a script the reader has no keyboard for is one they
 * cannot enter however carefully it was shown to them.
 */
const USERNAME = /^[A-Za-z0-9_]+$/;

/** What is typed and what is stored differ by the `@` and the whitespace. */
const strip = (typed: string): string => typed.trim().replace(/^@/, '');

/**
 * What somebody typed, turned into the one shape that is stored — or null when
 * it is not a username at all.
 *
 * Lenient in exactly one direction: a leading `@` is dropped, because that is
 * how the thing is written everywhere it appears, this application's own
 * profile screen included, so somebody copying their handle out of one copies
 * the `@` with it. Anything else is refused rather than repaired — spaces do
 * not become underscores and dots are not dropped, since a name that silently
 * becomes a different name is worse than one that was refused.
 *
 * **Case is preserved and is not part of the identity.** What is stored is
 * what was typed, so `@AnnaK` stays `@AnnaK` on her profile; what uniqueness
 * is judged on is that string folded, so nobody else may be `@annak`. Two
 * names differing only in case are the same name to anybody who ever hears one
 * spoken, and letting both exist is handing out an impersonation.
 *
 * Null is the refusal and the caller decides what it means. **Blank is not a
 * refusal** — an empty field is how a username is given up, exactly as it is
 * for a messaging handle, and only the caller knows whether a field was
 * cleared on purpose. See `usernameProblem` for the sentence a field says, and
 * `Accounts.updateProfile` for what a blank one does.
 */
export function normaliseUsername(typed: string): string | null {
  const name = strip(typed);
  // Before the floor, and that order is the contract rather than a shortcut:
  // blank is a removal, so it has to come back as the empty name rather than
  // as the refusal every other too-short string gets.
  if (name === '') return '';
  if (name.length > MAX_USERNAME_LENGTH) return null;
  if (name.length < MIN_USERNAME_LENGTH) return null;
  return USERNAME.test(name) ? name : null;
}

/**
 * The form uniqueness is judged on: the same name, folded.
 *
 * A function rather than an inlined `toLowerCase`, so that any client idea of
 * "the same username" and the database's unique index have one definition
 * between them. The index is `COLLATE NOCASE`, which folds ASCII and nothing
 * else — exactly the alphabet `USERNAME` admits, so the two agree by
 * construction rather than by luck.
 */
export const foldUsername = (username: string): string =>
  username.toLowerCase();

/**
 * What is wrong with what somebody has typed, or null while there is nothing
 * to say — which includes an empty field, that being how a username is given
 * up rather than a mistake.
 *
 * Names the fault rather than the rule where it can. Almost everything refused
 * here is refused for one of two reasons and the sentence says which: "letters,
 * digits and underscores", read under a field containing a space, is a rule the
 * reader has to apply to their own string to find out what is wrong with it.
 *
 * Says nothing about whether the name is taken. This is asked of every
 * keystroke and the answer to that question is on another machine; the route
 * says it, once, when a save is attempted.
 */
export function usernameProblem(typed: string): string | null {
  const name = strip(typed);
  if (name === '') return null;
  if (name.length > MAX_USERNAME_LENGTH) {
    return `A username can be at most ${MAX_USERNAME_LENGTH} characters.`;
  }
  // Before the alphabet check, deliberately: `ab` is short *and* well formed,
  // and being told about the characters it is allowed to use would send
  // somebody looking for a character that is not there.
  if (name.length < MIN_USERNAME_LENGTH) {
    return `A username needs at least ${MIN_USERNAME_LENGTH} characters.`;
  }
  return USERNAME.test(name)
    ? null
    : 'Letters, digits and underscores only — no spaces, dots or dashes.';
}
