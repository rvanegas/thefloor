import {
  createChannel,
  idleMs,
  isWaiting,
  lastPresenceAt,
  reduce,
} from '../channel';
import { DISCONNECT_GRACE_MS, WAITING_WINDOW_MS } from '../constants';
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

  it('runs from when the connection dropped, not from the timer giving up', () => {
    // Reversed on 2026-08-20, having asserted the opposite since the timer was
    // built. The old reasoning was that the grace period is time they were
    // still in the channel, so dating the absence from the drop would report a
    // minute they had not yet been away — which reads presence as a *place
    // held for them* rather than as evidence, and is the model the 2026-08-18
    // change replaced without this assertion being revisited.
    //
    // Nobody heard anything from them after the drop. The grace is the
    // server's optimism about whether they are coming back, and optimism is
    // not an observation: a phone iOS suspended the instant it was pocketed is
    // unreachable for the whole of that minute, and saying it had been idle
    // for no time at all was the roster stating something nobody could check.
    // The heartbeat is what production has and the reducer does not: in the
    // server `stillHere` fires on every message a socket carries, so the last
    // one before the silence is the evidence this is measured from.
    const heard = T0 + 30_000;
    let s = reduce(pair(), { type: 'STILL_HERE', userId: B }, heard);
    s = reduce(s, { type: 'DISCONNECTED', userId: B }, heard);
    s = reduce(s, { type: 'TICK' }, heard + DISCONNECT_GRACE_MS + 1);
    expect(s.present).not.toContain(B);
    expect(idleMs(s, B, heard + DISCONNECT_GRACE_MS + 1)).toBe(
      DISCONNECT_GRACE_MS + 1
    );
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

  it('is refreshed by evidence, so a live conversation keeps its stamp fresh', () => {
    // The point of the whole field. Nothing on screen changes while somebody
    // is present — `idleMs` says null for them either way — but this is the
    // value a restart leaves behind, and it has to be the last thing heard
    // rather than the last thing chosen.
    let s = pair();
    s = reduce(s, { type: 'STILL_HERE', userId: B }, T0 + 5_000);
    expect(s.lastPresentAt[B]).toBe(T0 + 5_000);
    s = reduce(s, { type: 'STILL_HERE', userId: B }, T0 + 10_000);
    expect(s.lastPresentAt[B]).toBe(T0 + 10_000);
    // Still not an absence: they are here, and the number is not for reading
    // until they are not.
    expect(idleMs(s, B, T0 + 10_000)).toBeNull();
  });

  it('overwrites a stale departure once they are back', () => {
    // The bug this design replaces. Stepping out on Monday and returning on
    // Thursday used to leave Monday in the durable state, gated only by
    // `present` — which a restart drops, un-gating a three-day-old departure
    // for somebody who had been talking a second earlier.
    const monday = T0;
    const thursday = T0 + 3 * 24 * 60 * 60 * 1_000;
    let s = reduce(pair(), { type: 'STEP_OUT', userId: B }, monday);
    s = reduce(s, { type: 'ENTER', userId: B }, thursday);
    // Walking in is itself the evidence, so Monday is gone at that moment
    // rather than at the first heartbeat after it. This asserted `monday`
    // until 2026-08-20, and that gap — one heartbeat in the server, unbounded
    // in the reducer — was time during which the stale stamp was the only
    // answer available.
    expect(s.lastPresentAt[B]).toBe(thursday);
    s = reduce(s, { type: 'STILL_HERE', userId: B }, thursday + 5_000);
    expect(s.lastPresentAt[B]).toBe(thursday + 5_000);
  });

  it('takes no evidence from somebody who is only watching', () => {
    // A phone that has stepped out is still on the channel screen and still
    // sending heartbeats. Counting those would overwrite the departure with a
    // stream of proof that they are gone.
    const left = T0 + 1_000;
    const s = reduce(pair(), { type: 'STEP_OUT', userId: B }, left);
    const after = reduce(s, { type: 'STILL_HERE', userId: B }, left + 30_000);
    expect(after).toBe(s);
    expect(idleMs(after, B, left + 30_000)).toBe(30_000);
  });

  it('says nothing about somebody who has never been here', () => {
    // An invitee's socket watches the channel before they ever enter it. The
    // presence guard is what stops that inventing an arrival they never made.
    const s = createChannel({ id: 's1', initiator: A, invitees: [B], now: T0 });
    const after = reduce(s, { type: 'STILL_HERE', userId: B }, T0 + 5_000);
    expect(after).toBe(s);
    expect(after.lastPresentAt[B]).toBeUndefined();
  });

  it('leaves the other person alone', () => {
    const s = reduce(pair(), { type: 'STEP_OUT', userId: B }, T0);
    expect(idleMs(s, A, T0 + 60_000)).toBeNull();
    expect(s.lastPresentAt[A]).toBeUndefined();
  });
});

/**
 * The same question asked about the room rather than about a person, which is
 * what a channel card on Home reads. `idleMs` cannot answer it: it is per
 * person, and null both for somebody who is here and for somebody who never
 * was, which are opposite facts about the channel.
 */
