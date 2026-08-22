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
 * The most characters a recording's name may hold.
 *
 * The same bound as a channel's, and for the same reason rather than by
 * coincidence: a named channel lends its name to what it records, so a
 * recording name that could be longer would be one no rename could restore.
 */
export const MAX_RECORDING_NAME_LENGTH = MAX_CHANNEL_NAME_LENGTH;

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
 * The most characters somebody may put in a ping.
 *
 * A ping is a notification and nothing else — there is no thread it lands in
 * and no way to answer it except by walking into the channel, so anything long
 * enough to be a conversation is length the medium cannot honour. Short enough,
 * too, that the whole of it survives a lock screen: iOS truncates a notification
 * body at about this, and a limit the sender can see beats a sentence that
 * silently loses its end.
 *
 * Shared with the client because the composer counts characters against it, and
 * a counter that disagrees with what the server accepts is worse than none.
 */
export const MAX_PING_TEXT_LENGTH = 100;

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
 * How long somebody whose connection expired goes on being described as
 * waiting, rather than as having stepped out.
 *
 * The two are the same clock — `idleMs` — under two names, and the name is the
 * whole of what this decides. Somebody who taps Step Out has left. Somebody
 * whose phone was suspended in their pocket has not: they walked into the
 * channel on purpose, a notification goes to them the moment anybody else
 * arrives, and they are a tap away from hearing it. Telling whoever walks in
 * that the room was abandoned three minutes ago, when it was not, is the
 * difference between saying something and saying nothing.
 *
 * **Fifteen minutes, and then it stops being true.** Waiting is an intention,
 * and an intention has a shelf life: after long enough the person has moved on
 * to other things and forgotten the channel, and going on describing them as
 * expecting company would be the roster inventing an eagerness nobody has. The
 * clock does not restart when it lapses — it is the same number throughout, so
 * fifteen minutes of waiting becomes sixteen minutes of having stepped out,
 * and never sixteen minutes that read as one.
 *
 * Deliberately *not* derived from DISCONNECT_GRACE_MS. That one is about
 * whether a connection is coming back; this one is about how long an intention
 * stays worth reporting, and the two have no reason to move together.
 */
export const WAITING_WINDOW_MS = 15 * 60 * 1000;

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
 * How long a usage span or a byte count is kept before the sweep removes it.
 *
 * Thirty days, deliberately its own constant rather than a reuse of
 * DELETED_RETENTION_MS, which means something entirely different: that one is a
 * recovery window for a mistake, this one is the horizon past which nobody is
 * entitled to know what anybody did. A change to either must not silently move
 * the other — and this one has already moved, from seven days on 2026-08-19,
 * because a week cannot show a month's shape and the questions this exists to
 * answer are about growth. The two agreed once and no longer do.
 *
 * It is what makes the meter a rolling window rather than a history. Nothing
 * here accumulates, so the answer to "how much has this account ever used" is
 * unanswerable by construction, which is the point.
 *
 * In core/ rather than server/ because it is a rule about the data and the
 * privacy page states it as one; nothing in the app reads it. **The privacy
 * page states this number**, so changing it is a change to a published promise
 * and PRIVACY_UPDATED moves with it.
 */
export const USAGE_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

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

/**
 * The most characters a channel's clipboard may hold.
 *
 * A clipboard here is for URLs and the other small things a clipboard is
 * actually used for, and the cap is about what it costs to carry rather than
 * about what anyone would want to paste. The content rides inside every
 * channel snapshot, and a snapshot is re-sent on every transition in the
 * channel — a floor claim, an arrival, a mute — so what is pasted once is paid
 * for repeatedly by everybody watching. Eight thousand characters across six
 * phones is some forty kilobytes on a transition, which is nothing; ten times
 * that would not be.
 *
 * Characters rather than bytes, like every other cap in this file, so that the
 * reducer can check it without an encoder and both ends compute the same
 * number.
 *
 * Shared with the client because the client refuses over-long text itself and
 * says why. It has to: a paste goes over the socket, and a socket refusal is
 * not shown anywhere in a channel.
 */
export const MAX_CLIP_LENGTH = 8_000;
