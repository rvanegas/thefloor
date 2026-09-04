import * as Notifications from 'expo-notifications';

import { api } from '../api/http';
import {
  onNotificationTap,
  registerIfGranted,
  sweepArrivals,
  sweepChannel,
} from '../push';

jest.mock('../api/http', () => ({
  api: { registerDevice: jest.fn(async () => ({})) },
}));

/**
 * Whether this is a phone, which the suite has to move between tests: the
 * global mock is a simulator, and a simulator holds no push token at all.
 *
 * Read through a getter rather than assigned on the namespace, because Babel's
 * interop copies plain values into a fresh module object — writing to what
 * `import * as Device` yields would change a copy that the code under test
 * never reads. A getter survives the copy, since the interop preserves
 * descriptors that have one.
 */
const mockDevice = { isDevice: true };
jest.mock('expo-device', () => ({
  get isDevice() {
    return mockDevice.isDevice;
  },
}));

/**
 * What the app does with a notification that arrives while somebody is looking
 * at it. The server has already made the same decision — it declines to send
 * most of these at all — so this is the second half of one rule, and the two
 * halves read the same field.
 */

type Handler = (
  notification: Notifications.Notification
) => Promise<{ shouldShowBanner: boolean }>;

/**
 * The handler registered at import time. Importing `../push` for its side
 * effect is the only way to get at it, which is also the honest test: this is
 * a module that configures something once and is never called again.
 */
const handler = (Notifications.setNotificationHandler as jest.Mock).mock
  .calls[0][0].handleNotification as Handler;

const notification = (data: unknown) =>
  ({ request: { content: { data } } }) as Notifications.Notification;

describe('a notification arriving while the app is open', () => {
  it('interrupts for a ping, which nothing on screen has already said', async () => {
    const decision = await handler(
      notification({ channelId: 'chan_1', reachesInApp: true })
    );
    expect(decision.shouldShowBanner).toBe(true);
  });

  /**
   * The socket has already drawn the arrival, the invitation and the channel
   * itself. A banner would be a second copy of what somebody is looking at.
   */
  it('stays quiet for everything the channel says about itself', async () => {
    const decision = await handler(
      notification({ channelId: 'chan_1', reachesInApp: false })
    );
    expect(decision.shouldShowBanner).toBe(false);
  });

  /**
   * Somebody who turned this channel down. The server has already declined to
   * make a sound; showing a banner over the app they are holding would be the
   * same interruption arriving by another door.
   */
  it('stays quiet for a ping somebody asked to arrive passively', async () => {
    const decision = await handler(
      notification({ channelId: 'chan_1', reachesInApp: true, alert: 'passive' })
    );
    expect(decision.shouldShowBanner).toBe(false);
  });

  /**
   * A build can outlive the server it was written against, and a server that
   * sends no such field is one whose every notification was a duplicate.
   * Absent has to mean quiet, or an old pairing shows banners for arrivals.
   */
  it('stays quiet when the field is missing altogether', async () => {
    const bare = await handler(notification({ channelId: 'chan_1' }));
    expect(bare.shouldShowBanner).toBe(false);
    const empty = await handler(notification(undefined));
    expect(empty.shouldShowBanner).toBe(false);
  });
});

/**
 * The tidying up that stands in for an expiry iOS does not have. A delivered
 * notification lives until something removes it, and the only something is
 * this app — so what these cover is *which* ones it is entitled to remove.
 */
