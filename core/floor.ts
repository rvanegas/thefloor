import {
  FLOOR_CLAIM_DELAY_MAX_STEPS,
  FLOOR_CLAIM_DELAY_STEP_MS,
  FLOOR_CLAIM_MS,
} from './constants';
import type { FloorState, UserId } from './types';

export function initialFloorState(): FloorState {
  return {
    holder: null,
    claimedAt: null,
    lastClaimedAt: {},
    lastReleasedAt: null,
  };
}

/**
 * How long `userId` must wait after the floor is released before they may take
 * it, given who else is present.
 *
 * Whoever spoke longest ago waits nothing; everyone else waits one step for
 * each person who spoke longer ago than they did, capped at two steps. Never
 * having claimed counts as having spoken longest ago, so anyone yet to take a
 * turn is always among those who may claim immediately.
 *
 * Ordering by recency rather than by rank is what makes this safe. Somebody is
 * always last in the ordering, so somebody is always at zero and the floor can
 * never sit free with nobody permitted to take it.
 *
 * Only *present* users are ranked. Counting someone who has left would let them
 * occupy the zero slot they cannot use, which would strand the floor exactly as
 * the invariant forbids.
 */
export function claimDelayMs(
  floor: FloorState,
  present: readonly UserId[],
  userId: UserId
): number {
  const spokeAt = (id: UserId) => floor.lastClaimedAt[id] ?? -Infinity;
  const mine = spokeAt(userId);

  // Strictly longer ago, so users who have never claimed tie with each other
  // at zero rather than ordering themselves arbitrarily.
  const olderThanMe = present.filter(
    (id) => id !== userId && spokeAt(id) < mine
  ).length;

  return (
    Math.min(olderThanMe, FLOOR_CLAIM_DELAY_MAX_STEPS) *
    FLOOR_CLAIM_DELAY_STEP_MS
  );
}

/**
 * Whether `userId` may claim, in isolation from presence and channel status.
 *
 * Two conditions: nobody holds the floor, and enough time has passed since it
 * was released for this user's delay to have elapsed.
 */
export function satisfiesEligibilityRule(
  floor: FloorState,
  present: readonly UserId[],
  userId: UserId,
  now: number
): boolean {
  if (floor.holder !== null) return false;
  // Never claimed by anyone: there is nothing to wait behind.
  if (floor.lastReleasedAt === null) return true;
  return now - floor.lastReleasedAt >= claimDelayMs(floor, present, userId);
}

/** Whether `userId` is force-muted by someone else's active claim. */
export function isSilenced(floor: FloorState, userId: UserId): boolean {
  return floor.holder !== null && floor.holder !== userId;
}

export function claimFloor(
  floor: FloorState,
  userId: UserId,
  now: number
): FloorState {
  return {
    holder: userId,
    claimedAt: now,
    lastClaimedAt: { ...floor.lastClaimedAt, [userId]: now },
    lastReleasedAt: null,
  };
}

export function releaseFloor(floor: FloorState, now: number): FloorState {
  if (floor.holder === null) return floor;
  return {
    holder: null,
    claimedAt: null,
    lastClaimedAt: floor.lastClaimedAt,
    lastReleasedAt: now,
  };
}

/** Milliseconds left in the active claim, or null when no claim is active. */
export function floorRemainingMs(floor: FloorState, now: number): number | null {
  if (floor.holder === null || floor.claimedAt === null) return null;
  return Math.max(0, FLOOR_CLAIM_MS - (now - floor.claimedAt));
}

/**
 * Milliseconds until `userId` may claim, or null when nothing is holding them
 * back — no claim has been made, a claim is active, or their delay has already
 * elapsed.
 *
 * This is what the interface counts down, so it answers "when may I", not "how
 * long is my penalty".
 */
export function cooldownRemainingMs(
  floor: FloorState,
  present: readonly UserId[],
  userId: UserId,
  now: number
): number | null {
  if (floor.holder !== null) return null;
  if (floor.lastReleasedAt === null) return null;
  const remaining =
    claimDelayMs(floor, present, userId) - (now - floor.lastReleasedAt);
  return remaining > 0 ? remaining : null;
}

/** Whether the active claim has run past its three-minute limit. */
export function hasExpired(floor: FloorState, now: number): boolean {
  return floor.claimedAt !== null && now - floor.claimedAt >= FLOOR_CLAIM_MS;
}
