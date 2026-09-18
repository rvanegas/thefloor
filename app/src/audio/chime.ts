import {
  CHIME_AMPLITUDE,
  CHIME_BEAT_SECONDS,
  CHIME_NOTE_SECONDS,
  CHIME_NOTES,
  chime as playChime,
  prepareChime,
  type ChimeKind,
} from '../../modules/audio-route';

export type { ChimeKind };

/** The four the app can actually play, which is what there is to warm. */
const KINDS: ChimeKind[] = ['in', 'out', 'nearby', 'recording'];

/**
 * Renders all four and hands them to the system sound server, ahead of time.
 *
 * **A chime that renders at the moment it is needed is a chime that arrives
 * late or half-formed.** The first play of a given sound writes a WAV, creates
 * a `SystemSoundID` and plays it in one breath, and a cue 180ms long has no
 * margin for a server still picking the file up — which is the shape of *quiet
 * once, normal twice*. The work is a few milliseconds and a file write; the
 * only question is whether it lands before the tap or on it.
 *
 * Called from `usePresenceChime`, at mount. **The native cache is keyed on the
 * peak**, so warming at one number and playing at another is a cold sound with
 * no margin — which is why this still takes the argument that the ladder
 * needed, now that there is one peak and both ends of it are
 * `CHIME_AMPLITUDE`. The lab is the only caller that passes anything else.
 */
export function warmChimes(amplitude: number = CHIME_AMPLITUDE): void {
  for (const kind of KINDS) {
    prepareChime(kind, amplitude);
  }
}

/**
 * The two sounds a room makes when its shape changes.
 *
 * **Beside `cue.ts` rather than inside it, because it is a different kind of
 * thing.** The buzz tells one person something about themselves without words;
 * this tells everybody in the room what just happened to the room. They share
 * a delivery mechanism and nothing else, and collapsing them would mean a
 * single `fire()` that has to carry which of three meanings it had.
 *
 * **Why a sound at all, when `buzz` already reaches a locked phone.** Because
 * a buzz carries no bit. The 2026-08-21 entry *The buzz reaches a locked
 * phone, so the tone is not built* is about the silenced-speaker cue and is
 * still right about it: there, one buzz meant one thing, the pocket case was
 * already solved, and a tone would have played over the very voice it was
 * announcing. Here there are two things to tell apart — somebody arrived,
 * somebody left — and no amount of vibration distinguishes them. See
 * `decisions/2026-09-14-the-room-says-who-came-and-went.md`.
 *
 * **Inverse on purpose.** The same two notes in the opposite order, so the
 * second sound is audibly the first one backwards and nobody has to be taught
 * which is which.
 *
 * **And a third, which is neither.** Being nearby is not being in the room,
 * and it is not leaving one; it is the rung between, so it gets a single note
 * rather than a pair going either way. Until 2026-09-15 there was no such
 * sound and a declaration rang `in` — the one failure mode worse than an
 * inaudible cue, which is an audible cue that names the wrong thing.
 *
 * **No fallback, deliberately**, where `buzz` has one. `expo-haptics` could
 * produce *something* on a phone whose native half is too old, and that
 * something would be a cue that cannot say what it means — worse than
 * silence, because it would train somebody to check the screen every time.
 * Android and jest get nothing, exactly as `vibrate` degrades there.
 *
 * **How loud is a constant, and was a setting for one day.** The peak is an
 * argument all the way down — the file *is* the loudness on the alert path,
 * which takes no gain — but nothing above this passes one any more:
 * `undefined` here means `CHIME_AMPLITUDE`, the top rung of the ladder that was
 * offered and withdrawn, and the loudest the renderer will accept. A phone whose binary predates the argument plays
 * the sound at its baked-in peak instead of not playing: see
 * `playFirstAccepted` in `../../modules/audio-route`, which is the one
 * behaviour that must not be "simplified" away. See
 * planning/decisions/2026-09-15-the-chime-has-one-loudness-again.md.
 */

/** Somebody stepped in. */
export function chimeIn(amplitude?: number): void {
  playChime('in', amplitude);
}

/** Somebody stepped out, by a decision rather than a dropped connection. */
export function chimeOut(amplitude?: number): void {
  playChime('out', amplitude);
}

