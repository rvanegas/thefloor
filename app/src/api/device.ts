import * as Device from 'expo-device';

/**
 * What this copy of the app calls itself, so the server can tell it apart from
 * the account's other copies.
 *
 * **Not a credential and not a persistent identifier.** The token still
 * authenticates; this only tells `displaceOtherSessions` which sockets belong
 * to the same running app, so that entering a channel here steps this account
 * out of wherever else it was standing without stepping *this* device out of
 * the room it just entered. Nothing is authorised by it and nothing stores it.
 *
 * **One per JavaScript context, deliberately, and that is the whole design.**
 * Minted at module load and never written down, which lands on exactly the
 * right meaning on both platforms without either needing to know about the
 * other. On a phone a context is a process, so this is stable for as long as
 * the app is running — which covers every reconnection, and a reconnection is
 * the case the server's skip exists for. In a browser a context is a *tab*, so
 * two tabs get two names — which is the case that has never been expressible
 * before, since two tabs on one origin share `localStorage` and therefore
 * share a token. See planning/decisions/DECISIONS.md § *The web app is a
 * secondary interface*.
 *
 * A relaunch mints a new one and so displaces the previous run's socket if the
 * server is somehow still holding it. That is correct rather than tolerated:
 * the old socket belongs to a process that no longer exists, and telling it
 * that it is no longer standing anywhere costs a message to nobody.
 *
 * **Persisting it would be a bug, not an improvement.** A stored id lives in
 * the same `localStorage` the token does, so both tabs would read the same one
 * back and this file would be an elaborate way of writing the token again.
 */
export const DEVICE_ID: string = mint();

/**
 * A name distinct from the account's other live ones, which is a much weaker
 * requirement than it looks.
 *
 * These are compared only against the same account's own sockets — a handful,
 * at one moment, on one server — and nothing is granted by matching one. So
 * the property needed is that two tabs opened in the same second do not
 * collide, not that a name is unguessable. `randomUUID` where the platform has
 * it, and where it does not, enough entropy for that.
 */
function mint(): string {
  const uuid = globalThis.crypto?.randomUUID?.();
  if (uuid) return uuid;
  const rand = () => Math.random().toString(36).slice(2, 10);
  return `${Date.now().toString(36)}-${rand()}${rand()}`;
}

/**
 * What to call this device in its own account's screen picker.
 *
 * **Shown to one person — its owner — and never to the room.** It rides on the
 * socket URL beside `DEVICE_ID`, lives on the connection and dies with it. A
 * device name is frequently somebody's own name, and a channel has no business
 * knowing whose iPad is showing the film.
 *
 * **Weak by construction, and the fallback is the point.** `Device.deviceName`
 * is `UIDevice.current.name`, which on iOS 16 and newer answers a generic
 * "iPhone" unless the app holds the user-assigned device name entitlement —
 * requested, not yet granted, see planning/WATCH-IN-APP.md. So the model name
 * is what is actually useful today and what this prefers: "iPhone 15 Pro"
 * tells somebody which of their devices this is, where "iPhone" does not.
 *
 * Null when the platform says nothing — which is every browser, there being no
 * device-name API on the web at all. The picker meets that by describing a
 * device by its kind instead, because a made-up name in a list of real ones is
 * worse than a gap.
 */
export const DEVICE_NAME: string | null = describe();

function describe(): string | null {
  // The user-assigned name only when it is genuinely one — which is to say,
  // when it is not simply the model over again. With the entitlement this is
  // "Rodrigo's iPhone"; without it, it is "iPhone", and the model is strictly
  // more use.
  const assigned = Device.deviceName?.trim();
  const model = Device.modelName?.trim();
  if (assigned && assigned !== model && assigned !== Device.brand?.trim()) {
    return assigned;
  }
  return model || null;
}
