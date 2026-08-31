import { BASE } from './webRoute';

/**
 * Where this browser keeps which train it uses.
 *
 * **Written by the app and read by pages that are not the app.** `/`, the
 * guest page and `/open` all have to send somebody into the web app, and none
 * of them can know whether this person is on stable or beta — a channel, a
 * contact and a guest link belong to neither train, so nothing they are
 * holding carries the answer. What does carry it is the browser itself: it has
 * been running one of the two bundles, and this is that bundle saying which.
 *
 * `localStorage`, scoped to the origin rather than the path, which is the same
 * property `landing.ts` reads `thefloor.token` on and the reason both work at
 * all: one server serves `/`, `/g/…`, `/app` and `/beta`.
 *
 * **The reader validates, so this can be stale without stranding anybody.**
 * `/open` intersects it with the trains that are actually deployed and falls
 * back to the preference order, so a value naming a retired train costs a
 * redirect to the right one rather than a 503.
 *
 * Web only — Metro resolves `.web.ts` for the browser build and `index.ts`,
 * the native entry, does not import this. A phone has no trains: it has a
 * build number, which is a different fact with its own field on the wire.
 */
const TRAIN_KEY = 'thefloor.train';

export function rememberTrain(): void {
  // Empty when a dev server hosts the app at the root, which is not a train
  // and must not be written: `/open` would intersect an empty string against
  // real prefixes and match nothing, which is the same answer, but the key
  // would then claim a fact that is not one.
  if (!BASE) return;
  try {
    localStorage.setItem(TRAIN_KEY, BASE);
  } catch {
    // Safari with storage blocked throws rather than answering. The cost is
    // that this browser is sent to whichever train is preferred, which is
    // exactly where somebody with no history goes.
  }
}
