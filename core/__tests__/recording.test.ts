import { DISCONNECT_GRACE_MS, FLOOR_CLAIM_MS } from '../constants';
import { recordedMs } from '../recording';
import {
  autoRecordStarter,
  canPauseRecording,
  canPlay,
  canResumeRecording,
  canStartRecording,
  canStopRecording,
  createChannel,
  recordingRefusal,
  reduce,
} from '../channel';
import type { ChannelAction, ChannelState } from '../types';

const A = 'user-a';
const B = 'user-b';
const T0 = 1_700_000_000_000;
const RUN = 'rec_one';

/**
 * A run is named by the server, never by the reducer, so every start carries
 * an id the way it carries a user.
 */
const start = (userId: string, runId = RUN): ChannelAction => ({
  type: 'START_RECORDING',
  userId,
  runId,
});

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

describe('starting a recording', () => {
  it('is not automatic', () => {
    expect(joined().recording.status).toBe('idle');
  });

  it('is available to one person alone with their microphone open', () => {
    // The reverse of what this asserted between 2026-09-07 and 2026-09-14, and
    // the same thing it asserted before that. What the room needs is something
    // to capture rather than a second person: somebody by themselves with
    // something to say is a run worth having, and the rule that said otherwise
    // exempted a room of one with a track playing in the same breath. See
    // `capturable`.
    const alone = createChannel({ id: 's1', initiator: A, invitees: [B], now: T0 });
    expect(alone.present).toEqual([A]);
    expect(alone.selfMuted[A]).toBe(false);
    expect(canStartRecording(alone, A)).toBe(true);
    expect(reduce(alone, start(A), T0).recording.status).toBe('recording');
  });

  it('is unavailable to one person alone who has muted themselves', () => {
    // The whole of what is left of the old clause: a run that would capture
    // nothing does not start. Not a judgement about how many people are here —
    // a judgement about whether anything would land in the file.
    const alone = createChannel({ id: 's1', initiator: A, invitees: [B], now: T0 });
    const muted = reduce(alone, { type: 'SET_SELF_MUTE', userId: A, muted: true }, T0);
    expect(muted.selfMuted[A]).toBe(true);
    expect(canStartRecording(muted, A)).toBe(false);
    expect(reduce(muted, start(A), T0)).toBe(muted);
  });

  it('is unavailable to a roomful of people who have all muted themselves', () => {
    // **Stricter than the old rule in exactly one place**, and deliberately.
    // A second occupant used to be sufficient on its own; two people sitting
    // muted with nothing playing would have filed silence and billed an egress
    // apiece for it.
    const both = apply(joined(), [
      [{ type: 'SET_SELF_MUTE', userId: A, muted: true }, T0],
      [{ type: 'SET_SELF_MUTE', userId: B, muted: true }, T0 + 1],
    ]);
    expect(canStartRecording(both, A)).toBe(false);

    // One of them opens a microphone and the room has something to record
    // again — for either of them, this being a fact about the room.
    const speaking = reduce(both, { type: 'SET_SELF_MUTE', userId: B, muted: false }, T0 + 2);
    expect(canStartRecording(speaking, A)).toBe(true);
    expect(canStartRecording(speaking, B)).toBe(true);
  });

  it('is available alone when media is playing into the room', () => {
    // The second half of "something to capture": the room has audio in it even
    // with one person muted, shared playback landing in a stem of its own.
    const alone = createChannel({ id: 's1', initiator: A, invitees: [B], now: T0 });
    const muted = reduce(alone, { type: 'SET_SELF_MUTE', userId: A, muted: true }, T0);
    const playing = {
      ...muted,
      playback: { ...muted.playback, status: 'playing' as const },
    };
    expect(canStartRecording(playing, A)).toBe(true);
  });

  it('does not count a track that is merely loaded and paused', () => {
    // Tightened from `!== 'idle'` on 2026-09-14. A paused track publishes
    // silence, so it is not something to capture — and it was the old rule's
    // way round itself: play, record, clear the track, and a solo run ran on
    // in a room the guard would have refused.
    const alone = createChannel({ id: 's1', initiator: A, invitees: [B], now: T0 });
    const muted = reduce(alone, { type: 'SET_SELF_MUTE', userId: A, muted: true }, T0);
    const paused = {
      ...muted,
      playback: { ...muted.playback, status: 'paused' as const },
    };
    expect(canStartRecording(paused, A)).toBe(false);
  });

  it('requires the person starting it to be present', () => {
    // Not merely a head count: nobody starts a recording of a room they are
    // not in. B is a member here and has never entered.
    const alone = createChannel({ id: 's1', initiator: A, invitees: [B], now: T0 });
    expect(canStartRecording(alone, B)).toBe(false);
    expect(reduce(alone, start(B), T0)).toBe(alone);
  });

  it('is unavailable once the channel is empty', () => {
    // The same condition at both ends: a run starts only while somebody is
    // here, and stops the moment nobody is.
    const empty = reduce(joined(), { type: 'STEP_OUT', userId: A }, T0);
    const alsoEmpty = reduce(empty, { type: 'STEP_OUT', userId: B }, T0 + 1);
    expect(alsoEmpty.present).toEqual([]);
    expect(canStartRecording(alsoEmpty, A)).toBe(false);

    // One returning is enough again, as of 2026-09-14: stepping in opens a
    // microphone, and an open microphone is something to record.
    const back = reduce(alsoEmpty, { type: 'ENTER', userId: A }, T0 + 2);
    expect(canStartRecording(back, A)).toBe(true);
  });

  it('can be initiated by either user', () => {
    for (const user of [A, B]) {
      const s = reduce(joined(), start(user), T0);
      expect(s.recording.status).toBe('recording');
      expect(s.recording.startedAt).toBe(T0);
    }
  });

  it('files the run under the id it was given', () => {
    const s = reduce(joined(), start(A, 'rec_given'), T0);
    expect(s.recording.runId).toBe('rec_given');
  });

  it('is refused while a run is already in progress', () => {
    const s = reduce(joined(), start(A), T0);
    expect(canStartRecording(s, B)).toBe(false);
    expect(reduce(s, start(B, 'rec_two'), T0 + 1_000)).toBe(s);
  });
});

