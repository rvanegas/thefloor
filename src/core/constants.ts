/**
 * Timing constants for the floor mechanic and session lifecycle.
 * All durations in milliseconds.
 */

/** Maximum length of a floor claim before it is released automatically. */
export const FLOOR_CLAIM_MS = 3 * 60 * 1000;

/**
 * How long the *same* user must wait after releasing the floor before they may
 * claim it again. Does not apply when the other user was the last claimant.
 */
export const FLOOR_SAME_USER_COOLDOWN_MS = 60 * 1000;

/** How long a session may sit with nobody present before it auto-ends. */
export const EMPTY_SESSION_TIMEOUT_MS = 60 * 1000;
