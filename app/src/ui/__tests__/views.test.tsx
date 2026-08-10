import React from 'react';
import renderer, {
  act,
  type ReactTestInstance,
  type ReactTestRenderer,
} from 'react-test-renderer';
import { createChannel, reduce } from '../../../../core/channel';
import type { ChannelState } from '../../../../core/types';
import type { HomeView as HomeViewData } from '../../../../core/protocol';
import { HomeView } from '../HomeView';
import { ChannelView } from '../ChannelView';

/**
 * The views now render server snapshots rather than driving a local model, so
 * these feed them protocol-shaped data directly. That also pins the views to
 * the real protocol types: a change on the server that the client has not kept
 * up with fails here rather than on a phone.
 */

const ME = 'acct_me';
const THEM = 'acct_them';
const NOW = 1_700_000_000_000;

const mockApp = {
  ready: true,
  token: 'token',
  me: { id: ME, displayName: 'Me' },
  home: null as HomeViewData | null,
  channelView: null as { channel: ChannelState; participants: Array<{ id: string; displayName: string }>; serverNow: number } | null,
  status: 'open' as 'open' | 'connecting' | 'closed',
  lastError: null,
  serverNow: () => NOW,
  requestCode: jest.fn(),
  verify: jest.fn(),
  signOut: jest.fn(),
  requestContact: jest.fn(),
  acceptContact: jest.fn(),
  declineContact: jest.fn(),
  startChannel: jest.fn(),
  watchChannel: jest.fn(),
  leaveChannelView: jest.fn(),
  act: jest.fn(),
  clearError: jest.fn(),
  dismissedInvites: [] as string[],
  dismissInvite: jest.fn((channelId: string) => {
    mockApp.dismissedInvites = [...mockApp.dismissedInvites, channelId];
  }),
};

// The views are rendered without a native audio stack: @livekit/react-native
// ships untranspiled ESM, and more importantly a render test has no business
// opening a microphone. Audio behaviour is verified on a device, not here.
jest.mock('../../api/download', () => ({
  exportRecording: jest.fn(async () => {}),
}));

jest.mock('../../audio/useSessionAudio', () => ({
  useSessionAudio: () => ({
    status: 'idle',
    message: null,
    mutedByServer: false,
    othersAudible: 0,
  }),
}));

jest.mock('../../state/AppProvider', () => ({
  useApp: () => mockApp,
  AppProvider: ({ children }: { children: React.ReactNode }) => children,
}));

function textOf(tree: ReactTestRenderer): string {
  const strings: string[] = [];
  const walk = (node: unknown): void => {
    if (typeof node === 'string') strings.push(node);
    else if (Array.isArray(node)) node.forEach(walk);
    else if (node && typeof node === 'object' && 'children' in node) {
      walk((node as { children: unknown }).children);
    }
  };
  walk(tree.toJSON());
  return strings.join(' ');
}

/** The visible text inside one instance, used to identify a button by label. */
function labelOf(instance: ReactTestInstance): string {
  const out: string[] = [];
  const walk = (node: unknown): void => {
    if (typeof node === 'string') out.push(node);
    else if (Array.isArray(node)) node.forEach(walk);
    else if (node && typeof node === 'object') {
      const props = (node as { props?: { children?: unknown } }).props;
      if (props?.children !== undefined) walk(props.children);
    }
  };
  walk(instance.props.children);
  return out.join(' ');
}

function findButton(
  tree: ReactTestRenderer,
  label: string
): ReactTestInstance | undefined {
  return tree.root
    .findAll((n) => n.props?.accessibilityRole === 'button')
    .find((n) => labelOf(n).includes(label));
}

/**
 * The text of every rendered link. Host nodes only — `findAll` matches both the
 * composite component and its host element, so an unfiltered search counts one
 * link twice.
 */
function linksIn(tree: ReactTestRenderer): string[] {
  return tree.root
    .findAll(
      (n) => typeof n.type === 'string' && n.props?.accessibilityRole === 'link'
    )
    .map(labelOf);
}

function render(element: React.ReactElement): ReactTestRenderer {
  let tree!: ReactTestRenderer;
  act(() => {
    tree = renderer.create(element);
  });
  return tree;
}

