import { useEffect, useState } from 'react';
import { AppState, Platform } from 'react-native';

/**
 * Whether the film may have this device's microphone — which is to say
 * whether `isScreening`'s release may actually happen here, now.
 *
 * **`CALL` is given up for two reasons and no others: to play a film while the
 * app is in front, or to leave the room** — stepping out or going nearby,
 * which take `mediaRoom` away and never reach this. A film on a device that is
 * not in front is not being watched, so it has no claim on the microphone:
 *
 * - a film that starts while the app is behind leaves `CALL` where it is — the
 *   device is muted by the run like everybody else's;
 * - a device that released for a film in front **retakes `CALL` the moment it
 *   leaves the front**, at `inactive`, before iOS has put it in the
 *   background;
 * - and it releases again when it comes back, if the film is still running.
 *
 * **Why, which is the keep-alive.** iOS lets a backgrounded app keep a
 * microphone and refuses it a new one, so a device left on `LISTENING` in the
 * background cannot promote until somebody picks it up. And `LISTENING` holds
 * a backgrounded process only while audio is flowing, which during a run it is
 * not: the room is party-muted, so nothing is subscribed. Such a phone was
 * suspended within about a second, the SFU dropped it, and a minute later the
 * account was *Nearby* — taking the film away from the second device too.
 * Capturing is the one thing a backgrounded app may go on doing, so `CALL` is
 * what keeps it running. See `task/keep-alive.md`.
 *
 * **The retake at `inactive` is a bet on timing, and the log settles it.**
 * `useSessionAudio` defers a promotion only once the app is in `background`,
 * so the ask is made in time; whether `CALL` lands before the suspension is
 * what `capturing CALL` against `capture deferred (backgrounded)` in the audio
 * log will say on a device.
 *
 * iOS only. Android keeps its process with a foreground service rather than
 * with the session, and a browser has no session to hand over; both release
 * exactly as `isScreening` says.
 *
 * @param screening `isScreening` in core/micNeeded.ts — the room's answer.
 * @returns whether this device should actually release for the film.
 */
export function useFilmTakesMicrophone(screening: boolean): boolean {
  const active = useActive();
  return screening && (Platform.OS !== 'ios' || active);
}

/**
 * Whether the app is frontmost, as a state so that a change re-renders.
 *
 * **`inactive` counts as behind**, which is the point of reading it here: it
 * is the first sign of a lock or a swipe home, and the last moment iOS still
 * treats the app as in front for the purpose of a microphone.
 *
 * Exported for the film's follower, which stands down while the app is behind
 * for the same reason: a backgrounded `WKWebView` has its JavaScript
 * suspended, and a page that has stopped reporting for that reason is not one
 * to rebuild. See `WatchPlayer`.
 */
export function useActive(): boolean {
  const [active, setActive] = useState(AppState.currentState === 'active');
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (next) =>
      setActive(next === 'active')
    );
    // Read again after subscribing: a change between the initial state and
    // the listener would otherwise be missed until the next one.
    setActive(AppState.currentState === 'active');
    return () => subscription.remove();
  }, []);
  return active;
}
