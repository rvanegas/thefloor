import { DISCONNECT_GRACE_MS, FLOOR_CLAIM_MS } from '../constants';
import { parseYouTubeUrl, watchPositionMs } from '../watch';
import { anyMicrophoneOpen, microphoneNeeded } from '../micNeeded';
import {
  canControlWatch,
  canStartRecording,
  canStartWatch,
  createChannel,
  isPartyMuted,
  isWithheld,
  reduce,
} from '../channel';
import type { ChannelAction, ChannelState, PlaybackTrack } from '../types';

const A = 'user-a';
const B = 'user-b';
const T0 = 1_700_000_000_000;

const URL = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
const VIDEO = 'dQw4w9WgXcQ';
const LENGTH = 600_000;

const TRACK: PlaybackTrack = {
  id: 'trk1',
  title: 'Something long',
  durationMs: 300_000,
};

function joined(now = T0): ChannelState {
  return reduce(
    createChannel({ id: 's1', initiator: A, invitees: [B], now }),
    { type: 'ENTER', userId: B },
    now
  );
}

function apply(
  state: ChannelState,
  steps: Array<[ChannelAction, number]>
): ChannelState {
  return steps.reduce((s, [action, at]) => reduce(s, action, at), state);
}

/** A party loaded by A, with its length reported as a follower's would be. */
function watching(now = T0): ChannelState {
  return apply(joined(now), [
    [{ type: 'START_WATCH', userId: A, videoId: VIDEO, url: URL }, now],
    [{ type: 'WATCH_READY', userId: A, durationMs: LENGTH }, now],
  ]);
}

describe('parsing a pasted link', () => {
  it.each([
    ['https://www.youtube.com/watch?v=dQw4w9WgXcQ'],
    ['http://youtube.com/watch?v=dQw4w9WgXcQ'],
    ['youtube.com/watch?v=dQw4w9WgXcQ'],
    ['https://m.youtube.com/watch?v=dQw4w9WgXcQ'],
    ['https://www.youtube.com/watch?list=PL123&v=dQw4w9WgXcQ&index=2'],
    ['https://youtu.be/dQw4w9WgXcQ'],
    ['https://youtu.be/dQw4w9WgXcQ?t=42'],
    ['https://www.youtube.com/shorts/dQw4w9WgXcQ'],
    ['https://www.youtube.com/live/dQw4w9WgXcQ'],
    ['https://www.youtube.com/embed/dQw4w9WgXcQ?rel=0'],
    ['  https://youtu.be/dQw4w9WgXcQ  '],
  ])('takes the id out of %s', (url) => {
    expect(parseYouTubeUrl(url)).toEqual({ videoId: VIDEO });
  });

  it.each([
    [''],
    ['not a link at all'],
    ['https://vimeo.com/123456'],
    // The shape is right and the id is not — refused here rather than by a
    // player on somebody else's screen five seconds later.
    ['https://www.youtube.com/watch?v=short'],
    ['https://youtu.be/way-too-long-to-be-an-id'],
    // A hostname that merely ends in the real one.
    ['https://youtube.com.evil.example/watch?v=dQw4w9WgXcQ'],
  ])('refuses %s', (url) => {
    expect(parseYouTubeUrl(url)).toBeNull();
  });
});

describe('starting a party', () => {
  it('starts paused at the beginning rather than playing', () => {
    const s = watching();
    expect(s.watch.party).toEqual({ videoId: VIDEO, url: URL, durationMs: LENGTH });
    expect(s.watch.status).toBe('paused');
    expect(s.watch.positionMs).toBe(0);
  });

  it('keeps the URL exactly as it was given', () => {
    const pasted = 'https://youtu.be/dQw4w9WgXcQ?t=42';
    const s = reduce(
      joined(),
      { type: 'START_WATCH', userId: A, videoId: VIDEO, url: pasted },
      T0
    );
    expect(s.watch.party?.url).toBe(pasted);
  });

  it('learns its length from the first follower and then leaves it alone', () => {
    const s = reduce(
      watching(),
      { type: 'WATCH_READY', userId: B, durationMs: 999_000 },
      T0 + 1_000
    );
    expect(s.watch.party?.durationMs).toBe(LENGTH);
  });

  it('ignores a duration nobody could have measured', () => {
    const s = reduce(
      joined(),
      { type: 'START_WATCH', userId: A, videoId: VIDEO, url: URL },
      T0
    );
    expect(
      reduce(s, { type: 'WATCH_READY', userId: A, durationMs: 0 }, T0).watch
        .party?.durationMs
    ).toBeNull();
  });
});

