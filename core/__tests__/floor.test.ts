import {
  FLOOR_CLAIM_MS,
  FLOOR_CLAIM_DELAY_STEP_MS,
} from '../constants';
import {
  claimDelayMs,
  cooldownRemainingMs,
  floorRemainingMs,
  isSilenced,
} from '../floor';
import {
  canClaimFloor,
  canDeleteChannel,
  canLeaveChannel,
  canSetSelfMute,
  createChannel,
  reduce,
} from '../channel';
import type { ChannelAction, ChannelState } from '../types';

const A = 'user-a';
const B = 'user-b';
const T0 = 1_700_000_000_000;

function newSession(now = T0): ChannelState {
  return createChannel({ id: 's1', initiator: A, invitees: [B], now });
}

/** Both parties present and idle, the normal starting point for floor tests. */
function joined(now = T0): ChannelState {
  return reduce(newSession(now), { type: 'ENTER', userId: B }, now);
}

function apply(
  state: ChannelState,
  steps: Array<[ChannelAction, number]>
): ChannelState {
  return steps.reduce((s, [action, at]) => reduce(s, action, at), state);
}

describe('eligibility rule', () => {
  it('lets either user make the first claim', () => {
    const s = joined();
    expect(canClaimFloor(s, A, T0)).toBe(true);
    expect(canClaimFloor(s, B, T0)).toBe(true);
  });

  it('blocks a claim while anyone holds the floor', () => {
    const s = reduce(joined(), { type: 'CLAIM_FLOOR', userId: A }, T0);
    expect(s.floor.holder).toBe(A);
    expect(canClaimFloor(s, A, T0 + 1)).toBe(false);
    expect(canClaimFloor(s, B, T0 + 1)).toBe(false);
  });

  it('makes it impossible for both users to be silenced at once', () => {
    // B, already silenced by A's claim, cannot claim their way out of it.
    const s = reduce(joined(), { type: 'CLAIM_FLOOR', userId: A }, T0);
    const attempted = reduce(s, { type: 'CLAIM_FLOOR', userId: B }, T0 + 1000);
    expect(attempted.floor.holder).toBe(A);
    expect(isSilenced(attempted.floor, A)).toBe(false);
    expect(isSilenced(attempted.floor, B)).toBe(true);
  });

  it('lets the other user claim immediately after a release', () => {
    const s = apply(joined(), [
      [{ type: 'CLAIM_FLOOR', userId: A }, T0],
      [{ type: 'RELEASE_FLOOR', userId: A }, T0 + 5_000],
    ]);
    expect(canClaimFloor(s, B, T0 + 5_000)).toBe(true);
  });

  it('makes the most recent speaker wait a step before reclaiming', () => {
    // With two present, A has spoken more recently than B, so A waits one step
    // and B waits none. Nobody ever waits two steps in a pair — that tier only
    // appears once a third person is in the ordering.
    const releasedAt = T0 + 5_000;
    const s = apply(joined(), [
      [{ type: 'CLAIM_FLOOR', userId: A }, T0],
      [{ type: 'RELEASE_FLOOR', userId: A }, releasedAt],
    ]);
    expect(canClaimFloor(s, A, releasedAt)).toBe(false);
    expect(
      canClaimFloor(s, A, releasedAt + FLOOR_CLAIM_DELAY_STEP_MS - 1)
    ).toBe(false);
    expect(canClaimFloor(s, A, releasedAt + FLOOR_CLAIM_DELAY_STEP_MS)).toBe(
      true
    );
  });

  it('always leaves somebody able to claim without waiting', () => {
    // The invariant the whole rule is shaped around. If everyone present owed
    // a delay, the floor would sit free and unclaimable — dead time nobody
    // asked for.
    const releasedAt = T0 + 5_000;
    const s = apply(joined(), [
      [{ type: 'CLAIM_FLOOR', userId: A }, T0],
      [{ type: 'RELEASE_FLOOR', userId: A }, releasedAt],
    ]);
    const waits = s.present.map((u) => claimDelayMs(s.floor, s.present, u));
    expect(Math.min(...waits)).toBe(0);
  });

  it('reports the wait only for whoever is actually held back', () => {
    const releasedAt = T0 + 5_000;
    const s = apply(joined(), [
      [{ type: 'CLAIM_FLOOR', userId: A }, T0],
      [{ type: 'RELEASE_FLOOR', userId: A }, releasedAt],
    ]);
    expect(cooldownRemainingMs(s.floor, s.present, A, releasedAt + 4_000)).toBe(
      6_000
    );
    expect(
      cooldownRemainingMs(s.floor, s.present, B, releasedAt + 4_000)
    ).toBeNull();
  });

  it('is unaffected by self-mute', () => {
    const s = reduce(joined(), { type: 'SET_SELF_MUTE', userId: A, muted: true }, T0);
    expect(canClaimFloor(s, A, T0)).toBe(true);
    expect(canClaimFloor(s, B, T0)).toBe(true);
  });
});

