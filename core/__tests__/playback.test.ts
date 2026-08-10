import { FLOOR_CLAIM_MS, PLAYBACK_DEFAULT_VOLUME } from '../constants';
import { playbackPositionMs } from '../playback';
import {
  canControlPlayback,
  createSession,
  reduce,
} from '../session';
import type { PlaybackTrack, SessionAction, SessionState } from '../types';

const A = 'user-a';
const B = 'user-b';
const T0 = 1_700_000_000_000;

const TRACK: PlaybackTrack = {
  id: 'trk1',
  title: 'Something long',
  durationMs: 300_000,
};

function joined(now = T0): SessionState {
  return reduce(
    createSession({ id: 's1', initiator: A, invitee: B, now }),
    { type: 'ENTER', userId: B },
    now
  );
}

function apply(
  state: SessionState,
  steps: Array<[SessionAction, number]>
): SessionState {
  return steps.reduce((s, [action, at]) => reduce(s, action, at), state);
}

function loaded(now = T0): SessionState {
  return reduce(joined(now), { type: 'SET_TRACK', userId: A, track: TRACK }, now);
}

describe('loading a track', () => {
  it('starts paused at the beginning rather than playing', () => {
    const s = loaded();
    expect(s.playback.track).toEqual(TRACK);
    expect(s.playback.status).toBe('paused');
    expect(s.playback.positionMs).toBe(0);
  });

  it('starts below full volume, to play under a conversation', () => {
    expect(loaded().playback.volume).toBe(PLAYBACK_DEFAULT_VOLUME);
    expect(PLAYBACK_DEFAULT_VOLUME).toBeLessThan(1);
  });

  it('keeps the volume the pair already chose when the track is replaced', () => {
    const s = apply(loaded(), [
      [{ type: 'SET_VOLUME', userId: A, volume: 0.2 }, T0 + 1_000],
      [
        { type: 'SET_TRACK', userId: B, track: { ...TRACK, id: 'trk2' } },
        T0 + 2_000,
      ],
    ]);
    expect(s.playback.track?.id).toBe('trk2');
    expect(s.playback.volume).toBe(0.2);
    expect(s.playback.positionMs).toBe(0);
  });

  it('leaves no track behind when cleared', () => {
    const s = reduce(loaded(), { type: 'CLEAR_TRACK', userId: A }, T0 + 1_000);
    expect(s.playback.track).toBeNull();
    expect(s.playback.status).toBe('idle');
  });
});

describe('position', () => {
  it('advances only while playing', () => {
    const s = reduce(loaded(), { type: 'PLAY', userId: A }, T0);
    expect(playbackPositionMs(s.playback, T0 + 5_000)).toBe(5_000);

    const paused = reduce(s, { type: 'PAUSE', userId: A }, T0 + 5_000);
    expect(playbackPositionMs(paused.playback, T0 + 60_000)).toBe(5_000);
  });

  it('accumulates across pauses, excluding the paused time', () => {
    const s = apply(loaded(), [
      [{ type: 'PLAY', userId: A }, T0],
      [{ type: 'PAUSE', userId: A }, T0 + 10_000],
      [{ type: 'PLAY', userId: A }, T0 + 40_000],
    ]);
    expect(playbackPositionMs(s.playback, T0 + 45_000)).toBe(15_000);
  });

  it('is clamped to the track, so a finished track never overruns', () => {
    const s = reduce(loaded(), { type: 'PLAY', userId: A }, T0);
    expect(playbackPositionMs(s.playback, T0 + TRACK.durationMs + 60_000)).toBe(
      TRACK.durationMs
    );
  });

  it('comes to rest at the end on the next tick', () => {
    const s = apply(loaded(), [
      [{ type: 'PLAY', userId: A }, T0],
      [{ type: 'TICK' }, T0 + TRACK.durationMs],
    ]);
    expect(s.playback.status).toBe('paused');
    expect(s.playback.positionMs).toBe(TRACK.durationMs);
  });

  it('plays a finished track again from the beginning', () => {
    const s = apply(loaded(), [
      [{ type: 'PLAY', userId: A }, T0],
      [{ type: 'TICK' }, T0 + TRACK.durationMs],
      [{ type: 'PLAY', userId: B }, T0 + TRACK.durationMs + 1_000],
    ]);
    expect(s.playback.status).toBe('playing');
    expect(playbackPositionMs(s.playback, T0 + TRACK.durationMs + 1_000)).toBe(0);
  });
});

