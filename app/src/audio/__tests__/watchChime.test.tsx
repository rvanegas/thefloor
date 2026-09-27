import React from 'react';
import renderer, { act, type ReactTestRenderer } from 'react-test-renderer';
import { createChannel, reduce } from '../../../../core/channel';
import type { ChannelState } from '../../../../core/types';
import { useWatchChime } from '../useWatchChime';

const ME = 'acct_me';
const THEM = 'acct_them';
const NOW = 1_700_000_000_000;
const URL = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';

/**
 * The film says when it starts and stops, for the ear that cannot see the
 * transport.
 *
 * Three rules carry this file. **Only the edges of a run make a sound** — what
 * the room hears is its own microphones shutting, so a link pasted or a film
 * swapped while nothing is playing is silent. **Every way out of a run is the
 * same sound**, a stop and a film running out both meaning the room has its
 * voices back. And **a film already playing when you arrive is not a
 * beginning**, on the rule the other two chime hooks state: announcing it
 * would be reporting the past.
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

const load = (channel: ChannelState, by = ME, at = NOW + 1_000) =>
  reduce(
    channel,
    { type: 'START_WATCH', userId: by, videoId: 'dQw4w9WgXcQ', url: URL },
    at
  );

const play = (channel: ChannelState, by = ME, at = NOW + 2_000) =>
  reduce(channel, { type: 'WATCH_PLAY', userId: by }, at);

const pause = (channel: ChannelState, by = ME, at = NOW + 3_000) =>
  reduce(channel, { type: 'WATCH_PAUSE', userId: by }, at);

const stop = (channel: ChannelState, by = ME, at = NOW + 4_000) =>
  reduce(channel, { type: 'STOP_WATCH', userId: by }, at);

function mount(channel: ChannelState | null) {
  const fire = jest.fn();
  function Probe({ state }: { state: ChannelState | null }) {
    useWatchChime(state, fire);
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

describe('useWatchChime', () => {
  it('sounds when the film starts playing', () => {
    const loaded = load(joined());
    const probe = mount(loaded);
    probe.update(play(loaded));
    expect(probe.fire.mock.calls).toEqual([['play']]);
  });

  it('sounds the other one when it is paused', () => {
    const playing = play(load(joined()));
    const probe = mount(playing);
    probe.update(pause(playing));
    expect(probe.fire.mock.calls).toEqual([['pause']]);
  });

  /**
   * The one departure from the presence chimes, taken from
   * `useRecordingChime`: the sound is not feedback for whoever pressed the
   * button but the moment at which the room was told, and a notice one party
   * is exempt from is a weaker thing to have given.
   */
  it('sounds for the person who pressed it too', () => {
    const loaded = load(joined(), ME);
    const probe = mount(loaded);
    probe.update(play(loaded, ME));
    expect(probe.fire).toHaveBeenCalledWith('play');
  });

  /**
   * **A film is loaded paused**, and a paused party has taken nothing from
   * anybody: every microphone in the room is still open, so there is nothing
   * for a sound to announce. `startParty` in core/watch.ts is where that
   * default and its reasoning are.
   */
  it('says nothing when a link is merely pasted', () => {
    const channel = joined();
    const probe = mount(channel);
    probe.update(load(channel));
    expect(probe.fire).not.toHaveBeenCalled();
  });

  it('says nothing when a paused party is stopped', () => {
    const loaded = load(joined());
    const probe = mount(loaded);
    probe.update(stop(loaded));
    expect(probe.fire).not.toHaveBeenCalled();
  });

  /**
   * **Stop sounds like a pause, deliberately.** What the chime says is that the
   * room has its voices back, which is equally true of a stop, a pause and a
   * film reaching its end; a listener who cannot see the screen has no use for
   * the difference and would have to be taught a third cue to learn it.
   */
  it('sounds the pause when a running film is stopped outright', () => {
    const playing = play(load(joined()));
    const probe = mount(playing);
    probe.update(stop(playing));
    expect(probe.fire.mock.calls).toEqual([['pause']]);
  });

  it('sounds both ends of a run somebody plays and pauses', () => {
    const loaded = load(joined());
    const probe = mount(loaded);
    const playing = play(loaded);
    probe.update(playing);
    probe.update(pause(playing));
    expect(probe.fire.mock.calls).toEqual([['play'], ['pause']]);
  });

  it('says nothing about a film that was already playing when you looked', () => {
    // Stepping into a room with a film running is not the moment it started.
    // The picture and the transport are what tell you about that.
    const probe = mount(play(load(joined())));
    expect(probe.fire).not.toHaveBeenCalled();
  });

  it('says nothing about a film in a channel this device has just changed to', () => {
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
    probe.update(play(load(other)));
    expect(probe.fire).not.toHaveBeenCalled();
  });

  it('forgets the film when this device stops being present anywhere', () => {
    const loaded = load(joined());
    const probe = mount(loaded);
    const playing = play(loaded);
    probe.update(playing);
    probe.fire.mockClear();

    probe.update(null);
    probe.update(playing);
    expect(probe.fire).not.toHaveBeenCalled();
  });
});
