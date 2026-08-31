import { Alert, type AlertButton } from 'react-native';

/**
 * Confirmations and error reports, in a browser.
 *
 * **`react-native-web`'s `Alert` is `static alert() {}` — an empty function.**
 * Not a stub that warns, not a partial implementation: a no-op. So every one
 * of this app's twenty-six `Alert.alert` calls did nothing at all on the web
 * build, and the two halves of that failed differently. A confirmation never
 * asked, so its `onPress` never ran and the action behind it was simply inert
 * — *Sign out* and *Leave channel* being where it was noticed. An error report
 * never appeared, so a refused request looked like a tap that did nothing.
 *
 * **Patched rather than replaced at the call sites**, and that is the whole
 * design. Twenty-six sites and the tests that drive them by pulling buttons
 * out of a spy all keep working untouched, which is worth more than a tidier
 * shape: what is wrong is one missing implementation, and it is fixed in one
 * place. Should this app ever want a confirmation that looks like the rest of
 * it, that is a modal component and a different change; `window.confirm` is
 * what a browser already has, and it is honest about being the browser's.
 */

/** The browser's two, injected so the mapping below can be tested. */
export interface AlertIo {
  tell: (text: string) => void;
  ask: (text: string) => boolean;
}

/**
 * `Alert.alert`'s shape, expressed in what a browser offers.
 *
 * - **No choice to make** — one button or none — is `alert`, and the button's
 *   handler runs after it, since dismissing an informational alert is the only
 *   way to answer it.
 * - **One choice against a cancel** is `confirm`, which is exactly that shape.
 *   A browser that refuses the dialog answers false, which takes the cancel —
 *   the safe direction, every one of these being destructive.
 * - **Several choices** have no single browser equivalent, so they are asked
 *   in order, one `confirm` each, until one is accepted. Clumsy, and it is one
 *   caller: the transcript's export format. The alternative was a menu
 *   component built for a single menu.
 *
 * A cancel is found by `style` rather than by position, because the callers
 * disagree about where it goes and RN's own convention is the style.
 */
export function showAlert(
  io: AlertIo,
  title: string,
  message?: string,
  buttons?: readonly AlertButton[]
): void {
  const text = [title, message].filter(Boolean).join('\n\n');
  // No buttons at all is RN's single OK, which is an informational alert.
  const list: readonly AlertButton[] = buttons?.length ? buttons : [{ text: 'OK' }];
  const cancel = list.find((button) => button.style === 'cancel');
  const choices = list.filter((button) => button !== cancel);

  if (choices.length <= 1) {
    const only = choices[0];
    if (!cancel) {
      io.tell(text);
      only?.onPress?.();
      return;
    }
    if (io.ask(text)) only?.onPress?.();
    else cancel.onPress?.();
    return;
  }

  for (const choice of choices) {
    if (io.ask(`${text}\n\n${choice.text}?`)) {
      choice.onPress?.();
      return;
    }
  }
  cancel?.onPress?.();
}

/**
 * Installs it, before anything can be tapped.
 *
 * Called from `index.web.ts` rather than from a component, for the reason the
 * palette is installed there: the first thing that needs it may be the first
 * thing on screen.
 */
export function installWebAlerts(): void {
  Alert.alert = (title, message, buttons) =>
    showAlert(
      {
        tell: (text) => globalThis.alert?.(text),
        // A browser with dialogs blocked throws rather than answering, and the
        // false it is given instead is the cancel — nothing here is done by
        // failing to ask.
        ask: (text) => {
          try {
            return globalThis.confirm?.(text) ?? false;
          } catch {
            return false;
          }
        },
      },
      title,
      message,
      buttons
    );
}
