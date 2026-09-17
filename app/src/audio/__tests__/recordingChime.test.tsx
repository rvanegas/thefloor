import React from 'react';
import renderer, { act, type ReactTestRenderer } from 'react-test-renderer';
import { createChannel, reduce } from '../../../../core/channel';
import type { ChannelState } from '../../../../core/types';
import { useRecordingChime } from '../useRecordingChime';

const ME = 'acct_me';
const THEM = 'acct_them';
const NOW = 1_700_000_000_000;

/**
 * A recording somebody started says so out loud, and one the channel started
 * by itself does not.
 *
 * Three rules carry this file. **A run is announced once, at its beginning** —
 * pause and resume are the same run and must stay silent, which is why the
 * hook keys on the run id rather than on the status. **Only hand-started runs
 * sound**, the automatic ones being the scope this deliberately leaves alone;
 * see `backlog/two-party-consent-has-not-been-reviewed.md`. And **a run
 * already in progress when you arrive is not a beginning**, on the rule
 * `usePresenceChime` states: announcing it would be reporting the past.
 */

const joined = () => {
  const channel = createChannel({
    id: 'sess_1',
    initiator: ME,
    invitees: [THEM],
    now: NOW,
  });
  return reduce(channel, { type: 'ENTER', userId: THEM }, NOW);
};

const start = (
  channel: ChannelState,
  { automatic = false, runId = 'rec_1', by = ME, at = NOW + 1_000 } = {}
) =>
  reduce(channel, { type: 'START_RECORDING', userId: by, runId, automatic }, at);

const stop = (channel: ChannelState, at = NOW + 5_000) =>
  reduce(channel, { type: 'STOP_RECORDING', userId: ME }, at);

const pause = (channel: ChannelState, at = NOW + 2_000) =>
  reduce(channel, { type: 'PAUSE_RECORDING', userId: ME }, at);

const resume = (channel: ChannelState, at = NOW + 3_000) =>
  reduce(channel, { type: 'RESUME_RECORDING', userId: ME }, at);

function mount(channel: ChannelState | null) {
  const fire = jest.fn();
  function Probe({ state }: { state: ChannelState | null }) {
    useRecordingChime(state, fire);
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

describe('useRecordingChime', () => {
  it('sounds when a run somebody started begins', () => {
    const channel = joined();
    const probe = mount(channel);
    probe.update(start(channel));
    expect(probe.fire.mock.calls).toEqual([['recording']]);
  });

  it('sounds for the person who started it too', () => {
    // The one departure from the presence chimes, and the reason is that this
    // is not feedback: it is the moment both parties were told, and a notice
    // the starter is exempt from is a weaker thing to have given.
    const channel = joined();
    const probe = mount(channel);
    probe.update(start(channel, { by: ME }));
    expect(probe.fire).toHaveBeenCalledWith('recording');
  });

  it('says nothing when the channel starts a run by itself', () => {
    const channel = joined();
    const probe = mount(channel);
    probe.update(start(channel, { automatic: true }));
    expect(probe.fire).not.toHaveBeenCalled();
  });

  it('says nothing on pause or resume, a resumed run being the same run', () => {
    const channel = joined();
    const probe = mount(channel);
    const recording = start(channel);
    probe.update(recording);
    probe.fire.mockClear();

    const paused = pause(recording);
    probe.update(paused);
    probe.update(resume(paused));
    expect(probe.fire).not.toHaveBeenCalled();
  });

  it('sounds again for the next run', () => {
    const channel = joined();
    const probe = mount(channel);
    const first = start(channel);
    probe.update(first);
    probe.fire.mockClear();

    const idle = stop(first);
    probe.update(idle);
    probe.update(start(idle, { runId: 'rec_2', at: NOW + 6_000 }));
    expect(probe.fire.mock.calls).toEqual([['recording']]);
  });

  it('says nothing about a run that was already going when you looked', () => {
    // Walking into a room that is already recording is not the moment it
    // started. The dot and the label are what tell you about that.
    const probe = mount(start(joined()));
    expect(probe.fire).not.toHaveBeenCalled();
  });

  it('says nothing about a run in a channel this device has just changed to', () => {
    const probe = mount(joined());
    const other = reduce(
      createChannel({
        id: 'sess_2',
        initiator: ME,
        invitees: [THEM],
        now: NOW,
      }),
      { type: 'ENTER', userId: THEM },
      NOW
    );
    probe.update(start(other));
    expect(probe.fire).not.toHaveBeenCalled();
  });

  it('forgets the run when this device stops being present anywhere', () => {
    const channel = joined();
    const probe = mount(channel);
    const recording = start(channel);
    probe.update(recording);
    probe.fire.mockClear();

    probe.update(null);
    probe.update(recording);
    expect(probe.fire).not.toHaveBeenCalled();
  });
});
