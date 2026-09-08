import { canPing, createChannel, isPresent, reduce } from '../channel';
import type { ChannelState } from '../types';

/**
 * Nearby, declared — the one wire addition of the 2026-09-08 redesign.
 *
 * *Nearby* had one way in, and it was something that happened **to** somebody:
 * you were present, your socket went before the attention window expired, and
 * the grace period filed you under `waiting`. It now has three, and the two
 * new ones are deliberate — *step in nearby* from outside a channel, and
 * *nearby* from inside one, which abandons the claim on the audio system.
 *
 * What is tested here is that the declared kinds are indistinguishable from
 * the inferred one everywhere it matters: the same field, the same ping, the
 * same clock. That is what makes every build that predates this action render
 * a declared nearby correctly.
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

  it('does not stamp `lastPresentAt`, which is the one clock', () => {
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
