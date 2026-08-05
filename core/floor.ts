import { FLOOR_CLAIM_MS, FLOOR_SAME_USER_COOLDOWN_MS } from './constants';
import type { FloorState, UserId } from './types';

export function initialFloorState(): FloorState {
  return {
    holder: null,
    claimedAt: null,
    lastClaimant: null,
    lastReleasedAt: null,
  };
}

/**
 * The spec's eligibility rule, in isolation from presence.
 *
 * A user may claim the floor iff:
 *   1. nobody currently holds it, and
 *   2. either the most recent claim was made by the *other* user, or more than
 *      one minute has elapsed since the floor was last released.
 *
 * With no prior claim, condition 2 is vacuously satisfied.
 */
export function satisfiesEligibilityRule(
  floor: FloorState,
  userId: UserId,
  now: number
): boolean {
  if (floor.holder !== null) return false;
  if (floor.lastClaimant === null) return true;
  if (floor.lastClaimant !== userId) return true;
  // Same user reclaiming: the one-minute cooldown applies. `lastReleasedAt` is
  // always set alongside a non-null `lastClaimant` with no active claim.
  return now - (floor.lastReleasedAt ?? 0) > FLOOR_SAME_USER_COOLDOWN_MS;
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
    lastClaimant: userId,
    lastReleasedAt: null,
  };
}

export function releaseFloor(floor: FloorState, now: number): FloorState {
  if (floor.holder === null) return floor;
  return {
    holder: null,
    claimedAt: null,
    lastClaimant: floor.lastClaimant,
    lastReleasedAt: now,
  };
}

/** Milliseconds left in the active claim, or null when no claim is active. */
export function floorRemainingMs(floor: FloorState, now: number): number | null {
  if (floor.holder === null || floor.claimedAt === null) return null;
  return Math.max(0, FLOOR_CLAIM_MS - (now - floor.claimedAt));
}

/**
 * Milliseconds left on `userId`'s same-user cooldown, or null when the cooldown
 * is not what is blocking them (no prior claim, other user claimed last, a
 * claim is active, or the cooldown has already elapsed).
 */
export function cooldownRemainingMs(
  floor: FloorState,
  userId: UserId,
  now: number
): number | null {
  if (floor.holder !== null) return null;
  if (floor.lastClaimant !== userId || floor.lastReleasedAt === null) return null;
  const remaining = FLOOR_SAME_USER_COOLDOWN_MS - (now - floor.lastReleasedAt);
  return remaining > 0 ? remaining : null;
}

/** Whether the active claim has run past its three-minute limit. */
export function hasExpired(floor: FloorState, now: number): boolean {
  return floor.claimedAt !== null && now - floor.claimedAt >= FLOOR_CLAIM_MS;
}
