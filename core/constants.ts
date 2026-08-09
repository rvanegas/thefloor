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

/**
 * How long a user may be disconnected before they are removed from a session.
 *
 * Connectivity is not presence. A socket that drops and returns inside this
 * window changes nothing; only staying gone past it counts as leaving. It
 * stacks with EMPTY_SESSION_TIMEOUT_MS, so a session survives up to two
 * minutes with nobody connected — deliberately, that being the interval in
 * which a tunnel or a lift is survivable.
 */
export const DISCONNECT_GRACE_MS = 60_000;