describe('the transport', () => {
  it('derives the position from elapsed wall clock while playing', () => {
    const s = reduce(watching(), { type: 'WATCH_PLAY', userId: A }, T0);
    expect(watchPositionMs(s.watch, T0 + 30_000)).toBe(30_000);
  });

  it('banks the position on pause and does not move after it', () => {
    const s = apply(watching(), [
      [{ type: 'WATCH_PLAY', userId: A }, T0],
      [{ type: 'WATCH_PAUSE', userId: A }, T0 + 30_000],
    ]);
    expect(s.watch.positionMs).toBe(30_000);
    expect(watchPositionMs(s.watch, T0 + 90_000)).toBe(30_000);
  });

  it('seeks without stopping a video that was running', () => {
    const s = apply(watching(), [
      [{ type: 'WATCH_PLAY', userId: A }, T0],
      [{ type: 'WATCH_SEEK', userId: B, positionMs: 120_000 }, T0 + 5_000],
    ]);
    expect(s.watch.status).toBe('playing');
    expect(watchPositionMs(s.watch, T0 + 6_000)).toBe(121_000);
  });

  it('clamps a seek to the video, once its length is known', () => {
    const s = reduce(
      watching(),
      { type: 'WATCH_SEEK', userId: A, positionMs: LENGTH * 2 },
      T0
    );
    expect(s.watch.positionMs).toBe(LENGTH);
    expect(
      reduce(s, { type: 'WATCH_SEEK', userId: A, positionMs: -5_000 }, T0).watch
        .positionMs
    ).toBe(0);
  });

  it('comes to rest at the end on the next tick', () => {
    const s = apply(watching(), [
      [{ type: 'WATCH_PLAY', userId: A }, T0],
      [{ type: 'TICK' }, T0 + LENGTH + 5_000],
    ]);
    expect(s.watch.status).toBe('paused');
    expect(s.watch.positionMs).toBe(LENGTH);
  });

  it('runs on past any tick while nobody has said how long it is', () => {
    const s = apply(joined(), [
      [{ type: 'START_WATCH', userId: A, videoId: VIDEO, url: URL }, T0],
      [{ type: 'WATCH_PLAY', userId: A }, T0],
      [{ type: 'TICK' }, T0 + 10 * 60 * 60 * 1000],
    ]);
    expect(s.watch.status).toBe('playing');
  });

  it('plays a finished video again from the beginning', () => {
    const s = apply(watching(), [
      [{ type: 'WATCH_SEEK', userId: A, positionMs: LENGTH }, T0],
      [{ type: 'WATCH_PLAY', userId: A }, T0 + 1_000],
    ]);
    expect(s.watch.positionMs).toBe(0);
  });

  it('stops back to nothing, so the card offers a new link', () => {
    const s = reduce(watching(), { type: 'STOP_WATCH', userId: B }, T0 + 1_000);
    expect(s.watch.party).toBeNull();
    expect(s.watch.status).toBe('idle');
  });

  it('comes to rest where it got to when it fails', () => {
    const s = apply(watching(), [
      [{ type: 'WATCH_PLAY', userId: A }, T0],
      [{ type: 'WATCH_FAILED', reason: 'Embedding is disabled.' }, T0 + 20_000],
    ]);
    expect(s.watch.status).toBe('paused');
    expect(s.watch.positionMs).toBe(20_000);
    expect(s.watch.failure).toBe('Embedding is disabled.');
  });
});