describe('pause, resume, and stop', () => {
  /**
   * **A pause ends the run, and Resume begins another**, since 2026-10-10:
   * the record is a sequence of segments, and every pause is a break.
   */
  it('ends the run at a pause and begins a new one, quietly, at Resume', () => {
    const paused = apply(joined(), [
      [start(A), T0],
      [{ type: 'PAUSE_RECORDING', userId: A }, T0 + 10_000],
    ]);
    expect(paused.recording).toMatchObject({ status: 'paused', runId: null });
    expect(paused.lastRecording).toMatchObject({
      runId: RUN,
      startedAt: T0,
      endedAt: T0 + 10_000,
      durationMs: 10_000,
    });
    // The paused pill still reads what was recorded.
    expect(recordedMs(paused.recording, T0 + 20_000)).toBe(10_000);

    const resumed = reduce(
      paused,
      { type: 'RESUME_RECORDING', userId: A, runId: 'rec_two' },
      T0 + 40_000
    );
    expect(resumed.recording).toMatchObject({
      status: 'recording',
      runId: 'rec_two',
      startedAt: T0 + 40_000,
      // Resuming is not somebody starting a recording, so it does not chime.
      automatic: true,
    });
    expect(recordedMs(resumed.recording, T0 + 45_000)).toBe(5_000);

    const stopped = reduce(resumed, { type: 'STOP_RECORDING', userId: A }, T0 + 45_000);
    expect(stopped.recording.status).toBe('idle');
    expect(stopped.recording.runId).toBeNull();
    expect(stopped.lastRecording).toMatchObject({ runId: 'rec_two', durationMs: 5_000 });
  });

  it('stays paused when a resume carries no run id', () => {
    const s = apply(joined(), [
      [start(A), T0],
      [{ type: 'PAUSE_RECORDING', userId: A }, T0 + 1_000],
      [{ type: 'RESUME_RECORDING', userId: A }, T0 + 2_000],
    ]);
    expect(s.recording.status).toBe('paused');
  });

  it('does not end the channel', () => {
    const s = apply(joined(), [
      [start(A), T0],
      [{ type: 'STOP_RECORDING', userId: A }, T0 + 10_000],
    ]);
    expect(s.status).toBe('active');
  });

  it('leaves the channel ready to record again, under a new id', () => {
    // The point of returning to idle: several runs in one permanent channel.
    const s = apply(joined(), [
      [start(A), T0],
      [{ type: 'STOP_RECORDING', userId: A }, T0 + 10_000],
    ]);
    expect(canStartRecording(s, A)).toBe(true);

    const again = reduce(s, start(B, 'rec_two'), T0 + 20_000);
    expect(again.recording.status).toBe('recording');
    expect(again.recording.runId).toBe('rec_two');
    // The first run is still described until the second one finishes.
    expect(again.lastRecording?.runId).toBe(RUN);
  });

  it('files nothing for a run that captured no time', () => {
    const s = apply(joined(), [
      [start(A), T0],
      [{ type: 'STOP_RECORDING', userId: A }, T0],
    ]);
    expect(s.recording.status).toBe('idle');
    expect(s.lastRecording).toBeNull();
  });
});

