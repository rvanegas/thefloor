import { NOT_OFFERED, type Install } from './install';

/**
 * The offer, on a platform that is already the thing being offered.
 *
 * A constant rather than an absence, for the reason `ui/embedded.ts` gives
 * about itself: `AppProvider` calls this unconditionally and carries no
 * platform test, and a `Platform.OS` branch in a shared file is a thing that
 * has to be right in two builds at once. Metro picks `useInstall.web.ts`
 * instead, which is where the browser reading lives.
 */
export interface InstallState {
  install: Install;
  /** Null here, and on every browser that volunteered no prompt of its own. */
  promptInstall: (() => void) | null;
}

export function useInstall(): InstallState {
  return { install: NOT_OFFERED, promptInstall: null };
}
