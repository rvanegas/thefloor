import { useEffect, useRef } from 'react';
import { isWithheld } from '../../../core/channel';
import type { ChannelState, UserId } from '../../../core/types';

/**
 * Tells the room you are talking while it is withholding you.
 *
 * **The media plane cannot carry this, which is the whole reason the hook
 * exists.** Withholding is done by unsubscribing every listener from the
 * withheld speaker — never by muting them, see `Channels.assertSilence` — and
 * LiveKit scopes its speaker updates to what a listener is subscribed to. So
 * the instant a claim lands, every other device stops being told anything
 * about the people it has stopped hearing, and their indicators freeze at
 * whatever was true a moment before. The one participant the SFU still reports
 * a withheld speaker to is that speaker, so this device is the only one in a
 * position to say, and it says over the socket rather than over the room.
 *
 * **Held above the channel screen, in `App.tsx`, for `useSilencedNudge`'s
 * reason**: presence is not a screen, and somebody talking into a claim from
 * Home is the same fact as somebody doing it with the channel open. It follows
 * the channel you are *present in*, as the audio does.
 *
 * **What is sent is the smoothed signal**, the same `audio.speaking` the
 * indicator draws from — see `speaking.ts`. Sending the raw active-speaker
 * edges would put a message on the socket for every pause in a sentence, and
 * would hand the far end a signal it would then have to smooth for itself with
 * a second copy of the rules. As it is, talking through a whole claim costs
 * two messages.
 */
export function useSpeakingReport(
  channel: ChannelState | null,
  me: UserId,
  speaking: readonly string[],
  report: (channelId: string, speaking: boolean) => void
): void {
  const channelId = channel?.id ?? null;
  // `isWithheld` rather than `isSilenced`: a watch party's room-wide mute
  // withholds by the same mechanism and leaves the same hole, so it is the
  // same report. See core/channel.ts.
  const talking = !!channel && isWithheld(channel, me) && speaking.includes(me);

  /**
   * The sender, held so that its identity cannot re-run the effect.
   *
   * It arrives from the provider's context object, which is rebuilt on every
   * state change — so listing it as a dependency would send a stop and a start
   * every time anything at all happened while somebody was talking into a
   * claim.
   */
  const send = useRef(report);
  send.current = report;

  /**
   * One effect, and the cleanup is the stop.
   *
   * React runs the cleanup before the next effect, so a person who is talking
   * as they move between rooms reports a stop to the one they left and a start
   * to the one they arrived in, in that order, without either being written
   * out here. Unmounting reports a stop for the same reason, which is what
   * covers the app going away while somebody is mid-word.
   */
  useEffect(() => {
    if (!channelId || !talking) return;
    send.current(channelId, true);
    return () => send.current(channelId, false);
  }, [channelId, talking]);
}
