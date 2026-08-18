import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';

/**
 * How long ago something was, in words.
 *
 * Both idle timers read through here — the one on Home saying when a contact
 * was last heard from at all, and the one on a channel card saying when
 * somebody was last heard from in that room — so the two cannot describe the
 * same gap differently.
 *
 * **The conventions are dayjs's rather than ours, deliberately.** Where the
 * boundaries fall is a solved problem with unobvious answers: 45 seconds is
 * "a minute", 90 minutes is "2 hours", 25 days is "a month". Writing that
 * ladder by hand produces something that reads fine at the values you happen
 * to test and says "1 minutes ago" or "0 hours ago" at the ones you do not.
 * dayjs inherits moment's thresholds, which have had a decade of people
 * finding the edges.
 *
 * The plugin is registered once, here, because `extend` is global: doing it at
 * each call site works and makes the dependency invisible to whoever later
 * moves one.
 */
dayjs.extend(relativeTime);

/**
 * Below this, "a few seconds ago" is technically right and unhelpful — the
 * person is *here*, and the timer is answering a question nobody asked.
 *
 * It is also what absorbs the imprecision in the Home-side clock. `last_seen_at`
 * is written on every message a socket carries, so somebody sitting in the app
 * is up to one heartbeat stale; anything under this reads as present rather
 * than as freshly departed. The channel's copy of that stamp is written the
 * same way, by the same messages — see `STILL_HERE`.
 */
const PRESENT_MS = 60_000;

/**
 * `ms` ago, in words, or null when the gap is too small to be worth naming.
 *
 * Null rather than a string, so the caller decides what "no gap worth naming"
 * looks like in its own context — which today means Home, saying "In the app
 * now". The channel roster calls `ago` directly and needs no floor: a gap that
 * small there is a connection flapping, and the grace period already covers it
 * by keeping the person present and saying "reconnecting" instead.
 */
export function agoOrNull(ms: number): string | null {
  if (ms < PRESENT_MS) return null;
  return ago(ms);
}

/**
 * `ms` ago, in words, always.
 *
 * Negative input is clamped to zero: a client computes these against the
 * server's clock, learned a round trip ago, so a gap of a few hundred
 * milliseconds can arrive negative — and dayjs renders that as "in a few
 * seconds", a future tense for something that has already happened.
 */
export function ago(ms: number): string {
  const elapsed = Math.max(0, ms);
  // Anchored to a fixed instant and offset from it, rather than to the
  // device's clock, so the string depends only on the argument. Passing an
  // absolute time and letting dayjs subtract `Date.now()` would make this
  // untestable and would quietly use the device clock the rest of this app
  // goes to some trouble to avoid.
  const anchor = 0;
  return dayjs(anchor - elapsed).from(dayjs(anchor));
}
