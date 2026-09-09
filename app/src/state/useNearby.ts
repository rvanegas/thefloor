import { useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import type { ChannelView } from '../../../core/protocol';
import { recordEvent } from '../audio/diagnostics';
import { somebodyArrived, whoArrived } from './nearby';

/**
 * Notices somebody arriving in the channel this device is standing nearby, and
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
 * **It reads the snapshot of the channel declared in, not the screen in
 * front.** The arrival comes over the ordinary websocket in channel state,
 * which a nearby phone is still receiving. Where the offer is *drawn* is
 * `ChannelView`, which is that channel's screen.
 */
export function useNearby(
  view: ChannelView | null,
  me: string,
  nearbyIn: string | null,
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
   * The room as this device last saw it, or null before it has seen it.
   *
   * Keyed by channel so that looking at a second channel and coming back does
   * not compare one room's roster against another's. Cleared when the
   * declaration ends, so a fresh one starts from *not seen yet* rather than
   * from a roster that may be minutes old.
   */
  const seen = useRef<{ channelId: string; present: string[] } | null>(null);

  const channel = view?.channel ?? null;
  const nearbyHere =
    !!channel &&
    channel.id === nearbyIn &&
    channel.status === 'active' &&
    channel.waiting.includes(me);

  useEffect(() => {
    if (!channel || !nearbyHere) {
      seen.current = null;
      return;
    }
    // See the foreground note above: nothing is observed from the background,
    // so that the arrival is still there to be offered when the phone is
    // picked up.
    if (!foreground) return;
    const before =
      seen.current && seen.current.channelId === channel.id
        ? seen.current.present
        : null;
    seen.current = { channelId: channel.id, present: [...channel.present] };
    if (!somebodyArrived(before, channel.present, me)) return;
    // Worth a line in the audio log even though no audio moves: this is the
    // moment the design used to open a microphone, and a walk that finds the
    // offer missing needs to know whether the arrival was seen at all.
    recordEvent('nearby arrival offered');
    onArrival(channel.id, whoArrived(before, channel.present, me));
    // `present` rather than the view: a snapshot arrives for anything that
    // changes in the room, and only the roster can be an arrival.
  }, [channel, channel?.present, nearbyHere, foreground, me, onArrival]);
}
