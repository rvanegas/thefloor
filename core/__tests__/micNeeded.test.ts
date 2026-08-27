import { createChannel, reduce } from '../channel';
import type { ChannelState } from '../types';
import {
  anyMicrophoneOpen,
  channelHasAudio,
  microphoneNeeded,
} from '../micNeeded';

/**
 * When the microphone is worth holding open.
 *
 * The cost of getting this wrong is asymmetric. Held open needlessly, a
 * Bluetooth speaker sits on the mono hands-free profile and other apps go
 * silent — annoying, and visible. Closed when it was needed, a recording
 * captures nothing and says nothing, which is the one this is tested for.
 */

const ME = 'user-me';
const THEM = 'user-them';
const T0 = 1_700_000_000_000;

const alone = () =>
  createChannel({ id: 'c1', initiator: ME, invitees: [THEM], now: T0 });

const together = () =>
  reduce(alone(), { type: 'ENTER', userId: THEM }, T0 + 1_000);

const recording = (state: ChannelState) =>
  reduce(
    state,
    { type: 'START_RECORDING', userId: ME, runId: 'run_1' },
    T0 + 2_000
  );

describe('whether the microphone is needed', () => {
  it('is not, alone in a channel with nothing running', () => {
    expect(microphoneNeeded(alone(), ME)).toBe(false);
  });

  it('is, the moment somebody else is present', () => {
    expect(microphoneNeeded(together(), ME)).toBe(true);
  });

  it('is while recording alone, which is a thing one may do', () => {
    // The failure this exists for: a rule written as "alone means closed"
    // records silence and reports success.
    const s = recording(alone());
    expect(s.present).toEqual([ME]);
    expect(microphoneNeeded(s, ME)).toBe(true);
  });

  it('is while a solo recording is merely paused, not stopped', () => {
    // Paused is still a run — resuming must not have to wait for the audio
    // session to be retaken.
    const s = reduce(
      recording(alone()),
      { type: 'PAUSE_RECORDING', userId: ME },
      T0 + 3_000
    );
    expect(microphoneNeeded(s, ME)).toBe(true);
  });

  it('is not once a solo recording has stopped', () => {
    const s = reduce(
      recording(alone()),
      { type: 'STOP_RECORDING', userId: ME },
      T0 + 4_000
    );
    expect(microphoneNeeded(s, ME)).toBe(false);
  });

  it('is when others are there even if you have stepped out yourself', () => {
    // Not a state this app reaches — it only asks about a channel you are
    // present in — but the predicate should not depend on that.
    const s = reduce(together(), { type: 'STEP_OUT', userId: ME }, T0 + 5_000);
    expect(microphoneNeeded(s, ME)).toBe(true);
  });
});

/**
 * Every row of the decision table in planning/STATES.md, because the rule's
 * whole claim is about which rows it moves and a test covering only those
 * would not catch it quietly moving another.
 *
 * Rewritten 2026-08-27 from `anyMicrophoneOpen`, whose claim was *nobody is
 * capturing, so somebody wants stereo*. The only claimant on that stereo that
 * survived examination is another app, so the question became whether this app
 * has any audio at all — which moves two rows and leaves the rest where they
 * were.
 */

const mute = (state: ChannelState, who: string) =>
  reduce(state, { type: 'SET_SELF_MUTE', userId: who, muted: true }, T0 + 6_000);

const loadTrack = (state: ChannelState) =>
  reduce(
    state,
    {
      type: 'SET_TRACK',
      userId: ME,
      track: { id: 'trk_1', title: 'A file', durationMs: 60_000 },
    },
    T0 + 5_000
  );

