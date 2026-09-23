import { DISCONNECT_GRACE_MS, FLOOR_CLAIM_MS } from '../constants';
import { parseYouTubeUrl, watchPositionMs } from '../watch';
import {
  channelHasAudio,
  microphoneNeeded,
} from '../micNeeded';
import {
  canControlPlayback,
  canControlWatch,
  canLoadTrack,
  canPlayWatch,
  canResumeRecording,
  canStartRecording,
  canStartWatch,
  createChannel,
  isPartyMuted,
  isWithheld,
  partyMuteRequested,
  reduce,
} from '../channel';
import type { ChannelAction, ChannelState, PlaybackTrack } from '../types';

const A = 'user-a';
const B = 'user-b';
const T0 = 1_700_000_000_000;

const URL = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
const VIDEO = 'dQw4w9WgXcQ';
const OTHER_URL = 'https://youtu.be/aaaaaaaaaaa';
const OTHER_VIDEO = 'aaaaaaaaaaa';
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
    expect(s.watch.party).toEqual({
      videoId: VIDEO,
      url: URL,
      durationMs: LENGTH,
      title: null,
    });
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

  /**
   * **The second fact a player reports, and it obeys the first one's rule.**
   * Nothing here asks YouTube anything: the embed already holds the name of
   * the video it loaded, and says so in the report it was already making. See
   * `learnTitle`, and decisions/2026-09-20-the-film-says-what-it-is-called.md.
   */
  it('takes its name from the first player that can say', () => {
    const started = reduce(
      joined(),
      { type: 'START_WATCH', userId: A, videoId: VIDEO, url: URL },
      T0
    );
    expect(started.watch.party?.title).toBeNull();
    const named = reduce(
      started,
      { type: 'WATCH_READY', userId: A, durationMs: LENGTH, title: '  A Film  ' },
      T0 + 1_000
    );
    // Trimmed, this being a string from outside.
    expect(named.watch.party?.title).toBe('A Film');
    // And left alone afterwards, exactly as the length is: a second player
    // disagreeing is a disagreement no rule here can settle.
    const again = reduce(
      named,
      { type: 'WATCH_READY', userId: B, durationMs: LENGTH, title: 'Something Else' },
      T0 + 2_000
    );
    expect(again.watch.party?.title).toBe('A Film');
  });

  it('is left unnamed by a player that could not say what it is showing', () => {
    const started = reduce(
      joined(),
      { type: 'START_WATCH', userId: A, videoId: VIDEO, url: URL },
      T0
    );
    // An older build sends no title at all; a player without `getVideoData`
    // sends null; an embed that answers with an empty string has said
    // nothing. None of the three is a name, and none of them is an error.
    for (const title of [undefined, null, '   ']) {
      const s = reduce(
        started,
        { type: 'WATCH_READY', userId: A, durationMs: LENGTH, title },
        T0 + 1_000
      );
      expect(s.watch.party?.title).toBeNull();
      // And the length it did report is kept regardless.
      expect(s.watch.party?.durationMs).toBe(LENGTH);
    }
  });

  /**
   * **A report is still a report, and it is still only for the room.** What
   * it writes is the name under the progress bar and the length the scrubber
   * runs on, on every screen watching — so a member sitting outside the room,
   * who has no player and sends this from nowhere the app can reach, does not
   * get to name somebody else's film. `Picture` mounts on the same `inRoom`.
   */
  it('is refused to a member who is not in the room', () => {
    const out = reduce(watching(), { type: 'STEP_OUT', userId: B }, T0);
    const s = reduce(
      out,
      { type: 'WATCH_READY', userId: B, durationMs: 999_000, title: 'Theirs' },
      T0 + 1_000
    );
    expect(s.watch.party?.durationMs).toBe(LENGTH);
    expect(s.watch.party?.title).toBeNull();
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

  it('cannot be narrowed by a claim, because no claim can be made', () => {
    /*
      **The floor left the transport on 2026-09-18.** It used to be that a
      claim made the video everybody could see answer only one person's
      finger — the bar is inside the embed and cannot be taken off the
      picture, so what the floor actually did was make a visible, pressable
      control do nothing. A film is now a mode that refuses claims outright
      (`canClaimFloor`), so this attempt changes nothing at all.
    */
    const s = reduce(watching(), { type: 'CLAIM_FLOOR', userId: A }, T0);
    expect(s.floor.holder).toBeNull();
    expect(canControlWatch(s, A)).toBe(true);
    expect(canControlWatch(s, B)).toBe(true);
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
    // Stepping out is what refuses somebody now, the floor having left.
    const out = reduce(watching(), { type: 'STEP_OUT', userId: B }, T0);
    const s = reduce(out, { type: 'WATCH_PLAY', userId: B }, T0 + 1_000);
    expect(s.watch.status).toBe('paused');
  });
});

