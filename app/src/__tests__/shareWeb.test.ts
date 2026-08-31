/**
 * @jest-environment jsdom
 */

/**
 * Handing a link over, in a browser that has nowhere to hand it.
 *
 * `react-native-web`'s `Share` is not a stub: it calls `navigator.share` where
 * that exists and otherwise answers a rejected promise. Both browsers on iOS
 * have the API, which is why a desktop was the only place this showed — as an
 * error message where a guest link should have been.
 *
 * `canShare` is read at import, so `Platform` and `navigator` are set before
 * the module is required rather than after. Each case re-imports in isolation
 * for the same reason.
 */

jest.mock('react-native', () => ({
  Platform: { OS: 'web' },
  Share: { share: jest.fn(), dismissedAction: 'dismissedAction' },
}));
jest.mock('../clipboard', () => ({ copyText: jest.fn() }));

import { Share } from 'react-native';
import { copyText } from '../clipboard';

const shared = Share.share as jest.Mock;
const copies = copyText as jest.Mock;

/** The module, imported after the browser has been described. */
function load(hasShare: boolean) {
  if (hasShare) {
    Object.defineProperty(navigator, 'share', {
      value: () => Promise.resolve(),
      configurable: true,
    });
  } else {
    // @ts-expect-error deleting an optional browser API is the case under test
    delete navigator.share;
  }
  let mod!: typeof import('../share');
  jest.isolateModules(() => {
    mod = require('../share') as typeof import('../share');
  });
  return mod;
}

beforeEach(() => {
  jest.clearAllMocks();
  copies.mockResolvedValue(true);
});

describe('a browser with no Web Share API', () => {
  it('does not ask, and copies instead', async () => {
    const { canShare, shareLink } = load(false);
    expect(canShare).toBe(false);
    await expect(shareLink('https://example.test/g/tok')).resolves.toBe('copied');
    // Never even attempted: `Share.share` would answer a rejected promise, and
    // a rejection is what the call sites were reporting as an error.
    expect(shared).not.toHaveBeenCalled();
    expect(copies).toHaveBeenCalledWith('https://example.test/g/tok');
  });

  it('says so when the clipboard refuses too', async () => {
    copies.mockResolvedValue(false);
    const { shareLink } = load(false);
    await expect(shareLink('https://example.test/x')).resolves.toBe('failed');
  });
});

describe('a browser that can share', () => {
  it('shares, and does not copy', async () => {
    const { canShare, shareLink } = load(true);
    expect(canShare).toBe(true);
    shared.mockResolvedValue({ action: 'sharedAction' });
    await expect(shareLink('https://example.test/x')).resolves.toBe('shared');
    expect(copies).not.toHaveBeenCalled();
  });

  it('treats a dismissed sheet as neither done nor failed', async () => {
    const { shareLink } = load(true);
    shared.mockResolvedValue({ action: 'dismissedAction' });
    await expect(shareLink('https://example.test/x')).resolves.toBe('dismissed');
    expect(copies).not.toHaveBeenCalled();
  });

  it('does not copy behind somebody who cancelled', async () => {
    // The web expresses a cancel as a rejection, so this is the one rejection
    // that must not fall through: a credential put on the clipboard is a
    // credential sent somewhere they had just decided not to send it.
    const abort = new Error('cancelled');
    abort.name = 'AbortError';
    const { shareLink } = load(true);
    shared.mockRejectedValue(abort);
    await expect(shareLink('https://example.test/x')).resolves.toBe('dismissed');
    expect(copies).not.toHaveBeenCalled();
  });

  it('falls back when the share fails for any other reason', async () => {
    const { shareLink } = load(true);
    shared.mockRejectedValue(new Error('no sheet today'));
    await expect(shareLink('https://example.test/x')).resolves.toBe('copied');
    expect(copies).toHaveBeenCalled();
  });
});
