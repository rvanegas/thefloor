import React from 'react';
import renderer, { act, type ReactTestRenderer } from 'react-test-renderer';
import { createChannel, reduce } from '../../../../core/channel';
import type { ChannelState } from '../../../../core/types';
import { usePresenceChime } from '../usePresenceChime';

const ME = 'acct_me';
const THEM = 'acct_them';
const THIRD = 'acct_third';
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
 * Rising is an arrival, falling a departure, edging a declaration from outside
 * the room. **Named rather than spelled inline** so that the assertions say
 * which event they mean; the kinds were `true` and `false` until 2026-09-15,
 * and a third of them cannot be a boolean.
 *
 * **The kind is the whole of it.** A peak was a second argument for one day on
 * 2026-09-15, when how loud a chime is was the listener's to choose; the
 * ladder went and the loudness is `CHIME_AMPLITUDE`, which nothing above
 * `chime.ts` passes or can change. See
 * planning/decisions/2026-09-15-the-chime-has-one-loudness-again.md.
 */
const rising = ['in'];
const falling = ['out'];
const edging = ['nearby'];

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

    it('falls for somebody stepping out to nearby, which is a decision', () => {
      const together = enter(alone(), THEM);
      const view = mount(together);

      view.update(declareNearby(together, THEM));
      expect(view.fire.mock.calls).toEqual([falling]);
      view.unmount();
    });
  });

  describe('a declaration from outside is its own event', () => {
    it('edges when somebody declares themselves nearby from outside', () => {
      // They were never in the room, so nothing is leaving `present` — the
      // only signal is the id appearing in `declaredNearbyAt`.
      //
      // It is the `nearby` kind and not `in`, which is the whole of the
      // 2026-09-15 correction: arriving at the edge of a room is not arriving
      // in it, and the two sounded identical until there was a third chime.
      const together = enter(alone(), THEM);
      const view = mount(together);

      view.update(declareNearby(together, THIRD));
      expect(view.fire.mock.calls).toEqual([edging]);
      view.unmount();
    });

    it('does not also ring the arrival chime for a declaration', () => {
      // The regression this file exists to prevent from coming back: one
      // event, one sound. A declaration that fired both would be a room told
      // to expect a voice that cannot speak.
      const together = enter(alone(), THEM);
      const view = mount(together);

      view.update(declareNearby(together, THIRD));
      expect(view.fire).toHaveBeenCalledTimes(1);
      expect(view.fire).not.toHaveBeenCalledWith('in');
      view.unmount();
    });

    it('gives one falling chime and no rising one from inside', () => {
      // Somebody present who taps *Be nearby* is stepping out to the rung
      // below. Their arrival was announced when they stepped in.
      const together = enter(alone(), THEM);
      const view = mount(together);

      view.update(declareNearby(together, THEM));
      expect(view.fire.mock.calls).toEqual([falling]);
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
