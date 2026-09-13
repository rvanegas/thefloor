import React from 'react';
import renderer, { act, type ReactTestRenderer } from 'react-test-renderer';
import { createChannel, reduce } from '../../../../core/channel';
import type { ChannelState } from '../../../../core/types';
import { useSpeakingReport } from '../useSpeakingReport';

const ME = 'acct_me';
const THEM = 'acct_them';
const NOW = 1_700_000_000_000;

const open = (): ChannelState =>
  reduce(
    createChannel({ id: 'sess_1', initiator: ME, invitees: [THEM], now: NOW }),
    { type: 'ENTER', userId: THEM },
    NOW
  );

/** Somebody else holding the floor, which is what withholds me. */
const claimed = (): ChannelState =>
  reduce(open(), { type: 'CLAIM_FLOOR', userId: THEM }, NOW);

function mount(channel: ChannelState | null, speaking: string[]) {
  const report = jest.fn();
  function Probe({
    channel,
    speaking,
  }: {
    channel: ChannelState | null;
    speaking: string[];
  }) {
    useSpeakingReport(channel, ME, speaking, report);
    return null;
  }
  let tree: ReactTestRenderer;
  act(() => {
    tree = renderer.create(<Probe channel={channel} speaking={speaking} />);
  });
  return {
    report,
    update(next: ChannelState | null, speakers: string[]) {
      act(() => {
        tree.update(<Probe channel={next} speaking={speakers} />);
      });
    },
    unmount: () => act(() => tree.unmount()),
  };
}

/**
 * What the room is told about a speaker it has stopped hearing.
 *
 * The hook is four lines; what these pin is the four conditions under which
 * those lines say something, and the one thing that must never put a message
 * on the socket — an ordinary conversation, where the media plane is already
 * saying all of this and saying it better.
 */
describe('reporting speech the room is withholding', () => {
  it('says so when somebody talks into a claim, and again when they stop', () => {
    const view = mount(claimed(), [ME]);
    expect(view.report).toHaveBeenCalledWith('sess_1', true);

    view.report.mockClear();
    view.update(claimed(), []);
    expect(view.report).toHaveBeenCalledWith('sess_1', false);
    view.unmount();
  });

  it('says nothing at all while everybody may be heard', () => {
    // The case that must stay silent: nobody is withheld, so the SFU is
    // reporting this person to every device in the room already, and a second
    // account of it would be traffic for nothing.
    const view = mount(open(), [ME]);
    expect(view.report).not.toHaveBeenCalled();
    view.unmount();
  });

  it('reports nobody but you', () => {
    // The signal is your own microphone. Somebody else talking through the
    // same claim is their device's report to make, and this one knows nothing
    // about it — `audio.speaking` cannot even contain them by then.
    const view = mount(claimed(), [THEM]);
    expect(view.report).not.toHaveBeenCalled();
    view.unmount();
  });

  it('stops when the floor is released mid-word', () => {
    const view = mount(claimed(), [ME]);
    view.report.mockClear();
    view.update(reduce(claimed(), { type: 'RELEASE_FLOOR', userId: THEM }, NOW), [
      ME,
    ]);
    expect(view.report).toHaveBeenCalledWith('sess_1', false);
    view.unmount();
  });

  it('stops when the app goes away mid-word', () => {
    // Not the same as the socket closing, which the server answers for. This
    // is the screen going while the socket lives — walking out of the channel,
    // or the tree unmounting — and it has to withdraw the claim itself.
    const view = mount(claimed(), [ME]);
    view.report.mockClear();
    view.unmount();
    expect(view.report).toHaveBeenCalledWith('sess_1', false);
  });

  it('sends nothing further while a report of its own is still true', () => {
    // A re-render is not an edge. The sender is held in a ref precisely so
    // that the provider rebuilding its context — which it does on every state
    // change — cannot turn one held signal into a stream of them.
    const view = mount(claimed(), [ME]);
    expect(view.report).toHaveBeenCalledTimes(1);
    view.update(claimed(), [ME]);
    view.update(claimed(), [ME]);
    expect(view.report).toHaveBeenCalledTimes(1);
    view.unmount();
  });
});