describe('who may drive it', () => {
  it('is anybody in the room while nobody holds the floor', () => {
    const s = watching();
    expect(canControlWatch(s, A)).toBe(true);
    expect(canControlWatch(s, B)).toBe(true);
  });

  it('is the floor-holder alone while a claim is live', () => {
    const s = reduce(watching(), { type: 'CLAIM_FLOOR', userId: A }, T0);
    expect(canControlWatch(s, A)).toBe(true);
    expect(canControlWatch(s, B)).toBe(false);
  });

  it('does not pause the video — a claim confers control, not silence', () => {
    const s = apply(watching(), [
      [{ type: 'WATCH_PLAY', userId: A }, T0],
      [{ type: 'CLAIM_FLOOR', userId: B }, T0 + 5_000],
    ]);
    expect(s.watch.status).toBe('playing');
    expect(watchPositionMs(s.watch, T0 + 10_000)).toBe(10_000);
  });

  it('returns to everybody the moment the claim runs out', () => {
    const s = apply(watching(), [
      [{ type: 'CLAIM_FLOOR', userId: A }, T0],
      [{ type: 'TICK' }, T0 + FLOOR_CLAIM_MS + 1],
    ]);
    expect(canControlWatch(s, B)).toBe(true);
  });

  it('refuses somebody who has stepped out', () => {
    const s = reduce(watching(), { type: 'STEP_OUT', userId: B }, T0 + 1_000);
    expect(canControlWatch(s, B)).toBe(false);
  });

  it('ignores an action from somebody the guard refuses', () => {
    const claimed = reduce(watching(), { type: 'CLAIM_FLOOR', userId: A }, T0);
    const s = reduce(claimed, { type: 'WATCH_PLAY', userId: B }, T0 + 1_000);
    expect(s.watch.status).toBe('paused');
  });
});

describe('a channel attends to one thing', () => {
  it('clears the loaded track when a party starts', () => {
    const s = apply(joined(), [
      [{ type: 'SET_TRACK', userId: A, track: TRACK }, T0],
      [{ type: 'START_WATCH', userId: A, videoId: VIDEO, url: URL }, T0 + 1_000],
    ]);
    expect(s.playback.track).toBeNull();
    expect(s.playback.status).toBe('idle');
    expect(s.watch.party?.videoId).toBe(VIDEO);
  });

  it('ends the party when a track is loaded', () => {
    const s = reduce(
      watching(),
      { type: 'SET_TRACK', userId: B, track: TRACK },
      T0 + 1_000
    );
    expect(s.watch.party).toBeNull();
    expect(s.playback.track).toEqual(TRACK);
  });

  it('refuses a party while a recording is running', () => {
    const s = reduce(
      joined(),
      { type: 'START_RECORDING', userId: A, runId: 'run1' },
      T0
    );
    expect(canStartWatch(s, A)).toBe(false);
    expect(
      reduce(s, { type: 'START_WATCH', userId: A, videoId: VIDEO, url: URL }, T0)
        .watch.party
    ).toBeNull();
  });

  it('refuses a recording while a party is loaded', () => {
    const s = watching();
    expect(canStartRecording(s, A)).toBe(false);
    expect(
      reduce(s, { type: 'START_RECORDING', userId: A, runId: 'run1' }, T0)
        .recording.status
    ).toBe('idle');
  });

  it('lets a recording start again once the party is stopped', () => {
    const s = reduce(watching(), { type: 'STOP_WATCH', userId: A }, T0 + 1_000);
    expect(canStartRecording(s, A)).toBe(true);
  });
});

