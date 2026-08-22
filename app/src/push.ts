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
 * What one delivered notification says about itself.
 *
 * Everything here is written by the server and read defensively: a phone can
 * be holding a notification sent by a build of the server older than the field
 * being read, and the only safe reading of a missing field is the behaviour
 * that existed before it.
 */
function dataOf(notification: Notifications.Notification): {
  kind?: unknown;
  channelId?: unknown;
} {
  return (notification.request.content.data ?? {}) as {
    kind?: unknown;
    channelId?: unknown;
  };
}

/**
 * Clears the announcements that have stopped being able to be true.
 *
 * **iOS never expires a notification it has already delivered.**
 * `apns-expiration` bounds how long APNs retries an *undelivered* one; once it
 * lands it sits in Notification Center until something removes it, and the
 * only something is this app. So the five-minute presence lifetime tidies
 * nothing up, and a phone left alone all evening accumulates announcements
 * about rooms that emptied hours ago.
 *
 * Called on foreground, and the reason that is the right moment is not that it
 * is convenient: an arrival is stale *the instant the app opens*, because the
 * app shows who is present. The notification and the screen would be saying
 * different things, and the screen is right. So this removes them when they
 * stop being able to be true rather than when they get old — which is nearer
 * what a timer was wanted for than a timer would have been.
 *
 * **Arrivals only.** An invitation stays true until it is acted on, and a ping
 * carries words somebody chose; sweeping either on a clock would be deleting
 * something nobody had read. They are cleared by opening the channel they name
 * instead, which is the reader acting rather than the app deciding.
 *
 * Never throws. Tidying up is a courtesy and must not become an error in front
 * of somebody who has just opened the app.
 */
export async function sweepArrivals(): Promise<void> {
  try {
    const delivered = await Notifications.getPresentedNotificationsAsync();
    await Promise.all(
      delivered
        .filter((notification) => dataOf(notification).kind === 'arrived')
        .map((notification) =>
          Notifications.dismissNotificationAsync(
            notification.request.identifier
          )
        )
    );
  } catch {
    // A platform with no notification centre to read, or a permission that has
    // since been withdrawn. Neither is worth a word to anybody.
  }
}

/**
 * Clears what one channel had outstanding, because its reader has arrived.
 *
 * Called when a channel screen opens. A ping about this channel has been
 * answered by the only thing that can answer one — the person walking in — and
 * an arrival is stale for the sharper version of the reason in `sweepArrivals`:
 * the roster is on screen.
 *
 * **Invitations survive this deliberately**, though opening the channel is
 * arguably acting on one too. They are the only record that somebody added you
 * to something, they stay true for a month, and clearing them is a decision
 * about what somebody has read rather than about what is still the case. The
 * cheaper mistake is leaving one line too many.
 */
export async function sweepChannel(channelId: string): Promise<void> {
  try {
    const delivered = await Notifications.getPresentedNotificationsAsync();
    await Promise.all(
      delivered
        .filter((notification) => {
          const data = dataOf(notification);
          return (
            data.channelId === channelId &&
            (data.kind === 'pinged' || data.kind === 'arrived')
          );
        })
        .map((notification) =>
          Notifications.dismissNotificationAsync(
            notification.request.identifier
          )
        )
    );
  } catch {
    // As above.
  }
}

/**
 * Whether a notification is one that means to interrupt somebody already here.
 *
 * The server sets it, on the message rather than on the recipient: everything
 * a channel says about itself is false, and a ping is true. Read defensively —
 * an older server sends no such field, and the absent case has to mean the
 * behaviour that was there before it existed.
 */
function reachesInApp(notification: Notifications.Notification): boolean {
  const data = notification.request.content.data as
    | { reachesInApp?: unknown }
    | undefined;
  return data?.reachesInApp === true;
}

/**
 * Whether this was meant to announce itself at all.
 *
 * `passive` is what somebody gets who has turned a channel down, and it is the
 * server's word rather than this app's judgement — the level lives on the
 * server, so the phone is told the conclusion instead of being told the
 * setting and asked to reach it again.
 */
function isPassive(notification: Notifications.Notification): boolean {
  const data = notification.request.content.data as
    | { alert?: unknown }
    | undefined;
  return data?.alert === 'passive';
}

/**
 * A push arriving while the app is open is *usually* a duplicate — the
 * websocket has already put the same invite on screen as a banner, and the
 * same channel in the Home list. The server suppresses those for anyone
 * holding a live socket, and this covers the moment when the two disagree,
 * which is a reconnect.
 *
 * **A ping is the exception, and it is the reason this stopped being a
 * constant.** Nothing in the app draws one, so there is no copy on screen for
 * a banner to duplicate — and the socket is not what a ping is answering
 * anyway. Somebody typed a sentence and aimed it at a person who had stepped
 * out of a channel; the app being open says only that they are looking at the
 * phone, which is the case where a banner works best.
 *
 * Still no sound. A banner over an app somebody is holding is seen, and the
 * sound is what the same notification uses to reach a phone face-down on a
 * table — the case the server already handles by sending this at all.
 *
 * **And not even a banner when the ping arrived passively**, which is what
 * somebody who turned this channel down asked for. Putting a banner over the
 * app they are looking at would be precisely the interruption they declined,
 * and it would be this app overriding a setting the server had already
 * honoured on the way out.
 */
Notifications.setNotificationHandler({
  handleNotification: async (notification) => ({
    shouldShowBanner: reachesInApp(notification) && !isPassive(notification),
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
