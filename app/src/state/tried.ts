/**
 * The four things the checklist asks somebody to *try*, and the only part of
 * it this app writes down about itself.
 *
 * **These are the one place the ladder departs from being a view of a
 * snapshot**, which was the design's founding rule — every other rung is read
 * off Home, and `planning/ONBOARDING.md` argues at length that a checklist
 * carrying its own event stream is the thing a third-party module would have
 * sold us. The four here have no snapshot to be read off: nothing the server
 * sends says whether this account has ever claimed the floor, declared itself
 * nearby, admitted a guest or played anything. `RejoinableView.nearby` comes
 * closest and answers a different question — whether you are nearby *now* —
 * which would untick itself fifteen minutes later.
 *
 * **So they are per install rather than per account**, and that is the honest
 * cost of not making it a wire change. A second device starts these four
 * unticked on an account that has done all of them. That is acceptable here
 * and would not be for the rungs above: those say *this is true of you*, and
 * these say *you have tried this* — which is a fact about somebody having been
 * shown a control, and a control lives on a device.
 *
 * Pure, for `introduction.ts`' reason: the policy is testable and the hook
 * around it is not.
 */

/** What has been tried on this install. */
export interface Tried {
  /** `CLAIM_FLOOR` — the *Claim* slot in a channel's bottom bar. */
  floor: boolean;
  /** `DECLARE_NEARBY` — the *Nearby* rung, from the bar or the card. */
  nearby: boolean;
  /** A guest link minted or shared, on a channel's *Invite* tab. */
  guest: boolean;
  /** Anything played on a channel's *Player* tab. */
  player: boolean;
}

export type TriedId = keyof Tried;

/**
 * In the order the rungs are drawn, which is roughly the order somebody meets
 * these: the floor and being nearby are the two halves of what a channel is
 * for, and the guest and the player are what a channel can additionally do.
 */
export const TRIED_IDS: readonly TriedId[] = [
  'floor',
  'nearby',
  'guest',
  'player',
];

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

/** What an install that has done none of them looks like. */
export const NOTHING_TRIED: Tried = {
  floor: false,
  nearby: false,
  guest: false,
  player: false,
};

/** Whether all four are behind somebody — half of what retires the ladder. */
export function allTried(tried: Tried): boolean {
  return TRIED_IDS.every((id) => tried[id]);
}
