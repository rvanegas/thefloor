import { useCallback, useEffect, useRef } from 'react';
import { addressOfPath, pathOf, type Address } from './webRoute';

/**
 * Keeps the address bar and the screen saying the same thing.
 *
 * **In a browser the address is the navigation**, not a decoration on it: Back
 * is a button people press without thinking, and a reload that lands somewhere
 * else is a bug. The app had none of that, because on a phone none of it
 * exists.
 *
 * Deliberately thin. Everything that can be decided without a browser lives in
 * `webRoute.ts` and is tested; this is the plumbing that cannot be, so there is
 * as little of it as the job allows.
 *
 * **Nothing here normalises what it reads.** Every address restores — that is
 * what nesting the named screens under the frame bought — so what the bar says
 * and what the app then shows cannot come apart, and there is no repair step
 * to get wrong. This file had one for a day, when a channel had an address it
 * could not be reached at.
 */
export function useRoute(
  address: Address,
  apply: (address: Address) => void,
  ready: boolean
): void {
  /**
   * The path the bar is showing, as far as this hook is concerned.
   *
   * Written by the branch that reads *from* the browser as well as the one
   * that writes to it, which is what stops the effect at the bottom pushing an
   * entry for a change it did not cause. Back used to do exactly that: a
   * `popstate` applied the address, the address changed, and the push fired on
   * the way past — so pressing Back left a new entry on the stack and pressing
   * it again went forwards. Fixed 2026-09-04.
   */
  const shown = useRef<string | null>(null);

  /** Reads the bar and applies it, recording what it read. */
  const adopt = useCallback(() => {
    const wanted = addressOfPath(globalThis.location?.pathname ?? '');
    shown.current = pathOf(wanted);
    apply(wanted);
  }, [apply]);

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
    // The bare base is the one path every door forwards to and the one path
    // `pathOf` never writes, so the entry the person arrived on is replaced
    // with the address it means. Replaced rather than pushed: pushing would
    // put a duplicate behind them so that Back went nowhere the first time
    // they pressed it.
    try {
      globalThis.history?.replaceState(
        {},
        '',
        pathOf(addressOfPath(globalThis.location?.pathname ?? ''))
      );
    } catch {
      // A browser refusing history is one that simply has no addresses. The
      // app still works; it just does not say where it is.
    }
    adopt();
  }, [ready, adopt]);

  /**
   * Back and Forward, which is the half people actually notice.
   *
   * Registered once and reading through a ref, because re-subscribing on every
   * render would drop the listener between the removal and the add — a gap a
   * `popstate` can land in, and one that is very hard to see because it only
   * bites under a fast double-press.
   */
  const adoptRef = useRef(adopt);
  adoptRef.current = adopt;

  useEffect(() => {
    const onPop = () => {
      if (!read.current) return;
      adoptRef.current();
    };
    globalThis.addEventListener?.('popstate', onPop);
    return () => globalThis.removeEventListener?.('popstate', onPop);
  }, []);

  /**
   * The address changing under the bar, which is every ordinary navigation:
   * switching tabs, opening Settings, closing it again.
   *
   * **A channel and a profile are not among them**, having no address — so
   * opening one pushes nothing and Back does not close it. That is the cost of
   * refusing ids, taken deliberately; the alternative was a path that named a
   * channel it could not reopen. See GLOSSARY.md § *Close*.
   *
   * Only after the address has been read, or the first render would push the
   * list over whatever the person actually asked for.
   */
  useEffect(() => {
    if (!read.current) return;
    const path = pathOf(address);
    if (shown.current === path) return;
    shown.current = path;
    try {
      globalThis.history?.pushState({}, '', path);
    } catch {
      // As above: no addresses, but everything else still works.
    }
  }, [address]);
}
