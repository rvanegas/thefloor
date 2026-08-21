import React from 'react';
import renderer, {
  act,
  type ReactTestInstance,
  type ReactTestRenderer,
} from 'react-test-renderer';
import { createChannel, reduce } from '../../../../core/channel';
import {
  DISCONNECT_GRACE_MS,
  WAITING_WINDOW_MS,
} from '../../../../core/constants';
import type { ChannelState } from '../../../../core/types';
import type {
  HomeView as HomeViewData,
  ProfileView as ProfileViewData,
  RecordingView,
} from '../../../../core/protocol';
import { HomeView } from '../HomeView';
import { ChannelView, uploadingLabel } from '../ChannelView';
import type { UploadHooks } from '../../api/upload';
import { ProfileView } from '../ProfileView';
import { ContactsSettingsView } from '../ContactsSettingsView';
import { ContactsView } from '../ContactsView';
import { HomeSettingsView } from '../HomeSettingsView';
import { SupportView } from '../SupportView';
import { Alert, KeyboardAvoidingView, StyleSheet } from 'react-native';
import * as Clipboard from 'expo-clipboard';
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
  channelViews: {} as Record<
    string,
    {
      channel: ChannelState;
      participants: Array<{ id: string; displayName: string }>;
      recordings: RecordingView[];
      serverNow: number;
    }
  >,
  goneChannels: [] as string[],
  status: 'open' as 'open' | 'connecting' | 'closed',
  lastError: null,
  serverNow: () => NOW,
  requestCode: jest.fn(),
  verify: jest.fn(),
  signOut: jest.fn(),
  deleteAccount: jest.fn(async () => {}),
  requestContact: jest.fn(),
  acceptContact: jest.fn(),
  declineContact: jest.fn(),
  startChannel: jest.fn(),
  // Answers for whoever is asked about, as the server does — a mock that
  // returns one person regardless would hide a component reading the wrong id.
  // Typed as the protocol shape rather than inferred from this one answer, so
  // a test can hand back a profile with no bio, or with the availability
  // fields a contact's profile carries.
  loadProfile: jest.fn(
    async (accountId: string): Promise<ProfileViewData> => ({
      account: {
        id: accountId,
        displayName: accountId === ME ? 'Me' : 'Dana Chu',
      },
      bio: 'Cellist. **Bach** mostly.',
    })
  ),
  saveProfile: jest.fn(async () => {}),
  // Configured by default, so the Support section is exercised rather than
  // skipped; the tests that care about it absent override this.
  loadSupport: jest.fn(async () => ({
    url: 'https://ko-fi.com/thefloor',
    identifier: 'me@example.com',
    mine: null as {
      count: number;
      since: number;
      totals: Array<{ currency: string; cents: number }>;
    } | null,
  })),
  connectWith: jest.fn(async () => ({ accepted: false })),
  watchChannel: jest.fn(),
  leaveChannelView: jest.fn(),
  act: jest.fn(),
  clearError: jest.fn(),
  removeContact: jest.fn(async () => {}),
  dismissedInvites: [] as string[],
  dismissInvite: jest.fn((channelId: string) => {
    mockApp.dismissedInvites = [...mockApp.dismissedInvites, channelId];
  }),
  // Off, which is what every account is until somebody sets the column by
  // hand. The panel's own tests are the only ones that turn it on.
  debug: false,
  appearance: 'system' as 'light' | 'dark' | 'system',
  setAppearance: jest.fn((preference: 'light' | 'dark' | 'system') => {
    mockApp.appearance = preference;
  }),
};

// The views are rendered without a native audio stack: @livekit/react-native
// ships untranspiled ESM, and more importantly a render test has no business
// opening a microphone. Audio behaviour is verified on a device, not here.
jest.mock('../../api/download', () => ({
  exportRecording: jest.fn(async () => {}),
}));

/**
 * Every upload started by a test, held open rather than resolved.
 *
 * The interesting part of an upload is the middle — a percentage that is or is
 * not moving, and a Cancel that has or has not something to cancel — and a
 * mock that resolves immediately has no middle. Each entry carries the hooks
 * the screen passed in, so a test can drive progress itself, and the resolver,
 * so it can decide when the thing ends.
 */
const uploads: Array<{
  hooks: UploadHooks;
  finish: (result: { cancelled: boolean }) => void;
  fail: (error: unknown) => void;
}> = [];

