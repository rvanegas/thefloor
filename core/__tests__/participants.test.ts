import { FLOOR_CLAIM_DELAY_STEP_MS, MAX_CHANNEL_PARTICIPANTS } from '../constants';
import {
  canClaimFloor,
  canInvite,
  createChannel,
  isInvited,
  isParticipant,
  otherParticipants,
  reduce,
} from '../channel';
import type { ChannelState } from '../types';

const A = 'usr_a';
const B = 'usr_b';
const C = 'usr_c';
const D = 'usr_d';
const T0 = 1_000_000;

/** A three-person channel with everyone present, unnamed. */
function trio(now = T0): ChannelState {
  let s = createChannel({ id: 's1', initiator: A, invitees: [B, C], now });
  s = reduce(s, { type: 'ENTER', userId: B }, now);
  s = reduce(s, { type: 'ENTER', userId: C }, now);
  return s;
}

/** The same three, in a channel somebody has named — which changes what an
 *  invitation means, and nothing else. */
function named(now = T0): ChannelState {
  return reduce(trio(now), { type: 'SET_NAME', userId: A, name: 'Standup' }, now);
}

describe('createChannel with several invitees', () => {
  it('lists every participant, initiator first', () => {
    const s = trio();
    expect(s.participants).toEqual([A, B, C]);
    expect(isParticipant(s, C)).toBe(true);
    expect(isParticipant(s, D)).toBe(false);
    expect(otherParticipants(s, B)).toEqual([A, C]);
    expect(s.selfMuted).toEqual({ [A]: false, [B]: false, [C]: false });
    expect(s.invitedBy).toEqual({ [B]: A, [C]: A });
  });

  it('rejects a structurally invalid roster', () => {
    expect(() =>
      createChannel({ id: 's1', initiator: A, invitees: [], now: T0 })
    ).toThrow();
    expect(() =>
      createChannel({ id: 's1', initiator: A, invitees: [A], now: T0 })
    ).toThrow();
    expect(() =>
      createChannel({ id: 's1', initiator: A, invitees: [B, B], now: T0 })
    ).toThrow();
    expect(() =>
      createChannel({
        id: 's1',
        initiator: A,
        invitees: ['u1', 'u2', 'u3', 'u4', 'u5', 'u6'],
        now: T0,
      })
    ).toThrow();
  });
});

describe('INVITE into a named channel', () => {
  it('adds a participant who then appears exactly like a creation invitee', () => {
    const s = named();
    const next = reduce(s, { type: 'INVITE', userId: B, inviteeId: D }, T0);
    expect(next.participants).toEqual([A, B, C, D]);
    expect(next.invitedBy[D]).toBe(B);
    expect(next.selfMuted[D]).toBe(false);
    // Not present until they enter, like any invitee.
    expect(next.present).not.toContain(D);
    const entered = reduce(next, { type: 'ENTER', userId: D }, T0 + 1);
    expect(entered.present).toContain(D);
    // Nothing pending: a named channel takes people in, so there is nothing
    // waiting to be settled elsewhere.
    expect(next.invited).toEqual({});
  });

  it('is a no-op for a non-participant inviter, a duplicate, or past the cap', () => {
    let s = named();
    expect(reduce(s, { type: 'INVITE', userId: D, inviteeId: 'usr_e' }, T0)).toBe(s);
    expect(reduce(s, { type: 'INVITE', userId: A, inviteeId: B }, T0)).toBe(s);

    for (let i = s.participants.length; i < MAX_CHANNEL_PARTICIPANTS; i++) {
      s = reduce(s, { type: 'INVITE', userId: A, inviteeId: `usr_extra${i}` }, T0);
    }
    expect(s.participants).toHaveLength(MAX_CHANNEL_PARTICIPANTS);
    expect(canInvite(s, A, 'usr_more')).toBe(false);
    expect(reduce(s, { type: 'INVITE', userId: A, inviteeId: 'usr_more' }, T0)).toBe(s);
  });

  it('lets a newcomer claim immediately, never having spoken', () => {
    let s = named();
    s = reduce(s, { type: 'CLAIM_FLOOR', userId: A }, T0);
    s = reduce(s, { type: 'RELEASE_FLOOR', userId: A }, T0 + 1_000);
    s = reduce(s, { type: 'INVITE', userId: A, inviteeId: D }, T0 + 2_000);
    s = reduce(s, { type: 'ENTER', userId: D }, T0 + 3_000);
    // D has never claimed, so D is among those at zero delay.
    expect(canClaimFloor(s, D, T0 + 3_001)).toBe(true);
    // A just released and two people spoke longer ago (B, C never claimed
    // counts as longest ago), so A waits.
    expect(canClaimFloor(s, A, T0 + 3_001)).toBe(false);
  });
});