describe('the floor and self-mute', () => {
  it('unmutes the claimant, who claimed in order to speak', () => {
    // Nobody takes the floor to stay silent, and a muted holder is the one
    // arrangement in which every microphone in the channel is shut: theirs by
    // their own hand, everyone else's by the claim.
    let s = reduce(joined(), { type: 'SET_SELF_MUTE', userId: A, muted: true }, T0);
    expect(s.selfMuted[A]).toBe(true);

    s = reduce(s, { type: 'CLAIM_FLOOR', userId: A }, T0 + 1_000);
    expect(s.floor.holder).toBe(A);
    expect(s.selfMuted[A]).toBe(false);
  });

  it('refuses to let the holder mute again until they release', () => {
    let s = reduce(joined(), { type: 'CLAIM_FLOOR', userId: A }, T0);
    expect(canSetSelfMute(s, A, true)).toBe(false);

    s = reduce(s, { type: 'SET_SELF_MUTE', userId: A, muted: true }, T0 + 1_000);
    expect(s.selfMuted[A]).toBe(false);

    // Releasing is the way to stop talking, and it gives the mute back.
    s = reduce(s, { type: 'RELEASE_FLOOR', userId: A }, T0 + 2_000);
    expect(canSetSelfMute(s, A, true)).toBe(true);
    s = reduce(s, { type: 'SET_SELF_MUTE', userId: A, muted: true }, T0 + 3_000);
    expect(s.selfMuted[A]).toBe(true);
  });

  it('lets a claim that expires give the mute back', () => {
    // The auto-release at three minutes is a release like any other.
    let s = reduce(joined(), { type: 'CLAIM_FLOOR', userId: A }, T0);
    s = reduce(s, { type: 'TICK' }, T0 + FLOOR_CLAIM_MS);
    expect(s.floor.holder).toBeNull();
    expect(canSetSelfMute(s, A, true)).toBe(true);
  });

  it('leaves the silenced free to mute themselves', () => {
    // B's mute does nothing while A holds the floor, but it is B's to set, and
    // it is what B is left with when the claim ends.
    let s = reduce(joined(), { type: 'CLAIM_FLOOR', userId: A }, T0);
    expect(canSetSelfMute(s, B, true)).toBe(true);

    s = reduce(s, { type: 'SET_SELF_MUTE', userId: B, muted: true }, T0 + 1_000);
    expect(s.selfMuted[B]).toBe(true);

    s = reduce(s, { type: 'RELEASE_FLOOR', userId: A }, T0 + 2_000);
    expect(s.selfMuted[B]).toBe(true);
  });

  it('never blocks unmuting', () => {
    const s = reduce(joined(), { type: 'CLAIM_FLOOR', userId: A }, T0);
    expect(canSetSelfMute(s, A, false)).toBe(true);
  });

  it('leaves everyone else’s mute alone when someone claims', () => {
    let s = reduce(joined(), { type: 'SET_SELF_MUTE', userId: B, muted: true }, T0);
    s = reduce(s, { type: 'CLAIM_FLOOR', userId: A }, T0 + 1_000);
    expect(s.selfMuted[B]).toBe(true);
  });
});

describe('presence gating', () => {
  it('disables the claim control while a user is alone', () => {
    const alone = newSession();
    expect(alone.present).toEqual([A]);
    expect(canClaimFloor(alone, A, T0)).toBe(false);

    const together = reduce(alone, { type: 'ENTER', userId: B }, T0 + 1000);
    expect(canClaimFloor(together, A, T0 + 1000)).toBe(true);

    const bLeft = reduce(together, { type: 'STEP_OUT', userId: B }, T0 + 2000);
    expect(canClaimFloor(bLeft, A, T0 + 2000)).toBe(false);
  });
});