describe('seeking', () => {
  it('keeps playing when it was playing', () => {
    const s = apply(loaded(), [
      [{ type: 'PLAY', userId: A }, T0],
      [{ type: 'SEEK', userId: A, positionMs: 120_000 }, T0 + 5_000],
    ]);
    expect(s.playback.status).toBe('playing');
    expect(playbackPositionMs(s.playback, T0 + 7_000)).toBe(122_000);
  });

  it('stays paused when it was paused', () => {
    const s = reduce(
      loaded(),
      { type: 'SEEK', userId: A, positionMs: 120_000 },
      T0 + 5_000
    );
    expect(s.playback.status).toBe('paused');
    expect(playbackPositionMs(s.playback, T0 + 60_000)).toBe(120_000);
  });

  it('is clamped to the track at both ends', () => {
    const back = reduce(loaded(), { type: 'SEEK', userId: A, positionMs: -5_000 }, T0);
    expect(back.playback.positionMs).toBe(0);

    const past = reduce(
      loaded(),
      { type: 'SEEK', userId: A, positionMs: TRACK.durationMs + 5_000 },
      T0
    );
    expect(past.playback.positionMs).toBe(TRACK.durationMs);
  });
});

describe('volume', () => {
  it('is clamped to 0..1', () => {
    expect(
      reduce(loaded(), { type: 'SET_VOLUME', userId: A, volume: 4 }, T0).playback
        .volume
    ).toBe(1);
    expect(
      reduce(loaded(), { type: 'SET_VOLUME', userId: A, volume: -1 }, T0)
        .playback.volume
    ).toBe(0);
  });

  it('does not disturb the position', () => {
    const s = apply(loaded(), [
      [{ type: 'PLAY', userId: A }, T0],
      [{ type: 'SET_VOLUME', userId: B, volume: 0.1 }, T0 + 5_000],
    ]);
    expect(s.playback.status).toBe('playing');
    expect(playbackPositionMs(s.playback, T0 + 8_000)).toBe(8_000);
  });
});

/**
 * The heart of the feature: a claim is not a pause, it is a transfer of
 * control. These assert both halves — that playback carries on untouched, and
 * that only the holder may touch it.
 */
