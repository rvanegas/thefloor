/**
 * Whether a microphone that was granted is producing anything.
 *
 * **The failure it exists for is the one `embedded.ts` is only the warning
 * for.** On the web every step of the audio path can succeed and still carry
 * silence — `getUserMedia` resolves, the track is live and unmuted,
 * `publishTrack` succeeds, the SFU forwards — and there is no event anywhere
 * that says so. The only way to know is to listen to the track, which is what
 * `server/web/guest.ts` learnt on 2026-08-21 and paid for in a defect; see
 * decisions/archive/DECISIONS-2026-08-21-to-2026-08-23.md § *A granted
 * microphone is not a working one, inside somebody else's browser*.
 *
 * What is here is the counting rule and nothing else. Reading the samples is
 * an `AnalyserNode` and cannot be pure; deciding what a run of quiet ones
 * means is arithmetic, and it is in `core/` for the reason `isEmbeddedBrowser`
 * is: two browsers need the same answer — the guest page, and `/app` and
 * `/beta` through `app/src/audio/useSessionAudio.web.ts` — and a second copy
 * would drift the first time either threshold was tuned.
 *
 * **It is deliberately a question and not a verdict.** Somebody in a quiet
 * room with noise suppression on reads as silent too, so what the callers draw
 * says what was observed and offers the two things that might help, rather
 * than announcing that a microphone is broken.
 */

/** Peak amplitude below which a sample counts as quiet. */
export const SILENCE = 0.002;

/**
 * How many quiet samples in a row before saying so.
 *
 * Eight seconds at the callers' four a second — long enough that a pause
 * between sentences never reaches it, short enough that somebody who has been
 * talking into a dead microphone finds out while it still matters.
 */
export const PATIENCE = 32;

/**
 * `waiting` is the answer for as long as it is still an open question; the
 * other two are final, and settle this microphone for good. A caller that
 * reaches either stops sampling — there is nothing further to learn, and the
 * cost of the analyser is not worth paying to confirm it.
 */
export type CaptureVerdict = 'waiting' | 'heard' | 'silent';

export interface CaptureWatch {
  /** Consecutive quiet samples, reset by nothing: a single peak settles it. */
  quiet: number;
  verdict: CaptureVerdict;
}

export function startWatch(): CaptureWatch {
  return { quiet: 0, verdict: 'waiting' };
}

/**
 * Folds one reading in.
 *
 * **`null` is not silence and is not counted.** A suspended `AudioContext` and
 * a muted track both yield zeroes that mean nothing about the microphone, and
 * counting them is how a muted person gets told their microphone is dead. The
 * caller passes `null` for those, so `PATIENCE` is eight seconds of samples
 * that were actually taken rather than eight seconds of clock.
 */
export function sample(watch: CaptureWatch, peak: number | null): CaptureWatch {
  if (watch.verdict !== 'waiting') return watch;
  if (peak === null) return watch;
  if (peak > SILENCE) return { quiet: 0, verdict: 'heard' };
  const quiet = watch.quiet + 1;
  return { quiet, verdict: quiet >= PATIENCE ? 'silent' : 'waiting' };
}
