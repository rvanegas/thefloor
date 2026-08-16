import { createChannel, reduce } from '../../../../core/channel';
import type { ChannelState } from '../../../../core/types';
import type { ChannelView } from '../../../../core/protocol';
import { liveChannelView } from '../live';

/**
 * The app watches more than one channel at a time and holds a snapshot of
 * each. Which of them the person is standing in has to be answered by looking
 * at all of them.
 *
 * The bug this covers: the app kept a single snapshot, so the last one to
 * arrive answered this question whatever channel it was about. A change in a
 * channel nobody was looking at — somebody else stepping into one you had
 * visited earlier — therefore said "you are not present anywhere", and the
 * audio hung up in the middle of a conversation. Seen in production on
 * 2026-08-16 with two named channels open.
 */

const ME = 'acct_me';
const THEM = 'acct_them';
const T0 = 1_700_000_000_000;

/**
 * A channel of ME and THEM in which exactly `present` are standing. Creating
 * one already puts its initiator there, so this both enters and steps out —
 * asserting the roster rather than assuming a starting point.
 */
function channelWith(id: string, present: string[]): ChannelState {
  let channel = createChannel({
    id,
    initiator: ME,
    invitees: [THEM],
    now: T0,
  });
  for (const userId of [ME, THEM]) {
    const wanted = present.includes(userId);
    if (wanted === channel.present.includes(userId)) continue;
    channel = reduce(
      channel,
      { type: wanted ? 'ENTER' : 'STEP_OUT', userId },
      T0
    );
  }
  expect([...channel.present].sort()).toEqual([...present].sort());
  return channel;
}

function viewOf(channel: ChannelState, serverNow = T0): ChannelView {
  return {
    channel,
    participants: [
      { id: ME, displayName: 'Me' },
      { id: THEM, displayName: 'Dana' },
    ],
    recordings: [],
    serverNow,
  };
}

describe('liveChannelView', () => {
  it('finds the channel you are in among several watched', () => {
    const here = viewOf(channelWith('chan_here', [ME, THEM]));
    const elsewhere = viewOf(channelWith('chan_elsewhere', [THEM]));
    const live = liveChannelView(
      { chan_elsewhere: elsewhere, chan_here: here },
      ME
    );
    expect(live?.channel.id).toBe('chan_here');
  });

  it('is unmoved by a snapshot for a channel you are only watching', () => {
    const here = viewOf(channelWith('chan_here', [ME, THEM]));
    const views: Record<string, ChannelView> = { chan_here: here };
    expect(liveChannelView(views, ME)?.channel.id).toBe('chan_here');

    // Somebody steps into the other channel, which pushes its snapshot to
    // everyone watching it — including us, who are talking somewhere else.
    views.chan_elsewhere = viewOf(
      channelWith('chan_elsewhere', [THEM]),
      T0 + 1000
    );
    expect(liveChannelView(views, ME)?.channel.id).toBe('chan_here');
  });

  it('believes the newer snapshot when two claim you', () => {
    // Which happens for a moment after moving between channels: the one you
    // left has not been re-sent yet, so it still says you are there.
    const stale = viewOf(channelWith('chan_old', [ME, THEM]), T0);
    const fresh = viewOf(channelWith('chan_new', [ME, THEM]), T0 + 5000);
    expect(
      liveChannelView({ chan_old: stale, chan_new: fresh }, ME)?.channel.id
    ).toBe('chan_new');
  });

  it('is nowhere when you are present in none of them', () => {
    const one = viewOf(channelWith('chan_one', [THEM]));
    expect(liveChannelView({ chan_one: one }, ME)).toBeNull();
    expect(liveChannelView({}, ME)).toBeNull();
  });

  it('ignores an ended channel you were standing in', () => {
    const ended = channelWith('chan_ended', [ME, THEM]);
    const view = viewOf({ ...ended, status: 'ended', endedAt: T0 });
    expect(liveChannelView({ chan_ended: view }, ME)).toBeNull();
  });
});