describe('clearing notifications that have stopped being true', () => {
  const presented = (
    entries: Array<{ id: string; kind?: string; channelId?: string }>
  ) => {
    (
      Notifications.getPresentedNotificationsAsync as jest.Mock
    ).mockResolvedValueOnce(
      entries.map(({ id, kind, channelId }) => ({
        request: { identifier: id, content: { data: { kind, channelId } } },
      }))
    );
  };

  const dismissed = () =>
    (Notifications.dismissNotificationAsync as jest.Mock).mock.calls.map(
      (call) => call[0]
    );

  beforeEach(() => {
    (Notifications.dismissNotificationAsync as jest.Mock).mockClear();
  });

  it('sweeps arrivals and nothing else', async () => {
    presented([
      { id: 'a', kind: 'arrived', channelId: 'chan_1' },
      { id: 'b', kind: 'pinged', channelId: 'chan_1' },
      { id: 'c', kind: 'invited', channelId: 'chan_2' },
      { id: 'd', kind: 'started', channelId: 'chan_3' },
    ]);

    await sweepArrivals();

    // An invitation stays true until acted on and a ping carries words
    // somebody chose. Only the announcement about a room is stale on sight.
    expect(dismissed()).toEqual(['a']);
  });

  it('clears the ping and the arrival for the channel being opened', async () => {
    presented([
      { id: 'a', kind: 'pinged', channelId: 'chan_1' },
      { id: 'b', kind: 'arrived', channelId: 'chan_1' },
      { id: 'c', kind: 'pinged', channelId: 'chan_2' },
      { id: 'd', kind: 'invited', channelId: 'chan_1' },
    ]);

    await sweepChannel('chan_1');

    // Another channel's ping is untouched — walking into this room answers
    // nothing about that one. The invitation survives on purpose.
    expect(dismissed().sort()).toEqual(['a', 'b']);
  });

  /**
   * A phone can hold a notification sent by a server older than the field
   * being read. Removing one whose kind is unknown would be deleting something
   * on no evidence.
   */
  it('leaves a notification it cannot identify alone', async () => {
    presented([{ id: 'a', channelId: 'chan_1' }, { id: 'b' }]);

    await sweepArrivals();

    expect(dismissed()).toEqual([]);
  });

  it('says nothing when the notification centre cannot be read', async () => {
    (
      Notifications.getPresentedNotificationsAsync as jest.Mock
    ).mockRejectedValueOnce(new Error('no permission'));

    await expect(sweepArrivals()).resolves.toBeUndefined();
    expect(dismissed()).toEqual([]);
  });
});


/**
 * Permission that arrives after the app has already decided it has none.
 *
 * The case is somebody who refused the prompt, went to iOS Settings and turned
 * notifications on. iOS does not restart the app for that, so the only thing
 * that can notice is a foreground check — and the one thing it must not do is
 * ask again, which iOS would refuse anyway and which would put a dialog in
 * front of somebody who has just switched back.
 */
describe('registering for push without asking', () => {
  const permissions = Notifications.getPermissionsAsync as jest.Mock;
  const request = Notifications.requestPermissionsAsync as jest.Mock;
  const deviceToken = Notifications.getDevicePushTokenAsync as jest.Mock;
  const registerDevice = api.registerDevice as jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    // The suite is a simulator by default, which mints no token at all.
    mockDevice.isDevice = true;
    deviceToken.mockResolvedValue({ type: 'ios', data: 'apns-token' });
  });

  it('registers the address once permission has been granted', async () => {
    permissions.mockResolvedValue({ granted: true, canAskAgain: false });

    await expect(registerIfGranted('auth')).resolves.toBe('apns-token');
    expect(registerDevice).toHaveBeenCalledWith('auth', 'apns-token', 'ios');
  });

  /**
   * The whole point of the function. A refusal is permanent on iOS and asking
   * again returns it unchanged, so a prompt here would be pure interruption.
   */
  it('never asks, and so cannot interrupt a foreground', async () => {
    permissions.mockResolvedValue({ granted: false, canAskAgain: true });

    await expect(registerIfGranted('auth')).resolves.toBeNull();
    expect(request).not.toHaveBeenCalled();
    expect(registerDevice).not.toHaveBeenCalled();
  });

  /**
   * `canAskAgain` is recomputed from the current status rather than
   * remembering that anybody asked, so it says nothing about whether a token
   * can be had. Only `granted` does.
   */
  it('reads granted rather than canAskAgain', async () => {
    permissions.mockResolvedValue({ granted: true, canAskAgain: true });

    await expect(registerIfGranted('auth')).resolves.toBe('apns-token');
  });

  it('mints nothing on a simulator, which holds no token', async () => {
    mockDevice.isDevice = false;
    permissions.mockResolvedValue({ granted: true, canAskAgain: false });

    await expect(registerIfGranted('auth')).resolves.toBeNull();
    expect(permissions).not.toHaveBeenCalled();
  });

  /**
   * This runs on every foreground. A server that is down, or a token call that
   * throws, must cost a missed registration and never an error in front of
   * somebody who has just opened the app.
   */
  it('stays quiet when the server refuses the address', async () => {
    permissions.mockResolvedValue({ granted: true, canAskAgain: false });
    registerDevice.mockRejectedValueOnce(new Error('offline'));

    await expect(registerIfGranted('auth')).resolves.toBeNull();
  });
});