describe('floor restriction on recording controls', () => {
  it('withholds pause and stop from the silenced party during a claim', () => {
    const s = apply(joined(), [
      [start(A), T0],
      [{ type: 'CLAIM_FLOOR', userId: A }, T0 + 1_000],
    ]);
    expect(canPauseRecording(s, A)).toBe(true);
    expect(canStopRecording(s, A)).toBe(true);
    expect(canPauseRecording(s, B)).toBe(false);
    expect(canStopRecording(s, B)).toBe(false);

    const attempted = reduce(s, { type: 'STOP_RECORDING', userId: B }, T0 + 2_000);
    expect(attempted.recording.status).toBe('recording');
    expect(attempted).toBe(s);
  });

  it('leaves both parties free to pause and stop when no claim is active', () => {
    const s = reduce(joined(), start(A), T0);
    expect(canPauseRecording(s, A)).toBe(true);
    expect(canPauseRecording(s, B)).toBe(true);
    expect(canStopRecording(s, A)).toBe(true);
    expect(canStopRecording(s, B)).toBe(true);
  });

  it('restores the silenced party’s controls when the claim ends', () => {
    const s = apply(joined(), [
      [start(A), T0],
      [{ type: 'CLAIM_FLOOR', userId: A }, T0 + 1_000],
      [{ type: 'TICK' }, T0 + 1_000 + FLOOR_CLAIM_MS],
    ]);
    expect(s.floor.holder).toBeNull();
    expect(canStopRecording(s, B)).toBe(true);
  });

  it('does not restrict resuming', () => {
    const s = apply(joined(), [
      [start(A), T0],
      [{ type: 'PAUSE_RECORDING', userId: A }, T0 + 1_000],
      [{ type: 'CLAIM_FLOOR', userId: A }, T0 + 2_000],
    ]);
    expect(canResumeRecording(s, B)).toBe(true);
    const resumed = reduce(
      s,
      { type: 'RESUME_RECORDING', userId: B, runId: 'rec_two' },
      T0 + 3_000
    );
    expect(resumed.recording.status).toBe('recording');
  });
});

/**
 * **Each segment is kept one way throughout**, since 2026-10-10, so that
 * where audio and text are both kept they cover exactly the same span. A
 * change to the text while the audio records ends the run and begins another;
 * Pause and Resume move both at once.
 */
describe('segments', () => {
  const text = (on: boolean, runId?: string): ChannelAction =>
    ({ type: 'SET_LIVE_TRANSCRIPTION', on, ...(runId ? { runId } : {}) }) as ChannelAction;

  it('restarts the run when text is switched on while recording', () => {
    const s = apply(joined(), [
      [start(A), T0],
      [text(true, 'rec_two'), T0 + 10_000],
    ]);
    expect(s.liveTranscription).toBe(true);
    expect(s.recording).toMatchObject({
      status: 'recording',
      runId: 'rec_two',
      startedAt: T0 + 10_000,
      automatic: true,
    });
    expect(s.lastRecording).toMatchObject({ runId: RUN, endedAt: T0 + 10_000 });
  });

  it('restarts it again when text is switched off', () => {
    const s = apply(joined(), [
      [text(true), T0],
      [start(A), T0],
      [text(false, 'rec_two'), T0 + 10_000],
    ]);
    expect(s.liveTranscription).toBe(false);
    expect(s.recording.runId).toBe('rec_two');
    expect(s.lastRecording).toMatchObject({ runId: RUN, durationMs: 10_000 });
  });

  it('leaves a run alone when what changed is not the text', () => {
    const s = apply(joined(), [
      [text(true), T0],
      [start(A), T0],
      [text(true, 'rec_two'), T0 + 10_000],
    ]);
    expect(s.recording.runId).toBe(RUN);
  });

  it('starts audio and text at one instant, for Start', () => {
    const s = reduce(
      joined(),
      { type: 'SET_LIVE_TRANSCRIPTION', on: true, runId: RUN, startRecording: true },
      T0
    );
    expect(s.liveTranscription).toBe(true);
    expect(s.recording).toMatchObject({
      status: 'recording',
      runId: RUN,
      startedAt: T0,
      automatic: false,
    });
  });

  it('holds both with either Pause, and restarts both with either Resume', () => {
    const paused = apply(joined(), [
      [text(true), T0],
      [start(A), T0],
      [{ type: 'PAUSE_LIVE_TRANSCRIPTION', userId: A }, T0 + 10_000],
    ]);
    expect(paused.recording.status).toBe('paused');
    expect(paused.liveTranscriptionPaused).toBe(true);
    expect(paused.lastRecording).toMatchObject({ runId: RUN, durationMs: 10_000 });

    const resumed = reduce(
      paused,
      { type: 'RESUME_RECORDING', userId: A, runId: 'rec_two' },
      T0 + 20_000
    );
    expect(resumed.recording).toMatchObject({ status: 'recording', runId: 'rec_two' });
    expect(resumed.liveTranscriptionPaused).toBe(false);
  });
});