describe('claim expiry', () => {
  it('auto-releases at exactly three minutes', () => {
    const claimed = reduce(joined(), { type: 'CLAIM_FLOOR', userId: A }, T0);
    const justBefore = reduce(claimed, { type: 'TICK' }, T0 + FLOOR_CLAIM_MS - 1);
    expect(justBefore.floor.holder).toBe(A);

    const at = reduce(claimed, { type: 'TICK' }, T0 + FLOOR_CLAIM_MS);
    expect(at.floor.holder).toBeNull();
    expect(at.floor.lastClaimedAt[A]).toBe(T0);
    expect(at.floor.lastReleasedAt).toBe(T0 + FLOOR_CLAIM_MS);
  });

  it('counts down remaining claim time', () => {
    const claimed = reduce(joined(), { type: 'CLAIM_FLOOR', userId: A }, T0);
    expect(floorRemainingMs(claimed.floor, T0 + 60_000)).toBe(FLOOR_CLAIM_MS - 60_000);
    expect(floorRemainingMs(joined().floor, T0)).toBeNull();
  });
});

describe('intended emergent behavior', () => {
  it('produces strict gapless alternation under maximal mutual use', () => {
    // Each party claims the moment they are eligible and rides out the full
    // three minutes. The result should be exactly symmetric turns.
    let s = joined();
    let now = T0;
    const turns: Array<{ holder: string; start: number; end: number }> = [];

    for (let i = 0; i < 6; i++) {
      const claimant = i % 2 === 0 ? A : B;
      expect(canClaimFloor(s, claimant, now)).toBe(true);
      s = reduce(s, { type: 'CLAIM_FLOOR', userId: claimant }, now);
      const start = now;

      now += FLOOR_CLAIM_MS;
      s = reduce(s, { type: 'TICK' }, now);
      expect(s.floor.holder).toBeNull();
      turns.push({ holder: claimant, start, end: now });

      // The party who just held it is locked out; the other may claim at once.
      expect(canClaimFloor(s, claimant, now)).toBe(false);
      expect(canClaimFloor(s, claimant === A ? B : A, now)).toBe(true);
    }

    expect(turns.map((t) => t.holder)).toEqual([A, B, A, B, A, B]);
    // No gaps: each turn begins the instant the previous one ends.
    turns.slice(1).forEach((turn, i) => {
      expect(turn.start).toBe(turns[i].end);
      expect(turn.end - turn.start).toBe(FLOOR_CLAIM_MS);
    });

    const totalFor = (u: string) =>
      turns.filter((t) => t.holder === u).reduce((n, t) => n + (t.end - t.start), 0);
    expect(totalFor(A)).toBe(totalFor(B));
  });

  it('lets one party repeatedly reclaim when the other never claims', () => {
    // Fairness is conditional: with B passive, A may hold the floor again and
    // again, subject only to the one-minute wait after their own release.
    let s = joined();
    let now = T0;
    for (let i = 0; i < 3; i++) {
      s = reduce(s, { type: 'CLAIM_FLOOR', userId: A }, now);
      expect(s.floor.holder).toBe(A);
      now += FLOOR_CLAIM_MS;
      s = reduce(s, { type: 'TICK' }, now);
      now += FLOOR_CLAIM_DELAY_STEP_MS;
      expect(canClaimFloor(s, A, now)).toBe(true);
    }
  });
});

describe('leaving and the floor', () => {
  it('force-releases the departing holder’s claim', () => {
    const claimed = reduce(joined(), { type: 'CLAIM_FLOOR', userId: A }, T0);
    const left = reduce(claimed, { type: 'STEP_OUT', userId: A }, T0 + 10_000);
    expect(left.floor.holder).toBeNull();
    expect(left.floor.lastClaimedAt[A]).toBeDefined();
    expect(left.floor.lastReleasedAt).toBe(T0 + 10_000);
    // B is no longer silenced, but is now alone, so cannot claim.
    expect(isSilenced(left.floor, B)).toBe(false);
    expect(canClaimFloor(left, B, T0 + 10_000)).toBe(false);
  });

  it('applies the ordinary eligibility rule to whoever re-enters', () => {
    const s = apply(joined(), [
      [{ type: 'CLAIM_FLOOR', userId: A }, T0],
      [{ type: 'STEP_OUT', userId: A }, T0 + 10_000],
      [{ type: 'ENTER', userId: A }, T0 + 12_000],
    ]);
    // A's own claim was the most recent, so A still owes the cooldown.
    expect(canClaimFloor(s, A, T0 + 12_000)).toBe(false);
    expect(canClaimFloor(s, B, T0 + 12_000)).toBe(true);
  });

  it('leaves the other party’s claim untouched', () => {
    const s = apply(joined(), [
      [{ type: 'CLAIM_FLOOR', userId: A }, T0],
      [{ type: 'STEP_OUT', userId: B }, T0 + 10_000],
    ]);
    expect(s.floor.holder).toBe(A);
  });
});

