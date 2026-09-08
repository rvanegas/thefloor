import { useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import type { ChannelView } from '../../../core/protocol';
import { recordEvent } from '../audio/diagnostics';
import { somebodyArrived } from './nearby';

/**
 * Steps a nearby phone in when somebody arrives.
 *
 * The rule and its reasoning are in `nearby.ts`; this is the wiring. Three
 * conditions, and each is doing work:
 *
 * - **This device declared it.** `nearbyIn` is the device's own record, set
 *   where the action is sent, and it is why the *inferred* kind does not
 *   promote: somebody filed under `waiting` because their socket went is
 *   somebody whose app is not running to notice anything. A second device
 *   watching that person's channel must not step them in on the strength of a
 *   wait their other phone is in the middle of.
 * - **The server agrees.** `waiting` is read back from the snapshot rather than
 *   assumed from `nearbyIn`, so a declaration the server refused, or one that
 *   has since lapsed to *Stepped out*, promotes nobody.
 * - **The foreground.** iOS will not grant a backgrounded app a *new*
 *   microphone — measured on build 146, four minutes with no engine start — so
 *   a promotion attempted from a pocket would connect to the room and stay
 *   silent. The design only ever asks for it where it can be granted. In the
 *   background others see *Nearby* and may ping, which is the whole of what
 *   nearby promises there.
 *
 * **It needs a snapshot to act on, so it acts on the channel being watched.**
 * The arrival comes over the ordinary websocket in channel state, which a
 * nearby phone is still receiving — nothing here needs the media room, which is
 * what nearby has no subscription to. What it does need is for that channel to
 * be one this app is watching, which is the channel whose screen is open. That
 * is where both buttons are.
 */
export function useNearby(
  view: ChannelView | null,
  me: string,
  nearbyIn: string | null,
  act: (channelId: string, action: { type: 'ENTER' }) => void
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
    // **Nothing is observed from the background, deliberately.** A promotion
    // cannot be acted on there, and recording the roster anyway would consume
    // the arrival: the app would come forward with the new person already
    // counted as *seen*, and the promotion the design promises at the
    // foreground would never fire. So the last thing seen on screen is held,
    // and the comparison happens when there is something that can be done
    // about it.
    if (!foreground) return;
    const before =
      seen.current && seen.current.channelId === channel.id
        ? seen.current.present
        : null;
    seen.current = { channelId: channel.id, present: [...channel.present] };
    if (!somebodyArrived(before, channel.present, me)) return;
    // Worth a line for the reason every other line in the audio log is: this
    // is the app deciding to take a microphone without anybody touching the
    // phone, and it is the one transition in the design that nobody performs.
    recordEvent('promoted from nearby');
    act(channel.id, { type: 'ENTER' });
    // `present` rather than the view: a snapshot arrives for anything that
    // changes in the room, and only the roster can promote.
  }, [channel, channel?.present, nearbyHere, foreground, me, act]);
}