/**
 * The rule the glossary already stated — *started and stopped by anybody
 * present* — and which only the starting half enforced until 2026-09-12. A
 * member who is not in the room could pause, resume or end the record of a
 * conversation they were not in, from the channel screen of a channel they had
 * stepped out of.
 */
describe('the transport belongs to whoever is in the room', () => {
  /** A runs alone in the room; B belongs to the channel and has stepped out. */
  const running = (): ChannelState =>
    apply(joined(), [
      [start(A), T0],
      [{ type: 'STEP_OUT', userId: B }, T0 + 1_000],
    ]);

  it('refuses pause and stop to a member who has stepped out', () => {
    const s = running();
    expect(s.recording.status).toBe('recording');
    expect(s.present).toEqual([A]);
    expect(canPauseRecording(s, B)).toBe(false);
    expect(canStopRecording(s, B)).toBe(false);
    expect(reduce(s, { type: 'PAUSE_RECORDING', userId: B }, T0 + 2_000)).toBe(s);
    expect(reduce(s, { type: 'STOP_RECORDING', userId: B }, T0 + 2_000)).toBe(s);
  });

  it('refuses resume to a member who has stepped out', () => {
    const s = reduce(running(), { type: 'PAUSE_RECORDING', userId: A }, T0 + 2_000);
    expect(s.recording.status).toBe('paused');
    expect(canResumeRecording(s, B)).toBe(false);
    expect(reduce(s, { type: 'RESUME_RECORDING', userId: B }, T0 + 3_000)).toBe(s);
    // And is still the person in the room's to drive, which is the half of
    // this that must not have broken.
    expect(canResumeRecording(s, A)).toBe(true);
  });

  it('gives the transport back the moment they step in', () => {
    const s = reduce(running(), { type: 'ENTER', userId: B }, T0 + 2_000);
    expect(canPauseRecording(s, B)).toBe(true);
    expect(canStopRecording(s, B)).toBe(true);
  });

  it('has no empty-channel case for `presentOrEmpty` to allow', () => {
    // Why this asks presence rather than `presentOrEmpty` like the clipboard and
    // the name: a run cannot outlive the room, so there is never a paused or
    // running transport in an empty channel for an absent member to tidy.
    const s = apply(running(), [[{ type: 'STEP_OUT', userId: A }, T0 + 2_000]]);
    expect(s.present).toEqual([]);
    expect(s.recording.status).toBe('idle');
    expect(canPauseRecording(s, B)).toBe(false);
    expect(canResumeRecording(s, B)).toBe(false);
    expect(canStopRecording(s, B)).toBe(false);
  });
});