describe('channel lifecycle', () => {
  it('outlives an empty channel indefinitely', () => {
    // The whole point of a channel: nobody present is not a countdown to
    // anything. This used to end sixty seconds after the last person left.
    const empty = reduce(newSession(), { type: 'STEP_OUT', userId: A }, T0 + 1_000);
    expect(empty.present).toEqual([]);

    const aDayLater = reduce(empty, { type: 'TICK' }, T0 + 24 * 60 * 60 * 1000);
    expect(aDayLater.status).toBe('active');

    // And it can still be walked back into.
    const back = reduce(aDayLater, { type: 'ENTER', userId: A }, T0 + 25 * 60 * 60 * 1000);
    expect(back.present).toEqual([A]);
  });

  it('continues with one party after the other steps out', () => {
    const s = reduce(joined(), { type: 'STEP_OUT', userId: B }, T0 + 5_000);
    expect(s.status).toBe('active');
    expect(s.present).toEqual([A]);
    expect(s.participants).toEqual([A, B]);
  });

  it('clears their self-mute, so they are audible when they come back', () => {
    // A mute is something you do during a conversation — to cough, to type, to
    // talk to whoever is in the room with you. Carried across a departure it
    // becomes a decision made an hour ago and long forgotten: you walk back in
    // inaudible, nobody hears you, and nothing on the way in says why.
    let s = reduce(joined(), { type: 'SET_SELF_MUTE', userId: B, muted: true }, T0);
    s = reduce(s, { type: 'STEP_OUT', userId: B }, T0 + 5_000);
    expect(s.selfMuted[B]).toBe(false);

    const back = reduce(s, { type: 'ENTER', userId: B }, T0 + 10_000);
    expect(back.selfMuted[B]).toBe(false);
  });

  it('leaves everyone else’s mute alone', () => {
    let s = reduce(joined(), { type: 'SET_SELF_MUTE', userId: A, muted: true }, T0);
    s = reduce(s, { type: 'STEP_OUT', userId: B }, T0 + 5_000);
    expect(s.selfMuted[A]).toBe(true);
  });

  it('keeps a member on the roster when they step out', () => {
    const s = reduce(joined(), { type: 'STEP_OUT', userId: B }, T0 + 5_000);
    // Presence and membership are different things: B is gone from the room
    // and still belongs to the channel, which is what puts it on their Home.
    expect(s.present).not.toContain(B);
    expect(s.participants).toContain(B);
    expect(s.everPresent).toContain(B);
  });

  it('does not end while anyone still belongs to it', () => {
    const s = reduce(joined(), { type: 'LEAVE_CHANNEL', userId: B }, T0 + 5_000);
    expect(s.status).toBe('active');
    expect(s.participants).toEqual([A]);
    expect(s.present).toEqual([A]);
    // B is gone from every map that named them.
    expect(s.everPresent).not.toContain(B);
    expect(s.selfMuted).not.toHaveProperty(B);
    expect(s.invitedBy).not.toHaveProperty(B);
  });

  it('ends when its last member deletes it, and irreversibly', () => {
    const s = apply(joined(), [
      [{ type: 'LEAVE_CHANNEL', userId: B }, T0 + 5_000],
      [{ type: 'DELETE_CHANNEL', userId: A }, T0 + 6_000],
    ]);
    expect(s.status).toBe('ended');
    expect(s.endedAt).toBe(T0 + 6_000);
    expect(s.participants).toEqual([]);

    // Re-entry is no longer possible.
    const attempted = reduce(s, { type: 'ENTER', userId: A }, T0 + 7_000);
    expect(attempted.present).toEqual([]);
    expect(attempted).toBe(s);
  });

  it('refuses to let the last member leave, deletion being the only way out', () => {
    // Leaving means the others keep it. With nobody else, the same tap would
    // destroy the channel and every recording in it — so it is not the same
    // tap, and the reducer will not perform it under the gentler name.
    const alone = reduce(joined(), { type: 'LEAVE_CHANNEL', userId: B }, T0 + 5_000);
    expect(alone.participants).toEqual([A]);

    const attempted = reduce(alone, { type: 'LEAVE_CHANNEL', userId: A }, T0 + 6_000);
    expect(attempted).toBe(alone);
    expect(attempted.status).toBe('active');
    expect(canLeaveChannel(alone, A)).toBe(false);
    expect(canDeleteChannel(alone, A)).toBe(true);
  });

  it('offers deletion only to the last member', () => {
    const two = joined();
    expect(canDeleteChannel(two, A)).toBe(false);
    expect(canDeleteChannel(two, B)).toBe(false);
    expect(canLeaveChannel(two, A)).toBe(true);

    // And not to somebody who was never in it.
    const alone = reduce(two, { type: 'LEAVE_CHANNEL', userId: B }, T0 + 5_000);
    expect(canDeleteChannel(alone, B)).toBe(false);
    expect(reduce(alone, { type: 'DELETE_CHANNEL', userId: B }, T0 + 6_000)).toBe(
      alone
    );
  });

  it('releases the floor when its holder leaves the channel', () => {
    const s = apply(joined(), [
      [{ type: 'CLAIM_FLOOR', userId: B }, T0 + 1_000],
      [{ type: 'LEAVE_CHANNEL', userId: B }, T0 + 2_000],
    ]);
    expect(s.floor.holder).toBeNull();
    expect(s.status).toBe('active');
  });

  it('is inert for someone who is not a member', () => {
    const s = joined();
    expect(reduce(s, { type: 'LEAVE_CHANNEL', userId: 'user-x' }, T0)).toBe(s);
  });
});