function channelOf(mutate: (s: ChannelState) => ChannelState = (s) => s) {
  const base = createChannel({
    id: 'sess_1',
    initiator: ME,
    invitees: [THEM],
    now: NOW,
  });
  return mutate(reduce(base, { type: 'ENTER', userId: THEM }, NOW));
}

function showChannel(channel: ChannelState) {
  const names: Record<string, string> = {
    [ME]: 'Me',
    [THEM]: 'Dana Chu',
    acct_3: 'Miro Okafor',
    acct_4: 'Priya Raman',
  };
  mockApp.channelView = {
    channel,
    participants: channel.participants.map((id) => ({
      id,
      displayName: names[id] ?? id,
    })),
    serverNow: NOW,
  };
}

beforeEach(() => {
  mockApp.home = null;
  mockApp.channelView = null;
  mockApp.status = 'open';
  mockApp.dismissedInvites = [];
  jest.clearAllMocks();
});

describe('Home', () => {
  it('renders contacts, invites and rejoinable channels from a snapshot', () => {
    mockApp.home = {
      invites: [
        {
          channelId: 'sess_a',
          from: { id: THEM, displayName: 'Dana Chu' },
          createdAt: NOW,
        },
      ],
      rejoinable: [
        {
          channelId: 'sess_b',
          name: null,
          others: [{ id: 'acct_x', displayName: 'Miro Okafor' }],
          presentCount: 1,
          createdAt: NOW,
        },
      ],
      contacts: [
        { account: { id: 'acct_p', displayName: 'Priya Raman' }, status: 'incoming' },
        { account: { id: 'acct_q', displayName: 'Quinn Ito' }, status: 'accepted' },
      ],
      recordings: [],
    };

    const tree = render(<HomeView onEnterChannel={() => {}} />);
    const text = textOf(tree);
    expect(text).toContain('tap to join');
    expect(text).toContain('Miro Okafor');
    expect(text).toContain('1 present — you left');
    expect(text).toContain('Priya Raman');
    expect(text).toContain('Accept');
    expect(text).toContain('Quinn Ito');
    expect(text).toContain('Start channel');
    act(() => tree.unmount());
  });

  it('offers an export for each past recording', async () => {
    const { exportRecording } = require('../../api/download');
    mockApp.home = {
      invites: [],
      rejoinable: [],
      contacts: [],
      recordings: [
        {
          id: 'rec_1',
          channelId: 'sess_1',
          others: [{ id: THEM, displayName: 'Dana Chu' }],
          startedAt: NOW,
          durationMs: 92_000,
        },
      ],
    };

    const tree = render(<HomeView onEnterChannel={() => {}} />);
    expect(textOf(tree)).toContain('1:32');

    const button = findButton(tree, 'Export');
    expect(button).toBeDefined();
    await act(async () => button!.props.onPress());
    expect(exportRecording).toHaveBeenCalledWith('token', 'rec_1', 'Dana Chu');
    act(() => tree.unmount());
  });

  it('does not offer to start a channel that has already begun', () => {
    // A pair has at most one channel. When it exists, the invite above is the
    // way in, and the contact row must not offer to start a second.
    mockApp.home = {
      invites: [
        {
          channelId: 'sess_a',
          from: { id: THEM, displayName: 'Dana Chu' },
          createdAt: NOW,
        },
      ],
      rejoinable: [],
      contacts: [
        { account: { id: THEM, displayName: 'Dana Chu' }, status: 'accepted' },
      ],
      recordings: [],
    };

    const tree = render(<HomeView onEnterChannel={() => {}} />);
    expect(findButton(tree, 'Start channel')).toBeUndefined();
    expect(textOf(tree)).toContain('Channel already open');
    expect(textOf(tree)).toContain('tap to join');
    act(() => tree.unmount());
  });

  it('does not offer to start one you have left either', () => {
    mockApp.home = {
      invites: [],
      rejoinable: [
        {
          channelId: 'sess_b',
          name: null,
          others: [{ id: THEM, displayName: 'Dana Chu' }],
          presentCount: 1,
          createdAt: NOW,
        },
      ],
      contacts: [
        { account: { id: THEM, displayName: 'Dana Chu' }, status: 'accepted' },
      ],
      recordings: [],
    };

    const tree = render(<HomeView onEnterChannel={() => {}} />);
    expect(findButton(tree, 'Start channel')).toBeUndefined();
    expect(textOf(tree)).toContain('Channel already open');
    act(() => tree.unmount());
  });

  it('offers to join, not start, once the invite has been dismissed', () => {
    // Dismissing the banner removes the only other way in. Suppressing the
    // contact row as well would leave no route to a channel that still exists.
    mockApp.home = {
      invites: [
        {
          channelId: 'sess_a',
          from: { id: THEM, displayName: 'Dana Chu' },
          createdAt: NOW,
        },
      ],
      rejoinable: [],
      contacts: [
        { account: { id: THEM, displayName: 'Dana Chu' }, status: 'accepted' },
      ],
      recordings: [],
    };

    const tree = render(<HomeView onEnterChannel={() => {}} />);
    const [dismiss] = tree.root.findAll(
      (n: ReactTestInstance) => n.props?.accessibilityLabel === 'Dismiss invite'
    );
    expect(dismiss).toBeDefined();
    act(() => dismiss.props.onPress());
    expect(mockApp.dismissInvite).toHaveBeenCalledWith('sess_a');

    // Dismissal lives in the provider now, so re-render with it applied.
    act(() => tree.update(<HomeView onEnterChannel={() => {}} />));
    expect(findButton(tree, 'Start channel')).toBeUndefined();
    expect(findButton(tree, 'Join channel')).toBeDefined();
    act(() => tree.unmount());
  });

  it('still offers to start when there is no channel yet', () => {
    mockApp.home = {
      invites: [],
      rejoinable: [],
      contacts: [
        { account: { id: THEM, displayName: 'Dana Chu' }, status: 'accepted' },
      ],
      recordings: [],
    };
    const tree = render(<HomeView onEnterChannel={() => {}} />);
    expect(findButton(tree, 'Start channel')).toBeDefined();
    expect(textOf(tree)).not.toContain('Channel already open');
    act(() => tree.unmount());
  });

  it('keeps an invite dismissed across leaving Home and coming back', () => {
    // The defect: the dismissed list was component state, so navigating into a
    // channel and back re-raised a banner the user had already acted on. A
    // dismissal that forgets itself is not a dismissal.
    mockApp.home = {
      invites: [
        {
          channelId: 'sess_a',
          from: { id: THEM, displayName: 'Dana Chu' },
          createdAt: NOW,
        },
      ],
      rejoinable: [],
      contacts: [],
      recordings: [],
    };

    const first = render(<HomeView onEnterChannel={() => {}} />);
    const [dismiss] = first.root.findAll(
      (n: ReactTestInstance) => n.props?.accessibilityLabel === 'Dismiss invite'
    );
    act(() => dismiss.props.onPress());
    act(() => first.unmount());

    // Home is mounted afresh, as it is on returning from a channel.
    const second = render(<HomeView onEnterChannel={() => {}} />);
    expect(textOf(second)).not.toContain('tap to join');
    act(() => second.unmount());
  });

  it('raises a new banner when the same contact invites again', () => {
    // Dismissal is permanent for that invitation and no longer. A pair has at
    // most one live channel, so a fresh invite is a different channel id.
    mockApp.dismissedInvites = ['sess_a'];
    mockApp.home = {
      invites: [
        {
          channelId: 'sess_b',
          from: { id: THEM, displayName: 'Dana Chu' },
          createdAt: NOW,
        },
      ],
      rejoinable: [],
      contacts: [],
      recordings: [],
    };

    const tree = render(<HomeView onEnterChannel={() => {}} />);
    expect(textOf(tree)).toContain('tap to join');
    act(() => tree.unmount());
  });

  it('lists an invite to a stranger like any other sent request', () => {
    // Outgoing requests carry no account id and show the address rather than a
    // name, so one to somebody who has not signed up is indistinguishable.
    mockApp.home = {
      invites: [],
      rejoinable: [],
      contacts: [
        { account: { id: '', displayName: 'nobody@example.com' }, status: 'outgoing' },
        { account: { id: '', displayName: 'real@example.com' }, status: 'outgoing' },
      ],
      recordings: [],
    };

    const tree = render(<HomeView onEnterChannel={() => {}} />);
    const text = textOf(tree);
    expect(text).toContain('nobody@example.com');
    expect(text).toContain('real@example.com');
    expect(text).toContain('Sent');
    // Neither offers a channel, and neither can be accepted.
    expect(findButton(tree, 'Start channel')).toBeUndefined();
    expect(findButton(tree, 'Accept')).toBeUndefined();
    act(() => tree.unmount());
  });

  it('says so when the connection is down', () => {
    mockApp.home = { invites: [], rejoinable: [], contacts: [], recordings: [] };
    mockApp.status = 'closed';
    const tree = render(<HomeView onEnterChannel={() => {}} />);
    expect(textOf(tree)).toContain('Not connected');
    act(() => tree.unmount());
  });
});

