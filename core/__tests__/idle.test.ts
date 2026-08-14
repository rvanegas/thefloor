import { createChannel, idleMs, reduce } from '../channel';
import { DISCONNECT_GRACE_MS } from '../constants';
import type { ChannelState } from '../types';

const A = 'usr_a';
const B = 'usr_b';
const T0 = 1_000_000;

/** Two people, both present. */
function pair(now = T0): ChannelState {
  const s = createChannel({ id: 's1', initiator: A, invitees: [B], now });
  return reduce(s, { type: 'ENTER', userId: B }, now);
}

describe('how long somebody has been away from a channel', () => {
  it('is not a question about somebody who is here', () => {
    expect(idleMs(pair(), B, T0 + 60_000)).toBeNull();
  });

  it('is not a question about somebody who has never been here', () => {
    // Invited and never arrived. There is no absence to measure, only an
    // invitation outstanding, and the screen says that instead.
    const s = createChannel({ id: 's1', initiator: A, invitees: [B], now: T0 });
    expect(idleMs(s, B, T0 + 60_000)).toBeNull();
  });

  it('runs from the moment they stepped out', () => {
    const s = reduce(pair(), { type: 'STEP_OUT', userId: B }, T0 + 1_000);
    expect(idleMs(s, B, T0 + 1_000)).toBe(0);
    expect(idleMs(s, B, T0 + 61_000)).toBe(60_000);
  });

  it('runs from a lost connection giving up, not from when it dropped', () => {
    // The grace period is time they were still in the channel — they had a
    // minute to come back and it was held for them. Dating the absence from
    // the drop would report a minute they had not yet been away.
    let s = reduce(pair(), { type: 'DISCONNECTED', userId: B }, T0);
    s = reduce(s, { type: 'TICK' }, T0 + DISCONNECT_GRACE_MS + 1);
    expect(s.present).not.toContain(B);
    expect(idleMs(s, B, T0 + DISCONNECT_GRACE_MS + 1)).toBe(0);
  });

  it('starts again when they come back and leave again', () => {
    let s = reduce(pair(), { type: 'STEP_OUT', userId: B }, T0);
    s = reduce(s, { type: 'ENTER', userId: B }, T0 + 10_000);
    expect(idleMs(s, B, T0 + 10_000)).toBeNull();
    s = reduce(s, { type: 'STEP_OUT', userId: B }, T0 + 20_000);
    expect(idleMs(s, B, T0 + 25_000)).toBe(5_000);
  });

  it('never reports an absence that has not happened yet', () => {
    // A client counts this against the server's clock, learned a round trip
    // ago, so `now` can lag the stamp by a little. "In two seconds" is not an
    // answer to how long somebody has been gone.
    const s = reduce(pair(), { type: 'STEP_OUT', userId: B }, T0 + 5_000);
    expect(idleMs(s, B, T0)).toBe(0);
  });

  it('leaves the other person alone', () => {
    const s = reduce(pair(), { type: 'STEP_OUT', userId: B }, T0);
    expect(idleMs(s, A, T0 + 60_000)).toBeNull();
    expect(s.lastPresentAt[A]).toBeUndefined();
  });
});
