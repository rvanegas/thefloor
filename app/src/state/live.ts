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

/**
 * The channel this *device* is standing in, which is narrower than the one
 * above and is the fact most callers actually want.
 *
 * `liveChannelView` answers a question about the account, and the account is
 * present whether the room is held here, on the phone in their hand, or by a
 * process that has since been killed. One account has one voice, so a device
 * that has not entered has to hold no microphone whatever the roster says —
 * and reading the roster as though it described this device is what let a
 * second device join the audio of a channel it had only opened. See
 * `AppProvider.standingIn`.
 *
 * Nothing is live once the build is expired either, whatever the last snapshot
 * to arrive said. The provider has already hung the socket up; what follows
 * the channel rather than the socket — the audio, and now the mark on a
 * profile — would otherwise go on describing a conversation behind a screen
 * that says to update.
 *
 * The `standingIn` test subsumes the old `!displaced` clause rather than
 * sitting beside it: being displaced clears `standingIn`, because both are the
 * same fact.
 */
export function liveChannelHere(
  views: Record<string, ChannelView>,
  me: string,
  standingIn: string | null,
  expired: boolean
): ChannelView | null {
  const view = liveChannelView(views, me);
  if (!view || expired) return null;
  return view.channel.id === standingIn ? view : null;
}