describe('the claim delay with more than two people', () => {
  /**
   * Channels still hold exactly two, but the rule does not. Testing it against
   * a synthetic set of participants proves the design before the data model
   * changes to allow a third — which is the expensive part, and the wrong place
   * to discover the rule was wrong.
   */
  const C = 'user-c';
  const D = 'user-d';
  const at = (claims: Record<string, number>) => ({
    holder: null,
    claimedAt: null,
    lastClaimedAt: claims,
    lastReleasedAt: T0,
  });

  it('lets whoever spoke longest ago claim immediately', () => {
    // C most recent, then B, then A.
    const floor = at({ [A]: T0 - 30_000, [B]: T0 - 20_000, [C]: T0 - 10_000 });
    const present = [A, B, C];
    expect(claimDelayMs(floor, present, A)).toBe(0);
    expect(claimDelayMs(floor, present, B)).toBe(FLOOR_CLAIM_DELAY_STEP_MS);
    expect(claimDelayMs(floor, present, C)).toBe(FLOOR_CLAIM_DELAY_STEP_MS * 2);
  });

  it('treats never having claimed as having spoken longest ago', () => {
    // The case the rule exists for: two people trading while a third waits.
    // The pair are held back and the quiet one has the floor to themselves.
    const floor = at({ [A]: T0 - 20_000, [B]: T0 - 10_000 });
    const present = [A, B, C];
    expect(claimDelayMs(floor, present, C)).toBe(0);
    expect(claimDelayMs(floor, present, A)).toBe(FLOOR_CLAIM_DELAY_STEP_MS);
    expect(claimDelayMs(floor, present, B)).toBe(FLOOR_CLAIM_DELAY_STEP_MS * 2);
  });

  it('leaves everyone who has never claimed at zero together', () => {
    // They tie rather than ordering themselves arbitrarily, so a newcomer is
    // never made to wait behind another newcomer.
    const floor = at({ [A]: T0 - 10_000 });
    const present = [A, B, C, D];
    expect(claimDelayMs(floor, present, B)).toBe(0);
    expect(claimDelayMs(floor, present, C)).toBe(0);
    expect(claimDelayMs(floor, present, D)).toBe(0);
  });

  it('caps the wait at two steps however many have spoken since', () => {
    const floor = at({
      [A]: T0 - 40_000,
      [B]: T0 - 30_000,
      [C]: T0 - 20_000,
      [D]: T0 - 10_000,
    });
    const present = [A, B, C, D];
    expect(claimDelayMs(floor, present, D)).toBe(FLOOR_CLAIM_DELAY_STEP_MS * 2);
    expect(claimDelayMs(floor, present, C)).toBe(FLOOR_CLAIM_DELAY_STEP_MS * 2);
  });

  it('ranks only those present, so a departure cannot strand the floor', () => {
    // Counting someone who has left would let them hold the zero slot they
    // cannot use, leaving the floor free with nobody permitted to take it.
    const floor = at({ [A]: T0 - 20_000, [B]: T0 - 10_000 });
    expect(claimDelayMs(floor, [A, B, C], A)).toBe(FLOOR_CLAIM_DELAY_STEP_MS);
    expect(claimDelayMs(floor, [A, B], A)).toBe(0);
  });

  it('always leaves somebody at zero, whoever is present', () => {
    const floor = at({
      [A]: T0 - 40_000,
      [B]: T0 - 30_000,
      [C]: T0 - 20_000,
      [D]: T0 - 10_000,
    });
    for (const present of [[A, B], [A, B, C], [A, B, C, D], [B, D], [C]]) {
      const waits = present.map((u) => claimDelayMs(floor, present, u));
      expect(Math.min(...waits)).toBe(0);
    }
  });
});
