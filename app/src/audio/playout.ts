/**
 * Whether this device is actually rendering the audio it is subscribed to.
 *
 * **The only measurement of that which does not itself stop the audio.**
 * Everything in `engineState.ts` reads the WebRTC audio device module, and
 * reading the ADM is what killed the sound on 2026-08-24 — the diagnostic panel
 * was the fault for four days. `totalSamplesDuration` comes from standard
 * `inbound-rtp` statistics instead: it is the receiver's own count, reached
 * through `RemoteAudioTrack.getReceiverStats()`, and it touches no engine at
 * all.
 *
 * **Why it means anything.** The ADM pulls 10ms frames out of the jitter buffer
 * in order to render them, and that pull is what advances the count. No pull,
 * no samples. So the value moving says this device is rendering; the value
 * frozen while a track is subscribed says it is not — which is precisely the
 * state that has been reported all day as *playing, with no sound*, and which
 * nothing on the phone could previously see.
 *
 * The shared-playback pump publishes silence between tracks as diligently as it
 * publishes audio, so a paused track is still a stream of samples arriving. A
 * quiet channel and a broken one are therefore *not* the same reading here,
 * which is the property that makes this usable at all.
 *
 * **One watch per track, and that is the correction of 2026-08-25.** The first
 * version summed every subscribed track into a single count, on the reasoning
 * that what matters is whether *something* is being rendered rather than which.
 * That reasoning is wrong, and the day's logs show how: a human track's samples
 * advance the sum while the shared-playback track next to it renders nothing,
 * so the fault this file exists to catch is invisible for exactly as long as
 * anybody else is in the channel. Since the fault has only ever been reported
 * when alone, the sum made the instrument agree with the symptom by
 * construction — a detector that cannot see the case it is being used to rule
 * out. Each track is now clocked on its own and named in its own line.
 *
 * **Keyed by track sid rather than by participant**, because the counter
 * belongs to the receiver: a participant that republishes gets a new receiver
 * whose count starts again at zero. Keyed by identity, that restart reads as a
 * count that failed to advance — a freeze reported for a track that is in fact
 * healthy and new. Keyed by sid, it is simply a track this file has not seen
 * before, which is a thing it already knows how to start clocking.
 *
 * **Log-only, deliberately, and this is a decision rather than a stage.** A
 * rebuild is known to restore the sound — the one recovery that has ever worked
 * — so it is tempting to wire this straight to `reconnect()`. What is not known
 * is how often this freezes *legitimately*: an app in the background stops
 * rendering on purpose, and a media participant that has not published yet has
 * never rendered at all. Acting on an untested detector would ship a reconnect
 * loop into other people's conversations. So this counts and dates the fault
 * first, and the decision to act on it is made against the count.
 */

/** How often the receiver is asked, in ms. Cheap, but not free. */
export const PLAYOUT_POLL_MS = 2_000;

/**
 * How long the count may stand still before it is a finding.
 *
 * Samples arrive continuously whenever anything is subscribed, so a second of
 * stillness is already abnormal. Five is slack for a poll landing either side
 * of a stutter, and short enough that a person who heard the sound stop is
 * still holding the phone when the line appears.
 */
export const PLAYOUT_FREEZE_MS = 5_000;

export interface PlayoutWatch {
  /** The last count seen, or null before anything has been read. */
  samples: number | null;
  /** When the count last moved. */
  movedAt: number;
  /** Whether the stillness has already been reported, so it is said once. */
  reported: boolean;
}

/**
 * One reading of one track.
 *
 * `key` is the track sid and identifies the clock; `label` is what a person
 * reading the log needs in order to know which track stopped, and is the same
 * participant identity the `sub +` and `sub -` lines carry, so the two can be
 * lined up by eye.
 */
export interface PlayoutReading {
  key: string;
  label: string;
  /** `null` where the statistics could not be gathered. Not a zero. */
  samples: number | null;
}

/** Every track's clock, by track sid. */
export type PlayoutWatches = Record<string, PlayoutWatch>;

export function initialPlayoutWatch(now: number): PlayoutWatch {
  return { samples: null, movedAt: now, reported: false };
}

export function initialPlayoutWatches(): PlayoutWatches {
  return {};
}

/**
 * Folds one track's reading in, and says whether it is worth a line in the log.
 *
 * **Transitions only.** The log is a ring shared with every other audio event,
 * and a poll that wrote a line every two seconds would push the connect, the
 * subscribe and the engine transitions — the context that makes a freeze mean
 * anything — out of it within a couple of minutes. So a freeze is reported once
 * when it starts and once when it ends, and the quiet in between is the
 * evidence.
 *
 * A reading of `null` — no track, or statistics that could not be gathered —
 * neither advances nor freezes anything. It is an absence of measurement, and
 * this file must not let that look like a measurement of absence.
 */
export function onPlayoutSample(
  watch: PlayoutWatch,
  samples: number | null,
  now: number,
  label?: string
): { next: PlayoutWatch; event: string | null } {
  if (samples === null) return { next: watch, event: null };

  if (watch.samples === null) {
    return { next: { samples, movedAt: now, reported: false }, event: null };
  }

  const named = label ? `${label} ` : '';
  const suffix = label ? ` — ${label}` : '';

  if (samples > watch.samples) {
    const event = watch.reported
      ? `playout resumed after ${Math.round((now - watch.movedAt) / 1000)}s${suffix}`
      : null;
    return { next: { samples, movedAt: now, reported: false }, event };
  }

  // Standing still. Reported once, when it has stood still long enough to be
  // a fact rather than a poll landing badly.
  const still = now - watch.movedAt;
  if (!watch.reported && still >= PLAYOUT_FREEZE_MS) {
    return {
      next: { ...watch, samples, reported: true },
      event: `playout frozen ${Math.round(still / 1000)}s — ${named}subscribed, rendering nothing`,
    };
  }
  return { next: { ...watch, samples }, event: null };
}

/**
 * Folds in one poll's worth of readings, one per subscribed track.
 *
 * **A track that was not read this time is dropped rather than held.** The
 * readings are the set of tracks currently subscribed, so anything missing from
 * them has gone — and keeping its clock would mean a track that returns under a
 * fresh receiver inherits a stale count. Dropping is also what stops this map
 * growing for the length of a long channel.
 *
 * Note that dropping is keyed on the track being *absent from the readings*,
 * not on its samples being `null`: a track that is present but unreadable keeps
 * its clock, which is the distinction `onPlayoutSample` is built around.
 */
export function onPlayoutReadings(
  watches: PlayoutWatches,
  readings: PlayoutReading[],
  now: number
): { next: PlayoutWatches; events: string[] } {
  const next: PlayoutWatches = {};
  const events: string[] = [];

  for (const reading of readings) {
    const watch = watches[reading.key] ?? initialPlayoutWatch(now);
    const step = onPlayoutSample(watch, reading.samples, now, reading.label);
    next[reading.key] = step.next;
    if (step.event) events.push(step.event);
  }

  return { next, events };
}
