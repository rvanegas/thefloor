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