describe('whether this app has any audio', () => {
  it('has none, alone and unmuted with nothing running', () => {
    // The row the whole configuration exists for: somebody sitting alone in a
    // channel listening to music in another app, which is the one claimant on
    // the audio system worth handing it back to.
    const s = alone();
    expect(s.selfMuted[ME]).toBe(false);
    expect(channelHasAudio(s, ME)).toBe(false);
  });

  it('has, alone and recording', () => {
    expect(channelHasAudio(recording(alone()), ME)).toBe(true);
  });

  it('has, with somebody else present and nobody muted', () => {
    expect(channelHasAudio(together(), ME)).toBe(true);
  });

  it('has, when I am muted and the other party is not', () => {
    // The 2026-08-19 route loss, which stays fixed by a shorter argument than
    // the one that fixed it: self-mute is not consulted at all, so there is
    // nothing here for a category write to cross.
    const s = mute(together(), ME);
    expect(s.selfMuted[ME]).toBe(true);
    expect(channelHasAudio(s, ME)).toBe(true);
  });

  it('has, once everybody present is muted — the row that changed', () => {
    // `anyMicrophoneOpen` said no here, and handed the route back. A muted
    // room is a live room that happens to be quiet: every mute is unilateral
    // and instant, so the handover would land on the first syllable of
    // whoever unmutes.
    const s = mute(mute(together(), ME), THEM);
    expect(channelHasAudio(s, ME)).toBe(true);
  });

  it('has none once the other party steps out, muted or not', () => {
    // Presence is the gate, unchanged: an empty room is an empty room.
    const s = reduce(together(), { type: 'STEP_OUT', userId: THEM }, T0 + 8_000);
    expect(s.present).toEqual([ME]);
    expect(channelHasAudio(s, ME)).toBe(false);
  });

  it('has, alone with a track loaded — the other row that changed', () => {
    // Shared playback is this app making sound, so it takes the session even
    // with nobody there to hear it with. Mono, and deliberately: playback is
    // not trying to be a media player, and its quality should not depend on
    // whether somebody is talking over it.
    //
    // **From the load rather than from the play**, which is what `setTrack`
    // leaving the status `paused` buys: the session is already a call before
    // anything is published, so the category is not written at the moment the
    // track arrives and the engine starts. That collision is what build 90 was
    // about.
    const s = loadTrack(alone());
    expect(s.playback.status).toBe('paused');
    expect(channelHasAudio(s, ME)).toBe(true);
  });

  it('has none with a track that has come to rest', () => {
    // `idle` covers both a track never started and one that has finished, and
    // the music somebody had on comes back at that edge.
    const s = alone();
    expect(s.playback.status).toBe('idle');
    expect(channelHasAudio(s, ME)).toBe(false);
  });
});

/**
 * The default rule, unchanged, and the one an install that has never opened
 * Settings uses. `AppValue.steadyHeadset` picks between this and
 * `channelHasAudio` above; both are live, so both are tested here rather than
 * one being kept as history.
 *
 * Every row of the decision table in planning/STATES.md, because the rule's
 * whole claim is that it moves exactly one of them — self-muted while somebody
 * else is still talking. A test covering only the row that changed would not
 * catch the rule quietly moving another.
 */


describe('whether anybody present has an open microphone', () => {
  it('is not, alone and unmuted with nothing running', () => {
    // The row a literal reading of "everybody present is muted" gets wrong: it
    // is false here, which would take the session as a call and silence the
    // music somebody is sitting alone listening to.
    const s = alone();
    expect(s.selfMuted[ME]).toBe(false);
    expect(anyMicrophoneOpen(s)).toBe(false);
  });

  it('is, alone and recording', () => {
    expect(anyMicrophoneOpen(recording(alone()))).toBe(true);
  });

  it('is, with somebody else present and nobody muted', () => {
    expect(anyMicrophoneOpen(together())).toBe(true);
  });

  it('is, when I am muted and the other party is not', () => {
    // The one row that changes, and the bug it exists for: keyed on our own
    // microphone this was false, which handed the session back to `playback`
    // mid-conversation and lost a tester's Bluetooth route to the profile
    // switch. Somebody is still talking, so the session is still a call.
    const s = mute(together(), ME);
    expect(s.selfMuted[ME]).toBe(true);
    expect(anyMicrophoneOpen(s)).toBe(true);
  });

  it('is not, once everybody present is muted', () => {
    // Nobody is talking, so the only audio that matters is the channel's own
    // playback or another app's — both of which want the stereo profile.
    const s = mute(mute(together(), ME), THEM);
    expect(anyMicrophoneOpen(s)).toBe(false);
  });

  it('is again the moment one of them unmutes', () => {
    const quiet = mute(mute(together(), ME), THEM);
    const s = reduce(
      quiet,
      { type: 'SET_SELF_MUTE', userId: THEM, muted: false },
      T0 + 7_000
    );
    expect(anyMicrophoneOpen(s)).toBe(true);
  });

  it('ignores somebody who has stepped out', () => {
    // Presence is the gate: a departed participant cannot hold the channel in
    // a call on the strength of having been unmuted when they left.
    const s = reduce(together(), { type: 'STEP_OUT', userId: THEM }, T0 + 8_000);
    expect(s.present).toEqual([ME]);
    expect(anyMicrophoneOpen(s)).toBe(false);
  });
});