describe('recording and presence', () => {
  it('keeps running while one person is still there alone', () => {
    const s = apply(joined(), [
      [start(A), T0],
      [{ type: 'STEP_OUT', userId: B }, T0 + 10_000],
      [{ type: 'TICK' }, T0 + 40_000],
    ]);
    expect(s.recording.status).toBe('recording');
    expect(recordedMs(s.recording, T0 + 40_000)).toBe(40_000);
  });

  it('stops the moment the last person steps out', () => {
    // The channel no longer ends when it empties, so this is what bounds a
    // recording: capture needs somebody to capture. It used to come for free,
    // via the empty-channel timer ending the channel a minute later — which
    // is why the old assertion here was 20s plus that whole extra minute.
    const s = apply(joined(), [
      [start(A), T0],
      [{ type: 'STEP_OUT', userId: A }, T0 + 10_000],
      [{ type: 'STEP_OUT', userId: B }, T0 + 20_000],
    ]);
    expect(s.status).toBe('active');
    expect(s.recording.status).toBe('idle');
    expect(s.lastRecording?.durationMs).toBe(20_000);
  });

  it('stops when the last person is dropped by the grace period', () => {
    const s = apply(joined(), [
      [start(A), T0],
      [{ type: 'STEP_OUT', userId: A }, T0 + 10_000],
      [{ type: 'DISCONNECTED', userId: B }, T0 + 20_000],
      [{ type: 'TICK' }, T0 + 20_000 + DISCONNECT_GRACE_MS],
    ]);
    expect(s.recording.status).toBe('idle');
    // The grace period is inside the recording: an abrupt end leaves up to a
    // minute of silence on the tail.
    expect(s.lastRecording?.durationMs).toBe(20_000 + DISCONNECT_GRACE_MS);
  });

  it('finalizes when the last member deletes the channel', () => {
    const s = apply(joined(), [
      [start(A), T0],
      [{ type: 'LEAVE_CHANNEL', userId: A }, T0 + 30_000],
      [{ type: 'DELETE_CHANNEL', userId: B }, T0 + 30_000],
    ]);
    expect(s.status).toBe('ended');
    expect(s.recording.status).toBe('idle');
    expect(s.lastRecording?.durationMs).toBe(30_000);
  });
});

/**
 * The channel setting, which is only ever half the mechanism: the reducer
 * holds what was asked for and `autoRecordStarter` says who would begin a run,
 * and the server is what mints the id and remembers that this room has had its
 * turn. What is tested here is the half that is a rule.
 */
describe('automatic recording', () => {
  const on = (state: ChannelState, userId = A): ChannelState =>
    reduce(state, { type: 'SET_AUTO_RECORD', userId, autoRecord: true }, T0);

  it('is off on a channel nobody has set it on', () => {
    expect(createChannel({ id: 's1', initiator: A, invitees: [B], now: T0 }).autoRecord).toBe(false);
    expect(autoRecordStarter(joined())).toBeNull();
  });

  it('names the first present member once there are two of them', () => {
    expect(autoRecordStarter(on(joined()))).toBe(A);
  });

  it('names somebody alone in the room, since 2026-09-14', () => {
    // It named nobody until the recording guard widened, and it widened with
    // it by construction rather than by a second decision — the two must be
    // possible in exactly the same states. What this costs is an egress for a
    // lone speaker in every channel with the setting on.
    const alone = on(createChannel({ id: 's1', initiator: A, invitees: [B], now: T0 }));
    expect(alone.autoRecord).toBe(true);
    expect(autoRecordStarter(alone)).toBe(A);
  });

  it('names nobody while the only person here is muted', () => {
    const alone = on(createChannel({ id: 's1', initiator: A, invitees: [B], now: T0 }));
    const muted = reduce(alone, { type: 'SET_SELF_MUTE', userId: A, muted: true }, T0);
    expect(autoRecordStarter(muted)).toBeNull();
  });

  it('marks a run it would start as automatic, and a hand-started one not', () => {
    // The bit exists for the app's audible notice and for nothing else: a run
    // somebody pressed Record for announces itself to the room, and one the
    // channel began by itself does not. `server/src/channels.ts` is the only
    // caller that sets it, so the default here is what every client start
    // gets.
    expect(reduce(joined(), start(A), T0).recording.automatic).toBe(false);
    const auto = reduce(
      on(joined()),
      { type: 'START_RECORDING', userId: A, runId: RUN, automatic: true },
      T0
    );
    expect(auto.recording.automatic).toBe(true);
    // And it does not outlive the run it described.
    expect(
      reduce(auto, { type: 'STOP_RECORDING', userId: A }, T0 + 1_000).recording
        .automatic
    ).toBe(false);
  });

  it('names nobody once a run is going', () => {
    expect(autoRecordStarter(reduce(on(joined()), start(A), T0))).toBeNull();
  });

  it('is refused to somebody who is not in the room', () => {
    // `canEditChannel`, exactly as the name and the description are: the
    // channel is occupied by somebody else, so this is theirs to arrange.
    const busy = apply(joined(), [[{ type: 'STEP_OUT', userId: A }, T0 + 1]]);
    expect(reduce(busy, { type: 'SET_AUTO_RECORD', userId: A, autoRecord: true }, T0 + 2)).toBe(busy);
  });

  it('starts nothing by itself and stops nothing when it goes off', () => {
    // The setting decides how a run begins and has no other effect: turning it
    // on is not a start, and turning it off mid-run is not a stop.
    const asked = on(joined());
    expect(asked.recording.status).toBe('idle');
    const running = reduce(asked, start(A), T0 + 1);
    const off = reduce(running, { type: 'SET_AUTO_RECORD', userId: B, autoRecord: false }, T0 + 2);
    expect(off.recording.status).toBe('recording');
    expect(off.autoRecord).toBe(false);
  });

  it('survives the run it began, so the next room records too', () => {
    const stopped = apply(on(joined()), [
      [start(A), T0],
      [{ type: 'STOP_RECORDING', userId: A }, T0 + 5_000],
    ]);
    expect(stopped.autoRecord).toBe(true);
    expect(stopped.lastRecording?.durationMs).toBe(5_000);
  });
});

