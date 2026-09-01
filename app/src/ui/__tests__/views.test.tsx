import React from 'react';
import renderer, {
  act,
  type ReactTestInstance,
  type ReactTestRenderer,
} from 'react-test-renderer';
import { createChannel, reduce } from '../../../../core/channel';
import {
  DISCONNECT_GRACE_MS,
  MAX_CLIP_LENGTH,
  WAITING_WINDOW_MS,
} from '../../../../core/constants';
import type { ChannelState, Guest } from '../../../../core/types';
import type {
  HomeView as HomeViewData,
  ProfileView as ProfileViewData,
  RecordingView,
} from '../../../../core/protocol';
import { HomeView } from '../HomeView';
import { ChannelView, GroupHeading, uploadingLabel } from '../ChannelView';
import { Screen, SectionLabel } from '../components';
import type { UploadHooks } from '../../api/upload';
import type { GuestLinkSummary } from '../../api/http';
import { ProfileView } from '../ProfileView';
import { ContactsView } from '../ContactsView';
import { HomeSettingsView } from '../HomeSettingsView';
import { SupportView } from '../SupportView';
import { LeaderboardView } from '../LeaderboardView';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Share,
  StyleSheet,
  TextInput,
} from 'react-native';
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
      // Absent on most of these, as it is on the wire: a missing entry means
      // pingable now, so a view without the map is a channel nobody has been
      // pinged in.
      pingableAt?: Record<string, number>;
      serverNow: number;
    }
  >,
  goneChannels: [] as string[],
  /**
   * The channel this *device* is standing in, which is not what the roster
   * says — see `AppProvider.standingIn`. `showChannel` sets it whenever the
   * snapshot has ME present, because that is what every test here but the
   * two-device ones means by putting somebody in a channel: one person, one
   * phone, in the room. A test that wants the other case clears it by hand.
   */
  standingIn: null as string | null,
  displaced: false,
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
  // a test can hand back the availability fields a contact's profile carries,
  // or leave them out the way the server does for everybody else.
  loadProfile: jest.fn(
    async (accountId: string): Promise<ProfileViewData> => ({
      account: {
        id: accountId,
        displayName: accountId === ME ? 'Me' : 'Dana Chu',
      },
    })
  ),
  saveProfile: jest.fn(async () => {}),
  requestEmailChange: jest.fn(async () => {}),
  confirmEmailChange: jest.fn(async (identifier: string) => ({
    account: { id: ME, displayName: 'Me' },
    invited: 2,
    email: identifier,
  })),
  // Nobody has the standings by default, matching the column that grants them.
  leaderboard: false,
  loadLeaderboard: jest.fn(async () => [
    { account: { id: 'acct_a', displayName: 'Ada' }, invited: 4 },
    { account: { id: 'acct_b', displayName: 'Grace' }, invited: 1 },
  ]),
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
  // Resolves, which is what the card's wordless shortcut expects; the tests
  // about a refusal make it reject.
  ping: jest.fn(async () => {}),
  // A channel with no guest links, which is every channel until somebody makes
  // one. The settings screen reads this when it opens, so a mock without it is
  // a screen that throws rather than a screen with an empty section.
  inviteGuest: jest.fn(async () => 'https://example.test/g/tok'),
  watchLink: jest.fn(async () => 'https://example.test/watch/sess_1#tok'),
  guestLinks: jest.fn(async () => [] as GuestLinkSummary[]),
  // Echoes what it was asked for, as the server does when the level is not the
  // default. A test about the refusal path overrides it.
  setNotificationLevel: jest.fn(async (_channelId: string, level: string) => level),
  revokeGuestLink: jest.fn(async () => {}),
  watchChannel: jest.fn(),
  leaveChannelView: jest.fn(),
  act: jest.fn(),
  clearError: jest.fn(),
  removeContact: jest.fn(async () => {}),
  setEmailShown: jest.fn(async () => {}),
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
  // On, which is what an install that has never opened Settings has, and what
  // every build before the setting existed did. The tests about stepping in
  // being deliberate are the only ones that turn it off.
  tapToStepIn: true,
  setTapToStepIn: jest.fn((value: boolean) => {
    mockApp.tapToStepIn = value;
  }),
  // On, for the same reason and with the same consequence: the channel screen
  // draws a card for each of its footer's three controls unless a test says
  // otherwise, so every assertion written before the setting existed is still
  // asserting about the screen everybody gets.
  controlCards: true,
  setControlCards: jest.fn((value: boolean) => {
    mockApp.controlCards = value;
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
  failing: [] as string[],
  micOpen: true,
  // Nothing has been asked of the audio session, which is what a view test
  // renders against: the diagnostic panel is gated on `mockApp.debug` and is
  // absent from every case here but its own.
  asked: null,
  // The probe harness's way back from a dead engine. Never pressed by these
  // tests: the panel it lives on is gated on `mockApp.debug`.
  reconnect: () => {},
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
  // Being in the channel and being the device that is in it are different
  // facts, and these tests mean both unless they say otherwise.
  if (channel.present.includes(ME)) mockApp.standingIn = channel.id;
}

beforeEach(() => {
  mockApp.home = null;
  mockApp.channelViews = {};
  mockApp.goneChannels = [];
  mockApp.standingIn = null;
  mockApp.displaced = false;
  mockApp.status = 'open';
  mockApp.dismissedInvites = [];
  mockApp.appearance = 'system';
  mockApp.tapToStepIn = true;
  mockApp.controlCards = true;
  mockApp.debug = false;
  uploads.length = 0;
  jest.clearAllMocks();
});

describe('Home', () => {
  it('no longer says who you are signed in as', () => {
    // It is a fact about the account, and the screen about the account is
    // Contact settings, which now carries it. Home is a list of rooms.
    mockApp.home = { invites: [], rejoinable: [], contacts: [], recordings: [] };
    const tree = render(<HomeView {...homeNav} />);
    expect(textOf(tree)).not.toContain('Signed in');
    act(() => tree.unmount());
  });

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

  it('draws a seat as somewhere to go back to, and never on a phone', () => {
    // A channel you are a guest of is a place you can return to, which is what
    // this list means — so it belongs among the rest rather than in a section
    // of its own. It opens the guest page, a document this app does not own,
    // and it can only do that in a browser.
    const seat = {
      channelId: 'sess_seat',
      name: 'Alice and Bob',
      others: [],
      presentCount: 2,
      createdAt: NOW,
      lastActiveAt: NOW,
      everUsed: true,
      seat: true,
    };
    mockApp.home = {
      invites: [],
      rejoinable: [seat],
      contacts: [],
      recordings: [],
    };

    const phone = render(<HomeView {...homeNav} />);
    // `Platform.OS` is 'ios' under the preset, which is the case this guards:
    // the same account may hold a seat opened on a laptop, and a row a phone
    // cannot open is worse than no row.
    expect(textOf(phone)).not.toContain('Alice and Bob');
    act(() => phone.unmount());

    const wasOs = Platform.OS;
    // Assigned rather than mocked: `Platform` is one object the preset hands
    // every importer, so setting it here is what the module under test reads.
    (Platform as { OS: string }).OS = 'web';
    try {
      const browser = render(<HomeView {...homeNav} />);
      const text = textOf(browser);
      expect(text).toContain('Alice and Bob');
      // Said plainly: a row that read like the others would promise the
      // channel screen and open a different page.
      expect(text).toContain('You are a guest here');
      expect(text).toContain('2 present');
      act(() => browser.unmount());
    } finally {
      (Platform as { OS: string }).OS = wasOs;
    }
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

describe('Channel, with a guest in it', () => {
  const DANA_GUEST = 'guest_dana';

  const withGuest = (overrides: Partial<Guest> = {}) =>
    channelOf((c) =>
      reduce(
        c,
        {
          type: 'GUEST_ENTERED',
          guest: {
            id: DANA_GUEST,
            name: 'Dana',
            admittedAt: NOW,
            maySpeak: false,
            request: 'none',
            ...overrides,
          },
        },
        NOW
      )
    );

  it('puts somebody at the door above everything but the roster', () => {
    // A knock is the one thing on this screen that is waiting on an answer
    // from it. Everything else can be got to in a person's own time.
    showChannel(
      channelOf((c) =>
        reduce(
          c,
          { type: 'KNOCKED', knock: { id: 'knock_1', name: 'Dana', at: NOW } },
          NOW
        )
      )
    );
    const tree = render(
      <ChannelView channelId="sess_1" audio={AUDIO} onHome={() => {}} onExit={() => {}} />
    );
    const text = textOf(tree);
    expect(text).toContain('is at the door');
    // What letting them in costs, said before the tap rather than after it.
    expect(text).toContain('cannot record');

    act(() => findButton(tree, 'Let them in')!.props.onPress());
    expect(mockApp.act).toHaveBeenCalledWith('sess_1', {
      type: 'ANSWER_KNOCK',
      knockId: 'knock_1',
      accept: true,
    });
    act(() => tree.unmount());
  });

  it('shows a guest as a guest, and says nobody can hear them', () => {
    showChannel(withGuest());
    const tree = render(
      <ChannelView channelId="sess_1" audio={AUDIO} onHome={() => {}} onExit={() => {}} />
    );
    const text = textOf(tree);
    expect(text).toContain('Dana');
    expect(text).toContain('guest');
    expect(text).toContain('Nobody can hear them');
    act(() => tree.unmount());
  });

  it('makes asking to speak the loud thing, and grants it in one tap', () => {
    showChannel(withGuest({ request: 'asking' }));
    const tree = render(
      <ChannelView channelId="sess_1" audio={AUDIO} onHome={() => {}} onExit={() => {}} />
    );
    expect(textOf(tree)).toContain('asking to speak');

    act(() => findButton(tree, 'Let them speak')!.props.onPress());
    expect(mockApp.act).toHaveBeenCalledWith('sess_1', {
      type: 'SET_GUEST_SPEECH',
      guestId: DANA_GUEST,
      maySpeak: true,
    });
    act(() => tree.unmount());
  });

  it('withdraws the microphone without removing anybody', () => {
    // Two different sizes of act, and the screen offers both rather than
    // making "stop them talking" mean "throw them out".
    showChannel(withGuest({ maySpeak: true }));
    const tree = render(
      <ChannelView channelId="sess_1" audio={AUDIO} onHome={() => {}} onExit={() => {}} />
    );

    act(() => findButton(tree, 'Turn their microphone off')!.props.onPress());
    expect(mockApp.act).toHaveBeenCalledWith('sess_1', {
      type: 'SET_GUEST_SPEECH',
      guestId: DANA_GUEST,
      maySpeak: false,
    });

    act(() => findButton(tree, 'Remove')!.props.onPress());
    expect(mockApp.act).toHaveBeenCalledWith('sess_1', {
      type: 'EJECT_GUEST',
      guestId: DANA_GUEST,
    });
    act(() => tree.unmount());
  });

  it('asks a guest to be a contact, and says so once it has', () => {
    // The rule members already have between themselves — being in a channel
    // together is permission to ask — reaching the one person in the room it
    // could not name. Answered on their own page, by them.
    showChannel(withGuest({ maySpeak: true }));
    const tree = render(
      <ChannelView channelId="sess_1" audio={AUDIO} onHome={() => {}} onExit={() => {}} />
    );
    act(() => findButton(tree, 'Add contact')!.props.onPress());
    expect(mockApp.act).toHaveBeenCalledWith('sess_1', {
      type: 'ASK_GUEST_CONTACT',
      guestId: DANA_GUEST,
    });
    act(() => tree.unmount());

    // Per reader, not per guest: this is what *this* member asked.
    showChannel(withGuest({ asks: { [ME]: 'asking' } }));
    const asked = render(
      <ChannelView channelId="sess_1" audio={AUDIO} onHome={() => {}} onExit={() => {}} />
    );
    expect(findButton(asked, 'Asked')!.props.disabled).toBe(true);
    act(() => asked.unmount());

    // And a refusal is a different thing to be told than a silence.
    showChannel(withGuest({ asks: { [ME]: 'refused' } }));
    const refused = render(
      <ChannelView channelId="sess_1" audio={AUDIO} onHome={() => {}} onExit={() => {}} />
    );
    expect(findButton(refused, 'They said no')!.props.disabled).toBe(true);
    act(() => refused.unmount());
  });

  it('shares a link, and says the sharing is not the letting in', async () => {
    // Awaited inside `act`, unlike most of this file: minting is a round trip
    // and the share sheet is a second one, so a synchronous tap leaves two
    // promises settling into a tree that has already been unmounted — which
    // does not merely warn, it leaves the renderer unable to draw anything for
    // the rest of the file.
    const share = jest
      .spyOn(Share, 'share')
      .mockResolvedValue({ action: 'sharedAction' } as never);
    showChannel(channelOf());
    const tree = render(
      <ChannelView channelId="sess_1" audio={AUDIO} onHome={() => {}} onExit={() => {}} />
    );
    expect(textOf(tree)).toContain('whoever is in the channel decides');

    await act(async () => {
      findButton(tree, 'Share a guest link')!.props.onPress();
    });
    expect(mockApp.inviteGuest).toHaveBeenCalledWith('sess_1');
    expect(share).toHaveBeenCalledWith({ message: 'https://example.test/g/tok' });
    act(() => tree.unmount());
    share.mockRestore();
  });

  it('copies the link when there is nowhere to share it, and says where it went', async () => {
    // `react-native-web` answers a rejected promise when the browser has no
    // Web Share API, which turned a desktop into an error message where a
    // guest link should have been. A clipboard is the honest fallback — but
    // silently copying would look exactly like a tap that did nothing, so the
    // card says where the link went.
    const share = jest
      .spyOn(Share, 'share')
      .mockRejectedValue(new Error('Share is not supported in this browser'));
    const copied = jest
      .spyOn(Clipboard, 'setStringAsync')
      .mockResolvedValue(true);
    showChannel(channelOf());
    const tree = render(
      <ChannelView channelId="sess_1" audio={AUDIO} onHome={() => {}} onExit={() => {}} />
    );

    await act(async () => {
      findButton(tree, 'Share a guest link')!.props.onPress();
    });
    expect(copied).toHaveBeenCalledWith('https://example.test/g/tok');
    expect(textOf(tree)).toContain('Link copied');
    // And not as a failure: nothing went wrong.
    expect(textOf(tree)).not.toContain('would not copy');
    act(() => tree.unmount());
    share.mockRestore();
    copied.mockRestore();
  });

  it('says so when the clipboard will not take it either', async () => {
    const share = jest
      .spyOn(Share, 'share')
      .mockRejectedValue(new Error('Share is not supported in this browser'));
    const copied = jest
      .spyOn(Clipboard, 'setStringAsync')
      .mockResolvedValue(false);
    showChannel(channelOf());
    const tree = render(
      <ChannelView channelId="sess_1" audio={AUDIO} onHome={() => {}} onExit={() => {}} />
    );

    await act(async () => {
      findButton(tree, 'Share a guest link')!.props.onPress();
    });
    expect(textOf(tree)).toContain('would not copy');
    act(() => tree.unmount());
    share.mockRestore();
    copied.mockRestore();
  });

  it('leaves a cancelled share alone rather than copying behind somebody', async () => {
    // The web throws AbortError when the sheet is dismissed. Falling back to
    // the clipboard there would put a link somewhere the person had just
    // decided not to send it.
    const abort = new Error('cancelled');
    abort.name = 'AbortError';
    const share = jest.spyOn(Share, 'share').mockRejectedValue(abort);
    const copied = jest.spyOn(Clipboard, 'setStringAsync');
    showChannel(channelOf());
    const tree = render(
      <ChannelView channelId="sess_1" audio={AUDIO} onHome={() => {}} onExit={() => {}} />
    );

    await act(async () => {
      findButton(tree, 'Share a guest link')!.props.onPress();
    });
    expect(copied).not.toHaveBeenCalled();
    expect(textOf(tree)).not.toContain('Link copied');
    act(() => tree.unmount());
    share.mockRestore();
    copied.mockRestore();
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

  /**
   * The screen somebody lands on with "Tap a channel to step in" turned off.
   *
   * Watching has never been being there — the server has always drawn that
   * line, and every `can…` in core asks about the room rather than the roster
   * — so what is new here is only that the app can now be on this side of it.
   * What the screen must not do is describe a microphone nobody opened.
   */
  it('offers a way in, and no microphone, to somebody who has not stepped in', () => {
    showChannel(
      channelOf((c) => reduce(c, { type: 'STEP_OUT', userId: ME }, NOW))
    );
    const onExit = jest.fn();
    const tree = render(<ChannelView
        channelId="sess_1"
        audio={AUDIO}
        onHome={() => {}}
        onExit={onExit}
      />);

    const text = textOf(tree);
    // Sentence case since the two departures stopped sharing a label.
    expect(text).toContain('Step in');
    expect(text).toContain('Nobody can hear you');
    expect(text).not.toContain('Your microphone');
    expect(findButton(tree, 'Step out')).toBeUndefined();
    expect(findButton(tree, 'Mute yourself')).toBeUndefined();
    // The floor is somebody else's business until you are in the room, and the
    // hint says which of the several reasons this is.
    expect(text).toContain('Step in to claim the floor');
    expect(findButton(tree, 'Claim the floor')!.props.accessibilityState)
      .toEqual({ disabled: true });

    // Stepping in stays put: you are already looking at the channel, and the
    // screen fills in around the tap rather than closing and reopening.
    act(() => findButton(tree, 'Step in')!.props.onPress());
    expect(mockApp.act).toHaveBeenCalledWith('sess_1', { type: 'ENTER' });
    expect(onExit).not.toHaveBeenCalled();
    act(() => tree.unmount());
  });

  /**
   * Answering needs presence — `canAnswerKnock` — so offering the door to
   * somebody who has stepped out would be two buttons the reducer refuses.
   * Whoever is actually in the channel is being asked the same question.
   */
  it('does not offer the door to somebody who is not in the room', () => {
    showChannel(
      channelOf((c) => ({
        ...reduce(c, { type: 'STEP_OUT', userId: ME }, NOW),
        knocks: [{ id: 'knock_1', name: 'Sam', at: NOW }],
      }))
    );
    const tree = render(<ChannelView
        channelId="sess_1"
        audio={AUDIO}
        onHome={() => {}}
        onExit={() => {}}
      />);

    expect(textOf(tree)).not.toContain('is at the door');
    expect(findButton(tree, 'Let them in')).toBeUndefined();
    act(() => tree.unmount());
  });

  /**
   * `hasTheRoom`, seen from the screen. The rule is that nobody reaches into a
   * conversation they are not in, so everything that changes what the people
   * in the channel can see is disabled for somebody looking at it from
   * outside — and every one of them says the same word, "step in", because
   * that is the only way it is ever false.
   *
   * Disabled rather than hidden, unlike the microphone card and the knocks.
   * These are things this person may genuinely do, a tap on Step In from now,
   * and a control that vanished when somebody else walked in would read as a
   * bug rather than as a rule.
   */
  it('disables what belongs to the conversation, for somebody watching it', () => {
    mockApp.home = {
      invites: [],
      rejoinable: [],
      recordings: [],
      contacts: [
        { account: { id: 'acct_3', displayName: 'Miro Okafor' }, status: 'accepted' },
      ],
    };
    // Dana is in there; I am not.
    showChannel(
      channelOf((c) =>
        reduce(
          reduce(c, { type: 'STEP_OUT', userId: ME }, NOW),
          {
            type: 'GUEST_ENTERED',
            guest: {
              id: 'guest_dana',
              name: 'Dana',
              admittedAt: NOW,
              maySpeak: false,
              request: 'asking',
            },
          },
          NOW
        )
      ),
      [
        {
          id: 'rec_1',
          channelId: 'sess_1',
          name: 'Book club',
          others: [{ id: THEM, displayName: 'Dana Chu' }],
          startedAt: NOW - 60_000,
          endedAt: NOW - 30_000,
          durationMs: 30_000,
        },
      ]
    );
    const tree = render(<ChannelView
        channelId="sess_1"
        audio={AUDIO}
        onHome={() => {}}
        onExit={() => {}}
      />);
    const disabled = (label: string) => {
      const button = findButton(tree, label);
      expect([label, button !== undefined]).toEqual([label, true]);
      return [label, button!.props.accessibilityState];
    };
    const off = (label: string) => [label, { disabled: true }];

    // The guest's two buttons, which were live to anybody watching and refused
    // by the reducer — and the microphone one renders `primary` while a guest
    // is asking, so the loudest button on the screen was wired to nothing.
    expect(disabled('Let them speak')).toEqual(off('Let them speak'));
    expect(disabled('Remove')).toEqual(off('Remove'));

    expect(disabled('Invite')).toEqual(off('Invite'));
    expect(disabled('Share a guest link')).toEqual(off('Share a guest link'));
    expect(disabled('Paste my clipboard')).toEqual(off('Paste my clipboard'));
    expect(disabled('Play something together')).toEqual(
      off('Play something together')
    );

    const text = textOf(tree);
    expect(text).toContain('Step in to answer for what a guest may do');
    expect(text).toContain('Step in to invite anybody');
    expect(text).toContain('Step in to make a link');
    expect(text).toContain('Step in to put something on the channel clipboard');
    // The shared-audio hint, which is a different sentence and was the one
    // disabled cluster on this screen with nothing explaining itself.
    expect(text).toContain('What everybody is listening to is for whoever is listening');
    // And the list of contacts is still shown rather than emptied by the
    // filter, which would have claimed every contact was already in here.
    expect(text).toContain('Miro Okafor');

    // The recording row's actions are behind a tap, and two of the three are
    // refused. Export is not, and that is the assertion worth having.
    act(() => findButton(tree, 'Book club')!.props.onPress());
    expect(disabled('Rename')).toEqual(off('Rename'));
    expect(disabled('Delete')).toEqual(off('Delete'));
    expect(findButton(tree, 'Export')!.props.accessibilityState).toEqual({
      disabled: false,
    });
    expect(textOf(tree)).toContain('Step in to rename or delete');
    act(() => tree.unmount());
  });

  /**
   * The other half of the rule, and the half that keeps it from locking the
   * absent out of their own channel: an empty channel belongs to all of its
   * members equally, so a member outside one is interrupting nothing.
   */
  it('gives all of it back once nobody is in the channel', () => {
    mockApp.home = {
      invites: [],
      rejoinable: [],
      recordings: [],
      contacts: [
        { account: { id: 'acct_3', displayName: 'Miro Okafor' }, status: 'accepted' },
      ],
    };
    showChannel(
      channelOf((c) =>
        reduce(
          reduce(c, { type: 'STEP_OUT', userId: ME }, NOW),
          { type: 'STEP_OUT', userId: THEM },
          NOW
        )
      ),
      [
        {
          id: 'rec_1',
          channelId: 'sess_1',
          name: 'Book club',
          others: [{ id: THEM, displayName: 'Dana Chu' }],
          startedAt: NOW - 60_000,
          endedAt: NOW - 30_000,
          durationMs: 30_000,
        },
      ]
    );
    const tree = render(<ChannelView
        channelId="sess_1"
        audio={AUDIO}
        onHome={() => {}}
        onExit={() => {}}
      />);
    const on = (label: string) =>
      findButton(tree, label)!.props.accessibilityState;

    expect(on('Invite')).toEqual({ disabled: false });
    expect(on('Share a guest link')).toEqual({ disabled: false });
    expect(on('Paste my clipboard')).toEqual({ disabled: false });

    act(() => findButton(tree, 'Book club')!.props.onPress());
    expect(on('Rename')).toEqual({ disabled: false });
    expect(on('Delete')).toEqual({ disabled: false });

    // Still outside, so the things that are about presence for their own
    // reasons are still refused — the rule did not turn into "anything goes
    // in an empty room".
    expect(textOf(tree)).toContain('Step in');
    expect(on('Claim the floor')).toEqual({ disabled: true });
    expect(on('Record')).toEqual({ disabled: true });

    // And since 2026-08-24, putting something on. This asserted the opposite
    // until then: loading a track and starting a party are the two acts that
    // leave something behind for whoever steps in next, so they ask presence
    // where driving what is already there asks only the room. `canLoadTrack`
    // and `canStartWatch` in core.
    expect(on('Play something together')).toEqual({ disabled: true });
    expect(on('Watch something together')).toEqual({ disabled: true });
    // The screen link is not one of them — it changes nothing, and an empty
    // channel is nobody's conversation to intrude on.
    expect(on('Watch on another screen')).toEqual({ disabled: false });
    act(() => tree.unmount());
  });

  /**
   * The same rule one screen in. A channel's name is what the people in it
   * call the place they are in, so it is not for somebody who is somewhere
   * else to change under them — and `canEditChannel` governs the description
   * with it, the two being one question.
   */
  it('will not let somebody outside the conversation rename the channel', () => {
    showChannel(
      channelOf((c) => reduce(c, { type: 'STEP_OUT', userId: ME }, NOW))
    );
    const tree = render(<ChannelView
        channelId="sess_1"
        audio={AUDIO}
        onHome={() => {}}
        onExit={() => {}}
      />);
    act(() => findButton(tree, 'Settings')!.props.onPress());

    const fields = tree.root.findAll((node) => node.type === TextInput);
    expect(fields.length).toBeGreaterThan(0);
    for (const field of fields) expect(field.props.editable).toBe(false);
    expect(textOf(tree)).toContain('Step in to rename this channel');

    // Leaving is not covered, and must not be: giving up your own membership
    // is yours whatever anybody else is doing.
    expect(findButton(tree, 'Leave channel')!.props.accessibilityState).toEqual(
      { disabled: false }
    );
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

  it('warns that the room is not reaching somebody, ahead of the server', () => {
    // The earliest thing anybody can be told, and the reason it exists: the
    // server has noticed nothing — `disconnectedAt` is empty — because it
    // cannot until the heartbeat fails. The media plane already knows, and
    // whoever is mid-sentence is the person who needs telling.
    const channel = channelOf();
    showChannel(channel);

    const tree = render(<ChannelView
        channelId="sess_1"
        audio={{ ...AUDIO, failing: [THEM] }}
        onHome={() => {}}
        onExit={() => {}}
      />);
    const text = textOf(tree);
    expect(text).toContain('Present · not receiving you');
    expect(text).not.toContain('Present · reconnecting…');
    act(() => tree.unmount());
  });

  it('says nothing about your own connection on your own row', () => {
    // Your connection failing is already said once, in the first person, on
    // the audio status line. Said again here it would be the same failure
    // reported twice, one of them phrased as though you were watching yourself
    // from outside.
    const channel = channelOf();
    showChannel(channel);

    const tree = render(<ChannelView
        channelId="sess_1"
        audio={{ ...AUDIO, failing: [ME] }}
        onHome={() => {}}
        onExit={() => {}}
      />);
    expect(textOf(tree)).not.toContain('not receiving you');
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
    // Device clock is irrelevant; serverNow decides. 40s into a 60s claim,
    // said in seconds — the claim cannot reach a minute, so a clock face would
    // spend its left digit on a zero.
    mockApp.serverNow = () => NOW + 40_000;
    const tree = render(<ChannelView
        channelId="sess_1"
        audio={AUDIO}
        onHome={() => {}}
        onExit={() => {}}
      />);
    expect(textOf(tree)).toContain('20s');
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

  /**
   * **Which device the button is about**, which is the whole of what it had
   * been getting wrong.
   *
   * The roster is one account's answer and the button is one device's
   * question, and a snapshot only carries the first. A second phone opening a
   * channel its owner is already in read `present` as though it described
   * itself, offered Step out, and connected the audio — and since the media
   * room admits one participant per account, the two devices then took it from
   * each other in turn. `standingIn` is the fact the roster cannot carry.
   */
  it('offers a way in on a device that is not the one standing there', () => {
    showChannel(channelOf());
    // The account is in the channel; this copy of the app is not what is
    // holding it. `showChannel` assumes the ordinary case, so this is the
    // line that makes it the two-device one.
    mockApp.standingIn = null;
    const tree = render(<ChannelView
        channelId="sess_1"
        audio={AUDIO}
        onHome={() => {}}
        onExit={() => {}}
      />);

    expect(findButton(tree, 'Step out')).toBeUndefined();
    const stepIn = findButton(tree, 'Step in');
    expect(stepIn).toBeDefined();
    // And it says which of the two "not in it" cases this is, rather than the
    // copy for a channel nobody is in.
    expect(textOf(tree)).toContain('not on this device');
    expect(textOf(tree)).not.toContain('without being in it');

    act(() => stepIn!.props.onPress());
    expect(mockApp.act).toHaveBeenCalledWith('sess_1', { type: 'ENTER' });
    act(() => tree.unmount());
  });

  /**
   * The server says so only when another session *acts*, and when it has, the
   * screen can name the reason instead of describing the state.
   */
  it('names the other device once the server has said so', () => {
    showChannel(channelOf());
    mockApp.standingIn = null;
    mockApp.displaced = true;
    const tree = render(<ChannelView
        channelId="sess_1"
        audio={AUDIO}
        onHome={() => {}}
        onExit={() => {}}
      />);

    expect(findButton(tree, 'Step in')).toBeDefined();
    expect(textOf(tree)).toContain('on another device');
    act(() => tree.unmount());
  });

  /**
   * A channel nobody is in is the third case, and must keep its own words —
   * the two above are about being present somewhere you are not holding, and
   * this is about not being present at all.
   */
  it('keeps the plain copy for a channel this account is not in', () => {
    const channel = reduce(channelOf(), { type: 'STEP_OUT', userId: ME }, NOW);
    showChannel(channel);
    mockApp.standingIn = null;
    const tree = render(<ChannelView
        channelId="sess_1"
        audio={AUDIO}
        onHome={() => {}}
        onExit={() => {}}
      />);

    expect(findButton(tree, 'Step in')).toBeDefined();
    expect(textOf(tree)).toContain('without being in it');
    expect(textOf(tree)).not.toContain('not on this device');
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

  it('orders the screen by what somebody in a conversation reaches for', () => {
    // Roughly by how often it is wanted, and pinned here because the order is
    // a decision rather than an accident of how the JSX was written. It has
    // changed twice already: the floor used to sit at the top, inviting
    // directly under the roster, and the clipboard between the audio cards —
    // and this test is what noticed each time. The three audio sections are
    // contiguous on purpose, which is the constraint most easily broken by
    // adding a section in the obvious place.
    showChannel(channelOf());
    const tree = render(<ChannelView
        channelId="sess_1"
        audio={AUDIO}
        onHome={() => {}}
        onExit={() => {}}
      />);

    const order = [
      // The floor is first among the controls as of 2026-08-31, directly under
      // the roster. It was fifth — under the microphone and under the
      // departure — which put the one mechanic the application is named after
      // below a readout about yourself and at the same weight as the guest
      // link. It is about the roster above it: it decides who among those
      // people may be heard.
      'The floor',
      'Your microphone',
      // Sentence case now, with the rest of them. It was "Step Out",
      // capitalised, because one label served both departures and flipped to
      // "Step In" when you were not present; splitting them left nothing for
      // the capital to distinguish. The lowercase hazard the capital guarded
      // against is gone with the text search — this reads the `SectionLabel`s
      // themselves, so a "step out" in some card's prose cannot be mistaken
      // for the heading.
      'Step out',
      'Shared clipboard',
      // Above the audio rather than below it, moved 2026-08-23. Both are
      // things the channel can be attending to and only one can be, so the
      // order is a claim about which is reached for first — and a party is a
      // deliberate act somebody sets up, where a track is loaded and left.
      'Watch together',
      'Shared audio',
      'Recording',
      'Recordings',
      'Invite',
      // Last, and absent from this list until the structural read insisted on
      // it. A list that named eight of nine sections was only ever checking
      // the eight it happened to name.
      'Guest link',
    ];
    /*
      Read off the `SectionLabel`s themselves rather than by searching the
      flattened text for each word.
      **The search version was quietly wrong and this move is what exposed it**:
      the watch card's own prose contained the word "Recording", so
      `indexOf('Recording')` found a sentence rather than the heading, and the
      order it computed depended on which cards happened to mention each
      other. It passed for the wrong reason until the card moved above the one
      whose name it mentioned.
    */
    const labels = tree.root
      .findAll((node) => node.type === SectionLabel)
      .map((node) => labelOf(node).trim());
    expect(labels).toEqual(order);

    /*
      And the seams, in among the sections rather than checked apart from
      them. Two groups, not ten equal sections: everything before the first
      heading is the conversation — the room, the floor, your microphone, the
      way out — and the headings are the only thing on this screen that says
      the sections below them are a different kind of thing.

      Read as one interleaved sequence on purpose. Asking separately whether
      both headings render would pass with either of them in the wrong run,
      which is the only way this can actually go wrong.
    */
    const structure = tree.root
      .findAll(
        (node) => node.type === SectionLabel || node.type === GroupHeading
      )
      .map((node) => labelOf(node).trim());
    expect(structure).toEqual([
      'The floor',
      'Your microphone',
      'Step out',
      'What the channel is carrying',
      'Shared clipboard',
      'Watch together',
      'Shared audio',
      'Recording',
      'Recordings',
      'Who gets in',
      'Invite',
      'Guest link',
    ]);
    act(() => tree.unmount());
  });

  /*
    Pinned rather than scrolled, and asserted on the prop because nothing else
    can see it. `Screen` renders `header` as a sibling above the ScrollView, so
    handing it there is the whole of what "fixed" means — and both arrangements
    flatten to the same string, so a text search reads a header that scrolls
    away and one that does not as identical.
  */
  it('pins the channel header rather than scrolling it away', () => {
    showChannel(
      channelOf((s) =>
        reduce(
          s,
          {
            type: 'SET_DESCRIPTION',
            userId: THEM,
            description: 'Reading Dune on Thursdays.',
          },
          NOW
        )
      )
    );
    const tree = render(
      <ChannelView channelId="sess_1" audio={AUDIO} onHome={() => {}} onExit={() => {}} />
    );
    const [screen] = tree.root.findAll((node) => node.type === Screen);
    const header = render(screen.props.header);

    // Where you are and the two ways out of it, which is what has to stay: on
    // the longest screen in the application, Home used to be a flick away
    // from wherever anybody actually was.
    expect(textOf(header)).toContain('Dana Chu');
    expect(findButton(header, 'Home')).toBeDefined();
    expect(findButton(header, 'Settings')).toBeDefined();

    // And the description stayed behind, in the scroll. It is prose of any
    // length, and a pinned header is the one place on this screen that cannot
    // afford something that grows. Asserted against a description the channel
    // actually has, so that the absence means something.
    expect(textOf(tree)).toContain('Reading Dune on Thursdays.');
    expect(textOf(header)).not.toContain('Reading Dune on Thursdays.');
    act(() => header.unmount());
    act(() => tree.unmount());
  });

  /*
    The recording indicator joins them while a recording runs, and only then.
    It marked the top of the scroll, so the one fact somebody needs at every
    moment — that they are being captured — was the first thing to leave the
    viewport.
  */
  it('pins the recording indicator, and only while one is running', () => {
    showChannel(channelOf());
    const idle = render(
      <ChannelView channelId="sess_1" audio={AUDIO} onHome={() => {}} onExit={() => {}} />
    );
    const [idleScreen] = idle.root.findAll((node) => node.type === Screen);
    const idleHeader = render(idleScreen.props.header);
    expect(textOf(idleHeader)).not.toContain('Recording');
    act(() => idleHeader.unmount());
    act(() => idle.unmount());

    showChannel(
      channelOf((c) =>
        reduce(c, { type: 'START_RECORDING', userId: ME, runId: 'rec_1' }, NOW)
      )
    );
    const live = render(
      <ChannelView channelId="sess_1" audio={AUDIO} onHome={() => {}} onExit={() => {}} />
    );
    const [liveScreen] = live.root.findAll((node) => node.type === Screen);
    const liveHeader = render(liveScreen.props.header);
    expect(textOf(liveHeader)).toContain('Recording');
    act(() => liveHeader.unmount());
    act(() => live.unmount());
  });

  /*
    The footer, rendered on its own for two reasons. It is passed through
    `Screen`'s `footer` slot, which is the whole of what "pinned" means and is
    invisible to a text search — and its Step out shares a label with the card
    further down the screen, so `findButton` over the whole tree would find
    whichever comes first rather than the one meant.
  */
  const footerOf = (tree: ReactTestRenderer) => {
    const [screen] = tree.root.findAll((node) => node.type === Screen);
    return render(screen.props.footer);
  };

  it('pins three controls under the conversation', () => {
    showChannel(channelOf());
    const tree = render(
      <ChannelView channelId="sess_1" audio={AUDIO} onHome={() => {}} onExit={() => {}} />
    );
    const footer = footerOf(tree);

    // Present and unmuted with nobody else here: mute is yours to use, the
    // floor is not (it wants two people), and stepping out always is.
    expect(textOf(footer)).toContain('Mute');
    expect(textOf(footer)).toContain('Claim');
    expect(textOf(footer)).toContain('Step out');
    act(() => footer.unmount());
    act(() => tree.unmount());
  });

  /*
    Every label says the act it would perform rather than the state it is in —
    the icon and its colour carry the state, so a label reading "Muted" would
    leave nothing on the control saying what a tap does.

    Muted and holding the floor are asserted separately because they cannot
    both hold: claiming the floor is holding it open to speak, so the reducer
    clears the self-mute. Written as one case first, which is how that was
    found — the footer was right and the fixture was impossible.
  */
  it('flips the mute label when you have muted yourself', () => {
    showChannel(
      channelOf((c) =>
        reduce(c, { type: 'SET_SELF_MUTE', userId: ME, muted: true }, NOW)
      )
    );
    const tree = render(
      <ChannelView channelId="sess_1" audio={AUDIO} onHome={() => {}} onExit={() => {}} />
    );
    const footer = footerOf(tree);
    expect(textOf(footer)).toContain('Unmute');
    act(() => footer.unmount());
    act(() => tree.unmount());
  });

  it('flips the floor label while you hold it', () => {
    showChannel(
      channelOf((c) => reduce(c, { type: 'CLAIM_FLOOR', userId: ME }, NOW))
    );
    const tree = render(
      <ChannelView channelId="sess_1" audio={AUDIO} onHome={() => {}} onExit={() => {}} />
    );
    const footer = footerOf(tree);
    expect(textOf(footer)).toContain('Release');
    // And the mute goes back to offering a mute, the claim having cleared it.
    expect(textOf(footer)).toContain('Mute');
    expect(textOf(footer)).not.toContain('Unmute');
    act(() => footer.unmount());
    act(() => tree.unmount());
  });

  it('greys what the reducer would refuse, and never the way out', () => {
    // Outside the room. The mute is not yours — the microphone is shut and
    // muting it changes nothing anybody can hear — and the floor wants
    // presence. Step in is the one thing that must stay live, since it is the
    // only control on this bar that could get you the other two.
    showChannel(
      channelOf((c) => reduce(c, { type: 'STEP_OUT', userId: ME }, NOW))
    );
    const tree = render(
      <ChannelView channelId="sess_1" audio={AUDIO} onHome={() => {}} onExit={() => {}} />
    );
    const footer = footerOf(tree);

    expect(findButton(footer, 'Mute')!.props.accessibilityState.disabled).toBe(true);
    expect(findButton(footer, 'Claim')!.props.accessibilityState.disabled).toBe(true);
    const stepIn = findButton(footer, 'Step in')!;
    expect(stepIn.props.accessibilityState.disabled).toBe(false);

    act(() => stepIn.props.onPress());
    expect(mockApp.act).toHaveBeenCalledWith('sess_1', { type: 'ENTER' });
    act(() => footer.unmount());
    act(() => tree.unmount());
  });

  it('acts on the same actions the cards send', () => {
    showChannel(channelOf());
    const tree = render(
      <ChannelView channelId="sess_1" audio={AUDIO} onHome={() => {}} onExit={() => {}} />
    );
    const footer = footerOf(tree);

    act(() => findButton(footer, 'Mute')!.props.onPress());
    expect(mockApp.act).toHaveBeenCalledWith('sess_1', {
      type: 'SET_SELF_MUTE',
      muted: true,
    });

    act(() => findButton(footer, 'Step out')!.props.onPress());
    expect(mockApp.act).toHaveBeenCalledWith('sess_1', { type: 'STEP_OUT' });
    // Stepping out of the footer leaves the screen exactly as the card does —
    // the view is dropped and the caller told, not just the reducer poked.
    expect(mockApp.leaveChannelView).toHaveBeenCalledWith('sess_1');
    act(() => footer.unmount());
    act(() => tree.unmount());
  });

  /**
   * The one setting on this screen that is about the reader rather than about
   * the channel. It shows what they are on, and every level says in a sentence
   * what it does — "Quiet" in particular has to make clear that notifications
   * still arrive, or the people who want exactly it avoid it.
   */
  it('offers the three notification levels, on the default', () => {
    showChannel(channelOf());
    const tree = render(<ChannelView
        channelId="sess_1"
        audio={AUDIO}
        onHome={() => {}}
        onExit={() => {}}
      />);
    act(() => findButton(tree, 'Settings')!.props.onPress());

    const quiet = findButton(tree, 'Quiet');
    const pings = findButton(tree, 'Pings only');
    const everything = findButton(tree, 'Everything');
    expect(quiet).toBeDefined();
    expect(everything).toBeDefined();
    expect(labelOf(quiet!)).toContain('pings included');
    // The default is the one shown as chosen, without anybody having chosen
    // it. Compared against a sibling rather than against a colour, so this
    // says "one of them is marked" without pinning the palette.
    const background = (button: typeof pings) =>
      JSON.stringify(button!.props.style({ pressed: false }));
    expect(background(pings)).not.toEqual(background(quiet));
    expect(background(quiet)).toEqual(background(everything));
    act(() => tree.unmount());
  });

  it('sends the level somebody taps, and shows it as chosen', () => {
    showChannel(channelOf());
    const tree = render(<ChannelView
        channelId="sess_1"
        audio={AUDIO}
        onHome={() => {}}
        onExit={() => {}}
      />);
    act(() => findButton(tree, 'Settings')!.props.onPress());

    act(() => findButton(tree, 'Quiet')!.props.onPress());

    expect(mockApp.setNotificationLevel).toHaveBeenCalledWith('sess_1', 'low');
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

  /*
    And it is pinned, which is the half of "says so" a text search cannot see:
    a bar that scrolls out of the viewport on the first flick gives no sign of
    an open microphone for most of a list as long as somebody's channels.

    Asserted on `Screen`'s `header` prop for the reason the channel's version
    is — both arrangements flatten to the same string.
  */
  it('pins the live bar and the header above the list', () => {
    home();
    const tree = render(
      <HomeView
        {...homeNav}
        liveChannel={{
          channelId: 'sess_1',
          title: 'Book club',
          present: 2,
          muted: false,
        }}
        onReturnToChannel={jest.fn()}
      />
    );
    const [screen] = tree.root.findAll((node) => node.type === Screen);
    const header = render(screen.props.header);
    const text = textOf(header);

    expect(text).toContain('The Floor');
    expect(text).toContain('Book club');
    expect(findButton(header, 'Contacts')).toBeDefined();
    expect(findButton(header, 'Settings')).toBeDefined();
    act(() => header.unmount());
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

    await act(async () => findButton(tree, 'Back')!.props.onPress());
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
    // The header, not the roster below it: both say "Dana Chu". 20 since the
    // header was pinned — it rides above every screenful now, so a large
    // title's height would be paid for on all of them rather than once at the
    // top of the scroll.
    const [header] = tree.root.findAll(
      (n) =>
        n.props?.children === 'Dana Chu' &&
        StyleSheet.flatten(n.props?.style)?.fontSize === 20
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
   * The other half of "Tap a channel to step in", which is off here.
   *
   * The channel opens and nothing is dispatched: no ENTER, so nobody is told
   * you have arrived and the microphone is never asked for. The screen that
   * opens is the one with a Step In button on it — see the channel tests.
   */
  it('opens a channel without entering it when stepping in is deliberate', () => {
    const onEnterChannel = jest.fn();
    mockApp.tapToStepIn = false;
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

    act(() => pressableFor(tree, 'Thursday rehearsal').props.onPress());
    expect(mockApp.act).not.toHaveBeenCalled();
    expect(onEnterChannel).toHaveBeenCalledWith('sess_b');
    act(() => tree.unmount());
  });

  /** What the row promises has to be what the tap does. */
  it('says the tap opens rather than joins when it does not step in', () => {
    mockApp.tapToStepIn = false;
    mockApp.home = {
      invites: [
        {
          channelId: 'sess_i',
          name: null,
          from: { id: THEM, displayName: 'Dana Chu' },
          others: [{ id: THEM, displayName: 'Dana Chu' }],
          presentCount: 1,
          createdAt: NOW,
        },
      ],
      rejoinable: [],
      contacts: [],
      recordings: [],
    };
    const tree = render(<HomeView {...homeNav} />);

    expect(textOf(tree)).toContain('Dana Chu is waiting');
    expect(textOf(tree)).not.toContain('tap to join');
    expect(pressableFor(tree, 'Dana Chu').props.accessibilityLabel).toContain(
      'Open.'
    );
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

  it('still lists them when there is nowhere to send you', async () => {
    // No route in the app leaves this out any more — both callers pass one,
    // ChannelView included since 2026-08-31 — but the prop stays optional and
    // this is what a caller without one gets. The section used to be left out
    // entirely when it was absent, which meant nobody ever saw it, neither
    // caller then passing one. What you share with somebody is worth reading
    // where it cannot be acted on; only the tap goes.
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

    const text = textOf(tree);
    expect(text).toContain('Channels with them');
    expect(text).toContain('Thursday rehearsal');
    // A card rather than a button: nothing here claims to be pressable.
    expect(
      tree.root.findAll(
        (n) =>
          n.props?.accessibilityRole === 'button' &&
          typeof n.props?.accessibilityLabel === 'string' &&
          n.props.accessibilityLabel.startsWith('Thursday rehearsal')
      )
    ).toHaveLength(0);
    act(() => tree.unmount());
  });

  it('says where they have been in each, which is not where the room has', async () => {
    // The point of the section. `lastPresenceAt` is the maximum across
    // everybody in the channel, so a room two other people sat in all
    // afternoon reads as busy while the person whose profile this is has not
    // opened it for a week — and the card is about them.
    withChannels([
      {
        ...channel('sess_busy', 'Thursday rehearsal', THEM),
        presentCount: 3,
        lastPresenceAt: NOW,
      },
      { ...channel('sess_here', 'Quartet', THEM), presentCount: 1 },
      { ...channel('sess_never', 'Just the two of us', THEM) },
    ]);
    mockApp.loadProfile.mockResolvedValueOnce({
      account: { id: THEM, displayName: 'Dana Chu' },
      sharedChannels: [
        {
          channelId: 'sess_busy',
          present: false,
          lastPresentAt: NOW - 7 * 24 * 3_600_000,
        },
        { channelId: 'sess_here', present: true, lastPresentAt: NOW },
        { channelId: 'sess_never', present: false, lastPresentAt: null },
      ],
    });

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

    const text = textOf(tree);
    // Theirs first, and the room's occupancy after it — the second is why you
    // would tap, and dropping it would leave the card honest and unhelpful.
    expect(text).toContain('Last here 7 days ago · 3 present');
    expect(text).toContain('Here now · 1 present');
    // Never, which is an ordinary state: nobody has opened the channel a pair
    // get for becoming contacts. No count, there being nobody to count.
    expect(text).toContain('Never been here');
    expect(text).not.toContain('Never been here · ');
    act(() => tree.unmount());
  });

  it('keeps the room’s own number here, where Home no longer does', async () => {
    // The fallback branch of `describeQuiet`, pinned deliberately rather than
    // left as a happy accident. A profile card gets no `lastPresenceByOthers`
    // and must not: it already carries `sharedChannels`, which is the same
    // question asked per person and answered with more detail — and this line
    // is the one drawn when that array is missing, whose whole job is to
    // describe the *room*. Excluding the reader from a card that is about
    // somebody else answers nobody's question.
    //
    // Somebody tidying will one day notice Home passes a field here that this
    // does not. This says the asymmetry is the design.
    withChannels([
      {
        ...channel('sess_quiet', 'Thursday rehearsal', THEM),
        presentCount: 0,
        lastPresenceAt: NOW - 5 * 60_000,
      },
    ]);
    mockApp.loadProfile.mockResolvedValueOnce({
      account: { id: THEM, displayName: 'Dana Chu' },
    });

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

    expect(textOf(tree)).toContain('5 minutes ago');
    expect(textOf(tree)).not.toContain('Nobody else yet');
    act(() => tree.unmount());
  });

  it('leaves the section out when the profile is your own', async () => {
    // It would be Home's list of your channels with your own name against
    // every line. The Contact card goes for the same reason.
    withChannels([channel('sess_shared', 'Thursday rehearsal', ME)]);

    let tree!: ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(
        <ProfileView accountId={ME} fallbackName="Me" onBack={() => {}} />
      );
    });

    expect(textOf(tree)).not.toContain('Channels with them');
    act(() => tree.unmount());
  });
});

/**
 * Handing somebody your address, which is the one thing about a person this
 * app will not release on a relationship alone.
 *
 * Two decisions rather than one, and the screen draws them as two: what they
 * have chosen to show you, and what you have chosen to show them. Neither
 * implies or asks for the other.
 */
describe('showing your email to a contact', () => {
  const asContact = (status: 'accepted' | 'outgoing' = 'accepted') => {
    mockApp.home = {
      invites: [],
      rejoinable: [],
      recordings: [],
      contacts: [
        { account: { id: THEM, displayName: 'Dana Chu' }, status },
      ],
    };
  };

  const withProfile = (extra: Partial<ProfileViewData>) =>
    mockApp.loadProfile.mockResolvedValue({
      account: { id: THEM, displayName: 'Dana Chu' },
      ...extra,
    } as ProfileViewData);

  async function open() {
    let tree!: ReactTestRenderer;
    await act(async () => {
      tree = render(
        <ProfileView accountId={THEM} fallbackName="Dana Chu" onBack={() => {}} />
      );
    });
    return tree;
  }

  /**
   * `withProfile` sets a standing implementation rather than a one-shot,
   * because pressing either button re-reads the profile — so a `…Once` would
   * answer the first read and leave the second with the shared default. A
   * standing one outlives the test, `clearAllMocks` clearing calls and not
   * implementations, so it is put back by hand.
   */
  const defaultProfile = mockApp.loadProfile.getMockImplementation()!;

  beforeEach(() => {
    (Clipboard.setStringAsync as jest.Mock).mockImplementation(async () => true);
  });

  afterEach(() => {
    mockApp.loadProfile.mockImplementation(defaultProfile);
  });

  it('offers the button, and says what it does', async () => {
    asContact();
    withProfile({ myEmailShown: false });
    const tree = await open();

    expect(findButton(tree, 'Show my email')).toBeDefined();
    expect(textOf(tree)).toContain('Show my email to this contact.');
    act(() => tree.unmount());
  });

  it('sends the decision and re-reads what the server now says', async () => {
    // Re-read rather than patched in place: the server decides the field, and
    // a screen that assumed the answer would be a second copy of the rule.
    asContact();
    withProfile({ myEmailShown: false });
    const tree = await open();
    mockApp.loadProfile.mockClear();

    await act(async () => findButton(tree, 'Show my email')!.props.onPress());

    expect(mockApp.setEmailShown).toHaveBeenCalledWith(THEM, true);
    expect(mockApp.loadProfile).toHaveBeenCalledWith(THEM);
    act(() => tree.unmount());
  });

  it('offers to stop once it is shown, and says what stopping cannot do', async () => {
    asContact();
    withProfile({ myEmailShown: true });
    const tree = await open();

    const text = textOf(tree);
    expect(text).toContain('They can see your email.');
    // The honest half: it ends the standing ability to come back for it, and
    // reaches nowhere they have already written it down.
    expect(text).toContain('already have it written down');
    expect(findButton(tree, 'Show my email')).toBeUndefined();

    await act(async () =>
      findButton(tree, 'Stop showing my email')!.props.onPress()
    );
    expect(mockApp.setEmailShown).toHaveBeenCalledWith(THEM, false);
    act(() => tree.unmount());
  });

  it('shows theirs with a button that copies it', async () => {
    asContact();
    withProfile({ email: 'dana@example.com', myEmailShown: false });
    const tree = await open();

    expect(textOf(tree)).toContain('dana@example.com');
    await act(async () => findButton(tree, 'Copy')!.props.onPress());

    expect(Clipboard.setStringAsync).toHaveBeenCalledWith('dana@example.com');
    expect(textOf(tree)).toContain('copied');
    act(() => tree.unmount());
  });

  it('says so when the clipboard declines, rather than claiming a copy', async () => {
    // `setStringAsync` resolves to a boolean precisely so a copy that did not
    // happen is not announced as one — see src/clipboard.ts.
    (Clipboard.setStringAsync as jest.Mock).mockImplementation(async () => false);
    asContact();
    withProfile({ email: 'dana@example.com' });
    const tree = await open();

    await act(async () => findButton(tree, 'Copy')!.props.onPress());
    expect(textOf(tree)).toContain('copy failed');
    act(() => tree.unmount());
  });

  it('says which half is empty rather than leaving a gap', async () => {
    asContact();
    withProfile({ myEmailShown: false });
    expect(textOf(await open())).toContain(
      'They are not showing you their email.'
    );
  });

  it('is not offered to anybody who is not a contact', async () => {
    // The server refuses the same call, and that is the load-bearing half.
    // This is the screen agreeing with it rather than offering a button that
    // would be refused — somebody met in a channel is asked to be a contact
    // first, which the card above does.
    for (const home of ['outgoing', 'none'] as const) {
      if (home === 'none') mockApp.home = null;
      else asContact('outgoing');
      withProfile({ myEmailShown: false });
      const tree = await open();
      expect(textOf(tree)).not.toContain('Show my email');
      act(() => tree.unmount());
    }
  });
});

/**
 * Where else somebody can be reached, which is the other half of the errand
 * the Email card is the first half of.
 *
 * The screen's job is small — the rules are in `core/im.ts` and tested there —
 * so what is asserted here is the link a tap opens, that a handle is written
 * the way it is stored rather than the way it was typed, and that a section
 * with nothing in it is absent rather than empty.
 */
describe('reaching somebody in the messaging apps they use', () => {
  const withProfile = (extra: Partial<ProfileViewData>) =>
    mockApp.loadProfile.mockResolvedValueOnce({
      account: { id: THEM, displayName: 'Dana Chu' },
      ...extra,
    } as ProfileViewData);

  const open = async (id: string = THEM) => {
    mockApp.home = { invites: [], rejoinable: [], recordings: [], contacts: [] };
    let tree!: ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(
        <ProfileView accountId={id} fallbackName="Dana Chu" onBack={() => {}} />
      );
    });
    return tree;
  };

  it('draws one row per handle, and opens the app on a tap', async () => {
    const { Linking } = require('react-native');
    const opened = jest
      .spyOn(Linking, 'openURL')
      .mockResolvedValue(undefined as never);

    withProfile({
      im: { whatsapp: '+15551234567', telegram: 'dana_chu' },
    });
    const tree = await open();

    const text = textOf(tree);
    expect(text).toContain('WhatsApp');
    expect(text).toContain('+15551234567');
    expect(text).toContain('Telegram');
    // Nothing is drawn for the service they left blank.
    expect(text).not.toContain('Signal');

    await act(async () => findButton(tree, 'Open')!.props.onPress());
    expect(opened).toHaveBeenCalledWith('https://wa.me/15551234567');

    opened.mockRestore();
    act(() => tree.unmount());
  });

  it('leaves the section out when there is nothing in it', async () => {
    // Which is the same screen a stranger gets, the server withholding the
    // handles from anybody who is not a contact — and the same one an older
    // server produces. All three mean there is no way to reach this person
    // elsewhere from here, and none is worth a card saying so.
    withProfile({});
    const tree = await open();
    expect(textOf(tree)).not.toContain('Messaging');
    act(() => tree.unmount());
  });

  it('offers the fields on your own profile, and stores what it can read', async () => {
    mockApp.home = { invites: [], rejoinable: [], recordings: [], contacts: [] };
    mockApp.loadProfile.mockResolvedValueOnce({
      account: { id: ME, displayName: 'Me' },
      im: { telegram: 'me_here' },
    } as ProfileViewData);
    let tree!: ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(
        <ProfileView accountId={ME} fallbackName="Me" onBack={() => {}} />
      );
    });
    await act(async () => findButton(tree, 'Edit')!.props.onPress());

    const field = (placeholder: string, index = 0) =>
      tree.root.findAll(
        (n) => typeof n.type === 'string' && n.props?.placeholder === placeholder
      )[index];

    // Seeded from what the server holds, like the name.
    expect(field('@username').props.value).toBe('me_here');

    // WhatsApp first, Signal second — the two share a hint, both being phone
    // numbers, which is why this is by position.
    act(() =>
      field('+1 555 123 4567').props.onChangeText('+1 (555) 987-6543')
    );
    await act(async () => field('+1 555 123 4567').props.onBlur());

    // Canonical on the wire, whatever was typed into the field.
    expect(mockApp.saveProfile).toHaveBeenCalledWith({
      im: { whatsapp: '+15559876543' },
    });
    act(() => tree.unmount());
  });

  it('says what a half-typed handle needs rather than sending it', async () => {
    mockApp.home = { invites: [], rejoinable: [], recordings: [], contacts: [] };
    mockApp.loadProfile.mockResolvedValueOnce({
      account: { id: ME, displayName: 'Me' },
    } as ProfileViewData);
    let tree!: ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(
        <ProfileView accountId={ME} fallbackName="Me" onBack={() => {}} />
      );
    });
    await act(async () => findButton(tree, 'Edit')!.props.onPress());

    const whatsapp = tree.root.findAll(
      (n) =>
        typeof n.type === 'string' && n.props?.placeholder === '+1 555 123 4567'
    )[0];
    act(() => whatsapp.props.onChangeText('555 1234'));
    await act(async () => whatsapp.props.onBlur());

    // The server would refuse it — and refuse the name it travelled with,
    // this being one write — so it is not sent, and the field says what
    // is missing while the typing stays where it was typed.
    expect(mockApp.saveProfile).not.toHaveBeenCalled();
    expect(textOf(tree)).toContain('country code');
    expect(whatsapp.props.value).toBe('555 1234');
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
 * A channel screen with the repeated cards turned off.
 *
 * The setting removes ways of doing a thing twice, and nothing else, so what
 * these assert is a subtraction and the several exceptions to it: the
 * microphone and the two departures go whole, the floor's card stays and loses
 * only its button, the footer is untouched, and the two sentences that are
 * notices rather than explanations survive the cards that used to carry them.
 * The diagnostic panel survives too, on the ground that it is not a control
 * and no footer represents it.
 */
describe('a channel screen without the repeated cards', () => {
  const footerOf = (tree: ReactTestRenderer) => {
    const [screen] = tree.root.findAll((node) => node.type === Screen);
    return render(screen.props.footer);
  };

  const showBare = (channel = channelOf()) => {
    mockApp.controlCards = false;
    showChannel(channel);
    return render(
      <ChannelView channelId="sess_1" audio={AUDIO} onHome={() => {}} onExit={() => {}} />
    );
  };

  it('drops the cards the footer already offers', () => {
    const tree = showBare();
    const text = textOf(tree);
    expect(text).not.toContain('Your microphone');
    expect(text).not.toContain('Mute yourself');
    // Step out is in the footer, which `textOf` reaches through `Screen`, so
    // the assertion is that there is one of it rather than none — the card
    // and the heading above it are what went.
    expect(text.split('Step out')).toHaveLength(2);
    act(() => tree.unmount());
  });

  /**
   * The one card that stays, and the only one the setting reaches into rather
   * than removing. What it holds is a readout — who has the floor, how long is
   * left, why a claim is refused — and a footer icon has no room for any of
   * it. Only the button is a second way of doing something already under the
   * thumb.
   */
  it('keeps the floor card and takes only its button', () => {
    const tree = showBare();
    const text = textOf(tree);
    expect(text).toContain('The floor');
    expect(text).toContain('Nobody has the floor');
    expect(text).toContain('Speak uninterrupted for up to a minute.');
    // 'Claim' alone is the footer's, which stays. The card's button is the
    // longer label, and there is none of it.
    expect(text).not.toContain('Claim the floor');
    expect(text).not.toContain('Release the floor');
    act(() => tree.unmount());
  });

  /**
   * The clock, which is the reason the card stays: it is not repeated
   * anywhere, least of all in a bar with room for one word.
   */
  it('still runs the countdown while somebody holds the floor', () => {
    const tree = showBare(
      channelOf((c) => reduce(c, { type: 'CLAIM_FLOOR', userId: THEM }, NOW))
    );
    const text = textOf(tree);
    expect(text).toContain('has the floor');
    // The clock itself, and the sentence saying why the act is refused.
    expect(text).toContain('60s');
    expect(text).toContain('You cannot claim the floor while you are silenced.');
    expect(text).not.toContain('Claim the floor');
    act(() => tree.unmount());
  });

  it('leaves everything the footer does not represent alone', () => {
    const tree = showBare();
    const text = textOf(tree);
    // The roster above the seam and the whole of what is below it.
    expect(text).toContain('Dana Chu');
    expect(text).toContain('What the channel is carrying');
    expect(text).toContain('Shared clipboard');
    expect(text).toContain('Recording');
    act(() => tree.unmount());
  });

  /**
   * The point of the setting, and the reason nothing is actually lost: the bar
   * is the same bar, with the same three acts on it, whichever way this is
   * set. A footer that thinned out with the cards would be a preference that
   * removed abilities rather than repetition.
   */
  it('keeps all three controls in the footer', () => {
    const tree = showBare();
    const footer = footerOf(tree);
    const text = textOf(footer);
    expect(text).toContain('Mute');
    expect(text).toContain('Claim');
    expect(text).toContain('Step out');
    act(() => footer.unmount());
    act(() => tree.unmount());
  });

  /**
   * Being unheard is not being unrecorded, and that sentence lived in the
   * microphone card. It is a notice rather than an explanation of a control,
   * so it moves up under the roster rather than going with the card — the
   * settings screen promises exactly this in as many words.
   */
  it('still says a silenced microphone is being recorded', () => {
    const tree = showBare(
      channelOf((c) =>
        reduce(
          reduce(c, { type: 'START_RECORDING', userId: ME, runId: 'rec_1' }, NOW),
          { type: 'CLAIM_FLOOR', userId: THEM },
          NOW
        )
      )
    );
    expect(textOf(tree)).toContain('You are still being recorded');
    act(() => tree.unmount());
  });

  it('says it exactly once when the cards are drawn', () => {
    mockApp.controlCards = true;
    showChannel(
      channelOf((c) =>
        reduce(
          reduce(c, { type: 'START_RECORDING', userId: ME, runId: 'rec_1' }, NOW),
          { type: 'CLAIM_FLOOR', userId: THEM },
          NOW
        )
      )
    );
    const tree = render(
      <ChannelView channelId="sess_1" audio={AUDIO} onHome={() => {}} onExit={() => {}} />
    );
    expect(textOf(tree).split('You are still being recorded')).toHaveLength(2);
    act(() => tree.unmount());
  });

  /**
   * The other exception. Stepping in from here closes a microphone on another
   * phone, which the footer's Step In has no room to say and which somebody
   * would otherwise discover by doing it.
   */
  it('still says the channel is held on another device', () => {
    mockApp.controlCards = false;
    mockApp.displaced = true;
    showChannel(channelOf());
    // Present in the room, not on this device: the case the sentence is for.
    mockApp.standingIn = null;
    const tree = render(
      <ChannelView channelId="sess_1" audio={AUDIO} onHome={() => {}} onExit={() => {}} />
    );
    const text = textOf(tree);
    expect(text).toContain('closes the microphone there');
    // And the card it came from is still gone.
    expect(text).not.toContain('You are looking at this channel without');
    act(() => tree.unmount());
  });

  /**
   * The panel is a diagnostic, not one of the three acts, so a setting about
   * repeating the footer must not take it away — it would take it away from
   * the one account in a position to be reading it.
   */
  it('keeps the audio diagnostic panel, under a heading of its own', () => {
    mockApp.debug = true;
    const tree = showBare();
    expect(textOf(tree)).toContain('Audio session');
    act(() => tree.unmount());
  });
});

/**
 * Whether the channel screen repeats its footer as cards.
 *
 * The same three things this screen owes any of its settings: both answers, a
 * mark on the one in force, and reporting a change upward. What the choice
 * does is asserted on the channel screen above.
 */
describe('the control-cards setting', () => {
  const openSettings = async () => {
    let tree!: ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(<HomeSettingsView onBack={() => {}} />);
    });
    return tree;
  };

  /**
   * Three cards on this screen offer On and Off, so the label alone does not
   * pick one out. They are found in render order and this is the second — the
   * tap is above it and the headset below.
   *
   * One node per button. `findAll` matches three for each — the Pressable, the
   * component it renders and the host view under that — and an unfiltered
   * search would make "the second Off" the first button's insides. The one
   * that carries `onPress` is the one there is exactly one of.
   */
  const cardsButton = (tree: ReactTestRenderer, label: string) =>
    tree.root
      .findAll(
        (n) =>
          n.props?.accessibilityRole === 'button' &&
          typeof n.props.onPress === 'function'
      )
      .filter((n) => labelOf(n).includes(label))[1];

  it('offers both answers and names what goes with the cards', async () => {
    const tree = await openSettings();
    const text = textOf(tree);
    expect(text).toContain('Repeat the channel controls as cards');
    // What the second paragraph promises, and what the channel screen keeps.
    expect(text).toContain('its card stays either way');
    // The promise the channel screen keeps by moving two sentences upward.
    expect(text).toContain('still being recorded');
    act(() => tree.unmount());
  });

  it('reports a change rather than keeping it', async () => {
    const tree = await openSettings();
    act(() => cardsButton(tree, 'Off').props.onPress());
    expect(mockApp.setControlCards).toHaveBeenCalledWith(false);
    expect(mockApp.setTapToStepIn).not.toHaveBeenCalled();
    act(() => tree.unmount());
  });

  it('marks which one is in force', async () => {
    mockApp.controlCards = false;
    const tree = await openSettings();
    const styleOf = (label: string) =>
      StyleSheet.flatten(
        cardsButton(tree, label).props.style({ pressed: false })
      ) as { backgroundColor?: unknown };
    expect(styleOf('Off').backgroundColor).not.toBe(
      styleOf('On').backgroundColor
    );
    act(() => tree.unmount());
  });
});

/**
 * Whether a tap on a channel arrives or only looks.
 *
 * The setting itself is a phone preference held in the provider; what this
 * screen owes is the two choices, a mark on the one in force, and reporting a
 * change upward. What the choice *does* is asserted on Home and in the
 * channel, which are the two screens it changes.
 */
describe('the stepping-in setting', () => {
  const openSettings = async () => {
    let tree!: ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(<HomeSettingsView onBack={() => {}} />);
    });
    return tree;
  };

  it('offers both answers and says what each means', async () => {
    const tree = await openSettings();
    expect(textOf(tree)).toContain('Tap a channel to step in');
    expect(findButton(tree, 'On')).toBeDefined();
    expect(findButton(tree, 'Off')).toBeDefined();
    expect(textOf(tree)).toContain('everyone there can hear you');
    act(() => tree.unmount());
  });

  it('reports a change rather than keeping it', async () => {
    const tree = await openSettings();
    act(() => findButton(tree, 'Off')!.props.onPress());
    expect(mockApp.setTapToStepIn).toHaveBeenCalledWith(false);
    act(() => tree.unmount());
  });

  it('marks which one is in force', async () => {
    mockApp.tapToStepIn = false;
    const tree = await openSettings();
    // Button's style is a function of press state, not an array.
    const styleOf = (label: string) =>
      StyleSheet.flatten(
        findButton(tree, label)!.props.style({ pressed: false })
      ) as { backgroundColor?: unknown };
    expect(styleOf('Off').backgroundColor).not.toBe(
      styleOf('On').backgroundColor
    );
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
 * How many people are here because of them, counting onwards. The line has
 * three states and only two of them are a number: it is shown at nought, and
 * it is left out entirely when the server said nothing — which is what an
 * install meets between its release and the deploy that follows.
 */
describe('the invited count', () => {
  async function profileShowing(invited: number | undefined) {
    mockApp.loadProfile.mockResolvedValueOnce({
      account: { id: THEM, displayName: 'Dana Chu' },
      ...(invited === undefined ? {} : { invited }),
    });
    let tree!: ReactTestRenderer;
    await act(async () => {
      tree = render(
        <ProfileView accountId={THEM} fallbackName="Dana Chu" onBack={() => {}} />
      );
    });
    return tree;
  }

  it('says how many', async () => {
    const tree = await profileShowing(7);
    expect(textOf(tree)).toContain('Invited 7');
    act(() => tree.unmount());
  });

  it('says nought rather than going quiet', async () => {
    const tree = await profileShowing(0);
    expect(textOf(tree)).toContain('Invited 0');
    act(() => tree.unmount());
  });

  it('says nothing when the server did not', async () => {
    const tree = await profileShowing(undefined);
    expect(textOf(tree)).not.toContain('Invited');
    act(() => tree.unmount());
  });
});

/**
 * Who invited them. The server sends this only when the inviter is you or one
 * of your contacts, so there is no case here where the name is a stranger's —
 * absent simply means there is no line, and the client does not need to know
 * which of the three reasons it was.
 */
describe('who invited them', () => {
  async function profileInvitedBy(
    invitedBy: { id: string; displayName: string } | undefined
  ) {
    mockApp.loadProfile.mockResolvedValueOnce({
      account: { id: THEM, displayName: 'Dana Chu' },
      invited: 0,
      ...(invitedBy === undefined ? {} : { invitedBy }),
    });
    let tree!: ReactTestRenderer;
    await act(async () => {
      tree = render(
        <ProfileView accountId={THEM} fallbackName="Dana Chu" onBack={() => {}} />
      );
    });
    return tree;
  }

  it('names the inviter when there is one to name', async () => {
    const tree = await profileInvitedBy({ id: 'acct_a', displayName: 'Ada' });
    expect(textOf(tree)).toContain('Invited by Ada');
    act(() => tree.unmount());
  });

  it('draws no line when the server sent no name', async () => {
    const tree = await profileInvitedBy(undefined);
    expect(textOf(tree)).not.toContain('Invited by');
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


/**
 * What a channel row says about how quiet it is, and what it is ordered by —
 * one number for both, and the reader is not in it.
 *
 * The complaint that produced this: presence is exclusive, so stepping into a
 * channel to announce yourself and then stepping into the next left the first
 * sitting at the top of Home, above a room two other people had spent an hour
 * in yesterday. The list ordered on visits, and what somebody scanning it wants
 * is what they missed.
 */
describe('how quiet a channel is, counting other people only', () => {
  const row = (
    id: string,
    name: string,
    extra: Record<string, unknown> = {}
  ) => ({
    channelId: id,
    name,
    others: [{ id: 'acct_q', displayName: 'Quinn Ito' }],
    presentCount: 0,
    createdAt: NOW - 90 * 86_400_000,
    lastActiveAt: NOW,
    ...extra,
  });

  const show = (rejoinable: unknown[]) => {
    mockApp.home = {
      invites: [],
      rejoinable: rejoinable as never,
      contacts: [],
      recordings: [],
    };
    return render(<HomeView {...homeNav} />);
  };

  it('names the gap since anybody else was here, not since anybody was', () => {
    // The reader sat in it five minutes ago; the last other person was here two
    // days ago. Two days is the answer.
    const tree = show([
      row('chan_a', 'Book club', {
        lastPresenceAt: NOW - 5 * 60_000,
        lastPresenceByOthers: NOW - 2 * 86_400_000,
      }),
    ]);
    const text = textOf(tree);
    expect(text).toContain('2 days ago');
    expect(text).not.toContain('5 minutes ago');
    act(() => tree.unmount());
  });

  it('says nobody else yet for a room only the reader has been in', () => {
    // Null is a fact, not a gap, and must not fall back to the room's own
    // number — that number is the solitary morning this exists to leave out.
    const tree = show([
      row('chan_a', 'Book club', {
        lastPresenceAt: NOW - 5 * 60_000,
        lastPresenceByOthers: null,
      }),
    ]);
    const text = textOf(tree);
    // Sentence-cased by `sentence()`, this being the whole line rather than
    // the second half of one, as it is on an invitation.
    expect(text).toContain('Nobody else yet');
    expect(text).not.toContain('5 minutes ago');
    act(() => tree.unmount());
  });

  it('still says a channel nobody has used has not been used', () => {
    const tree = show([
      row('chan_a', 'Book club', {
        everUsed: false,
        lastPresenceAt: NOW - 5 * 60_000,
        lastPresenceByOthers: null,
      }),
    ]);
    expect(textOf(tree)).toContain('Not used yet');
    act(() => tree.unmount());
  });

  it('draws the old line against a server that does not send the number', () => {
    // Absent is not a fact about anybody. Falling back is far better than
    // telling somebody a channel they talk in every day has never held anyone
    // but them.
    const tree = show([
      row('chan_a', 'Book club', { lastPresenceAt: NOW - 5 * 60_000 }),
    ]);
    expect(textOf(tree)).toContain('5 minutes ago');
    act(() => tree.unmount());
  });

  it('says only how many are present when somebody is in it', () => {
    // The interval and the count answer different questions and never draw at
    // once — which is what makes them impossible to contradict.
    const tree = show([
      row('chan_a', 'Book club', {
        presentCount: 2,
        lastPresenceAt: NOW,
        lastPresenceByOthers: NOW - 2 * 86_400_000,
      }),
    ]);
    const text = textOf(tree);
    expect(text).toContain('2 present');
    expect(text).not.toContain('2 days ago');
    act(() => tree.unmount());
  });

  const namesInOrder = (tree: ReturnType<typeof render>, names: string[]) => {
    const text = textOf(tree);
    return names
      .filter((n) => text.includes(n))
      .sort((a, b) => text.indexOf(a) - text.indexOf(b));
  };

  it('sorts a room somebody else used above one only the reader has', () => {
    // The whole complaint, as an assertion. Under the old number "Alone" was
    // the freshest thing on the screen.
    const tree = show([
      row('chan_a', 'Alone', {
        lastPresenceAt: NOW - 5 * 60_000,
        lastPresenceByOthers: null,
      }),
      row('chan_b', 'Others', {
        lastPresenceAt: NOW - 86_400_000,
        lastPresenceByOthers: NOW - 86_400_000,
      }),
    ]);
    expect(namesInOrder(tree, ['Alone', 'Others'])).toEqual(['Others', 'Alone']);
    act(() => tree.unmount());
  });

  it('keeps a room only the reader has used above one nobody has touched', () => {
    // The middle tier. Somebody went there, possibly to wait, and that is
    // worth more than a channel neither of them has ever opened — and less
    // than one somebody else visited. Three tiers, in one assertion.
    const tree = show([
      row('chan_c', 'Never', {
        everUsed: false,
        lastPresenceAt: NOW,
        lastPresenceByOthers: null,
      }),
      row('chan_a', 'Alone', {
        lastPresenceAt: NOW - 5 * 60_000,
        lastPresenceByOthers: null,
      }),
      row('chan_b', 'Others', {
        lastPresenceAt: NOW - 86_400_000,
        lastPresenceByOthers: NOW - 86_400_000,
      }),
    ]);
    expect(namesInOrder(tree, ['Others', 'Alone', 'Never'])).toEqual([
      'Others',
      'Alone',
      'Never',
    ]);
    act(() => tree.unmount());
  });

  it('orders the reader-only tier by their own visits, having nothing else', () => {
    const tree = show([
      row('chan_a', 'Older', {
        lastPresenceAt: NOW - 86_400_000,
        lastPresenceByOthers: null,
      }),
      row('chan_b', 'Newer', {
        lastPresenceAt: NOW - 60_000,
        lastPresenceByOthers: null,
      }),
    ]);
    expect(namesInOrder(tree, ['Newer', 'Older'])).toEqual(['Newer', 'Older']);
    act(() => tree.unmount());
  });

  it('keeps the old order exactly against a server without the number', () => {
    // The fallback has to restore the previous behaviour rather than collapse
    // every row into the middle tier and shuffle the list by name.
    const tree = show([
      row('chan_a', 'Older', { lastPresenceAt: NOW - 86_400_000 }),
      row('chan_b', 'Newer', { lastPresenceAt: NOW - 60_000 }),
    ]);
    expect(namesInOrder(tree, ['Newer', 'Older'])).toEqual(['Newer', 'Older']);
    act(() => tree.unmount());
  });
});

/**
 * The mark, which is the other half and is not a measure.
 *
 * The number above forgets the reader on purpose, so nothing in it can report
 * that the reader themselves stepped in. Presence being exclusive, stepping
 * into the next channel steps you out of the last — so without this a room you
 * knocked on a minute ago carries no trace of it at all.
 */
describe('the mark for a channel you have just stepped into', () => {
  const steppedIn = (extra: Record<string, unknown> = {}) => {
    mockApp.home = {
      invites: [],
      rejoinable: [
        {
          channelId: 'chan_a',
          name: 'Book club',
          others: [{ id: 'acct_q', displayName: 'Quinn Ito' }],
          presentCount: 0,
          createdAt: NOW - 90 * 86_400_000,
          lastActiveAt: NOW,
          lastPresenceAt: NOW - 60_000,
          lastPresenceByOthers: NOW - 4 * 86_400_000,
          steppedInAt: NOW - 60_000,
          ...extra,
        },
      ],
      contacts: [],
      recordings: [],
    } as never;
    return render(<HomeView {...homeNav} />);
  };

  const labelOf = (tree: ReturnType<typeof render>) =>
    String(
      tree.root
        .findAll(
          (n) =>
            typeof n.props?.accessibilityLabel === 'string' &&
            n.props.accessibilityLabel.startsWith('Book club')
        )
        .at(0)?.props.accessibilityLabel ?? ''
    );

  it('draws the glyph, and says it in words for a screen reader', () => {
    // A glyph reads as nothing, so the label is where that cost is paid.
    const tree = steppedIn();
    expect(textOf(tree)).toContain('↗');
    expect(labelOf(tree)).toContain('Stepped in and out.');
    act(() => tree.unmount());
  });

  it('does not say the state in the same words as the action', () => {
    // Why the label is "Stepped in and out" and not "Stepped in". The action at
    // the end of this same label is "Step in", so the short form put a state
    // and a button a syllable apart — "Stepped in. Step in." — which reads as a
    // stutter and tells a screen reader user nothing about which is which. The
    // long form is two words more and is the whole of what happened.
    const tree = steppedIn();
    const label = labelOf(tree);
    expect(label).toContain('Stepped in and out. Step in.');
    expect(label).not.toContain('Stepped in. Step in.');
    act(() => tree.unmount());
  });

  it('leaves the row’s own number alone', () => {
    // Two facts, not one. The interval still reports the others, and it is
    // four days old whatever the reader did a minute ago.
    const tree = steppedIn();
    expect(textOf(tree)).toContain('4 days ago');
    act(() => tree.unmount());
  });

  it('goes once the visit it reports is old enough', () => {
    // Expired against the phone's own clock, which is why the wire carries a
    // moment rather than a flag: nothing has to happen in the channel for the
    // mark to go.
    const tree = steppedIn({ steppedInAt: NOW - WAITING_WINDOW_MS - 1 });
    expect(textOf(tree)).not.toContain('↗');
    expect(labelOf(tree)).not.toContain('Stepped in and out.');
    act(() => tree.unmount());
  });

  it('lasts as long as the roster goes on calling that visit nearby', () => {
    // The window is WAITING_WINDOW_MS and not the push's PRESENCE_LIFETIME_MS,
    // which it read for a day. Pinned against the constant at both ends rather
    // than against fifteen minutes, since what is being asserted is that the
    // mark and the "Nearby" line expire together — one visit told to two
    // audiences — not that either is any particular length.
    const alive = steppedIn({ steppedInAt: NOW - WAITING_WINDOW_MS + 1000 });
    expect(textOf(alive)).toContain('↗');
    act(() => alive.unmount());
    // Six minutes: gone under the old five-minute window, still drawn now.
    const wasExpired = steppedIn({ steppedInAt: NOW - 6 * 60_000 });
    expect(textOf(wasExpired)).toContain('↗');
    act(() => wasExpired.unmount());
  });

  it('is not drawn for somebody else’s arrival', () => {
    // Their arrival is already in the number. Null is the server saying the
    // last person in here was not this reader.
    const tree = steppedIn({ steppedInAt: null });
    expect(textOf(tree)).not.toContain('↗');
    act(() => tree.unmount());
  });

  it('is not drawn against a server that does not send it', () => {
    const tree = steppedIn({ steppedInAt: undefined });
    expect(textOf(tree)).not.toContain('↗');
    act(() => tree.unmount());
  });

  it('is not drawn on a row somebody is in', () => {
    // A channel the reader is still standing in does not need to be told they
    // arrived, and a row with people in it is showing its count.
    const tree = steppedIn({ presentCount: 1 });
    expect(textOf(tree)).not.toContain('↗');
    act(() => tree.unmount());
  });

  it('does not move the channel up the list', () => {
    // Sorting on it would put the reader's own echo back at the top, undoing
    // with the second signal exactly what the first one was for.
    mockApp.home = {
      invites: [],
      rejoinable: [
        {
          channelId: 'chan_a',
          name: 'Knocked',
          others: [{ id: 'acct_q', displayName: 'Quinn Ito' }],
          presentCount: 0,
          createdAt: NOW - 90 * 86_400_000,
          lastActiveAt: NOW,
          lastPresenceAt: NOW - 60_000,
          lastPresenceByOthers: NOW - 4 * 86_400_000,
          steppedInAt: NOW - 60_000,
        },
        {
          channelId: 'chan_b',
          name: 'Quiet',
          others: [{ id: 'acct_r', displayName: 'Rae Lin' }],
          presentCount: 0,
          createdAt: NOW - 90 * 86_400_000,
          lastActiveAt: NOW,
          lastPresenceAt: NOW - 3_600_000,
          lastPresenceByOthers: NOW - 3_600_000,
          steppedInAt: null,
        },
      ],
      contacts: [],
      recordings: [],
    } as never;
    const tree = render(<HomeView {...homeNav} />);
    const text = textOf(tree);
    expect(text.indexOf('Quiet')).toBeLessThan(text.indexOf('Knocked'));
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
    // reducer would glow through a whole claim of silence — and would leave a
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

  it('leaves the card clear for somebody absent from this channel', () => {
    // The room's active speakers are ids, and an id means the same person in
    // every channel they belong to. A dot next to "Stepped out" is the shape
    // of that going wrong, and it is what a stale speaker survives as while
    // the hold in speaking.ts runs down.
    showChannel(
      channelOf((s) => reduce(s, { type: 'STEP_OUT', userId: THEM }, NOW))
    );
    const tree = render(
      <ChannelView
        channelId="sess_1"
        audio={audioWith(THEM)}
        onHome={() => {}}
        onExit={() => {}}
      />
    );
    const them = cardFor(tree, 'Dana Chu');
    expect(them.style.borderColor).not.toBe(colors.floor);
    expect(String(them.node!.props.accessibilityLabel)).not.toContain(
      'Speaking'
    );
    act(() => tree.unmount());
  });

  it('lights nobody on a channel whose audio is somewhere else', () => {
    // You are standing in one channel and looking at another. The connection
    // belongs to where you are standing, so nothing it hears is evidence
    // about this screen — including about a person present on both rosters,
    // which is why presence alone does not settle it.
    showChannel(
      channelOf((s) => reduce(s, { type: 'STEP_OUT', userId: ME }, NOW))
    );
    showChannel(
      reduce(
        createChannel({
          id: 'sess_2',
          initiator: ME,
          invitees: [THEM],
          now: NOW,
        }),
        { type: 'ENTER', userId: THEM },
        NOW
      )
    );
    const tree = render(
      <ChannelView
        channelId="sess_1"
        audio={audioWith(THEM)}
        onHome={() => {}}
        onExit={() => {}}
      />
    );
    const them = cardFor(tree, 'Dana Chu');
    expect(them.style.borderColor).not.toBe(colors.floor);
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

  it('says somebody is nearby when their connection went, not their finger', () => {
    // A tap and a suspended phone leave the same absence and used to read the
    // same. They do not mean the same thing to whoever has just walked in:
    // this one is expecting company and has already been notified that some
    // arrived. Said as a length rather than a moment, which is what `duration`
    // is for.
    //
    // "Nearby" rather than "Waiting", which reversed who was doing what: the
    // person reading it is standing in an empty room, and they are the one
    // waiting.
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
    expect(textOf(tree)).toContain('Nearby for 5 minutes');
    expect(textOf(tree)).not.toContain('Waiting');
    expect(textOf(tree)).not.toContain('Stepped out');
    mockApp.serverNow = () => NOW;
    act(() => tree.unmount());
  });

  /**
   * The shortcut the state exists to offer. Nearby means one notification
   * would fetch them, and the tap that sends it is on the card saying so
   * rather than two screens away — with no composer, because the thing being
   * said is "come back", which the notification says by arriving.
   */
  it('offers a wordless ping on the card of somebody nearby', async () => {
    showChannel(
      channelOf((s) => {
        const dropped = reduce(s, { type: 'DISCONNECTED', userId: THEM }, NOW);
        return reduce(dropped, { type: 'TICK' }, NOW + DISCONNECT_GRACE_MS + 1);
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

    const ping = findButton(tree, 'Ping');
    expect(ping).toBeDefined();
    await act(async () => {
      ping!.props.onPress();
    });

    // Empty text, not absent: the composer's contract is a string, and no
    // words is what this shortcut means rather than a missing argument.
    expect(mockApp.ping).toHaveBeenCalledWith('sess_1', THEM, '');
    // And it says so, without waiting for the snapshot that carries the
    // server's window — the notification has already gone.
    expect(textOf(tree)).toContain('Pinged');
    mockApp.serverNow = () => NOW;
    act(() => tree.unmount());
  });

  /**
   * Somebody who stepped out an hour ago is a different act — open their
   * profile and say something. A button on every absent card would turn the
   * roster into a row of controls rather than a picture of the room.
   */
  it('offers no ping on a card that is merely absent', () => {
    showChannel(channelOf((s) => reduce(s, { type: 'STEP_OUT', userId: THEM }, NOW)));
    mockApp.serverNow = () => NOW + 60 * 60_000;
    const tree = render(
      <ChannelView
        channelId="sess_1"
        audio={AUDIO}
        onHome={() => {}}
        onExit={() => {}}
      />
    );

    expect(textOf(tree)).toContain('Stepped out');
    expect(findButton(tree, 'Ping')).toBeUndefined();
    mockApp.serverNow = () => NOW;
    act(() => tree.unmount());
  });

  /**
   * The window the server keeps, arriving on the snapshot. Disabled rather
   * than gone: a button that vanishes under the finger reads as a mistake,
   * where one that says "Pinged" says what happened.
   */
  it('refuses a second ping while the window is open, and says which', () => {
    showChannel(
      channelOf((s) => {
        const dropped = reduce(s, { type: 'DISCONNECTED', userId: THEM }, NOW);
        return reduce(dropped, { type: 'TICK' }, NOW + DISCONNECT_GRACE_MS + 1);
      })
    );
    mockApp.serverNow = () => NOW + 5 * 60_000;
    mockApp.channelViews.sess_1 = {
      ...mockApp.channelViews.sess_1,
      pingableAt: { [THEM]: NOW + 8 * 60_000 },
    };
    const tree = render(
      <ChannelView
        channelId="sess_1"
        audio={AUDIO}
        onHome={() => {}}
        onExit={() => {}}
      />
    );

    const ping = findButton(tree, 'Pinged');
    expect(ping).toBeDefined();
    expect(ping!.props.accessibilityState.disabled).toBe(true);
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

  it('opens their profile from the card', async () => {
    showChannel(channelOf());
    const tree = render(
      <ChannelView
        channelId="sess_1"
        audio={AUDIO}
        onHome={() => {}}
        onExit={() => {}}
      />
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

  /**
   * And from there to another room the two of you share, which this screen
   * used to draw and refuse. The cards were always listed — what you share
   * with somebody is worth reading wherever the profile is opened — but
   * `onEnterChannel` was withheld here on the reading that an in-channel
   * screen should not suggest walking out of the conversation you are in.
   * That left one list pressable from Contacts and inert here. Presence is
   * not a screen: going there hangs nothing up, and the room you left is a
   * tap away on Home.
   */
  it('steps into another channel tapped on the profile it opened', async () => {
    showChannel(channelOf());
    mockApp.home = {
      invites: [],
      rejoinable: [
        {
          channelId: 'sess_other',
          name: 'Thursday rehearsal',
          others: [{ id: THEM, displayName: 'Dana Chu' }],
          presentCount: 0,
          createdAt: NOW,
          lastActiveAt: NOW,
        },
      ],
      contacts: [],
      recordings: [],
    };
    const onEnterChannel = jest.fn();
    const tree = render(
      <ChannelView
        channelId="sess_1"
        audio={AUDIO}
        onHome={() => {}}
        onExit={() => {}}
        onEnterChannel={onEnterChannel}
      />
    );
    const theirs = tree.root
      .findAll((n) => n.props?.accessibilityRole === 'button')
      .find((n) => String(n.props?.accessibilityLabel).startsWith('Dana Chu'));
    await act(async () => theirs!.props.onPress());

    const card = tree.root
      .findAll((n) => n.props?.accessibilityRole === 'button')
      .find((n) =>
        String(n.props?.accessibilityLabel).startsWith('Thursday rehearsal')
      );
    expect(card).toBeDefined();
    await act(async () => card!.props.onPress());

    expect(mockApp.act).toHaveBeenCalledWith('sess_other', { type: 'ENTER' });
    expect(onEnterChannel).toHaveBeenCalledWith('sess_other');
    // And the profile closes behind it, since this screen is about to be
    // about the channel that was tapped rather than the one it was opened in.
    expect(textOf(tree)).not.toContain('Channels with them');
    act(() => tree.unmount());
  });

  /**
   * Except the one you are standing in, which is in the list deliberately —
   * a card saying they have not been in the room you are sitting in for a
   * week is the point of the section. Tapping it can only mean closing the
   * profile; routing to the channel already on screen would be a no-op that
   * looked like navigation.
   */
  it('only closes the profile when the channel tapped is this one', async () => {
    showChannel(channelOf());
    mockApp.home = {
      invites: [],
      rejoinable: [
        {
          channelId: 'sess_1',
          name: 'This very room',
          others: [{ id: THEM, displayName: 'Dana Chu' }],
          presentCount: 1,
          createdAt: NOW,
          lastActiveAt: NOW,
        },
      ],
      contacts: [],
      recordings: [],
    };
    const onEnterChannel = jest.fn();
    const tree = render(
      <ChannelView
        channelId="sess_1"
        audio={AUDIO}
        onHome={() => {}}
        onExit={() => {}}
        onEnterChannel={onEnterChannel}
      />
    );
    const theirs = tree.root
      .findAll((n) => n.props?.accessibilityRole === 'button')
      .find((n) => String(n.props?.accessibilityLabel).startsWith('Dana Chu'));
    await act(async () => theirs!.props.onPress());

    const card = tree.root
      .findAll((n) => n.props?.accessibilityRole === 'button')
      .find((n) =>
        String(n.props?.accessibilityLabel).startsWith('This very room')
      );
    await act(async () => card!.props.onPress());

    expect(onEnterChannel).not.toHaveBeenCalled();
    expect(textOf(tree)).not.toContain('Channels with them');
    act(() => tree.unmount());
  });

  /**
   * Your own card is a button like the rest. It used to be the one that was
   * not, because the screen behind it would have offered to add you as your
   * own contact — which ProfileView stopped doing when it learnt `isSelf`.
   * What it is for is reading your own profile as the roster around you
   * reads it — and editing it, which is the one thing the card leads to.
   */
  it('opens your own profile from your own card, without the contact card', async () => {
    showChannel(channelOf());
    const tree = render(
      <ChannelView
        channelId="sess_1"
        audio={AUDIO}
        onHome={() => {}}
        onExit={() => {}}
      />
    );
    // The Pressable rather than the host node cardFor finds: the role is on
    // both, the handler only on the composite.
    const mine = tree.root
      .findAll((n) => n.props?.accessibilityRole === 'button')
      .find((n) => String(n.props?.accessibilityLabel).startsWith('Me, you'));
    expect(mine).toBeDefined();
    await act(async () => mine!.props.onPress());
    expect(mockApp.loadProfile).toHaveBeenCalledWith(ME);
    // Nothing about a relationship with yourself, in either direction.
    expect(findButton(tree, 'Add contact')).toBeUndefined();
    expect(findButton(tree, 'Remove contact')).toBeUndefined();
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

  /**
   * The way in to the standings, which sits on Home directly under Chip in.
   * Absent unless the account has been granted them, and nothing anywhere
   * says so.
   */
  it('offers the Leaderboard from Home only when there is a way in', async () => {
    const tree = await home();
    expect(findButton(tree, 'Leaderboard')).toBeUndefined();
    act(() => tree.unmount());

    const opened = jest.fn();
    const granted = await open(
      <HomeView {...homeNav} onOpenLeaderboard={opened} />
    );
    const button = findButton(granted, 'Leaderboard');
    expect(button).toBeTruthy();
    act(() => button!.props.onPress());
    expect(opened).toHaveBeenCalled();
    act(() => granted.unmount());
  });

  /**
   * The two are independent: a server with nowhere to give still shows the
   * standings to an account granted them, and the section label survives for
   * it alone.
   */
  it('keeps the Leaderboard when there is nowhere to give', async () => {
    mockApp.loadSupport.mockResolvedValueOnce({
      url: null as unknown as string,
      identifier: 'me@example.com',
      mine: null,
    });
    const tree = await open(
      <HomeView {...homeNav} onOpenLeaderboard={() => {}} />
    );
    expect(findButton(tree, 'Chip in')).toBeUndefined();
    expect(findButton(tree, 'Leaderboard')).toBeTruthy();
    act(() => tree.unmount());
  });

  it('says nothing about the standings on the Support screen', async () => {
    const tree = await open(<SupportView onBack={() => {}} />);
    expect(findButton(tree, 'Leaderboard')).toBeUndefined();
    expect(findButton(tree, 'Invitations')).toBeUndefined();
    act(() => tree.unmount());
  });
});

/**
 * The one screen that shows people who never agreed to be shown to you. There
 * is no way to ask for it and no setting that turns it on, so what this covers
 * is that it renders what it is given and says what the number means.
 */
describe('the invitation standings', () => {
  /** Renders and waits for the fetch, which lands in a microtask. */
  async function open(element: React.ReactElement) {
    let tree!: ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(element);
    });
    return tree;
  }

  it('lists people in order, with what the number counts', async () => {
    const tree = await open(<LeaderboardView onBack={() => {}} />);

    const text = textOf(tree);
    expect(text).toContain('Ada');
    expect(text).toContain('Grace');
    expect(text.indexOf('Ada')).toBeLessThan(text.indexOf('Grace'));
    // Said once, because a reader will otherwise take it for invitations sent.
    expect(text).toContain('all the way down');
    act(() => tree.unmount());
  });

  it('says so plainly when nobody has invited anybody', async () => {
    mockApp.loadLeaderboard.mockResolvedValueOnce([]);
    const tree = await open(<LeaderboardView onBack={() => {}} />);
    expect(textOf(tree)).toContain('Nobody has brought anybody here yet');
    act(() => tree.unmount());
  });

  it('shows the refusal rather than an empty board', async () => {
    // A client that asked without the grant, or an older server. Either way
    // an empty list would be a claim, and this is not one.
    mockApp.loadLeaderboard.mockRejectedValueOnce(new Error('Not found.'));
    const tree = await open(<LeaderboardView onBack={() => {}} />);
    expect(textOf(tree)).toContain('Not found.');
    act(() => tree.unmount());
  });
});

describe('your own profile', () => {
  /**
   * The screen as the first card on the contact list opens it: on you, with no
   * action for entering a channel, since the only channels it could list are
   * ones you share with yourself.
   */
  async function mine() {
    mockApp.home = {
      invites: [],
      rejoinable: [],
      recordings: [],
      contacts: [],
    };
    mockApp.loadProfile.mockResolvedValueOnce({
      account: { id: ME, displayName: 'Me' },
      // What the server sends about you: the invited count, and your own
      // address always — but no availability and no `myEmailShown`, there
      // being nobody to be shown to.
      invited: 2,
      email: 'me@example.com',
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

  it('offers Edit, which nobody else\u2019s profile does', async () => {
    const tree = await mine();
    expect(findButton(tree, 'Edit')).toBeDefined();
    act(() => tree.unmount());
  });

  it('says which address you sign in with, and offers to copy it', async () => {
    // Left out until 2026-08-31, on the reading that the card is about a
    // disclosure and there is none to make to yourself. What that missed is
    // that nothing in the application said which address this account is.
    const tree = await mine();
    expect(textOf(tree)).toContain('me@example.com');
    expect(findButton(tree, 'Copy')).toBeDefined();
    act(() => tree.unmount());
  });

  it('offers no way to show your address to yourself', async () => {
    // The bottom half of the card is a decision about one named reader, and
    // there is no reader here. A dead control saying so would be worse than
    // the sentence that replaces it.
    const tree = await mine();
    expect(findButton(tree, 'Show my email')).toBeUndefined();
    expect(findButton(tree, 'Stop showing my email')).toBeUndefined();
    expect(textOf(tree)).toContain('How you sign in');
    act(() => tree.unmount());
  });

  it('says nothing about a profile that arrived and is thin', async () => {
    // A loaded profile with nothing optional on it draws no card saying so.
    // The card that is left answers only "still fetching" and "not yours to
    // read", which is what remains of the one the bio used to live in.
    const tree = await mine();
    expect(textOf(tree)).not.toContain('There is no profile here');
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
    });
    let tree!: ReactTestRenderer;
    await act(async () => {
      tree = render(
        <ProfileView accountId={THEM} fallbackName="Dana Chu" onBack={() => {}} />
      );
    });
    expect(findButton(tree, 'Add contact')).toBeDefined();
    // Somebody else's profile is theirs to write.
    expect(findButton(tree, 'Edit')).toBeUndefined();
    act(() => tree.unmount());
  });
});

describe('editing your own profile', () => {
  /**
   * Your name and your handles, which are what a contact reads and were a
   * settings screen of their own until 2026-08-29. They are fields on this
   * screen now, behind Edit: a profile that cannot be edited is a read-only
   * profile, and an editor for one is that profile editing.
   *
   * Every case has to let the fetch settle. The fields are seeded from it —
   * which is why Edit is refused until it lands — and there is no second fetch
   * of the kind the separate screen needed.
   */
  const openMine = async () => {
    mockApp.home = { invites: [], rejoinable: [], recordings: [], contacts: [] };
    mockApp.loadProfile.mockResolvedValueOnce({
      account: { id: ME, displayName: 'Me' },
      im: { telegram: 'me_here' },
      invited: 2,
      invitedBy: { id: 'acct_x', displayName: 'Dana Chu' },
      email: 'me@example.com',
    });
    let tree!: ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(
        <ProfileView accountId={ME} fallbackName="Me" onBack={() => {}} />
      );
    });
    return tree;
  };

  /** Into edit mode, which is where every case below starts. */
  const edit = async (tree: ReactTestRenderer) => {
    await act(async () => findButton(tree, 'Edit')!.props.onPress());
    return tree;
  };

  const nameField = (tree: ReactTestRenderer) =>
    tree.root.findAll(
      (n) => n.props?.placeholder === 'What people should call you'
    )[0];

  it('is refused until the profile it would seed the fields from arrives', () => {
    // Otherwise the fields open empty and a blur writes that emptiness over
    // handles somebody has, which is the one way this screen could destroy
    // work.
    mockApp.home = { invites: [], rejoinable: [], recordings: [], contacts: [] };
    mockApp.loadProfile.mockReturnValueOnce(new Promise(() => {}) as never);
    const tree = render(
      <ProfileView accountId={ME} fallbackName="Me" onBack={() => {}} />
    );
    expect(findButton(tree, 'Edit')!.props.disabled).toBe(true);
    act(() => tree.unmount());
  });

  it('puts what the server holds into the fields, with no second fetch', async () => {
    const tree = await openMine();
    expect(mockApp.loadProfile).toHaveBeenCalledTimes(1);
    await edit(tree);
    expect(mockApp.loadProfile).toHaveBeenCalledTimes(1);

    expect(nameField(tree).props.value).toBe('Me');
    // The handles are seeded from the same fetch, canonical as the server
    // answered with them.
    expect(
      tree.root.findAll((n) => n.props?.placeholder === '@username')[0].props
        .value
    ).toBe('me_here');
    act(() => tree.unmount());
  });

  it('keeps an edit when the field is left, with no button to press', async () => {
    const tree = await edit(await openMine());
    expect(findButton(tree, 'Save')).toBeUndefined();

    act(() => nameField(tree).props.onChangeText('Alice Nkemdirim'));
    await act(async () => nameField(tree).props.onBlur());

    // Only what changed: the handles were never touched, so they are not
    // sent.
    expect(mockApp.saveProfile).toHaveBeenCalledWith({
      displayName: 'Alice Nkemdirim',
    });
    act(() => tree.unmount());
  });

  it('puts the name under a label of its own', async () => {
    // It stood in the header until 2026-08-31, where the heading it replaces
    // stands — a text field sharing a line with a button, and the one field on
    // the screen whose label had to be inferred from its placeholder. Which
    // side of the header Done sits on is layout and is not pinned here; that
    // the section exists is the change.
    const tree = await edit(await openMine());
    expect(textOf(tree)).toContain('Name');
    expect(nameField(tree)).toBeDefined();
    // And it is gone again when the mode is, rather than becoming a heading
    // with a label over it.
    await act(async () => findButton(tree, 'Done')!.props.onPress());
    expect(textOf(tree)).not.toContain('Name');
    act(() => tree.unmount());
  });

  it('leaves the facts out, which read mode is where to read', async () => {
    // The one place the two modes order the screen differently rather than
    // swapping a line for a field. None of these is editable or in doubt, and
    // three lines you cannot change between the name and the fields make the
    // screen longer without making it say anything.
    const tree = await openMine();
    expect(textOf(tree)).toContain('Invited 2');
    expect(textOf(tree)).toContain('Invited by Dana Chu');

    await edit(tree);
    expect(textOf(tree)).not.toContain('Invited 2');
    expect(textOf(tree)).not.toContain('Invited by Dana Chu');
    act(() => tree.unmount());
  });

  it('changes the address only once a code comes back', async () => {
    // Every other field here writes on blur. This one cannot: the whole
    // question is whether the person typing reads the mail there, and the
    // code is the only thing that answers it.
    const tree = await edit(await openMine());
    const field = (placeholder: string) =>
      tree.root.findAll((n) => n.props?.placeholder === placeholder)[0];

    act(() => field('A different address').props.onChangeText('new@example.com'));
    // Nothing has been asked for yet, so there is nowhere to type a code.
    expect(field('Six digits')).toBeUndefined();

    await act(async () => findButton(tree, 'Send a code')!.props.onPress());
    expect(mockApp.requestEmailChange).toHaveBeenCalledWith('new@example.com');
    expect(mockApp.confirmEmailChange).not.toHaveBeenCalled();

    act(() => field('Six digits').props.onChangeText('123456'));
    await act(async () =>
      findButton(tree, 'Change my address')!.props.onPress()
    );
    expect(mockApp.confirmEmailChange).toHaveBeenCalledWith(
      'new@example.com',
      '123456'
    );
    // What the card says above is now the address the server answered with,
    // and the form is back at its first step.
    expect(textOf(tree)).toContain('new@example.com');
    expect(field('Six digits')).toBeUndefined();
    act(() => tree.unmount());
  });

  it('drops a code that belonged to a different address', async () => {
    // The code proves one mailbox. Typing another address is the start of a
    // different change, and carrying the first step over would let a code sent
    // to one address be spent against another.
    const tree = await edit(await openMine());
    const field = (placeholder: string) =>
      tree.root.findAll((n) => n.props?.placeholder === placeholder)[0];

    act(() => field('A different address').props.onChangeText('new@example.com'));
    await act(async () => findButton(tree, 'Send a code')!.props.onPress());
    expect(field('Six digits')).toBeDefined();

    act(() =>
      field('A different address').props.onChangeText('other@example.com')
    );
    expect(field('Six digits')).toBeUndefined();
    expect(findButton(tree, 'Send a code')).toBeDefined();
    act(() => tree.unmount());
  });

  it('says what the server said, and keeps the address it has', async () => {
    // A taken address is the one refusal somebody can act on, and it arrives
    // only after they have proved the mailbox is theirs to read.
    mockApp.confirmEmailChange.mockRejectedValueOnce(
      new Error('That address already signs in to another account.')
    );
    const tree = await edit(await openMine());
    const field = (placeholder: string) =>
      tree.root.findAll((n) => n.props?.placeholder === placeholder)[0];

    act(() => field('A different address').props.onChangeText('bob@example.com'));
    await act(async () => findButton(tree, 'Send a code')!.props.onPress());
    act(() => field('Six digits').props.onChangeText('123456'));
    await act(async () =>
      findButton(tree, 'Change my address')!.props.onPress()
    );

    expect(textOf(tree)).toContain('already signs in to another account');
    expect(textOf(tree)).toContain('me@example.com');
    // The code was spent by the attempt whatever came of it, so the field is
    // cleared rather than left holding something that can no longer work.
    expect(field('Six digits').props.value).toBe('');
    act(() => tree.unmount());
  });

  it('offers no way to change an address in read mode', async () => {
    // Read mode is where the address is a fact to copy. A form for replacing
    // it does not belong under a line somebody opened the screen to read.
    const tree = await openMine();
    expect(
      tree.root.findAll((n) => n.props?.placeholder === 'A different address')
    ).toHaveLength(0);
    expect(findButton(tree, 'Send a code')).toBeUndefined();
    act(() => tree.unmount());
  });

  it('keeps the address, which is the question a name field raises', async () => {
    // "What am I signed in as" is what somebody wants while looking at their
    // own name in a field, and it is the one thing on this screen that
    // answers it.
    const tree = await edit(await openMine());
    expect(textOf(tree)).toContain('me@example.com');
    act(() => tree.unmount());
  });

  it('keeps an edit that Done is tapped on directly', async () => {
    // The trap this replaced: the way out was nearer and more obvious than
    // Save, and discarded the edit without saying so.
    const tree = await edit(await openMine());
    act(() => nameField(tree).props.onChangeText('Alice Nkemdirim'));

    await act(async () => findButton(tree, 'Done')!.props.onPress());
    expect(mockApp.saveProfile).toHaveBeenCalledWith({
      displayName: 'Alice Nkemdirim',
    });
    // And the fields are gone, which is the whole of what Done does besides.
    expect(nameField(tree)).toBeUndefined();
    expect(findButton(tree, 'Edit')).toBeDefined();
    act(() => tree.unmount());
  });

  it('shows the name it just wrote, with no second fetch', async () => {
    // The write is patched into the profile this screen holds rather than
    // re-read: the server was handed the string, so a second GET would spend a
    // round trip being told what we had just said.
    const tree = await edit(await openMine());
    act(() => nameField(tree).props.onChangeText('Alice Nkemdirim'));
    await act(async () => findButton(tree, 'Done')!.props.onPress());

    expect(mockApp.loadProfile).toHaveBeenCalledTimes(1);
    expect(textOf(tree)).toContain('Alice Nkemdirim');
    act(() => tree.unmount());
  });

  it('writes nothing when nothing was changed', async () => {
    const tree = await edit(await openMine());
    await act(async () => nameField(tree).props.onBlur());
    await act(async () => findButton(tree, 'Done')!.props.onPress());
    expect(mockApp.saveProfile).not.toHaveBeenCalled();
    expect(nameField(tree)).toBeUndefined();
    act(() => tree.unmount());
  });

  it('stays put when the edit could not be kept', async () => {
    mockApp.saveProfile.mockRejectedValueOnce(new Error('server said no'));
    const tree = await edit(await openMine());
    act(() => nameField(tree).props.onChangeText('Alice Nkemdirim'));

    await act(async () => findButton(tree, 'Done')!.props.onPress());
    // Leaving edit mode anyway would be the silent discard again, wearing a
    // hat: the words would be gone from a screen that never wrote them.
    expect(nameField(tree)).toBeDefined();
    expect(textOf(tree)).toContain('server said no');
    act(() => tree.unmount());
  });

  it('does not say whose account this is, the way in having said so', async () => {
    // A "Signed in as ..." line rode here from the settings screen and from
    // Home before that, where each time it was the only sentence about the
    // account on a screen about something else. The only way in is the card
    // under "You" on Contacts, so it was answering an answered question.
    const tree = await edit(await openMine());
    expect(textOf(tree)).not.toContain('Signed in');
    act(() => tree.unmount());
  });

  it('will not save an empty name, and says why', async () => {
    // The server refuses this too; the point of refusing it here as well is
    // that a disabled control and a rejected request cannot disagree.
    const tree = await edit(await openMine());
    act(() => nameField(tree).props.onChangeText('   '));
    await act(async () => nameField(tree).props.onBlur());

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

  /*
    Pinned, like Home's and the channel's, and asserted on `Screen`'s prop for
    the same reason: both arrangements flatten to one string, so a text search
    reads a header that scrolls away and one that does not as identical.

    This list has no other way out of it than the one button up here, so a
    header that scrolls strands whoever is furthest down \u2014 which is whoever
    has the most contacts.
  */
  it('pins the contacts header above the list', () => {
    withContacts([{ id: 'a', displayName: 'Dana Chu' }]);
    const tree = open();
    const [screen] = tree.root.findAll((node) => node.type === Screen);
    const header = render(screen.props.header);

    expect(textOf(header)).toContain('Contacts');
    expect(findButton(header, 'Home')).toBeDefined();

    // Adding somebody stayed in the scroll. Once opened it is a field that
    // grows a line when it has something to report, and the header is the one
    // place that cannot afford something changing height for a reason nobody
    // asked about. Asserted on its collapsed label, which is rendered text —
    // the placeholder would not do, being a prop that `textOf` cannot see.
    expect(textOf(tree)).toContain('Add contact');
    expect(textOf(header)).not.toContain('Add contact');
    act(() => header.unmount());
    act(() => tree.unmount());
  });

  it('puts you first, outside the list of everybody else', async () => {
    // The server has never put you in your own contact list \u2014 it returns the
    // other id of each contacts row \u2014 so the card is drawn from `app.me`, and
    // it opens the one profile that can be edited.
    withContacts([{ id: 'a', displayName: 'Dana Chu' }]);
    const tree = open();
    const you = tree.root.findAll(
      (n) => n.props?.accessibilityLabel === 'Me. You. Open your profile.'
    )[0];
    expect(you).toBeDefined();
    expect(textOf(tree)).toContain('You');

    await act(async () => you.props.onPress());
    expect(mockApp.loadProfile).toHaveBeenCalledWith(ME);
    expect(findButton(tree, 'Edit')).toBeDefined();
    act(() => tree.unmount());
  });

  it('still says nobody is here when you are the only card', () => {
    // Your own card is not a contact and is not counted as one. A list that
    // read "Nobody yet" under a card with your name on it would be answering a
    // different question than the one it was asked.
    withContacts([]);
    const tree = open();
    const text = textOf(tree);
    expect(text).toContain('Me');
    expect(text).toContain('Nobody yet');
    act(() => tree.unmount());
  });

  it('carries no settings button, the settings having been your profile', () => {
    withContacts([{ id: 'a', displayName: 'Dana Chu' }]);
    const tree = open();
    expect(findButton(tree, 'Settings')).toBeUndefined();
    expect(findButton(tree, 'Home')).toBeDefined();
    act(() => tree.unmount());
  });

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

  it('steps into a channel tapped on the profile it opened', async () => {
    // The "Channels with them" section was inert from here until this screen
    // took `onEnterChannel`: the cards were drawn and nothing happened when
    // one was pressed. A contact *row* still opens a person rather than a
    // room — that separation is why this screen exists — but the profile
    // underneath it is about the pair, and the rooms the pair share are worth
    // going to.
    const onEnterChannel = jest.fn();
    withContacts([{ id: 'a', displayName: 'Dana Chu' }]);
    mockApp.home!.rejoinable = [
      {
        channelId: 'sess_shared',
        name: 'Thursday rehearsal',
        others: [{ id: 'a', displayName: 'Dana Chu' }],
        presentCount: 0,
        createdAt: NOW,
        lastActiveAt: NOW,
      },
    ];

    let tree!: ReactTestRenderer;
    act(() => {
      tree = renderer.create(
        <ContactsView onHome={() => {}} onEnterChannel={onEnterChannel} />
      );
    });
    const row = tree.root.findAll(
      (n) =>
        typeof n.props?.accessibilityLabel === 'string' &&
        n.props.accessibilityLabel.startsWith('Dana Chu.')
    )[0];
    // Awaited: the profile fetches on mount, and the section is drawn from
    // Home either way but the presence line is not.
    await act(async () => row.props.onPress());

    const card = tree.root.findAll(
      (n) =>
        n.props?.accessibilityRole === 'button' &&
        typeof n.props?.accessibilityLabel === 'string' &&
        n.props.accessibilityLabel.startsWith('Thursday rehearsal')
    )[0];
    act(() => card.props.onPress());

    expect(mockApp.act).toHaveBeenCalledWith('sess_shared', { type: 'ENTER' });
    expect(onEnterChannel).toHaveBeenCalledWith('sess_shared');
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
    // screen is not what this is for.
    expect(textOf(tree)).not.toContain('Session — asked vs actual');
    act(() => tree.unmount());
  });

  /**
   * **The panel must take no reading until it is asked to, and this is the
   * assertion that says so.**
   *
   * It used to read on mount, through a lazy `useState` initializer, and again
   * once a second while open. Reading the audio engine is what stops it: the
   * sound cut the instant the panel was expanded, on a device, and since the
   * panel mounts with this screen, "walk to Home and come back" was a read.
   * The instrument was the fault. So what is pinned here is the absence of a
   * reading, which is a thing a test can check and a person cannot see.
   */
  it('takes no reading of its own until Read now is pressed', () => {
    mockApp.debug = true;
    showChannel(channelOf());
    const { AudioDeviceModule } = require('@livekit/react-native');
    AudioDeviceModule.isEngineRunning.mockClear();
    AudioDeviceModule.getEngineAvailability.mockClear();

    const tree = render(<ChannelView
        channelId="sess_1"
        audio={AUDIO}
        onHome={() => {}}
        onExit={() => {}}
      />);
    // Mounting the screen is the case that mattered: it is what a walk back
    // from Home does.
    expect(AudioDeviceModule.isEngineRunning).not.toHaveBeenCalled();

    const toggle = tree.root
      .findAll((n) => n.props?.accessibilityRole === 'button')
      .find((n) => n.props?.accessibilityLabel === 'Audio diagnostics');
    act(() => toggle!.props.onPress());
    // And opening it is the case that was caught by ear.
    expect(AudioDeviceModule.isEngineRunning).not.toHaveBeenCalled();
    expect(AudioDeviceModule.getEngineAvailability).not.toHaveBeenCalled();

    const text = textOf(tree);
    expect(text).toContain('nothing read yet');
    expect(text).toContain('nothing recorded yet');
    act(() => tree.unmount());
  });

  it('reads once, and only once, when Read now is pressed', () => {
    mockApp.debug = true;
    showChannel(channelOf());
    const { AudioDeviceModule } = require('@livekit/react-native');
    AudioDeviceModule.isEngineRunning.mockClear();

    const tree = render(<ChannelView
        channelId="sess_1"
        audio={AUDIO}
        onHome={() => {}}
        onExit={() => {}}
      />);
    const button = (label: string) =>
      tree.root
        .findAll((n) => n.props?.accessibilityRole === 'button')
        .find((n) => n.props?.accessibilityLabel === label);
    act(() => button('Audio diagnostics')!.props.onPress());
    act(() => button('Read now (all nine at once)')!.props.onPress());

    // One press, one pass over the readers — not a poll that starts on the
    // first press and runs until the screen goes away.
    expect(AudioDeviceModule.isEngineRunning).toHaveBeenCalledTimes(1);

    const text = textOf(tree);
    expect(text).toContain('Session — asked vs actual');
    // Nothing native is present under jest, and the panel has to say that
    // rather than render a blank line — the failure mode five instruments fell
    // into on 2026-08-20. See src/audio/diagnostics.ts.
    expect(text).toContain('unreadable');
    act(() => tree.unmount());
  });

  /**
   * One probe is one native call. The whole harness rests on it: a button that
   * quietly took two readings would name the wrong culprit, and naming the
   * wrong culprit is how four fixes were written for one symptom in August.
   */
  it('makes exactly one native call per probe, and logs either side of it', () => {
    mockApp.debug = true;
    showChannel(channelOf());
    const { AudioDeviceModule } = require('@livekit/react-native');
    AudioDeviceModule.getEngineAvailability.mockClear();
    AudioDeviceModule.isEngineRunning.mockClear();

    const tree = render(<ChannelView
        channelId="sess_1"
        audio={AUDIO}
        onHome={() => {}}
        onExit={() => {}}
      />);
    const button = (label: string) =>
      tree.root
        .findAll((n) => n.props?.accessibilityRole === 'button')
        .find((n) => n.props?.accessibilityLabel === label);
    act(() => button('Audio diagnostics')!.props.onPress());
    act(() => button('· engineAvailability')!.props.onPress());

    expect(AudioDeviceModule.getEngineAvailability).toHaveBeenCalledTimes(1);
    expect(AudioDeviceModule.isEngineRunning).not.toHaveBeenCalled();

    const text = textOf(tree);
    expect(text).toContain('probe engineAvailability →');
    expect(text).toContain('probe engineAvailability ✓');
    // And the button says it was pressed. On a panel whose whole job is to
    // correlate a tap against a sound, a press you are unsure of is a reading
    // you cannot use — a probe that did nothing and a probe that never ran
    // look identical without this.
    expect(text).toContain('✓ · engineAvailability');
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

describe('the channel clipboard', () => {
  /**
   * One slot, and how much of it is on screen is as much the point as what is.
   *
   * The preview shows never more than fits on one line — so a short paste
   * appears whole and a long one is truncated. The bound is the line rather
   * than any notion of withholding: it keeps the card from becoming a place
   * long things are read, a channel screen being one that gets left face-up
   * on tables. `numberOfLines={1}` is what enforces it, asserted rather than
   * assumed.
   */
  const CLIP = {
    id: 'clip_1',
    authorId: THEM,
    pastedAt: NOW - 180_000,
    kind: 'text' as const,
    text: 'https://example.com/the-thing',
  };

  function showClip(clip: Partial<typeof CLIP> = {}) {
    showChannel(channelOf((s) => ({ ...s, clip: { ...CLIP, ...clip } })));
  }

  function open() {
    return render(<ChannelView
        channelId="sess_1"
        audio={AUDIO}
        onHome={() => {}}
        onExit={() => {}}
      />);
  }

  beforeEach(() => {
    (Clipboard.setStringAsync as jest.Mock).mockImplementation(async () => true);
    (Clipboard.getStringAsync as jest.Mock).mockImplementation(async () => '');
  });

  /**
   * The host Text carrying `contains`.
   *
   * Identified by its content rather than by `numberOfLines`, which the
   * channel title higher up the screen also sets — selecting on the property
   * under test found that one instead and passed for the wrong reason.
   */
  function textNodeWith(
    tree: ReactTestRenderer,
    contains: string
  ): ReactTestInstance | undefined {
    return tree.root
      .findAll((n) => n.type === 'Text')
      .find((n) => labelOf(n).includes(contains));
  }

  it('says who pasted, how long ago, and shows one line of what', () => {
    showClip();
    const tree = open();

    // `textOf` joins adjacent strings with a space, so the interpolated name
    // arrives with two — matched loosely rather than pinning that detail.
    expect(textOf(tree)).toMatch(/Pasted by\s+Dana Chu/);
    expect(textOf(tree)).toContain('3 minutes ago');
    expect(textOf(tree)).toContain('example.com');
    act(() => tree.unmount());
  });

  it('holds the preview to a single truncated line', () => {
    showClip();
    const tree = open();
    // The prop, not the rendered height: the test renderer lays nothing out,
    // so the truncation is only observable as the instruction to truncate.
    expect(textNodeWith(tree, 'example.com')!.props.numberOfLines).toBe(1);
    act(() => tree.unmount());
  });

  it('collapses whitespace so a leading newline does not preview as blank', () => {
    // `numberOfLines` counts rendered lines. Text beginning with a newline
    // would spend the only one on nothing, which reads as a failed paste.
    showClip({ text: '\n\n  first line\n  second line  ' });
    const tree = open();
    expect(labelOf(textNodeWith(tree, 'first line')!)).toBe(
      'first line second line'
    );
    act(() => tree.unmount());
  });

  it('says the clipboard is empty when nothing has been pasted', () => {
    showChannel(channelOf());
    const tree = open();

    expect(textOf(tree)).toContain('Nothing on the channel clipboard');
    act(() => tree.unmount());
  });

  it('copies the whole text, not the line that was shown', async () => {
    const long = `https://example.com/${'x'.repeat(400)}`;
    showClip({ text: long });
    const tree = open();
    await act(async () => {
      findButton(tree, 'Copy')!.props.onPress();
    });

    expect(Clipboard.setStringAsync).toHaveBeenCalledWith(long);
    expect(textOf(tree)).toContain('✓ copied');
    act(() => tree.unmount());
  });

  it('says so when the clipboard declines the copy', async () => {
    (Clipboard.setStringAsync as jest.Mock).mockImplementation(async () => false);
    showClip();
    const tree = open();
    await act(async () => {
      findButton(tree, 'Copy')!.props.onPress();
    });

    expect(textOf(tree)).toContain('✗ copy failed');
    act(() => tree.unmount());
  });

  it('offers to open what was pasted when the whole of it is a link', () => {
    showClip();
    const tree = open();
    expect(findButton(tree, 'Open')).toBeDefined();
    act(() => tree.unmount());
  });

  it('offers no such thing for text that merely contains one', () => {
    // Finding a URL inside longer text would mean guessing which of several
    // somebody meant, and guessing wrong opens the wrong page.
    showClip({ text: 'have a look at https://example.com when you can' });
    const tree = open();
    expect(findButton(tree, 'Open')).toBeUndefined();
    act(() => tree.unmount());
  });

  it('offers no such thing for a scheme the app will not hand to the OS', () => {
    showClip({ text: 'javascript:alert(1)' });
    const tree = open();
    expect(findButton(tree, 'Open')).toBeUndefined();
    act(() => tree.unmount());
  });

  it('sends what is on the device clipboard', async () => {
    (Clipboard.getStringAsync as jest.Mock).mockImplementation(
      async () => 'https://example.com/new'
    );
    showChannel(channelOf());
    const tree = open();
    await act(async () => {
      findButton(tree, 'Paste my clipboard')!.props.onPress();
    });

    expect(mockApp.act).toHaveBeenCalledWith('sess_1', {
      type: 'PASTE_CLIP',
      text: 'https://example.com/new',
    });
    act(() => tree.unmount());
  });

  it('says so rather than sending nothing when the device clipboard is empty', async () => {
    showChannel(channelOf());
    const tree = open();
    await act(async () => {
      findButton(tree, 'Paste my clipboard')!.props.onPress();
    });

    expect(mockApp.act).not.toHaveBeenCalled();
    expect(textOf(tree)).toContain('nothing on your clipboard');
    act(() => tree.unmount());
  });

  /**
   * The refusal that has to happen here or nowhere. A paste travels as a
   * socket action, which reports back only through `lastError` — rendered on
   * the auth screen and on no other. Sending it and letting the reducer
   * silently decline would look like a dead button.
   */
  it('refuses text past the cap before it is sent', async () => {
    (Clipboard.getStringAsync as jest.Mock).mockImplementation(async () =>
      'x'.repeat(MAX_CLIP_LENGTH + 1)
    );
    showChannel(channelOf());
    const tree = open();
    await act(async () => {
      findButton(tree, 'Paste my clipboard')!.props.onPress();
    });

    expect(mockApp.act).not.toHaveBeenCalled();
    expect(textOf(tree)).toContain('too long to share');
    act(() => tree.unmount());
  });

  it('will not let somebody who has stepped out paste or clear', () => {
    showChannel(
      channelOf((s) => ({
        ...reduce(s, { type: 'STEP_OUT', userId: ME }, NOW),
        clip: CLIP,
      }))
    );
    const tree = open();

    expect(findButton(tree, 'with my clipboard')!.props.disabled).toBe(true);
    expect(findButton(tree, 'Clear')!.props.disabled).toBe(true);
    // Copying out is not restricted: the content is already on this phone.
    expect(findButton(tree, 'Copy')!.props.disabled).toBeFalsy();
    act(() => tree.unmount());
  });

  it('empties the slot on Clear', () => {
    showClip();
    const tree = open();
    act(() => findButton(tree, 'Clear')!.props.onPress());

    expect(mockApp.act).toHaveBeenCalledWith('sess_1', { type: 'CLEAR_CLIP' });
    act(() => tree.unmount());
  });
});

/**
 * The watch party card.
 *
 * What is under test here is the card's judgement rather than the transport's
 * arithmetic, which is core's — whether the button lights up, whether the
 * controls grey, and whether the two things a party is exclusive with say so
 * rather than going quietly dead.
 */
describe('Channel, watching together', () => {
  const URL = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';

  function watching(mutate: (s: ChannelState) => ChannelState = (s) => s) {
    return channelOf((s) =>
      mutate(
        reduce(
          s,
          { type: 'START_WATCH', userId: ME, videoId: 'dQw4w9WgXcQ', url: URL },
          NOW
        )
      )
    );
  }

  function open() {
    return render(<ChannelView
        channelId="sess_1"
        audio={AUDIO}
        onHome={() => {}}
        onExit={() => {}}
      />);
  }

  /** The link field, which is the only TextInput in the empty card. */
  function pasteLink(tree: ReactTestRenderer, text: string) {
    const field = tree.root
      .findAll((node) => node.type === TextInput)
      .find((n) => n.props.placeholder === 'Paste a YouTube link');
    act(() => field!.props.onChangeText(text));
  }

  it('will not start on something that is not a YouTube link', () => {
    showChannel(channelOf());
    const tree = open();
    expect(
      findButton(tree, 'Watch something together')!.props.disabled
    ).toBe(true);

    pasteLink(tree, 'https://vimeo.com/123456');
    expect(
      findButton(tree, 'Watch something together')!.props.disabled
    ).toBe(true);
    act(() => tree.unmount());
  });

  it('lights up on one, and sends the link as typed', () => {
    showChannel(channelOf());
    const tree = open();
    pasteLink(tree, URL);

    const start = findButton(tree, 'Watch something together')!;
    expect(start.props.disabled).toBe(false);
    act(() => start.props.onPress());
    expect(mockApp.act).toHaveBeenCalledWith('sess_1', {
      type: 'START_WATCH',
      url: URL,
    });
    act(() => tree.unmount());
  });

  it('shows the transport once a party is loaded', () => {
    showChannel(watching());
    const tree = open();
    expect(textOf(tree)).toContain(URL);
    expect(findButton(tree, 'Play')).toBeDefined();
    expect(findButton(tree, 'Stop')).toBeDefined();
    act(() => tree.unmount());
  });

  it('says how far in everybody is before any screen has said how long it is', () => {
    showChannel(watching());
    const tree = open();
    // A progress bar would have to invent a denominator. Nothing here ever
    // asks YouTube anything, so until a follower reports one there is only the
    // elapsed figure to show.
    expect(textOf(tree)).toContain('in');
    act(() => tree.unmount());
  });

  it('greys the transport while somebody else holds the floor', () => {
    showChannel(
      watching((s) => reduce(s, { type: 'CLAIM_FLOOR', userId: THEM }, NOW))
    );
    const tree = open();
    expect(findButton(tree, 'Play')!.props.disabled).toBe(true);
    expect(findButton(tree, 'Stop')!.props.disabled).toBe(true);
    expect(textOf(tree)).toContain('Dana Chu has the floor');
    act(() => tree.unmount());
  });

  it('leaves the follower link alone while somebody else holds it', () => {
    // Opening a screen of your own is not changing what the channel is doing,
    // so the floor has no business governing it.
    showChannel(
      watching((s) => reduce(s, { type: 'CLAIM_FLOOR', userId: THEM }, NOW))
    );
    const tree = open();
    expect(
      findButton(tree, 'Watch on another screen')!.props.disabled
    ).toBeFalsy();
    act(() => tree.unmount());
  });

  /**
   * Somebody looking at a conversation they are not in. The whole card greys,
   * the second screen included — that being the control this rule was reported
   * about, and the one that used to be wired to nothing but `linking`.
   */
  it('refuses the whole card to somebody outside an occupied channel', () => {
    showChannel(watching((s) => reduce(s, { type: 'STEP_OUT', userId: ME }, NOW)));
    const tree = open();
    expect(findButton(tree, 'Play')!.props.disabled).toBe(true);
    expect(findButton(tree, 'Stop')!.props.disabled).toBe(true);
    expect(findButton(tree, 'Change video')!.props.disabled).toBe(true);
    expect(
      findButton(tree, 'Watch on another screen')!.props.disabled
    ).toBe(true);
    expect(textOf(tree)).toContain('Step in to start a watch party');
    act(() => tree.unmount());
  });

  /**
   * The same person on an *empty* channel, where the two halves of the rule
   * come apart: what is already on is theirs to drive, and putting something
   * else on is not. Two live controls beside two greyed ones is exactly the
   * arrangement that reads as a bug, so the card says which is which.
   */
  it('lets somebody outside an empty channel stop what is on, not change it', () => {
    showChannel(
      watching((s) =>
        reduce(
          reduce(s, { type: 'STEP_OUT', userId: THEM }, NOW),
          { type: 'STEP_OUT', userId: ME },
          NOW
        )
      )
    );
    const tree = open();
    expect(findButton(tree, 'Play')!.props.disabled).toBe(false);
    expect(findButton(tree, 'Stop')!.props.disabled).toBe(false);
    expect(findButton(tree, 'Change video')!.props.disabled).toBe(true);
    expect(
      findButton(tree, 'Watch on another screen')!.props.disabled
    ).toBe(false);
    expect(textOf(tree)).toContain('Step in to put something else on');
    act(() => tree.unmount());
  });

  it('refuses Record with the reason, rather than a dead button', () => {
    showChannel(watching());
    const tree = open();
    expect(findButton(tree, 'Record')!.props.disabled).toBe(true);
    expect(textOf(tree)).toContain('Stop the watch party to record');
    act(() => tree.unmount());
  });

  it('refuses a party with the reason while a recording runs', () => {
    showChannel(
      channelOf((s) =>
        reduce(s, { type: 'START_RECORDING', userId: ME, runId: 'run1' }, NOW)
      )
    );
    const tree = open();
    expect(textOf(tree)).toContain('Stop the recording first');
    act(() => tree.unmount());
  });

  it('shares a follower link for another screen', async () => {
    const share = jest
      .spyOn(Share, 'share')
      .mockResolvedValue({ action: 'sharedAction' } as never);
    showChannel(watching());
    const tree = open();
    await act(async () => {
      findButton(tree, 'Watch on another screen')!.props.onPress();
    });
    expect(mockApp.watchLink).toHaveBeenCalledWith('sess_1');
    expect(share).toHaveBeenCalledWith({
      message: 'https://example.test/watch/sess_1#tok',
    });
    act(() => tree.unmount());
    share.mockRestore();
  });

  it('starts muted, which is what makes the default safe', () => {
    // Muted *and* paused, so a fresh party asserts nothing until Play — and
    // the first thing the default can do is the thing it is for. The headphone
    // advice that used to be tested here is gone: the leak it warned about is
    // prevented now rather than advised against.
    showChannel(watching());
    const tree = open();
    expect(findButton(tree, 'Unmute the room')).toBeDefined();
    expect(textOf(tree)).not.toContain('Headphones');
    // Paused, so nothing is actually withheld yet.
    expect(textOf(tree)).not.toContain('Party-muted');
    act(() => tree.unmount());
  });

  it('says so when somebody has unmuted against the default', () => {
    showChannel(
      watching((s) =>
        reduce(s, { type: 'SET_WATCH_MUTE', userId: ME, muted: false }, NOW)
      )
    );
    const tree = open();
    expect(textOf(tree)).toContain('The room is unmuted');
    expect(findButton(tree, 'Mute the room')).toBeDefined();
    act(() => tree.unmount());
  });

  it('does not ask for headphones before there is anything to watch', () => {
    // Advice about a sound nothing is making yet is noise on an empty card.
    showChannel(channelOf());
    const tree = open();
    expect(textOf(tree)).not.toContain('Headphones on the screen end');
    act(() => tree.unmount());
  });

  /** Muted *and* playing, which is the only combination that withholds. */
  const muted = () =>
    watching((s) =>
      reduce(
        reduce(s, { type: 'SET_WATCH_MUTE', userId: ME, muted: true }, NOW),
        { type: 'WATCH_PLAY', userId: ME },
        NOW
      )
    );

  /** Muted, but paused — so everybody has their voice back. */
  const mutedAndPaused = () =>
    watching((s) => reduce(s, { type: 'SET_WATCH_MUTE', userId: ME, muted: true }, NOW));

  it('offers to mute the room again once it has been unmuted', () => {
    showChannel(
      watching((s) =>
        reduce(s, { type: 'SET_WATCH_MUTE', userId: ME, muted: false }, NOW)
      )
    );
    const tree = open();
    const button = findButton(tree, 'Mute the room')!;
    expect(button).toBeDefined();
    act(() => button.props.onPress());
    expect(mockApp.act).toHaveBeenCalledWith('sess_1', {
      type: 'SET_WATCH_MUTE',
      muted: true,
    });
    act(() => tree.unmount());
  });

  it('offers to clear it, and says the self-mute is untouched', () => {
    showChannel(muted());
    const tree = open();
    const button = findButton(tree, 'Unmute the room')!;
    expect(labelOf(button)).toContain('your own mute is unchanged');
    act(() => button.props.onPress());
    expect(mockApp.act).toHaveBeenCalledWith('sess_1', {
      type: 'SET_WATCH_MUTE',
      muted: false,
    });
    act(() => tree.unmount());
  });

  it('says it once under the roster, not on every card', () => {
    // One fact about the room rather than six about six people. Six badges
    // would also imply each person had been muted individually, which is the
    // one thing this deliberately does not do.
    showChannel(muted());
    const tree = open();
    const text = textOf(tree);
    expect(text).toContain('Party-muted');
    expect(text.match(/Party-muted/g)).toHaveLength(1);
    act(() => tree.unmount());
  });

  it('says nothing about party-muting when the room is not muted', () => {
    showChannel(watching());
    const tree = open();
    expect(textOf(tree)).not.toContain('Party-muted');
    act(() => tree.unmount());
  });

  it('drops the headphone advice while the room is muted', () => {
    // The mute is the stronger remedy for the same problem, so the advice is
    // not true while it holds — and two warnings about one thing is one too
    // many. What replaces it says why the room has gone quiet.
    showChannel(muted());
    const tree = open();
    const text = textOf(tree);
    expect(text).not.toContain('Headphones on the screen end');
    expect(text).toContain('The room is muted');
    act(() => tree.unmount());
  });

  it('says the room can talk while the video is paused', () => {
    // The mute holds only while the video plays, so a paused party is a room
    // with its voice back — and the silence returning on the next tap of Play
    // is the surprise worth heading off.
    showChannel(mutedAndPaused());
    const tree = open();
    const text = textOf(tree);
    expect(text).not.toContain('Party-muted');
    expect(text).toContain('Paused, so you can talk');
    expect(text).toContain('quiet again when the video resumes');
    act(() => tree.unmount());
  });

  it('keeps the toggle on the intent, not on what the transport is doing', () => {
    // A button that flipped itself back to "Mute the room" at every pause
    // would be a control fighting its owner.
    showChannel(mutedAndPaused());
    const tree = open();
    expect(findButton(tree, 'Unmute the room')).toBeDefined();
    expect(findButton(tree, 'Mute the room')).toBeUndefined();
    act(() => tree.unmount());
  });

  it('copies the video link, which is the public one', async () => {
    (Clipboard.setStringAsync as jest.Mock).mockImplementation(async () => true);
    showChannel(watching());
    const tree = open();
    await act(async () => findButton(tree, 'Copy video link')!.props.onPress());

    expect(Clipboard.setStringAsync).toHaveBeenCalledWith(URL);
    expect(textOf(tree)).toContain('✓ copied');
    act(() => tree.unmount());
  });

  it('mints and copies the screen link, which is a credential', async () => {
    (Clipboard.setStringAsync as jest.Mock).mockImplementation(async () => true);
    showChannel(watching());
    const tree = open();
    await act(async () => findButton(tree, 'Copy screen link')!.props.onPress());

    expect(mockApp.watchLink).toHaveBeenCalledWith('sess_1');
    expect(Clipboard.setStringAsync).toHaveBeenCalledWith(
      'https://example.test/watch/sess_1#tok'
    );
    act(() => tree.unmount());
  });

  it('says so when the clipboard declines, rather than claiming a copy', async () => {
    // `copyText` returns whether it landed precisely so that a refusal is not
    // announced as a success — discovered otherwise at the paste, by somebody
    // who has already moved on.
    (Clipboard.setStringAsync as jest.Mock).mockImplementation(async () => false);
    showChannel(watching());
    const tree = open();
    await act(async () => findButton(tree, 'Copy video link')!.props.onPress());

    expect(textOf(tree)).toContain('✗ copy failed');
    act(() => tree.unmount());
  });

  it('reports only the button that was pressed', async () => {
    (Clipboard.setStringAsync as jest.Mock).mockImplementation(async () => true);
    showChannel(watching());
    const tree = open();
    await act(async () => findButton(tree, 'Copy video link')!.props.onPress());

    // One piece of state for two buttons: the other must still offer itself
    // rather than both reading as copied.
    expect(findButton(tree, 'Copy screen link')).toBeDefined();
    act(() => tree.unmount());
  });

  it('greys the mute while somebody else holds the floor', () => {
    showChannel(
      watching((s) => reduce(s, { type: 'CLAIM_FLOOR', userId: THEM }, NOW))
    );
    const tree = open();
    // "Unmute", the party having started muted — the label follows the intent.
    expect(findButton(tree, 'Unmute the room')!.props.disabled).toBe(true);
    act(() => tree.unmount());
  });

  it('swaps the video without stopping the party first', () => {
    showChannel(watching());
    const tree = open();
    act(() => findButton(tree, 'Change video')!.props.onPress());

    const field = tree.root
      .findAll((node) => node.type === TextInput)
      .find((n) => n.props.placeholder === 'Paste a YouTube link');
    act(() => field!.props.onChangeText('https://youtu.be/abcdefghijk'));
    act(() => findButton(tree, 'Watch this instead')!.props.onPress());

    // START_WATCH replaces a party in place, so the followers never see
    // "Nothing is playing" between one video and the next.
    expect(mockApp.act).toHaveBeenCalledWith('sess_1', {
      type: 'START_WATCH',
      url: 'https://youtu.be/abcdefghijk',
    });
    expect(mockApp.act).not.toHaveBeenCalledWith('sess_1', { type: 'STOP_WATCH' });
    act(() => tree.unmount());
  });

  it('lets the swap be abandoned without changing anything', () => {
    showChannel(watching());
    const tree = open();
    act(() => findButton(tree, 'Change video')!.props.onPress());
    act(() => findButton(tree, 'Cancel')!.props.onPress());

    expect(findButton(tree, 'Change video')).toBeDefined();
    expect(mockApp.act).not.toHaveBeenCalled();
    act(() => tree.unmount());
  });

  it('offers the link before anybody has chosen a video', () => {
    // The ordinary order of doing this is to open the screen first and then
    // pick something, so the link cannot be behind a loaded party.
    showChannel(channelOf());
    const tree = open();
    expect(findButton(tree, 'Watch on another screen')).toBeDefined();
    act(() => tree.unmount());
  });
});
