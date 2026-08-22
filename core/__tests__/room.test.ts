import {
  canClearClip,
  canControlPlayback,
  canEditChannel,
  canInvite,
  canInviteGuest,
  canManageGuest,
  canPasteClip,
  createChannel,
  hasTheRoom,
  reduce,
} from '../channel';
import type { ChannelAction, ChannelState, Guest } from '../types';

/**
 * `hasTheRoom`, which is one rule stated once and asked by seven guards.
 *
 * The rule: **nobody reaches into a conversation they are not in.** Membership
 * is standing over a channel; it is not standing over an occupation of it. The
 * escape hatch is that an empty channel belongs to all its members equally, so
 * everything here is available again the moment the last person steps out.
 *
 * Written as one file rather than a case added to each guard's own tests
 * because the value is in the *set*: the failure this guards against is a
 * later guard being added, or an old one relaxed, without anybody noticing
 * that a rule everything else shares now has a hole in it. A reader adding an
 * action that changes what a conversation can see should find this list and
 * add to it.
 */

const ALICE = 'user-alice';
const BOB = 'user-bob';
const CARA = 'user-cara';
const DANA = 'guest_dana';
const T0 = 1_700_000_000_000;

/** Alice present, Bob a member who is outside. Cara is nobody's member. */
const occupied = (): ChannelState =>
  createChannel({ id: 'c1', initiator: ALICE, invitees: [BOB], now: T0 });

/** The same channel with nobody in it. */
const empty = (): ChannelState =>
  reduce(occupied(), { type: 'STEP_OUT', userId: ALICE }, T0 + 1_000);

const guest = (overrides: Partial<Guest> = {}): Guest => ({
  id: DANA,
  name: 'Dana',
  admittedAt: T0,
  maySpeak: false,
  request: 'none',
  ...overrides,
});

const act = (state: ChannelState, action: ChannelAction, now = T0 + 2_000) =>
  reduce(state, action, now);

describe('the room rule', () => {
  it('holds for somebody inside, and for everybody when nobody is inside', () => {
    expect(hasTheRoom(occupied(), ALICE)).toBe(true);
    expect(hasTheRoom(occupied(), BOB)).toBe(false);
    expect(hasTheRoom(empty(), ALICE)).toBe(true);
    expect(hasTheRoom(empty(), BOB)).toBe(true);
  });

  /**
   * Why guest management gets no behaviour out of the empty half of the rule,
   * which is worth an assertion rather than a comment: `settleEmpty` takes
   * every guest with the last member who leaves, so the state the loosening
   * would have covered — a guest alone in a room — does not exist. If this
   * ever fails, `canManageGuest` becomes the one guard where the two halves
   * differ, and its comment says so.
   */
  it('cannot leave a guest in an empty channel for anybody to manage', () => {
    const withGuest = reduce(
      occupied(),
      { type: 'GUEST_ENTERED', guest: guest() },
      T0 + 1_000
    );
    expect(withGuest.guests[DANA]).toBeDefined();

    const emptied = act(withGuest, { type: 'STEP_OUT', userId: ALICE });
    expect(emptied.present).toEqual([]);
    expect(emptied.guests[DANA]).toBeUndefined();
    expect(canManageGuest(emptied, BOB, DANA)).toBe(false);

    // And nobody can be admitted into an empty one either, which is the same
    // rule met from the other side.
    expect(act(emptied, { type: 'GUEST_ENTERED', guest: guest() })).toBe(
      emptied
    );
  });

  it('still refuses a guest the things membership refuses them', () => {
    const withGuest = act(occupied(), {
      type: 'GUEST_ENTERED',
      guest: guest({ maySpeak: true }),
    });
    // In the room, so `hasTheRoom` alone would let them through. Every guard
    // that must refuse them says `isParticipant` beside it.
    expect(hasTheRoom(withGuest, DANA)).toBe(true);
    expect(canManageGuest(withGuest, DANA, DANA)).toBe(false);
    expect(canControlPlayback(withGuest, DANA)).toBe(false);
    expect(canInviteGuest(withGuest, DANA)).toBe(false);
    expect(canEditChannel(withGuest, DANA)).toBe(false);
    // The two it does grant, which is what the guard is written in `inRoom`
    // terms for.
    expect(canPasteClip(withGuest, DANA)).toBe(true);
    expect(canClearClip(withGuest, DANA)).toBe(true);
  });

  /**
   * The list. Each of these changes something the people in the channel can
   * see or hear, which is what makes it theirs rather than any member's.
   */
  it('governs every act that changes what a conversation can see', () => {
    const busy = occupied();
    const free = empty();

    const cases: [string, (s: ChannelState) => boolean][] = [
      ['the name and description', (s) => canEditChannel(s, BOB)],
      ['inviting a contact', (s) => canInvite(s, BOB, CARA)],
      ['minting a guest link', (s) => canInviteGuest(s, BOB)],
      ['the shared track', (s) => canControlPlayback(s, BOB)],
      ['pasting to the clipboard', (s) => canPasteClip(s, BOB)],
      ['clearing the clipboard', (s) => canClearClip(s, BOB)],
    ];

    for (const [what, guard] of cases) {
      expect([what, guard(busy)]).toEqual([what, false]);
      expect([what, guard(free)]).toEqual([what, true]);
    }
  });

  /**
   * The reducer, not only the guards — the screen reads these to grey a
   * control out, and a control that were merely greyed would be a suggestion.
   */
  it('is enforced by the reducer and not only by the disabled controls', () => {
    const busy = occupied();
    expect(act(busy, { type: 'SET_NAME', userId: BOB, name: 'Mine now' })).toBe(
      busy
    );
    expect(
      act(busy, { type: 'SET_DESCRIPTION', userId: BOB, description: 'Mine' })
    ).toBe(busy);
    expect(act(busy, { type: 'INVITE', userId: BOB, inviteeId: CARA })).toBe(
      busy
    );
    expect(act(busy, { type: 'PLAY', userId: BOB })).toBe(busy);
    expect(
      act(busy, {
        type: 'PASTE_CLIP',
        userId: BOB,
        clip: {
          id: 'clip_1',
          authorId: BOB,
          pastedAt: T0,
          kind: 'text',
          text: 'https://example.com',
        },
      })
    ).toBe(busy);
  });

  /**
   * What the rule deliberately leaves alone. Each of these is about presence
   * for a reason of its own, or is personal, and folding them in would make
   * the rule mean something else.
   */
  it('does not govern leaving, which is yours whoever else is talking', () => {
    const busy = occupied();
    const left = act(busy, { type: 'LEAVE_CHANNEL', userId: BOB });
    expect(left.participants).toEqual([ALICE]);
  });
});
