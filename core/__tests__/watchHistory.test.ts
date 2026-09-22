import { createChannel, reduce } from '../channel';
import { MAX_WATCH_HISTORY } from '../constants';
import type { ChannelAction, ChannelState } from '../types';

const A = 'user-a';
const B = 'user-b';
const T0 = 1_700_000_000_000;

const URL = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
const VIDEO = 'dQw4w9WgXcQ';
const OTHER_URL = 'https://youtu.be/aaaaaaaaaaa';
const OTHER_VIDEO = 'aaaaaaaaaaa';
const LENGTH = 600_000;

function apply(
  state: ChannelState,
  steps: Array<[ChannelAction, number]>
): ChannelState {
  return steps.reduce((s, [action, at]) => reduce(s, action, at), state);
}

/** A and B in a room, with a party loaded and its length known. */
function watching(now = T0): ChannelState {
  return apply(
    reduce(
      createChannel({ id: 's1', initiator: A, invitees: [B], now }),
      { type: 'ENTER', userId: B },
      now
    ),
    [
      [{ type: 'START_WATCH', userId: A, videoId: VIDEO, url: URL }, now],
      [{ type: 'WATCH_READY', userId: A, durationMs: LENGTH }, now],
    ]
  );
}

describe('what a channel remembers having watched', () => {
  it('keeps nothing until a party ends', () => {
    expect(watching().watch.history).toEqual([]);
  });

  it('banks the film a stop ends, with what it had learnt', () => {
    const s = apply(watching(), [
      [
        {
          type: 'WATCH_READY',
          userId: B,
          durationMs: LENGTH,
          title: 'Casablanca',
        },
        T0,
      ],
      [{ type: 'STOP_WATCH', userId: A }, T0 + 1_000],
    ]);
    expect(s.watch.party).toBeNull();
    expect(s.watch.history).toEqual([
      { videoId: VIDEO, url: URL, durationMs: LENGTH, title: 'Casablanca' },
    ]);
  });

  it('banks the film a swap replaces, newest first', () => {
    const s = reduce(
      watching(),
      { type: 'START_WATCH', userId: A, videoId: OTHER_VIDEO, url: OTHER_URL },
      T0 + 1_000
    );
    expect(s.watch.party?.videoId).toBe(OTHER_VIDEO);
    expect(s.watch.history.map((film) => film.videoId)).toEqual([VIDEO]);
  });

  it('moves a film watched again to the front rather than repeating it', () => {
    const s = apply(watching(), [
      [{ type: 'STOP_WATCH', userId: A }, T0 + 1_000],
      [
        {
          type: 'START_WATCH',
          userId: A,
          videoId: OTHER_VIDEO,
          url: OTHER_URL,
        },
        T0 + 2_000,
      ],
      [{ type: 'STOP_WATCH', userId: A }, T0 + 3_000],
      [{ type: 'START_WATCH', userId: A, videoId: VIDEO, url: URL }, T0 + 4_000],
      [{ type: 'STOP_WATCH', userId: A }, T0 + 5_000],
    ]);
    expect(s.watch.history.map((film) => film.videoId)).toEqual([
      VIDEO,
      OTHER_VIDEO,
    ]);
  });

  // The history may not go backwards on a tap somebody made by accident: a
  // party stopped before any player could name it must not replace what the
  // same video was known as last time. See `rememberFilm`.
  it('does not lose a name to a later run that never learnt one', () => {
    const named = apply(watching(), [
      [
        {
          type: 'WATCH_READY',
          userId: B,
          durationMs: LENGTH,
          title: 'Casablanca',
        },
        T0,
      ],
      [{ type: 'STOP_WATCH', userId: A }, T0 + 1_000],
    ]);
    const again = apply(named, [
      [{ type: 'START_WATCH', userId: A, videoId: VIDEO, url: URL }, T0 + 2_000],
      [{ type: 'STOP_WATCH', userId: A }, T0 + 2_500],
    ]);
    expect(again.watch.history).toEqual([
      { videoId: VIDEO, url: URL, durationMs: LENGTH, title: 'Casablanca' },
    ]);
  });

  it('keeps the most recent and no more', () => {
    let s = reduce(
      createChannel({ id: 's1', initiator: A, invitees: [B], now: T0 }),
      { type: 'ENTER', userId: B },
      T0
    );
    for (let i = 0; i < MAX_WATCH_HISTORY + 3; i += 1) {
      // Eleven characters, which is the whole of what an id is.
      const videoId = `film${String(i).padStart(7, '0')}`;
      s = reduce(
        s,
        {
          type: 'START_WATCH',
          userId: A,
          videoId,
          url: `https://youtu.be/${videoId}`,
        },
        T0 + i * 1_000
      );
    }
    s = reduce(s, { type: 'STOP_WATCH', userId: A }, T0 + 100_000);
    expect(s.watch.history).toHaveLength(MAX_WATCH_HISTORY);
    expect(s.watch.history[0].videoId).toBe('film0000012');
    expect(s.watch.history[MAX_WATCH_HISTORY - 1].videoId).toBe('film0000003');
  });

  // A mute may not outlive the film it was for; the history is the one thing
  // in this state that is not about the run that has ended.
  it('survives a stop that clears everything else', () => {
    const s = apply(watching(), [
      [{ type: 'SET_WATCH_MUTE', userId: A, muted: true }, T0],
      [{ type: 'STOP_WATCH', userId: A }, T0 + 1_000],
    ]);
    expect(s.watch.mutedAll).toBe(false);
    expect(s.watch.status).toBe('idle');
    expect(s.watch.history).toHaveLength(1);
  });

  // The rows are pressed as a paste is: they carry the URL back to
  // `START_WATCH`, which parses it the same way. See `watchAgain` in the app.
  it('hands back a URL that starts the same party again', () => {
    const stopped = reduce(
      watching(),
      { type: 'STOP_WATCH', userId: A },
      T0 + 1_000
    );
    const back = reduce(
      stopped,
      {
        type: 'START_WATCH',
        userId: A,
        videoId: VIDEO,
        url: stopped.watch.history[0].url,
      },
      T0 + 2_000
    );
    expect(back.watch.party?.videoId).toBe(VIDEO);
    expect(back.watch.status).toBe('paused');
    // And the film it replaced was the same one, so the list has not grown.
    expect(back.watch.history).toHaveLength(1);
  });

  // Nobody who cannot start a party can fill the list either, the history
  // being written by the same two branches the guards already cover.
  it('is not written by somebody who may not stop the party', () => {
    const outsider = 'user-c';
    const s = reduce(
      watching(),
      { type: 'STOP_WATCH', userId: outsider },
      T0 + 1_000
    );
    expect(s.watch.party?.videoId).toBe(VIDEO);
    expect(s.watch.history).toEqual([]);
  });
});