describe('INVITE into an unnamed channel', () => {
  // An unnamed channel is its people. Asking somebody in cannot widen it — it
  // says the conversation is moving to the unnamed channel for the wider set,
  // and the reducer's whole part in that is to remember who was asked.
  it('records the invitation instead of adding a participant', () => {
    const s = trio();
    const next = reduce(s, { type: 'INVITE', userId: B, inviteeId: D }, T0);
    expect(next.participants).toEqual([A, B, C]);
    expect(next.invited).toEqual({ [D]: B });
    expect(isInvited(next, D)).toBe(true);
    expect(isParticipant(next, D)).toBe(false);
    // And nothing of the channel itself has changed but that.
    expect(next.invitedBy).toEqual(s.invitedBy);
    expect(next.selfMuted).toEqual(s.selfMuted);
    expect(next.present).toEqual(s.present);
  });

  it('leaves an invitee unable to act here, invited being not belonging', () => {
    const s = reduce(trio(), { type: 'INVITE', userId: A, inviteeId: D }, T0);
    // Every ordinary action is still refused: an invitation is a question, and
    // answering it happens elsewhere.
    expect(reduce(s, { type: 'ENTER', userId: D }, T0 + 1)).toBe(s);
    expect(reduce(s, { type: 'CLAIM_FLOOR', userId: D }, T0 + 1)).toBe(s);
    expect(reduce(s, { type: 'SET_NAME', userId: D, name: 'Mine' }, T0 + 1)).toBe(s);
  });

  it('forgets the invitation once it has been acted on', () => {
    let s = reduce(trio(), { type: 'INVITE', userId: A, inviteeId: D }, T0);
    s = reduce(s, { type: 'INVITE_TAKEN', inviteeId: D }, T0 + 1);
    expect(s.invited).toEqual({});
    // Idempotent: the server reports the move once, but a replay must not
    // resurrect anything.
    expect(reduce(s, { type: 'INVITE_TAKEN', inviteeId: D }, T0 + 2)).toBe(s);
  });

  it('refuses the same people the named branch refuses', () => {
    const s = trio();
    expect(reduce(s, { type: 'INVITE', userId: D, inviteeId: 'usr_e' }, T0)).toBe(s);
    expect(reduce(s, { type: 'INVITE', userId: A, inviteeId: B }, T0)).toBe(s);
  });
});

describe('TAKE_MEDIA_ROOM', () => {
  it('starts as the channel id and can be handed over', () => {
    const s = trio();
    expect(s.mediaRoom).toBe(s.id);

    const moved = reduce(s, { type: 'TAKE_MEDIA_ROOM', room: 'chan_other' }, T0);
    expect(moved.mediaRoom).toBe('chan_other');
    expect(moved.id).toBe(s.id);
    // No actor, so nothing about presence or membership moves with it.
    expect(moved.participants).toEqual(s.participants);
    expect(moved.present).toEqual(s.present);
  });

  it('is a no-op when it already holds that room', () => {
    const s = trio();
    expect(reduce(s, { type: 'TAKE_MEDIA_ROOM', room: s.id }, T0)).toBe(s);
  });

  it('can be given one at creation, for a conversation walking in', () => {
    const s = createChannel({
      id: 'chan_new',
      initiator: A,
      invitees: [B, C],
      now: T0,
      mediaRoom: 'chan_old',
    });
    expect(s.mediaRoom).toBe('chan_old');
  });
});

