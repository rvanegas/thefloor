import {
  MIN_PARTICIPANTS_TO_REMOVE,
  REMOVAL_MOTION_WINDOW_MS,
  REMOVAL_MOVES_REQUIRED,
} from '../constants';
import {
  canMoveToRemove,
  canWithdrawRemoval,
  createChannel,
  isParticipant,
  reduce,
  removalMotion,
  removalMovesWanted,
  withoutRemovalsAgainst,
} from '../channel';
import type { ChannelState } from '../types';

const A = 'usr_a';
const B = 'usr_b';
const C = 'usr_c';
const D = 'usr_d';
const T0 = 1_000_000;

/** Three members, all present — the smallest channel a removal is possible in. */
function trio(now = T0): ChannelState {
  let s = createChannel({ id: 's1', initiator: A, invitees: [B, C], now });
  s = reduce(s, { type: 'ENTER', userId: B }, now);
  s = reduce(s, { type: 'ENTER', userId: C }, now);
  return s;
}

/** Two members, which is the channel that cannot remove anybody. */
function pair(now = T0): ChannelState {
  return reduce(
    createChannel({ id: 's1', initiator: A, invitees: [B], now }),
    { type: 'ENTER', userId: B },
    now
  );
}

const move = (s: ChannelState, userId: string, targetId: string, now = T0) =>
  reduce(s, { type: 'MOVE_TO_REMOVE', userId, targetId }, now);

const withdraw = (s: ChannelState, userId: string, targetId: string, now = T0) =>
  reduce(s, { type: 'WITHDRAW_REMOVAL', userId, targetId }, now);

describe('two members have to agree', () => {
  it('is the threshold the constants state, and the rule is built on them', () => {
    expect(REMOVAL_MOVES_REQUIRED).toBe(2);
    expect(MIN_PARTICIPANTS_TO_REMOVE).toBe(REMOVAL_MOVES_REQUIRED + 1);
  });

  it('opens a motion on the first move and removes nobody', () => {
    const s = move(trio(), A, C);
    expect(isParticipant(s, C)).toBe(true);
    expect(removalMotion(s, C, T0)).toEqual({ movedBy: [A], at: T0 });
    // What the screen says: one more person.
    expect(removalMovesWanted(s, C, T0)).toBe(1);
  });

  it('removes on the second, and by the same path leaving takes', () => {
    let s = move(trio(), A, C);
    s = move(s, B, C, T0 + 5_000);
    expect(isParticipant(s, C)).toBe(false);
    expect(s.participants).toEqual([A, B]);
    // Everything keyed by them goes, exactly as a departure's does — the
    // shared `dropParticipant` is what makes the two agree.
    expect(s.present).not.toContain(C);
    expect(s.everPresent).not.toContain(C);
    expect(s.selfMuted[C]).toBeUndefined();
    expect(s.invitedBy[C]).toBeUndefined();
    // And the motion is gone with the membership rather than left standing
    // against somebody who could be invited back.
    expect(s.removals?.[C]).toBeUndefined();
    expect(removalMotion(s, C, T0 + 5_000)).toBeNull();
    // The channel is not ended. That is the whole reason a removal needs three.
    expect(s.status).toBe('active');
  });

  it('will not let one member be both agreements', () => {
    const s = move(trio(), A, C);
    expect(canMoveToRemove(s, A, C, T0)).toBe(false);
    // And the action is refused rather than merely undrawn.
    expect(move(s, A, C, T0 + 1_000)).toBe(s);
    expect(isParticipant(s, C)).toBe(true);
  });

  it('is impossible in a channel of two', () => {
    const s = pair();
    expect(canMoveToRemove(s, A, B, T0)).toBe(false);
    expect(removalMovesWanted(s, B, T0)).toBeNull();
    expect(move(s, A, B)).toBe(s);
  });

  it('becomes impossible again when a departure leaves two', () => {
    let s = reduce(trio(), { type: 'LEAVE_CHANNEL', userId: B }, T0 + 1_000);
    expect(s.participants).toEqual([A, C]);
    expect(canMoveToRemove(s, A, C, T0 + 2_000)).toBe(false);
    s = move(s, A, C, T0 + 2_000);
    expect(isParticipant(s, C)).toBe(true);
  });

  it('refuses a move against yourself, which is leaving', () => {
    const s = trio();
    expect(canMoveToRemove(s, A, A, T0)).toBe(false);
    expect(move(s, A, A)).toBe(s);
  });

  it('refuses a move by or against somebody who does not belong', () => {
    const s = trio();
    expect(canMoveToRemove(s, D, C, T0)).toBe(false);
    expect(canMoveToRemove(s, A, D, T0)).toBe(false);
    expect(move(s, D, C)).toBe(s);
    expect(move(s, A, D)).toBe(s);
  });

  it('asks nothing about presence, either end', () => {
    // The two who agree are outside the room and the target is standing in it,
    // which is the arrangement the mechanism exists for.
    let s = trio();
    s = reduce(s, { type: 'STEP_OUT', userId: A }, T0 + 1_000);
    s = reduce(s, { type: 'STEP_OUT', userId: B }, T0 + 2_000);
    expect(s.present).toEqual([C]);
    expect(canMoveToRemove(s, A, C, T0 + 3_000)).toBe(true);
    s = move(s, A, C, T0 + 3_000);
    s = move(s, B, C, T0 + 4_000);
    expect(isParticipant(s, C)).toBe(false);
  });
});

