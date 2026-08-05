import {
  EMPTY_SESSION_TIMEOUT_MS,
  FLOOR_CLAIM_MS,
  FLOOR_SAME_USER_COOLDOWN_MS,
} from '../constants';
import { cooldownRemainingMs, floorRemainingMs, isSilenced } from '../floor';
import { canClaimFloor, createSession, reduce } from '../session';
import type { SessionAction, SessionState } from '../types';

const A = 'user-a';
const B = 'user-b';
const T0 = 1_700_000_000_000;

function newSession(now = T0): SessionState {
  return createSession({ id: 's1', initiator: A, invitee: B, now });
}

/** Both parties present and idle, the normal starting point for floor tests. */
function joined(now = T0): SessionState {
  return reduce(newSession(now), { type: 'ENTER', userId: B }, now);
}

function apply(
  state: SessionState,
  steps: Array<[SessionAction, number]>
): SessionState {
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

  it('makes the same user wait out the one-minute cooldown', () => {
    const releasedAt = T0 + 5_000;
    const s = apply(joined(), [
      [{ type: 'CLAIM_FLOOR', userId: A }, T0],
      [{ type: 'RELEASE_FLOOR', userId: A }, releasedAt],
    ]);
    expect(canClaimFloor(s, A, releasedAt)).toBe(false);
    expect(canClaimFloor(s, A, releasedAt + FLOOR_SAME_USER_COOLDOWN_MS)).toBe(
      false // strictly *more than* one minute must elapse
    );
    expect(
      canClaimFloor(s, A, releasedAt + FLOOR_SAME_USER_COOLDOWN_MS + 1)
    ).toBe(true);
  });

  it('reports cooldown remaining only for the user it blocks', () => {
    const releasedAt = T0 + 5_000;
    const s = apply(joined(), [
      [{ type: 'CLAIM_FLOOR', userId: A }, T0],
      [{ type: 'RELEASE_FLOOR', userId: A }, releasedAt],
    ]);
    expect(cooldownRemainingMs(s.floor, A, releasedAt + 20_000)).toBe(40_000);
    expect(cooldownRemainingMs(s.floor, B, releasedAt + 20_000)).toBeNull();
  });

  it('is unaffected by self-mute', () => {
    const s = reduce(joined(), { type: 'SET_SELF_MUTE', userId: A, muted: true }, T0);
    expect(canClaimFloor(s, A, T0)).toBe(true);
    expect(canClaimFloor(s, B, T0)).toBe(true);
  });
});

describe('presence gating', () => {
  it('disables the claim control while a user is alone', () => {
    const alone = newSession();
    expect(alone.present).toEqual([A]);
    expect(canClaimFloor(alone, A, T0)).toBe(false);

    const together = reduce(alone, { type: 'ENTER', userId: B }, T0 + 1000);
    expect(canClaimFloor(together, A, T0 + 1000)).toBe(true);

    const bLeft = reduce(together, { type: 'LEAVE', userId: B }, T0 + 2000);
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
    expect(at.floor.lastClaimant).toBe(A);
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
      now += FLOOR_SAME_USER_COOLDOWN_MS + 1;
      expect(canClaimFloor(s, A, now)).toBe(true);
    }
  });
});

describe('leaving and the floor', () => {
  it('force-releases the departing holder’s claim', () => {
    const claimed = reduce(joined(), { type: 'CLAIM_FLOOR', userId: A }, T0);
    const left = reduce(claimed, { type: 'LEAVE', userId: A }, T0 + 10_000);
    expect(left.floor.holder).toBeNull();
    expect(left.floor.lastClaimant).toBe(A);
    expect(left.floor.lastReleasedAt).toBe(T0 + 10_000);
    // B is no longer silenced, but is now alone, so cannot claim.
    expect(isSilenced(left.floor, B)).toBe(false);
    expect(canClaimFloor(left, B, T0 + 10_000)).toBe(false);
  });

  it('applies the ordinary eligibility rule to whoever re-enters', () => {
    const s = apply(joined(), [
      [{ type: 'CLAIM_FLOOR', userId: A }, T0],
      [{ type: 'LEAVE', userId: A }, T0 + 10_000],
      [{ type: 'ENTER', userId: A }, T0 + 12_000],
    ]);
    // A's own claim was the most recent, so A still owes the cooldown.
    expect(canClaimFloor(s, A, T0 + 12_000)).toBe(false);
    expect(canClaimFloor(s, B, T0 + 12_000)).toBe(true);
  });

  it('leaves the other party’s claim untouched', () => {
    const s = apply(joined(), [
      [{ type: 'CLAIM_FLOOR', userId: A }, T0],
      [{ type: 'LEAVE', userId: B }, T0 + 10_000],
    ]);
    expect(s.floor.holder).toBe(A);
  });
});

describe('session lifecycle', () => {
  it('does not run the empty-session timer while anyone is present', () => {
    const alone = newSession();
    const muchLater = reduce(alone, { type: 'TICK' }, T0 + 60 * 60 * 1000);
    expect(muchLater.status).toBe('active');
    expect(muchLater.emptySince).toBeNull();
  });

  it('auto-ends one minute after becoming empty', () => {
    const empty = reduce(newSession(), { type: 'LEAVE', userId: A }, T0 + 1_000);
    expect(empty.emptySince).toBe(T0 + 1_000);

    const justBefore = reduce(
      empty,
      { type: 'TICK' },
      T0 + 1_000 + EMPTY_SESSION_TIMEOUT_MS - 1
    );
    expect(justBefore.status).toBe('active');

    const at = reduce(empty, { type: 'TICK' }, T0 + 1_000 + EMPTY_SESSION_TIMEOUT_MS);
    expect(at.status).toBe('ended');
    expect(at.endedReason).toBe('empty-timeout');
  });

  it('cancels the empty-session timer on re-entry', () => {
    const s = apply(newSession(), [
      [{ type: 'LEAVE', userId: A }, T0 + 1_000],
      [{ type: 'ENTER', userId: A }, T0 + 30_000],
    ]);
    expect(s.emptySince).toBeNull();
    const later = reduce(s, { type: 'TICK' }, T0 + 120_000);
    expect(later.status).toBe('active');
  });

  it('continues with one party after the other leaves', () => {
    const s = reduce(joined(), { type: 'LEAVE', userId: B }, T0 + 5_000);
    expect(s.status).toBe('active');
    expect(s.present).toEqual([A]);
    expect(s.emptySince).toBeNull();
  });

  it('ends explicitly and irreversibly, from either party, present or not', () => {
    const s = apply(joined(), [
      [{ type: 'LEAVE', userId: B }, T0 + 5_000],
      [{ type: 'END', userId: B }, T0 + 6_000],
    ]);
    expect(s.status).toBe('ended');
    expect(s.endedReason).toBe('explicit');
    // Re-entry is no longer possible.
    const attempted = reduce(s, { type: 'ENTER', userId: A }, T0 + 7_000);
    expect(attempted.present).toEqual([]);
    expect(attempted).toBe(s);
  });
});