describe('the floor among three', () => {
  it('rotates gaplessly when everyone is eager', () => {
    let s = trio();
    let now = T0;
    // A claims, releases; B (never claimed) may claim at once; then C; then A
    // again — whoever spoke longest ago is always free.
    s = reduce(s, { type: 'CLAIM_FLOOR', userId: A }, now);
    now += 5_000;
    s = reduce(s, { type: 'RELEASE_FLOOR', userId: A }, now);
    expect(canClaimFloor(s, B, now)).toBe(true);
    s = reduce(s, { type: 'CLAIM_FLOOR', userId: B }, now);
    now += 5_000;
    s = reduce(s, { type: 'RELEASE_FLOOR', userId: B }, now);
    expect(canClaimFloor(s, C, now)).toBe(true);
    s = reduce(s, { type: 'CLAIM_FLOOR', userId: C }, now);
    now += 5_000;
    s = reduce(s, { type: 'RELEASE_FLOOR', userId: C }, now);
    // A spoke longest ago of the three claimants: free immediately.
    expect(canClaimFloor(s, A, now)).toBe(true);
    // B spoke second-longest ago: one step of delay, no more.
    expect(canClaimFloor(s, B, now)).toBe(false);
    expect(canClaimFloor(s, B, now + FLOOR_CLAIM_DELAY_STEP_MS)).toBe(true);
  });

  it('holds the recent speakers back while the quiet one is free', () => {
    let s = trio();
    let now = T0;
    s = reduce(s, { type: 'CLAIM_FLOOR', userId: A }, now);
    now += 5_000;
    s = reduce(s, { type: 'RELEASE_FLOOR', userId: A }, now);
    s = reduce(s, { type: 'CLAIM_FLOOR', userId: B }, now);
    now += 5_000;
    s = reduce(s, { type: 'RELEASE_FLOOR', userId: B }, now);
    // C never claimed: at zero. B claimed last: two people spoke longer ago,
    // so two steps. A: one step.
    expect(canClaimFloor(s, C, now)).toBe(true);
    expect(canClaimFloor(s, A, now)).toBe(false);
    expect(canClaimFloor(s, A, now + FLOOR_CLAIM_DELAY_STEP_MS)).toBe(true);
    expect(canClaimFloor(s, B, now + FLOOR_CLAIM_DELAY_STEP_MS)).toBe(false);
    expect(canClaimFloor(s, B, now + 2 * FLOOR_CLAIM_DELAY_STEP_MS)).toBe(true);
  });

  it('releases a departing holder and leaves the other two talking', () => {
    let s = trio();
    s = reduce(s, { type: 'CLAIM_FLOOR', userId: B }, T0);
    s = reduce(s, { type: 'STEP_OUT', userId: B }, T0 + 1_000);
    expect(s.floor.holder).toBeNull();
    expect(s.present).toEqual([A, C]);
    expect(s.status).toBe('active');
  });

  it('empties without ending when the last of them steps out', () => {
    let s = trio();
    s = reduce(s, { type: 'STEP_OUT', userId: A }, T0);
    s = reduce(s, { type: 'STEP_OUT', userId: B }, T0 + 1_000);
    s = reduce(s, { type: 'STEP_OUT', userId: C }, T0 + 2_000);
    expect(s.present).toEqual([]);
    expect(s.status).toBe('active');
    // All three still belong to it, and any of them can walk back in.
    expect(s.participants).toEqual([A, B, C]);
    s = reduce(s, { type: 'ENTER', userId: B }, T0 + 3_000);
    expect(s.present).toEqual([B]);
  });

  it('ends only when the third and last member deletes it', () => {
    let s = trio();
    s = reduce(s, { type: 'LEAVE_CHANNEL', userId: A }, T0);
    expect(s.status).toBe('active');
    s = reduce(s, { type: 'LEAVE_CHANNEL', userId: B }, T0 + 1_000);
    expect(s.status).toBe('active');
    expect(s.participants).toEqual([C]);
    // C cannot leave: with nobody else, that tap destroys the channel and
    // everything recorded in it, and is named for what it does.
    s = reduce(s, { type: 'LEAVE_CHANNEL', userId: C }, T0 + 2_000);
    expect(s.status).toBe('active');
    s = reduce(s, { type: 'DELETE_CHANNEL', userId: C }, T0 + 2_000);
    expect(s.status).toBe('ended');
    expect(s.endedAt).toBe(T0 + 2_000);
  });
});
