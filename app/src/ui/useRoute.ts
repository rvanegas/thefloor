import type { Nav } from './webRoute';

/**
 * Addresses, on a platform that has none.
 *
 * Native navigation is a stack the person walks with gestures and Back
 * buttons, and there is nothing to synchronise it with — no address bar, no
 * history to push onto, nobody to hand a link to. `useRoute.web.ts` is the
 * sibling that does the work.
 *
 * A no-op rather than an absence, so `App.tsx` calls it unconditionally and
 * has no platform test in it: a hook that runs on one platform and not the
 * other would be a conditional hook, which React forbids outright.
 */
export function useRoute(
  _nav: Nav,
  _apply: (nav: Nav, intent?: { enter?: boolean }) => void,
  _ready: boolean
): void {
  // Nothing. See above.
}
