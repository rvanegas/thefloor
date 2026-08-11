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
import { ProfileView } from '../ProfileView';
import { HomeSettingsView } from '../HomeSettingsView';
import { StyleSheet } from 'react-native';
import { colors } from '../theme';

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
  // Answers for whoever is asked about, as the server does — a mock that
  // returns one person regardless would hide a component reading the wrong id.
  loadProfile: jest.fn(async (accountId: string) => ({
    account: {
      id: accountId,
      displayName: accountId === ME ? 'Me' : 'Dana Chu',
    },
    bio: 'Cellist. **Bach** mostly.',
  })),
  saveProfile: jest.fn(async () => {}),
  connectWith: jest.fn(async () => ({ accepted: false })),
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

/**
 * The audio connection is held in App.tsx now, so these screens receive it
 * rather than opening it. That is the point of the change: a render test has
 * no business opening a microphone, and neither does navigating to Home.
 */
const AUDIO = {
  status: 'idle' as const,
  message: null,
  mutedByServer: false,
  othersAudible: 0,
};

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
          lastActiveAt: NOW,
        },
      ],
      contacts: [
        { account: { id: 'acct_p', displayName: 'Priya Raman' }, status: 'incoming' },
        { account: { id: 'acct_q', displayName: 'Quinn Ito' }, status: 'accepted' },
      ],
      recordings: [],
    };

    const tree = render(<HomeView onEnterChannel={() => {}} onOpenSettings={() => {}} />);
    const text = textOf(tree);
    expect(text).toContain('tap to join');
    expect(text).toContain('Miro Okafor');
    expect(text).toContain('1 present');
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
          name: 'Dana Chu and Me',
          others: [{ id: THEM, displayName: 'Dana Chu' }],
          startedAt: NOW,
          endedAt: NOW + 92_000,
          durationMs: 92_000,
        },
      ],
    };

    const tree = render(<HomeView onEnterChannel={() => {}} onOpenSettings={() => {}} />);
    expect(textOf(tree)).toContain('1:32');

    const button = findButton(tree, 'Export');
    expect(button).toBeDefined();
    await act(async () => button!.props.onPress());
    // The recording's own name, which the server fixed when the run stopped —
    // not a label rebuilt here from the roster.
    expect(exportRecording).toHaveBeenCalledWith(
      'token',
      'rec_1',
      'Dana Chu and Me',
      NOW + 92_000
    );
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

    const tree = render(<HomeView onEnterChannel={() => {}} onOpenSettings={() => {}} />);
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
          lastActiveAt: NOW,
        },
      ],
      contacts: [
        { account: { id: THEM, displayName: 'Dana Chu' }, status: 'accepted' },
      ],
      recordings: [],
    };

    const tree = render(<HomeView onEnterChannel={() => {}} onOpenSettings={() => {}} />);
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

    const tree = render(<HomeView onEnterChannel={() => {}} onOpenSettings={() => {}} />);
    const [dismiss] = tree.root.findAll(
      (n: ReactTestInstance) => n.props?.accessibilityLabel === 'Dismiss invite'
    );
    expect(dismiss).toBeDefined();
    act(() => dismiss.props.onPress());
    expect(mockApp.dismissInvite).toHaveBeenCalledWith('sess_a');

    // Dismissal lives in the provider now, so re-render with it applied.
    act(() => tree.update(<HomeView onEnterChannel={() => {}} onOpenSettings={() => {}} />));
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
    const tree = render(<HomeView onEnterChannel={() => {}} onOpenSettings={() => {}} />);
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

    const first = render(<HomeView onEnterChannel={() => {}} onOpenSettings={() => {}} />);
    const [dismiss] = first.root.findAll(
      (n: ReactTestInstance) => n.props?.accessibilityLabel === 'Dismiss invite'
    );
    act(() => dismiss.props.onPress());
    act(() => first.unmount());

    // Home is mounted afresh, as it is on returning from a channel.
    const second = render(<HomeView onEnterChannel={() => {}} onOpenSettings={() => {}} />);
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

    const tree = render(<HomeView onEnterChannel={() => {}} onOpenSettings={() => {}} />);
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

    const tree = render(<HomeView onEnterChannel={() => {}} onOpenSettings={() => {}} />);
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
    // After a grace period, deliberately — see "the connection warning"
    // below. The banner is about a connection that failed, not about one
    // that has not finished being made.
    jest.useFakeTimers();
    mockApp.home = { invites: [], rejoinable: [], contacts: [], recordings: [] };
    mockApp.status = 'closed';
    const tree = render(<HomeView onEnterChannel={() => {}} onOpenSettings={() => {}} />);
    act(() => {
      jest.advanceTimersByTime(3_000);
    });
    expect(textOf(tree)).toContain('Not connected');
    act(() => tree.unmount());
    jest.useRealTimers();
  });
});

