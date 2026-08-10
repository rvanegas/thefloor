import {
  DISCONNECT_GRACE_MS,
  EMPTY_SESSION_TIMEOUT_MS,
  FLOOR_CLAIM_MS,
} from '../constants';
import { createSession, isPresent, reduce } from '../session';
import type { SessionState } from '../types';

/**
 * Connectivity is not presence.
 *
 * A socket that drops and returns must change nothing about who is in a
 * session. Conflating the two produced two failures worth remembering: a
 * moment's bad signal read as leaving, and — the sharper one — a socket dying
 * *after* its replacement had connected evicted a user who was demonstrably
 * back, because a dead connection was still allowed to speak for them.
 */

const A = 'user-a';
const B = 'user-b';
const T0 = 1_700_000_000_000;

function joined(now = T0): SessionState {
  const session = createSession({ id: 's1', initiator: A, invitees: [B], now });
  return reduce(session, { type: 'ENTER', userId: B }, now);
}

const tick = (state: SessionState, now: number) =>
  reduce(state, { type: 'TICK' }, now);

describe('disconnecting', () => {
  it('does not remove anyone', () => {
    const state = reduce(joined(), { type: 'DISCONNECTED', userId: B }, T0);
    expect(isPresent(state, B)).toBe(true);
    expect(state.disconnectedAt[B]).toBe(T0);
  });

  it('leaves them in the session right up to the grace period', () => {
    let state = reduce(joined(), { type: 'DISCONNECTED', userId: B }, T0);
    state = tick(state, T0 + DISCONNECT_GRACE_MS - 1);
    expect(isPresent(state, B)).toBe(true);
  });

  it('removes them once the grace period has elapsed', () => {
    let state = reduce(joined(), { type: 'DISCONNECTED', userId: B }, T0);
    state = tick(state, T0 + DISCONNECT_GRACE_MS);
    expect(isPresent(state, B)).toBe(false);
    // And the clock is cleared, so it cannot fire again on the next tick.
    expect(state.disconnectedAt[B]).toBeUndefined();
  });

  it('is cancelled by reconnecting', () => {
    let state = reduce(joined(), { type: 'DISCONNECTED', userId: B }, T0);
    state = reduce(state, { type: 'CONNECTED', userId: B }, T0 + 30_000);
    state = tick(state, T0 + DISCONNECT_GRACE_MS + 10_000);
    expect(isPresent(state, B)).toBe(true);
  });

  it('does not restart its clock on a repeated report', () => {
    // A flapping connection must still time out. Restarting the clock on each
    // report would let one survive indefinitely.
    let state = reduce(joined(), { type: 'DISCONNECTED', userId: B }, T0);
    state = reduce(state, { type: 'DISCONNECTED', userId: B }, T0 + 50_000);
    expect(state.disconnectedAt[B]).toBe(T0);
    state = tick(state, T0 + DISCONNECT_GRACE_MS);
    expect(isPresent(state, B)).toBe(false);
  });

  it('is ignored for someone who is not in the session', () => {
    const alone = createSession({ id: 's1', initiator: A, invitees: [B], now: T0 });
    const state = reduce(alone, { type: 'DISCONNECTED', userId: B }, T0);
    expect(state).toBe(alone);
  });

  it('is cancelled by entering, which proves a connection', () => {
    let state = reduce(joined(), { type: 'DISCONNECTED', userId: B }, T0);
    state = reduce(state, { type: 'LEAVE', userId: B }, T0 + 1_000);
    state = reduce(state, { type: 'ENTER', userId: B }, T0 + 2_000);
    state = tick(state, T0 + DISCONNECT_GRACE_MS + 5_000);
    expect(isPresent(state, B)).toBe(true);
  });
});

