import { useEffect, useRef, useState } from 'react';
import { spanMs } from './chime';

/**
 * How long the microphone is held past the moment a film starts: exactly the
 * length of the chime that announces it.
 *
 * **Derived rather than chosen**, on the reasoning `CHIME_STALE_MS` in
 * `chime.ts` gives for the same move: a constant written beside the sound is a
 * constant that has to be remembered, and the beat drifted once under that
 * arrangement without anybody noticing. Retune the play chime and this follows
 * it.
 */
export const HANDOVER_MS = spanMs('play');

/**
 * Holds this device's microphone open for the length of the play chime, so the
 * chime is heard.
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
 * **The cost is about 180ms added to a press of Play**, paid by whoever pressed
 * it. A resume is already around 1,304ms from press to picture and about 1,150
 * of that is `AVAudioSession` renegotiating — see
 * decisions/2026-09-28-the-film-waits-for-the-audio-session.md — so this is a
 * seventh of a wait that is not ours to shorten, spent on the one thing in that
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
  /** The last value seen, so the hold is armed by the edge and not the level. */
  const seen = useRef(screening);

  useEffect(() => {
    const before = seen.current;
    seen.current = screening;
    if (!screening || before) return;

    setHolding(true);
    const timer = setTimeout(() => setHolding(false), HANDOVER_MS);
    return () => {
      clearTimeout(timer);
      // **Released rather than left standing**, which matters on the path this
      // guards: unmounting mid-hold is leaving the channel, and a microphone
      // held by a timer that no longer exists would be held for ever.
      setHolding(false);
    };
  }, [screening]);

  return holding;
}
