import { createChannel, isTranscribingLive, reduce } from '../channel';
import type { ChannelState } from '../types';

const A = 'user-a';
const B = 'user-b';
const T0 = 1_700_000_000_000;

const fresh = (): ChannelState =>
  createChannel({ id: 's1', initiator: A, invitees: [B], now: T0 });

const on = (state: ChannelState): ChannelState =>
  reduce(state, { type: 'SET_LIVE_TRANSCRIPTION', on: true }, T0);

describe('the live transcript', () => {
  it('is off on a channel nobody has set it on', () => {
    expect(fresh().liveTranscription).toBe(false);
    expect(isTranscribingLive(fresh())).toBe(false);
  });

  it('is set by the server action and by nothing a member sends', () => {
    // The action carries no user: the check of who may turn it on is the
    // server's, against an account mark no channel state knows about.
    expect(on(fresh()).liveTranscription).toBe(true);
    const off = reduce(on(fresh()), { type: 'SET_LIVE_TRANSCRIPTION', on: false }, T0);
    expect(off.liveTranscription).toBe(false);
  });

  it('changes nothing when it is already what was asked', () => {
    const once = on(fresh());
    expect(on(once)).toBe(once);
  });

  it('transcribes an occupied room, and an empty one not', () => {
    const occupied = on(fresh());
    expect(occupied.present).toContain(A);
    expect(isTranscribingLive(occupied)).toBe(true);

    const empty = reduce(occupied, { type: 'STEP_OUT', userId: A }, T0);
    expect(empty.present).toHaveLength(0);
    expect(isTranscribingLive(empty)).toBe(false);
  });

  it('reads a state from before the field as off', () => {
    const older = { ...fresh(), present: [A] } as ChannelState;
    delete older.liveTranscription;
    expect(isTranscribingLive(older)).toBe(false);
  });
});

/*
  **Held by the Record tab's Pause, since 2026-10-09.** The choice stays on
  and only its running stops: nothing goes to the provider, and the lines
  either side of the hold are one stretch of the same room. Anybody present
  may hold it, on the recording's Pause rules — holding costs the house
  nothing, so it is not the house's.
*/
describe('holding the live transcript', () => {
  const pause = (state: ChannelState, userId = A) =>
    reduce(state, { type: 'PAUSE_LIVE_TRANSCRIPTION', userId }, T0);
  const resume = (state: ChannelState, userId = A) =>
    reduce(state, { type: 'RESUME_LIVE_TRANSCRIPTION', userId }, T0);

  it('stops transcribing while held, and starts again on resume', () => {
    const held = pause(on(fresh()));
    expect(held.liveTranscription).toBe(true);
    expect(held.liveTranscriptionPaused).toBe(true);
    expect(isTranscribingLive(held)).toBe(false);
    expect(isTranscribingLive(resume(held))).toBe(true);
  });

  it('holds only a transcript that is on and running, for somebody present', () => {
    const off = fresh();
    expect(pause(off).liveTranscriptionPaused).toBeFalsy();
    const away = reduce(on(fresh()), { type: 'STEP_OUT', userId: B }, T0);
    expect(pause(away, B).liveTranscriptionPaused).toBeFalsy();
    const running = on(fresh());
    expect(resume(running)).toBe(running);
  });

  it('lets go of the hold when the choice changes, and when the room empties', () => {
    const held = pause(on(fresh()));
    const again = on(reduce(held, { type: 'SET_LIVE_TRANSCRIPTION', on: false }, T0));
    expect(again.liveTranscriptionPaused).toBe(false);
    expect(isTranscribingLive(again)).toBe(true);

    const emptied = reduce(held, { type: 'STEP_OUT', userId: A }, T0);
    expect(emptied.liveTranscriptionPaused).toBeFalsy();
  });
});
