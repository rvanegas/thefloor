import React from 'react';
import renderer, {
  act,
  type ReactTestInstance,
  type ReactTestRenderer,
} from 'react-test-renderer';
import { createChannel, reduce } from '../../../../core/channel';
import type { ChannelState } from '../../../../core/types';
import type {
  HomeView as HomeViewData,
  ProfileView as ProfileViewData,
  RecordingView,
} from '../../../../core/protocol';
import type { UploadHooks } from '../../api/upload';
import type { GuestLinkSummary } from '../../api/http';

/**
 * The fixture every view test renders against: one mutable `mockApp` standing
 * in for the provider, the helpers that read a rendered tree, and the three
 * module mocks.
 *
 * It was the first four hundred lines of `views.test.tsx`, which by 2026-09-04
 * was 8,495 lines and 343 tests in one file — long enough that two describes
 * 1,900 lines apart had grown near-identical names and separate copies of the
 * same fixtures. The file is now seven, split at its own describe seams, and
 * this is what they share. **A helper belongs here once a second file wants
 * it, and not before**: a fixture only one file uses is clearer next to the
 * tests that use it.
 *
 * `resetHarness` is what the old `beforeEach` did, and every file calls it —
 * `mockApp` is module state, so a field one test sets is a field the next one
 * inherits.
 */
/**
 * The views now render server snapshots rather than driving a local model, so
 * these feed them protocol-shaped data directly. That also pins the views to
 * the real protocol types: a change on the server that the client has not kept
 * up with fails here rather than on a phone.
 */

export const ME = 'acct_me';
export const THEM = 'acct_them';
export const NOW = 1_700_000_000_000;

export const mockApp = {
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
  /**
   * Below the compatibility floor, which stops anything from being live
   * however present the roster says you are — the socket is already hung up.
   * Cleared in `beforeEach` like the rest.
   */
  expired: false,
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


/**
 * Every upload started by a test, held open rather than resolved.
 *
 * The interesting part of an upload is the middle — a percentage that is or is
 * not moving, and a Cancel that has or has not something to cancel — and a
 * mock that resolves immediately has no middle. Each entry carries the hooks
 * the screen passed in, so a test can drive progress itself, and the resolver,
 * so it can decide when the thing ends.
 */
export const uploads: Array<{
  hooks: UploadHooks;
  finish: (result: { cancelled: boolean }) => void;
  fail: (error: unknown) => void;
}> = [];



/**
 * The audio connection is held in App.tsx now, so these screens receive it
 * rather than opening it. That is the point of the change: a render test has
 * no business opening a microphone, and neither does navigating to Home.
 */
export const AUDIO = {
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
  resubscribe: () => {},
};

/** The same connection, with somebody audible on it. */
export function audioWith(...speaking: string[]) {
  return { ...AUDIO, speaking };
}



export function textOf(tree: ReactTestRenderer): string {
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
export function labelOf(instance: ReactTestInstance): string {
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
  // A control drawn as a glyph has no text under it, and its name is the
  // `accessibilityLabel` instead — which is the name a screen reader reads
  // out, so it is the honest thing to search by. Only when there is no text
  // at all: plenty of rows carry both, and there the words on screen are what
  // a test naming them means. See `IconButton`.
  if (out.length === 0 && typeof instance.props.accessibilityLabel === 'string')
    return instance.props.accessibilityLabel;
  return out.join(' ');
}

export function findButton(
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
export function linksIn(tree: ReactTestRenderer): string[] {
  return tree.root
    .findAll(
      (n) => typeof n.type === 'string' && n.props?.accessibilityRole === 'link'
    )
    .map(labelOf);
}

export function render(element: React.ReactElement): ReactTestRenderer {
  let tree!: ReactTestRenderer;
  act(() => {
    tree = renderer.create(element);
  });
  return tree;
}

/**
 * What the tier requires, as no-ops — and the Channels tab, which is what it
 * opens on and what almost every test below is about.
 *
 * Spread first, so a test that is about one of them overrides just that one and
 * every other site stays quiet about navigation it does not exercise. These
 * tests are almost all about what Home *shows*.
 *
 * It exists because `onOpenContacts` was added to HomeView and broke
 * thirty-eight call sites that had each written the same two no-ops out by
 * hand — a compile error per test, none of them about anything the test was
 * testing. The next required handler now costs one line here, which is what it
 * cost when the tier arrived and took `list` and `onList`.
 */
export const homeNav = {
  list: 'channels' as const,
  onList: () => {},
  onEnterChannel: () => {},
  onOpenSettings: () => {},
};

export function channelOf(mutate: (s: ChannelState) => ChannelState = (s) => s) {
  const base = createChannel({
    id: 'sess_1',
    initiator: ME,
    invitees: [THEM],
    now: NOW,
  });
  return mutate(reduce(base, { type: 'ENTER', userId: THEM }, NOW));
}

export function showChannel(channel: ChannelState, recordings: RecordingView[] = []) {
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

/**
 * Who I am a contact of, which is half of whether I may ping them.
 *
 * Stated per test rather than folded into `showChannel`, which has well over a
 * hundred call sites: `app.home` is read by the Invite section and by the
 * profile as well, so making everybody a contact by default would quietly
 * change what those render in tests about neither — and would mask this gate
 * rather than exercise it. Set before `showChannel`, per the convention the
 * other home-reading tests already follow.
 */
export function knowing(...ids: string[]) {
  mockApp.home = {
    invites: [],
    rejoinable: [],
    contacts: ids.map((id) => ({
      account: { id, displayName: id === THEM ? 'Dana Chu' : id },
      status: 'accepted' as const,
    })),
    recordings: [],
  };
}

/**
 * The three module mocks, as factories rather than as `jest.mock` calls.
 *
 * They cannot be called here. `jest.mock` is hoisted above the imports of the
 * file it is written in and of no other, so a call in this module would run
 * only once this module had been imported — by which time the importing test
 * file has already pulled in the real `ChannelView` and, through it, the real
 * provider. Each test file therefore writes the three one-line calls itself
 * and reaches back here for the factory, which is the documented escape hatch
 * from the hoisting rule and the reason the `require` is inside.
 *
 * The state stays single: every file gets this module's one `mockApp` and one
 * `uploads`, so a helper written against either behaves the same everywhere.
 */
export const downloadMock = () => ({
  exportRecording: jest.fn(async () => {}),
});

export const uploadMock = () => ({
  pickAndUploadTrack: jest.fn(
    (_token: string, _channelId: string, hooks: UploadHooks = {}) =>
      new Promise((finish, fail) => {
        uploads.push({ hooks, finish, fail });
      })
  ),
});

export const appProviderMock = () => ({
  useApp: () => mockApp,
  AppProvider: ({ children }: { children: React.ReactNode }) => children,
});

/** What the old file's `beforeEach` did. Every test file calls it in one. */
export function resetHarness(): void {
  mockApp.home = null;
  mockApp.channelViews = {};
  mockApp.goneChannels = [];
  mockApp.standingIn = null;
  mockApp.displaced = false;
  mockApp.expired = false;
  mockApp.status = 'open';
  mockApp.appearance = 'system';
  mockApp.tapToStepIn = true;
  mockApp.controlCards = true;
  mockApp.debug = false;
  uploads.length = 0;
  uploads.length = 0;
  jest.clearAllMocks();
}