/**
 * Where a tap lands, which is the half of this module the rest of the app is
 * actually for.
 *
 * **Two sources, and the second is the one that keeps being forgotten.** A
 * listener catches a tap while the app is running; `getLastNotificationResponseAsync`
 * catches the tap that *launched* it, which no listener can have been present
 * for. Both are covered here, because a regression in the second is invisible
 * in every ordinary exercise of the first — and the launch case is the one the
 * feature exists for, a notification being read most often by somebody whose
 * app is closed.
 */
describe('a tap on a notification', () => {
  const lastResponse =
    Notifications.getLastNotificationResponseAsync as jest.Mock;
  const listen =
    Notifications.addNotificationResponseReceivedListener as jest.Mock;

  const response = (data: unknown) =>
    ({
      notification: { request: { content: { data } } },
    }) as Notifications.NotificationResponse;

  /** The listener the module registered, to deliver a tap through by hand. */
  const deliver = (data: unknown) => listen.mock.calls[0][0](response(data));

  /**
   * Lets the launch read's `.then` run. Nothing in the module awaits it —
   * deliberately, since a launch must not wait on the notification centre —
   * so a test that does not yield sees the state before it resolved.
   */
  const settle = () =>
    new Promise<void>((resolve) => setImmediate(() => resolve()));

  beforeEach(() => {
    jest.clearAllMocks();
    lastResponse.mockResolvedValue(null);
    listen.mockReturnValue({ remove: jest.fn() });
  });

  it('reports a tap that arrived while the app was running', async () => {
    const handle = jest.fn();
    onNotificationTap(handle);
    await settle();

    deliver({ channelId: 'chan_1', kind: 'pinged' });

    expect(handle).toHaveBeenCalled();
  });

  /**
   * The cold launch, and the reason the module reads a second source at all.
   * Without it the feature works when backgrounded and silently does nothing
   * when closed.
   */
  it('reports the tap that launched the app, which no listener saw', async () => {
    lastResponse.mockResolvedValue(response({ channelId: 'chan_2' }));
    const handle = jest.fn();

    onNotificationTap(handle);
    await settle();

    expect(handle).toHaveBeenCalled();
  });

  /** An icon launch. Nothing was tapped, so there is nowhere to be taken. */
  it('goes nowhere when nothing launched the app', async () => {
    const handle = jest.fn();
    onNotificationTap(handle);
    await settle();

    expect(handle).not.toHaveBeenCalled();
  });

  /**
   * **The payload is not read at all, since 2026-09-04.** A tap used to have
   * to name a channel, and one that named none was refused on the grounds that
   * navigating to `undefined` is a channel screen for no channel. There is no
   * navigation to a channel now — a tap shows the live rooms and the person
   * chooses — so a payload from an older server, or one whose field is not a
   * string, is a perfectly good tap.
   */
  it('reports a tap whose payload names nothing', async () => {
    const handle = jest.fn();
    onNotificationTap(handle);
    await settle();

    deliver({ kind: 'arrived' });
    deliver({ channelId: 7 });
    deliver(undefined);

    expect(handle).toHaveBeenCalledTimes(3);
  });

  /**
   * The launch read is a promise and the unsubscribe can land first — a
   * remount inside React's strict double-invoke is exactly that ordering.
   * Delivering into a handler whose owner has gone is a navigation nobody
   * asked for.
   */
  it('does not route a launch read that resolves after unsubscribing', async () => {
    lastResponse.mockResolvedValue(response({ channelId: 'chan_3' }));
    const handle = jest.fn();

    onNotificationTap(handle)();
    await settle();

    expect(handle).not.toHaveBeenCalled();
  });

  /**
   * Reading a payload this app did not write, at the one moment where an
   * unhandled rejection is a launch failure rather than a missed notification.
   */
  it('survives a launch read that rejects', async () => {
    lastResponse.mockRejectedValue(new Error('no notification centre'));
    const handle = jest.fn();

    expect(() => onNotificationTap(handle)).not.toThrow();
    await settle();
    expect(handle).not.toHaveBeenCalled();
  });

  it('stops listening when the app lets go', () => {
    const remove = jest.fn();
    listen.mockReturnValue({ remove });

    onNotificationTap(jest.fn())();

    expect(remove).toHaveBeenCalled();
  });
});
