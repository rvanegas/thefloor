import { useEffect, useState } from 'react';
import { spanMs } from './chime';

/**
 * How far past the end of its samples a chime may still be sounding.
 *
 * **Added 2026-10-02, when the hold had been exactly the samples' length and a
 * play chime from the room was silent on the device showing the film**, every
 * time, with the room's other three chimes heard. `play()` is not the sound
 * leaving the speaker, and the release that followed the hold reached the
 * engine about 315ms after the chime on the phone that lost it against 375ms on
 * the one that did not. Half again the sound's length clears both, and is a
 * guess until `chimePlayer` reports a position at the release — see
 * decision/2026-10-02-the-play-chime-is-held-past-its-samples.md.
 *
 * **Since 2026-10-03 it is counted from the sound's finish**, where the chime
 * player can report one (`waitForChime` in chimeFinish.ts), and so covers only
 * what is still leaving the speaker after the last sample. `HANDOVER_MS` below
 * is the fallback where it cannot, and this hook's own hold.
 */
export const CHIME_TAIL_MS = 150;

/**
 * How long the microphone is held past the moment a film starts: the length of
 * the chime that announces it, and its tail.
 *
 * **Derived rather than chosen**, on the reasoning `CHIME_STALE_MS` in
 * `chime.ts` gives for the same move: a constant written beside the sound is a
 * constant that has to be remembered, and the beat drifted once under that
 * arrangement without anybody noticing. Retune the play chime and this follows
 * it.
 */
export const HANDOVER_MS = spanMs('play') + CHIME_TAIL_MS;

/**
 * Holds this device's microphone open for the length of the play chime and its
 * tail, so the chime is heard.
 *
 * **A chime is an `AVAudioPlayer` playing into the session this app holds** —
 * `CHIME_PATH` is `player`, and `playThroughPlayer` in `AudioRouteModule.swift`
 * says what that means. So a chime is audible only while this app holds a
 * settled session, and on the device showing the film both edges of a run move
 * it: `isScreening` drops `microphoneNeeded`, the session falls from `CALL`
 * (`playAndRecord`) to `LISTENING` (`playback`), and then the `WKWebView` takes
 * it for something over a second. A chime fired into that window is lost.
 *
 * **This is the play half of the answer, and it is an ordering rather than a
 * gate.** `useWatchChime` fires the moment the snapshot says `playing`; this
 * keeps the session where that sound can be heard until it has been. The pause
 * half is the other way round and lives in that hook — the chime waits for
 * `playAndRecord` to come back rather than the session waiting for the chime,
 * because there the sound is the thing that can be late.
 *
 * **It may only ever add back what the film subtracted.** The caller enforces
 * that with `hasMicrophone`, exactly as the `filmProbeKeepsMicrophone` line
 * beside it in `App.tsx` does: this must never open a microphone in a room
 * somebody is not standing in, and never one for a guest with no speech grant.
 * A boolean here cannot know either, and is not asked to.
 *
 * **The cost is about 330ms added to a press of Play**, paid by whoever pressed
 * it — the chime's 180ms and `CHIME_TAIL_MS`, since 2026-10-02. A resume is
 * already around 1,304ms from press to picture and about 1,150
 * of that is `AVAudioSession` renegotiating — see
 * decision/2026-09-28-the-film-waits-for-the-audio-session.md — so this is a
 * quarter of a wait that is not ours to shorten, spent on the one thing in that
 * second the room can actually hear.
 *
 * **What it does not cover is a queued chime.** Two chimes in one tick are
 * spaced by `CHIME_BEAT_SECONDS`, so a play chime that lands behind another has
 * its tail outside this hold. Accepted: it costs a chime in a tick that already
 * had one, and widening the hold to the worst case would spend the resume on
 * every press for a case that is rare.
 *
 * **Nothing happens on arrival.** A film already running when this mounts is
 * not a film that started, which is the rule the chime hooks state in full —
 * there is no sound to protect, so there is no hold. The first value of
 * `screening` is taken as read.
 *
 * Meaningless in a browser and harmless there: `App.tsx` is shared, there is no
 * `AVAudioSession` to hand over, and a web chime is scheduled rather than
 * played late.
 *
 * @param screening whether this device is showing the film — `isScreening` in
 *                  core/micNeeded.ts, which is the exact predicate that drops
 *                  `microphoneNeeded` and therefore the one this must follow.
 * @returns whether the microphone should still be held.
 */
export function useFilmHandover(screening: boolean): boolean {
  const [holding, setHolding] = useState(false);
  /**
   * The last value an effect has acted on, so the hold is armed by the edge
   * and not the level.
   */
  const [seen, setSeen] = useState(screening);

  useEffect(() => {
    if (screening === seen) return;
    setSeen(screening);
    setHolding(screening);
  }, [screening, seen]);

  useEffect(() => {
    if (!holding) return;
    // Cleared on unmount with the timer, and the state goes with the
    // component: leaving the channel mid-hold cannot leave a microphone held.
    const timer = setTimeout(() => setHolding(false), HANDOVER_MS);
    return () => clearTimeout(timer);
  }, [holding]);

  /*
    **Answered from the render the edge arrives in, not from the one after.**
    Until 2026-09-29 this returned `holding` alone, which an effect set — so
    the render where `screening` turned true still answered `false`, and
    `App.tsx` computes `micNeeded` from that render. Every Play from build 309
    therefore released the session, retook it when the effect ran, and
    released it again 180ms later: three session changes where there should be
    one, and the retake's capture, finishing after the second release, dragged
    the session back to `playAndRecord` under a starting film.

    `screening && !seen` is that first render: an edge nothing has acted on
    yet. Derived rather than set during render, because a render React throws
    away is still a render — `useSessionAudio` runs in it with whatever this
    returns. And `screening &&` on the whole of it, so an edge down releases at
    once, as it always did.
  */
  return screening && (holding || !seen);
}