/**
 * Where the line falls for somebody outside the room, which since 2026-09-20
 * is one place for the watch party and two for shared playback. **Every watch
 * control asks presence now** — driving as well as putting something on — so
 * the empty channel is no longer an exception to anything here. Playback keeps
 * the older split, `hasTheRoom` to drive and presence to load, and the
 * divergence is asserted below rather than left to be noticed.
 */
describe('a member who has not stepped in', () => {
  /** Nobody present, a party still loaded, and A outside it. */
  function empty(): ChannelState {
    return apply(watching(), [
      [{ type: 'STEP_OUT', userId: A }, T0 + 1_000],
      [{ type: 'STEP_OUT', userId: B }, T0 + 2_000],
    ]);
  }

  /** A conversation going on, with A outside it. */
  function occupied(): ChannelState {
    return reduce(watching(), { type: 'STEP_OUT', userId: A }, T0 + 1_000);
  }

  describe('while somebody else is in the channel', () => {
    it('may not drive the party', () => {
      const s = occupied();
      expect(canControlWatch(s, A)).toBe(false);
      expect(canStartWatch(s, A)).toBe(false);
    });

    it('is refused by the reducer, not merely greyed', () => {
      const s = reduce(occupied(), { type: 'WATCH_PLAY', userId: A }, T0 + 2_000);
      expect(s.watch.status).toBe('paused');
    });

    it('is refused shared playback on the same terms', () => {
      // The parity the report asked for: whatever the watch party does to
      // somebody standing outside an occupied channel, the media player does
      // too, and neither is stricter than the other here.
      expect(canControlPlayback(occupied(), A)).toBe(false);
      expect(canLoadTrack(occupied(), A)).toBe(false);
    });
  });

  describe('while the channel is empty', () => {
    it('may not drive what is already on either', () => {
      // **The empty channel stopped being an exception on 2026-09-20.** It
      // bought reachability that was not needed: `settleEmpty` pauses the
      // party as the last member leaves, so the film an absent member would
      // be tidying up after has already stopped itself — and stepping into an
      // empty channel interrupts nobody, which is the same premise the
      // exception rested on, read the other way.
      const s = reduce(empty(), { type: 'WATCH_PLAY', userId: A }, T0 + 3_000);
      expect(canControlWatch(empty(), A)).toBe(false);
      expect(s.watch.status).toBe('paused');
    });

    it('may not stop a party somebody left running', () => {
      const s = reduce(empty(), { type: 'STOP_WATCH', userId: A }, T0 + 3_000);
      expect(s.watch.party).not.toBeNull();
    });

    it('gets the transport back by stepping in', () => {
      // Which is the whole cost of the rule above: one tap, on a channel
      // there is nobody in to interrupt.
      const back = reduce(empty(), { type: 'ENTER', userId: A }, T0 + 3_000);
      expect(canControlWatch(back, A)).toBe(true);
      const s = reduce(back, { type: 'STOP_WATCH', userId: A }, T0 + 4_000);
      expect(s.watch.party).toBeNull();
    });

    it('may not put something else on', () => {
      const s = reduce(
        empty(),
        { type: 'START_WATCH', userId: A, videoId: OTHER_VIDEO, url: OTHER_URL },
        T0 + 3_000
      );
      expect(canStartWatch(empty(), A)).toBe(false);
      expect(s.watch.party?.videoId).toBe(VIDEO);
    });

    it('may not start one where there is nothing on at all', () => {
      const idle = apply(joined(), [
        [{ type: 'STEP_OUT', userId: A }, T0 + 1_000],
        [{ type: 'STEP_OUT', userId: B }, T0 + 2_000],
      ]);
      const s = reduce(
        idle,
        { type: 'START_WATCH', userId: A, videoId: VIDEO, url: URL },
        T0 + 3_000
      );
      expect(s.watch.party).toBeNull();
    });

    /*
      `canOpenWatchScreen` used to be asserted here — a member outside an empty
      channel could open a follower page on it, there being no conversation to
      intrude on. The guard went with the page on 2026-09-17: which of your own
      devices shows a film is not a question the channel answers. What is left
      of the split is the two guards above.
    */

    it('is refused the shared track as well, the split having closed', () => {
      // **Driving and loading both say no now**, on the audio player as on
      // the film. The two features were one rule until 2026-09-20, diverged
      // for a few hours when the party moved to presence, and met again when
      // a track turned out to be startable from outside an empty channel —
      // observed on build 261 rather than reasoned about. Neither is tidying:
      // playing a track puts a sound in a room you are not in.
      //
      // Asked of a channel with no film *playing*, since a running film
      // refuses the audio player to everybody and would answer before the
      // rule under test did. Stopped by somebody present, the empty channel's
      // own transport being refused now.
      const quiet = apply(watching(), [
        [{ type: 'STOP_WATCH', userId: A }, T0 + 500],
        [{ type: 'STEP_OUT', userId: A }, T0 + 1_000],
        [{ type: 'STEP_OUT', userId: B }, T0 + 2_000],
      ]);
      expect(canControlPlayback(quiet, A)).toBe(false);
      expect(canLoadTrack(quiet, A)).toBe(false);
      // And the reducer with them, a greyed control being a suggestion on its
      // own. The track was never loaded here, so `PLAY` is the one to ask.
      expect(reduce(quiet, { type: 'PLAY', userId: A }, T0 + 2_500)).toBe(quiet);
      // One tap is the whole cost, the same as the film's.
      const back = reduce(quiet, { type: 'ENTER', userId: A }, T0 + 3_000);
      expect(canControlPlayback(back, A)).toBe(true);
      expect(canLoadTrack(back, A)).toBe(true);
    });

    it('gets starting back by stepping in', () => {
      const s = reduce(empty(), { type: 'ENTER', userId: A }, T0 + 3_000);
      expect(canStartWatch(s, A)).toBe(true);
      // The film is loaded and paused, which since 2026-09-20 refuses
      // nothing on the other card: a track may be lined up beside it.
      expect(canLoadTrack(s, A)).toBe(true);
      const playing = reduce(s, { type: 'WATCH_PLAY', userId: A }, T0 + 3_500);
      expect(canLoadTrack(playing, A)).toBe(false);
    });
  });
});

