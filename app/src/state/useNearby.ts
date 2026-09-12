import { useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import type { ChannelView } from '../../../core/protocol';
import { recordEvent } from '../audio/diagnostics';
import { somebodyArrived, whoArrived } from './nearby';

/**
 * Notices somebody arriving in a channel this device is standing nearby, and
 * reports it. **It takes no action on the room and no claim on the audio.**
 *
 * The rule and its reasoning are in `nearby.ts`; this is the wiring. Three
 * conditions, and each is doing work:
 *
 * - **This device declared it.** `nearbyIn` is the device's own record, set
 *   where the action is sent, and it is why the *inferred* kind reports
 *   nothing: somebody filed under `waiting` because their socket went is
 *   somebody whose app is not running to notice anything. A second device
 *   watching that person's channel must not put an offer in front of a wait
 *   their other phone is in the middle of.
 * - **The server agrees.** `waiting` is read back from the snapshot rather than
 *   assumed from `nearbyIn`, so a declaration the server refused, or one that
 *   has since lapsed to *Stepped out*, offers nothing.
 * - **The foreground.** Kept after promotion was removed, and for a reason
 *   that outlived it. It was iOS refusing a backgrounded app a *new*
 *   microphone — measured on build 146, four minutes with no engine start —
 *   and an offer needs no microphone. What it still buys is the second half of
 *   that behaviour: **the arrival is not consumed by the background.** The
 *   roster is not recorded while the phone is away, so coming forward compares
 *   against the last thing actually seen on screen and the offer is there when
 *   somebody looks. Recording it anyway would count the new person as *seen*
 *   and the offer would never appear. In the background others see *Nearby*
 *   and may ping, and the arrival notification is what reaches somebody who is
 *   not looking — that, rather than this hook, is the half that does the
 *   reaching.
 *
 * **Every channel declared in, not one, since 2026-09-12.** Presence is
 * exclusive and nearby is not — you may be within reach of several rooms at
 * once, and the wire says so with a bit per channel rather than an id. This
 * used to take a single view and a single id, so a second declaration stopped
 * the first from ever raising an offer: the room went on showing *Nearby* on
 * Home, the push still arrived, and the one thing being nearby is *for* — a
 * step in under the thumb when somebody walks in — silently did not happen.
 *
 * **It reads the snapshots of the channels declared in, not the screen in
 * front.** An arrival comes over the ordinary websocket in channel state,
 * which a nearby phone is still receiving. Where an offer is *drawn* is
 * `ChannelView`, which is that channel's screen.
 */
export function useNearby(
  views: Record<string, ChannelView | undefined>,
  me: string,
  nearbyIn: readonly string[],
  onArrival: (channelId: string, who: string[]) => void
): void {
  const [foreground, setForeground] = useState(
    AppState.currentState === 'active'
  );
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (next) =>
      setForeground(next === 'active')
    );
    return () => subscription.remove();
  }, []);

  /**
   * Each room as this device last saw it, keyed by channel, holding nothing
   * for one it has not seen yet.
   *
   * Keyed so that looking at a second channel and coming back does not compare
   * one room's roster against another's — and, since the declaration became a
   * set, so that two rooms watched at once each keep their own. An entry is
   * dropped when its declaration ends, so a fresh one starts from *not seen
   * yet* rather than from a roster that may be minutes old.
   */
  const seen = useRef(new Map<string, string[]>());

  useEffect(() => {
    if (nearbyIn.length === 0) {
      seen.current.clear();
      return;
    }
    // Declarations that have ended take their memory with them; the rooms
    // still declared in are compared against what this device last saw.
    for (const id of seen.current.keys()) {
      if (!nearbyIn.includes(id)) seen.current.delete(id);
    }
    // See the foreground note above: nothing is observed from the background,
    // so that an arrival is still there to be offered when the phone is picked
    // up.
    if (!foreground) return;
    for (const channelId of nearbyIn) {
      const channel = views[channelId]?.channel ?? null;
      if (
        !channel ||
        channel.status !== 'active' ||
        !channel.waiting.includes(me)
      ) {
        seen.current.delete(channelId);
        continue;
      }
      const before = seen.current.get(channelId) ?? null;
      seen.current.set(channelId, [...channel.present]);
      if (!somebodyArrived(before, channel.present, me)) continue;
      // Worth a line in the audio log even though no audio moves: this is the
      // moment the design used to open a microphone, and a walk that finds the
      // offer missing needs to know whether the arrival was seen at all.
      recordEvent('nearby arrival offered');
      onArrival(channelId, whoArrived(before, channel.present, me));
    }
    // `views` rather than any one room: a snapshot arrives for anything that
    // changes in any of them, and only a roster can be an arrival.
  }, [views, nearbyIn, foreground, me, onArrival]);
}
