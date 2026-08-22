import { useEffect, useRef } from 'react';
import type { ChannelState } from '../../../core/types';
import { buzz } from './cue';

/**
 * Buzzes the people in a channel when somebody turns up at the door.
 *
 * **Above the channel screen, like `useSilencedNudge`, and for the same
 * reason**: presence is not a screen. Walking back to Home leaves you in the
 * conversation, so a cue mounted inside `ChannelView` would go quiet for
 * exactly the people who are not looking — and a knock is a question addressed
 * to whoever is in the room, not to whoever happens to have the channel open.
 *
 * One buzz per knock, keyed on the id, so a snapshot arriving for any other
 * reason does not re-fire it — and two people arriving at once are two events
 * rather than one. Nothing fires for a knock that was already there when this
 * mounted: walking into a channel with somebody waiting is not the moment they
 * arrived, and a cue then would be reporting the past.
 *
 * The guest gets one too, when they are let in, and that one is not here —
 * it is `navigator.vibrate` on the page, where it exists at all. iOS Safari
 * does not implement it, so the phones most likely to open a guest link have
 * no equivalent of this.
 */
export function useKnockNudge(
  channel: ChannelState | null,
  fire: () => void = buzz
): void {
  const seen = useRef<Set<string> | null>(null);
  const channelId = channel?.id ?? null;
  const knocks = channel?.knocks ?? [];
  // The ids alone, as one string, so the effect re-runs when the queue changes
  // and not on every snapshot of a busy conversation.
  const ids = knocks.map((knock) => knock.id).join(',');

  useEffect(() => {
    // A fresh channel starts a fresh memory, and the queue it starts with is
    // taken as read rather than announced.
    if (seen.current === null || !seen.current.has(`#${channelId}`)) {
      seen.current = new Set([`#${channelId}`, ...ids.split(',')]);
      return;
    }
    for (const id of ids.split(',')) {
      if (!id || seen.current.has(id)) continue;
      seen.current.add(id);
      fire();
    }
  }, [channelId, ids, fire]);
}
