import React from 'react';
import renderer, { act, type ReactTestRenderer } from 'react-test-renderer';
import { createChannel, reduce } from '../../../../core/channel';
import type { ChannelState } from '../../../../core/types';
import { usePresenceChime } from '../usePresenceChime';

const ME = 'acct_me';
const THEM = 'acct_them';
const THIRD = 'acct_third';
const FOURTH = 'acct_fourth';
const NOW = 1_700_000_000_000;

/**
 * The room says who came and went, to everybody in it except the person it is
 * about.
 *
 * Two rules carry most of this file. **You never hear yourself** — it is the
 * part of the request that is least negotiable and the easiest to lose to a
 * refactor, since every other rule here is about other people. And **only a
 * departure somebody chose makes a sound**: of the four ways to stop being
 * present, two are clocks running out, and a chime for those would be
 * announcing a decision nobody made. See `core/channel.ts` § `Exit`.
 */

/** Me alone in a channel, having stepped in. */
const alone = () =>
  createChannel({
    id: 'sess_1',
    initiator: ME,
    invitees: [THEM, THIRD],
    now: NOW,
  });

/** The same, with a fourth person, for the snapshots that move three at once. */
const aloneOfFour = () =>
  createChannel({
    id: 'sess_1',
    initiator: ME,
    invitees: [THEM, THIRD, FOURTH],
    now: NOW,
  });

const enter = (channel: ChannelState, userId: string, at = NOW) =>
  reduce(channel, { type: 'ENTER', userId }, at);

const stepOut = (channel: ChannelState, userId: string, at = NOW + 1_000) =>
  reduce(channel, { type: 'STEP_OUT', userId }, at);

const dropped = (channel: ChannelState, userId: string, at = NOW + 1_000) =>
  reduce(channel, { type: 'DISCONNECT_EXPIRED', userId }, at);

const inattentive = (channel: ChannelState, userId: string, at = NOW + 1_000) =>
  reduce(channel, { type: 'ATTENTION_EXPIRED', userId }, at);

const declareNearby = (
  channel: ChannelState,
  userId: string,
  at = NOW + 1_000
) => reduce(channel, { type: 'DECLARE_NEARBY', userId }, at);

function mount(channel: ChannelState | null) {
  const fire = jest.fn();
  function Probe({ state }: { state: ChannelState | null }) {
    usePresenceChime(state, ME, fire);
    return null;
  }
  let tree: ReactTestRenderer;
  act(() => {
    tree = renderer.create(<Probe state={channel} />);
  });
  return {
    fire,
    update(next: ChannelState | null) {
      act(() => {
        tree.update(<Probe state={next} />);
      });
    },
    unmount: () => act(() => tree.unmount()),
  };
}

/**
 * One call's arguments, per kind.
 *
 * Rising is an arrival, falling a departure, nearing a step back to the rung
 * that is one ping from the room. **Named rather than spelled inline** so that
 * the assertions say which event they mean; the kinds were `true` and `false`
 * until 2026-09-15, and a third of them cannot be a boolean.
 *
 * **The kind is the whole of it.** A peak was a second argument for one day on
 * 2026-09-15, when how loud a chime is was the listener's to choose; the
 * ladder went and the loudness is `CHIME_AMPLITUDE`, which nothing above
 * `chime.ts` passes or can change. See
 * planning/decisions/2026-09-15-the-chime-has-one-loudness-again.md.
 */
const rising = ['in'];
const falling = ['out'];
const nearing = ['nearby'];

