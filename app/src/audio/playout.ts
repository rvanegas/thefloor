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

export function initialPlayoutWatch(now: number): PlayoutWatch {
  return { samples: null, movedAt: now, reported: false };
}

/**
 * Folds one reading in, and says whether it is worth a line in the log.
 *
 * **Transitions only.** The log is a forty-entry ring shared with every other
 * audio event, and a poll that wrote a line every two seconds would push the
 * connect, the subscribe and the engine transitions — the context that makes a
 * freeze mean anything — out of it within a couple of minutes. So a freeze is
 * reported once when it starts and once when it ends, and the quiet in between
 * is the evidence.
 *
 * A reading of `null` — no track, or statistics that could not be gathered —
 * neither advances nor freezes anything. It is an absence of measurement, and
 * this file must not let that look like a measurement of absence.
 */
export function onPlayoutSample(
  watch: PlayoutWatch,
  samples: number | null,
  now: number
): { next: PlayoutWatch; event: string | null } {
  if (samples === null) return { next: watch, event: null };

  if (watch.samples === null) {
    return { next: { samples, movedAt: now, reported: false }, event: null };
  }

  if (samples > watch.samples) {
    const event = watch.reported
      ? `playout resumed after ${Math.round((now - watch.movedAt) / 1000)}s`
      : null;
    return { next: { samples, movedAt: now, reported: false }, event };
  }

  // Standing still. Reported once, when it has stood still long enough to be
  // a fact rather than a poll landing badly.
  const still = now - watch.movedAt;
  if (!watch.reported && still >= PLAYOUT_FREEZE_MS) {
    return {
      next: { ...watch, samples, reported: true },
      event: `playout frozen ${Math.round(still / 1000)}s — subscribed, rendering nothing`,
    };
  }
  return { next: { ...watch, samples }, event: null };
}