describe('a disconnected floor-holder', () => {
  it('keeps the floor while disconnected', () => {
    // Their claimed time is theirs. It is bounded twice over — by the
    // three-minute expiry and by the grace period — so a bad signal need not
    // also cost them the floor.
    let state = reduce(joined(), { type: 'CLAIM_FLOOR', userId: B }, T0);
    state = reduce(state, { type: 'DISCONNECTED', userId: B }, T0 + 1_000);
    state = tick(state, T0 + DISCONNECT_GRACE_MS - 1);
    expect(state.floor.holder).toBe(B);
  });

  it('loses it when the grace period removes them', () => {
    let state = reduce(joined(), { type: 'CLAIM_FLOOR', userId: B }, T0);
    state = reduce(state, { type: 'DISCONNECTED', userId: B }, T0 + 1_000);
    state = tick(state, T0 + 1_000 + DISCONNECT_GRACE_MS);
    expect(state.floor.holder).toBeNull();
    expect(isPresent(state, B)).toBe(false);
    // Released as any other departure would release it, and their claim is
    // still on record — so they still rank as having spoken most recently.
    expect(state.floor.lastClaimedAt[B]).toBeDefined();
  });

  it('is removed by the grace period long before the claim would expire', () => {
    // The two bounds are an order of magnitude apart — 60s against 180s — so in
    // practice a disconnected holder is always removed by the grace period
    // first, and the expiry never gets to run. Worth pinning: it means the
    // grace period is what actually limits how long a vanished user can hold
    // the floor.
    expect(DISCONNECT_GRACE_MS).toBeLessThan(FLOOR_CLAIM_MS);

    let state = reduce(joined(), { type: 'CLAIM_FLOOR', userId: B }, T0);
    state = reduce(state, { type: 'DISCONNECTED', userId: B }, T0);
    state = tick(state, T0 + DISCONNECT_GRACE_MS);

    expect(isPresent(state, B)).toBe(false);
    expect(state.floor.holder).toBeNull();
  });

  it('keeps the floor through a disconnect and reconnect', () => {
    // The ordinary case: a tunnel, a lift, a moment of bad signal. Nothing
    // about the claim should change.
    let state = reduce(joined(), { type: 'CLAIM_FLOOR', userId: B }, T0);
    state = reduce(state, { type: 'DISCONNECTED', userId: B }, T0 + 5_000);
    state = tick(state, T0 + 20_000);
    state = reduce(state, { type: 'CONNECTED', userId: B }, T0 + 25_000);
    state = tick(state, T0 + 30_000);

    expect(state.floor.holder).toBe(B);
    expect(state.disconnectedAt[B]).toBeUndefined();
  });
});

describe('when everyone disconnects', () => {
  it('keeps the session alive for the grace period plus the empty timer', () => {
    // Deliberately two minutes total: a minute to come back before anyone is
    // removed, then the ordinary empty-session minute.
    let state = joined();
    state = reduce(state, { type: 'DISCONNECTED', userId: A }, T0);
    state = reduce(state, { type: 'DISCONNECTED', userId: B }, T0);

    state = tick(state, T0 + DISCONNECT_GRACE_MS - 1);
    expect(state.status).toBe('active');
    expect(state.present).toHaveLength(2);

    // Both removed together, which is what starts the empty-session timer.
    state = tick(state, T0 + DISCONNECT_GRACE_MS);
    expect(state.present).toHaveLength(0);
    expect(state.status).toBe('active');

    state = tick(
      state,
      T0 + DISCONNECT_GRACE_MS + EMPTY_SESSION_TIMEOUT_MS - 1
    );
    expect(state.status).toBe('active');

    state = tick(state, T0 + DISCONNECT_GRACE_MS + EMPTY_SESSION_TIMEOUT_MS);
    expect(state.status).toBe('ended');
    expect(state.endedReason).toBe('empty-timeout');
  });

  it('survives if one of them returns inside the window', () => {
    let state = joined();
    state = reduce(state, { type: 'DISCONNECTED', userId: A }, T0);
    state = reduce(state, { type: 'DISCONNECTED', userId: B }, T0);
    state = reduce(state, { type: 'CONNECTED', userId: A }, T0 + 55_000);

    state = tick(state, T0 + DISCONNECT_GRACE_MS + 1_000);
    expect(state.status).toBe('active');
    expect(isPresent(state, A)).toBe(true);
    expect(isPresent(state, B)).toBe(false);
  });
});
