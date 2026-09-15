import { useCallback, useEffect, useState } from 'react';
import { HELP_SEEN_KEY, seenAtOf, watermarkOf } from './helpSeen';
import { storage } from './storage';

/** What the app knows about having read its own answers, and how it records it. */
export interface HelpSeen {
  /**
   * The newest answer this install has had on screen, or null before the
   * keychain has been read and for an install that has never opened the screen.
   *
   * Null is the quiet value in both cases, and that is the wrong way round for
   * exactly one frame: an install that *has* read everything shows the mark
   * until the read lands. See `loaded`, which is what suppresses that.
   */
  seenAnsweredAt: number | null;
  /**
   * Whether the keychain has answered yet. Nothing may draw a mark before it
   * has — a dab that appears on a cold start and vanishes a frame later is a
   * flicker on the one control the whole tier is navigated by.
   */
  loaded: boolean;
  /**
   * Records the newest answer the help screen has just shown.
   *
   * Takes the watermark rather than computing it, so the number written is one
   * taken off rows that were on screen — see `watermarkOf`. Never moves
   * backwards: a screen that fetched an older view than a previous one would
   * otherwise un-read an answer.
   */
  noteAnswersSeen: (questions: ReadonlyArray<{ answeredAt: number | null }>) => void;
}

/**
 * The watermark behind the Support tab's dab.
 *
 * **Held in `AppProvider` because two screens share it**, which is the same
 * reason `useNotificationAsk` is there: `HomeView` reads it to decide the mark
 * and `HelpView` writes it on the way in, and a module that each of them read
 * the keychain from separately would leave the tab still marked behind a screen
 * that had just been closed.
 *
 * **Not cleared on sign-out**, like every other key in `state/`: it is a fact
 * about what has been read at this phone. It *is* in `INSTALL_KEYS`, so
 * *Forget this phone* drops it — a fresh install has read nothing.
 */
export function useHelpSeen(): HelpSeen {
  const [seenAnsweredAt, setSeenAnsweredAt] = useState<number | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const stored = await storage.get(HELP_SEEN_KEY);
        if (!cancelled) setSeenAnsweredAt(seenAtOf(stored));
      } catch {
        // A store that refuses to be read is treated as never having been
        // written, which shows the mark to somebody who may have read the
        // answer already. A mark too many costs a tap; the other direction
        // hides an answer somebody is waiting for.
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const noteAnswersSeen = useCallback(
    (questions: ReadonlyArray<{ answeredAt: number | null }>) => {
      const watermark = watermarkOf(questions);
      if (watermark == null) return;
      setSeenAnsweredAt((current) => {
        if (current != null && current >= watermark) return current;
        // Fire and forget, and the state above is what the mark is drawn from:
        // the dab must go the moment the screen opens rather than after a
        // keychain round trip, and a write that fails costs one extra mark next
        // launch.
        void storage.set(HELP_SEEN_KEY, String(watermark)).catch(() => {});
        return watermark;
      });
    },
    []
  );

  return { seenAnsweredAt, loaded, noteAnswersSeen };
}
