import { Platform, Share } from 'react-native';
import { copyText } from './clipboard';

/**
 * Handing a link to somebody, on a platform that may have no way to.
 *
 * **`react-native-web`'s `Share` is not a stub — it is worse than one.** It
 * calls `navigator.share` where that exists and otherwise returns a rejected
 * promise saying "Share is not supported in this browser". So the two call
 * sites, which catch and report, turned a desktop browser's missing Web Share
 * API into an error message where a guest link should have been. Chrome and
 * Safari on iOS both have it, which is why this survived a phone being the
 * only thing anybody tested on; Firefox and desktop Chrome do not.
 *
 * That matters more here than it would elsewhere: the guest link is the whole
 * of how somebody without an account gets into a channel, and the browser is
 * exactly where a person is most likely to be making one.
 *
 * **A clipboard is the honest fallback**, and not a lesser one. The share
 * sheet is for sending to a person and a clipboard is for putting somewhere —
 * ChannelView says so already, next to the watch links, which are copied
 * rather than shared for that reason. On a desktop, putting is usually what
 * was wanted anyway.
 */

/**
 * Whether this device can hand something to another application at all.
 *
 * Synchronous, so a control can say what it is about to do rather than
 * discovering it afterwards: "Copy a guest link" is a promise a browser
 * without Web Share can keep, and "Share" is not.
 *
 * Native is always true. On web it is the presence of the API `Share` will
 * reach for — asked of `navigator` rather than of `Share`, which offers no way
 * to ask.
 */
export const canShare: boolean =
  Platform.OS !== 'web' ||
  (typeof navigator !== 'undefined' && typeof navigator.share === 'function');

/**
 * What became of the offer.
 *
 * `'dismissed'` is deliberately not a failure and deliberately not a success:
 * somebody opened the sheet and closed it, and a screen that reported either
 * would be telling them something they already know or something untrue.
 */
export type Handoff = 'shared' | 'dismissed' | 'copied' | 'failed';

/**
 * Shares a link, or copies it when there is nothing to share to.
 *
 * The cancel case is picked out by name because both platforms express it as a
 * rejection here — the web's `navigator.share` throws `AbortError` when the
 * sheet is dismissed — and falling back to the clipboard on a *cancel* would
 * put a credential somewhere the person had just decided not to send it.
 */
export async function shareLink(url: string): Promise<Handoff> {
  if (canShare) {
    try {
      const result = await Share.share({ message: url });
      return result.action === Share.dismissedAction ? 'dismissed' : 'shared';
    } catch (error) {
      if ((error as { name?: string } | null)?.name === 'AbortError') {
        return 'dismissed';
      }
      // Anything else is a share that could not happen, and the link is still
      // worth having. Falls through.
    }
  }
  return (await copyText(url)) ? 'copied' : 'failed';
}
