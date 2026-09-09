import {
  canPing,
  createChannel,
  idleMs,
  isPresent,
  isWaiting,
  nearbyMs,
  reduce,
} from '../channel';
import { WAITING_WINDOW_MS } from '../constants';
import type { ChannelState } from '../types';

/**
 * Nearby, declared — the one wire addition of the 2026-09-08 redesign.
 *
 * *Nearby* had one way in, and it was something that happened **to** somebody:
 * you were present, your socket went before the attention window expired, and
 * the grace period filed you under `waiting`. It now has three, and the two
 * new ones are deliberate — *be nearby* from outside a channel, and *be
 * nearby* from inside one, which abandons the claim on the audio system. One
 * name for both since 2026-09-09, when it also gained a way out.
 *
 * What is tested here is that the declared kinds are indistinguishable from
 * the inferred one everywhere it matters: the same field and the same ping.
 *
 * **Not the same clock, since 2026-09-09.** That was the fourth item in this
 * list for a day, and it was the bug: an inferred wait is timed from the last
 * sign of life, and a declared one from the declaration, because a tap *is* a
 * sign of life. The two questions differ, so the two answers do. See
 * `nearbyMs`, and § *The second clock* below.
 */

const A = 'user-a';
const B = 'user-b';
const T0 = 1_700_000_000_000;

const alone = (): ChannelState =>
  createChannel({ id: 's1', initiator: A, invitees: [B], now: T0 });

const together = () => reduce(alone(), { type: 'ENTER', userId: B }, T0 + 1_000);

const declare = (state: ChannelState, who: string, now = T0 + 2_000) =>
  reduce(state, { type: 'DECLARE_NEARBY', userId: who }, now);

describe('declaring nearby from inside a channel', () => {
  it('gives up presence and lands in the same field a dropped connection does', () => {
    const s = declare(together(), B);
    expect(isPresent(s, B)).toBe(false);
    expect(s.waiting).toContain(B);
  });

  it('makes them pingable, which is the whole of what nearby is for', () => {
    expect(canPing(together(), A, B)).toBe(false);
    expect(canPing(declare(together(), B), A, B)).toBe(true);
  });

  it('does not stamp `lastPresentAt`, which answers a different question', () => {
    // The stamp is left to the transport, so it goes on being refreshed while
    // the app is alive and freezes when the phone suspends — and the fifteen
    // minutes to *Stepped out* is measured from the last sign of life rather
    // than from the declaration. A tap on Step Out stamps it; this must not,
    // or a phone that declares nearby and is pocketed would read as having
    // been here right up to the moment it was put away.
    const before = together();
    const s = declare(before, B, T0 + 60_000);
    expect(s.lastPresentAt[B]).toBe(before.lastPresentAt[B]);
  });

  it('clears the self-mute and the floor, as every departure does', () => {
    const muted = reduce(
      together(),
      { type: 'SET_SELF_MUTE', userId: B, muted: true },
      T0 + 1_500
    );
    const claimed = reduce(muted, { type: 'CLAIM_FLOOR', userId: B }, T0 + 1_600);
    const s = declare(claimed, B);
    expect(s.selfMuted[B]).toBe(false);
    expect(s.floor.holder).toBeNull();
  });
});

describe('stepping in nearby, from outside', () => {
  it('adds nobody to the room', () => {
    const s = declare(alone(), B);
    expect(isPresent(s, B)).toBe(false);
    expect(s.present).toEqual([A]);
    expect(s.waiting).toContain(B);
  });

  it('is idempotent, a second declaration changing nothing', () => {
    const once = declare(alone(), B);
    expect(declare(once, B, T0 + 3_000)).toBe(once);
  });

  it('does not disturb the ordering of Home', () => {
    // `lastActiveAt` says when the room was last a room. Somebody declaring
    // themselves reachable has not been in it, so a channel must not float to
    // the top of anybody's list on the strength of it.
    const before = alone();
    expect(declare(before, B, T0 + 9_000).lastActiveAt).toBe(before.lastActiveAt);
  });

  it('is refused to somebody who is not a member', () => {
    const before = alone();
    expect(declare(before, 'user-c')).toBe(before);
  });

  it('is cleared by walking in, like every other kind of waiting', () => {
    const nearby = declare(alone(), B);
    const entered = reduce(nearby, { type: 'ENTER', userId: B }, T0 + 4_000);
    expect(entered.waiting).not.toContain(B);
    expect(isPresent(entered, B)).toBe(true);
  });
});

