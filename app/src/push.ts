import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { api } from './api/http';

/**
 * Being reachable when the app is not running.
 *
 * The token asked for here is the **raw APNs device token**, not an Expo push
 * token: the server talks to Apple directly and signs its own provider JWTs,
 * so there is no Expo project id in the loop and nothing to configure in EAS.
 * `getExpoPushTokenAsync` is the other path and is deliberately not used.
 */

/**
 * A push arriving while the app is open is a duplicate — the websocket has
 * already put the same invite on screen as a banner, and the same channel in
 * the Home list. The server suppresses these for anyone holding a live socket;
 * this covers the moment when the two disagree, which is a reconnect.
 */
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: false,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

/**
 * Tells the server where this install can be reached.
 *
 * Called on sign-in and on every launch with a stored token, because a device
 * token is not permanent — iOS reissues it after a restore or a reinstall, and
 * registering only once would leave the server holding an address that no
 * longer resolves.
 *
 * Resolves to the token registered, or null when this device cannot receive
 * one. Never throws: nothing about signing in should fail because notifications
 * are unavailable.
 */
export async function registerForPush(
  authToken: string
): Promise<string | null> {
  // The simulator mints no token, and the browser has no APNs at all.
  if (Platform.OS === 'web' || !Device.isDevice) return null;

  try {
    const existing = await Notifications.getPermissionsAsync();
    // Asked only when the answer is not yet known. iOS shows the prompt once
    // and remembers a refusal; asking again does nothing except return the
    // refusal, and treating that as an error would be wrong — declining
    // notifications is a choice, not a failure.
    const granted = existing.granted
      ? true
      : existing.canAskAgain
        ? (await Notifications.requestPermissionsAsync()).granted
        : false;
    if (!granted) return null;

    const { data } = await Notifications.getDevicePushTokenAsync();
    const deviceToken = String(data);
    await api.registerDevice(authToken, deviceToken, Platform.OS as 'ios');
    return deviceToken;
  } catch {
    return null;
  }
}

/** The channel a notification points at, or null if it carries none. */
export function channelOf(
  response: Notifications.NotificationResponse | null
): string | null {
  const data = response?.notification.request.content.data as
    | { channelId?: unknown }
    | undefined;
  return typeof data?.channelId === 'string' ? data.channelId : null;
}

/**
 * Where a tap should take you, from either direction it can arrive.
 *
 * Two sources, and the second is the one that matters most here. The listener
 * catches a tap while the app is running; `getLastNotificationResponseAsync`
 * catches the tap that *launched* it, which no listener can have been present
 * for. Without that second call the feature works when backgrounded and
 * silently does nothing when closed — which is the case it exists for.
 */
export function onNotificationTap(
  handle: (channelId: string) => void
): () => void {
  let cancelled = false;

  // Caught rather than left to reject: this reads a payload the app did not
  // write, at the one moment where an unhandled rejection is a launch failure
  // rather than a missed notification.
  void Notifications.getLastNotificationResponseAsync()
    .then((response) => {
      if (cancelled) return;
      const channelId = channelOf(response);
      if (channelId) handle(channelId);
    })
    .catch(() => {});

  const subscription = Notifications.addNotificationResponseReceivedListener(
    (response) => {
      const channelId = channelOf(response);
      if (channelId) handle(channelId);
    }
  );

  return () => {
    cancelled = true;
    subscription.remove();
  };
}
