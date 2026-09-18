import { useEffect } from 'react';

/**
 * Stops the screen dimming under a film, in a browser.
 *
 * `navigator.wakeLock` where it exists, and nothing where it does not — Safari
 * has it, Firefox does not, and a browser without it dims exactly as it always
 * did. See keepAwake.ts for what this is for and what it deliberately is not:
 * it is the idle timer that is being held off, never the foreground.
 *
 * **A lock is lost when the tab is hidden**, by the specification rather than
 * by us, and it does not come back on its own — so the visibility listener is
 * not optional bookkeeping, it is the whole of making this work across a
 * person glancing at another tab.
 */
export function useKeepAwake(_tag: string, active: boolean): void {
  useEffect(() => {
    if (!active) return;
    const wakeLock = (
      navigator as Navigator & {
        wakeLock?: { request: (type: 'screen') => Promise<WakeLockLike> };
      }
    ).wakeLock;
    if (!wakeLock) return;

    let held: WakeLockLike | null = null;
    let stopped = false;

    const take = () => {
      if (stopped || held || document.visibilityState !== 'visible') return;
      void wakeLock
        .request('screen')
        .then((lock) => {
          if (stopped) {
            void lock.release().catch(() => {});
            return;
          }
          held = lock;
          // A lock can be dropped by the browser for its own reasons — a
          // battery saver, a device going to sleep anyway. Forgetting it here
          // is what lets the next visibility change take a fresh one rather
          // than believe it still holds this.
          lock.addEventListener?.('release', () => {
            if (held === lock) held = null;
          });
        })
        .catch(() => {
          // Refused by policy or by the platform. A film that dims is the
          // cost, and it is not worth a message on a screen showing a video.
        });
    };

    const onVisibility = () => {
      if (document.visibilityState === 'visible') take();
      else held = null;
    };

    take();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      stopped = true;
      document.removeEventListener('visibilitychange', onVisibility);
      if (held) void held.release().catch(() => {});
      held = null;
    };
  }, [active]);
}

/** The half of `WakeLockSentinel` this uses, which not every lib.dom has. */
interface WakeLockLike {
  release: () => Promise<void>;
  addEventListener?: (type: 'release', listener: () => void) => void;
}
