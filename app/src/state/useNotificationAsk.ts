import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState as NativeAppState } from 'react-native';
import { askForPush, mayHoldToken, permissionState } from '../push';
import { isNewInstall, storage } from './storage';
import {
  askDue,
  worthAsking,
  type Ask,
  type Permission,
} from './notificationAsk';

/**
 * Everything this install remembers about having been asked, and everything it
 * does about it.
 *
 * **Four keys, all about the device rather than the account, and none of them
 * cleared on sign-out.** The dialog iOS grants is per install and is spent
 * once for ever; a second account signing in on the same phone has not earned
 * a fresh one, and clearing these would only mean asking somebody who has
 * already refused as though they had not. It is the same reasoning
 * `installNotice.ts` gives for surviving sign-out, made about a stronger fact.
 */
const LAUNCHES_KEY = 'thefloor.notifications.launches';
const CONVERSED_KEY = 'thefloor.notifications.conversed';
const PITCHED_KEY = 'thefloor.notifications.pitched';
const NUDGED_AT_KEY = 'thefloor.notifications.nudgedAt';

/**
 * What a new install has no business remembering — three of the four.
 *
 * `launches` counts cold starts of *this* install and is meaningless carried
 * over; `pitched` and `nudgedAt` record what a previous install put on screen,
 * and between them they are the whole of what suppresses the asking.
 *
 * **`conversed` is deliberately kept**, and the split is the point rather than
 * an oversight. The other three describe an install; that one describes the
 * person — you have been in a channel with somebody else, so you know what it
 * is you would be missing — and deleting an app does not undo having had a
 * conversation. It is also the signal `worthAsking` actually wants, so keeping
 * it is what puts the explanation in front of a returning user on their first
 * launch back rather than their second.
 */
const REINSTALL_FORGETS = [LAUNCHES_KEY, PITCHED_KEY, NUDGED_AT_KEY] as const;

/** What the app knows and can do about being reachable. */
export interface NotificationAsk {
  /**
   * What is due right now — the explanation unbidden, the banner, or nothing.
   *
   * Read by `App.tsx` for the first and `HomeView` for the second. It is a
   * single value rather than two booleans on the same reasoning `Detail` is:
   * these are alternatives, and two flags would let both be true.
   */
  ask: Ask;
  permission: Permission;
  /**
   * Whether the system dialog can still be shown at all.
   *
   * **False for everybody who has already refused, and it changes what the
   * explanation's button says.** There is no second dialog on iOS, so after a
   * refusal the only way back is the Settings app — which is a different
   * promise to make to somebody, and a screen that offered "Allow" and then
   * did nothing visible would be the app lying about what it can do.
   */
  canPrompt: boolean;
  /**
   * That the explanation is now on screen, however it got there. Records the
   * day, so the banner does not come back tomorrow having just been read.
   */
  noteShown: () => void;
  /** Spends the dialog. Resolves true when a token reached the server. */
  allow: () => Promise<boolean>;
}