jest.mock('../../api/upload', () => ({
  pickAndUploadTrack: jest.fn(
    (_token: string, _channelId: string, hooks: UploadHooks = {}) =>
      new Promise((finish, fail) => {
        uploads.push({ hooks, finish, fail });
      })
  ),
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
  speaking: [] as string[],
  micOpen: true,
  // Nothing has been asked of the audio session, which is what a view test
  // renders against: the diagnostic panel is gated on `mockApp.debug` and is
  // absent from every case here but its own.
  asked: null,
};

/** The same connection, with somebody audible on it. */
function audioWith(...speaking: string[]) {
  return { ...AUDIO, speaking };
}

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

/**
 * The three handlers HomeView requires, as no-ops.
 *
 * Spread first, so a test that is about one of them overrides just that one and
 * every other site stays quiet about navigation it does not exercise. These
 * tests are almost all about what Home *shows*.
 *
 * It exists because `onOpenContacts` was added to HomeView and broke
 * thirty-eight call sites that had each written the same two no-ops out by
 * hand — a compile error per test, none of them about anything the test was
 * testing. The next required handler now costs one line here.
 */
const homeNav = {
  onEnterChannel: () => {},
  onOpenContacts: () => {},
  onOpenSettings: () => {},
};

function channelOf(mutate: (s: ChannelState) => ChannelState = (s) => s) {
  const base = createChannel({
    id: 'sess_1',
    initiator: ME,
    invitees: [THEM],
    now: NOW,
  });
  return mutate(reduce(base, { type: 'ENTER', userId: THEM }, NOW));
}

function showChannel(channel: ChannelState, recordings: RecordingView[] = []) {
  const names: Record<string, string> = {
    [ME]: 'Me',
    [THEM]: 'Dana Chu',
    acct_3: 'Miro Okafor',
    acct_4: 'Priya Raman',
  };
  mockApp.channelViews[channel.id] = {
    channel,
    participants: channel.participants.map((id) => ({
      id,
      displayName: names[id] ?? id,
    })),
    recordings,
    serverNow: NOW,
  };
}

beforeEach(() => {
  mockApp.home = null;
  mockApp.channelViews = {};
  mockApp.goneChannels = [];
  mockApp.status = 'open';
  mockApp.dismissedInvites = [];
  mockApp.appearance = 'system';
  mockApp.debug = false;
  uploads.length = 0;
  jest.clearAllMocks();
});

describe('Home', () => {
  it('renders the channels and the requests from a snapshot', () => {
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
        // An accepted contact is a channel now, and appears in the list above
        // rather than in a list of its own. Nothing on this screen draws it.
        { account: { id: 'acct_q', displayName: 'Quinn Ito' }, status: 'accepted' },
      ],
      recordings: [],
    };

    const tree = render(<HomeView {...homeNav} />);
    const text = textOf(tree);
    expect(text).toContain('tap to join');
    expect(text).toContain('Miro Okafor');
    expect(text).toContain('1 present');
    expect(text).toContain('Priya Raman');
    expect(text).toContain('Accept');
    expect(text).not.toContain('Quinn Ito');
    act(() => tree.unmount());
  });

  /**
   * Three sections, in one order, and each channel in exactly the first one it
   * qualifies for.
   */
  it('sections the channels into live, invited and the rest', () => {
    mockApp.home = {
      invites: [
        {
          channelId: 'sess_quiet',
          from: { id: THEM, displayName: 'Dana Chu' },
          createdAt: NOW,
          name: 'Asked In',
          others: [{ id: THEM, displayName: 'Dana Chu' }],
          presentCount: 0,
          lastPresenceAt: NOW - 3_600_000,
        },
      ],
      rejoinable: [
        {
          channelId: 'sess_live',
          name: 'Talking Now',
          others: [{ id: 'acct_x', displayName: 'Miro Okafor' }],
          presentCount: 2,
          createdAt: NOW,
          lastActiveAt: NOW,
          lastPresenceAt: NOW,
        },
        {
          channelId: 'sess_cold',
          name: 'Long Quiet',
          others: [{ id: 'acct_y', displayName: 'Priya Raman' }],
          presentCount: 0,
          createdAt: NOW,
          lastActiveAt: NOW - 3 * 86_400_000,
          lastPresenceAt: NOW - 3 * 86_400_000,
        },
      ],
      contacts: [],
      recordings: [],
    };

    const tree = render(<HomeView {...homeNav} />);
    const text = textOf(tree);
    const order = ['Live', 'Talking Now', 'Invitations', 'Asked In', 'Your channels', 'Long Quiet'];
    expect(order.map((t) => text.indexOf(t))).toEqual(
      [...order.map((t) => text.indexOf(t))].sort((a, b) => a - b)
    );
    act(() => tree.unmount());
  });

  it('puts an invitation somebody is waiting in under Live, not Invitations', () => {
    // The sections are a ladder rather than a taxonomy. An invitation with
    // people in it is the most urgent thing on the screen, and burying it
    // under channels nobody is in to keep the categories tidy would be sorting
    // by classification instead of by what to do next.
    mockApp.home = {
      invites: [
        {
          channelId: 'sess_a',
          from: { id: THEM, displayName: 'Dana Chu' },
          createdAt: NOW,
          name: 'Come In',
          others: [{ id: THEM, displayName: 'Dana Chu' }],
          presentCount: 2,
        },
      ],
      rejoinable: [],
      contacts: [],
      recordings: [],
    };
    const tree = render(<HomeView {...homeNav} />);
    const text = textOf(tree);
    expect(text).toContain('Live');
    expect(text).not.toContain('Invitations');
    // Still says who asked, which is the thing a live channel of your own
    // would not have to say.
    expect(text).toContain('Dana Chu is waiting');
    act(() => tree.unmount());
  });

  it('says how long a quiet channel has been quiet', () => {
    mockApp.serverNow = () => NOW + 2 * 3_600_000;
    mockApp.home = {
      invites: [],
      rejoinable: [
        {
          channelId: 'sess_b',
          name: 'Standup',
          others: [{ id: 'acct_x', displayName: 'Miro Okafor' }],
          presentCount: 0,
          createdAt: NOW,
          lastActiveAt: NOW,
          lastPresenceAt: NOW,
        },
      ],
      contacts: [],
      recordings: [],
    };
    const tree = render(<HomeView {...homeNav} />);
    expect(textOf(tree)).toContain('2 hours ago');
    mockApp.serverNow = () => NOW;
    act(() => tree.unmount());
  });

  it('invents no idleness for a server that sends no stamp', () => {
    // An installed build meets this between its release and the deploy that
    // follows, and an invitation is the only row that can reach it: a channel
    // row falls back to `lastActiveAt`, which for a channel nobody is in is
    // the same answer. With nothing to measure from, the interval is dropped
    // rather than guessed at — the row still says who asked.
    mockApp.home = {
      invites: [
        {
          channelId: 'sess_b',
          from: { id: 'acct_x', displayName: 'Miro Okafor' },
          createdAt: NOW,
          presentCount: 0,
        },
      ],
      rejoinable: [],
      contacts: [],
      recordings: [],
    };
    const tree = render(<HomeView {...homeNav} />);
    const text = textOf(tree);
    expect(text).toContain('Miro Okafor asked you in');
    expect(text).not.toContain('ago');
    expect(text).not.toContain('·');
    act(() => tree.unmount());
  });

  it('says how long ago even when it was moments ago', () => {
    // There used to be a floor here, and under it the row said "Nobody here
    // right now" — which the reader already knew, an occupied channel showing
    // its count instead. Every row answers the same question the same way.
    mockApp.home = {
      invites: [],
      rejoinable: [
        {
          channelId: 'sess_b',
          name: 'Standup',
          others: [{ id: 'acct_x', displayName: 'Miro Okafor' }],
          presentCount: 0,
          createdAt: NOW,
          lastActiveAt: NOW,
          lastPresenceAt: NOW - 5_000,
        },
      ],
      contacts: [],
      recordings: [],
    };
    const tree = render(<HomeView {...homeNav} />);
    const text = textOf(tree);
    expect(text).toContain('A few seconds ago');
    expect(text).not.toContain('Nobody here right now');
    act(() => tree.unmount());
  });

  /**
   * Two invitations from one person used to be the same banner twice: it named
   * only the sender, so there was no way to tell which channel either was for.
   * The App Review account met exactly that on 2026-08-17.
   */
  it('says which channel each invitation is for', () => {
    mockApp.home = {
      invites: [
        {
          channelId: 'sess_a',
          from: { id: THEM, displayName: 'Dana Chu' },
          createdAt: NOW,
          name: 'Weekly Convo',
          others: [{ id: THEM, displayName: 'Dana Chu' }],
          presentCount: 1,
        },
        {
          channelId: 'sess_b',
          from: { id: THEM, displayName: 'Dana Chu' },
          createdAt: NOW,
          name: null,
          others: [{ id: THEM, displayName: 'Dana Chu' }],
          presentCount: 1,
        },
      ],
      rejoinable: [],
      contacts: [],
      recordings: [],
    };
    const tree = render(<HomeView {...homeNav} />);
    const text = textOf(tree);
    expect(text).toContain('Weekly Convo');
    // The unnamed one is described by its roster rather than left blank.
    expect(text).toContain('Dana Chu');
    act(() => tree.unmount());
  });

  /**
   * An invitation outlives the moment it was sent. What it must not do is go on
   * claiming that moment is still happening — the banner said somebody "is
   * waiting in a channel" after they had stepped out of it.
   */
  it('does not say somebody is waiting in an empty channel', () => {
    mockApp.home = {
      invites: [
        {
          channelId: 'sess_a',
          from: { id: THEM, displayName: 'Dana Chu' },
          createdAt: NOW,
          name: 'Weekly Convo',
          others: [{ id: THEM, displayName: 'Dana Chu' }],
          presentCount: 0,
          lastPresenceAt: NOW - 3_600_000,
        },
      ],
      rejoinable: [],
      contacts: [],
      recordings: [],
    };
    const tree = render(<HomeView {...homeNav} />);
    const text = textOf(tree);
    expect(text).not.toContain('is waiting');
    expect(text).toContain('asked you in · an hour ago');
    act(() => tree.unmount());
  });

  it('does not list recordings, which belong to their channel', () => {
    // They were here, as one flat list belonging to nothing. The server still
    // sends the field for build 20, which renders it; this screen ignores it.
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

    const tree = render(<HomeView {...homeNav} />);
    const text = textOf(tree);
    expect(text).not.toContain('Dana Chu and Me');
    expect(text).not.toContain('1:32');
    expect(findButton(tree, 'Export')).toBeUndefined();
    act(() => tree.unmount());
  });

  it('takes the invitation off the screen when it is dismissed', () => {
    // It used to leave a contact row offering to join instead, the contact
    // list being the other way in. There is no such row now: the channel is
    // the row, and dismissing one is saying not this, not now.
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

    const tree = render(<HomeView {...homeNav} />);
    const [dismiss] = tree.root.findAll(
      (n: ReactTestInstance) => n.props?.accessibilityLabel === 'Dismiss invite'
    );
    expect(dismiss).toBeDefined();
    act(() => dismiss.props.onPress());
    expect(mockApp.dismissInvite).toHaveBeenCalledWith('sess_a');

    // Dismissal lives in the provider now, so re-render with it applied.
    act(() => tree.update(<HomeView {...homeNav} />));
    expect(textOf(tree)).not.toContain('tap to join');
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

    const first = render(<HomeView {...homeNav} />);
    const [dismiss] = first.root.findAll(
      (n: ReactTestInstance) => n.props?.accessibilityLabel === 'Dismiss invite'
    );
    act(() => dismiss.props.onPress());
    act(() => first.unmount());

    // Home is mounted afresh, as it is on returning from a channel.
    const second = render(<HomeView {...homeNav} />);
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

    const tree = render(<HomeView {...homeNav} />);
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

    const tree = render(<HomeView {...homeNav} />);
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
    const tree = render(<HomeView {...homeNav} />);
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

  it('is not emptied by a snapshot for another channel', () => {
    // The app watches several channels and is sent a snapshot for each. This
    // screen reads the one it is about; taking whichever arrived last is what
    // put a live conversation behind "Loading channel…" and hung up its audio.
    showChannel(channelOf());
    mockApp.channelViews['chan_elsewhere'] = {
      ...mockApp.channelViews['sess_1']!,
      channel: { ...channelOf(), id: 'chan_elsewhere' },
      serverNow: NOW + 1000,
    };
    const tree = render(<ChannelView
        channelId="sess_1"
        audio={AUDIO}
        onHome={() => {}}
        onExit={() => {}}
      />);
    expect(textOf(tree)).not.toContain('Loading channel');
    act(() => tree.unmount());
  });

  it('says a gone channel is gone rather than loading forever', () => {
    // An ended channel is kept for half a minute and then deleted, and the
    // server reports it gone. No snapshot is ever coming, so a wait is a lie.
    mockApp.goneChannels = ['sess_1'];
    const tree = render(<ChannelView
        channelId="sess_1"
        audio={AUDIO}
        onHome={() => {}}
        onExit={() => {}}
      />);
    expect(textOf(tree)).toContain('Channel gone');
    expect(textOf(tree)).not.toContain('Loading channel');
    expect(findButton(tree, 'Back to home')).toBeDefined();
    act(() => tree.unmount());
  });

  /**
   * The rename field lives in this screen's scroll view, and a bare
   * `ScrollView` does not shrink when the keyboard opens: the field ends up
   * underneath it with nothing to scroll to, because the space is there and is
   * merely covered. Every other screen goes through `Screen` for exactly this,
   * and this one hand-rolled its own scroll view and did not — so renaming a
   * recording on a handset meant typing into a field nobody could see.
   *
   * Asserted on the wrapper rather than on `Screen` itself, because what has to
   * hold is the behaviour rather than which component supplies it.
   */
  it('keeps its scroll view inside a keyboard-avoiding wrapper', () => {
    showChannel(channelOf());
    const tree = render(<ChannelView
        channelId="sess_1"
        audio={AUDIO}
        onHome={() => {}}
        onExit={() => {}}
      />);
    expect(tree.root.findAll((n) => n.type === KeyboardAvoidingView)).toHaveLength(1);
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
    // And it can be attempted again: the failure is stated above the button,
    // which is offered unchanged rather than relabelled about it.
    expect(findButton(tree, 'Record')).toBeDefined();
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

  /**
   * An upload that has stalled looks exactly like one that is working, and
   * before this there was nothing to do about either. The percentage says
   * which it is and Cancel is the way out; both of them are about the middle
   * of an upload, so all of this happens while the promise is still open.
   */
  it('counts an upload up and offers a way out of it', async () => {
    showChannel(channelOf());
    const tree = render(<ChannelView
        channelId="sess_1"
        audio={AUDIO}
        onHome={() => {}}
        onExit={() => {}}
      />);

    await act(async () => {
      findButton(tree, 'Play something together')!.props.onPress();
    });

    // The picker has closed and the bytes have not moved: there is no
    // percentage yet, and a Cancel with nothing to cancel is offered and
    // refused rather than hidden and then appearing.
    expect(textOf(tree)).toContain('Uploading…');
    expect(textOf(tree)).not.toContain('%');
    expect(findButton(tree, 'Cancel upload')!.props.disabled).toBe(true);

    const cancel = jest.fn();
    act(() => uploads[0]!.hooks.onStart!(cancel));
    act(() => uploads[0]!.hooks.onProgress!(42));
    expect(textOf(tree)).toContain('Uploading… 42%');

    act(() => findButton(tree, 'Cancel upload')!.props.onPress());
    expect(cancel).toHaveBeenCalled();

    // Cancelling is a decision rather than a failure, so the screen goes back
    // to offering the upload and says nothing about an error.
    await act(async () => uploads[0]!.finish({ cancelled: true }));
    expect(findButton(tree, 'Cancel upload')).toBeUndefined();
    expect(findButton(tree, 'Play something together')).toBeDefined();
    expect(textOf(tree)).not.toContain('Uploading');
    act(() => tree.unmount());
  });

  it('says what failed, and stops uploading, when an upload fails', async () => {
    showChannel(channelOf());
    const tree = render(<ChannelView
        channelId="sess_1"
        audio={AUDIO}
        onHome={() => {}}
        onExit={() => {}}
      />);

    await act(async () => {
      findButton(tree, 'Play something together')!.props.onPress();
    });
    await act(async () => uploads[0]!.fail(new Error('Cannot reach the server.')));

    expect(textOf(tree)).toContain('Cannot reach the server.');
    expect(findButton(tree, 'Cancel upload')).toBeUndefined();
    expect(findButton(tree, 'Play something together')!.props.disabled)
      .toBeFalsy();
    act(() => tree.unmount());
  });

  it('has a label for an upload whose size the platform will not say', () => {
    // -1 expected bytes reaches the screen as a null percentage, and a button
    // reading "Uploading… null%" is worse than one that only says it is busy.
    expect(uploadingLabel(null)).toBe('Uploading…');
    expect(uploadingLabel(0)).toBe('Uploading… 0%');
    expect(uploadingLabel(100)).toBe('Uploading… 100%');
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
    // acct_4 was invited and has never entered. "Invited" rather than
    // "Waiting for them to join", which it read until 2026-08-20: the roster
    // now has a genuine waiting state for somebody who is holding on for
    // *others*, and two adjacent rows both beginning "Waiting" meant opposite
    // things — one person who has not come, one who has and is still there.
    expect(text).toContain('Invited');
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
    // Bare: no sublabel and no heading over it. Somebody reaching for this one
    // knows what it does, and the words were saying so a second time.
    expect(labelOf(stepOut!)).not.toContain('You stay a member');
    expect(findButton(tree, 'Leave channel')).toBeUndefined();

    act(() => stepOut!.props.onPress());
    expect(mockApp.act).toHaveBeenCalledWith('sess_1', { type: 'STEP_OUT' });
    act(() => tree.unmount());
  });

  it('puts stepping out above inviting, and inviting above the recordings', () => {
    // The order of the tail of this screen, by how often it is wanted: the way
    // out first, then the way to bring somebody in, then the archive you scroll
    // to on purpose.
    showChannel(channelOf());
    const tree = render(<ChannelView
        channelId="sess_1"
        audio={AUDIO}
        onHome={() => {}}
        onExit={() => {}}
      />);

    const text = textOf(tree);
    expect(text.indexOf('Step out')).toBeGreaterThan(-1);
    expect(text.indexOf('Step out')).toBeLessThan(text.indexOf('Invite'));
    expect(text.indexOf('Invite')).toBeLessThan(text.indexOf('Recordings'));
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

  it('offers the last member a delete rather than a leave', () => {
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

    // Not "Leave": for the last member the control is a different action with
    // a different name, because what it does is destroy the channel and
    // everything recorded in it.
    expect(findButton(tree, 'Leave channel')).toBeUndefined();
    expect(labelOf(findButton(tree, 'Delete channel')!)).toContain(
      'destroys it for good'
    );
    act(() => tree.unmount());
  });

  it('opens the system output picker from settings', async () => {
    // Ours to place, not ours to build: iOS knows what is connected and this
    // app cannot — nothing in the audio stack tells JavaScript what outputs
    // exist. So the button raises the system sheet and nothing more.
    const { AudioSession } = require('@livekit/react-native');
    AudioSession.showAudioRoutePicker.mockClear();

    showChannel(channelOf());
    const tree = render(<ChannelView
        channelId="sess_1"
        audio={AUDIO}
        onHome={() => {}}
        onExit={() => {}}
      />);
    act(() => findButton(tree, 'Settings')!.props.onPress());

    const picker = findButton(tree, 'Choose where sound comes out');
    expect(picker).toBeDefined();
    await act(async () => picker!.props.onPress());
    expect(AudioSession.showAudioRoutePicker).toHaveBeenCalled();
    act(() => tree.unmount());
  });

  it('lists the recordings made in it, which is where they now live', async () => {
    // They were on Home, which put every conversation anyone had ever recorded
    // into one list belonging to nothing. A recording belongs to the channel:
    // it is what names it, and what deleting takes it with.
    showChannel(channelOf(), [
      {
        id: 'rec_1',
        channelId: 'sess_1',
        name: 'Book club',
        others: [{ id: THEM, displayName: 'Dana Chu' }],
        startedAt: NOW - 60_000,
        endedAt: NOW - 30_000,
        durationMs: 30_000,
      },
    ]);
    const tree = render(<ChannelView
        channelId="sess_1"
        audio={AUDIO}
        onHome={() => {}}
        onExit={() => {}}
      />);
    const text = textOf(tree);
    expect(text).toContain('Book club');
    expect(text).not.toContain('Nothing recorded here yet');

    // Closed until asked: the list is what this section is for, and the
    // actions belong to whichever row somebody has opened.
    expect(findButton(tree, 'Export')).toBeUndefined();
    act(() => findButton(tree, 'Book club')!.props.onPress());

    // Exported under the recording's own name, which the server fixed when the
    // run stopped — not a label rebuilt here from the roster, which is how two
    // people came to call one recording two different things.
    const { exportRecording } = require('../../api/download');
    exportRecording.mockClear();
    await act(async () => findButton(tree, 'Export')!.props.onPress());
    expect(exportRecording).toHaveBeenCalledWith(
      'token',
      'rec_1',
      'Book club',
      NOW - 30_000
    );
    act(() => tree.unmount());
  });

  it('offers to play one, and says who decides when it cannot', () => {
    // Playing loads the recording as the channel's shared track, so the rule
    // is the one that already governs a track: whoever holds the floor decides
    // what plays. A disabled button with no reason beside it is the thing this
    // avoids.
    const recording: RecordingView = {
      id: 'rec_1',
      channelId: 'sess_1',
      name: 'Tuesday',
      others: [{ id: THEM, displayName: 'Dana Chu' }],
      startedAt: NOW - 60_000,
      endedAt: NOW - 30_000,
      durationMs: 30_000,
    };

    showChannel(channelOf(), [recording]);
    const mine = render(<ChannelView
        channelId="sess_1"
        audio={AUDIO}
        onHome={() => {}}
        onExit={() => {}}
      />);
    act(() => findButton(mine, 'Tuesday')!.props.onPress());
    expect(findButton(mine, 'Play')!.props.disabled).toBeFalsy();
    act(() => mine.unmount());

    showChannel(
      channelOf((s) => reduce(s, { type: 'CLAIM_FLOOR', userId: THEM }, NOW)),
      [recording]
    );
    const theirs = render(<ChannelView
        channelId="sess_1"
        audio={AUDIO}
        onHome={() => {}}
        onExit={() => {}}
      />);
    act(() => findButton(theirs, 'Tuesday')!.props.onPress());
    expect(findButton(theirs, 'Play')!.props.disabled).toBe(true);
    expect(textOf(theirs)).toContain('the floor decides what plays');
    act(() => theirs.unmount());
  });

  it('opens a recording to its actions, and closes it again', async () => {
    const recording: RecordingView = {
      id: 'rec_1',
      channelId: 'sess_1',
      name: 'Tuesday',
      others: [{ id: THEM, displayName: 'Dana Chu' }],
      startedAt: NOW - 60_000,
      endedAt: NOW - 30_000,
      durationMs: 30_000,
    };
    showChannel(channelOf(), [recording]);
    const tree = render(<ChannelView
        channelId="sess_1"
        audio={AUDIO}
        onHome={() => {}}
        onExit={() => {}}
      />);

    // Export, Rename and Delete rather than Play, which is also the name of
    // the shared audio control further up the screen.
    for (const label of ['Export', 'Rename', 'Delete']) {
      expect(findButton(tree, label)).toBeUndefined();
    }

    act(() => findButton(tree, 'Tuesday')!.props.onPress());
    for (const label of ['Export', 'Rename', 'Delete']) {
      expect(findButton(tree, label)).toBeDefined();
    }

    // One row's worth of actions at a time: tapping it again puts them away.
    act(() => findButton(tree, 'Tuesday')!.props.onPress());
    expect(findButton(tree, 'Delete')).toBeUndefined();
    act(() => tree.unmount());
  });

  it('asks before deleting one, and marks it when told to', async () => {
    // Deleting is marking: it leaves every list now and the audio goes in the
    // sweep a week later. Everyone in the channel loses it, which is why this
    // is the one row action that asks first.
    const recording: RecordingView = {
      id: 'rec_1',
      channelId: 'sess_1',
      name: 'Tuesday',
      others: [{ id: THEM, displayName: 'Dana Chu' }],
      startedAt: NOW - 60_000,
      endedAt: NOW - 30_000,
      durationMs: 30_000,
    };
    showChannel(channelOf(), [recording]);
    const tree = render(<ChannelView
        channelId="sess_1"
        audio={AUDIO}
        onHome={() => {}}
        onExit={() => {}}
      />);
    act(() => findButton(tree, 'Tuesday')!.props.onPress());

    const { Alert } = require('react-native');
    const asked = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const { api } = require('../../api/http');
    const deleted = jest
      .spyOn(api, 'deleteRecording')
      .mockResolvedValue({ ok: true } as never);

    act(() => findButton(tree, 'Delete')!.props.onPress());
    expect(asked).toHaveBeenCalled();
    // Nothing has happened yet — the question is the point.
    expect(deleted).not.toHaveBeenCalled();

    // Take the destructive choice the alert offered.
    const actions = asked.mock.calls[0][2] as Array<{
      style?: string;
      onPress?: () => void;
    }>;
    const confirm = actions.find((a) => a.style === 'destructive')!;
    await act(async () => confirm.onPress!());
    expect(deleted).toHaveBeenCalledWith('token', 'rec_1');

    asked.mockRestore();
    deleted.mockRestore();
    act(() => tree.unmount());
  });

  it('renames one from the row, starting on the name it already has', async () => {
    const recording: RecordingView = {
      id: 'rec_1',
      channelId: 'sess_1',
      name: 'Tuesday',
      others: [{ id: THEM, displayName: 'Dana Chu' }],
      startedAt: NOW - 60_000,
      endedAt: NOW - 30_000,
      durationMs: 30_000,
    };
    showChannel(channelOf(), [recording]);
    const tree = render(<ChannelView
        channelId="sess_1"
        audio={AUDIO}
        onHome={() => {}}
        onExit={() => {}}
      />);
    act(() => findButton(tree, 'Tuesday')!.props.onPress());

    const { api } = require('../../api/http');
    const renamed = jest
      .spyOn(api, 'renameRecording')
      .mockResolvedValue({ ok: true } as never);

    act(() => findButton(tree, 'Rename')!.props.onPress());
    // The field takes the place of the actions, so nothing destructive sits
    // beside a keyboard somebody is typing into.
    expect(findButton(tree, 'Delete')).toBeUndefined();
    // And it says who else this reaches, before the tap rather than after.
    expect(textOf(tree)).toContain('Everyone in this channel sees the new name');

    const field = tree.root.findAll(
      (n) => n.props?.placeholder === 'What was this conversation?'
    )[0];
    // Amending, not starting over: the current name is already in it.
    expect(field.props.value).toBe('Tuesday');

    // An empty name is refused here rather than at the server, since clearing
    // one is not a thing a recording can be.
    act(() => field.props.onChangeText('   '));
    expect(findButton(tree, 'Save')!.props.disabled).toBe(true);

    act(() => field.props.onChangeText('Tuesday planning'));
    await act(async () => findButton(tree, 'Save')!.props.onPress());
    expect(renamed).toHaveBeenCalledWith('token', 'rec_1', 'Tuesday planning');

    // Done: the row is back to offering actions, and the new name arrives on
    // the next snapshot rather than being patched in here.
    expect(findButton(tree, 'Delete')).toBeDefined();

    renamed.mockRestore();
    act(() => tree.unmount());
  });

  it('abandons a rename when the row is closed', async () => {
    const recording: RecordingView = {
      id: 'rec_1',
      channelId: 'sess_1',
      name: 'Tuesday',
      others: [{ id: THEM, displayName: 'Dana Chu' }],
      startedAt: NOW - 60_000,
      endedAt: NOW - 30_000,
      durationMs: 30_000,
    };
    showChannel(channelOf(), [recording]);
    const tree = render(<ChannelView
        channelId="sess_1"
        audio={AUDIO}
        onHome={() => {}}
        onExit={() => {}}
      />);

    act(() => findButton(tree, 'Tuesday')!.props.onPress());
    act(() => findButton(tree, 'Rename')!.props.onPress());
    act(() => findButton(tree, 'Tuesday')!.props.onPress());
    act(() => findButton(tree, 'Tuesday')!.props.onPress());
    // Reopening offers the actions again, not the half-typed name of something
    // somebody had already changed their mind about.
    expect(findButton(tree, 'Rename')).toBeDefined();
    act(() => tree.unmount());
  });

  it('survives a server too old to send them', () => {
    // The field is additive, so a build carrying this screen meets a server
    // without it between its release and the deploy that follows.
    showChannel(channelOf());
    mockApp.channelViews['sess_1'] = {
      ...mockApp.channelViews['sess_1']!,
      recordings: undefined as never,
    };
    const tree = render(<ChannelView
        channelId="sess_1"
        audio={AUDIO}
        onHome={() => {}}
        onExit={() => {}}
      />);
    expect(textOf(tree)).toContain('Nothing recorded here yet');
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
    // One leaves and the last deletes, which is the only thing that ends a
    // channel now.
    showChannel(
      channelOf((s) => {
        const half = reduce(s, { type: 'LEAVE_CHANNEL', userId: THEM }, NOW);
        return reduce(half, { type: 'DELETE_CHANNEL', userId: ME }, NOW);
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
    // Under a channel name the roster is the only place the other party's
    // name appears, so it must carry it even in a 1:1 — which the card does
    // unconditionally, the old status line having spelt it only sometimes.
    expect(text).toContain('Dana Chu');
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

    // Tapping the way back straight from the field keeps it, which is the trap
    // the old pair of Save buttons set: Done sat above both and discarded.
    act(() => findButton(tree, 'Back')!.props.onPress());
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
    // No Save button: leaving the field is what keeps it.
    expect(findButton(tree, 'Save name')).toBeUndefined();
    act(() => field.props.onBlur());
    expect(mockApp.act).toHaveBeenCalledWith('sess_1', {
      type: 'SET_NAME',
      name: 'Book club',
    });

    // And it does not close the screen out from under somebody who was also
    // going to write a description.
    expect(textOf(tree)).toContain('Channel settings');
    act(() => findButton(tree, 'Back')!.props.onPress());
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

  /**
   * The privacy policy, which Guideline 5.1.1(i) requires to be reachable from
   * inside the application and not only from the App Store listing.
   *
   * The page itself is the server's, and tested there. What is asserted here is
   * that there is a way to it, and that it points at the server actually
   * holding the data rather than at a URL somebody typed into the app.
   */
  describe('the privacy policy link', () => {
    it('is offered on the settings screen', async () => {
      // That it points at *this* app's server is asserted in
      // privacyLink.test.tsx, which needs the address configured at import time
      // and so cannot share this file's module registry.
      const tree = await openSettings();
      expect(findButton(tree, 'Privacy policy')).toBeDefined();
      act(() => tree.unmount());
    });

    it('says so rather than opening nothing when there is no server', async () => {
      // Which is the case here: these tests run with no EXPO_PUBLIC_API_URL,
      // the same state a development build with no `app/.env` is in.
      const { Linking } = require('react-native');
      const opened = jest
        .spyOn(Linking, 'openURL')
        .mockResolvedValue(undefined as never);

      const tree = await openSettings();
      await act(async () =>
        findButton(tree, 'Privacy policy')!.props.onPress()
      );

      expect(opened).not.toHaveBeenCalled();
      expect(textOf(tree)).toContain('No server configured');

      opened.mockRestore();
      act(() => tree.unmount());
    });
  });

  /**
   * Deleting the account, which App Store Guideline 5.1.1(v) requires to be
   * reachable from inside the application rather than by writing to anybody.
   *
   * What is asserted here is the shape of the offer — findable on the settings
   * screen, asked about before it happens, and honest about what it takes — not
   * what the server does with it, which is the server's own test.
   */
  describe('deleting the account', () => {
    const alertSpy = () => {
      const { Alert } = require('react-native');
      return jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    };

    it('is offered on the same screen as signing out', async () => {
      const tree = await openSettings();
      expect(findButton(tree, 'Delete account')).toBeDefined();
      expect(findButton(tree, 'Sign out')).toBeDefined();
      act(() => tree.unmount());
    });

    it('asks first, and says what it does not take', async () => {
      const asked = alertSpy();
      const tree = await openSettings();

      act(() => findButton(tree, 'Delete account')!.props.onPress());
      expect(asked).toHaveBeenCalled();
      expect(mockApp.deleteAccount).not.toHaveBeenCalled();

      // The part nobody would guess: a channel is not yours to take with you.
      // "This cannot be undone" alone would be true and useless.
      const body = asked.mock.calls[0][1] as string;
      expect(body).toContain('carry on without you');
      expect(body).toContain('cannot be undone');

      asked.mockRestore();
      act(() => tree.unmount());
    });

    it('does it when the destructive choice is taken', async () => {
      const asked = alertSpy();
      const tree = await openSettings();
      act(() => findButton(tree, 'Delete account')!.props.onPress());

      const actions = asked.mock.calls[0][2] as Array<{
        style?: string;
        onPress?: () => void;
      }>;
      await act(async () =>
        actions.find((a) => a.style === 'destructive')!.onPress!()
      );
      expect(mockApp.deleteAccount).toHaveBeenCalled();

      asked.mockRestore();
      act(() => tree.unmount());
    });

    it('stays put and says so when the server refused', async () => {
      // The failure that matters: a screen claiming the account is gone while
      // the server still has one would leave nobody able to try again.
      const asked = alertSpy();
      mockApp.deleteAccount.mockRejectedValueOnce(
        new Error('server said no') as never
      );
      const tree = await openSettings();
      act(() => findButton(tree, 'Delete account')!.props.onPress());

      const actions = asked.mock.calls[0][2] as Array<{
        style?: string;
        onPress?: () => void;
      }>;
      await act(async () =>
        actions.find((a) => a.style === 'destructive')!.onPress!()
      );
      expect(textOf(tree)).toContain('server said no');
      expect(findButton(tree, 'Delete account')).toBeDefined();

      asked.mockRestore();
      act(() => tree.unmount());
    });
  });


  it('holds signing out, which is no longer on Home', () => {
    // It sat in the header beside a dozen harmless taps. Here it is among the
    // other things that are about the account rather than about a channel.
    const tree = render(
      <HomeView {...homeNav} />
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
      <HomeView {...homeNav} onOpenSettings={onOpenSettings} />
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
        {...homeNav}
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
        {...homeNav}
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

  it('does not also list the channel the banner is showing', () => {
    // The server now sends every channel you belong to, the one you are in
    // included, because withholding it is what made it invisible when the two
    // ends disagreed about where you were. The banner and the row are two
    // renderings of one channel, so exactly one of them appears.
    mockApp.home = {
      invites: [],
      rejoinable: [
        {
          channelId: 'sess_1',
          name: 'Book club',
          others: [{ id: 'acct_2', displayName: 'Dana Chu' }],
          presentCount: 2,
          createdAt: 1,
          lastActiveAt: 2,
        },
      ],
      contacts: [],
      recordings: [],
    };
    const tree = render(
      <HomeView
        {...homeNav}
        liveChannel={{
          channelId: 'sess_1',
          title: 'Book club',
          present: 2,
          muted: false,
        }}
        onReturnToChannel={() => {}}
      />
    );
    const text = textOf(tree).replace(/\s+/g, ' ');
    expect(text).toContain('tap to go back');
    expect(text.match(/Book club/g)).toHaveLength(1);
    act(() => tree.unmount());
  });

  it('lists a channel the server thinks you are in when this app is not', () => {
    // The reinstall case, and the invariant that answers it: a channel you
    // belong to is reachable from Home whatever the server believes about your
    // presence. With no banner to render it — this process has entered
    // nothing — the row is what must be there.
    mockApp.home = {
      invites: [],
      rejoinable: [
        {
          channelId: 'sess_1',
          name: 'A Priori',
          others: [{ id: 'acct_2', displayName: 'Dana Chu' }],
          presentCount: 1,
          createdAt: 1,
          lastActiveAt: 2,
        },
      ],
      contacts: [],
      recordings: [],
    };
    const tree = render(
      <HomeView {...homeNav} />
    );
    expect(textOf(tree)).toContain('A Priori');
    act(() => tree.unmount());
  });

  it('shows nothing when you are not in one', () => {
    home();
    const tree = render(
      <HomeView {...homeNav} />
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
      <HomeView {...homeNav} />
    );
    const text = textOf(tree);
    expect(text).toContain('A few seconds ago');
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
      <HomeView {...homeNav} />
    );
    expect(textOf(tree)).not.toContain('Reconnecting');
    act(() => tree.unmount());
  });

  it('speaks up once the connection has had its chance', () => {
    jest.useFakeTimers();
    empty();
    mockApp.status = 'closed';
    const tree = render(
      <HomeView {...homeNav} />
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
      <HomeView {...homeNav} />
    );
    const show = (status: 'connecting' | 'open' | 'closed') => {
      mockApp.status = status;
      act(() => {
        tree.update(
          <HomeView {...homeNav} />
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
      <HomeView {...homeNav} />
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
      <HomeView {...homeNav} />
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
  ): HomeViewData['rejoinable'][number] => ({
    channelId: id,
    name,
    others: [{ id: `acct_${id}`, displayName: other }],
    presentCount: 0,
    createdAt: NOW,
    lastActiveAt,
    // The two are the same by default: a channel that has been used, last used
    // when it was last entered or left. The tests that care set them apart.
    lastPresenceAt: lastActiveAt,
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
      <HomeView {...homeNav} />
    );
  };

  it('ranks a described channel above a staler named one', () => {
    // The old rule was the other way about — every named channel above every
    // described one, on the reasoning that a name is something somebody chose
    // to write. It buried the freshest conversation on the screen under
    // whatever had been named and abandoned. One list, one order: least idle
    // first, and the name still reads as a name.
    const tree = show([
      channel('a', null, NOW),
      channel('b', 'Thursday rehearsal', NOW - 900_000),
    ]);
    expect(titlesIn(tree, ['Thursday rehearsal', 'Miro Okafor'])).toEqual([
      'Miro Okafor',
      'Thursday rehearsal',
    ]);
    act(() => tree.unmount());
  });

  it('sinks a channel nobody has ever been in, whatever its stamp says', () => {
    // The standing channel a pair of contacts get. Its `lastPresenceAt` is the
    // moment it was made, which is not a visit — without `everUsed` it would
    // arrive at the top of the list as the freshest thing on it.
    const tree = show([
      { ...channel('a', null, NOW, 'Dana Chu'), everUsed: false },
      channel('b', 'Standup', NOW - 900_000),
    ]);
    expect(titlesIn(tree, ['Standup', 'Dana Chu'])).toEqual([
      'Standup',
      'Dana Chu',
    ]);
    expect(textOf(tree)).toContain('Not used yet');
    act(() => tree.unmount());
  });

  it('orders the never-used ones by name, there being nothing else true', () => {
    const tree = show([
      { ...channel('a', null, NOW, 'Priya Raman'), everUsed: false },
      { ...channel('b', null, NOW - 900_000, 'Dana Chu'), everUsed: false },
    ]);
    expect(titlesIn(tree, ['Dana Chu', 'Priya Raman'])).toEqual([
      'Dana Chu',
      'Priya Raman',
    ]);
    act(() => tree.unmount());
  });

  it('reads recency from the presence stamp, not from the last entry', () => {
    // `lastActiveAt` freezes for the whole of a conversation — it moves on an
    // entry and an exit and at no point between. A channel two people have
    // been talking in for an hour must not sink below one somebody walked out
    // of five minutes ago.
    const tree = show([
      { ...channel('a', 'Talking now', NOW - 3_600_000), lastPresenceAt: NOW },
      {
        ...channel('b', 'Left recently', NOW - 300_000),
        lastPresenceAt: NOW - 300_000,
      },
    ]);
    expect(titlesIn(tree, ['Talking now', 'Left recently'])).toEqual([
      'Talking now',
      'Left recently',
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
 * A channel row is a single target rather than a button on the end of one:
 * there is one thing to do with a channel you are not in. Contact rows were
 * briefly the way to a profile and are gone with the contact list; the roster
 * inside a channel opens one, and the Contacts View will.
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

  it('leaves a sent request alone, there being no account behind it yet', () => {
    // `displayName` holds the address for these rows, and there is no person
    // behind it to open — which is the point of the row carrying no id. A
    // request is listed and answered, and is not a target.
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
      <HomeView {...homeNav} />
    );

    expect(textOf(tree)).toContain('nobody@example.com');
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
      <HomeView {...homeNav} onEnterChannel={onEnterChannel} />
    );

    expect(findButton(tree, 'Step in')).toBeUndefined();
    act(() => pressableFor(tree, 'Thursday rehearsal').props.onPress());
    expect(mockApp.act).toHaveBeenCalledWith('sess_b', { type: 'ENTER' });
    expect(onEnterChannel).toHaveBeenCalledWith('sess_b');
    act(() => tree.unmount());
  });

  /**
   * Starting a channel asks nobody anything. It used to arm a selection mode
   * over the contact list, which was a form to fill in before the first
   * channel could exist and which was hidden until you had two contacts —
   * exactly backwards for somebody with nowhere to talk yet.
   */
  it('starts a channel with nobody in it and walks straight in', async () => {
    const onEnterChannel = jest.fn();
    mockApp.startChannel.mockResolvedValue('sess_alone');
    mockApp.home = {
      invites: [],
      rejoinable: [],
      contacts: [],
      recordings: [],
    };
    const tree = render(
      <HomeView {...homeNav} onEnterChannel={onEnterChannel} />
    );

    // Offered with an empty contact list, which the old affordance was not.
    expect(findButton(tree, 'Start a channel with several people')).toBeUndefined();
    await act(async () => {
      findButton(tree, 'Start a channel')!.props.onPress();
    });

    expect(mockApp.startChannel).toHaveBeenCalledWith([]);
    expect(mockApp.act).toHaveBeenCalledWith('sess_alone', { type: 'ENTER' });
    expect(onEnterChannel).toHaveBeenCalledWith('sess_alone');
    act(() => tree.unmount());
  });

  /**
   * The row lives at the foot of the channel list, and the list is only
   * *labelled* when there is a channel in it — so the row has to sit outside
   * that guard. Rendering it inside would hide the only way to open a channel
   * from the one account that has none, which is the mistake the affordance it
   * replaced already made once.
   */
  it('offers to start one whether or not there are channels already', () => {
    const withChannel = {
      invites: [],
      rejoinable: [
        {
          channelId: 'sess_b',
          name: 'Thursday rehearsal',
          others: [{ id: 'acct_x', displayName: 'Miro Okafor' }],
          presentCount: 0,
          createdAt: NOW,
          lastActiveAt: NOW,
        },
      ],
      contacts: [],
      recordings: [],
    };

    for (const home of [withChannel, { ...withChannel, rejoinable: [] }]) {
      mockApp.home = home;
      const tree = render(
        <HomeView {...homeNav} />
      );
      expect(findButton(tree, 'Start a channel')).toBeDefined();
      act(() => tree.unmount());
    }
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

  it('measures idleness the way Home does', async () => {
    // It used to say "Nobody here right now" for any empty channel whatever
    // its age, so the room Home called two hours ago read here as merely
    // empty, and one neither of you had ever opened claimed to have been
    // left. One function draws both lines now.
    withChannels([
      { ...channel('sess_quiet', 'Thursday rehearsal', THEM),
        lastPresenceAt: NOW - 2 * 3_600_000 },
      { ...channel('sess_new', 'Never opened', THEM), everUsed: false },
    ]);

    let tree!: ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(
        <ProfileView
          accountId={THEM}
          fallbackName="Dana Chu"
          onBack={() => {}}
          onEnterChannel={() => {}}
        />
      );
    });

    const text = textOf(tree);
    expect(text).toContain('2 hours ago');
    expect(text).toContain('Not used yet');
    expect(text).not.toContain('Nobody here right now');
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

/**
 * The one notification a person composes and aims, so the composer is the one
 * place in the app where a text field feeds a push.
 *
 * The gating is what these are about. It is offered for somebody who is not in
 * the room and withheld for somebody who is, and the server refuses on the same
 * test — so a screen left open while they walked in is refused rather than
 * silently sending.
 */
describe('pinging somebody who is not in the room', () => {
  /** Button carries no accessibility label, so it is found by its own props. */
  const buttonFor = (tree: ReactTestRenderer, label: string) =>
    tree.root.findAll((n) => n.props?.label === label)[0];

  const renderProfile = async (
    onPing?: (text: string) => Promise<void>,
    pingableAt?: number | null
  ) => {
    mockApp.home = { invites: [], rejoinable: [], contacts: [], recordings: [] };
    let tree!: ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(
        <ProfileView
          accountId={THEM}
          fallbackName="Dana Chu"
          onBack={() => {}}
          onPing={onPing}
          pingableAt={pingableAt}
        />
      );
    });
    return tree;
  };

  it('offers the composer when a ping is possible', async () => {
    const tree = await renderProfile(async () => {});

    expect(textOf(tree)).toContain('Ping');
    expect(textOf(tree)).toContain('They will get a notification.');
    act(() => tree.unmount());
  });

  /**
   * Not disabled — absent. An affordance that is present and refuses is worse
   * than one that was never offered, which is the same rule the channels
   * section above follows.
   */
  it('says nothing at all about pinging somebody who is here', async () => {
    const tree = await renderProfile(undefined);

    expect(textOf(tree)).not.toContain('Send ping');
    act(() => tree.unmount());
  });

  it('says how long until the next ping instead of a button that would fail', async () => {
    // The server has always refused inside the window. Offering the composer
    // anyway meant the only way to learn that was to type something and be
    // told no, which loses the words as well as the ping.
    const tree = await renderProfile(async () => {}, NOW + 4 * 60_000);

    expect(textOf(tree)).toContain('They have just been pinged.');
    expect(textOf(tree)).toContain('You can ping them again in 4 minutes.');
    expect(textOf(tree)).not.toContain('Send ping');
    act(() => tree.unmount());
  });

  it('offers the composer again once the window has passed', async () => {
    // A deadline in the past is not a wait of zero, it is no wait at all.
    const tree = await renderProfile(async () => {}, NOW - 1_000);

    expect(textOf(tree)).toContain('Send ping');
    expect(textOf(tree)).not.toContain('You can ping them again');
    act(() => tree.unmount());
  });

  it('sends what was typed, and says so afterwards', async () => {
    const onPing = jest.fn(async () => {});
    const tree = await renderProfile(onPing);

    const field = tree.root.findAll(
      (n) => n.props?.placeholder === 'Anything you want to say (optional)'
    )[0];
    await act(async () => field.props.onChangeText('we are starting'));
    await act(async () => buttonFor(tree, 'Send ping').props.onPress());

    expect(onPing).toHaveBeenCalledWith('we are starting');
    expect(textOf(tree)).toContain('Sent.');
    act(() => tree.unmount());
  });

  /**
   * A refusal here is an answer rather than a fault — they walked in, or
   * somebody pinged them a moment ago — so it is shown where it was asked for.
   */
  it('shows what the server said when it refuses', async () => {
    const onPing = jest.fn(async () => {
      throw new Error('They have just been pinged. Try again in a few minutes.');
    });
    const tree = await renderProfile(onPing);

    await act(async () => buttonFor(tree, 'Send ping').props.onPress());

    expect(textOf(tree)).toContain('They have just been pinged');
    expect(textOf(tree)).not.toContain('Sent.');
    act(() => tree.unmount());
  });
});

/**
 * A microphone that is closed because nobody is there to hear it.
 *
 * Being alone in a channel no longer takes the audio session as a call, which
 * is what leaves a Bluetooth speaker on A2DP and other apps audible. The
 * screen has to say so: a microphone the interface calls open and is not is
 * precisely the silent state this app keeps writing warnings about.
 */
describe('being alone in a channel', () => {
  const showAudio = (micOpen: boolean) => ({ ...AUDIO, micOpen });

  const renderAlone = (micOpen: boolean) => {
    showChannel(channelOf());
    return render(
      <ChannelView
        channelId="sess_1"
        audio={{ ...showAudio(micOpen), status: 'connected' as const }}
        onHome={() => {}}
        onExit={() => {}}
      />
    );
  };

  it('says the microphone is closed, and why', () => {
    const tree = renderAlone(false);
    const text = textOf(tree);
    expect(text).toContain('Closed until somebody else is here');
    expect(text).toContain('your other apps keep the speakers');
    expect(text).not.toContain('Open. Self-mute never affects');
    act(() => tree.unmount());
  });

  it('says so in the audio line too, rather than only waiting', () => {
    expect(textOf(renderAlone(false))).toContain(
      'microphone closed until somebody else is here'
    );
  });

  it('goes back to plain open copy once it is capturing', () => {
    const tree = renderAlone(true);
    const text = textOf(tree);
    expect(text).toContain('Open. Self-mute never affects floor eligibility.');
    expect(text).not.toContain('Closed until somebody else is here');
    act(() => tree.unmount());
  });

  it('still reports self-mute ahead of it, that being a choice', () => {
    // Muting yourself while alone is a decision; the microphone being closed
    // is housekeeping. The decision is what a person needs told back.
    showChannel(
      channelOf((s) =>
        reduce(s, { type: 'SET_SELF_MUTE', userId: ME, muted: true }, NOW)
      )
    );
    const tree = render(
      <ChannelView
        channelId="sess_1"
        audio={{ ...showAudio(false), status: 'connected' as const }}
        onHome={() => {}}
        onExit={() => {}}
      />
    );
    expect(textOf(tree)).toContain('Muted by you.');
    expect(textOf(tree)).not.toContain('Closed until somebody else is here');
    act(() => tree.unmount());
  });
});

/**
 * Choosing a colour scheme.
 *
 * What the choice *looks* like cannot be asserted here — the colours resolve
 * in UIKit, below anything JavaScript observes. What can be asserted is that
 * the screen offers the three choices, marks the current one, and reports a
 * change upward rather than keeping it to itself.
 */
describe('the appearance setting', () => {
  const openSettings = async () => {
    let tree!: ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(<HomeSettingsView onBack={() => {}} />);
    });
    return tree;
  };

  it('offers light, dark and following the phone', async () => {
    const tree = await openSettings();
    expect(findButton(tree, 'Light')).toBeDefined();
    expect(findButton(tree, 'Dark')).toBeDefined();
    expect(findButton(tree, 'System')).toBeDefined();
    act(() => tree.unmount());
  });

  it('reports a choice rather than keeping it', async () => {
    const tree = await openSettings();
    act(() => findButton(tree, 'Light')!.props.onPress());
    expect(mockApp.setAppearance).toHaveBeenCalledWith('light');
    act(() => tree.unmount());
  });

  it('marks which one is in force', async () => {
    // Three buttons that all look alike would leave the current scheme
    // guessable only by looking at the screen it is describing.
    mockApp.appearance = 'dark';
    const tree = await openSettings();
    // Button's style is a function of press state, not an array.
    const styleOf = (label: string) =>
      StyleSheet.flatten(
        findButton(tree, label)!.props.style({ pressed: false })
      ) as { backgroundColor?: unknown };
    expect(styleOf('Dark').backgroundColor).not.toBe(
      styleOf('Light').backgroundColor
    );
    expect(styleOf('Light').backgroundColor).toBe(
      styleOf('System').backgroundColor
    );
    act(() => tree.unmount());
  });
});

/**
 * Where somebody is, which decides whether to try them at all.
 *
 * It lived on Home's contact rows until Home became a list of channels and
 * those rows went. Moved rather than deleted: the server still composes it —
 * `ContactView` carries it untouched — and it is shown here, to contacts
 * alone, which is exactly the audience that could see it before.
 */
describe('when somebody was last in the app', () => {
  function profileWith(
    lastSeenAt: number | null | undefined,
    inApp?: boolean,
    status: 'accepted' | 'incoming' = 'accepted'
  ) {
    mockApp.home = {
      invites: [],
      rejoinable: [],
      recordings: [],
      contacts: [
        { account: { id: THEM, displayName: 'Dana Chu' }, status },
      ],
    };
    mockApp.loadProfile.mockResolvedValueOnce({
      account: { id: THEM, displayName: 'Dana Chu' },
      bio: null,
      ...(lastSeenAt === undefined ? {} : { lastSeenAt }),
      ...(inApp === undefined ? {} : { inApp }),
    });
    return render(
      <ProfileView accountId={THEM} fallbackName="Dana Chu" onBack={() => {}} />
    );
  }

  /** Renders and waits for the fetch, which lands in a microtask. */
  async function shown(...args: Parameters<typeof profileWith>) {
    let tree!: ReactTestRenderer;
    await act(async () => {
      tree = profileWith(...args);
    });
    return tree;
  }

  it('says how long ago, in words', async () => {
    mockApp.serverNow = () => NOW + 5 * 60_000;
    const tree = await shown(NOW);
    expect(textOf(tree)).toContain('Last seen 5 minutes ago');
    mockApp.serverNow = () => NOW;
    act(() => tree.unmount());
  });

  it('says they are here rather than counting the seconds', async () => {
    // "A few seconds ago" about somebody sitting in the app is true and
    // useless — and the stored time is a heartbeat stale, so a live user
    // would otherwise flicker between a count and nothing.
    mockApp.serverNow = () => NOW + 3_000;
    const tree = await shown(NOW);
    const text = textOf(tree);
    expect(text).toContain('In the app now');
    expect(text).not.toContain('seconds ago');
    mockApp.serverNow = () => NOW;
    act(() => tree.unmount());
  });

  it('says nothing at all when it does not know', async () => {
    // Three ways to get here and none is worth a word on screen: a server that
    // predates the fields sends none, somebody who has not connected since
    // they existed has nothing recorded, and a reader who is not a contact is
    // told nothing whatever the record says.
    for (const unknown of [null, undefined] as const) {
      const tree = await shown(unknown);
      const text = textOf(tree);
      expect(text).toContain('Dana Chu');
      expect(text).not.toContain('Last seen');
      expect(text).not.toContain('In the app now');
      act(() => tree.unmount());
    }
  });

  it('believes the fact over the arithmetic', async () => {
    // The worked case, on this side of the wire. Dana has been sitting in a
    // channel for an hour, so the timestamp in this snapshot is an hour old —
    // it was true when the server composed it and nothing has been sent
    // since, because nothing needed to be. Reading it as an hour idle is the
    // whole of what the old contact row got wrong.
    mockApp.serverNow = () => NOW + 3_600_000;
    const tree = await shown(NOW, true);
    const text = textOf(tree);
    expect(text).toContain('In the app now');
    expect(text).not.toContain('ago');
    mockApp.serverNow = () => NOW;
    act(() => tree.unmount());
  });

  it('counts from the moment they went, once they have gone', async () => {
    mockApp.serverNow = () => NOW + 5 * 60_000;
    const tree = await shown(NOW, false);
    expect(textOf(tree)).toContain('Last seen 5 minutes ago');
    mockApp.serverNow = () => NOW;
    act(() => tree.unmount());
  });

  it('does not flicker while they are reconnecting', async () => {
    // A tunnel or a lift closes the socket, so `inApp` goes false with the
    // departure a moment ago. No grace period exists on this clock; the
    // sixty-second floor is what keeps the line steady, and it has to keep
    // doing so or every flap shows as a departure.
    mockApp.serverNow = () => NOW + 3_000;
    const tree = await shown(NOW, false);
    expect(textOf(tree)).toContain('In the app now');
    mockApp.serverNow = () => NOW;
    act(() => tree.unmount());
  });

  it('falls back to the old reading when the server sends no such field', async () => {
    // An installed build meets this between its release and the deploy that
    // follows: `lastSeenAt` without `inApp` is what the server sent before the
    // fact existed, and the subtraction is still the best answer available.
    mockApp.serverNow = () => NOW + 5 * 60_000;
    const tree = await shown(NOW, undefined);
    expect(textOf(tree)).toContain('Last seen 5 minutes ago');
    mockApp.serverNow = () => NOW;
    act(() => tree.unmount());
  });
});

/**
 * Ending a contact, which is more than forgetting a name: it takes the
 * channels that held only the two of you, and it takes them for both.
 */
describe('removing a contact', () => {
  function shownFor(status: 'accepted' | 'incoming') {
    mockApp.home = {
      invites: [],
      rejoinable: [],
      recordings: [],
      contacts: [
        { account: { id: THEM, displayName: 'Dana Chu' }, status },
      ],
    };
    return render(
      <ProfileView accountId={THEM} fallbackName="Dana Chu" onBack={() => {}} />
    );
  }

  it('is offered for a contact and for nobody else', async () => {
    let tree!: ReactTestRenderer;
    await act(async () => {
      tree = shownFor('accepted');
    });
    expect(findButton(tree, 'Remove contact')).toBeDefined();
    act(() => tree.unmount());

    // Somebody who has asked and not been answered is not a contact to remove;
    // the answer to them is Accept, which is already on this screen.
    await act(async () => {
      tree = shownFor('incoming');
    });
    expect(findButton(tree, 'Remove contact')).toBeUndefined();
    act(() => tree.unmount());
  });

  it('asks first, and says what it costs', async () => {
    const alert = jest
      .spyOn(Alert, 'alert')
      .mockImplementation(() => undefined);
    let tree!: ReactTestRenderer;
    await act(async () => {
      tree = shownFor('accepted');
    });

    await act(async () => findButton(tree, 'Remove contact')!.props.onPress());
    expect(mockApp.removeContact).not.toHaveBeenCalled();

    const [, body, buttons] = alert.mock.calls[0] as [
      string,
      string,
      Array<{ text: string; onPress?: () => void }>,
    ];
    // Both consequences named, because neither is guessable from the button.
    expect(body).toContain('each stop being');
    expect(body).toContain('only the two of you');
    expect(body).toContain('other people');

    await act(async () => {
      buttons.find((b) => b.text === 'Remove')!.onPress!();
    });
    expect(mockApp.removeContact).toHaveBeenCalledWith(THEM);
    alert.mockRestore();
    act(() => tree.unmount());
  });

  /**
   * The profile can be open over the very channel the removal empties — a
   * one-to-one channel is exactly the case — so closing it onto that channel
   * would land on "Channel gone", which is true and a strange answer to a tap
   * about a person. The caller decides where to go; ChannelView sends it Home.
   */
  it('leaves by the route the caller chose', async () => {
    const alert = jest
      .spyOn(Alert, 'alert')
      .mockImplementation(() => undefined);
    const onBack = jest.fn();
    const onRemoved = jest.fn();
    mockApp.home = {
      invites: [],
      rejoinable: [],
      recordings: [],
      contacts: [
        { account: { id: THEM, displayName: 'Dana Chu' }, status: 'accepted' },
      ],
    };
    let tree!: ReactTestRenderer;
    await act(async () => {
      tree = render(
        <ProfileView
          accountId={THEM}
          fallbackName="Dana Chu"
          onBack={onBack}
          onRemoved={onRemoved}
        />
      );
    });

    await act(async () => findButton(tree, 'Remove contact')!.props.onPress());
    const [, , buttons] = alert.mock.calls[0] as [
      string,
      string,
      Array<{ text: string; onPress?: () => void }>,
    ];
    await act(async () => {
      buttons.find((b) => b.text === 'Remove')!.onPress!();
    });

    expect(onRemoved).toHaveBeenCalled();
    expect(onBack).not.toHaveBeenCalled();
    alert.mockRestore();
    act(() => tree.unmount());
  });
});

describe('the order channels are listed in', () => {
  const channel = (
    id: string,
    name: string | null,
    presentCount: number,
    lastActiveAt: number
  ) => ({
    channelId: id,
    name,
    others: [{ id: 'acct_q', displayName: 'Quinn Ito' }],
    presentCount,
    createdAt: NOW,
    lastActiveAt,
  });

  const namesInOrder = (tree: ReturnType<typeof render>) => {
    const text = textOf(tree);
    return ['Occupied', 'Emptied', 'Older'].filter((n) => text.includes(n))
      .sort((a, b) => text.indexOf(a) - text.indexOf(b));
  };

  it('puts an occupied channel above one that emptied more recently', () => {
    // `lastActiveAt` is written on entry and on the way out and never in
    // between, so a channel two people have been talking in for an hour
    // carries the hour-old moment the second of them arrived. Ordering on it
    // alone sinks the live conversation under an abandoned one.
    mockApp.home = {
      invites: [],
      rejoinable: [
        channel('chan_b', 'Emptied', 0, NOW - 5 * 60_000),
        channel('chan_a', 'Occupied', 2, NOW - 3_600_000),
        channel('chan_c', 'Older', 0, NOW - 86_400_000),
      ],
      recordings: [],
      contacts: [],
    };
    const tree = render(
      <HomeView {...homeNav} />
    );
    expect(namesInOrder(tree)).toEqual(['Occupied', 'Emptied', 'Older']);
    act(() => tree.unmount());
  });

  it('separates the occupied ones under their own heading', () => {
    // The sections are the coarse sort, and they are a ladder rather than a
    // taxonomy: a channel appears once, in the first one it qualifies for.
    // Occupancy is what the top one is for, so an unnamed channel with two
    // people in it outranks a named one with nobody — which is the opposite of
    // the rule this list used to keep, and the right way round.
    mockApp.home = {
      invites: [],
      rejoinable: [
        channel('chan_a', null, 2, NOW),
        channel('chan_b', 'Emptied', 0, NOW - 3_600_000),
      ],
      recordings: [],
      contacts: [],
    };
    const tree = render(
      <HomeView {...homeNav} />
    );
    const text = textOf(tree);
    expect(text.indexOf('Live')).toBeLessThan(text.indexOf('Quinn Ito'));
    expect(text.indexOf('Quinn Ito')).toBeLessThan(text.indexOf('Your channels'));
    expect(text.indexOf('Your channels')).toBeLessThan(text.indexOf('Emptied'));
    act(() => tree.unmount());
  });
});

describe('who is in the channel, and who is talking', () => {
  /**
   * The card for one person, found by the name in its label. A card is a
   * Pressable for everybody but you, so its style is a function of press
   * state rather than an array — both shapes are flattened the same way here.
   */
  function cardFor(tree: ReactTestRenderer, name: string) {
    const node = tree.root
      .findAll(
        (n) =>
          typeof n.type === 'string' &&
          String(n.props?.accessibilityLabel ?? '').startsWith(name)
      )
      .at(0);
    const style = node?.props?.style;
    return {
      node,
      style: StyleSheet.flatten(
        typeof style === 'function' ? style({ pressed: false }) : style
      ) as { borderColor?: unknown },
    };
  }

  it('gives everybody a card, yourself included', () => {
    showChannel(channelOf());
    const tree = render(
      <ChannelView
        channelId="sess_1"
        audio={AUDIO}
        onHome={() => {}}
        onExit={() => {}}
      />
    );
    const text = textOf(tree);
    expect(text).toContain('Dana Chu');
    // Your own card is there and says so, which is where your mute and your
    // own speaking indicator belong.
    expect(text).toContain('Me (you)');
    expect(cardFor(tree, 'Dana Chu').node).toBeDefined();
    expect(cardFor(tree, 'Me, you').node).toBeDefined();
    act(() => tree.unmount());
  });

  it('marks the card of whoever is audible, and only theirs', () => {
    showChannel(channelOf());
    const tree = render(
      <ChannelView
        channelId="sess_1"
        audio={audioWith(THEM)}
        onHome={() => {}}
        onExit={() => {}}
      />
    );
    const them = cardFor(tree, 'Dana Chu');
    const mine = cardFor(tree, 'Me, you');
    expect(them.style.borderColor).toBe(colors.floor);
    expect(mine.style.borderColor).not.toBe(colors.floor);
    expect(String(them.node!.props.accessibilityLabel)).toContain('Speaking');
    act(() => tree.unmount());
  });

  it('asks the room who is talking rather than the floor', () => {
    // Holding the floor is permission to speak, not speech. A card lit by the
    // reducer would glow through three minutes of silence — and would leave a
    // self-muted person's card lit while nothing of theirs is heard.
    showChannel(
      channelOf((s) => reduce(s, { type: 'CLAIM_FLOOR', userId: THEM }, NOW))
    );
    const tree = render(
      <ChannelView
        channelId="sess_1"
        audio={AUDIO}
        onHome={() => {}}
        onExit={() => {}}
      />
    );
    const them = cardFor(tree, 'Dana Chu');
    expect(them.style.borderColor).not.toBe(colors.floor);
    // The claim is still reported, in words, where it belongs.
    expect(String(them.node!.props.accessibilityLabel)).not.toContain(
      'Speaking'
    );
    expect(textOf(tree)).toContain('has the floor');
    act(() => tree.unmount());
  });

  it('says how long somebody has been gone, in words', () => {
    showChannel(
      channelOf((s) => reduce(s, { type: 'STEP_OUT', userId: THEM }, NOW))
    );
    mockApp.serverNow = () => NOW + 5 * 60_000;
    const tree = render(
      <ChannelView
        channelId="sess_1"
        audio={AUDIO}
        onHome={() => {}}
        onExit={() => {}}
      />
    );
    expect(textOf(tree)).toContain('Stepped out 5 minutes ago');
    mockApp.serverNow = () => NOW;
    act(() => tree.unmount());
  });

  it('says somebody is waiting when their connection went, not their finger', () => {
    // A tap and a suspended phone leave the same absence and used to read the
    // same. They do not mean the same thing to whoever has just walked in:
    // this one is expecting company and has already been notified that some
    // arrived. Said as a length rather than a moment, which is what `duration`
    // is for.
    showChannel(
      channelOf((s) => {
        const dropped = reduce(s, { type: 'DISCONNECTED', userId: THEM }, NOW);
        return reduce(
          dropped,
          { type: 'TICK' },
          NOW + DISCONNECT_GRACE_MS + 1
        );
      })
    );
    mockApp.serverNow = () => NOW + 5 * 60_000;
    const tree = render(
      <ChannelView
        channelId="sess_1"
        audio={AUDIO}
        onHome={() => {}}
        onExit={() => {}}
      />
    );
    expect(textOf(tree)).toContain('Waiting for 5 minutes');
    expect(textOf(tree)).not.toContain('Stepped out');
    mockApp.serverNow = () => NOW;
    act(() => tree.unmount());
  });

  it('goes back to having stepped out once the wait has gone stale', () => {
    // The same clock throughout: fifteen minutes of waiting becomes sixteen
    // minutes of absence, never a fresh zero.
    showChannel(
      channelOf((s) => {
        const dropped = reduce(s, { type: 'DISCONNECTED', userId: THEM }, NOW);
        return reduce(
          dropped,
          { type: 'TICK' },
          NOW + DISCONNECT_GRACE_MS + 1
        );
      })
    );
    mockApp.serverNow = () => NOW + WAITING_WINDOW_MS + 60_000;
    const tree = render(
      <ChannelView
        channelId="sess_1"
        audio={AUDIO}
        onHome={() => {}}
        onExit={() => {}}
      />
    );
    expect(textOf(tree)).toContain('Stepped out 16 minutes ago');
    expect(textOf(tree)).not.toContain('Waiting for');
    mockApp.serverNow = () => NOW;
    act(() => tree.unmount());
  });

  it('says only that they are gone when it does not know since when', () => {
    // A restart drops presence without anybody stepping out, so there is no
    // moment to report. Dating it from the deploy would be a confident answer
    // to a question nothing here can answer.
    const channel = channelOf((s) =>
      reduce(s, { type: 'STEP_OUT', userId: THEM }, NOW)
    );
    showChannel({ ...channel, lastPresentAt: {} });
    mockApp.serverNow = () => NOW + 5 * 60_000;
    const tree = render(
      <ChannelView
        channelId="sess_1"
        audio={AUDIO}
        onHome={() => {}}
        onExit={() => {}}
      />
    );
    const text = textOf(tree);
    expect(text).toContain('Stepped out');
    expect(text).not.toContain('ago');
    mockApp.serverNow = () => NOW;
    act(() => tree.unmount());
  });

  it('counts the absence against the server clock', () => {
    // Same reason the floor countdown does: the device's clock drifts and can
    // be set by the user, and this one is compared against a server timestamp.
    showChannel(
      channelOf((s) => reduce(s, { type: 'STEP_OUT', userId: THEM }, NOW))
    );
    mockApp.serverNow = () => NOW + 3 * 3_600_000;
    const tree = render(
      <ChannelView
        channelId="sess_1"
        audio={AUDIO}
        onHome={() => {}}
        onExit={() => {}}
      />
    );
    expect(textOf(tree)).toContain('Stepped out 3 hours ago');
    mockApp.serverNow = () => NOW;
    act(() => tree.unmount());
  });

  it('opens their profile from the card, and offers no route to your own', async () => {
    showChannel(channelOf());
    const tree = render(
      <ChannelView
        channelId="sess_1"
        audio={AUDIO}
        onHome={() => {}}
        onExit={() => {}}
      />
    );
    // Yours is not a button: a read-only profile of yourself, offering to add
    // you as your own contact, is not a screen worth reaching.
    expect(cardFor(tree, 'Me, you').node!.props.accessibilityRole).not.toBe(
      'button'
    );

    const theirs = tree.root
      .findAll((n) => n.props?.accessibilityRole === 'button')
      .find((n) => String(n.props?.accessibilityLabel).startsWith('Dana Chu'));
    await act(async () => theirs!.props.onPress());
    expect(mockApp.loadProfile).toHaveBeenCalledWith(THEM);
    // And from there they can be kept, which is what the card is a route to.
    expect(findButton(tree, 'Add contact')).toBeDefined();
    act(() => tree.unmount());
  });
});

describe('Support', () => {
  /** Both screens fetch on mount, so every case has to let that settle. */
  async function open(element: React.ReactElement) {
    let tree!: ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(element);
    });
    return tree;
  }

  const home = () =>
    open(<HomeView {...homeNav} />);

  it('offers a way in from Home, and nothing more than that', async () => {
    const tree = await home();
    expect(findButton(tree, 'Chip in')).toBeTruthy();
    // The argument for giving belongs on the screen behind this, not on the
    // one somebody opened to reach a conversation.
    expect(textOf(tree)).not.toContain('unlocks nothing');
    act(() => tree.unmount());
  });

  it('opens the screen rather than the browser', async () => {
    const opened = jest.fn();
    const tree = await open(
      <HomeView
        {...homeNav}
        onOpenSupport={opened}
      />
    );
    act(() => findButton(tree, 'Chip in')!.props.onPress());
    expect(opened).toHaveBeenCalled();
    act(() => tree.unmount());
  });

  it('says nothing on Home when there is nowhere to give', async () => {
    mockApp.loadSupport.mockResolvedValueOnce({
      url: null as unknown as string,
      identifier: 'me@example.com',
      mine: null,
    });
    const tree = await home();
    expect(findButton(tree, 'Chip in')).toBeUndefined();
    expect(textOf(tree)).not.toContain('Support');
    act(() => tree.unmount());
  });

  it('leaves Home alone when support cannot be read at all', async () => {
    // An older server, or one that fails. Home is what somebody opened the app
    // for and must not wait on, or break with, an extra fetch.
    mockApp.loadSupport.mockRejectedValueOnce(new Error('nope'));
    const tree = await home();
    expect(findButton(tree, 'Chip in')).toBeUndefined();
    expect(textOf(tree)).toContain('Start a channel');
    act(() => tree.unmount());
  });

  it('makes the case on its own screen, and names the address', async () => {
    const tree = await open(<SupportView onBack={() => {}} />);
    const text = textOf(tree);
    expect(text).toContain('costs money every month');
    expect(text).toContain('unlocks nothing');
    // The address is the whole of how a donation finds its way back to an
    // account, so the screen has to name it.
    expect(text).toContain('me@example.com');
    expect(findButton(tree, 'Chip in')).toBeTruthy();
    act(() => tree.unmount());
  });

  it('thanks somebody who has already given, in their own currencies', async () => {
    mockApp.loadSupport.mockResolvedValueOnce({
      url: 'https://ko-fi.com/thefloor',
      identifier: 'me@example.com',
      mine: {
        count: 2,
        since: NOW,
        totals: [
          { currency: 'EUR', cents: 1000 },
          { currency: 'USD', cents: 300 },
        ],
      },
    });
    const tree = await open(<SupportView onBack={() => {}} />);
    expect(textOf(tree)).toContain('€10.00 and $3.00');
    act(() => tree.unmount());
  });

  it('says so plainly when there is nowhere to give', async () => {
    mockApp.loadSupport.mockResolvedValueOnce({
      url: null as unknown as string,
      identifier: 'me@example.com',
      mine: null,
    });
    const tree = await open(<SupportView onBack={() => {}} />);
    expect(findButton(tree, 'Chip in')).toBeUndefined();
    expect(textOf(tree)).toContain('no way to give');
    act(() => tree.unmount());
  });
});

describe('your own profile', () => {
  /**
   * The screen as the settings button opens it: on you, with no action for
   * entering a channel, since the only channels it could list are ones you
   * share with yourself.
   */
  async function mine(bio: string | null = null) {
    mockApp.home = {
      invites: [],
      rejoinable: [],
      recordings: [],
      contacts: [],
    };
    mockApp.loadProfile.mockResolvedValueOnce({
      account: { id: ME, displayName: 'Me' },
      bio,
    });
    let tree!: ReactTestRenderer;
    await act(async () => {
      tree = render(
        <ProfileView accountId={ME} fallbackName="Me" onBack={() => {}} />
      );
    });
    return tree;
  }

  it('does not offer to make you a contact of yourself', async () => {
    const tree = await mine();
    expect(findButton(tree, 'Add contact')).toBeUndefined();
    expect(findButton(tree, 'Remove contact')).toBeUndefined();
    // The copy that goes with the button, in case the label ever changes but
    // the card does not.
    expect(textOf(tree)).not.toContain('They will see a request');
    act(() => tree.unmount());
  });

  it('says an empty bio is yours to write, and where', async () => {
    const tree = await mine();
    expect(textOf(tree)).toContain('You have not written anything about yourself');
    expect(textOf(tree)).not.toContain('They have not written');
    act(() => tree.unmount());
  });

  it('shows the bio rendered, which is the point of looking', async () => {
    const tree = await mine('**Loud** and clear');
    const text = textOf(tree);
    expect(text).toContain('Loud');
    expect(text).not.toContain('**');
    act(() => tree.unmount());
  });

  it('still offers the contact card for somebody who is not you', async () => {
    mockApp.home = {
      invites: [],
      rejoinable: [],
      recordings: [],
      contacts: [],
    };
    mockApp.loadProfile.mockResolvedValueOnce({
      account: { id: THEM, displayName: 'Dana Chu' },
      bio: null,
    });
    let tree!: ReactTestRenderer;
    await act(async () => {
      tree = render(
        <ProfileView accountId={THEM} fallbackName="Dana Chu" onBack={() => {}} />
      );
    });
    expect(findButton(tree, 'Add contact')).toBeDefined();
    act(() => tree.unmount());
  });
});

describe('the way to your own profile', () => {
  const openSettings = async (onOpenProfile?: () => void) => {
    let tree!: ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(
        <ContactsSettingsView onBack={() => {}} onOpenProfile={onOpenProfile} />
      );
    });
    return tree;
  };

  it('is offered where the bio is written, and not otherwise', async () => {
    const tree = await openSettings(() => {});
    expect(findButton(tree, 'See your profile')).toBeDefined();
    act(() => tree.unmount());

    // A caller with nowhere to put the screen leaves the button out rather
    // than showing one that does nothing — the same rule ProfileView follows
    // for the sections it is given no action for.
    const bare = await openSettings();
    expect(findButton(bare, 'See your profile')).toBeUndefined();
    act(() => bare.unmount());
  });

  it('writes an edited bio before opening it', async () => {
    // Otherwise the screen shows what the server still holds, which is the
    // version somebody has just finished editing away from. The edit is the
    // point of the test: persist() returns early when nothing has changed, so
    // a run without one proves only that the callback fires.
    const opened = jest.fn();
    const tree = await openSettings(opened);
    const field = tree.root.findAll(
      (n) => n.props?.placeholder === 'Anything you would like people to know…'
    )[0];
    act(() => field.props.onChangeText('Something new'));
    await act(async () => {
      findButton(tree, 'See your profile')!.props.onPress();
    });
    expect(mockApp.saveProfile).toHaveBeenCalledWith({ bio: 'Something new' });
    expect(opened).toHaveBeenCalled();
    act(() => tree.unmount());
  });

  it('opens it even when the save fails', async () => {
    // The alternative is a button that silently does nothing on the one screen
    // somebody opened to check their own work. The error is already shown
    // under the field by persist()'s own handling.
    mockApp.saveProfile.mockRejectedValueOnce(new Error('server said no'));
    const opened = jest.fn();
    const tree = await openSettings(opened);
    const field = tree.root.findAll(
      (n) => n.props?.placeholder === 'Anything you would like people to know…'
    )[0];
    act(() => field.props.onChangeText('Something new'));
    await act(async () => {
      findButton(tree, 'See your profile')!.props.onPress();
    });
    expect(opened).toHaveBeenCalled();
    act(() => tree.unmount());
  });
});


describe('Contacts settings', () => {
  /**
   * Your name and your bio, which moved here from the Home settings screen
   * when the contact list became a screen of its own. They are what a contact
   * sees, so they sit behind the contact list rather than beside the appearance
   * setting and the delete button.
   *
   * The view fetches on mount, so every case has to let that settle.
   */
  async function openSettings() {
    let tree!: ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(<ContactsSettingsView onBack={() => {}} />);
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

  const nameField = (tree: ReactTestRenderer) =>
    tree.root.findAll(
      (n) => n.props?.placeholder === 'What people should call you'
    )[0];

  it('keeps an edit when the field is left, with no button to press', async () => {
    const tree = await openSettings();
    expect(findButton(tree, 'Save')).toBeUndefined();

    act(() => nameField(tree).props.onChangeText('Alice Nkemdirim'));
    await act(async () => nameField(tree).props.onBlur());

    // Only what changed: the bio was never touched, so it is not sent.
    expect(mockApp.saveProfile).toHaveBeenCalledWith({
      displayName: 'Alice Nkemdirim',
    });
    act(() => tree.unmount());
  });

  it('keeps an edit that Back is tapped on directly', async () => {
    // The trap this replaced: the way back was nearer and more obvious than
    // Save, and discarded the edit without saying so.
    const onBack = jest.fn();
    let tree!: ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(<ContactsSettingsView onBack={onBack} />);
    });
    act(() => nameField(tree).props.onChangeText('Alice Nkemdirim'));

    await act(async () => findButton(tree, 'Back')!.props.onPress());
    expect(mockApp.saveProfile).toHaveBeenCalledWith({
      displayName: 'Alice Nkemdirim',
    });
    expect(onBack).toHaveBeenCalled();
    act(() => tree.unmount());
  });

  it('writes nothing when nothing was changed', async () => {
    const tree = await openSettings();
    await act(async () => nameField(tree).props.onBlur());
    await act(async () => findButton(tree, 'Back')!.props.onPress());
    expect(mockApp.saveProfile).not.toHaveBeenCalled();
    act(() => tree.unmount());
  });

  it('stays put when the edit could not be kept', async () => {
    const onBack = jest.fn();
    mockApp.saveProfile.mockRejectedValueOnce(new Error('server said no'));
    let tree!: ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(<ContactsSettingsView onBack={onBack} />);
    });
    act(() => nameField(tree).props.onChangeText('Alice Nkemdirim'));

    await act(async () => findButton(tree, 'Back')!.props.onPress());
    // Closing anyway would be the silent discard again, wearing a hat.
    expect(onBack).not.toHaveBeenCalled();
    expect(textOf(tree)).toContain('server said no');
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
    await act(async () => name.props.onBlur());

    expect(mockApp.saveProfile).not.toHaveBeenCalled();
    expect(textOf(tree)).toContain('A name cannot be empty');
    act(() => tree.unmount());
  });
});

describe('Contacts', () => {
  const withContacts = (
    contacts: Array<{
      id: string;
      displayName: string;
      /** Accepted unless a case is specifically about the other two. */
      status?: 'accepted' | 'incoming' | 'outgoing';
      inApp?: boolean;
      lastSeenAt?: number | null;
    }>
  ) => {
    mockApp.home = {
      invites: [],
      rejoinable: [],
      recordings: [],
      contacts: contacts.map(({ id, displayName, status, ...rest }) => ({
        account: { id, displayName },
        status: status ?? 'accepted',
        ...rest,
      })),
    };
  };

  const open = () => {
    let tree!: ReactTestRenderer;
    act(() => {
      tree = renderer.create(<ContactsView onHome={() => {}} />);
    });
    return tree;
  };

  it('says where each contact is, in the words the profile uses', () => {
    mockApp.serverNow = () => NOW;
    withContacts([
      { id: 'a', displayName: 'Dana Chu', inApp: true },
      { id: 'b', displayName: 'Sam Rivera', inApp: false, lastSeenAt: NOW - 3 * 60 * 60_000 },
    ]);
    const tree = open();
    const text = textOf(tree);
    expect(text).toContain('In the app now');
    expect(text).toContain('Last seen 3 hours ago');
    act(() => tree.unmount());
  });

  it('says nothing rather than hedging when it is not known', () => {
    // A server that predates the fields, or somebody who has not connected
    // since they existed. "Unknown" would report on the rule, not the person.
    mockApp.serverNow = () => NOW;
    withContacts([{ id: 'a', displayName: 'Dana Chu' }]);
    const tree = open();
    expect(textOf(tree)).toContain('Dana Chu');
    expect(textOf(tree)).not.toContain('Last seen');
    expect(textOf(tree)).not.toContain('In the app');
    act(() => tree.unmount());
  });

  it('lists people you are contacts with, and not requests', () => {
    // Requests stay on Home: they are not contacts yet, and answering one is
    // something to do rather than somebody to look up.
    withContacts([
      { id: 'a', displayName: 'Dana Chu', status: 'accepted' },
      { id: 'b', displayName: 'Pat Ito', status: 'incoming' },
      { id: '', displayName: 'someone@example.com', status: 'outgoing' },
    ]);
    const tree = open();
    const text = textOf(tree);
    expect(text).toContain('Dana Chu');
    expect(text).not.toContain('Pat Ito');
    expect(text).not.toContain('someone@example.com');
    act(() => tree.unmount());
  });

  it('opens the person when their row is tapped', () => {
    withContacts([{ id: 'a', displayName: 'Dana Chu' }]);
    const tree = open();
    const row = tree.root.findAll(
      (n) =>
        typeof n.props?.accessibilityLabel === 'string' &&
        n.props.accessibilityLabel.startsWith('Dana Chu.')
    )[0];
    act(() => row.props.onPress());
    // The profile screen, which fetches on mount and offers the one
    // destructive thing you can do about a person.
    expect(mockApp.loadProfile).toHaveBeenCalledWith('a');
    act(() => tree.unmount());
  });

  it('keeps the add-contact field folded away until it is wanted', () => {
    withContacts([{ id: 'a', displayName: 'Dana Chu' }]);
    const tree = open();
    const field = () =>
      tree.root.findAll(
        (n) => n.props?.placeholder === 'Search by email address'
      )[0];

    // A line, not a form: reading the list is what somebody came for.
    expect(field()).toBeUndefined();
    expect(findButton(tree, 'Add contact')).toBeDefined();

    act(() => findButton(tree, 'Add contact')!.props.onPress());
    expect(field()).toBeDefined();
    expect(findButton(tree, 'Send request')).toBeDefined();
    act(() => tree.unmount());
  });

  it('sends the request, and folds away again on cancel', async () => {
    withContacts([]);
    const tree = open();
    act(() => findButton(tree, 'Add contact')!.props.onPress());
    const field = tree.root.findAll(
      (n) => n.props?.placeholder === 'Search by email address'
    )[0];
    act(() => field.props.onChangeText('someone@example.com'));
    await act(async () => findButton(tree, 'Send request')!.props.onPress());
    expect(mockApp.requestContact).toHaveBeenCalledWith('someone@example.com');

    act(() => findButton(tree, 'Cancel')!.props.onPress());
    expect(
      tree.root.findAll(
        (n) => n.props?.placeholder === 'Search by email address'
      )[0]
    ).toBeUndefined();
    act(() => tree.unmount());
  });

  it('says so plainly when there is nobody yet', () => {
    withContacts([]);
    const tree = open();
    expect(textOf(tree)).toContain('Nobody yet');
    act(() => tree.unmount());
  });
});

describe('the order contacts are listed in', () => {
  /**
   * The names in the order the screen puts them, top to bottom.
   *
   * Consecutive duplicates are dropped: one row is several nodes carrying the
   * same accessibilityLabel — the Pressable and what it renders through — so
   * findAll reports each row once per layer. Only *consecutive* ones, so two
   * contacts who genuinely share a display name still count twice.
   */
  const namesOn = (tree: ReactTestRenderer) =>
    tree.root
      .findAll(
        (n) =>
          typeof n.props?.accessibilityLabel === 'string' &&
          n.props.accessibilityLabel.includes('Open their profile.')
      )
      .map((n) => String(n.props.accessibilityLabel).split('.')[0])
      .filter((name, i, all) => i === 0 || all[i - 1] !== name);

  const listed = (
    contacts: Array<{
      id: string;
      displayName: string;
      inApp?: boolean;
      lastSeenAt?: number | null;
    }>
  ) => {
    mockApp.serverNow = () => NOW;
    mockApp.home = {
      invites: [],
      rejoinable: [],
      recordings: [],
      contacts: contacts.map(({ id, displayName, ...rest }) => ({
        account: { id, displayName },
        status: 'accepted' as const,
        ...rest,
      })),
    };
    let tree!: ReactTestRenderer;
    act(() => {
      tree = renderer.create(<ContactsView onHome={() => {}} />);
    });
    const names = namesOn(tree);
    act(() => tree.unmount());
    return names;
  };

  it('puts whoever is in the app above everybody who is not', () => {
    expect(
      listed([
        { id: 'a', displayName: 'Ana', lastSeenAt: NOW - 60_000 },
        { id: 'b', displayName: 'Bo', inApp: true },
      ])
    ).toEqual(['Bo', 'Ana']);
  });

  it('falls back on how recently, which is what the line under each name says', () => {
    expect(
      listed([
        { id: 'a', displayName: 'Ana', lastSeenAt: NOW - 3 * 60 * 60_000 },
        { id: 'b', displayName: 'Bo', lastSeenAt: NOW - 60 * 60_000 },
        { id: 'c', displayName: 'Cy', lastSeenAt: NOW - 24 * 60 * 60_000 },
      ])
    ).toEqual(['Bo', 'Ana', 'Cy']);
  });

  it('sinks anybody there is nothing known about', () => {
    // No stamp is not evidence of being around — it is a contact who has not
    // connected since the field existed, or a server that predates it.
    expect(
      listed([
        { id: 'a', displayName: 'Ana' },
        { id: 'b', displayName: 'Bo', lastSeenAt: NOW - 30 * 24 * 60 * 60_000 },
      ])
    ).toEqual(['Bo', 'Ana']);
  });

  it('breaks a tie on the name, so the list does not reshuffle', () => {
    // Two contacts nothing is known about would otherwise swap places between
    // renders, and a list that moves under a thumb is worse than any fixed one.
    expect(listed([
      { id: 'a', displayName: 'Zoe' },
      { id: 'b', displayName: 'Ada' },
    ])).toEqual(['Ada', 'Zoe']);
  });
});

describe('the audio diagnostic panel', () => {
  /**
   * The gate, which is the whole of what makes this panel permissible to ship.
   *
   * The panel it replaces went to every user because there was no way to show
   * it to one; this one is invisible to every account in the database until
   * somebody sets `accounts.debug` by hand. A regression here is not cosmetic
   * — it puts `playAndRecord/videoChat` under the mute button of a stranger.
   */
  it('is absent for an ordinary account', () => {
    showChannel(channelOf());
    const tree = render(<ChannelView
        channelId="sess_1"
        audio={AUDIO}
        onHome={() => {}}
        onExit={() => {}}
      />);
    expect(textOf(tree)).not.toContain('Audio diagnostics');
    act(() => tree.unmount());
  });

  it('is offered, collapsed, to an account with the flag', () => {
    mockApp.debug = true;
    showChannel(channelOf());
    const tree = render(<ChannelView
        channelId="sess_1"
        audio={AUDIO}
        onHome={() => {}}
        onExit={() => {}}
      />);
    expect(textOf(tree)).toContain('Audio diagnostics');
    // Collapsed: even for the one account that asked for it, the channel
    // screen is not what this is for, and an open panel polls once a second.
    expect(textOf(tree)).not.toContain('Session — asked vs actual');
    act(() => tree.unmount());
  });

  it('reads out both halves once opened', () => {
    mockApp.debug = true;
    showChannel(channelOf());
    const tree = render(<ChannelView
        channelId="sess_1"
        audio={AUDIO}
        onHome={() => {}}
        onExit={() => {}}
      />);
    const toggle = tree.root
      .findAll((n) => n.props?.accessibilityRole === 'button')
      .find((n) => n.props?.accessibilityLabel === 'Audio diagnostics');
    act(() => toggle!.props.onPress());

    const text = textOf(tree);
    expect(text).toContain('Session — asked vs actual');
    // Nothing native is present under jest, and the panel has to say that
    // rather than render a blank line — the failure mode five instruments fell
    // into on 2026-08-20. See src/audio/diagnostics.ts.
    expect(text).toContain('unreadable');
    expect(text).toContain('nothing recorded yet');
    act(() => tree.unmount());
  });
});

describe('copying the diagnostics', () => {
  /**
   * The copy button, whose failure mode is the one this panel cannot have.
   *
   * `expo-clipboard`'s `setStringAsync` resolves to a boolean, so there are
   * two distinct ways to fail — it can reject, and it can decline by resolving
   * false — and only one of them is an exception. Both are pinned, because the
   * whole diagnostic is written against instruments that go quiet: a copy that
   * appeared to work while doing nothing would send somebody away believing
   * they held a reading they did not.
   */
  function openPanel() {
    mockApp.debug = true;
    showChannel(channelOf());
    const tree = render(<ChannelView
        channelId="sess_1"
        audio={AUDIO}
        onHome={() => {}}
        onExit={() => {}}
      />);
    const toggle = tree.root
      .findAll((n) => n.props?.accessibilityRole === 'button')
      .find((n) => n.props?.accessibilityLabel === 'Audio diagnostics');
    act(() => toggle!.props.onPress());
    return tree;
  }

  function copyButton(tree: ReturnType<typeof render>) {
    return tree.root
      .findAll((n) => n.props?.accessibilityRole === 'button')
      .find((n) => n.props?.accessibilityLabel === 'Copy diagnostics');
  }

  /** The press and the promise it starts, settled. */
  async function pressCopy(tree: ReturnType<typeof render>) {
    await act(async () => {
      copyButton(tree)!.props.onPress();
    });
  }

  beforeEach(() => {
    (Clipboard.setStringAsync as jest.Mock).mockImplementation(async () => true);
  });

  it('puts the whole panel on the clipboard, alarms included', async () => {
    const tree = openPanel();
    await pressCopy(tree);

    expect(Clipboard.setStringAsync).toHaveBeenCalledTimes(1);
    const copied = (Clipboard.setStringAsync as jest.Mock).mock
      .calls[0]![0] as string;
    expect(copied).toContain('The Floor — audio diagnostics');
    expect(copied).toContain('Session — asked vs actual');
    // Nothing native under jest, so the readings are unreadable — and that has
    // to survive the copy as an alarm rather than as a blank.
    expect(copied).toContain('unreadable');
    expect(copied).toContain('<<');
    expect(textOf(tree)).toContain('copied');

    act(() => tree.unmount());
  });

  it('says so on the button when the clipboard throws', async () => {
    (Clipboard.setStringAsync as jest.Mock).mockImplementation(async () => {
      throw new Error('no clipboard on this device');
    });
    const tree = openPanel();
    await pressCopy(tree);

    expect(textOf(tree)).toContain('copy failed');
    expect(textOf(tree)).toContain('screenshot');
    act(() => tree.unmount());
  });

  /**
   * The case the deprecated core API could not express at all: it returned
   * void, so a clipboard that declined was indistinguishable from one that
   * worked. Moving to `expo-clipboard` is what made this testable, and a
   * button that ignored the boolean would have thrown the benefit away.
   */
  it('says so when the clipboard declines without throwing', async () => {
    (Clipboard.setStringAsync as jest.Mock).mockImplementation(async () => false);
    const tree = openPanel();
    await pressCopy(tree);

    expect(textOf(tree)).toContain('copy failed');
    expect(textOf(tree)).not.toContain('✓ copied');
    act(() => tree.unmount());
  });
});
