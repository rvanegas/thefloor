import React from 'react';
import renderer, {
  act,
  type ReactTestInstance,
  type ReactTestRenderer,
} from 'react-test-renderer';

/**
 * What survives a sign-out, which is a question about `Root` rather than about
 * any screen — and so has no home in `src/ui/__tests__/views.test.tsx`, which
 * renders each view directly and never exercises the thing that chooses
 * between them.
 *
 * The bug this exists for: `Root` does not unmount when the session ends. A
 * null token changes what it renders, not whether it exists, so every screen
 * stacked over Home outlived the account that opened it. Signing out is only
 * reachable from the settings screen, so the settings case was not occasional —
 * every sign-in after a sign-out landed back on Settings.
 */

const NOW = 1_700_000_000_000;

const mockApp = {
  ready: true,
  token: 'token' as string | null,
  me: { id: 'acct_me', displayName: 'Me' },
  home: null,
  channelViews: {} as Record<string, unknown>,
  /**
   * Which channel this *device* is standing in — the narrowing App.tsx puts on
   * the roster before anything opens a microphone. A snapshot says where the
   * account is present, which is the same for every device it is signed in on;
   * this says which one is holding the room. See `AppProvider.standingIn`.
   */
  standingIn: null as string | null,
  displaced: false,
  recordingAsked: null as string | null,
  goneChannels: [] as string[],
  status: 'open' as const,
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
  loadProfile: jest.fn(),
  saveProfile: jest.fn(async () => {}),
  loadSupport: jest.fn(async () => ({ url: null, identifier: null, mine: null })),
  connectWith: jest.fn(),
  watchChannel: jest.fn(),
  leaveChannelView: jest.fn(),
  act: jest.fn(),
  clearError: jest.fn(),
  dismissedInvites: [] as string[],
  dismissInvite: jest.fn(),
  appearance: 'system' as const,
  setAppearance: jest.fn(),
  notificationTapped: false,
  clearNotificationTap: jest.fn(),
  movedChannel: null,
  /** Granted by hand on the account, and the only way Standings is reachable. */
  leaderboard: false,
  loadLeaderboard: jest.fn(async () => []),
};

/**
 * How wide the window is, which decides one pane or two.
 *
 * Mocked at the module React Native's own export is a getter onto, rather than
 * by spreading `react-native` — spreading it evaluates every one of those
 * getters, which pulls in native modules this file has no business touching.
 *
 * **It has to be mocked at all**, and that is the point of the default here:
 * jest's window is 750×1334, which is on the stack side of the breakpoint but
 * only by chance. A test that wants two panes says so.
 */
const windowWidth = { current: 390 };

jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: () => ({
    width: windowWidth.current,
    height: 1200,
    scale: 2,
    fontScale: 1,
  }),
}));

jest.mock('../src/state/AppProvider', () => ({
  useApp: () => mockApp,
  AppProvider: ({ children }: { children: React.ReactNode }) => children,
}));

// No microphone in a render test, for the reason views.test.tsx gives: the
// LiveKit packages ship untranspiled ESM, and opening an audio session is not
// this file's business.
const audioCalls: unknown[][] = [];

jest.mock('../src/audio/useSessionAudio', () => ({
  useSessionAudio: (...args: unknown[]) => (
    audioCalls.push(args),
    {
    status: 'idle',
    message: null,
    mutedByServer: false,
    othersAudible: 0,
    speaking: [],
    micOpen: true,
    }
  ),
}));

import { createChannel } from '../../core/channel';
import App from '../App';

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
  // A control drawn as a glyph has no text under it, and its name is the
  // `accessibilityLabel` instead — which is the name a screen reader reads
  // out, so it is the honest thing to search by. Only when there is no text
  // at all: plenty of rows carry both, and there the words on screen are what
  // a test naming them means. See `IconButton`.
  if (out.length === 0 && typeof instance.props.accessibilityLabel === 'string')
    return instance.props.accessibilityLabel;
  return out.join(' ');
}

function pressButton(tree: ReactTestRenderer, label: string): void {
  const target = tree.root
    .findAll((n) => n.props?.accessibilityRole === 'button')
    .find((n) => labelOf(n).includes(label));
  if (!target) throw new Error(`no button labelled ${label}`);
  act(() => target.props.onPress());
}

