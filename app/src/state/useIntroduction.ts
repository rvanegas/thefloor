import { useEffect, useState } from 'react';
import type { HomeView } from '../../../core/protocol';
import { storage } from './storage';
import {
  arrivalOf,
  introduction,
  type Arrival,
  type Introduction,
} from './introduction';

/**
 * The two things this has to remember, and it is only two because everything
 * else is derived from the snapshot.
 *
 * **Cleared on sign-out, unlike every other key here**, and the difference is
 * what they are about. `installNotice.ts` and the four `thefloor.notifications`
 * keys survive sign-out deliberately: they record what this *browser* or this
 * *install* has been shown, and iOS grants its one dialog per install however
 * many people sign in on the phone. These two record what an *account* has
 * done — how it arrived, and whether it has ever had a conversation — and a
 * second account signing in on the same phone has done neither. Left standing
 * they would tell a brand-new account it had finished.
 */
const ARRIVAL_KEY = 'thefloor.intro.arrival';
const DONE_AT_KEY = 'thefloor.intro.doneAt';

/**
 * Nothing here is in `REINSTALL_FORGETS`' company, and that is deliberate.
 * `useNotificationAsk` forgets three of its four keys on a reinstall because
 * they describe an install whose permission state died with it. These describe
 * the person: deleting the app does not undo having been invited, and does not
 * undo having had a conversation. It is the same reasoning that keeps
 * `conversed`, made about the same fact.
 */

/**
 * When to put the introduction in front of somebody, and the state that
 * decides it.
 *
 * Held in `AppProvider` for the reason `useNotificationAsk` is: `conversing`
 * is computed there from every channel snapshot this client is watching, and
 * a component recomputing it would need the map of channel views, which is
 * deliberately not on the context.
 */
export function useIntroduction(state: {
  /** Null when signed out, and then this forgets everything it knew. */
  token: string | null;
  home: HomeView | null;
  /** Their own name, from `me`; empty until the first `hello`. */
  displayName: string;
  /** In a channel with somebody else — the event all of this retires on. */
  conversing: boolean;
  /**
   * Their own username, or null when they have none.
   *
   * A callback rather than a value because it costs a request: a username is
   * on `ProfileView` and on nothing else, on the grounds that nothing outside
   * that screen reads one. This is now the second thing that does, and it
   * asks once, for one cohort, rather than putting a field on every snapshot
   * pushed to every client.
   */
  loadUsername: () => Promise<string | null>;
}): Introduction {
  const { token, home, displayName, conversing, loadUsername } = state;

  const [loaded, setLoaded] = useState(false);
  const [arrival, setArrival] = useState<Arrival | null>(null);
  const [doneAt, setDoneAt] = useState<number | null>(null);
  const [username, setUsername] = useState<string | null | undefined>(
    undefined
  );

  // Read once per signed-in session. Signing out clears both keys and puts
  // this back where it started, so the next account reads nothing rather than
  // the last one's answers.
  useEffect(() => {
    let cancelled = false;
    if (!token) {
      setLoaded(false);
      setArrival(null);
      setDoneAt(null);
      setUsername(undefined);
      void storage.remove(ARRIVAL_KEY);
      void storage.remove(DONE_AT_KEY);
      return;
    }
    void (async () => {
      const [storedArrival, storedDoneAt] = await Promise.all([
        storage.get(ARRIVAL_KEY),
        storage.get(DONE_AT_KEY),
      ]);
      if (cancelled) return;
      setArrival(
        storedArrival === 'invited' || storedArrival === 'alone'
          ? storedArrival
          : null
      );
      const stamp = Number(storedDoneAt);
      setDoneAt(Number.isFinite(stamp) && stamp > 0 ? stamp : null);
      setLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  /**
   * The latch, and the only moment it can be set: the first snapshot this
   * account's install ever saw.
   *
   * Written before anything is drawn from it, so the arrival is decided by
   * what was true on arrival rather than by what is true when somebody first
   * scrolls. See `Arrival` for what asking this question twice would do.
   */
  useEffect(() => {
    if (!loaded || !home || arrival) return;
    const next = arrivalOf(home);
    setArrival(next);
    void storage.set(ARRIVAL_KEY, next);
  }, [loaded, home, arrival]);

  /**
   * The retirement, written once and never unwritten. It records that a
   * conversation happened, not that one is happening — which is what makes it
   * survive the conversation ending, and a reinstall.
   */
  useEffect(() => {
    if (!conversing || doneAt !== null) return;
    const now = Date.now();
    setDoneAt(now);
    void storage.set(DONE_AT_KEY, String(now));
  }, [conversing, doneAt]);

  /**
   * The one request this feature makes, and only for the cohort that needs it:
   * an alone arrival that has not finished. An invited one never asks, because
   * its card has no username in it.
   *
   * **Failure is silence**, exactly as `loadSupport` in `HomeView` is: an
   * unanswerable request leaves this `undefined`, the ladder stays hidden, and
   * nobody is told about a fetch they did not ask for. The alternative —
   * treating a failure as *no username* — would put a row in front of somebody
   * telling them to choose the name they already have.
   */
  useEffect(() => {
    if (!token || !loaded || arrival !== 'alone' || doneAt !== null) return;
    if (username !== undefined) return;
    let cancelled = false;
    void loadUsername()
      .then((value) => {
        if (!cancelled) setUsername(value);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [token, loaded, arrival, doneAt, username, loadUsername]);

  return introduction({
    loaded,
    home,
    arrival,
    doneAt,
    displayName,
    username,
    conversing,
  });
}