/** Reads a stored count, treating anything unreadable as none. */
function countOf(stored: string | null): number {
  const value = Number(stored);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

/**
 * When to ask this install for notifications, and the state that decides it.
 *
 * Held in `AppProvider` so that the two screens that read it — the tier's
 * banner and the root's decision to show the explanation — are reading one
 * answer rather than each computing their own from the keychain.
 *
 * **The permission is re-read on every foreground**, which is the same signal
 * `registerIfGranted` runs on and for the same reason: iOS does not terminate
 * the app when notifications are switched on in Settings, so returning from
 * Settings is the only moment there is to notice. Without that the banner
 * would go on offering to turn on something already on.
 */
export function useNotificationAsk(state: {
  /** Null when signed out, and then nothing here is asked at all. */
  token: string | null;
  /** Anybody at all who could reach you — see `worthAsking`. */
  somebody: boolean;
  /** You are, or have just been, in a channel alongside somebody else. */
  conversing: boolean;
  /** Told when a device token is registered, so the caller can hold it. */
  onRegistered: (deviceToken: string) => void;
}): NotificationAsk {
  const { token, somebody, conversing, onRegistered } = state;

  const [permission, setPermission] = useState<Permission>('granted');
  const [launches, setLaunches] = useState(0);
  const [conversed, setConversed] = useState(false);
  const [pitched, setPitched] = useState(false);
  const [nudgedAt, setNudgedAt] = useState<number | null>(null);
  /**
   * Whether the keychain has been read yet. Nothing may be shown before it
   * has: the defaults above are the quiet ones — permission granted, nothing
   * conversed, no launches — precisely so that the frames between a cold start
   * and the first read show nobody anything. Being wrong for a moment in the
   * direction of silence costs a second; the other direction is a banner that
   * flashes at somebody who turned notifications on months ago.
   */
  const [loaded, setLoaded] = useState(false);

  // Once per launch, which is what makes `launches` mean launches. The bump is
  // written before it is read back, so the launch that installs the app counts
  // itself as one and the next one is the second.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      // **Before the read, and that ordering is the whole of it.** These four
      // keys outlive the app that wrote them, and the notification permission
      // does not — so a reinstall would otherwise read a previous install's
      // memory of having been asked and decline to ask, on a phone iOS has
      // never shown the dialog to. `isNewInstall` is the only witness to the
      // difference; see it for why nothing else can be.
      if (await isNewInstall()) {
        await Promise.all(
          REINSTALL_FORGETS.map((key) => storage.remove(key))
        );
      }
      const [storedLaunches, storedConversed, storedPitched, storedNudged] =
        await Promise.all([
          storage.get(LAUNCHES_KEY),
          storage.get(CONVERSED_KEY),
          storage.get(PITCHED_KEY),
          storage.get(NUDGED_AT_KEY),
        ]);
      const next = countOf(storedLaunches) + 1;
      await storage.set(LAUNCHES_KEY, String(next));
      if (cancelled) return;
      setLaunches(next);
      setConversed(storedConversed === 'true');
      setPitched(storedPitched === 'true');
      setNudgedAt(countOf(storedNudged) || null);
      setLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // On mount and on every foreground, for permission granted in Settings while
  // this process was suspended. Local and cheap; see `registerIfGranted`.
  useEffect(() => {
    const read = () => {
      void permissionState().then(setPermission);
    };
    read();
    const subscription = NativeAppState.addEventListener('change', (next) => {
      if (next === 'active') read();
    });
    return () => subscription.remove();
  }, []);

  /**
   * The first time somebody has been in a channel with another person, which
   * is the signal `worthAsking` really wants — see it for why it is not the
   * only one. Written once and never unwritten: it records that it happened,
   * not that it is happening.
   */
  useEffect(() => {
    if (!conversing || conversed) return;
    setConversed(true);
    void storage.set(CONVERSED_KEY, 'true');
  }, [conversing, conversed]);

  /**
   * Marks today as spent, and the explanation as seen.
   *
   * Called when the explanation is put on screen and when the banner is, which
   * is the cadence `askDue` describes: being shown the thing is the
   * imposition, so it is what the day is counted from.
   */
  const noteShown = useCallback(() => {
    const now = Date.now();
    setNudgedAt(now);
    void storage.set(NUDGED_AT_KEY, String(now));
    setPitched(true);
    void storage.set(PITCHED_KEY, 'true');
  }, []);

  /** Guards against two taps of the same button putting up two dialogs. */
  const asking = useRef(false);
  const allow = useCallback(async () => {
    if (!token || asking.current) return false;
    asking.current = true;
    try {
      const deviceToken = await askForPush(token);
      setPermission(await permissionState());
      if (!deviceToken) return false;
      onRegistered(deviceToken);
      return true;
    } finally {
      asking.current = false;
    }
  }, [token, onRegistered]);

  const ask: Ask = useMemo(() => {
    if (!token || !loaded) return 'none';
    // **A browser and a simulator are asked nothing, ever.** Both read as
    // `denied` — correctly, there being no token to be had — and without this
    // they would fall into the daily cadence and be told once a day about a
    // permission neither can grant. The browser is not left in the dark: the
    // install notice on the tier says the same thing in the one form that has
    // an answer, which is to put the app on a phone.
    if (!mayHoldToken()) return 'none';
    return askDue(Date.now(), {
      permission,
      ready: worthAsking({ somebody, conversed, launches }),
      pitched,
      nudgedAt,
    });
    // `Date.now()` is read at render rather than watched, so a banner whose day
    // came round while the app sat open appears at the next render — a
    // foreground, a snapshot, a tap — rather than on a timer. Nothing here is
    // urgent enough to hold a timer open for, and every path that could show
    // it re-renders on the way.
  }, [token, loaded, permission, somebody, conversed, launches, pitched, nudgedAt]);

  return {
    ask,
    permission,
    canPrompt: permission === 'undetermined',
    noteShown,
    allow,
  };
}
