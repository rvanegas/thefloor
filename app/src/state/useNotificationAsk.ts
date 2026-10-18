import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState as NativeAppState } from 'react-native';
import { askForPush, mayHoldToken, permissionState } from '../push';
import { isNewInstall, storage } from './storage';
import { askDue, type Ask, type Permission } from './notificationAsk';

/**
 * When the banner was last raised on this install.
 *
 * About the device rather than the account, and not cleared on sign-out: the
 * dialog iOS grants is per install, and so is having been reminded about the
 * refusal. Forgotten on a reinstall, which is a phone iOS will ask afresh.
 *
 * Three more keys lived beside it until 2026-10-17 — launches, conversed and
 * pitched — and fed the wait that the immediate ask replaced. They are removed
 * on every launch, which costs three deletes of nothing once they are gone.
 */
const NUDGED_AT_KEY = 'thefloor.notifications.nudgedAt';
const DEAD_LAUNCHES_KEY = 'thefloor.notifications.launches';
const DEAD_CONVERSED_KEY = 'thefloor.notifications.conversed';
const DEAD_PITCHED_KEY = 'thefloor.notifications.pitched';
const DEAD_KEYS = [DEAD_LAUNCHES_KEY, DEAD_CONVERSED_KEY, DEAD_PITCHED_KEY];

/** What the app knows and can do about being reachable. */
export interface NotificationAsk {
  /**
   * What is due right now — the dialog, the banner, or nothing. `'prompt'` is
   * acted on by this hook itself; `HomeView` reads `'nudge'`.
   */
  ask: Ask;
  permission: Permission;
  /**
   * Whether the system dialog can still be shown at all. False for everybody
   * who has already answered, and then the only way back is the Settings app.
   */
  canPrompt: boolean;
  /** That the banner is on screen. Records the day. */
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
 * Asks for notifications as soon as somebody is signed in, and remembers the
 * banner's cadence after a refusal.
 *
 * Held in `AppProvider` so the banner and Floor Settings read one answer.
 *
 * **The permission is re-read on every foreground**, which is the same signal
 * `registerIfGranted` runs on and for the same reason: iOS does not terminate
 * the app when notifications are switched on in Settings, so returning from
 * Settings is the only moment there is to notice.
 */
export function useNotificationAsk(state: {
  /** Null when signed out, and then nothing here is asked at all. */
  token: string | null;
  /**
   * Whether the account's settings have arrived, which is what makes
   * `pushOff` an answer rather than a default. The dialog waits for it, so
   * somebody who switched push off on another phone is not asked on this one.
   */
  settled: boolean;
  /** `pushNotificationsOff` from the account settings. */
  pushOff: boolean;
  /** Told when a device token is registered, so the caller can hold it. */
  onRegistered: (deviceToken: string) => void;
  /**
   * Told when the dialog this hook raised was refused — the moment the app
   * turns on notifications by email. Not told about a refusal that happened
   * before this install could see it, which is a phone whose owner chose.
   */
  onDeclined: () => void;
}): NotificationAsk {
  const { token, settled, pushOff, onRegistered, onDeclined } = state;

  /**
   * Starts at the quiet answer, so the frames before the first read show
   * nobody anything — being wrong for a moment in the direction of silence
   * costs a second, and the other direction raises a dialog.
   */
  const [permission, setPermission] = useState<Permission>('granted');
  const [permissionRead, setPermissionRead] = useState(false);
  const [nudgedAt, setNudgedAt] = useState<number | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      // Before the read: the key outlives the app that wrote it, and the
      // permission does not. See `isNewInstall`.
      if (await isNewInstall()) await storage.remove(NUDGED_AT_KEY);
      await Promise.all(DEAD_KEYS.map((key) => storage.remove(key)));
      const stored = await storage.get(NUDGED_AT_KEY);
      if (cancelled) return;
      setNudgedAt(countOf(stored) || null);
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
      void permissionState().then((next) => {
        setPermission(next);
        setPermissionRead(true);
      });
    };
    read();
    const subscription = NativeAppState.addEventListener('change', (next) => {
      if (next === 'active') read();
    });
    return () => subscription.remove();
  }, []);

  const noteShown = useCallback(() => {
    const now = Date.now();
    setNudgedAt(now);
    void storage.set(NUDGED_AT_KEY, String(now));
  }, []);

  /** Guards against two callers putting up two dialogs. */
  const asking = useRef(false);
  const allow = useCallback(async () => {
    if (!token || asking.current) return false;
    asking.current = true;
    try {
      const before = await permissionState();
      const deviceToken = await askForPush(token);
      const after = await permissionState();
      setPermission(after);
      if (before === 'undetermined' && after === 'denied') onDeclined();
      if (!deviceToken) return false;
      onRegistered(deviceToken);
      return true;
    } finally {
      asking.current = false;
    }
  }, [token, onRegistered, onDeclined]);

  const ask: Ask = useMemo(() => {
    if (!token || !loaded || !permissionRead || !settled) return 'none';
    // **A browser and a simulator are asked nothing, ever.** Both read as
    // `denied` — there being no token to be had — and Floor Settings says what
    // that means instead.
    if (!mayHoldToken()) return 'none';
    return askDue(Date.now(), { permission, pushOff, nudgedAt });
  }, [token, loaded, permissionRead, settled, permission, pushOff, nudgedAt]);

  /**
   * **The dialog, straight after authentication**, since 2026-10-17. Once per
   * signed-in session at most: `asking` guards the overlap, and once answered
   * the permission is no longer `undetermined`, so `ask` stops being
   * `'prompt'` on its own.
   */
  const prompted = useRef<string | null>(null);
  useEffect(() => {
    if (ask !== 'prompt' || !token || prompted.current === token) return;
    prompted.current = token;
    void allow();
  }, [ask, token, allow]);

  return {
    ask,
    permission,
    canPrompt: permission === 'undetermined',
    noteShown,
    allow,
  };
}
