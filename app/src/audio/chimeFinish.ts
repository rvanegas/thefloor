import { chimePlayer, type ChimePlayerReading } from '../../modules/audio-route';
import { spanMs } from './chime';
import { CHIME_TAIL_MS, HANDOVER_MS } from './useFilmHandover';

/**
 * How often a held microphone asks the chime player where it has got to.
 * Fine against a 180ms sound, and cheap: the reading is a property read on the
 * native side.
 */
const POLL_MS = 20;

/**
 * The longest a play chime may hold the microphone, whatever the player says.
 *
 * **A wait with a deadline**, on the rule the film's follower is held to: a
 * chime player that never reports a finish — a sound refused without saying
 * so, a delegate that never fires — must not keep a device's microphone open
 * under a starting film. The sound and its tail twice over, which is well past
 * any finish that was coming and well short of the start being noticed late.
 */
export const CHIME_HOLD_MAX_MS = (spanMs('play') + CHIME_TAIL_MS) * 2;

/** Why a hold ended, for the journal. */
export type ChimeHoldEnd =
  | 'finished'
  | 'refused'
  | 'no reading'
  | 'deadline';

/**
 * Calls `done` once the play chime just sounded has been heard out, and
 * answers a cancel.
 *
 * **On the sound's own finish rather than on a guess at its length**, since
 * 2026-10-03. The microphone used to be released `HANDOVER_MS` after the chime
 * was *asked for* — its samples and `CHIME_TAIL_MS` — so a chime that began
 * late, behind a slow first play or a session busy at that moment, lost its
 * end to the release. The chime player reports a finish
 * (`finishedAfterMs`, from `AVAudioPlayerDelegate`), and the release now waits
 * for that and then for `CHIME_TAIL_MS`, which is what the tail was always
 * for: the sound still leaving the speaker after the player has handed over
 * its last sample.
 *
 * Three ways it ends sooner or otherwise, each said in `ChimeHoldEnd`:
 *
 * - **`refused`** — the player would not play it, or could not decode it.
 *   There is nothing to protect, so the microphone goes at once.
 * - **`no reading`** — no instrument to ask: a binary from before 2026-10-02,
 *   no module, or a reading that is plainly an earlier chime's. The old
 *   timer, `HANDOVER_MS` from the chime, which is what every device did.
 * - **`deadline`** — `CHIME_HOLD_MAX_MS` with no finish.
 *
 * `read` is injectable for the tests; it defaults to the native reading.
 */
export function waitForChime(
  done: (end: ChimeHoldEnd, heldMs: number) => void,
  read: () => ChimePlayerReading | null = chimePlayer
): () => void {
  const from = Date.now();
  let timer: ReturnType<typeof setTimeout> | null = null;
  let over = false;
  const finish = (end: ChimeHoldEnd) => {
    if (over) return;
    over = true;
    if (timer !== null) clearTimeout(timer);
    done(end, Date.now() - from);
  };
  const look = () => {
    timer = null;
    const elapsed = Date.now() - from;
    const reading = read();
    // A reading older than this hold is an earlier chime's, which says
    // nothing about this one. Allowed a poll's slack, the play having been
    // asked for just before the hold began.
    const ours = reading !== null && reading.sinceMs <= elapsed + POLL_MS * 2;
    if (!ours) {
      if (elapsed >= HANDOVER_MS) return finish('no reading');
    } else if (!reading.accepted || reading.decodeFailed) {
      return finish('refused');
    } else if (reading.finishedAfterMs !== undefined) {
      const tailLeft =
        reading.finishedAfterMs + CHIME_TAIL_MS - reading.sinceMs;
      if (tailLeft <= 0) return finish('finished');
      timer = setTimeout(() => finish('finished'), tailLeft);
      return;
    }
    if (elapsed >= CHIME_HOLD_MAX_MS) return finish('deadline');
    // The next look, landing exactly on the fallback or the deadline when
    // either is nearer than a poll, so neither is ever a poll late.
    const due = ours ? CHIME_HOLD_MAX_MS : HANDOVER_MS;
    timer = setTimeout(look, Math.max(0, Math.min(POLL_MS, due - elapsed)));
  };
  look();
  return () => {
    over = true;
    if (timer !== null) clearTimeout(timer);
  };
}