describe('a session ending', () => {
  beforeEach(() => {
    mockApp.token = 'token';
  });

  it('closes the settings screen, so signing back in lands on Home', () => {
    let tree!: ReactTestRenderer;
    act(() => {
      tree = renderer.create(<App />);
    });

    // "Appearance" is a heading only the settings screen has. It used to be
    // the "Home" button, which was that screen's own way off it — that reads
    // "Back" now, and Back is a word other screens may grow. A heading cannot
    // be confused with the button that opened the screen the way "Settings"
    // could, and this one renders synchronously, the profile fetch having
    // moved to the contacts settings screen with the fields that needed it.
    pressButton(tree, 'Settings');
    expect(textOf(tree)).toContain('Appearance');

    // Signing out. Root stays mounted throughout — that is the whole point.
    act(() => {
      mockApp.token = null;
      tree.update(<App />);
    });
    // Not asserting on what AuthView shows: with no EXPO_PUBLIC_API_URL in the
    // jest environment it renders its "not configured" notice rather than the
    // sign-in form, which is correct behaviour and beside the point here.

    act(() => {
      mockApp.token = 'token';
      tree.update(<App />);
    });

    expect(textOf(tree)).not.toContain('Appearance');
    expect(textOf(tree)).toContain('Start a channel');
    act(() => tree.unmount());
  });
});


/**
 * Where a notification tap lands, which is a question about `Root` and about
 * nothing else: `push.ts` reports that a tap happened and `AppProvider` holds
 * that, but what to do about it is here.
 *
 * **It shows the live rooms rather than one of them, since 2026-09-04.** The
 * payload still carries a channel and nothing reads it: a tap is not an
 * instruction about which conversation you meant, and there may be more than
 * one room with somebody in it by the time a phone is picked up. So the tap
 * brings up the Channels tab with nothing open — the Live section is the first
 * thing on it — and the person who was interrupted chooses. That also means
 * nothing steps anybody into a room on the strength of a notification.
 *
 * The deferral is the half worth pinning hardest. A tap that *launched* the
 * app is read while the stored token is still coming out of storage, so it
 * arrives before there is anywhere to put it, and the effect that clears every
 * screen while there is no token cannot tell that moment from a sign-out.
 */
describe('a tap on a notification', () => {
  beforeEach(() => {
    mockApp.ready = true;
    mockApp.token = 'token';
    mockApp.notificationTapped = false;
    mockApp.standingIn = null;
    mockApp.leaderboard = false;
    (mockApp.watchChannel as jest.Mock).mockClear();
    (mockApp.clearNotificationTap as jest.Mock).mockClear();
  });

  /**
   * What is *behind* a tap, which is the whole of what it does now: whatever
   * was open closes, the tab goes back to Channels, and nothing is entered.
   *
   * Standings is the screen asserted on because it is the one that was missed
   * when this was five statements rather than an assignment.
   */
  it('shows the channel list with nothing open over it', () => {
    mockApp.leaderboard = true;

    let tree!: ReactTestRenderer;
    act(() => {
      tree = renderer.create(<App />);
    });

    pressButton(tree, 'Leaderboard');
    expect(textOf(tree)).toContain('Invitations');

    act(() => {
      mockApp.notificationTapped = true;
      tree.update(<App />);
    });

    expect(textOf(tree)).toContain('Start a channel');
    expect(textOf(tree)).not.toContain('Invitations');
    // Nothing is watched and nothing is entered: a tap names no room, so there
    // is no subscription to make and nobody to step in.
    expect(mockApp.watchChannel).not.toHaveBeenCalled();
    // Consumed, or the next render would navigate here all over again.
    expect(mockApp.clearNotificationTap).toHaveBeenCalled();
    act(() => tree.unmount());
  });

  /**
   * The cold launch, which is the case the feature exists for. The tap is read
   * before the token is, and acting on it then drops somebody behind the
   * sign-in form — or onto a list that is immediately wiped.
   */
  it('waits for the session before going anywhere', () => {
    mockApp.token = null;
    mockApp.notificationTapped = true;

    let tree!: ReactTestRenderer;
    act(() => {
      tree = renderer.create(<App />);
    });

    // Held rather than dropped: this is the tap that started the app, and
    // forgetting it would mean nothing happened at all.
    expect(mockApp.clearNotificationTap).not.toHaveBeenCalled();

    act(() => {
      mockApp.token = 'token';
      tree.update(<App />);
    });

    expect(mockApp.clearNotificationTap).toHaveBeenCalled();
    act(() => tree.unmount());
  });
});