describe('Channel', () => {
  it('waits rather than rendering a stale screen before the first snapshot', () => {
    const tree = render(<ChannelView channelId="sess_1" onExit={() => {}} />);
    expect(textOf(tree)).toContain('Loading channel');
    expect(mockApp.watchChannel).toHaveBeenCalledWith('sess_1');
    act(() => tree.unmount());
  });

  it('shows the claim control when eligible', () => {
    showChannel(channelOf());
    const tree = render(<ChannelView channelId="sess_1" onExit={() => {}} />);
    const text = textOf(tree);
    expect(text).toContain('Dana Chu');
    expect(text).toContain('Nobody has the floor');
    expect(text).toContain('Claim the floor');
    act(() => tree.unmount());
  });

  it('says plainly that a silenced user is still being recorded', () => {
    // Being unheard is easily mistaken for being unrecorded, and someone might
    // speak freely on that assumption. The capture is complete; only the export
    // omits them.
    let channel = channelOf((s) =>
      reduce(s, { type: 'CLAIM_FLOOR', userId: THEM }, NOW)
    );
    channel = reduce(channel, { type: 'START_RECORDING', userId: THEM, runId: 'rec_1' }, NOW);
    showChannel(channel);

    const tree = render(<ChannelView channelId="sess_1" onExit={() => {}} />);
    const text = textOf(tree);
    expect(text).toContain('still being recorded');
    expect(text).toContain('left out of the exported recording');
    act(() => tree.unmount());
  });

  it('says a recording failed rather than showing it as never started', () => {
    // Silence about this is the specific fault: the indicator promised audio
    // was being kept while nothing was captured at all.
    let channel = channelOf();
    channel = {
      ...channel,
      recording: {
        ...channel.recording,
        failure: 'no supported codec is compatible with all outputs',
      },
    };
    showChannel(channel);

    const tree = render(<ChannelView channelId="sess_1" onExit={() => {}} />);
    const text = textOf(tree);
    expect(text).toContain('Recording failed');
    expect(text).toContain('no supported codec');
    // And it can be attempted again — a failure must not consume the channel's
    // one recording.
    expect(findButton(tree, 'Try recording again')).toBeDefined();
    act(() => tree.unmount());
  });

  it('shows a disconnected party as present but reconnecting', () => {
    // Not "left": they are still in the channel, still hold whatever they
    // hold, and have a minute to come back.
    const channel = channelOf();
    showChannel({ ...channel, disconnectedAt: { [THEM]: NOW - 5_000 } });

    const tree = render(<ChannelView channelId="sess_1" onExit={() => {}} />);
    const text = textOf(tree);
    expect(text).toContain('Present · reconnecting…');
    expect(text).not.toContain('Left the channel');
    act(() => tree.unmount());
  });

  it('reflects being silenced by the other party', () => {
    showChannel(
      channelOf((s) => reduce(s, { type: 'CLAIM_FLOOR', userId: THEM }, NOW))
    );
    const tree = render(<ChannelView channelId="sess_1" onExit={() => {}} />);
    const text = textOf(tree);
    expect(text).toContain('Dana Chu has the floor — your mic is cut');
    expect(text).toContain('cannot claim the floor while you are silenced');
    act(() => tree.unmount());
  });

  it('counts down against the server clock, not the device clock', () => {
    const claimed = channelOf((s) =>
      reduce(s, { type: 'CLAIM_FLOOR', userId: ME }, NOW)
    );
    showChannel(claimed);
    // Device clock is irrelevant; serverNow decides. 40s into a 3:00 claim.
    mockApp.serverNow = () => NOW + 40_000;
    const tree = render(<ChannelView channelId="sess_1" onExit={() => {}} />);
    expect(textOf(tree)).toContain('2:20');
    mockApp.serverNow = () => NOW;
    act(() => tree.unmount());
  });

  it('dispatches a claim rather than mutating anything locally', () => {
    showChannel(channelOf());
    const tree = render(<ChannelView channelId="sess_1" onExit={() => {}} />);
    const claim = findButton(tree, 'Claim the floor');
    expect(claim).toBeDefined();
    expect(claim!.props.accessibilityState.disabled).toBe(false);
    act(() => claim!.props.onPress());
    expect(mockApp.act).toHaveBeenCalledWith('sess_1', { type: 'CLAIM_FLOOR' });
    act(() => tree.unmount());
  });

  it('offers to load a track when there is none', () => {
    showChannel(channelOf());
    const tree = render(<ChannelView channelId="sess_1" onExit={() => {}} />);
    expect(findButton(tree, 'Play something together')).toBeDefined();
    act(() => tree.unmount());
  });

  it('shows the track and its position against the server clock', () => {
    showChannel(
      channelOf((s) => {
        const withTrack = reduce(
          s,
          {
            type: 'SET_TRACK',
            userId: ME,
            track: { id: 'trk_1', title: 'Kind of Blue', durationMs: 120_000 },
          },
          NOW
        );
        return reduce(withTrack, { type: 'PLAY', userId: ME }, NOW);
      })
    );
    mockApp.serverNow = () => NOW + 30_000;
    const tree = render(<ChannelView channelId="sess_1" onExit={() => {}} />);
    const text = textOf(tree);
    expect(text).toContain('Kind of Blue');
    expect(text).toContain('0:30');
    expect(text).toContain('2:00');
    expect(findButton(tree, 'Pause')).toBeDefined();
    mockApp.serverNow = () => NOW;
    act(() => tree.unmount());
  });

  /**
   * The mechanic, at the point where it is visible: the other party's claim
   * takes the controls away without taking the music away.
   */
  it('disables the controls, but not playback, while they hold the floor', () => {
    showChannel(
      channelOf((s) => {
        const withTrack = reduce(
          s,
          {
            type: 'SET_TRACK',
            userId: ME,
            track: { id: 'trk_1', title: 'Kind of Blue', durationMs: 120_000 },
          },
          NOW
        );
        const playing = reduce(withTrack, { type: 'PLAY', userId: ME }, NOW);
        return reduce(playing, { type: 'CLAIM_FLOOR', userId: THEM }, NOW);
      })
    );
    const tree = render(<ChannelView channelId="sess_1" onExit={() => {}} />);

    expect(textOf(tree)).toContain('Dana Chu has the floor, so they decide what plays');
    expect(findButton(tree, 'Pause')!.props.accessibilityState.disabled).toBe(
      true
    );
    expect(findButton(tree, '+15s')!.props.accessibilityState.disabled).toBe(
      true
    );
    expect(findButton(tree, 'Louder')!.props.accessibilityState.disabled).toBe(
      true
    );
    act(() => tree.unmount());
  });

  it('seeks by dispatching a position rather than moving anything locally', () => {
    showChannel(
      channelOf((s) =>
        reduce(
          s,
          {
            type: 'SET_TRACK',
            userId: ME,
            track: { id: 'trk_1', title: 'Kind of Blue', durationMs: 120_000 },
          },
          NOW
        )
      )
    );
    const tree = render(<ChannelView channelId="sess_1" onExit={() => {}} />);
    act(() => findButton(tree, '+15s')!.props.onPress());
    expect(mockApp.act).toHaveBeenCalledWith('sess_1', {
      type: 'SEEK',
      positionMs: 15_000,
    });
    act(() => tree.unmount());
  });

  it('warns that a dropped connection counts as leaving', () => {
    showChannel(channelOf());
    mockApp.status = 'connecting';
    const tree = render(<ChannelView channelId="sess_1" onExit={() => {}} />);
    expect(textOf(tree)).toContain('dropped connection counts as leaving');
    act(() => tree.unmount());
  });

  it('renders a roster and generalised copy with four people', () => {
    let channel = createChannel({
      id: 'sess_1',
      initiator: ME,
      invitees: [THEM, 'acct_3', 'acct_4'],
      now: NOW,
    });
    channel = reduce(channel, { type: 'ENTER', userId: THEM }, NOW);
    channel = reduce(channel, { type: 'ENTER', userId: 'acct_3' }, NOW);
    channel = reduce(channel, { type: 'CLAIM_FLOOR', userId: 'acct_3' }, NOW);
    showChannel(channel);

    const tree = render(<ChannelView channelId="sess_1" onExit={() => {}} />);
    const text = textOf(tree);
    expect(text).toContain('4 people');
    expect(text).toContain('Dana Chu');
    expect(text).toContain('Miro Okafor');
    expect(text).toContain('Priya Raman');
    // acct_4 was invited and has never entered.
    expect(text).toContain('Waiting for them to join…');
    // The holder is named wherever the claim bites.
    expect(text).toContain('Miro Okafor has the floor — your mic is cut');
    expect(text).toContain("Silenced by Miro Okafor's floor claim.");
    act(() => tree.unmount());
  });

  it('offers to invite an accepted contact who is not in the channel', () => {
    mockApp.home = {
      invites: [],
      rejoinable: [],
      recordings: [],
      contacts: [
        { account: { id: 'acct_3', displayName: 'Miro Okafor' }, status: 'accepted' },
      ],
    };
    showChannel(channelOf());
    const tree = render(<ChannelView channelId="sess_1" onExit={() => {}} />);
    const invite = findButton(tree, 'Invite');
    expect(invite).toBeDefined();
    act(() => invite!.props.onPress());
    expect(mockApp.act).toHaveBeenCalledWith('sess_1', {
      type: 'INVITE',
      contactId: 'acct_3',
    });
    act(() => tree.unmount());
  });

  it('offers stepping out and leaving as two different acts', () => {
    showChannel(channelOf());
    const tree = render(<ChannelView channelId="sess_1" onExit={() => {}} />);

    const stepOut = findButton(tree, 'Step out');
    expect(stepOut).toBeDefined();
    expect(labelOf(stepOut!)).toContain('You stay a member');
    act(() => stepOut!.props.onPress());
    expect(mockApp.act).toHaveBeenCalledWith('sess_1', { type: 'STEP_OUT' });

    // Leaving is behind a confirmation, so the tap alone dispatches nothing.
    const leave = findButton(tree, 'Leave channel');
    expect(leave).toBeDefined();
    expect(labelOf(leave!)).toContain('Removes it from Home');
    expect(mockApp.act).not.toHaveBeenCalledWith('sess_1', {
      type: 'LEAVE_CHANNEL',
    });
    act(() => tree.unmount());
  });

  it('warns the last member that leaving deletes the channel', () => {
    // With two people it merely removes you. Alone, the same tap destroys it,
    // and nothing else on screen would say so.
    showChannel(
      channelOf((s) => reduce(s, { type: 'LEAVE_CHANNEL', userId: THEM }, NOW))
    );
    const tree = render(<ChannelView channelId="sess_1" onExit={() => {}} />);
    expect(labelOf(findButton(tree, 'Leave channel')!)).toContain(
      'Deletes this channel'
    );
    act(() => tree.unmount());
  });

  it('no longer counts elapsed time', () => {
    // A channel is permanent, so time since it was created says nothing.
    showChannel(channelOf());
    const tree = render(<ChannelView channelId="sess_1" onExit={() => {}} />);
    expect(textOf(tree)).not.toContain('elapsed');
    act(() => tree.unmount());
  });

  it('renders the ended state', () => {
    // Both members leave, which is the only thing that ends a channel.
    showChannel(
      channelOf((s) => {
        const half = reduce(s, { type: 'LEAVE_CHANNEL', userId: THEM }, NOW);
        return reduce(half, { type: 'LEAVE_CHANNEL', userId: ME }, NOW);
      })
    );
    const tree = render(<ChannelView channelId="sess_1" onExit={() => {}} />);
    expect(textOf(tree)).toContain('Channel ended');
    act(() => tree.unmount());
  });

  it('shows the channel name as the header, with the roster kept below', () => {
    showChannel(
      channelOf((s) =>
        reduce(s, { type: 'SET_NAME', userId: THEM, name: 'Book club' }, NOW)
      )
    );
    const tree = render(<ChannelView channelId="sess_1" onExit={() => {}} />);
    const text = textOf(tree);
    expect(text).toContain('Book club');
    // Under a channel name the status line is the only place the other
    // party's name appears, so it must carry it even in a 1:1.
    expect(text).toContain('Dana Chu · ');
    act(() => tree.unmount());
  });

  it('renders the description under the title, above the roster', () => {
    showChannel(
      channelOf((s) =>
        reduce(
          s,
          {
            type: 'SET_DESCRIPTION',
            userId: THEM,
            description: 'Reading **Dune**, see [notes](https://example.com).',
          },
          NOW
        )
      )
    );
    const tree = render(<ChannelView channelId="sess_1" onExit={() => {}} />);
    const text = textOf(tree);
    // The markup is gone and the words remain.
    expect(text).toContain('Reading');
    expect(text).toContain('Dune');
    expect(text).toContain('notes');
    expect(text).not.toContain('**Dune**');
    expect(text).not.toContain('https://example.com');

    // The link is a link, and the roster still follows it. Host nodes only:
    // findAll matches the composite and the host element for one <Text>.
    expect(linksIn(tree)).toEqual(['notes']);
    expect(text).toContain('Dana Chu');
    act(() => tree.unmount());
  });

  it('shows nothing where the description would be when there is none', () => {
    showChannel(channelOf());
    const tree = render(<ChannelView channelId="sess_1" onExit={() => {}} />);
    expect(linksIn(tree)).toEqual([]);
    act(() => tree.unmount());
  });

  it('edits the description in settings, with a preview', () => {
    showChannel(channelOf());
    const tree = render(<ChannelView channelId="sess_1" onExit={() => {}} />);
    act(() => findButton(tree, 'Settings')!.props.onPress());

    const field = tree.root.findAll(
      (n) => n.props?.placeholder === 'Links, a reading list, what this is for…'
    )[0];
    act(() => field.props.onChangeText('See [notes](https://notes.example)'));

    // The preview renders it, so nobody has to save to find out what it
    // becomes. A URL of its own, because the card's help text quotes
    // example.com as an illustration and would match either way.
    expect(textOf(tree)).toContain('Preview');
    expect(textOf(tree)).not.toContain('](https://notes.example)');
    expect(linksIn(tree)).toContain('notes');

    act(() => findButton(tree, 'Save description')!.props.onPress());
    expect(mockApp.act).toHaveBeenCalledWith('sess_1', {
      type: 'SET_DESCRIPTION',
      description: 'See [notes](https://notes.example)',
    });
    act(() => tree.unmount());
  });

  it('opens settings, and saving a name dispatches SET_NAME', () => {
    showChannel(channelOf());
    const tree = render(<ChannelView channelId="sess_1" onExit={() => {}} />);

    const settings = findButton(tree, 'Settings');
    expect(settings).toBeDefined();
    act(() => settings!.props.onPress());
    expect(textOf(tree)).toContain('Channel settings');

    const field = tree.root.findAll(
      (n) => n.props?.placeholder === 'What is this channel about?'
    )[0];
    act(() => field.props.onChangeText('Book club'));
    act(() => findButton(tree, 'Save')!.props.onPress());
    expect(mockApp.act).toHaveBeenCalledWith('sess_1', {
      type: 'SET_NAME',
      name: 'Book club',
    });
    // Saving returns to the channel.
    expect(textOf(tree)).toContain('The floor');
    act(() => tree.unmount());
  });
});
