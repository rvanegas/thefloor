import { useEffect, useRef } from 'react';
import {
  navOf,
  pathOf,
  sameScreen,
  screenOf,
  screenOfPath,
  wantsEntry,
  type Nav,
} from './webRoute';

/**
 * Keeps the address bar and the screen saying the same thing.
 *
 * **In a browser the address is the navigation**, not a decoration on it: Back
 * is a button people press without thinking, a link is how a screen gets sent
 * to somebody, and a reload that lands somewhere else is a bug. The app had
 * none of that, because on a phone none of it exists — `App.tsx` routes with a
 * channel id and four booleans, which is right there and wrong here.
 *
 * Deliberately thin. Everything that can be decided without a browser lives in
 * `webRoute.ts` and is tested; this is the plumbing that cannot be, so there is
 * as little of it as the job allows.
 */
export function useRoute(
  nav: Nav,
  apply: (nav: Nav, intent?: { enter?: boolean }) => void,
  ready: boolean
): void {
  /**
   * Whether the address has been read yet.
   *
   * **Gated on `ready` rather than run on mount, and that is the whole trap.**
   * The token is read asynchronously from storage, so `token` is null for the
   * first render or two — and `App.tsx` has an effect that clears every screen
   * whenever there is no token, which exists to close a stale channel screen
   * when somebody signs out and cannot tell that case from this one. Applying
   * the address before the session arrives means watching it be wiped. The app
   * has no notion of navigation that predates a session, because a phone has
   * no such thing; in a browser every route does.
   */
  const read = useRef(false);

  useEffect(() => {
    if (read.current || !ready) return;
    read.current = true;
    const wanted = screenOfPath(globalThis.location?.pathname ?? '');
    // Read before the address is rewritten below, which is what drops it: the
    // intent belongs to the arrival and not to the room. See `wantsEntry`.
    const enter = wantsEntry(globalThis.location?.search ?? '');
    // Replaced rather than pushed: this is the entry the person arrived on,
    // and pushing here would put a duplicate behind them so that Back went
    // nowhere the first time they pressed it.
    try {
      globalThis.history?.replaceState({}, '', pathOf(wanted));
    } catch {
      // A browser refusing history is one that simply has no addresses. The
      // app still works; it just does not say where it is.
    }
    // **Applied even when the screen already matches, if entry was asked for.**
    // Arriving at `/c/x?enter=1` while the app happens to be showing `/c/x`
    // is not nothing to do — the step in is the whole of what was asked.
    if (enter) apply(navOf(wanted), { enter: true });
    else if (!sameScreen(wanted, screenOf(nav))) apply(navOf(wanted));
  }, [ready, nav, apply]);

  /**
   * Back and Forward, which is the half people actually notice.
   *
   * Registered once and reading `apply` from a ref, because re-subscribing on
   * every render would drop the listener between the removal and the add — a
   * gap a `popstate` can land in, and one that is very hard to see because it
   * only bites under a fast double-press.
   */
  const applyRef = useRef(apply);
  applyRef.current = apply;

  useEffect(() => {
    const onPop = () => {
      applyRef.current(navOf(screenOfPath(globalThis.location?.pathname ?? '')));
    };
    globalThis.addEventListener?.('popstate', onPop);
    return () => globalThis.removeEventListener?.('popstate', onPop);
  }, []);

  /**
   * The screen changing under the address, which is every ordinary navigation
   * — a tap on a channel, a Back button inside the app.
   *
   * Only after the address has been read, or the first render would push Home
   * over whatever the person actually asked for.
   */
  const shown = useRef<string | null>(null);
  useEffect(() => {
    if (!read.current) return;
    const path = pathOf(screenOf(nav));
    if (shown.current === path) return;
    // First time through, the address was just set by the read above; there is
    // nothing to push and doing so would duplicate the entry.
    const first = shown.current === null;
    shown.current = path;
    if (first) return;
    try {
      globalThis.history?.pushState({}, '', path);
    } catch {
      // As above: no addresses, but everything else still works.
    }
  }, [nav]);
}
