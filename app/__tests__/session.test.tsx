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
  pendingChannelId: null as string | null,
  clearPendingChannel: jest.fn(),
  movedChannel: null,
  /** Granted by hand on the account, and the only way Standings is reachable. */
  leaderboard: false,
  loadLeaderboard: jest.fn(async () => []),
};

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
 * nothing else: `push.ts` turns a payload into a channel id and `AppProvider`
 * holds it, but the navigation itself — watch the channel, show it, close what
 * was stacked over Home — is here, and until now nothing exercised it.
 *
 * The deferral is the half worth pinning hardest. A tap that *launched* the
 * app is read while the stored token is still coming out of storage, so the id
 * arrives before there is anywhere to put it, and the effect that clears every
 * screen while there is no token cannot tell that moment from a sign-out.
 */
describe('a tap on a notification', () => {
  const TAPPED = 'chan_tapped';

  /**
   * Built through `createChannel` rather than written out, so the shape stays
   * whatever the model currently says it is. A hand-rolled literal here went
   * stale against `watch` within the week and failed inside `core` rather than
   * saying what it was missing.
   */
  function snapshotOf(id: string) {
    const channel = {
      ...createChannel({
        id,
        initiator: 'acct_me',
        invitees: ['acct_them'],
        now: NOW,
        // Somebody else in the room and not us, which is what an `arrived`
        // notification announces and the state a tap on one lands in:
        // watching, not present. See STATES.md § Watching.
        present: ['acct_them'],
      }),
      // Named, so the assertions can point at one word that belongs to this
      // screen and to no other. An unnamed channel is titled from its roster,
      // which Home draws too.
      name: 'Kitchen',
    };
    return {
      channel,
      participants: [
        { id: 'acct_me', displayName: 'Me' },
        { id: 'acct_them', displayName: 'Dana Chu' },
      ],
      recordings: [],
      serverNow: NOW,
    };
  }

  beforeEach(() => {
    mockApp.ready = true;
    mockApp.token = 'token';
    mockApp.pendingChannelId = null;
    mockApp.channelViews = { [TAPPED]: snapshotOf(TAPPED) };
    // Watching is not being there. A tap has always landed outside the room,
    // on the channel screen, which is what `standingIn` being null says here.
    mockApp.standingIn = null;
    mockApp.leaderboard = false;
    (mockApp.watchChannel as jest.Mock).mockClear();
    (mockApp.clearPendingChannel as jest.Mock).mockClear();
  });

  it('shows the channel, and watches it on the way in', () => {
    let tree!: ReactTestRenderer;
    act(() => {
      tree = renderer.create(<App />);
    });
    expect(textOf(tree)).toContain('Start a channel');

    act(() => {
      mockApp.pendingChannelId = TAPPED;
      tree.update(<App />);
    });

    expect(textOf(tree)).toContain('Kitchen');
    expect(textOf(tree)).not.toContain('Start a channel');
    // Arriving this way skips every path that would otherwise have subscribed
    // to the channel, so the screen would sit on a snapshot nobody refreshed.
    expect(mockApp.watchChannel).toHaveBeenCalledWith(TAPPED);
    // Consumed, or the next render would navigate here all over again — and a
    // second tap on the same channel would then be a no-op.
    expect(mockApp.clearPendingChannel).toHaveBeenCalled();
    act(() => tree.unmount());
  });

  /**
   * The cold launch, which is the case the feature exists for. The id is read
   * before the token is, and acting on it then drops somebody behind the
   * sign-in form — or into a channel screen that is immediately wiped.
   */
  it('waits for the session before going anywhere', () => {
    mockApp.token = null;
    mockApp.pendingChannelId = TAPPED;

    let tree!: ReactTestRenderer;
    act(() => {
      tree = renderer.create(<App />);
    });

    expect(mockApp.watchChannel).not.toHaveBeenCalled();
    // Held rather than dropped: this is the tap that started the app, and
    // forgetting it would mean nothing happened at all.
    expect(mockApp.clearPendingChannel).not.toHaveBeenCalled();

    act(() => {
      mockApp.token = 'token';
      tree.update(<App />);
    });

    expect(textOf(tree)).toContain('Kitchen');
    expect(mockApp.watchChannel).toHaveBeenCalledWith(TAPPED);
    act(() => tree.unmount());
  });

  /**
   * What is *behind* the channel, which is invisible until somebody presses
   * Home — a channel outranks every other screen in `Root`, so a stacked
   * screen left open costs nothing until the way out lands on it.
   *
   * Standings was the one missed, and it is the one this asserts on for that
   * reason.
   */
  it('closes the screen it was stacked over, so Home is the way out', () => {
    mockApp.leaderboard = true;

    let tree!: ReactTestRenderer;
    act(() => {
      tree = renderer.create(<App />);
    });

    pressButton(tree, 'Leaderboard');
    expect(textOf(tree)).toContain('Invitations');

    act(() => {
      mockApp.pendingChannelId = TAPPED;
      tree.update(<App />);
    });
    expect(textOf(tree)).toContain('Kitchen');

    // Off the channel screen without leaving the channel. This is where a
    // screen nobody had opened since before the notification would surface.
    pressButton(tree, 'Home');

    expect(textOf(tree)).toContain('Start a channel');
    expect(textOf(tree)).not.toContain('Invitations');
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
