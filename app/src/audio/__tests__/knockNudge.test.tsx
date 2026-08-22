import React from 'react';
import renderer, { act, type ReactTestRenderer } from 'react-test-renderer';
import { createChannel, reduce } from '../../../../core/channel';
import type { ChannelState, Knock } from '../../../../core/types';
import { useKnockNudge } from '../useKnockNudge';

const ME = 'acct_me';
const THEM = 'acct_them';
const NOW = 1_700_000_000_000;

/**
 * A knock is a question addressed to whoever is in the room, and it waits on
 * an answer from a screen the person may not be looking at.
 *
 * Everything worth pinning here is a case where it must *not* fire: the same
 * queue arriving again in the next snapshot, a knock that was already there
 * when this mounted, and one that belongs to a channel you have since walked
 * out of. A cue that fires twice is worse than one that fires late.
 */

const base = () =>
  reduce(
    createChannel({ id: 'sess_1', initiator: ME, invitees: [THEM], now: NOW }),
    { type: 'ENTER', userId: THEM },
    NOW
  );

const knock = (id: string, name = 'Dana'): Knock => ({ id, name, at: NOW });

const withKnocks = (channel: ChannelState, ...ids: string[]): ChannelState =>
  ids.reduce(
    (state, id) => reduce(state, { type: 'KNOCKED', knock: knock(id) }, NOW),
    channel
  );

function mount(channel: ChannelState | null, fire: () => void) {
  function Probe() {
    useKnockNudge(channel, fire);
    return null;
  }
  let tree: ReactTestRenderer;
  act(() => {
    tree = renderer.create(<Probe />);
  });
  return {
    update(next: ChannelState | null) {
      channel = next;
      act(() => {
        tree.update(<Probe />);
      });
    },
    unmount: () => act(() => tree.unmount()),
  };
}

describe('being told somebody is at the door', () => {
  it('buzzes once when a knock arrives', () => {
    const fire = jest.fn();
    const view = mount(base(), fire);
    expect(fire).not.toHaveBeenCalled();

    view.update(withKnocks(base(), 'knock_1'));
    expect(fire).toHaveBeenCalledTimes(1);
    view.unmount();
  });

  it('does not buzz again for the same knock in the next snapshot', () => {
    // A channel in use re-renders constantly — a heartbeat, somebody muting,
    // the floor moving — and every one of those carries the same pending
    // knock. This is the failure that would make the cue unusable.
    const fire = jest.fn();
    const knocked = withKnocks(base(), 'knock_1');
    const view = mount(base(), fire);

    view.update(knocked);
    view.update(reduce(knocked, { type: 'STILL_HERE', userId: ME }, NOW + 1));
    view.update(reduce(knocked, { type: 'CLAIM_FLOOR', userId: ME }, NOW + 2));
    expect(fire).toHaveBeenCalledTimes(1);
    view.unmount();
  });

  it('buzzes per person when two arrive together', () => {
    const fire = jest.fn();
    const view = mount(base(), fire);

    view.update(withKnocks(base(), 'knock_1', 'knock_2'));
    expect(fire).toHaveBeenCalledTimes(2);
    view.unmount();
  });

  it('says nothing about a knock that was already waiting', () => {
    // Walking into a channel with somebody at the door is not the moment they
    // arrived. A cue then would be reporting the past, and the queue is on
    // screen anyway.
    const fire = jest.fn();
    const view = mount(withKnocks(base(), 'knock_1'), fire);
    expect(fire).not.toHaveBeenCalled();
    view.unmount();
  });

  it('starts fresh in a different channel', () => {
    // The memory is per channel, so a knock at the place you have just walked
    // into is announced even if the id happened to repeat, and the queue that
    // channel starts with is taken as read.
    const fire = jest.fn();
    const view = mount(withKnocks(base(), 'knock_1'), fire);

    const elsewhere = { ...base(), id: 'sess_2' };
    view.update(withKnocks(elsewhere, 'knock_1'));
    expect(fire).not.toHaveBeenCalled();

    view.update(withKnocks(elsewhere, 'knock_1', 'knock_2'));
    expect(fire).toHaveBeenCalledTimes(1);
    view.unmount();
  });

  it('stays quiet with no channel at all', () => {
    const fire = jest.fn();
    const view = mount(null, fire);
    expect(fire).not.toHaveBeenCalled();
    view.unmount();
  });
});
