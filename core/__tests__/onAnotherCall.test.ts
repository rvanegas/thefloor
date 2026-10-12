import { createChannel, isOnAnotherCall, reduce } from '../channel';
import type { ChannelAction, ChannelState } from '../types';

/**
 * Being held for another call: a report about a device, which changes the
 * roster's word for the sender and gives up a floor they held.
 */

const A = 'user-a';
const B = 'user-b';
const T0 = 1_700_000_000_000;

function apply(state: ChannelState, actions: ChannelAction[], now = T0): ChannelState {
  return actions.reduce((s, action) => reduce(s, action, now), state);
}

/** A and B both in the room. */
function room(): ChannelState {
  return reduce(
    createChannel({ id: 's1', initiator: A, invitees: [B], now: T0 }),
    { type: 'ENTER', userId: B },
    T0
  );
}

const held = (userId: string, onCall = true): ChannelAction => ({
  type: 'ON_ANOTHER_CALL',
  userId,
  onCall,
});

describe('on another call', () => {
  it('is said of somebody in the room, and unsaid when they come back', () => {
    const state = apply(room(), [held(B)]);
    expect(isOnAnotherCall(state, B)).toBe(true);
    expect(isOnAnotherCall(state, A)).toBe(false);
    expect(isOnAnotherCall(apply(state, [held(B, false)]), B)).toBe(false);
  });

  it('is refused to somebody who is not in the room', () => {
    const state = apply(room(), [{ type: 'STEP_OUT', userId: B }, held(B)]);
    expect(state.onAnotherCall).toEqual([]);
  });

  it('changes nothing when it agrees with what is already said', () => {
    const state = apply(room(), [held(B)]);
    expect(reduce(state, held(B), T0)).toBe(state);
    expect(reduce(room(), held(B, false), T0)).toEqual(room());
  });

  it('stops being said when they step out, with no clause of its own', () => {
    const state = apply(room(), [held(B), { type: 'STEP_OUT', userId: B }]);
    expect(isOnAnotherCall(state, B)).toBe(false);
  });

  it('is cleared by an arrival, which is a device that is not held', () => {
    const state = apply(room(), [
      held(B),
      { type: 'STEP_OUT', userId: B },
      { type: 'ENTER', userId: B },
    ]);
    expect(isOnAnotherCall(state, B)).toBe(false);
  });

  it('gives up a floor the held person had, and does not return it', () => {
    const claimed = apply(room(), [{ type: 'CLAIM_FLOOR', userId: B }]);
    expect(claimed.floor.holder).toBe(B);

    const away = apply(claimed, [held(B)]);
    expect(away.floor.holder).toBeNull();
    expect(apply(away, [held(B, false)]).floor.holder).toBeNull();
  });

  it("leaves somebody else's floor alone", () => {
    const claimed = apply(room(), [{ type: 'CLAIM_FLOOR', userId: A }]);
    expect(apply(claimed, [held(B)]).floor.holder).toBe(A);
  });
});
