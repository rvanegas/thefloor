import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

/**
 * What this *install* remembers, as opposed to what the account does.
 *
 * The keychain on a phone and `localStorage` in a browser — SecureStore has no
 * web implementation, and the browser is only used for checks. Everything in
 * here is small, is about this device rather than about whoever is signed in,
 * and survives the app being closed: the auth token, the cached appearance so
 * a launch does not flash the wrong palette, and since 2026-09-08 what this
 * install has been told about notifications.
 *
 * **Extracted from `AppProvider` on 2026-09-08**, where it was private, when a
 * second module needed exactly it. The alternative was a second copy of the
 * same platform switch, which is how two stores come to disagree about which
 * one holds a key.
 */

/**
 * Every key this application writes to the device, so that one of them can
 * remove all of them.
 *
 * **It exists because deleting the app does not delete these.** SecureStore is
 * the iOS keychain, and keychain items outlive the app that wrote them — so a
 * reinstall comes back to a phone that is still signed in, still knows which
 * palette was chosen, and still remembers having been asked about
 * notifications. That is right for a person who dropped their phone in a
 * canal, and it is exactly wrong for anybody trying to see what a new install
 * does. Short of erasing the phone there is no way to clear them from outside
 * the app, which is why `forgetInstall` is in it.
 *
 * **A literal here rather than the constants they are declared as**, which is
 * the one uncomfortable thing about this list: the keys live next to the code
 * that uses them, and importing them all back would put this module above
 * half the app in the graph and make a cycle out of `AppProvider`. The drift
 * that invites is caught by `__tests__/storageKeys.test.ts`, which reads the
 * source for `'thefloor.…'` literals and fails on any that are missing here.
 *
 * Three of these are a browser's and never exist on a phone; removing a key
 * that was never written costs nothing on either platform.
 */
export const INSTALL_KEYS: readonly string[] = [
  'thefloor.token',
  'thefloor.appearance',
  'thefloor.tapToLook',
  'thefloor.tapToStepIn',
  'thefloor.hideControlCards',
  'thefloor.controlCards',
  'thefloor.labs',
  'thefloor.notifications.launches',
  'thefloor.notifications.conversed',
  'thefloor.notifications.pitched',
  'thefloor.notifications.nudgedAt',
  'thefloor.install.dismissed',
  'thefloor.handover',
  'thefloor.seat.channel',
  'thefloor.invite',
  'thefloor.train',
];

export const storage = {
  async get(key: string): Promise<string | null> {
    if (Platform.OS === 'web') {
      try {
        return globalThis.localStorage?.getItem(key) ?? null;
      } catch {
        return null;
      }
    }
    return SecureStore.getItemAsync(key);
  },
  async set(key: string, value: string): Promise<void> {
    if (Platform.OS === 'web') {
      globalThis.localStorage?.setItem(key, value);
      return;
    }
    await SecureStore.setItemAsync(key, value);
  },
  async remove(key: string): Promise<void> {
    if (Platform.OS === 'web') {
      globalThis.localStorage?.removeItem(key);
      return;
    }
    await SecureStore.deleteItemAsync(key);
  },
};

/**
 * Removes every one of them, so that the next launch is a first launch.
 *
 * **Not part of signing out**, which is a different act with a different
 * scope: signing out ends a session and deliberately leaves this device's own
 * memory alone — see the notification keys, which survive it on purpose so
 * that a second account on one phone is not asked as though the phone had
 * never been asked. This is for somebody who wants the phone itself to forget.
 *
 * It cannot reach the one thing that matters most on iOS: **the notification
 * permission belongs to the system, not to this app**, and only deleting the
 * app clears it. So a true fresh install is this, then a delete, then an
 * install — in that order, since the app has to be running to do this.
 */
export async function forgetInstall(): Promise<void> {
  await Promise.all(INSTALL_KEYS.map((key) => storage.remove(key)));
}