describe('the chime that says the room changed shape', () => {
  it('rises when somebody else steps in', () => {
    const view = mount(alone());
    expect(view.fire).not.toHaveBeenCalled();

    view.update(enter(alone(), THEM));
    expect(view.fire.mock.calls).toEqual([rising]);
    view.unmount();
  });

  it('falls when somebody else steps out', () => {
    const together = enter(alone(), THEM);
    const view = mount(together);

    view.update(stepOut(together, THEM));
    expect(view.fire.mock.calls).toEqual([falling]);
    view.unmount();
  });

  /**
   * The rule the request states outright, and the reason this cue is local
   * rather than published into the room: a room chime could not have made this
   * distinction at all.
   */
  it('says nothing about your own arrival or your own departure', () => {
    const theirs = enter(alone(), THEM);
    // They are here; now I arrive. Mounted before I am present, so my own
    // entry is a genuine transition rather than something taken as read.
    const view = mount(theirs);

    view.update(enter(theirs, ME));
    expect(view.fire).not.toHaveBeenCalled();

    view.update(stepOut(enter(theirs, ME), ME));
    expect(view.fire).not.toHaveBeenCalled();
    view.unmount();
  });

  it('says nothing about your own step back to nearby', () => {
    // The third way to move, and the same rule. In the app this is doubly
    // covered — declaring yourself nearby ends your presence, so `live` goes
    // null and the hook is handed nothing — but the guard is what states it,
    // and a caller passing a channel it is not present in must not be told
    // about itself.
    const theirs = enter(enter(alone(), THEM), ME);
    const view = mount(theirs);

    view.update(declareNearby(theirs, ME));
    expect(view.fire).not.toHaveBeenCalled();
    view.unmount();
  });

  it('takes the roster it mounted with as read', () => {
    // Walking into a channel with somebody already in it is not the moment
    // they arrived, and a chime then would be reporting the past.
    const view = mount(enter(alone(), THEM));
    expect(view.fire).not.toHaveBeenCalled();
    view.unmount();
  });

  it('does not fire again on a snapshot with the same roster', () => {
    // A channel in use re-renders constantly — a heartbeat, a mute, the floor
    // moving — and every one of those carries the same roster.
    const together = enter(alone(), THEM);
    const view = mount(alone());

    view.update(together);
    expect(view.fire).toHaveBeenCalledTimes(1);

    view.update(reduce(together, { type: 'STILL_HERE', userId: THEM }, NOW + 5));
    view.update(together);
    expect(view.fire).toHaveBeenCalledTimes(1);
    view.unmount();
  });

  describe('only a departure somebody chose', () => {
    it('stays silent when a connection runs out of grace', () => {
      const together = enter(alone(), THEM);
      const view = mount(together);

      view.update(dropped(together, THEM));
      expect(view.fire).not.toHaveBeenCalled();
      view.unmount();
    });

    it('stays silent when the attention window runs out', () => {
      // The fourth exit, and the one a rule written around `waiting` alone
      // gets wrong: an attention expiry clears `waiting` exactly as a tap
      // does, and is distinguished only by leaving `lastPresentAt` alone.
      const together = enter(alone(), THEM);
      const view = mount(together);

      view.update(inattentive(together, THEM));
      expect(view.fire).not.toHaveBeenCalled();
      view.unmount();
    });

    it('rings nearby for somebody stepping back to it, not out', () => {
      // `in→nearby`. It fell until 2026-09-17, on the reading that the rung
      // below the room is outside it — which left the room unable to tell
      // somebody who had gone away from somebody still one ping away. The
      // rung landed on picks the chime.
      const together = enter(alone(), THEM);
      const view = mount(together);

      view.update(declareNearby(together, THEM));
      expect(view.fire.mock.calls).toEqual([nearing]);
      expect(view.fire).not.toHaveBeenCalledWith('out');
      view.unmount();
    });
  });

  describe('only a move that crosses present makes a sound', () => {
    it('says nothing when somebody outside declares themselves nearby', () => {
      // `out→nearby`, and the substantive loss of 2026-09-17. It rang the
      // nearby chime — it was the case that chime was added for — and it is
      // silent now because it is not a change to this room: the people in it
      // are the same people, and interrupting them with news about somebody
      // who is not in it is interrupting them for nothing.
      const together = enter(alone(), THEM);
      const view = mount(together);

      view.update(declareNearby(together, THIRD));
      expect(view.fire).not.toHaveBeenCalled();
      view.unmount();
    });

    it('says nothing when somebody nearby stops being nearby', () => {
      // `nearby→out`, which the rule never has to ask about — and could not
      // answer if it did. `stepOut` clears a declaration identically whether
      // a tap or the attention clock ended it, stamping nothing either way,
      // so the two are the same pair of snapshots.
      const together = enter(alone(), THEM);
      const declaredOut = declareNearby(together, THIRD);
      const view = mount(declaredOut);

      view.update(stepOut(declaredOut, THIRD, NOW + 2_000));
      expect(view.fire).not.toHaveBeenCalled();
      view.unmount();
    });

    it('rings in when somebody nearby steps into the room', () => {
      // `nearby→in`. The rung landed on picks the chime, so arriving is
      // arriving however near they already were — and it must not also ring
      // the departure chime for the declaration it ends.
      const together = enter(alone(), THEM);
      const declaredOut = declareNearby(together, THIRD);
      const view = mount(declaredOut);

      view.update(enter(declaredOut, THIRD, NOW + 2_000));
      expect(view.fire.mock.calls).toEqual([rising]);
      view.unmount();
    });

    it('tells a departure apart from a step back to nearby in one snapshot', () => {
      // Two people moving at once are two events, and one sound each. This is
      // what the per-person loop buys over a pair of flags set by whoever
      // moved.
      const together = enter(enter(alone(), THEM), THIRD);
      const view = mount(together);

      view.update(declareNearby(stepOut(together, THIRD), THEM));
      expect(view.fire.mock.calls).toEqual([falling, nearing]);
      view.unmount();
    });

    it('says nothing when a declaration is restamped in place', () => {
      // Tapping the lit *Nearby* rung renews the wait and rewrites the stamp.
      // A renewal is not an arrival; keying on the value rather than the id
      // would chime every time.
      const together = enter(alone(), THEM);
      const declared = declareNearby(together, THIRD);
      const view = mount(declared);

      view.update(declareNearby(declared, THIRD, NOW + 60_000));
      expect(view.fire).not.toHaveBeenCalled();
      view.unmount();
    });
  });

  /**
   * **One per kind, every kind, in a fixed order.** A tick can carry several
   * moves, and what a room should hear is one sentence about them rather than
   * a copy of each — two departures are still one departure sound, and the
   * count is on the roster for whoever the sound made look.
   */
  describe('several moves in one tick', () => {
    it('makes one sound when two people leave in the same snapshot', () => {
      const together = enter(enter(alone(), THEM), THIRD);
      const view = mount(together);

      view.update(stepOut(stepOut(together, THEM), THIRD));
      expect(view.fire.mock.calls).toEqual([falling]);
      view.unmount();
    });

    it('makes two chimes of two departures and a step back to nearby', () => {
      // The worked example: two `out` and one `nearby` in one tick is two
      // chimes, not three — one per kind, and the `out` is not doubled.
      const together = enter(
        enter(enter(aloneOfFour(), THEM), THIRD),
        FOURTH
      );
      const view = mount(together);

      view.update(
        declareNearby(stepOut(stepOut(together, THIRD), FOURTH), THEM)
      );
      expect(view.fire.mock.calls).toEqual([falling, nearing]);
      view.unmount();
    });

    it('sounds all three kinds in order when a tick carries all three', () => {
      // `in`, then `out`, then `nearby` — fixed rather than incidental, so a
      // busy snapshot is a sentence and not a coin toss.
      const together = enter(enter(aloneOfFour(), THEM), THIRD);
      const view = mount(together);

      view.update(
        declareNearby(enter(stepOut(together, THIRD), FOURTH), THEM)
      );
      expect(view.fire.mock.calls).toEqual([rising, falling, nearing]);
      view.unmount();
    });
  });

  it('makes one sound when two people arrive in the same snapshot', () => {
    // Two copies of the same short tone laid over each other is mud, and the
    // count is on the roster for whoever the sound made look.
    const view = mount(alone());

    view.update(enter(enter(alone(), THEM), THIRD));
    expect(view.fire.mock.calls).toEqual([rising]);
    view.unmount();
  });

  it('makes both sounds when somebody arrives as another leaves', () => {
    const together = enter(alone(), THEM);
    const view = mount(together);

    view.update(enter(stepOut(together, THEM), THIRD));
    expect(view.fire.mock.calls).toEqual([rising, falling]);
    view.unmount();
  });

  it('starts a fresh memory for a different channel', () => {
    const view = mount(enter(alone(), THEM));

    const other = createChannel({
      id: 'sess_2',
      initiator: ME,
      invitees: [THIRD],
      now: NOW,
    });
    view.update(enter(other, THIRD));
    expect(view.fire).not.toHaveBeenCalled();
    view.unmount();
  });

  it('survives a channel going away and coming back', () => {
    const together = enter(alone(), THEM);
    const view = mount(together);

    view.update(null);
    view.update(together);
    expect(view.fire).not.toHaveBeenCalled();
    view.unmount();
  });

  it('does not throw when a snapshot carries no nearby declarations', () => {
    // `declaredNearbyAt` is absent from a server older than 2026-09-08, and a
    // missing field must not take a conversation down.
    // The cast goes through `unknown` because the type says this cannot
    // happen and the wire says it can: an older server simply sends no such
    // key, which is what an installed build meets between its release and the
    // next deploy.
    const withoutNearby = (state: ChannelState) =>
      ({ ...state, declaredNearbyAt: undefined }) as unknown as ChannelState;

    const together = enter(alone(), THEM);
    const view = mount(withoutNearby(together));

    view.update(withoutNearby(enter(together, THIRD)));
    expect(view.fire.mock.calls).toEqual([rising]);
    view.unmount();
  });
});
