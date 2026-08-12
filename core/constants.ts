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
 * The most characters a channel's description may hold.
 *
 * Roomier than the name because it is prose and may carry links, whose markup
 * costs characters nobody reads — a single URL can be a third of this. Still
 * bounded: it sits above the roster on a phone screen, so a description long
 * enough to need scrolling has stopped being a description.
 */
export const MAX_CHANNEL_DESCRIPTION_LENGTH = 1_000;

/**
 * The most characters a person's display name may hold.
 *
 * Names appear as the channel header when nobody has named the channel, and
 * beside every line of the roster, so an unbounded one would push everything
 * else off a phone screen.
 */
export const MAX_DISPLAY_NAME_LENGTH = 40;

/**
 * The most characters a profile bio may hold.
 *
 * Twice a channel's description, because this is the one place a person gets
 * to say who they are and it is read on its own screen rather than squeezed
 * above a roster.
 */
export const MAX_BIO_LENGTH = 2_000;

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
 * How long a deleted channel and its recordings survive the tap that deleted
 * them, before the sweep removes the rows and the audio in the bucket.
 *
 * A week, and it is not an undo: nothing in the app can bring a deleted
 * channel back, and its recordings are unreachable from the moment it goes,
 * there being no members left to reach them. What the week buys is that a
 * mistake is still *recoverable by hand* — the rows are marked, not gone, and
 * so are the objects they name.
 *
 * Shared with the client because the confirmation says so, and a warning that
 * disagrees with what the server does is worse than no warning.
 */
export const DELETED_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

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
