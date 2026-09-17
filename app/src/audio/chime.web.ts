/**
 * The browser's version of the chime, which for once is the *stronger* twin.
 *
 * `cue.web.ts` had to give up the buzz and settle for a mark on the tab,
 * because a browser has no vibration motor to reach a pocket with. This has no
 * such problem: the whole cue is two notes, and Web Audio synthesises them
 * from nothing — no asset, no permission, no service worker.
 *
 * **This is not the tone `cue.web.ts` rules out.** That paragraph forbids
 * reviving the *silenced-speaker* tone in the browser, on the grounds that it
 * would play over the very voice it was announcing with no locked phone to
 * justify it. An arrival has no voice of its own to talk over, and the person
 * it is about is the one person who does not hear it.
 *
 * Two notes reversed, same as the native half, and the frequencies are kept
 * identical on purpose: somebody who uses the phone and the web app should not
 * have to learn the sound twice. **`KINDS` is that agreement written down** —
 * it mirrors `chimeNotes` in `AudioRouteModule.swift` row for row, and the two
 * drifting apart would mean the same event sounding like a different one
 * depending on which screen somebody happened to be at.
 */

import {
  CHIME_AMPLITUDE,
  CHIME_BEAT_SECONDS,
  type ChimeKind,
} from '../../modules/audio-route';

const NOTE_E5 = 659.25;
const NOTE_A5 = 880.0;
const NOTE_CS5 = 554.37;

/**
 * The four kinds, as note sequences.
 *
 * `nearby` is the same note twice where the others move — the rung between
 * being in a room and being out of it, sounding like neither direction. E5
 * twice, picked by ear on a phone on 2026-09-15 over a single E5 and flat pairs
 * at A5 and C#5. The lab's `nearby-*` candidates have no counterpart here on
 * purpose: the choice between them is made through a phone's speaker, and a
 * browser is not that.
 */
const KINDS: Record<ChimeKind, number[]> = {
  in: [NOTE_E5, NOTE_A5],
  out: [NOTE_A5, NOTE_E5],
  nearby: [NOTE_E5, NOTE_E5],
  recording: [NOTE_CS5, NOTE_E5, NOTE_A5],
};
const NOTE_SECONDS = 0.09;
/**
 * Matches the native amplitude, and is the only one: *subtle* was the
 * requirement, it was reported as too quiet to notice, and for one day on
 * 2026-09-15 how subtle was the listener's to say. The number is
 * `CHIME_AMPLITUDE` rather than a literal so a browser and a phone cannot
 * sound at different loudnesses — here it is a real gain on the media path,
 * where on a phone it is the peak the samples are rendered at. See
 * planning/decisions/2026-09-15-the-chime-has-one-loudness-again.md.
 */
const PEAK = CHIME_AMPLITUDE;

let context: AudioContext | null = null;

/**
 * When the speaker is next free, in the audio context's own clock.
 *
 * Reset with the context rather than carried across one: a fresh context
 * starts its clock at zero, so a stamp from the previous one would be in the
 * future for as long as that one had been running.
 */
let nextFree = 0;

/**
 * The one context, made on first use.
 *
 * **Lazily, because a context made at import time starts suspended** — a
 * browser will not let a page make noise before it has been interacted with.
 * By the time anybody is present in a channel they have tapped their way in,
 * so the gesture has happened; `resume` is still called because a tab that has
 * been backgrounded can have had its context suspended since.
 */
function audio(): AudioContext | null {
  try {
    const Ctor =
      globalThis.AudioContext ??
      (globalThis as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!Ctor) return null;
    if (!context) {
      context = new Ctor();
      nextFree = 0;
    }
    if (context.state === 'suspended') void context.resume();
    return context;
  } catch {
    return null;
  }
}

/**
 * **The peak is an argument here for the reason it is native-side**: it is a
 * real gain in Web Audio rather than a rendered sample value, which is the one
 * place the browser has the easier job — the same choice on the settings
 * screen reaches both, and nothing has to be rendered twice to honour it.
 */
export function chime(kind: ChimeKind, amplitude: number = PEAK): void {
  try {
    const ctx = audio();
    if (!ctx) return;

    const notes = KINDS[kind];
    if (!notes) return;

    /**
     * **Where the browser has the easier job, as it did with the peak.**
     *
     * Two chimes in one tick must not start together — see `CHIME_BEAT_SECONDS`
     * — and here the fix needs no timer at all: Web Audio takes the moment to
     * start each note as an argument, so a second chime is simply scheduled
     * after the first rather than played later by a clock. `nextFree` is in the
     * context's own time, which is what those arguments are in.
     *
     * The native twin keeps the same `nextFree` idea against `Date.now()` and
     * a `setTimeout`, because a system sound has no such argument. The two
     * agree on the gap and on nothing else about how it is produced.
     */
    const start = Math.max(ctx.currentTime, nextFree);
    nextFree = start + notes.length * NOTE_SECONDS + CHIME_BEAT_SECONDS;

    notes.forEach((frequency, index) => {
      const at = start + index * NOTE_SECONDS;
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();

      oscillator.type = 'sine';
      oscillator.frequency.value = frequency;

      // The same shape the Swift renderer draws by hand: a 5ms attack so the
      // note does not begin on a discontinuity, then an exponential decay.
      // `exponentialRampToValueAtTime` will not accept zero, hence the floor.
      gain.gain.setValueAtTime(0, at);
      gain.gain.linearRampToValueAtTime(amplitude, at + 0.005);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + NOTE_SECONDS);

      oscillator.connect(gain).connect(ctx.destination);
      oscillator.start(at);
      oscillator.stop(at + NOTE_SECONDS);
    });
  } catch {
    // A browser refusing something, or no Web Audio at all. A failed cue must
    // not become an error in a conversation — the contract every file in this
    // directory holds itself to.
  }
}

/**
 * Nothing to warm, and the export exists so the hook can call it.
 *
 * `usePresenceChime` warms the three sounds before any of them is wanted,
 * because the native half renders a WAV and creates a system sound on the
 * first play of each peak. Web Audio synthesises a note from nothing at the
 * moment it is asked, so there is no file, no cache and no cold first cue —
 * but a module that is imported for a function it does not export throws at
 * the call, which is the whole of the cue on this platform. So it is here,
 * empty, and takes the peak for the signature's sake rather than for a use.
 */
export function warmChimes(_amplitude?: number): void {
  // Nothing to do: see above.
}

export function chimeIn(amplitude?: number): void {
  chime('in', amplitude);
}

export function chimeOut(amplitude?: number): void {
  chime('out', amplitude);
}

export function chimeNearby(amplitude?: number): void {
  chime('nearby', amplitude);
}

export function chimeRecording(amplitude?: number): void {
  chime('recording', amplitude);
}
