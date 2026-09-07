/**
 * @jest-environment jsdom
 */

/**
 * Remembering that somebody has already been offered the app.
 *
 * Its own file, and jsdom, for the reason `appearanceWeb.test.ts` is: this is
 * browser-only behaviour and the suite's preset is the native one, which has
 * no `localStorage` at all. What `home.test.tsx` can check is that the notice
 * is drawn in a browser and goes when it is answered; that the answer survives
 * a reload needs a browser's storage, which is here.
 */

import {
  dismissInstallNotice,
  installNoticeDismissed,
} from '../installNotice';

describe('the install notice', () => {
  beforeEach(() => localStorage.clear());

  it('is not dismissed until it has been', () => {
    expect(installNoticeDismissed()).toBe(false);
    dismissInstallNotice();
    expect(installNoticeDismissed()).toBe(true);
  });

  /**
   * The fact is about this browser rather than about whoever is signed into
   * it, so nothing clears it on sign-out — a second account on one laptop
   * being told again would be the app forgetting a conversation it has had.
   */
  it('keeps the answer under a key of its own', () => {
    dismissInstallNotice();
    expect(localStorage.getItem('thefloor.install.dismissed')).toBe('true');
  });

  /**
   * Safari with storage blocked throws rather than answering null, which is
   * the case both functions are wrapped for. Not dismissed is the direction to
   * be wrong in: showing the notice again is a nuisance, where hiding it from
   * somebody who has never seen it is the whole feature missing.
   */
  it('survives a browser that refuses storage', () => {
    const original = Object.getOwnPropertyDescriptor(
      globalThis,
      'localStorage'
    );
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      get() {
        throw new Error('The operation is insecure.');
      },
    });
    try {
      expect(installNoticeDismissed()).toBe(false);
      expect(() => dismissInstallNotice()).not.toThrow();
    } finally {
      if (original) Object.defineProperty(globalThis, 'localStorage', original);
    }
  });
});