describe('how long it is since anybody was in a channel', () => {
  it('is the moment it was made, before anybody has moved', () => {
    const s = createChannel({ id: 's1', initiator: A, invitees: [B], now: T0 });
    expect(lastPresenceAt(s)).toBe(T0);
  });

  it('is the *least* idle member, not the most', () => {
    // B wandered off on Monday; A was here an hour ago. The room is an hour
    // idle. Taking the minimum would describe it by whoever has been away
    // longest, which is a fact about a person and not about the place.
    const monday = T0;
    const recent = T0 + 3 * 24 * 60 * 60 * 1_000;
    let s = reduce(pair(), { type: 'STEP_OUT', userId: B }, monday);
    s = reduce(s, { type: 'STILL_HERE', userId: A }, recent);
    expect(lastPresenceAt(s)).toBe(recent);
  });

  it('keeps moving while somebody is in it', () => {
    // What `lastActiveAt` cannot do: it is written on an entry and an exit and
    // at no point between, so an hour of conversation leaves it where it was.
    let s = pair();
    const started = s.lastActiveAt;
    s = reduce(s, { type: 'STILL_HERE', userId: A }, T0 + 3_600_000);
    expect(s.lastActiveAt).toBe(started);
    expect(lastPresenceAt(s)).toBe(T0 + 3_600_000);
  });

  it('falls back to the last entry or exit when no stamp is fresher', () => {
    // A channel revived from a durable projection carries stamps floored to
    // the minute, so the exit recorded in `lastActiveAt` can be the better
    // evidence of the very same departure. Taking the maximum of the two kinds
    // is what makes that impossible to get wrong.
    const s = reduce(pair(), { type: 'STEP_OUT', userId: B }, T0 + 90_000);
    const quantised: typeof s = { ...s, lastPresentAt: { [B]: T0 + 60_000 } };
    expect(lastPresenceAt(quantised)).toBe(T0 + 90_000);
  });

  it('never goes backwards when somebody leaves', () => {
    const s = reduce(pair(), { type: 'STEP_OUT', userId: B }, T0 + 10_000);
    expect(lastPresenceAt(s)).toBe(T0 + 10_000);
    const later = reduce(s, { type: 'STEP_OUT', userId: A }, T0 + 20_000);
    expect(lastPresenceAt(later)).toBe(T0 + 20_000);
  });
});

describe('waiting, which is an absence nobody chose', () => {
  /** B present, then their connection expires at `heard + grace`. */
  function dropped(heard = T0 + 30_000) {
    let s = reduce(pair(), { type: 'STILL_HERE', userId: B }, heard);
    s = reduce(s, { type: 'DISCONNECTED', userId: B }, heard);
    return reduce(s, { type: 'TICK' }, heard + DISCONNECT_GRACE_MS + 1);
  }

  it('is not a thing somebody present is doing', () => {
    expect(isWaiting(pair(), B, T0)).toBe(false);
  });

  it('is what a lost connection leaves behind', () => {
    const heard = T0 + 30_000;
    const s = dropped(heard);
    expect(s.waiting).toContain(B);
    expect(isWaiting(s, B, heard + DISCONNECT_GRACE_MS + 1)).toBe(true);
  });

  it('is not what a tap leaves behind', () => {
    // The whole distinction. Stepping out is leaving, and somebody who left is
    // not holding on for anybody.
    const s = reduce(pair(), { type: 'STEP_OUT', userId: B }, T0);
    expect(s.waiting).not.toContain(B);
    expect(isWaiting(s, B, T0 + 60_000)).toBe(false);
  });

  it('stops being worth saying after the window', () => {
    const heard = T0 + 30_000;
    const s = dropped(heard);
    expect(isWaiting(s, B, heard + WAITING_WINDOW_MS - 1)).toBe(true);
    expect(isWaiting(s, B, heard + WAITING_WINDOW_MS)).toBe(false);
  });

  it('hands over to idleness without resetting the clock', () => {
    // The point of measuring both from the same stamp: fifteen minutes of
    // waiting becomes sixteen minutes of having stepped out, not a fresh zero
    // that reads as though they were here until a moment ago.
    const heard = T0 + 30_000;
    const s = dropped(heard);
    const lapsed = heard + WAITING_WINDOW_MS;
    expect(isWaiting(s, B, lapsed)).toBe(false);
    expect(idleMs(s, B, lapsed)).toBe(WAITING_WINDOW_MS);
  });

  it('ends when they come back', () => {
    const heard = T0 + 30_000;
    let s = dropped(heard);
    s = reduce(s, { type: 'ENTER', userId: B }, heard + 60_000);
    expect(s.waiting).not.toContain(B);
    expect(isWaiting(s, B, heard + 60_000)).toBe(false);
  });

  it('ends when they come back and then step out on purpose', () => {
    // Reconnecting clears it, and so does the departure that follows: coming
    // back only to leave is leaving, and must not fall back into a wait that
    // the earlier drop had started.
    const heard = T0 + 30_000;
    let s = dropped(heard);
    s = reduce(s, { type: 'ENTER', userId: B }, heard + 60_000);
    s = reduce(s, { type: 'STEP_OUT', userId: B }, heard + 90_000);
    expect(s.waiting).not.toContain(B);
  });
});
