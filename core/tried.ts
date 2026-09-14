/**
 * The four things the introduction asks somebody to *try*, and the only part
 * of it that is not derived from something the server already knew.
 *
 * **These are the one place the ladder departs from being a view of a
 * snapshot**, which was the design's founding rule — every other rung is read
 * off Home, and `planning/ONBOARDING.md` argues at length that a checklist
 * carrying its own event stream is the thing a third-party module would have
 * sold us. The four here have no snapshot to be read off: nothing else the
 * server holds says whether this account has ever claimed the floor, declared
 * itself nearby, admitted a guest or played anything. `RejoinableView.nearby`
 * comes closest and answers a different question — whether you are nearby
 * *now* — which would untick itself fifteen minutes later.
 *
 * **So the server keeps them, and they ride on the Home snapshot**, which
 * makes the ladder a view of one again. They were per install and in the
 * keychain until 2026-09-13 — four `thefloor.intro.tried.*` keys, which meant
 * a second device started all four hollow for an account that had done all
 * four, and a reinstall did the same. See
 * `decisions/2026-09-13-the-tried-rungs-belong-to-the-account.md`.
 *
 * The shape lives here rather than in either end for `protocol.ts`' reason: it
 * is on the wire now, and two copies of a wire shape drift.
 */

/** What an account has tried, at least once, on any device. */
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

/** What an account that has done none of them looks like. */
export const NOTHING_TRIED: Tried = {
  floor: false,
  nearby: false,
  guest: false,
  player: false,
};

/**
 * Whether an id off the wire is one of the four rather than anything at all.
 *
 * Here rather than at the route, because the route is not the only reader: the
 * client reads the same four names out of a snapshot, and a list of valid ids
 * that lived on the server would be a second copy of `TRIED_IDS` in the place
 * it matters most that there is one.
 */
export function isTriedId(value: unknown): value is TriedId {
  return (
    typeof value === 'string' && (TRIED_IDS as readonly string[]).includes(value)
  );
}

/** Whether all four are behind somebody — half of what retires the ladder. */
export function allTried(tried: Tried): boolean {
  return TRIED_IDS.every((id) => tried[id]);
}