describe('a channel attends to one thing', () => {
  it('leaves a loaded track alone when a party starts', () => {
    // **Neither replaces the other, since 2026-09-20.** A party starts
    // paused, so nothing is playing over anything, and throwing the track
    // away would discard a choice on the strength of a tap that made no
    // sound. See `watchIsPlaying`.
    const s = apply(joined(), [
      [{ type: 'SET_TRACK', userId: A, track: TRACK }, T0],
      [{ type: 'START_WATCH', userId: A, videoId: VIDEO, url: URL }, T0 + 1_000],
    ]);
    expect(s.playback.track).not.toBeNull();
    expect(s.watch.party?.videoId).toBe(VIDEO);
  });

  it('takes a track while a party sits paused', () => {
    const s = reduce(
      watching(),
      { type: 'SET_TRACK', userId: B, track: TRACK },
      T0 + 1_000
    );
    expect(s.watch.party).not.toBeNull();
    expect(s.playback.track?.id).toBe(TRACK.id);
  });

  it('refuses a track while the film is playing, rather than ending it', () => {
    const playing = reduce(watching(), { type: 'WATCH_PLAY', userId: A }, T0);
    const s = reduce(
      playing,
      { type: 'SET_TRACK', userId: B, track: TRACK },
      T0 + 1_000
    );
    expect(s.watch.status).toBe('playing');
    expect(s.playback.track).toBeNull();
  });

  it('refuses a party over a track that is playing', () => {
    // The mirror, and the whole of the exclusivity as it now stands: two
    // transports, one run between them.
    const s = apply(joined(), [
      [{ type: 'SET_TRACK', userId: A, track: TRACK }, T0],
      [{ type: 'PLAY', userId: A }, T0 + 500],
    ]);
    expect(canStartWatch(s, A)).toBe(false);
    expect(
      reduce(
        s,
        { type: 'START_WATCH', userId: A, videoId: VIDEO, url: URL },
        T0 + 1_000
      ).watch.party
    ).toBeNull();
    // And it comes back the moment the track is paused, rather than needing
    // the track cleared.
    const paused = reduce(s, { type: 'PAUSE', userId: A }, T0 + 2_000);
    expect(canStartWatch(paused, A)).toBe(true);
  });

  it('refuses the film transport while a track is playing', () => {
    // Loaded together, then the track started while the film sits paused:
    // the film's own controls, Stop included, are what goes dead.
    const s = apply(joined(), [
      [{ type: 'START_WATCH', userId: A, videoId: VIDEO, url: URL }, T0],
      [{ type: 'SET_TRACK', userId: A, track: TRACK }, T0 + 500],
      [{ type: 'PLAY', userId: A }, T0 + 1_000],
    ]);
    expect(canControlWatch(s, A)).toBe(false);
    expect(
      reduce(s, { type: 'WATCH_PLAY', userId: A }, T0 + 2_000).watch.status
    ).toBe('paused');
    const paused = reduce(s, { type: 'PAUSE', userId: A }, T0 + 3_000);
    expect(canControlWatch(paused, A)).toBe(true);
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

  /**
   * **The two below describe a state no sequence of actions reaches**, and
   * that is the point of them. A run cannot begin while a party is loaded and
   * a party cannot begin unless the run is `idle`, so the pair is fenced off
   * by two clauses that are both about a film being *loaded*. Relax either
   * one to *playing*, as the two audio guards were relaxed on 2026-09-20, and
   * these are the two doors it opens.
   *
   * So the state is spliced together from two halves that are each a real
   * reducer's output, rather than pressed into existence — which is the only
   * way to write a test for a guard whose job is to still be right after
   * somebody changes the rule standing in front of it.
   */
  const withRun = (base: ChannelState, steps: Array<[ChannelAction, number]>) =>
    ({ ...base, recording: apply(joined(), steps).recording }) as ChannelState;

  it('refuses to play a film beside a run, and nothing else on the transport', () => {
    const s = withRun(watching(), [
      [{ type: 'START_RECORDING', userId: A, runId: 'run1' }, T0],
    ]);
    expect(canPlayWatch(s, A)).toBe(false);
    expect(
      reduce(s, { type: 'WATCH_PLAY', userId: A }, T0 + 1_000).watch.status
    ).toBe('paused');
    // The four ways out stay open for the length of the run. A rule that held
    // all five would trap the channel inside a film it could not put down.
    expect(canControlWatch(s, A)).toBe(true);
    expect(
      reduce(s, { type: 'STOP_WATCH', userId: A }, T0 + 1_000).watch.party
    ).toBeNull();
  });

  it('refuses to resume a run beside a loaded party, as it refuses to start one', () => {
    const s = withRun(watching(), [
      [{ type: 'START_RECORDING', userId: A, runId: 'run1' }, T0],
      [{ type: 'PAUSE_RECORDING', userId: A }, T0 + 1_000],
    ]);
    expect(canResumeRecording(s, A)).toBe(false);
    expect(
      reduce(s, { type: 'RESUME_RECORDING', userId: A }, T0 + 2_000).recording
        .status
    ).toBe('paused');
    // And it comes back with the party, which is the same escape starting one
    // has.
    const stopped = reduce(s, { type: 'STOP_WATCH', userId: A }, T0 + 2_000);
    expect(canResumeRecording(stopped, A)).toBe(true);
  });
});

describe('muting the room', () => {
  const mute = (muted: boolean) =>
    ({ type: 'SET_WATCH_MUTE', userId: A, muted }) as ChannelAction;

  /** Muted and playing, which is the only combination that withholds. */
  const mutedAndPlaying = () =>
    apply(watching(), [
      [mute(true), T0],
      [{ type: 'WATCH_PLAY', userId: A }, T0 + 1_000],
    ]);

  it('withholds everybody, the floor-holder included', () => {
    const s = apply(mutedAndPlaying(), [
      [{ type: 'CLAIM_FLOOR', userId: A }, T0 + 2_000],
    ]);
    // Muting a room is not taking the floor in it: a claim withholds everybody
    // but one and confers control, and this withholds everybody.
    expect(isWithheld(s, A)).toBe(true);
    expect(isWithheld(s, B)).toBe(true);
  });

  it('leaves every microphone and every audio session where they were', () => {
    // **The row that changed on 2026-09-08**, and it changed because the
    // premise was wrong rather than because the cost was reconsidered. Both
    // predicates opened with the withholding clause on the reading that the
    // film was *coming out of another app* — true, and taken to mean another
    // app on the same phone, which would make an exclusive claim silence it.
    // It does not: The Floor carries no video, so the film is on another
    // *device*, and a phone holding the audio system does not touch it.
    //
    // What withholds is unchanged, and it is the whole of the mechanism now:
    // occupants are muted while the video runs, still publishing and still
    // subscribing, which is ordinary self-mute rather than a fourth state.
    const s = mutedAndPlaying();
    expect(isWithheld(s, A)).toBe(true);
    expect(microphoneNeeded(s, A)).toBe(true);
    expect(microphoneNeeded(s, B)).toBe(true);
    expect(channelHasAudio(s, A)).toBe(true);
  });

  it('holds only while the video plays', () => {
    // The whole of the rule: you pause a film to talk about it, and the mute
    // is what makes that possible rather than what stands in its way. Read off
    // the withholding rather than off the microphone, which no longer moves.
    const paused = reduce(watching(), mute(true), T0);
    expect(partyMuteRequested(paused)).toBe(true);
    expect(isPartyMuted(paused)).toBe(false);
    expect(isWithheld(paused, A)).toBe(false);

    const playing = reduce(paused, { type: 'WATCH_PLAY', userId: A }, T0 + 1_000);
    expect(isPartyMuted(playing)).toBe(true);
    expect(isWithheld(playing, A)).toBe(true);
  });

  it('gives every voice back on pause and takes it away again on resume', () => {
    const playing = mutedAndPlaying();
    const paused = reduce(playing, { type: 'WATCH_PAUSE', userId: B }, T0 + 5_000);
    expect(isWithheld(paused, A)).toBe(false);
    expect(isWithheld(paused, B)).toBe(false);
    // The intent survives the pause — this is a room that is muted for a film,
    // not a mute somebody has to set again at every interruption.
    expect(partyMuteRequested(paused)).toBe(true);

    const resumed = reduce(paused, { type: 'WATCH_PLAY', userId: B }, T0 + 9_000);
    expect(isWithheld(resumed, A)).toBe(true);
  });

  it('lifts when the video runs out, with nothing written to do it', () => {
    const s = apply(mutedAndPlaying(), [
      [{ type: 'TICK' }, T0 + 1_000 + LENGTH + 5_000],
    ]);
    // `TICK` pauses a finished video, and the mute is derived from the status
    // rather than stored beside it — so the room can talk about what it just
    // watched without anybody reaching for a control.
    expect(s.watch.status).toBe('paused');
    expect(isPartyMuted(s)).toBe(false);
    expect(partyMuteRequested(s)).toBe(true);
  });

  it('lifts when the channel empties, for the same reason', () => {
    const s = apply(mutedAndPlaying(), [
      [{ type: 'STEP_OUT', userId: A }, T0 + 2_000],
      [{ type: 'STEP_OUT', userId: B }, T0 + 3_000],
    ]);
    // `settleEmpty` pauses the party, and the mute follows it out.
    expect(isPartyMuted(s)).toBe(false);
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

  it('is what a fresh party gets, without anybody asking', () => {
    const s = watching();
    expect(partyMuteRequested(s)).toBe(true);
    // Paused, so the default withholds nothing yet — which is the whole reason
    // it is safe to default to. The first thing it can do is the thing it is
    // for: quiet over a running film.
    expect(s.watch.status).toBe('paused');
    expect(isPartyMuted(s)).toBe(false);
    expect(isWithheld(s, A)).toBe(false);
  });

  it('does not carry an unmute from one party into the next', () => {
    // The direction that carries information. Muted-to-muted would pass
    // whatever `startParty` did, since the default is muted anyway.
    const s = apply(watching(), [
      [mute(false), T0],
      [{ type: 'START_WATCH', userId: A, videoId: 'abcdefghijk', url: URL }, T0 + 1_000],
      [{ type: 'WATCH_PLAY', userId: A }, T0 + 2_000],
    ]);
    expect(partyMuteRequested(s)).toBe(true);
    expect(isPartyMuted(s)).toBe(true);
  });

  it('returns everybody to audible once cleared', () => {
    // **This used to return to the claim's own answer**, a claim being the
    // other thing that could withhold a microphone. No claim can be made
    // while a film is on, so the room's mute is the only rule left in here
    // and clearing it clears everything — which is the simplification the
    // exclusivity bought. See `watchPartyIsOn`.
    const s = apply(watching(), [
      [{ type: 'CLAIM_FLOOR', userId: A }, T0],
      [mute(true), T0 + 1_000],
      [mute(false), T0 + 2_000],
    ]);
    expect(s.floor.holder).toBeNull();
    expect(isWithheld(s, A)).toBe(false);
    expect(isWithheld(s, B)).toBe(false);
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
