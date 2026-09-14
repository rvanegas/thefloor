/**
 * What is left on the phone of the introduction's four *try* rungs, which is
 * now only the answer this install gave before the server kept one.
 *
 * **The four facts moved to the account on 2026-09-13** — `core/tried.ts` has
 * the shape and the reasoning, and they ride on the Home snapshot like every
 * other rung. What remains here is the four keychain keys they used to live
 * in, read once per sign-in and handed up to the server so that nobody who has
 * already claimed a floor is told they have not. See `useIntroduction`, and
 * planning/SHIMS.md for when they go.
 */

export {
  NOTHING_TRIED,
  TRIED_IDS,
  allTried,
  type Tried,
  type TriedId,
} from '../../../core/tried';

import { TRIED_IDS, type TriedId } from '../../../core/tried';

/**
 * One key each rather than one JSON blob, on the same reasoning
 * `storageKeys.test.ts` enforces: every key this app writes is named in
 * `INSTALL_KEYS`, and a blob would hide four facts behind one name that
 * *Forget this phone* could not be reasoned about.
 *
 * **Four `const`s and then a record, rather than the record alone.** That test
 * greps for an *assignment* — `= 'thefloor.…'` — precisely so that a key
 * assembled from pieces cannot slip past it, and a key written only as an
 * object property is invisible to it in the same way. The indirection is the
 * price of being checked.
 *
 * **Read and cleared, never written, since 2026-09-13.** They are a one-way
 * door now: whatever they hold is offered to the server once and then they are
 * emptied, so an install that has handed its answers up cannot hand them up a
 * second time and cannot disagree with the account afterwards.
 */
const FLOOR_KEY = 'thefloor.intro.tried.floor';
const NEARBY_KEY = 'thefloor.intro.tried.nearby';
const GUEST_KEY = 'thefloor.intro.tried.guest';
const PLAYER_KEY = 'thefloor.intro.tried.player';

export const TRIED_KEYS: Record<TriedId, string> = {
  floor: FLOOR_KEY,
  nearby: NEARBY_KEY,
  guest: GUEST_KEY,
  player: PLAYER_KEY,
};

/** Which of the four this install ticked before the account held them. */
export function legacyTried(stored: ReadonlyArray<string | null>): TriedId[] {
  return TRIED_IDS.filter((_, at) => stored[at] === '1');
}
