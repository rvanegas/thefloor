/**
 * Timing constants for the floor mechanic and channel lifecycle.
 * All durations in milliseconds.
 */

/** Maximum length of a floor claim before it is released automatically. */
export const FLOOR_CLAIM_MS = 3 * 60 * 1000;

/**
 * One step of the claim delay, and the most steps anyone ever waits.
 *
 * The rule: whoever spoke longest ago may claim immediately, and everyone else
 * waits one step for each person who spoke longer ago than they did, up to two.
 *
 * The invariant that shapes it is that somebody must always be able to claim
 * without delay — otherwise the floor sits free and unclaimable, which is dead
 * time nobody asked for. Ordering by recency gives that for nothing: somebody
 * is always last in the ordering, so somebody is always at zero.
 */
export const FLOOR_CLAIM_DELAY_STEP_MS = 10_000;
export const FLOOR_CLAIM_DELAY_MAX_STEPS = 2;

/**
 * The most people a channel may hold, counting the initiator.
 *
 * A cap keeps the claim-delay ladder meaningful — beyond four, everyone
 * outside the two most recent speakers ties at zero and races — and bounds
 * what one channel costs in egress and per-pair subscription changes. It is a
 * constant precisely so it can be raised without touching any rule.
 */
export const MAX_CHANNEL_PARTICIPANTS = 6;

/**
 * The level a newly loaded track starts at, 0..1.
 *
 * Below full deliberately. Shared playback runs underneath a conversation
 * rather than instead of one, and a track that arrives at full volume the
 * moment it is loaded talks over whoever was mid-sentence. Either party can
 * raise it; nobody has to rush to lower it.
 */
export const PLAYBACK_DEFAULT_VOLUME = 0.7;

/**
 * The most characters a channel name may hold.
 *
 * Long enough for "Tuesday planning with the cousins", short enough that the
 * header it replaces cannot be scrolled off by its own title.
 */
export const MAX_CHANNEL_NAME_LENGTH = 60;

/**
 * How long a user may be disconnected before they stop being present.
 *
 * Connectivity is not presence. A socket that drops and returns inside this
 * window changes nothing; only staying gone past it counts as stepping out —
 * deliberately generous, that being the interval in which a tunnel or a lift
 * is survivable.
 *
 * Note it is also what bounds a forgotten recording, now that nothing else
 * does: a run stops when the channel empties, and the channel empties this
 * long after the last connection dies. So an abrupt end to a conversation
 * leaves up to a minute of silence on the tail of the recording.
 */
export const DISCONNECT_GRACE_MS = 60_000;

/**
 * How often each side proves it is still there, and how long silence is
 * tolerated before the connection is treated as dead.
 *
 * Deliberately aggressive. Detection latency adds to DISCONNECT_GRACE_MS, so a
 * slow check delays every timer that depends on knowing someone has gone — a
 * user is not removed, a channel never empties, and a recording keeps billing.
 * Being wrong is cheap by comparison: a false positive shows "reconnecting…"
 * for a moment and then clears, because a disconnect no longer removes anyone.
 */
export const HEARTBEAT_INTERVAL_MS = 5_000;
export const HEARTBEAT_TIMEOUT_MS = 12_000;
