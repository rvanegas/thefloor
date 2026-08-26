import * as Notifications from 'expo-notifications';

import { api } from '../api/http';
import { registerIfGranted, sweepArrivals, sweepChannel } from '../push';

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
