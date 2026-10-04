import type { SharedDrift } from '../../../core/protocol';
import type { PlayerState } from '../../../core/watch';

/**
 * What the follower last saw, published so an instrument can read it.
 *
 * **It exists because the number that matters is the follower's own.** Every
 * other reading of the room's position is recomputed by whoever draws it — the
 * scrubber does, the expanded picture does — and a card that recomputed would be
 * a second answer to the question it was built to settle. What `drive.ts` is
 * steering on is the only thing worth drawing, so it is what is published.
 *
 * **A module-level value with a set of watchers**, which is the idiom
 * `probe.ts` and `diagnostics.ts` already use, and it is deliberately not any
 * of the three obvious alternatives:
 *
 * - **Not on `PictureContext`.** That value is memoised over its fields, so a
 *   field changing twice a second would rebuild the context object twice a
 *   second and re-render every consumer. `DockSlot` carries the account of a
 *   shipped bug caused by exactly that identity churn — an effect keyed on the
 *   context object ran its cleanup and undocked the picture — and a 2Hz field
 *   there would make it permanent.
 * - **Not returned from `useFollow`.** That re-renders `WatchPlayer`, and with
 *   it the `WebView` subtree, twice a second for a readout.
 * - **Not recomputed in the card**, for the reason at the top.
 *
 * A singleton is correct rather than a shortcut: there is exactly one player per
 * device, mounted once in `Picture`'s layer over the whole application. It is
 * keyed on the channel even so, because the layer outlives any one channel and a
 * reading from the room somebody has left must not be drawn under another's
 * transport.
 */
export interface DriftReading {
  /** Whose room this is about. See the note above on why it is carried. */
  channelId: string;
  /**
   * How far the player is from the room, signed: **positive is ahead**.
   *
   * Null when the player cannot say where it is, which is a real state and not
   * a missing value — a player that has not begun has no position.
   */
  driftMs: number | null;
  playerState: PlayerState;
  /** What the room is asking for, which is the other half of a drift. */
  wantStatus: 'playing' | 'paused';
  /** How long this player has been buffering without a break, 0 when it is not. */
  bufferingForMs: number;
  /** What this player has been measured to cost, per kind. Null until it has shown. */
  lagPlayMs: number | null;
  lagSeekMs: number | null;
  /**
   * Seeks issued since this run began.
   *
   * **The headline, and the success criterion for the whole correction
   * machinery: nought.** A number climbing while a film plays normally is the
   * seek storm, which is the fault this was built to make visible — it was
   * previously legible only by reading the diagnostic journal the next day.
   */
  seeksThisRun: number;
  /** When the reading was taken, on the room's clock rather than the device's. */
  at: number;
}

let latest: DriftReading | null = null;
const watchers = new Set<() => void>();

/** Called by `drive.ts` at the end of every tick that reaches a decision. */
export function publishDrift(reading: DriftReading): void {
  latest = reading;
  for (const watcher of watchers) watcher();
}

/**
 * The last reading for this channel, or null.
 *
 * Null for a channel that is not the one the player is on, which is the whole
 * of what the key is for.
 */
export function readDrift(channelId: string): DriftReading | null {
  if (!latest || latest.channelId !== channelId) return null;
  return latest;
}

/** The last reading whatever channel it is for, which is what is reported. */
export function currentDrift(): DriftReading | null {
  return latest;
}

/**
 * How often a screen tells the room its drift: one in two of the follower's
 * ticks, which is plenty for a number somebody is reading.
 */
export const DRIFT_REPORT_MS = 1000;

/**
 * How long another screen's reading is believed without a newer one.
 *
 * Three of its reports. A screen that stops says so and
 * a closing socket says so for it, so this is the net under a withdrawal that
 * was lost — a stale drift looks exactly like a settled one, here as above.
 */
export const OTHER_DRIFT_STALE_MS = 3 * DRIFT_REPORT_MS;

/** Another screen in the room, as its own follower last read itself. */
export interface OtherDrift {
  userId: string;
  reading: SharedDrift;
  /** On this device's clock: only ever compared with it, for staleness. */
  receivedAt: number;
}

/** Keyed `channelId`, then the account whose screen it is. */
const others = new Map<string, Map<string, OtherDrift>>();

/**
 * Another screen's reading arriving, or its withdrawal — relayed by the server
 * to accounts with `debug` set. See `ServerMessage.watch.drift`.
 */
export function receiveDrift(
  channelId: string,
  userId: string,
  reading: SharedDrift | null
): void {
  let room = others.get(channelId);
  if (reading === null) {
    if (!room?.delete(userId)) return;
    if (room.size === 0) others.delete(channelId);
  } else {
    if (!room) others.set(channelId, (room = new Map()));
    room.set(userId, { userId, reading, receivedAt: Date.now() });
  }
  for (const watcher of watchers) watcher();
}

/**
 * Every other screen's reading for this channel that is still fresh.
 *
 * A fresh array on every call, so a reader holding it in state re-renders when
 * it asks again.
 */
export function readOtherDrifts(channelId: string): OtherDrift[] {
  const room = others.get(channelId);
  if (!room) return [];
  const cutoff = Date.now() - OTHER_DRIFT_STALE_MS;
  const fresh: OtherDrift[] = [];
  for (const [userId, other] of room) {
    if (other.receivedAt < cutoff) room.delete(userId);
    else fresh.push(other);
  }
  return fresh;
}

/**
 * Forgotten when the follower stops.
 *
 * Without this a card would go on showing the last thing a dead player said,
 * which is worse than showing nothing: a stale drift is indistinguishable from
 * a settled one.
 */
export function forgetDrift(): void {
  if (latest === null) return;
  latest = null;
  for (const watcher of watchers) watcher();
}

/** Subscribes to every reading, in the idiom `probe.ts` uses. */
export function subscribeDrift(watcher: () => void): () => void {
  watchers.add(watcher);
  return () => watchers.delete(watcher);
}
