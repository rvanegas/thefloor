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
