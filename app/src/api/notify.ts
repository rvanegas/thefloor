import type { Permission } from '../state/notificationAsk';

/**
 * The last thing this install knew about its own notification permission,
 * held here so that every request can carry it without asking again.
 *
 * **Level 3 of planning/MARKETING.md § *The funnel, level by level***, and
 * the level that file says to instrument if only one ever is: the server
 * knows a device token exists, which is the *granted* case, and has no way
 * at all to tell a refusal from a dialog nobody has been shown. Those are the
 * two answers worth having — a permission nobody granted breaks this product
 * silently, an invitation nobody was shown being an invitation nobody
 * declined.
 *
 * **A module of its own because of a cycle, not because it deserves one.**
 * The natural home is push.ts, which is where the answer is read; but push.ts
 * imports `api` from http.ts, and http.ts is what needs to send it. This
 * holds the value between them and imports neither.
 *
 * It is one value, not a queue: nothing is batched, nothing is timed, and a
 * request that goes out before the first read simply carries no header. See
 * `NOTIFY_HEADER` in the server's release.ts for what absence means there.
 */
let reported: Permission | null = null;

/**
 * Remembers what iOS last said. Called by `permissionState`, which is the one
 * place that asks — on mount, on every foreground, and after the dialog.
 *
 * **Only from an install that can hold a token.** A browser and a simulator
 * both read as `denied`, correctly, there being nothing to grant; reporting
 * that would file a population that was never eligible as one that refused.
 * The caller makes that judgement, since it is the one holding `mayHoldToken`.
 */
export function noteNotificationPermission(state: Permission): void {
  reported = state;
}

/** What to send, or null to send nothing at all. */
export function notificationPermission(): Permission | null {
  return reported;
}

/**
 * The header carrying it, and the query parameter the websocket mirrors it
 * as — both named to match the server's, which is the definition.
 *
 * Mirrored for `BUILD_HEADER`'s reason: React Native's WebSocket carries no
 * custom headers portably, and somebody sitting in a channel for an hour
 * makes almost no HTTP calls, so a value sent only over HTTP would go stale
 * for exactly the people who are using the app.
 */
export const NOTIFY_HEADER = 'x-thefloor-notify';
