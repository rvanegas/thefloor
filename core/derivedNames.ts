/**
 * The names an account starts with when nobody typed them.
 *
 * Signing up asks for an address and a code, and offers a display name it does
 * not require — so an account can be born with nothing to call it. What it was
 * called until 2026-09-12 was its sign-in address, in full, which is the one
 * string here that is nobody's name: it is punctuation and a domain, it is the
 * *private* half of an identity being drawn to strangers on a roster, and it is
 * what somebody sees above a claim on the floor.
 *
 * So both names are derived instead, and the two derivations are chained: the
 * address gives a display name, and the display name gives a username. That
 * order is the point. A username derived straight from the address would be a
 * second, worse rendering of the same string, and would disagree with the name
 * above it the moment either was corrected; derived from the display name it
 * reads as the same person's, whether that name was typed or came from here.
 *
 * **Every name here is a suggestion and none is an identity.** A display name
 * is replaced by typing one at signup or on the Contact screen, and a username
 * is editable there too — see `ProfileView`. Nothing downstream may assume a
 * derived name is still what it was.
 *
 * In `core/` for the reason `username.ts` is: the shapes these produce have to
 * satisfy the rules that file owns, and a derivation that can mint a string the
 * validator refuses is a derivation written against a rule it does not share.
 * Every candidate this file returns has been through `normaliseUsername`.
 */

import { MAX_DISPLAY_NAME_LENGTH } from './constants';
import {
  MAX_USERNAME_LENGTH,
  MIN_USERNAME_LENGTH,
  normaliseUsername,
} from './username';

/** What separates words inside the local part of an address. */
const SEPARATORS = /[._\-\s]+/g;

/** Combining marks, which is what is left of an accent after NFKD. */
const MARKS = /\p{M}+/gu;

/** Everything a username may not hold. See `core/username.ts` for the rule. */
const FOREIGN = /[^a-z0-9]+/g;

/**
 * A display name for somebody who gave none, out of their sign-in address.
 *
 * The local part only, and the domain is dropped rather than abbreviated: a
 * provider is not a fact about a person, and `alice@gmail.com` on a roster
 * tells the room where she reads her mail and nothing else. A `+tag` goes with
 * it, that being a routing instruction its owner wrote to themselves.
 *
 * What is left is read as words — dots, underscores, dashes and pluses are how
 * an address spells a space — and each is capitalised, because this is a name
 * and names are capitalised. Only the first letter of each word: `annaK` stays
 * `AnnaK`, since somebody who wrote their own capital meant it.
 *
 * **Never blank.** An address with nothing usable before the `@` falls back to
 * the address as typed, which is what this replaced and is still better than a
 * nameless row. Capped like any other display name.
 */
export function displayNameFromIdentifier(identifier: string): string {
  const typed = identifier.trim();
  const at = typed.lastIndexOf('@');
  // Only an address with nothing before the `@` reaches the fallback below:
  // `at === 0` is a local part that is empty rather than one that is missing,
  // and reading it as the whole address would name somebody after a domain.
  const local = at === -1 ? typed : typed.slice(0, at);
  const name = local
    .split('+')[0]
    .replace(SEPARATORS, ' ')
    .trim()
    .split(' ')
    .filter((word) => word !== '')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
    .slice(0, MAX_DISPLAY_NAME_LENGTH)
    .trim();
  return name === '' ? typed : name;
}

/**
 * The stem of a username for a display name, or null when the name yields
 * nothing a username may be made of.
 *
 * **Lowercase, where the display name above it is capitalised.** Case in a
 * username is preserved but is not part of the identity — `core/username.ts`
 * says why — so a derived one is written the way a handle is usually written,
 * and a reader who wants `@AnnaK` types it. An accent is folded rather than
 * dropped, so `José` gives `jose` instead of `jos`; anything else outside
 * letters and digits becomes an underscore, runs collapse, and the edges are
 * trimmed, since `_anna_` is a name nobody would choose.
 *
 * Null is the honest answer for a name written in a script with no letters
 * this alphabet admits: 芽衣 reduces to nothing, and an underscore is not a
 * username. The caller decides what to do with that — `Accounts.establish`
 * falls back to the address, which is ASCII by construction.
 *
 * A stem, not a username: it may be shorter than the floor. `usernameAttempts`
 * is what turns one into names that are actually allowed.
 */
export function usernameStem(displayName: string): string | null {
  const stem = displayName
    .normalize('NFKD')
    .replace(MARKS, '')
    .toLowerCase()
    .replace(FOREIGN, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, MAX_USERNAME_LENGTH);
  return stem === '' ? null : stem;
}

/**
 * The names to try for a stem, in order, best first.
 *
 * Uniqueness is a fact about the database — see `core/username.ts` — so the
 * only thing that can be done here is to offer alternatives and let the unique
 * index refuse them one at a time. The first is the stem itself; after that a
 * number, from two, which is how a person would do it.
 *
 * The suffix does second duty for a stem below the floor: `al` cannot be a
 * username at all, so its numbers are padded to reach the minimum and it is
 * offered `al01`, `al02`, and so on. A stem that has to give way at the other
 * end is truncated to make room, since a name over the cap is refused whole.
 *
 * Every string returned has been through `normaliseUsername`, so a caller may
 * write one without checking it again.
 */
export function usernameAttempts(stem: string, count: number): string[] {
  const names: string[] = [];
  for (let n = 1; n <= count; n += 1) {
    const bare = n === 1 && stem.length >= MIN_USERNAME_LENGTH;
    const digits = bare
      ? ''
      : String(n).padStart(Math.max(1, MIN_USERNAME_LENGTH - stem.length), '0');
    const room = MAX_USERNAME_LENGTH - digits.length;
    const candidate = stem.slice(0, room) + digits;
    if (normaliseUsername(candidate)) names.push(candidate);
  }
  return names;
}
