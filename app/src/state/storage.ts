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