/**
 * The way off the rung, added 2026-09-09 with the three-state controls.
 *
 * Until then `stepOut` returned the state untouched for anybody who was not
 * present, so a declaration could only be ended by stepping in — or by the
 * fifteen-minute window ageing it out, which is not something anybody can
 * choose. See planning/decisions/2026-09-09-presence-is-a-ladder.md.
 */
describe('stepping out of nearby', () => {
  const nearby = () => declare(alone(), B);
  const stepOut = (state: ChannelState, who: string, now = T0 + 5_000) =>
    reduce(state, { type: 'STEP_OUT', userId: who }, now);

  it('ends the declaration', () => {
    const s = stepOut(nearby(), B);
    expect(s.waiting).not.toContain(B);
    expect(isPresent(s, B)).toBe(false);
  });

  it('puts the roster card back to stepped out', () => {
    // The one thing anybody else can see about a declaration: `isWaiting` is
    // what the roster reads, and it is *Nearby* against *Stepped out*. Being
    // worth calling is not affected either way — `canPing` asks only whether
    // somebody is out of earshot, which they are on both rungs.
    // Declared from inside, so there is a `lastPresentAt` for the window to
    // be measured against — the roster says *Nearby* for fifteen minutes from
    // the last sign of life, and nothing at all for somebody it has never
    // heard from.
    const inside = declare(together(), B);
    expect(isWaiting(inside, B, T0 + 6_000)).toBe(true);
    expect(isWaiting(stepOut(inside, B), B, T0 + 6_000)).toBe(false);
    expect(canPing(stepOut(inside, B), A, B)).toBe(true);
  });

  it('does not stamp the clocks, having been in nobody\'s room', () => {
    // `lastPresentAt` would claim they were here until this moment, which is
    // the lie the whole `Exit` distinction exists to avoid — they were not.
    // `lastActiveAt` orders Home by when a room was last a room, and
    // withdrawing a claim on a notification is not the room going quiet.
    const before = nearby();
    const s = stepOut(before, B, T0 + 60_000);
    expect(s.lastPresentAt[B]).toBe(before.lastPresentAt[B]);
    expect(s.lastActiveAt).toBe(before.lastActiveAt);
  });

  it('changes nothing for somebody who was not nearby', () => {
    const before = alone();
    expect(stepOut(before, B)).toBe(before);
  });

  it('leaves a dropped connection where the grace period put it', () => {
    // A clock firing has nothing to say about a declaration: `DISCONNECT_EXPIRED`
    // is what *files* somebody under nearby, and `ATTENTION_EXPIRED` is the
    // rung below it. Neither is a chosen departure, and only a chosen one ends
    // a wait.
    const dropped = reduce(
      reduce(together(), { type: 'DISCONNECTED', userId: B }, T0 + 2_000),
      { type: 'DISCONNECT_EXPIRED', userId: B },
      T0 + 120_000
    );
    expect(dropped.waiting).toContain(B);
    const expired = reduce(
      dropped,
      { type: 'ATTENTION_EXPIRED', userId: B },
      T0 + 130_000
    );
    expect(expired.waiting).toContain(B);
  });
});

/**
 * The second clock.
 *
 * `waiting` holds two kinds of absence and they are timed from different
 * moments: a lost connection from the last thing anybody heard, a declaration
 * from the declaration. Reading both off `lastPresentAt` produced a card that
 * said "Nearby for four minutes" about a tap one second old, and — since the
 * window is measured from the same number — gave that declaration eleven
 * minutes of life instead of fifteen.
 */
