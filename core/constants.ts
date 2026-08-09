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

/**
 * How often each side proves it is still there, and how long silence is
 * tolerated before the connection is treated as dead.
 *
 * Deliberately aggressive. Detection latency adds to DISCONNECT_GRACE_MS, so a
 * slow check delays every timer that depends on knowing someone has gone — a
 * user is not removed, a session never empties, and a recording keeps billing.
 * Being wrong is cheap by comparison: a false positive shows "reconnecting…"
 * for a moment and then clears, because a disconnect no longer removes anyone.
 */
export const HEARTBEAT_INTERVAL_MS = 5_000;
export const HEARTBEAT_TIMEOUT_MS = 12_000;
