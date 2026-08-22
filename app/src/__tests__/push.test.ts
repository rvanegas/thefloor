import * as Notifications from 'expo-notifications';

import '../push';

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
