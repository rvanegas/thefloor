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

import type { ChimeKind } from '../../modules/audio-route';

const NOTE_E5 = 659.25;
const NOTE_A5 = 880.0;

/**
 * The three kinds, as note sequences.
 *
 * `nearby` is one note where the others are two — the rung between being in a
 * room and being out of it, sounding like neither. The lab's `nearby-*`
 * candidates have no counterpart here on purpose: the choice between them is
 * made through a phone's speaker, and a browser is not that.
 */
const KINDS: Record<ChimeKind, number[]> = {
  in: [NOTE_E5, NOTE_A5],
  out: [NOTE_A5, NOTE_E5],
  nearby: [NOTE_E5],
};
const NOTE_SECONDS = 0.09;
/** Matches the native amplitude. *Subtle* is the requirement. */
const PEAK = 0.18;

let context: AudioContext | null = null;

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
    context ??= new Ctor();
    if (context.state === 'suspended') void context.resume();
    return context;
  } catch {
    return null;
  }
}

export function chime(kind: ChimeKind): void {
  try {
    const ctx = audio();
    if (!ctx) return;

    const notes = KINDS[kind];
    if (!notes) return;
    notes.forEach((frequency, index) => {
      const at = ctx.currentTime + index * NOTE_SECONDS;
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();

      oscillator.type = 'sine';
      oscillator.frequency.value = frequency;

      // The same shape the Swift renderer draws by hand: a 5ms attack so the
      // note does not begin on a discontinuity, then an exponential decay.
      // `exponentialRampToValueAtTime` will not accept zero, hence the floor.
      gain.gain.setValueAtTime(0, at);
      gain.gain.linearRampToValueAtTime(PEAK, at + 0.005);
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

export function chimeIn(): void {
  chime('in');
}

export function chimeOut(): void {
  chime('out');
}

export function chimeNearby(): void {
  chime('nearby');
}
