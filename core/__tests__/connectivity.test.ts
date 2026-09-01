import {
  DISCONNECT_GRACE_MS,
  FLOOR_CLAIM_DELAY_STEP_MS,
  FLOOR_CLAIM_MS,
} from '../constants';
import {
  canClaimFloor,
  canPing,
  createChannel,
  isPresent,
  reduce,
} from '../channel';
import type { ChannelState } from '../types';

/**
 * Connectivity is not presence.
 *
 * A socket that drops and returns must change nothing about who is in a
 * channel. Conflating the two produced two failures worth remembering: a
 * moment's bad signal read as leaving, and — the sharper one — a socket dying
 * *after* its replacement had connected evicted a user who was demonstrably
 * back, because a dead connection was still allowed to speak for them.
 */

const A = 'user-a';
const B = 'user-b';
const T0 = 1_700_000_000_000;

function joined(now = T0): ChannelState {
  const channel = createChannel({ id: 's1', initiator: A, invitees: [B], now });
  return reduce(channel, { type: 'ENTER', userId: B }, now);
}

const tick = (state: ChannelState, now: number) =>
  reduce(state, { type: 'TICK' }, now);

describe('disconnecting', () => {
  it('does not remove anyone', () => {
    const state = reduce(joined(), { type: 'DISCONNECTED', userId: B }, T0);
    expect(isPresent(state, B)).toBe(true);
    expect(state.disconnectedAt[B]).toBe(T0);
  });

  it('leaves them in the channel right up to the grace period', () => {
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

  it('clears the self-mute, exactly as stepping out does', () => {
    // The two departures no longer differ here. A mute belongs to the
    // conversation it was set in, and a grace period running out ends that
    // conversation as surely as a tap does — it just ends it without anybody
    // present to notice. Keeping it produced a roster line that could not be
    // read: absent, and muted, at the same time.
    let state = reduce(joined(), { type: 'SET_SELF_MUTE', userId: B, muted: true }, T0);
    state = reduce(state, { type: 'DISCONNECTED', userId: B }, T0);
    state = tick(state, T0 + DISCONNECT_GRACE_MS);

    expect(isPresent(state, B)).toBe(false);
    expect(state.selfMuted[B]).toBe(false);

    const back = reduce(state, { type: 'ENTER', userId: B }, T0 + DISCONNECT_GRACE_MS + 1);
    expect(back.selfMuted[B]).toBe(false);
  });

  it('leaves a mute alone while the grace period is still running', () => {
    // The clearing is a departure's doing, not a disconnection's. Inside the
    // grace period nobody has left — the socket is expected back — so a mute
    // set before the drop survives a reconnection that beats the timer, which
    // is the case a flapping connection actually is.
    let state = reduce(joined(), { type: 'SET_SELF_MUTE', userId: B, muted: true }, T0);
    state = reduce(state, { type: 'DISCONNECTED', userId: B }, T0);
    state = tick(state, T0 + 1_000);
    expect(state.selfMuted[B]).toBe(true);

    state = reduce(state, { type: 'CONNECTED', userId: B }, T0 + 30_000);
    expect(isPresent(state, B)).toBe(true);
    expect(state.selfMuted[B]).toBe(true);
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

  it('is ignored for someone who is not in the channel', () => {
    const alone = createChannel({ id: 's1', initiator: A, invitees: [B], now: T0 });
    const state = reduce(alone, { type: 'DISCONNECTED', userId: B }, T0);
    expect(state).toBe(alone);
  });

  it('is cancelled by entering, which proves a connection', () => {
    let state = reduce(joined(), { type: 'DISCONNECTED', userId: B }, T0);
    state = reduce(state, { type: 'STEP_OUT', userId: B }, T0 + 1_000);
    state = reduce(state, { type: 'ENTER', userId: B }, T0 + 2_000);
    state = tick(state, T0 + DISCONNECT_GRACE_MS + 5_000);
    expect(isPresent(state, B)).toBe(true);
  });
});

describe('a disconnected floor-holder', () => {
  /**
   * A claim is the one thing the grace period does not protect, and the
   * asymmetry is the point: everything else it holds belongs to the person who
   * dropped, where a claim is a lock on everybody else. They are silenced by
   * it and cannot take it back while it is held, so every second spent waiting
   * to see whether one phone returns was a second the rest of the room could
   * not speak.
   */
  it('gives up the floor the moment the drop is noticed', () => {
    let state = reduce(joined(), { type: 'CLAIM_FLOOR', userId: B }, T0);
    state = reduce(state, { type: 'DISCONNECTED', userId: B }, T0 + 1_000);
    expect(state.floor.holder).toBeNull();
    // Presence is untouched, which is the whole distinction: they have given
    // up their turn, not their place.
    expect(isPresent(state, B)).toBe(true);
    expect(state.disconnectedAt[B]).toBe(T0 + 1_000);
  });

  it('hands the room back without waiting out the grace period', () => {
    // The point of the change, stated as the thing somebody in the room can
    // actually do: speak. Before this they waited a full minute for a turn
    // nobody was taking.
    let state = reduce(joined(), { type: 'CLAIM_FLOOR', userId: B }, T0);
    state = reduce(state, { type: 'DISCONNECTED', userId: B }, T0 + 1_000);
    expect(canClaimFloor(state, A, T0 + 1_000)).toBe(true);
  });

  it('sends the returning holder to the back of the queue, not to their claim', () => {
    // Deliberate, and the one cost of releasing early. `claimDelayMs` ranks by
    // recency and they spoke most recently, so in a pair they wait a step
    // while the other may go at once. A connection that flaps therefore cannot
    // take the floor, vanish, and take it again on the strength of having just
    // had it.
    let state = reduce(joined(), { type: 'CLAIM_FLOOR', userId: B }, T0);
    state = reduce(state, { type: 'DISCONNECTED', userId: B }, T0 + 1_000);
    state = reduce(state, { type: 'CONNECTED', userId: B }, T0 + 2_000);

    // Not given back. Nobody is holding it; it is simply free.
    expect(state.floor.holder).toBeNull();
    expect(state.disconnectedAt[B]).toBeUndefined();
    expect(canClaimFloor(state, B, T0 + 2_000)).toBe(false);
    expect(canClaimFloor(state, B, T0 + 1_000 + FLOOR_CLAIM_DELAY_STEP_MS)).toBe(
      true
    );
    // And their claim is still on record, which is what puts them there.
    expect(state.floor.lastClaimedAt[B]).toBe(T0);
  });

  it('is still gone when the grace period removes them', () => {
    // The departure releases the floor as any departure does. It is a no-op
    // here now — the disconnect already took it — and that is worth pinning:
    // the two paths must not disagree about who holds what.
    let state = reduce(joined(), { type: 'CLAIM_FLOOR', userId: B }, T0);
    state = reduce(state, { type: 'DISCONNECTED', userId: B }, T0 + 1_000);
    state = tick(state, T0 + 1_000 + DISCONNECT_GRACE_MS);
    expect(state.floor.holder).toBeNull();
    expect(isPresent(state, B)).toBe(false);
    expect(state.floor.lastClaimedAt[B]).toBeDefined();
  });

  it('is bounded by the drop rather than by either timer', () => {
    // There were two bounds and they coincided at a minute — the grace period
    // from the drop, the claim's own expiry from the claim — so a room whose
    // speaker vanished waited out the rest of that minute whichever was asked
    // first. The drop is now the earliest of the three by a wide margin, and
    // this pins that ordering rather than the timers, so a later change to
    // either bound does not have to care.
    expect(DISCONNECT_GRACE_MS).toBeLessThanOrEqual(FLOOR_CLAIM_MS);

    let state = reduce(joined(), { type: 'CLAIM_FLOOR', userId: B }, T0);
    state = reduce(state, { type: 'DISCONNECTED', userId: B }, T0);
    expect(state.floor.holder).toBeNull();
    expect(canClaimFloor(state, A, T0)).toBe(true);
  });
});

describe('when everyone disconnects', () => {
  it('empties the channel after the grace period, and leaves it standing', () => {
    // This used to run to an end: a minute of grace, then the empty-channel
    // minute, then gone. Only the first half survives — losing everyone is
    // now just an empty channel, which is a thing a channel is allowed to be.
    let state = joined();
    state = reduce(state, { type: 'DISCONNECTED', userId: A }, T0);
    state = reduce(state, { type: 'DISCONNECTED', userId: B }, T0);

    state = tick(state, T0 + DISCONNECT_GRACE_MS - 1);
    expect(state.status).toBe('active');
    expect(state.present).toHaveLength(2);

    state = tick(state, T0 + DISCONNECT_GRACE_MS);
    expect(state.present).toHaveLength(0);
    expect(state.status).toBe('active');

    // No later tick ends it, however long anyone waits.
    state = tick(state, T0 + DISCONNECT_GRACE_MS + 24 * 60 * 60 * 1000);
    expect(state.status).toBe('active');
    // And both are still members, so it is still on both their Home screens.
    expect(state.participants).toEqual([A, B]);
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

/**
 * The other thing the grace period must not withhold.
 *
 * Everything the grace holds belongs to the person who dropped; being called
 * back belongs to everybody else, and it is the one act that is *only* useful
 * while they are gone. The case that named it: somebody steps in, pockets the
 * phone, and whoever came for the arrival notification finds them described as
 * present and cannot reach them for a minute.
 */
describe('calling somebody back', () => {
  it('is refused while they are standing in the room', () => {
    expect(canPing(joined(), A, B)).toBe(false);
  });

  it('is allowed the moment their connection is noticed to be dead', () => {
    const state = reduce(joined(), { type: 'DISCONNECTED', userId: B }, T0);
    // Still present, deliberately — and still unable to hear a word of it.
    expect(isPresent(state, B)).toBe(true);
    expect(canPing(state, A, B)).toBe(true);
  });

  it('is refused again the moment they are back', () => {
    let state = reduce(joined(), { type: 'DISCONNECTED', userId: B }, T0);
    state = reduce(state, { type: 'CONNECTED', userId: B }, T0 + 10_000);
    expect(canPing(state, A, B)).toBe(false);
  });

  it('outlasts the grace period, the person being plainly gone by then', () => {
    let state = reduce(joined(), { type: 'DISCONNECTED', userId: B }, T0);
    state = tick(state, T0 + DISCONNECT_GRACE_MS);
    expect(canPing(state, A, B)).toBe(true);
  });

  it('is never a thing you do to yourself, or to a stranger', () => {
    const state = reduce(joined(), { type: 'DISCONNECTED', userId: B }, T0);
    expect(canPing(state, B, B)).toBe(false);
    expect(canPing(state, A, 'user-c')).toBe(false);
  });
});