describe('Channel', () => {
  it('waits rather than rendering a stale screen before the first snapshot', () => {
    const tree = render(<ChannelView
        channelId="sess_1"
        audio={AUDIO}
        onHome={() => {}}
        onExit={() => {}}
      />);
    expect(textOf(tree)).toContain('Loading channel');
    expect(mockApp.watchChannel).toHaveBeenCalledWith('sess_1');
    act(() => tree.unmount());
  });

  it('shows the claim control when eligible', () => {
    showChannel(channelOf());
    const tree = render(<ChannelView
        channelId="sess_1"
        audio={AUDIO}
        onHome={() => {}}
        onExit={() => {}}
      />);
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

    const tree = render(<ChannelView
        channelId="sess_1"
        audio={AUDIO}
        onHome={() => {}}
        onExit={() => {}}
      />);
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

    const tree = render(<ChannelView
        channelId="sess_1"
        audio={AUDIO}
        onHome={() => {}}
        onExit={() => {}}
      />);
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

    const tree = render(<ChannelView
        channelId="sess_1"
        audio={AUDIO}
        onHome={() => {}}
        onExit={() => {}}
      />);
    const text = textOf(tree);
    expect(text).toContain('Present · reconnecting…');
    expect(text).not.toContain('Stepped out');
    act(() => tree.unmount());
  });

  it('reflects being silenced by the other party', () => {
    showChannel(
      channelOf((s) => reduce(s, { type: 'CLAIM_FLOOR', userId: THEM }, NOW))
    );
    const tree = render(<ChannelView
        channelId="sess_1"
        audio={AUDIO}
        onHome={() => {}}
        onExit={() => {}}
      />);
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
    const tree = render(<ChannelView
        channelId="sess_1"
        audio={AUDIO}
        onHome={() => {}}
        onExit={() => {}}
      />);
    expect(textOf(tree)).toContain('2:20');
    mockApp.serverNow = () => NOW;
    act(() => tree.unmount());
  });

  it('dispatches a claim rather than mutating anything locally', () => {
    showChannel(channelOf());
    const tree = render(<ChannelView
        channelId="sess_1"
        audio={AUDIO}
        onHome={() => {}}
        onExit={() => {}}
      />);
    const claim = findButton(tree, 'Claim the floor');
    expect(claim).toBeDefined();
    expect(claim!.props.accessibilityState.disabled).toBe(false);
    act(() => claim!.props.onPress());
    expect(mockApp.act).toHaveBeenCalledWith('sess_1', { type: 'CLAIM_FLOOR' });
    act(() => tree.unmount());
  });

  it('offers to load a track when there is none', () => {
    showChannel(channelOf());
    const tree = render(<ChannelView
        channelId="sess_1"
        audio={AUDIO}
        onHome={() => {}}
        onExit={() => {}}
      />);
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
    const tree = render(<ChannelView
        channelId="sess_1"
        audio={AUDIO}
        onHome={() => {}}
        onExit={() => {}}
      />);
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
    const tree = render(<ChannelView
        channelId="sess_1"
        audio={AUDIO}
        onHome={() => {}}
        onExit={() => {}}
      />);

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
    const tree = render(<ChannelView
        channelId="sess_1"
        audio={AUDIO}
        onHome={() => {}}
        onExit={() => {}}
      />);
    act(() => findButton(tree, '+15s')!.props.onPress());
    expect(mockApp.act).toHaveBeenCalledWith('sess_1', {
      type: 'SEEK',
      positionMs: 15_000,
    });
    act(() => tree.unmount());
  });

  it('warns that a dropped connection counts as leaving, once it has lasted', () => {
    jest.useFakeTimers();
    showChannel(channelOf());
    mockApp.status = 'connecting';
    const tree = render(<ChannelView
        channelId="sess_1"
        audio={AUDIO}
        onHome={() => {}}
        onExit={() => {}}
      />);
    // Held back at first: foregrounding drops the socket every time, and this
    // warning is alarming enough that crying wolf on it teaches people to
    // ignore it.
    expect(textOf(tree)).not.toContain('dropped connection counts as leaving');

    act(() => void jest.advanceTimersByTime(3_000));
    expect(textOf(tree)).toContain('dropped connection counts as leaving');
    act(() => tree.unmount());
    jest.useRealTimers();
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

    const tree = render(<ChannelView
        channelId="sess_1"
        audio={AUDIO}
        onHome={() => {}}
        onExit={() => {}}
      />);
    const text = textOf(tree);
    // Named after who else is in it, two names and a count — not "4 people",
    // which threw away names the same screen goes on to list.
    expect(text).toContain('Dana Chu, Miro Okafor and 1 other');
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
    const tree = render(<ChannelView
        channelId="sess_1"
        audio={AUDIO}
        onHome={() => {}}
        onExit={() => {}}
      />);
    const invite = findButton(tree, 'Invite');
    expect(invite).toBeDefined();
    act(() => invite!.props.onPress());
    expect(mockApp.act).toHaveBeenCalledWith('sess_1', {
      type: 'INVITE',
      contactId: 'acct_3',
    });
    act(() => tree.unmount());
  });

  it('goes Home without giving up presence or the connection', () => {
    // The whole point of the change. Stepping out dispatches STEP_OUT and
    // unwatches; going Home must do neither, or the snapshot that proves you
    // are still present disappears and the connection above goes with it.
    const onHome = jest.fn();
    showChannel(channelOf());
    const tree = render(
      <ChannelView
        channelId="sess_1"
        audio={AUDIO}
        onHome={onHome}
        onExit={() => {}}
      />
    );

    const home = findButton(tree, 'Home');
    expect(home).toBeDefined();
    act(() => home!.props.onPress());

    expect(onHome).toHaveBeenCalled();
    expect(mockApp.act).not.toHaveBeenCalled();
    expect(mockApp.leaveChannelView).not.toHaveBeenCalled();
    act(() => tree.unmount());
  });

  it('offers only stepping out on the channel screen', () => {
    // Leaving lives in settings. Beside Step out, in the colour reserved for
    // danger, it drew the eye straight to the least likely action.
    showChannel(channelOf());
    const tree = render(<ChannelView
        channelId="sess_1"
        audio={AUDIO}
        onHome={() => {}}
        onExit={() => {}}
      />);

    const stepOut = findButton(tree, 'Step out');
    expect(stepOut).toBeDefined();
    expect(labelOf(stepOut!)).toContain('You stay a member');
    expect(findButton(tree, 'Leave channel')).toBeUndefined();

    act(() => stepOut!.props.onPress());
    expect(mockApp.act).toHaveBeenCalledWith('sess_1', { type: 'STEP_OUT' });
    act(() => tree.unmount());
  });

  it('keeps leaving in settings, plain rather than alarming', () => {
    showChannel(channelOf());
    const tree = render(<ChannelView
        channelId="sess_1"
        audio={AUDIO}
        onHome={() => {}}
        onExit={() => {}}
      />);
    act(() => findButton(tree, 'Settings')!.props.onPress());

    const leave = findButton(tree, 'Leave channel');
    expect(leave).toBeDefined();
    expect(labelOf(leave!)).toContain('Removes it from your home screen');
    // Behind a confirmation, so the tap alone dispatches nothing.
    act(() => leave!.props.onPress());
    expect(mockApp.act).not.toHaveBeenCalledWith('sess_1', {
      type: 'LEAVE_CHANNEL',
    });
    act(() => tree.unmount());
  });

  it('warns the last member that leaving deletes the channel', () => {
    // With somebody else there it merely removes you. Alone, the same tap
    // destroys the channel, and that is when the colour is telling the truth.
    showChannel(
      channelOf((s) => reduce(s, { type: 'LEAVE_CHANNEL', userId: THEM }, NOW))
    );
    const tree = render(<ChannelView
        channelId="sess_1"
        audio={AUDIO}
        onHome={() => {}}
        onExit={() => {}}
      />);
    act(() => findButton(tree, 'Settings')!.props.onPress());

    expect(labelOf(findButton(tree, 'Leave channel')!)).toContain(
      'this deletes the channel'
    );
    act(() => tree.unmount());
  });

  it('no longer counts elapsed time', () => {
    // A channel is permanent, so time since it was created says nothing.
    showChannel(channelOf());
    const tree = render(<ChannelView
        channelId="sess_1"
        audio={AUDIO}
        onHome={() => {}}
        onExit={() => {}}
      />);
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
    const tree = render(<ChannelView
        channelId="sess_1"
        audio={AUDIO}
        onHome={() => {}}
        onExit={() => {}}
      />);
    expect(textOf(tree)).toContain('Channel ended');
    act(() => tree.unmount());
  });

  it('shows the channel name as the header, with the roster kept below', () => {
    showChannel(
      channelOf((s) =>
        reduce(s, { type: 'SET_NAME', userId: THEM, name: 'Book club' }, NOW)
      )
    );
    const tree = render(<ChannelView
        channelId="sess_1"
        audio={AUDIO}
        onHome={() => {}}
        onExit={() => {}}
      />);
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
    const tree = render(<ChannelView
        channelId="sess_1"
        audio={AUDIO}
        onHome={() => {}}
        onExit={() => {}}
      />);
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
    const tree = render(<ChannelView
        channelId="sess_1"
        audio={AUDIO}
        onHome={() => {}}
        onExit={() => {}}
      />);
    expect(linksIn(tree)).toEqual([]);
    act(() => tree.unmount());
  });

  it('edits the description in settings, with a preview', () => {
    showChannel(channelOf());
    const tree = render(<ChannelView
        channelId="sess_1"
        audio={AUDIO}
        onHome={() => {}}
        onExit={() => {}}
      />);
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
    const tree = render(<ChannelView
        channelId="sess_1"
        audio={AUDIO}
        onHome={() => {}}
        onExit={() => {}}
      />);

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

describe('Home settings', () => {
  /** The view fetches on mount, so every case has to let that settle. */
  async function openSettings() {
    let tree!: ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(<HomeSettingsView onBack={() => {}} />);
    });
    return tree;
  }

  it('loads the current profile into the fields', async () => {
    const tree = await openSettings();
    expect(mockApp.loadProfile).toHaveBeenCalledWith(ME);
    // The bio renders as markdown in the preview, not as markup.
    const text = textOf(tree);
    expect(text).toContain('Preview');
    expect(text).toContain('Bach');
    expect(text).not.toContain('**Bach**');
    act(() => tree.unmount());
  });

  it('saves both fields together', async () => {
    const tree = await openSettings();
    const name = tree.root.findAll(
      (n) => n.props?.placeholder === 'What people should call you'
    )[0];
    act(() => name.props.onChangeText('Alice Nkemdirim'));

    await act(async () => findButton(tree, 'Save')!.props.onPress());
    expect(mockApp.saveProfile).toHaveBeenCalledWith({
      displayName: 'Alice Nkemdirim',
      bio: 'Cellist. **Bach** mostly.',
    });
    act(() => tree.unmount());
  });

  it('will not save an empty name, and says why', async () => {
    // The server refuses this too; the point of refusing it here as well is
    // that a disabled control and a rejected request cannot disagree.
    const tree = await openSettings();
    const name = tree.root.findAll(
      (n) => n.props?.placeholder === 'What people should call you'
    )[0];
    act(() => name.props.onChangeText('   '));

    expect(findButton(tree, 'Save')!.props.accessibilityState.disabled).toBe(
      true
    );
    expect(textOf(tree)).toContain('A name cannot be empty');
    act(() => tree.unmount());
  });

  it('holds signing out, which is no longer on Home', () => {
    // It sat in the header beside a dozen harmless taps. Here it is among the
    // other things that are about the account rather than about a channel.
    const tree = render(
      <HomeView onEnterChannel={() => {}} onOpenSettings={() => {}} />
    );
    expect(findButton(tree, 'Sign out')).toBeUndefined();
    act(() => tree.unmount());
  });

  it('signs out behind a confirmation', async () => {
    const tree = await openSettings();
    const signOut = findButton(tree, 'Sign out');
    expect(signOut).toBeDefined();
    act(() => signOut!.props.onPress());
    // The alert carries it; the tap alone must not.
    expect(mockApp.signOut).not.toHaveBeenCalled();
    act(() => tree.unmount());
  });

  it('opens from Home', () => {
    const onOpenSettings = jest.fn();
    mockApp.home = {
      invites: [],
      rejoinable: [],
      contacts: [],
      recordings: [],
    };
    const tree = render(
      <HomeView onEnterChannel={() => {}} onOpenSettings={onOpenSettings} />
    );
    act(() => findButton(tree, 'Settings')!.props.onPress());
    expect(onOpenSettings).toHaveBeenCalled();
    act(() => tree.unmount());
  });
});

describe('Home while still in a channel', () => {
  const home = () => {
    mockApp.home = {
      invites: [],
      rejoinable: [],
      contacts: [],
      recordings: [],
    };
  };

  it('says so, and offers the way back', () => {
    // An open microphone behind a screen that gives no sign of it is the one
    // way this could be worse than having to step out first.
    home();
    const onReturn = jest.fn();
    const tree = render(
      <HomeView
        onEnterChannel={() => {}}
        onOpenSettings={() => {}}
        liveChannel={{
          channelId: 'sess_1',
          title: 'Book club',
          present: 2,
          muted: false,
        }}
        onReturnToChannel={onReturn}
      />
    );
    const text = textOf(tree).replace(/\s+/g, ' ');
    // The title is a title. That you are inside it is said by the badge, not
    // by a preposition glued to the front of the name.
    expect(text).toContain('Book club');
    expect(text).not.toContain('In Book club');
    expect(text).toContain('2 present');
    expect(text).toContain('tap to go back');

    // Found the way a person using VoiceOver would: the bar announces itself
    // as a button, which it should have done regardless of this test.
    const bar = findButton(tree, 'Book club');
    expect(bar).toBeDefined();
    act(() => bar!.props.onPress());
    expect(onReturn).toHaveBeenCalledWith('sess_1');
    act(() => tree.unmount());
  });

  it('falls back to the roster when the channel has no name', () => {
    // The same fallback the channel's own header uses, computed in App.tsx —
    // a channel must not answer to one thing here and another there.
    home();
    const tree = render(
      <HomeView
        onEnterChannel={() => {}}
        onOpenSettings={() => {}}
        liveChannel={{
          channelId: 'sess_1',
          title: 'Dana Chu',
          present: 1,
          muted: false,
        }}
        onReturnToChannel={() => {}}
      />
    );
    const text = textOf(tree).replace(/\s+/g, ' ');
    expect(text).toContain('Dana Chu');
    expect(text).toContain('Nobody else is here yet');
    // No preposition dressing up the title.
    expect(text).not.toContain('In Dana Chu');
    act(() => tree.unmount());
  });

  it('shows nothing when you are not in one', () => {
    home();
    const tree = render(
      <HomeView onEnterChannel={() => {}} onOpenSettings={() => {}} />
    );
    expect(textOf(tree)).not.toContain('tap to go back');
    act(() => tree.unmount());
  });
});

describe('reading somebody else’s profile', () => {
  it('opens from the roster and comes back', async () => {
    // The line naming who you are with is the only place their name appears,
    // and "who is this?" is a real question about somebody an acquaintance
    // brought in — so that line is the way to their profile.
    showChannel(channelOf());
    const tree = render(
      <ChannelView
        channelId="sess_1"
        audio={AUDIO}
        onHome={() => {}}
        onExit={() => {}}
      />
    );

    const row = tree.root
      .findAll((n) => n.props?.accessibilityRole === 'button')
      .find((n) => String(n.props?.accessibilityLabel).includes('Dana Chu'));
    expect(row).toBeDefined();

    await act(async () => row!.props.onPress());
    expect(mockApp.loadProfile).toHaveBeenCalledWith(THEM);

    // Their name is there before the fetch lands, because the roster knew it.
    const text = textOf(tree);
    expect(text).toContain('Dana Chu');
    // And the channel is gone from view without anything being dispatched.
    expect(mockApp.act).not.toHaveBeenCalled();

    await act(async () => findButton(tree, 'Done')!.props.onPress());
    expect(textOf(tree)).toContain('The floor');
    act(() => tree.unmount());
  });

  it('says so plainly when there is nothing to show', async () => {
    // Refused and absent are one answer by design, and this must not try to
    // tell them apart either.
    mockApp.loadProfile.mockRejectedValueOnce(new Error('nope'));
    showChannel(channelOf());
    const tree = render(
      <ChannelView
        channelId="sess_1"
        audio={AUDIO}
        onHome={() => {}}
        onExit={() => {}}
      />
    );
    const row = tree.root
      .findAll((n) => n.props?.accessibilityRole === 'button')
      .find((n) => String(n.props?.accessibilityLabel).includes('Dana Chu'));
    await act(async () => row!.props.onPress());

    const text = textOf(tree);
    expect(text).toContain('no profile here to show you');
    expect(text).toContain('Dana Chu');
    act(() => tree.unmount());
  });
});

describe('a channel with nobody in it', () => {
  it('is described as resting, not as expiring', () => {
    // It used to say "Empty — ends within a minute", which was true when a
    // channel was a session and self-destructed. A permanent channel with
    // nobody in it is simply quiet, and saying otherwise sends someone
    // hurrying back to save something that was never at risk.
    mockApp.home = {
      invites: [],
      rejoinable: [
        {
          channelId: 'sess_b',
          name: 'Book club',
          others: [{ id: THEM, displayName: 'Dana Chu' }],
          presentCount: 0,
          createdAt: NOW,
          lastActiveAt: NOW,
        },
      ],
      contacts: [],
      recordings: [],
    };
    const tree = render(
      <HomeView onEnterChannel={() => {}} onOpenSettings={() => {}} />
    );
    const text = textOf(tree);
    expect(text).toContain('Nobody here right now');
    expect(text).not.toContain('ends within a minute');
    act(() => tree.unmount());
  });
});

describe('the connection warning', () => {
  const empty = () => {
    mockApp.home = { invites: [], rejoinable: [], contacts: [], recordings: [] };
  };

  it('stays quiet while the first connection is being made', () => {
    // The socket opens a moment after this screen does. A warning that
    // resolves itself before it can be read teaches people to ignore
    // warnings, and this one is in the colour reserved for trouble.
    empty();
    mockApp.status = 'connecting';
    const tree = render(
      <HomeView onEnterChannel={() => {}} onOpenSettings={() => {}} />
    );
    expect(textOf(tree)).not.toContain('Reconnecting');
    act(() => tree.unmount());
  });

  it('speaks up once the connection has had its chance', () => {
    jest.useFakeTimers();
    empty();
    mockApp.status = 'closed';
    const tree = render(
      <HomeView onEnterChannel={() => {}} onOpenSettings={() => {}} />
    );
    expect(textOf(tree)).not.toContain('Not connected');

    act(() => {
      jest.advanceTimersByTime(3_000);
    });
    expect(textOf(tree)).toContain('Not connected');
    act(() => tree.unmount());
    jest.useRealTimers();
  });

  it('holds a later drop back too, not only the first', () => {
    // This used to assert the opposite — "a real drop, after a real
    // connection: no grace this time" — and that is what people were seeing.
    // Every foreground drops the socket, so a warning with no grace after the
    // first connection is a warning on every foreground.
    jest.useFakeTimers();
    empty();
    mockApp.status = 'open';
    const tree = render(
      <HomeView onEnterChannel={() => {}} onOpenSettings={() => {}} />
    );
    const show = (status: 'connecting' | 'open' | 'closed') => {
      mockApp.status = status;
      act(() => {
        tree.update(
          <HomeView onEnterChannel={() => {}} onOpenSettings={() => {}} />
        );
      });
    };

    show('connecting');
    expect(textOf(tree)).not.toContain('Reconnecting…');

    // Back before the delay is up: never mentioned at all.
    act(() => void jest.advanceTimersByTime(1_000));
    show('open');
    act(() => void jest.advanceTimersByTime(60_000));
    expect(textOf(tree)).not.toContain('Reconnecting…');

    // One that genuinely lasts is still reported.
    show('connecting');
    act(() => void jest.advanceTimersByTime(3_000));
    expect(textOf(tree)).toContain('Reconnecting…');

    act(() => tree.unmount());
    jest.useRealTimers();
  });
});

describe('adding a contact you met in a channel', () => {
  /** Open the roster line for the other person, which is their profile. */
  async function openTheirProfile() {
    showChannel(channelOf());
    const tree = render(
      <ChannelView
        channelId="sess_1"
        audio={AUDIO}
        onHome={() => {}}
        onExit={() => {}}
      />
    );
    const row = tree.root
      .findAll((n) => n.props?.accessibilityRole === 'button')
      .find((n) => String(n.props?.accessibilityLabel).includes('Dana Chu'));
    await act(async () => row!.props.onPress());
    return tree;
  }

  it('offers to add a stranger, and asks by id', async () => {
    // The whole point: you know their name and their account id, and nothing
    // else. Adding them by address was never possible.
    mockApp.home = { invites: [], rejoinable: [], contacts: [], recordings: [] };
    const tree = await openTheirProfile();

    expect(textOf(tree)).toContain('They will see a request');
    await act(async () => findButton(tree, 'Add contact')!.props.onPress());
    expect(mockApp.connectWith).toHaveBeenCalledWith(THEM);
    act(() => tree.unmount());
  });

  it('says nothing to add when they are already a contact', async () => {
    mockApp.home = {
      invites: [],
      rejoinable: [],
      contacts: [
        { account: { id: THEM, displayName: 'Dana Chu' }, status: 'accepted' },
      ],
      recordings: [],
    };
    const tree = await openTheirProfile();
    expect(textOf(tree)).toContain('Already one of your contacts');
    expect(findButton(tree, 'Add contact')).toBeUndefined();
    act(() => tree.unmount());
  });

  it('waits rather than asking twice', async () => {
    mockApp.home = {
      invites: [],
      rejoinable: [],
      contacts: [
        { account: { id: THEM, displayName: 'Dana Chu' }, status: 'outgoing' },
      ],
      recordings: [],
    };
    const tree = await openTheirProfile();
    expect(textOf(tree)).toContain('waiting for them to accept');
    expect(findButton(tree, 'Add contact')).toBeUndefined();
    act(() => tree.unmount());
  });

  it('offers to accept when they asked first', async () => {
    mockApp.home = {
      invites: [],
      rejoinable: [],
      contacts: [
        { account: { id: THEM, displayName: 'Dana Chu' }, status: 'incoming' },
      ],
      recordings: [],
    };
    const tree = await openTheirProfile();
    const accept = findButton(tree, 'Accept their request');
    expect(accept).toBeDefined();
    await act(async () => accept!.props.onPress());
    expect(mockApp.connectWith).toHaveBeenCalledWith(THEM);
    act(() => tree.unmount());
  });
});

/**
 * A named channel is called something; an unnamed one is only being described,
 * from the viewer's side alone — Alice reads different words for the same
 * channel. Listed side by side in one type they look alike, and the
 * description reads as a shared name it is not, so the styling has to carry
 * the difference. Asserted on style rather than text because that *is* the
 * feature.
 */
describe('named channels and described ones do not look alike', () => {
  const titleStyleOf = (tree: ReactTestRenderer, text: string) => {
    const node = tree.root.findAll(
      (n) => typeof n.props?.children === 'string' && n.props.children === text
    )[0];
    return StyleSheet.flatten(node.props.style) as {
      fontStyle?: string;
      color?: string;
    };
  };

  const homeWith = (name: string | null) => {
    mockApp.home = {
      invites: [],
      rejoinable: [
        {
          channelId: 'sess_b',
          name,
          others: [{ id: 'acct_x', displayName: 'Miro Okafor' }],
          presentCount: 1,
          createdAt: NOW,
          lastActiveAt: NOW,
        },
      ],
      contacts: [],
      recordings: [],
    };
    return render(
      <HomeView onEnterChannel={() => {}} onOpenSettings={() => {}} />
    );
  };

  it('sets a described channel in italic on Home', () => {
    // Italic and nothing else. Dimming it too said "less important" on top of
    // "not a name", and most channels have no name.
    const tree = homeWith(null);
    const style = titleStyleOf(tree, 'Miro Okafor');
    expect(style.fontStyle).toBe('italic');
    expect(style.color).toBe(colors.text);
    act(() => tree.unmount());
  });

  it('leaves a named channel asserted, upright and full strength', () => {
    const tree = homeWith('Thursday rehearsal');
    const style = titleStyleOf(tree, 'Thursday rehearsal');
    expect(style.fontStyle).toBeUndefined();
    expect(style.color).toBe(colors.text);
    act(() => tree.unmount());
  });

  it('marks the channel header the same way', () => {
    showChannel(channelOf());
    const tree = render(
      <ChannelView
        channelId="sess_1"
        audio={AUDIO}
        onHome={() => {}}
        onExit={() => {}}
      />
    );
    // The header, not the roster below it: both say "Dana Chu".
    const [header] = tree.root.findAll(
      (n) =>
        n.props?.children === 'Dana Chu' &&
        StyleSheet.flatten(n.props?.style)?.fontSize === 24
    );
    const style = StyleSheet.flatten(header.props.style) as {
      fontStyle?: string;
      color?: string;
    };
    expect(style.fontStyle).toBe('italic');
    expect(style.color).toBe(colors.text);
    act(() => tree.unmount());
  });

  it('says so plainly when everyone else has left', () => {
    mockApp.home = {
      invites: [],
      rejoinable: [
        {
          channelId: 'sess_b',
          name: null,
          others: [],
          presentCount: 0,
          createdAt: NOW,
          lastActiveAt: NOW,
        },
      ],
      contacts: [],
      recordings: [],
    };
    const tree = render(
      <HomeView onEnterChannel={() => {}} onOpenSettings={() => {}} />
    );
    expect(textOf(tree)).toContain('Just you');
    act(() => tree.unmount());
  });
});

/**
 * The order of Home's channel list. A name is something somebody chose to
 * write, so named channels are the ones being kept deliberately; sorting the
 * whole list by recency alone would bury them among channels nobody has
 * bothered to name, which costs the naming its point.
 */
describe('the order of your channels', () => {
  const channel = (
    id: string,
    name: string | null,
    lastActiveAt: number,
    other = 'Miro Okafor'
  ) => ({
    channelId: id,
    name,
    others: [{ id: `acct_${id}`, displayName: other }],
    presentCount: 0,
    createdAt: NOW,
    lastActiveAt,
  });

  /** The rendered titles, in the order they appear. */
  const titlesIn = (tree: ReactTestRenderer, expected: string[]) => {
    const text = textOf(tree);
    return expected
      .map((title) => ({ title, at: text.indexOf(title) }))
      .filter((entry) => entry.at >= 0)
      .sort((a, b) => a.at - b.at)
      .map((entry) => entry.title);
  };

  const show = (rejoinable: ReturnType<typeof channel>[]) => {
    mockApp.home = { invites: [], rejoinable, contacts: [], recordings: [] };
    return render(
      <HomeView onEnterChannel={() => {}} onOpenSettings={() => {}} />
    );
  };

  it('puts every named channel above every described one', () => {
    // The stalest named channel still outranks the freshest unnamed one.
    const tree = show([
      channel('a', null, NOW),
      channel('b', 'Thursday rehearsal', NOW - 900_000),
    ]);
    expect(titlesIn(tree, ['Thursday rehearsal', 'Miro Okafor'])).toEqual([
      'Thursday rehearsal',
      'Miro Okafor',
    ]);
    act(() => tree.unmount());
  });

  it('sorts by when each was last used, not when it was made', () => {
    const tree = show([
      channel('a', 'Standup', NOW - 900_000),
      channel('b', 'Thursday rehearsal', NOW),
      channel('c', 'Book club', NOW - 60_000),
    ]);
    expect(
      titlesIn(tree, ['Thursday rehearsal', 'Book club', 'Standup'])
    ).toEqual(['Thursday rehearsal', 'Book club', 'Standup']);
    act(() => tree.unmount());
  });

  it('sorts the described ones by recency too', () => {
    const tree = show([
      channel('a', null, NOW - 900_000, 'Dana Chu'),
      channel('b', null, NOW, 'Priya Raman'),
    ]);
    expect(titlesIn(tree, ['Priya Raman', 'Dana Chu'])).toEqual([
      'Priya Raman',
      'Dana Chu',
    ]);
    act(() => tree.unmount());
  });
});

/**
 * Rows you tap.
 *
 * A profile used to be reachable only from a channel roster, which meant you
 * had to already be in a channel with somebody to read who they were. Contact
 * rows are now the way in, and a channel row is a single target rather than a
 * button on the end of one.
 */
describe('tapping a row', () => {
  /** The pressable whose accessibility label starts with `prefix`. */
  const pressableFor = (tree: ReactTestRenderer, prefix: string) =>
    tree.root.findAll(
      (n) =>
        n.props?.accessibilityRole === 'button' &&
        typeof n.props?.accessibilityLabel === 'string' &&
        n.props.accessibilityLabel.startsWith(prefix)
    )[0];

  it('opens a profile from a contact, naming who to fetch', () => {
    const onOpenProfile = jest.fn();
    mockApp.home = {
      invites: [],
      rejoinable: [],
      contacts: [
        {
          account: { id: 'acct_q', displayName: 'Quinn Ito' },
          status: 'accepted',
        },
      ],
      recordings: [],
    };
    const tree = render(
      <HomeView
        onEnterChannel={() => {}}
        onOpenSettings={() => {}}
        onOpenProfile={onOpenProfile}
      />
    );

    act(() => pressableFor(tree, 'Quinn Ito').props.onPress());
    expect(onOpenProfile).toHaveBeenCalledWith('acct_q', 'Quinn Ito');
    act(() => tree.unmount());
  });

  it('leaves a sent request alone, there being no account behind it yet', () => {
    // `displayName` holds the address for these rows, and there is no profile
    // to open — pressing one would fetch a person who does not exist.
    const onOpenProfile = jest.fn();
    mockApp.home = {
      invites: [],
      rejoinable: [],
      contacts: [
        {
          account: { id: '', displayName: 'nobody@example.com' },
          status: 'outgoing',
        },
      ],
      recordings: [],
    };
    const tree = render(
      <HomeView
        onEnterChannel={() => {}}
        onOpenSettings={() => {}}
        onOpenProfile={onOpenProfile}
      />
    );

    expect(pressableFor(tree, 'nobody@example.com')).toBeUndefined();
    act(() => tree.unmount());
  });

  it('steps into a channel from anywhere on its row, there being no button', () => {
    const onEnterChannel = jest.fn();
    mockApp.home = {
      invites: [],
      rejoinable: [
        {
          channelId: 'sess_b',
          name: 'Thursday rehearsal',
          others: [{ id: 'acct_x', displayName: 'Miro Okafor' }],
          presentCount: 1,
          createdAt: NOW,
          lastActiveAt: NOW,
        },
      ],
      contacts: [],
      recordings: [],
    };
    const tree = render(
      <HomeView
        onEnterChannel={onEnterChannel}
        onOpenSettings={() => {}}
      />
    );

    expect(findButton(tree, 'Step in')).toBeUndefined();
    act(() => pressableFor(tree, 'Thursday rehearsal').props.onPress());
    expect(mockApp.act).toHaveBeenCalledWith('sess_b', { type: 'ENTER' });
    expect(onEnterChannel).toHaveBeenCalledWith('sess_b');
    act(() => tree.unmount());
  });

  it('picks rather than navigating while choosing several people', () => {
    // Opening a profile mid-selection would lose the selection to a
    // navigation nobody asked for.
    const onOpenProfile = jest.fn();
    mockApp.home = {
      invites: [],
      rejoinable: [],
      contacts: [
        {
          account: { id: 'acct_q', displayName: 'Quinn Ito' },
          status: 'accepted',
        },
        {
          account: { id: 'acct_p', displayName: 'Priya Raman' },
          status: 'accepted',
        },
      ],
      recordings: [],
    };
    const tree = render(
      <HomeView
        onEnterChannel={() => {}}
        onOpenSettings={() => {}}
        onOpenProfile={onOpenProfile}
      />
    );

    act(() => findButton(tree, 'Start a channel with several people')!.props.onPress());
    act(() => pressableFor(tree, 'Quinn Ito').props.onPress());

    expect(onOpenProfile).not.toHaveBeenCalled();
    expect(textOf(tree)).toContain('Picked');
    act(() => tree.unmount());
  });
});

/**
 * A profile now says what you already share with somebody, not only who they
 * are. The list is drawn from Home's own channels, which is exactly the set
 * you can step into.
 */
describe('channels you share with somebody', () => {
  const withChannels = (rejoinable: HomeViewData['rejoinable']) => {
    mockApp.home = { invites: [], rejoinable, contacts: [], recordings: [] };
  };

  const channel = (id: string, name: string | null, otherId: string) => ({
    channelId: id,
    name,
    others: [{ id: otherId, displayName: 'Dana Chu' }],
    presentCount: 0,
    createdAt: NOW,
    lastActiveAt: NOW,
  });

  it('lists only the ones they are in, and steps into the one tapped', async () => {
    const onEnterChannel = jest.fn();
    withChannels([
      channel('sess_shared', 'Thursday rehearsal', THEM),
      channel('sess_other', 'Someone else entirely', 'acct_stranger'),
    ]);

    let tree!: ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(
        <ProfileView
          accountId={THEM}
          fallbackName="Dana Chu"
          onBack={() => {}}
          onEnterChannel={onEnterChannel}
        />
      );
    });

    const text = textOf(tree);
    expect(text).toContain('Thursday rehearsal');
    expect(text).not.toContain('Someone else entirely');

    const row = tree.root.findAll(
      (n) =>
        n.props?.accessibilityRole === 'button' &&
        typeof n.props?.accessibilityLabel === 'string' &&
        n.props.accessibilityLabel.startsWith('Thursday rehearsal')
    )[0];
    act(() => row.props.onPress());

    expect(mockApp.act).toHaveBeenCalledWith('sess_shared', { type: 'ENTER' });
    expect(onEnterChannel).toHaveBeenCalledWith('sess_shared');
    act(() => tree.unmount());
  });

  it('says nothing at all when there is nowhere to send you', async () => {
    // Reached from inside a channel, there is no `onEnterChannel` and the
    // section is left out rather than shown dead.
    withChannels([channel('sess_shared', 'Thursday rehearsal', THEM)]);

    let tree!: ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(
        <ProfileView
          accountId={THEM}
          fallbackName="Dana Chu"
          onBack={() => {}}
        />
      );
    });

    expect(textOf(tree)).not.toContain('Channels with them');
    act(() => tree.unmount());
  });
});