describe('the transcription model', () => {
  const choose = (
    state: ChannelState,
    transcriptionModel: 'standard' | 'pro',
    userId = A,
    now = T0
  ): ChannelState =>
    reduce(state, { type: 'SET_TRANSCRIPTION_MODEL', userId, transcriptionModel }, now);

  it('is standard on a channel nobody has set it on', () => {
    expect(
      createChannel({ id: 's1', initiator: A, invitees: [B], now: T0 }).transcriptionModel
    ).toBe('standard');
  });

  it('is changed by somebody in the room, and changes nothing else', () => {
    const before = joined();
    const after = choose(before, 'pro');
    expect(after.transcriptionModel).toBe('pro');
    expect({ ...after, transcriptionModel: 'standard' }).toEqual(before);
  });

  it('is guarded like the other channel settings', () => {
    // Whether the account has `debug` is the server's half of the rule; this
    // is the half the reducer can see.
    const busy = apply(joined(), [[{ type: 'STEP_OUT', userId: A }, T0 + 1]]);
    expect(choose(busy, 'pro', A, T0 + 2)).toBe(busy);
  });
});

describe('why Record is refused', () => {
  // Only the reasons nothing else on the screen gives; see `recordingRefusal`.
  it('says nothing when it is not refused, or to somebody not here', () => {
    const alone = createChannel({ id: 's1', initiator: A, invitees: [B], now: T0 });
    expect(recordingRefusal(alone, A)).toBeNull();
    expect(recordingRefusal(alone, B)).toBeNull();
  });

  it('says so when nothing would be captured', () => {
    const alone = createChannel({ id: 's1', initiator: A, invitees: [B], now: T0 });
    const muted = reduce(alone, { type: 'SET_SELF_MUTE', userId: A, muted: true }, T0);
    expect(recordingRefusal(muted, A)).toBe('silent');
  });

  it('says nothing while a run is going', () => {
    const recording = reduce(joined(), start(A), T0);
    expect(recordingRefusal(recording, B)).toBeNull();
  });
});

/**
 * **The transport and the switches, since 2026-10-11.** The switches select
 * what Play keeps; Play, Pause and Stop run it. A switch changes what is
 * running only while something is: both off stops, any other change stops
 * and restarts — a new segment — and while stopped or paused it changes only
 * what Play or Resume will begin.
 */
