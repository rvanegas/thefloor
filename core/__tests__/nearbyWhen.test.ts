import {
  createChannel,
  isWaiting,
  nearbyHoldsUntil,
  nearbyWhenFor,
  nearbyWhenOf,
  reduce,
} from '../channel';
import { MAX_NEARBY_AHEAD_MS, WAITING_WINDOW_MS } from '../constants';
import type { ChannelState, NearbyWhen } from '../types';

/**
 * Nearby, with a *when* — 2026-11-04.
 *
 * The answer Todd wanted to a ping he could not leave his recording for: *in
 * the flow*, *a few minutes*, *free at* a time. A qualification of a
 * declaration and nothing on its own, so what is tested is that it travels
 * with one, goes with one, and is never trusted off the wire. See
 * planning/decision/2026-11-04-nearby-says-when.md.
 */

const A = 'user-a';
const B = 'user-b';
const T0 = 1_700_000_040_000; // on a minute, so `at` rounding reads plainly
const MIN = 60_000;

const alone = (): ChannelState =>
  createChannel({ id: 's1', initiator: A, invitees: [B], now: T0 });

const declare = (
  state: ChannelState,
  when?: NearbyWhen | unknown,
  now = T0 + 1_000
) =>
  reduce(
    state,
    { type: 'DECLARE_NEARBY', userId: B, when: when as NearbyWhen },
    now
  );

describe('a declaration that says when', () => {
  it('keeps what it said, for the declarer alone', () => {
    const s = declare(alone(), { kind: 'flow' });
    expect(isWaiting(s, B)).toBe(true);
    expect(nearbyWhenOf(s, B)).toEqual({ kind: 'flow' });
    expect(nearbyWhenOf(s, A)).toBeNull();
  });

  it('is replaced by the next, and cleared by a plain one', () => {
    let s = declare(alone(), { kind: 'flow' });
    s = declare(s, { kind: 'soon' }, T0 + 2_000);
    expect(nearbyWhenOf(s, B)).toEqual({ kind: 'soon' });
    s = declare(s, undefined, T0 + 3_000);
    expect(nearbyWhenOf(s, B)).toBeNull();
  });

  it('says it from inside the room too, which steps them out', () => {
    const inside = reduce(alone(), { type: 'ENTER', userId: B }, T0);
    const s = declare(inside, { kind: 'soon' });
    expect(s.present).not.toContain(B);
    expect(nearbyWhenOf(s, B)).toEqual({ kind: 'soon' });
  });

  it('goes with every way the declaration ends', () => {
    const said = declare(alone(), { kind: 'flow' });
    for (const action of [
      { type: 'ENTER', userId: B },
      { type: 'STEP_OUT', userId: B },
      { type: 'ATTENTION_EXPIRED', userId: B },
    ] as const) {
      const after = reduce(said, action, T0 + 5_000);
      expect(after.nearbyWhen?.[B]).toBeUndefined();
    }
  });

  it('is not read off a stray entry that no declaration stands behind', () => {
    const stray = { ...alone(), nearbyWhen: { [B]: { kind: 'flow' } as const } };
    expect(nearbyWhenOf(stray, B)).toBeNull();
  });

  it('reads as nobody having said, off a snapshot older than the field', () => {
    const { nearbyWhen: _gone, ...old } = declare(alone(), { kind: 'flow' });
    expect(nearbyWhenOf(old as ChannelState, B)).toBeNull();
  });
});

describe('a when off the wire', () => {
  const now = T0;

  it('takes the three shapes and nothing else', () => {
    expect(nearbyWhenFor({ kind: 'flow' }, now)).toEqual({ kind: 'flow' });
    expect(nearbyWhenFor({ kind: 'soon' }, now)).toEqual({ kind: 'soon' });
    for (const junk of [
      null,
      'flow',
      { kind: 'later' },
      { kind: 'at' },
      { kind: 'at', at: 'noon' },
      { kind: 'at', at: Number.NaN },
      { kind: 'at', at: Number.POSITIVE_INFINITY },
    ]) {
      expect(nearbyWhenFor(junk, now)).toBeUndefined();
    }
  });

  it('rounds a time to the nearest minute a card can show', () => {
    expect(nearbyWhenFor({ kind: 'at', at: now + 20 * MIN - 1_500 }, now)).toEqual(
      { kind: 'at', at: now + 20 * MIN }
    );
  });

  it('clamps a time past an afternoon rather than refusing it', () => {
    expect(nearbyWhenFor({ kind: 'at', at: now + 24 * 60 * MIN }, now)).toEqual({
      kind: 'at',
      at: now + MAX_NEARBY_AHEAD_MS,
    });
  });

  it('reads a time already gone as a few minutes', () => {
    expect(nearbyWhenFor({ kind: 'at', at: now - MIN }, now)).toEqual({
      kind: 'soon',
    });
  });

  it('costs a malformed one the qualification, never the declaration', () => {
    const s = declare(alone(), { kind: 'whenever' });
    expect(isWaiting(s, B)).toBe(true);
    expect(nearbyWhenOf(s, B)).toBeNull();
  });
});

describe('how long a named time holds the wait open', () => {
  it('until the time plus the ordinary window', () => {
    const s = declare(alone(), { kind: 'at', at: T0 + 40 * MIN });
    expect(nearbyHoldsUntil(s, B)).toBe(T0 + 40 * MIN + WAITING_WINDOW_MS);
  });

  it('not at all for the two that name no moment', () => {
    expect(nearbyHoldsUntil(declare(alone(), { kind: 'flow' }), B)).toBeNull();
    expect(nearbyHoldsUntil(declare(alone(), { kind: 'soon' }), B)).toBeNull();
    expect(nearbyHoldsUntil(declare(alone()), B)).toBeNull();
  });
});
