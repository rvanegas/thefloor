import { useCallback, useEffect, useState } from 'react';
import type { HomeView } from '../../../core/protocol';
import { recordEvent } from '../audio/diagnostics';
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
 * What this hook hands back: what to draw, and the one way of undoing it.
 *
 * A pair rather than the bare `Introduction` it used to be, because the
 * checklist has no other exit than being finished — see `forget`.
 */
export interface IntroductionState {
  introduction: Introduction;
  /**
   * Puts this account back where it started, for a debug account only.
   *
   * **There is nothing else that does this.** The two keys are cleared on
   * sign-out, but signing in again re-latches the arrival from the same
   * snapshot and `doneAt` is written off `conversing`, which by then is a
   * fact about an account that has conversed — so signing out and back in
   * returns somebody to exactly the silence they were in. *Forget this phone*
   * clears both as part of `INSTALL_KEYS`, but it takes the session with it
   * and is aimed at the whole install; this is the checklist alone, on an
   * account that stays signed in.
   *
   * The state is reset alongside the keys rather than left to a relaunch,
   * which is what makes the ladder reappear on the tap: clearing `arrival`
   * re-arms the latch, and the next snapshot — the one already in hand —
   * decides the arrival again. Somebody with contacts is therefore returned
   * to the *invited* card and not to the ladder, which is honest: that is
   * what this account looks like to a first snapshot now.
   *
   * **Leave the channel first.** `doneAt` is written off `conversing`, so
   * doing this while in a channel with somebody re-retires it within a frame.
   * The caller says so; see `HomeSettingsView`.
   */
  forget: () => Promise<void>;
}

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
}): IntroductionState {
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
      // TEMPORARY — see `introTrace` in `AppProvider`. This is the one path
      // that un-writes the flag, and it should appear only on a sign-out.
      recordEvent('intro cleared (no token)');
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
      // TEMPORARY — see `introTrace` in `AppProvider`. What the keychain had
      // when this account signed in, which is the other half of the question.
      recordEvent(
        `intro loaded arrival=${storedArrival ?? 'none'} doneAt=${
          storedDoneAt ?? 'none'
        }`
      );
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
    // TEMPORARY — see `introTrace` in `AppProvider`. The write itself, so that
    // a retirement that happens and does not stick is told apart from one that
    // never happens.
    recordEvent(`intro retiring at=${now}`);
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

  const forget = useCallback(async () => {
    setArrival(null);
    setDoneAt(null);
    setUsername(undefined);
    await Promise.all([
      storage.remove(ARRIVAL_KEY),
      storage.remove(DONE_AT_KEY),
    ]);
  }, []);

  return {
    introduction: introduction({
      loaded,
      home,
      arrival,
      doneAt,
      displayName,
      username,
      conversing,
    }),
    forget,
  };
}
