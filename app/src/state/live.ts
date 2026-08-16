import type { ChannelView } from '../../../core/protocol';

/**
 * The channel this person is actually standing in, chosen from every snapshot
 * the app is holding.
 *
 * Presence is the server's answer, not the app's: this reads it off the
 * snapshots rather than deciding anything. What it exists to prevent is
 * reading it off *one* snapshot — the app watches several channels at once and
 * used to keep only the last one to arrive, so a change in a channel nobody
 * was looking at could answer this question about somewhere else entirely, and
 * the audio would hang up on a live conversation. See AppProvider.
 *
 * The server permits presence in one channel at a time and steps you out of
 * the others when you enter one, so at most one snapshot should match. Two can
 * still be held here for a moment, because a snapshot is only as new as the
 * last time that channel changed: the one saying you left may not have been
 * sent yet. The newest wins, which is the one that knows about the move.
 */
export function liveChannelView(
  views: Record<string, ChannelView>,
  me: string
): ChannelView | null {
  let live: ChannelView | null = null;
  for (const view of Object.values(views)) {
    if (view.channel.status !== 'active') continue;
    if (!view.channel.present.includes(me)) continue;
    if (!live || view.serverNow > live.serverNow) live = view;
  }
  return live;
}
