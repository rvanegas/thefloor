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
  pendingChannelId: null,
  clearPendingChannel: jest.fn(),
  movedChannel: null,
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

    // "Home" is the settings screen's own way off it, and appears nowhere
    // else — a surer marker than any of its contents, which load async, and
    // than its "Settings" heading, which is also the button that opened it.
    pressButton(tree, 'Settings');
    expect(textOf(tree)).toContain('Home');

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

    expect(textOf(tree)).not.toContain('Home');
    expect(textOf(tree)).toContain('Start a channel');
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
