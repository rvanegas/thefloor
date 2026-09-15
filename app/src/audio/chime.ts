import {
  chime as playChime,
  type ChimeKind,
} from '../../modules/audio-route';

export type { ChimeKind };

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
 */

/** Somebody stepped in. */
export function chimeIn(): void {
  playChime('in');
}

/** Somebody stepped out, by a decision rather than a dropped connection. */
export function chimeOut(): void {
  playChime('out');
}

/** Somebody outside the room declared themselves nearby to it. */
export function chimeNearby(): void {
  playChime('nearby');
}

/**
 * One function over all three, which is what the hook holds and the tests
 * replace.
 *
 * A single injectable `fire` keeps the sounds together at the call site — a
 * hook taking three callbacks invites a caller to wire them the wrong way
 * round, and a chime pair wired backwards is a bug nothing but an ear would
 * catch. **A named kind rather than the boolean it was** for the same reason
 * one level down: `fire(true)` could only ever mean one of two things, and
 * there are three.
 */
export function chime(kind: ChimeKind): void {
  playChime(kind);
}