describe('a motion lapses', () => {
  it('stops counting after its window, measured from the first move', () => {
    const s = move(trio(), A, C);
    const late = T0 + REMOVAL_MOTION_WINDOW_MS + 1;
    expect(removalMotion(s, C, late)).toBeNull();
    expect(removalMovesWanted(s, C, late)).toBe(REMOVAL_MOVES_REQUIRED);
  });

  it('so a second move after it opens a fresh one rather than carrying', () => {
    let s = move(trio(), A, C);
    const late = T0 + REMOVAL_MOTION_WINDOW_MS + 1;
    s = move(s, B, C, late);
    expect(isParticipant(s, C)).toBe(true);
    expect(removalMotion(s, C, late)).toEqual({ movedBy: [B], at: late });
  });

  it('cannot be walked forward by members taking turns', () => {
    // A moves, B moves most of a day later — the window is measured from A's
    // move, so the pair still carries. What must not happen is the window
    // restarting on B's move and the motion outliving its day.
    let s = move(trio(), A, C);
    const nearly = T0 + REMOVAL_MOTION_WINDOW_MS - 1_000;
    s = move(s, B, C, nearly);
    expect(isParticipant(s, C)).toBe(false);

    // With a third member on hand and a threshold of two this is as far as one
    // motion goes; the guard against a rolling window is that `at` is never
    // rewritten. Asserted directly, one move in.
    const one = move(trio(), A, C);
    expect(one.removals?.[C]?.at).toBe(T0);
    expect(
      move(one, B, C, T0 + 1_000).removals?.[C]
    ).toBeUndefined();
  });

  it('and a lapsed entry is refused to a reader without being swept', () => {
    // Core has no clock, so nothing deletes it. What matters is that nothing
    // reads it either.
    const s = move(trio(), A, C);
    const late = T0 + REMOVAL_MOTION_WINDOW_MS + 1;
    expect(s.removals?.[C]).toBeDefined();
    expect(canWithdrawRemoval(s, A, C, late)).toBe(false);
  });
});

describe('withdrawing', () => {
  it('takes the mover off and deletes a motion nobody is left on', () => {
    let s = move(trio(), A, C);
    expect(canWithdrawRemoval(s, A, C, T0)).toBe(true);
    s = withdraw(s, A, C, T0 + 1_000);
    expect(s.removals?.[C]).toBeUndefined();
    expect(removalMotion(s, C, T0 + 1_000)).toBeNull();
    expect(canMoveToRemove(s, A, C, T0 + 1_000)).toBe(true);
  });

  it('is nobody else’s to do', () => {
    const s = move(trio(), A, C);
    expect(canWithdrawRemoval(s, B, C, T0)).toBe(false);
    expect(withdraw(s, B, C)).toBe(s);
    expect(removalMotion(s, C, T0)).toEqual({ movedBy: [A], at: T0 });
  });

  it('leaves a motion standing when another mover is still on it', () => {
    // Four members, so two moves do not yet carry: the threshold is two and a
    // third agreement is what a four-person roster makes room to test with.
    let s = createChannel({ id: 's1', initiator: A, invitees: [B, C, D], now: T0 });
    s = move(s, A, D);
    // B's move carries it, so to see a two-mover motion survive a withdrawal
    // the threshold has to be reached by the withdrawal's own arithmetic. With
    // `REMOVAL_MOVES_REQUIRED` at two there is no such state — a motion with
    // two movers has already removed somebody — so the case that remains is a
    // sole mover standing down, above, and a withdrawal against nothing.
    expect(canWithdrawRemoval(s, B, D, T0)).toBe(false);
    expect(withdraw(s, B, D)).toBe(s);
  });

  it('is refused where there is no motion at all', () => {
    const s = trio();
    expect(canWithdrawRemoval(s, A, C, T0)).toBe(false);
    expect(withdraw(s, A, C)).toBe(s);
  });
});

describe('a departure clears what it should', () => {
  it('drops a motion the leaver had moved in', () => {
    let s = createChannel({ id: 's1', initiator: A, invitees: [B, C, D], now: T0 });
    s = move(s, A, D);
    s = reduce(s, { type: 'LEAVE_CHANNEL', userId: A }, T0 + 1_000);
    // A's agreement left with A, so D is not one tap from being removed by
    // somebody who never heard the argument.
    expect(removalMotion(s, D, T0 + 1_000)).toBeNull();
    expect(s.removals?.[D]).toBeUndefined();
  });

  it('drops a motion against the leaver', () => {
    let s = createChannel({ id: 's1', initiator: A, invitees: [B, C, D], now: T0 });
    s = move(s, A, D);
    s = reduce(s, { type: 'LEAVE_CHANNEL', userId: D }, T0 + 1_000);
    expect(s.removals?.[D]).toBeUndefined();
  });

  it('keeps one that is about neither of them', () => {
    let s = createChannel({ id: 's1', initiator: A, invitees: [B, C, D], now: T0 });
    s = move(s, A, D);
    s = reduce(s, { type: 'LEAVE_CHANNEL', userId: C }, T0 + 1_000);
    expect(removalMotion(s, D, T0 + 1_000)).toEqual({ movedBy: [A], at: T0 });
  });
});

describe('what the target is shown', () => {
  it('is nothing about themselves, and everything they moved', () => {
    let s = createChannel({ id: 's1', initiator: A, invitees: [B, C, D], now: T0 });
    s = move(s, A, D);
    s = move(s, D, C);

    const asD = withoutRemovalsAgainst(s, D);
    expect(asD.removals?.[D]).toBeUndefined();
    // Their own move stays: a mover who could not see it could not withdraw it.
    expect(asD.removals?.[C]).toEqual({ movedBy: [D], at: T0 });
    // And nothing else about the channel is touched.
    expect(asD.participants).toEqual(s.participants);
  });

  it('returns the state itself when there is nothing to hide', () => {
    const s = move(trio(), A, C);
    expect(withoutRemovalsAgainst(s, B)).toBe(s);
    const quiet = trio();
    expect(withoutRemovalsAgainst(quiet, C)).toBe(quiet);
  });
});