describe('how long a wait has been going on', () => {
  const steppedOutAt = (when: number) =>
    reduce(together(), { type: 'STEP_OUT', userId: B }, when);

  it('times a declaration from the declaration, not from the last sign of life', () => {
    // The case Rodrigo asked about: stepped out four minutes ago, and presses
    // Nearby. The wait is a second old; only the silence is four minutes old.
    const four = T0 + 4 * 60_000;
    const s = declare(steppedOutAt(T0 + 1_000), B, four);
    expect(nearbyMs(s, B, four)).toBe(0);
    expect(nearbyMs(s, B, four + 30_000)).toBe(30_000);
    // And the older question still has its old answer, which is the reason
    // this is a second clock rather than a correction to the first.
    expect(idleMs(s, B, four)).toBe(4 * 60_000 - 1_000);
  });

  it('gives the declaration a full window, however old the silence', () => {
    const four = T0 + 4 * 60_000;
    const s = declare(steppedOutAt(T0 + 1_000), B, four);
    // Eleven minutes in, which is where it used to lapse.
    expect(isWaiting(s, B, four + 11 * 60_000)).toBe(true);
    expect(isWaiting(s, B, four + WAITING_WINDOW_MS - 1)).toBe(true);
    expect(isWaiting(s, B, four + WAITING_WINDOW_MS)).toBe(false);
  });

  it('accepts a declaration made after the silence outran the window', () => {
    // The sharp case, and the one that was visibly broken: past fifteen
    // minutes the declaration was recorded and `isWaiting` was false from the
    // instant it was made, so the footer lit *Nearby* while the person's own
    // roster card read *Stepped out sixteen minutes ago*.
    const late = T0 + 16 * 60_000;
    const s = declare(steppedOutAt(T0 + 1_000), B, late);
    expect(s.waiting).toContain(B);
    expect(isWaiting(s, B, late)).toBe(true);
    expect(nearbyMs(s, B, late)).toBe(0);
  });

  it('lets somebody be nearby in a channel they have never entered', () => {
    // No `lastPresentAt` at all, so the old clock had nothing to say and the
    // card said *Invited* for ever. A declaration is knowledge without a
    // stamp.
    const s = declare(alone(), B, T0 + 5_000);
    expect(idleMs(s, B, T0 + 5_000)).toBeNull();
    expect(nearbyMs(s, B, T0 + 5_000)).toBe(0);
    expect(isWaiting(s, B, T0 + 5_000)).toBe(true);
  });

  it('times a lost connection from the last thing heard, as it always did', () => {
    // The other kind, unchanged and deliberately so: a phone in a pocket gives
    // no sign of life, so the last one is all anybody knows.
    const dropped = reduce(
      together(),
      { type: 'DISCONNECT_EXPIRED', userId: B },
      T0 + 60_000
    );
    const later = T0 + 5 * 60_000;
    expect(dropped.waiting).toContain(B);
    expect(dropped.declaredNearbyAt[B]).toBeUndefined();
    expect(nearbyMs(dropped, B, later)).toBe(idleMs(dropped, B, later));
  });

  it('drops the clock when the wait ends, from either rung', () => {
    // Left behind, it would time the *next* declaration from this one — the
    // same fault, arrived at from the other side.
    const nearbyNow = declare(together(), B, T0 + 2_000);
    expect(nearbyNow.declaredNearbyAt[B]).toBe(T0 + 2_000);

    const back = reduce(nearbyNow, { type: 'ENTER', userId: B }, T0 + 3_000);
    expect(back.declaredNearbyAt[B]).toBeUndefined();

    const gone = reduce(nearbyNow, { type: 'STEP_OUT', userId: B }, T0 + 3_000);
    expect(gone.declaredNearbyAt[B]).toBeUndefined();
  });

  it('does not let a declaration renew itself', () => {
    // The window is what somebody *else* relies on — how long a card goes on
    // saying Nearby and offering a ping — so the person being waited for
    // cannot extend it by re-asserting. Re-declaring was already a no-op; the
    // clock does not make it one that bites.
    const first = declare(together(), B, T0 + 2_000);
    const again = declare(first, B, T0 + 10 * 60_000);
    expect(again).toBe(first);
    expect(again.declaredNearbyAt[B]).toBe(T0 + 2_000);
  });
});