describe('the floor confers exclusive control, not silence', () => {
  it('leaves playback running through a claim', () => {
    const s = apply(loaded(), [
      [{ type: 'PLAY', userId: A }, T0],
      [{ type: 'CLAIM_FLOOR', userId: A }, T0 + 5_000],
    ]);
    expect(s.playback.status).toBe('playing');
    expect(playbackPositionMs(s.playback, T0 + 9_000)).toBe(9_000);
  });

  it('gives the holder control and denies it to everyone else', () => {
    const s = reduce(loaded(), { type: 'CLAIM_FLOOR', userId: A }, T0 + 1_000);
    expect(canControlPlayback(s, A)).toBe(true);
    expect(canControlPlayback(s, B)).toBe(false);
  });

  it('refuses the silenced party’s actions, not merely the button', () => {
    const s = apply(loaded(), [
      [{ type: 'PLAY', userId: A }, T0],
      [{ type: 'CLAIM_FLOOR', userId: A }, T0 + 1_000],
    ]);
    for (const action of [
      { type: 'PAUSE', userId: B },
      { type: 'SEEK', userId: B, positionMs: 1_000 },
      { type: 'SET_VOLUME', userId: B, volume: 0 },
      { type: 'CLEAR_TRACK', userId: B },
      { type: 'SET_TRACK', userId: B, track: { ...TRACK, id: 'trk2' } },
    ] as SessionAction[]) {
      expect(reduce(s, action, T0 + 2_000)).toBe(s);
    }
  });

  it('lets the holder do all of it', () => {
    const s = apply(loaded(), [
      [{ type: 'PLAY', userId: A }, T0],
      [{ type: 'CLAIM_FLOOR', userId: A }, T0 + 1_000],
      [{ type: 'SEEK', userId: A, positionMs: 60_000 }, T0 + 2_000],
      [{ type: 'SET_VOLUME', userId: A, volume: 0.3 }, T0 + 2_000],
      [{ type: 'PAUSE', userId: A }, T0 + 3_000],
    ]);
    expect(s.playback.status).toBe('paused');
    expect(s.playback.positionMs).toBe(61_000);
    expect(s.playback.volume).toBe(0.3);
  });

  it('leaves both parties in control while the floor is free', () => {
    const s = loaded();
    expect(canControlPlayback(s, A)).toBe(true);
    expect(canControlPlayback(s, B)).toBe(true);
  });

  it('returns control to both when the claim is released', () => {
    const s = apply(loaded(), [
      [{ type: 'CLAIM_FLOOR', userId: A }, T0 + 1_000],
      [{ type: 'RELEASE_FLOOR', userId: A }, T0 + 2_000],
    ]);
    expect(canControlPlayback(s, B)).toBe(true);
  });

  it('returns control to both when the claim runs out', () => {
    const s = apply(loaded(), [
      [{ type: 'CLAIM_FLOOR', userId: A }, T0 + 1_000],
      [{ type: 'TICK' }, T0 + 1_000 + FLOOR_CLAIM_MS],
    ]);
    expect(s.floor.holder).toBeNull();
    expect(canControlPlayback(s, B)).toBe(true);
  });

  it('returns control to the other party when the holder leaves', () => {
    const s = apply(loaded(), [
      [{ type: 'CLAIM_FLOOR', userId: A }, T0 + 1_000],
      [{ type: 'LEAVE', userId: A }, T0 + 2_000],
    ]);
    expect(s.floor.holder).toBeNull();
    expect(canControlPlayback(s, B)).toBe(true);
    // Gone, so not in control of anything — this is the presence half of the
    // guard rather than the floor half.
    expect(canControlPlayback(s, A)).toBe(false);
  });
});

describe('playback and the session lifecycle', () => {
  it('is refused to someone who is not present', () => {
    const alone = reduce(
      createSession({ id: 's1', initiator: A, invitee: B, now: T0 }),
      { type: 'SET_TRACK', userId: A, track: TRACK },
      T0
    );
    expect(canControlPlayback(alone, B)).toBe(false);
    expect(reduce(alone, { type: 'PLAY', userId: B }, T0 + 1_000)).toBe(alone);
  });

  it('comes to rest when the session ends, keeping the position reached', () => {
    const s = apply(loaded(), [
      [{ type: 'PLAY', userId: A }, T0],
      [{ type: 'END', userId: B }, T0 + 30_000],
    ]);
    expect(s.playback.status).toBe('paused');
    expect(s.playback.positionMs).toBe(30_000);
    expect(s.playback.track).toEqual(TRACK);
  });

  it('reports a failure without losing where the pair had got to', () => {
    const s = apply(loaded(), [
      [{ type: 'PLAY', userId: A }, T0],
      [{ type: 'PLAYBACK_FAILED', reason: 'Decoder died.' }, T0 + 12_000],
    ]);
    expect(s.playback.status).toBe('paused');
    expect(s.playback.positionMs).toBe(12_000);
    expect(s.playback.failure).toBe('Decoder died.');
  });

  it('clears a stale failure when playback starts again', () => {
    const s = apply(loaded(), [
      [{ type: 'PLAY', userId: A }, T0],
      [{ type: 'PLAYBACK_FAILED', reason: 'Decoder died.' }, T0 + 1_000],
      [{ type: 'PLAY', userId: A }, T0 + 2_000],
    ]);
    expect(s.playback.failure).toBeNull();
  });
});
