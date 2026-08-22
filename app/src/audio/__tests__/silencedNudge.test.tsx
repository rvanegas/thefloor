import React from 'react';
import renderer, { act, type ReactTestRenderer } from 'react-test-renderer';
import { createChannel, reduce } from '../../../../core/channel';
import type { ChannelState } from '../../../../core/types';
import { NUDGE_FIRST_MS, NUDGE_LIMIT, NUDGE_REPEAT_MS } from '../nudge';
import { useSilencedNudge } from '../useSilencedNudge';

jest.mock('expo-haptics', () => ({
  notificationAsync: jest.fn(async () => {}),
  NotificationFeedbackType: { Warning: 'warning' },
}));

const ME = 'acct_me';
const THEM = 'acct_them';
const NOW = 1_700_000_000_000;

/**
 * `nudge.test.ts` pins the schedule. This pins that a real caller gets it: the
 * timer is armed, it fires, and it is armed again — which is the half that is
 * pure bookkeeping in the reducer and the half that goes wrong in a component.
 */
function silenced(): ChannelState {
  const base = reduce(
    createChannel({ id: 'sess_1', initiator: ME, invitees: [THEM], now: NOW }),
    { type: 'ENTER', userId: THEM },
    NOW
  );
  return reduce(base, { type: 'CLAIM_FLOOR', userId: THEM }, NOW);
}

function mount(channel: ChannelState | null, speaking: string[], fire: () => void) {
  function Probe() {
    useSilencedNudge(channel, ME, speaking, fire);
    return null;
  }
  let tree: ReactTestRenderer;
  act(() => {
    tree = renderer.create(<Probe />);
  });
  return {
    update(next: ChannelState | null, speakers: string[]) {
      channel = next;
      speaking = speakers;
      act(() => {
        tree.update(<Probe />);
      });
    },
    unmount: () => act(() => tree.unmount()),
  };
}

describe('being told you are talking to nobody', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('buzzes four times while somebody keeps talking, then stops', () => {
    const fire = jest.fn();
    const view = mount(silenced(), [ME], fire);

    act(() => jest.advanceTimersByTime(NUDGE_FIRST_MS));
    expect(fire).toHaveBeenCalledTimes(1);

    act(() => jest.advanceTimersByTime(NUDGE_REPEAT_MS * 10));
    expect(fire).toHaveBeenCalledTimes(NUDGE_LIMIT);

    view.unmount();
  });

  it('never starts for somebody who is silenced and listening', () => {
    const fire = jest.fn();
    const view = mount(silenced(), [THEM], fire);
    act(() => jest.advanceTimersByTime(60_000));
    expect(fire).not.toHaveBeenCalled();
    view.unmount();
  });

  it('drops a pending buzz the moment the floor is released', () => {
    // The gap this closes: a timer armed a moment before the release would
    // otherwise buzz at somebody who can already be heard, which says the
    // opposite of the truth.
    const fire = jest.fn();
    const channel = silenced();
    const view = mount(channel, [ME], fire);

    act(() => jest.advanceTimersByTime(NUDGE_FIRST_MS - 500));
    expect(fire).not.toHaveBeenCalled();

    view.update(
      reduce(channel, { type: 'RELEASE_FLOOR', userId: THEM }, NOW + 1_000),
      [ME]
    );
    act(() => jest.advanceTimersByTime(60_000));
    expect(fire).not.toHaveBeenCalled();

    view.unmount();
  });

  it('arms nothing when there is no channel at all', () => {
    const fire = jest.fn();
    const view = mount(null, [ME], fire);
    act(() => jest.advanceTimersByTime(60_000));
    expect(fire).not.toHaveBeenCalled();
    view.unmount();
  });
});