describe('muting the room', () => {
  const mute = (muted: boolean) =>
    ({ type: 'SET_WATCH_MUTE', userId: A, muted }) as ChannelAction;

  it('withholds everybody, the floor-holder included', () => {
    const s = apply(watching(), [
      [{ type: 'CLAIM_FLOOR', userId: A }, T0],
      [mute(true), T0 + 1_000],
    ]);
    // Muting a room is not taking the floor in it: a claim withholds everybody
    // but one and confers control, and this withholds everybody.
    expect(isWithheld(s, A)).toBe(true);
    expect(isWithheld(s, B)).toBe(true);
  });

  it('closes every microphone in the room', () => {
    const s = reduce(watching(), mute(true), T0);
    expect(microphoneNeeded(s, A)).toBe(false);
    expect(microphoneNeeded(s, B)).toBe(false);
    // Which takes every audio session out of its call configuration for the
    // length of the film, and falls out rather than being arranged.
    expect(anyMicrophoneOpen(s)).toBe(false);
  });

  it('leaves each person their own mute, and gives it back unchanged', () => {
    const muted = apply(watching(), [
      [{ type: 'SET_SELF_MUTE', userId: B, muted: true }, T0],
      [mute(true), T0 + 1_000],
    ]);
    // Set while the room is muted, and still set after it is cleared. The two
    // are different states and this is the difference.
    expect(muted.selfMuted[B]).toBe(true);
    expect(muted.selfMuted[A]).toBe(false);

    const cleared = reduce(muted, mute(false), T0 + 2_000);
    expect(cleared.selfMuted[B]).toBe(true);
    expect(cleared.selfMuted[A]).toBe(false);
    expect(isWithheld(cleared, A)).toBe(false);
  });

  it('does not mute anybody individually on the way in', () => {
    const s = reduce(watching(), mute(true), T0);
    // The temptation is to implement this as muting everyone; the reason not
    // to is that unmuting could then never restore what people had chosen.
    expect(Object.values(s.selfMuted).every((m) => m === false)).toBe(true);
  });

  it('is the floor-holders alone while a claim is live', () => {
    const claimed = reduce(watching(), { type: 'CLAIM_FLOOR', userId: A }, T0);
    const s = reduce(claimed, { type: 'SET_WATCH_MUTE', userId: B, muted: true }, T0 + 1);
    expect(isPartyMuted(s)).toBe(false);
  });

  it('cannot be set without a party to be muted for', () => {
    const s = reduce(joined(), mute(true), T0);
    expect(isPartyMuted(s)).toBe(false);
  });

  it('ends with the party rather than outliving it', () => {
    const s = apply(watching(), [
      [mute(true), T0],
      [{ type: 'STOP_WATCH', userId: A }, T0 + 1_000],
    ]);
    expect(isPartyMuted(s)).toBe(false);
    expect(isWithheld(s, A)).toBe(false);
  });

  it('does not carry from one party into the next', () => {
    const s = apply(watching(), [
      [mute(true), T0],
      [{ type: 'START_WATCH', userId: A, videoId: 'abcdefghijk', url: URL }, T0 + 1_000],
    ]);
    expect(isPartyMuted(s)).toBe(false);
  });

  it('leaves the floor rule alone once cleared', () => {
    const s = apply(watching(), [
      [{ type: 'CLAIM_FLOOR', userId: A }, T0],
      [mute(true), T0 + 1_000],
      [mute(false), T0 + 2_000],
    ]);
    // Back to the claim's own answer, rather than to everybody audible.
    expect(isWithheld(s, A)).toBe(false);
    expect(isWithheld(s, B)).toBe(true);
  });
});

describe('an empty channel', () => {
  it('pauses a playing party when the last person steps out', () => {
    const s = apply(watching(), [
      [{ type: 'WATCH_PLAY', userId: A }, T0],
      [{ type: 'STEP_OUT', userId: A }, T0 + 10_000],
      [{ type: 'STEP_OUT', userId: B }, T0 + 20_000],
    ]);
    expect(s.watch.status).toBe('paused');
    expect(s.watch.positionMs).toBe(20_000);
  });

  it('pauses it when the last connection runs out of grace, too', () => {
    const s = apply(watching(), [
      [{ type: 'WATCH_PLAY', userId: A }, T0],
      [{ type: 'STEP_OUT', userId: B }, T0 + 1_000],
      [{ type: 'DISCONNECTED', userId: A }, T0 + 2_000],
      [{ type: 'TICK' }, T0 + 2_000 + DISCONNECT_GRACE_MS + 1],
    ]);
    expect(s.watch.status).toBe('paused');
  });

  it('leaves it where it was for whoever comes back', () => {
    const emptied = apply(watching(), [
      [{ type: 'WATCH_PLAY', userId: A }, T0],
      [{ type: 'STEP_OUT', userId: A }, T0 + 10_000],
      [{ type: 'STEP_OUT', userId: B }, T0 + 20_000],
    ]);
    const back = reduce(emptied, { type: 'ENTER', userId: A }, T0 + 60_000);
    expect(back.watch.status).toBe('paused');
    expect(back.watch.positionMs).toBe(20_000);
  });

  it('comes to rest rather than vanishing when the channel ends', () => {
    const s = apply(watching(), [
      [{ type: 'WATCH_PLAY', userId: A }, T0],
      [{ type: 'LEAVE_CHANNEL', userId: B }, T0 + 5_000],
      [{ type: 'DELETE_CHANNEL', userId: A }, T0 + 10_000],
    ]);
    expect(s.status).toBe('ended');
    expect(s.watch.party?.videoId).toBe(VIDEO);
    expect(s.watch.status).toBe('paused');
    expect(s.watch.positionMs).toBe(10_000);
  });
});
