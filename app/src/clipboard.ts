import { useEffect, useState } from 'react';
import { AppState } from 'react-native';
import * as Clipboard from 'expo-clipboard';

/**
 * The system clipboard, in the two directions anything needs it.
 *
 * **A module rather than two calls at the one call site**, because the
 * clipboard has a second consumer: the channel clipboard shipped 2026-08-21
 * and puts a paste into a channel and a copy back out of it, which is this
 * file's two functions pointed at a channel instead of at a diagnostic. Writing the
 * contract once is what stops the second consumer inventing a different one.
 *
 * **`expo-clipboard` rather than `Clipboard` from `react-native` core.** The
 * core export still works and is what this used first, but it is deprecated
 * and documented as going away — and the argument for tolerating that was
 * entirely "one button on a panel one account can see", which stopped being
 * true the moment a second use was planned. It is a native module, so it costs
 * a prebuild and takes the autolink count from 15 to 16; `bin/upload-ios`
 * prints that count and it is worth reading on the next build.
 *
 * It is also the better API for the job. `setStringAsync` resolves to a
 * **boolean** where the core one returned nothing at all, so "the clipboard
 * declined" is a state a caller can see rather than one it has to assume did
 * not happen.
 *
 * **Neither function throws, and neither reports success it did not have.**
 * That is the contract every device reader in this app follows — `appBuild`,
 * `deviceRegion`, `routeSnapshot` — and it matters most here: the first
 * consumer is a diagnostic panel written entirely against instruments that go
 * quiet, and a copy that silently did nothing would send somebody away
 * believing they held a reading they did not.
 */

/**
 * Puts text on the clipboard.
 *
 * @returns whether it actually landed. **Callers must show this**; a copy
 *          button that reports success unconditionally is worse than no
 *          button, since the failure is then discovered at the paste, by
 *          somebody who has already moved on.
 */
export async function copyText(text: string): Promise<boolean> {
  try {
    return await Clipboard.setStringAsync(text);
  } catch {
    return false;
  }
}

/**
 * Reads the clipboard.
 *
 * @returns the text, or null when there is none or it could not be read. The
 *          two are deliberately the same answer: nothing a caller could do
 *          differs between an empty clipboard and an unreadable one, and iOS
 *          shows the user a paste notification either way.
 */
export async function pasteText(): Promise<string | null> {
  try {
    const text = await Clipboard.getStringAsync();
    return text.length > 0 ? text : null;
  } catch {
    return null;
  }
}

/**
 * Whether this device can draw the system's own paste control, which reads the
 * clipboard **without the prompt** `pasteText` sets off. See `PasteButton`.
 *
 * iOS 16 and later; never Android and never the web, where the flag is false
 * and the caller falls back to a button that calls `pasteText`. A function
 * rather than a re-export so a test can say *this is a phone that has it*
 * without reaching into the native module.
 */
export function systemPasteAvailable(): boolean {
  return Clipboard.isPasteButtonAvailable === true;
}

/**
 * Whether the clipboard holds anything the system paste control would take —
 * text or a link — **asked without reading it**, so without a prompt:
 * `hasStrings` and `hasURLs` are the questions iOS answers silently.
 *
 * It matters because the control does not grey itself for an empty clipboard,
 * whatever its documentation implies: **on a device it draws nothing at all**,
 * leaving the caption under an empty slot. The simulator draws it either way,
 * which is how that reached build 319. So `PasteButton` asks this first.
 *
 * Asked again whenever the clipboard changes in this app and whenever the app
 * comes back to the front, which is when a link copied elsewhere arrives.
 * `pasteable` is null until the first answer, which a caller treats as *yes*:
 * the control is what it would have drawn anyway. Only runs where `enabled`,
 * which is where the control exists at all.
 *
 * **`asked` counts the answers, and `PasteButton` keys the control on it**, so
 * every answer draws a new `UIPasteControl` rather than trusting the old one.
 * A control that has been through the background can come back drawing
 * nothing however full the pasteboard is — it decides for itself that it
 * lacks room and hides, and never undecides — so this answer said *yes* above
 * an empty slot until the app was killed. Apple's forum thread 756627 is the
 * same report, unfixed; a control made afresh lays itself out afresh.
 */
export function useClipboardHasPasteable(enabled: boolean): {
  pasteable: boolean | null;
  asked: number;
} {
  const [state, setState] = useState<{ pasteable: boolean | null; asked: number }>(
    { pasteable: null, asked: 0 }
  );
  useEffect(() => {
    if (!enabled) return;
    let live = true;
    const ask = () => {
      void Promise.all([
        Clipboard.hasStringAsync().catch(() => true),
        Clipboard.hasUrlAsync().catch(() => true),
      ]).then(([text, url]) => {
        if (live)
          setState((prev) => ({ pasteable: text || url, asked: prev.asked + 1 }));
      });
    };
    ask();
    const changed = Clipboard.addClipboardListener(ask);
    const front = AppState.addEventListener('change', (next) => {
      if (next === 'active') ask();
    });
    return () => {
      live = false;
      changed.remove();
      front.remove();
    };
  }, [enabled]);
  return state;
}