describe('the transport', () => {
  const keep = (audio: boolean, text: boolean, runId?: string): ChannelAction =>
    ({ type: 'SET_KEEP', userId: A, audio, text, ...(runId ? { runId } : {}) }) as ChannelAction;
  const play = (runId = RUN): ChannelAction => ({ type: 'PLAY_KEEPING', userId: A, runId });
  const pause: ChannelAction = { type: 'PAUSE_RECORDING', userId: A };
  const stop: ChannelAction = { type: 'STOP_KEEPING', userId: A };

  it('starts nothing when a switch is turned on while stopped', () => {
    const s = apply(joined(), [[keep(true, true), T0]]);
    expect(s.keep).toEqual({ audio: true, text: true });
    expect(s.recording.status).toBe('idle');
    expect(s.liveTranscription).toBeFalsy();
  });

  it('plays what is selected, both at one instant', () => {
    const s = apply(joined(), [
      [keep(true, true), T0],
      [play(), T0 + 1_000],
    ]);
    expect(s.recording).toMatchObject({ status: 'recording', runId: RUN, startedAt: T0 + 1_000 });
    expect(s.liveTranscription).toBe(true);
    expect(s.liveTranscriptionPaused).toBe(false);
  });

  it('selects both and plays them when Play is pressed with nothing selected', () => {
    const neither = reduce(joined(), keep(false, false), T0);
    expect(canPlay(neither, A)).toBe(true);
    const s = reduce(neither, play(), T0 + 1_000);
    expect(s.keep).toEqual({ audio: true, text: true });
    expect(s.recording).toMatchObject({ status: 'recording', runId: RUN, startedAt: T0 + 1_000 });
    expect(s.liveTranscription).toBe(true);
  });

  it('refuses Play with nothing selected while the audio cannot begin, and changes nothing', () => {
    const silent = apply(joined(), [
      [keep(false, false), T0],
      [{ type: 'SET_SELF_MUTE', userId: A, muted: true } as ChannelAction, T0],
      [{ type: 'SET_SELF_MUTE', userId: B, muted: true } as ChannelAction, T0],
    ]);
    expect(canPlay(silent, A)).toBe(false);
    expect(reduce(silent, play(), T0)).toBe(silent);
  });

  it('refuses Play with audio that cannot begin', () => {
    const muted = apply(joined(), [
      [keep(true, false), T0],
      [{ type: 'SET_SELF_MUTE', userId: A, muted: true } as ChannelAction, T0],
      [{ type: 'SET_SELF_MUTE', userId: B, muted: true } as ChannelAction, T0],
    ]);
    expect(canPlay(muted, A)).toBe(false);
  });

  it('stops and restarts on a change while running, and stops when both go off', () => {
    const both = apply(joined(), [
      [keep(true, true), T0],
      [play(), T0],
    ]);
    const textOnly = reduce(both, keep(false, true, 'rec_two'), T0 + 10_000);
    expect(textOnly.recording.status).toBe('idle');
    expect(textOnly.lastRecording).toMatchObject({ runId: RUN, durationMs: 10_000 });
    expect(textOnly.liveTranscription).toBe(true);

    const audioOnly = reduce(both, keep(true, false, 'rec_two'), T0 + 10_000);
    expect(audioOnly.recording).toMatchObject({ status: 'recording', runId: 'rec_two' });
    expect(audioOnly.liveTranscription).toBe(false);

    const neither = reduce(both, keep(false, false), T0 + 10_000);
    expect(neither.recording.status).toBe('idle');
    expect(neither.liveTranscription).toBe(false);
    expect(neither.keep).toEqual({ audio: false, text: false });
  });

  it('changes only what Resume begins while paused', () => {
    const paused = apply(joined(), [
      [keep(true, true), T0],
      [play(), T0],
      [pause, T0 + 5_000],
      [keep(true, false), T0 + 6_000],
    ]);
    expect(paused.recording.status).toBe('paused');
    expect(paused.liveTranscriptionPaused).toBe(true);
    const resumed = reduce(paused, play('rec_two'), T0 + 7_000);
    expect(resumed.recording).toMatchObject({ status: 'recording', runId: 'rec_two', automatic: true });
    expect(resumed.liveTranscription).toBe(false);
  });

  it('stops both with Stop, and keeps the selection', () => {
    const s = apply(joined(), [
      [keep(true, true), T0],
      [play(), T0],
      [stop, T0 + 5_000],
    ]);
    expect(s.recording.status).toBe('idle');
    expect(s.liveTranscription).toBe(false);
    expect(s.lastRecording).toMatchObject({ runId: RUN, durationMs: 5_000 });
    expect(s.keep).toEqual({ audio: true, text: true });
  });

  it('resets the selection to Record automatically at the next sitting', () => {
    const s = apply(joined(), [
      [keep(true, true), T0],
      [{ type: 'STEP_OUT', userId: A }, T0],
      [{ type: 'STEP_OUT', userId: B }, T0],
    ]);
    expect(s.keep).toEqual({ audio: false, text: false });
  });
});