/**
 * The microphone has to open on the tap, not on the server's answer.
 *
 * Alone in a channel it is closed on purpose, and a recording is what reopens
 * it — but "a recording is running" is learned from a snapshot, a round trip
 * after the button. Capture is running during that round trip, against nobody
 * publishing, and a short enough run ends with no audio at all. `recordingAsked`
 * is the intent, known here first.
 */
describe('asking to record', () => {
  const CHANNEL = 'chan_1';

  function withChannel(present: string[]) {
    mockApp.channelViews = {
      [CHANNEL]: {
        channel: {
          id: CHANNEL,
          mediaRoom: CHANNEL,
          status: 'active',
          participants: ['acct_me'],
          present,
          selfMuted: {},
          disconnectedAt: {},
          floor: { holder: null, claimedAt: null, lastClaimedAt: {}, lastReleasedAt: null },
          recording: { status: 'idle', runId: null, startedAt: null, accumulatedMs: 0, segmentStartedAt: null, failure: null },
          playback: { track: null },
          invited: {},
          invitedBy: {},
          everPresent: ['acct_me'],
          name: null,
        },
        participants: [{ id: 'acct_me', displayName: 'Me' }],
        recordings: [],
        serverNow: NOW,
      },
    };
    // One person, one phone, in the channel — which is what putting somebody
    // in `present` means everywhere in this file.
    mockApp.standingIn = present.includes('acct_me') ? CHANNEL : null;
  }

  it('opens the microphone before the server has confirmed', () => {
    withChannel(['acct_me']);
    mockApp.recordingAsked = null;
    audioCalls.length = 0;

    let tree!: ReactTestRenderer;
    act(() => {
      tree = renderer.create(<App />);
    });
    // Alone and not recording: nothing is listening, so it stays shut.
    expect(audioCalls.at(-1)?.[4]).toBe(false);

    act(() => {
      mockApp.recordingAsked = CHANNEL;
      tree.update(<App />);
    });
    expect(audioCalls.at(-1)?.[4]).toBe(true);

    act(() => tree.unmount());
  });
});

/**
 * The list pane, which is the one thing on a wide window you choose to put
 * there.
 *
 * Below the breakpoint there is one of these: the tier is the screen, and a
 * profile opened from its contact list covers it. Those cases are the rest of
 * this file and the views' own tests. What is asserted here is only what the
 * second pane makes possible — that the list and the conversation stop being
 * alternatives.
 */
describe('a window wide enough for two panes', () => {
  beforeEach(() => {
    mockApp.token = 'token';
    mockApp.ready = true;
    mockApp.home = null;
    // `mockApp` is one mutable object shared by every block in this file, and
    // the notification tests leave a channel in it. Without these, `Root`
    // opens that channel and the pane under test is never reached.
    mockApp.notificationTapped = false;
    mockApp.channelViews = {};
    mockApp.standingIn = null;
    windowWidth.current = 1024;
  });

  afterEach(() => {
    windowWidth.current = 390;
  });

  it('switches the tier to the contacts, and leaves the pane beside it', () => {
    let tree!: ReactTestRenderer;
    act(() => {
      tree = renderer.create(<App />);
    });

    // The tier's switch carries the word "Contacts" whichever half is
    // selected, so the list is identified by `AddContact`, which only the list
    // itself draws.
    expect(textOf(tree)).not.toContain('Add a contact');

    pressButton(tree, 'Contacts');

    const shown = textOf(tree);
    // The tier's body is the contact list now...
    expect(shown).toContain('Add a contact');
    // ...and the pane beside it is still there, holding what it held.
    expect(shown).toContain('Pick a conversation on the left');

    // Back by the other half of the same switch, which is the whole of how
    // the two lists are navigated between. There is no Home button anywhere
    // any more: Home is the frame both of them are inside.
    pressButton(tree, 'Channels');
    expect(textOf(tree)).not.toContain('Add a contact');
    expect(textOf(tree)).toContain('Pick a conversation on the left');
  });

  it('keeps the contact list the whole of the tier below the breakpoint', () => {
    windowWidth.current = 390;
    let tree!: ReactTestRenderer;
    act(() => {
      tree = renderer.create(<App />);
    });

    pressButton(tree, 'Contacts');
    expect(textOf(tree)).toContain('Add a contact');
    // One pane, so there is no empty one beside it — the list is the screen.
    expect(textOf(tree)).not.toContain('Pick a conversation on the left');
  });
});