/** Somebody outside the room declared themselves nearby to it. */
export function chimeNearby(amplitude?: number): void {
  playChime('nearby', amplitude);
}

/**
 * A recording somebody started has begun.
 *
 * **The one chime that is not about presence**, and the only one the person
 * who caused it hears. The other three are a room telling you about somebody
 * else; this is a room telling everybody in it, the starter included, that
 * what they say from here is being kept. Withholding it from the starter would
 * save them nothing — they pressed the button — and would cost the one thing
 * this is for, which is that both parties can be said to have been told in the
 * same way at the same moment.
 */
export function chimeRecording(amplitude?: number): void {
  playChime('recording', amplitude);
}

/** How long a kind occupies the speaker, in milliseconds. */
function spanMs(kind: ChimeKind): number {
  return CHIME_NOTES[kind] * CHIME_NOTE_SECONDS * 1000;
}

/**
 * When the speaker is next free, as a `Date.now()` stamp.
 *
 * Module state rather than a hook's, which is the whole point: the presence
 * chimes and the recording chime are scheduled by two hooks that know nothing
 * about each other, and a room that has just gained somebody *and* started
 * recording would otherwise play both at once. Everything audible goes through
 * this function, so this is the one place that can know.
 */
let nextFree = 0;

/**
 * What became of a chime that was asked for.
 *
 * **Added because the audio lab could not tell silence from silence.** Three
 * different things sound identical from a room — the sound played, the sound
 * was held back a beat, and the sound was thrown away — and a section whose
 * whole subject is *timing* cannot be read by an ear that does not know which
 * of the three it is listening for. The hooks ignore this; the lab prints it.
 *
 * - `played` — handed to the sound server on this tick, and it accepted.
 * - `refused` — handed over and refused, which on this path means a binary
 *   with no `chime` at all rather than anything about the room.
 * - `queued` — the speaker was busy, so it will sound after the wait.
 * - `dropped` — further behind than `CHIME_STALE_MS`, so never played.
 */
export type ChimeOutcome = 'played' | 'refused' | 'queued' | 'dropped';

/** Past this far behind, a chime is dropped rather than played late. */
const CHIME_STALE_MS = 1_000;

/**
 * One function over all of them, which is what the hooks hold and the tests
 * replace.
 *
 * A single injectable `fire` keeps the sounds together at the call site — a
 * hook taking three callbacks invites a caller to wire them the wrong way
 * round, and a chime pair wired backwards is a bug nothing but an ear would
 * catch. **A named kind rather than the boolean it was** for the same reason
 * one level down: `fire(true)` could only ever mean one of two things, and
 * there are three. There are four now, and the fourth is not a presence chime
 * — `useRecordingChime` holds this same function for it.
 *
 * **It is also the queue, and that is why both hooks hold this one rather
 * than reaching for the module below.** Two chimes asked for in the same tick
 * are played one after the other with a beat between them, instead of
 * together: `AudioServicesPlaySystemSound` starts a sound and returns, so
 * *at the same moment* is what two calls in one tick literally means. Callers
 * stay ignorant of it — they say what happened, in the order it should be
 * narrated, and are not made to care when the speaker is free. See
 * planning/decisions/2026-09-17-two-chimes-at-once-are-a-chord.md.
 *
 * **It returns which of those four things happened, and the hooks ignore it.**
 * The return exists for the lab, where the queue itself is what is being
 * judged: a row that makes no sound is a finding only if you know whether the
 * queue threw it away or the speaker refused it.
 */
export function chime(kind: ChimeKind, amplitude?: number): ChimeOutcome {
  const now = Date.now();
  const at = Math.max(now, nextFree);
  const wait = at - now;

  /**
   * **A chime too late to be about anything is not played.**
   *
   * The queue only ever holds the handful of kinds one tick can declare, so a
   * wait this long is not a busy room — it is a backlog that has stopped
   * describing the present. Late is worse than absent here: the roster is
   * already right, and a sound a second behind it sends somebody looking for a
   * change that has been on screen the whole time.
   */
  if (wait > CHIME_STALE_MS) return 'dropped';

  nextFree = at + spanMs(kind) + CHIME_BEAT_SECONDS * 1000;
  if (wait === 0) {
    return playChime(kind, amplitude) ? 'played' : 'refused';
  }
  setTimeout(() => playChime(kind, amplitude), wait);
  return 'queued';
}
