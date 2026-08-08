import React from 'react';
import renderer, {
  act,
  type ReactTestInstance,
  type ReactTestRenderer,
} from 'react-test-renderer';
import { createSession, reduce } from '../../../../core/session';
import type { SessionState } from '../../../../core/types';
import type { HomeView as HomeViewData } from '../../../../core/protocol';
import { HomeView } from '../HomeView';
import { SessionView } from '../SessionView';

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
  sessionView: null as { session: SessionState; other: { id: string; displayName: string }; serverNow: number } | null,
  status: 'open' as 'open' | 'connecting' | 'closed',
  lastError: null,
  serverNow: () => NOW,
  requestCode: jest.fn(),
  verify: jest.fn(),
  signOut: jest.fn(),
  requestContact: jest.fn(),
  acceptContact: jest.fn(),
  declineContact: jest.fn(),
  startSession: jest.fn(),
  watchSession: jest.fn(),
  leaveSessionView: jest.fn(),
  act: jest.fn(),
  clearError: jest.fn(),
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
    otherAudible: false,
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

function render(element: React.ReactElement): ReactTestRenderer {
  let tree!: ReactTestRenderer;
  act(() => {
    tree = renderer.create(element);
  });
  return tree;
}

function sessionOf(mutate: (s: SessionState) => SessionState = (s) => s) {
  const base = createSession({
    id: 'sess_1',
    initiator: ME,
    invitee: THEM,
    now: NOW,
  });
  return mutate(reduce(base, { type: 'ENTER', userId: THEM }, NOW));
}

function showSession(session: SessionState) {
  mockApp.sessionView = {
    session,
    other: { id: THEM, displayName: 'Dana Chu' },
    serverNow: NOW,
  };
}

beforeEach(() => {
  mockApp.home = null;
  mockApp.sessionView = null;
  mockApp.status = 'open';
  jest.clearAllMocks();
});

describe('Home', () => {
  it('renders contacts, invites and rejoinable sessions from a snapshot', () => {
    mockApp.home = {
      invites: [
        {
          sessionId: 'sess_a',
          from: { id: THEM, displayName: 'Dana Chu' },
          createdAt: NOW,
        },
      ],
      rejoinable: [
        {
          sessionId: 'sess_b',
          other: { id: 'acct_x', displayName: 'Miro Okafor' },
          otherPresent: true,
          createdAt: NOW,
        },
      ],
      contacts: [
        { account: { id: 'acct_p', displayName: 'Priya Raman' }, status: 'incoming' },
        { account: { id: 'acct_q', displayName: 'Quinn Ito' }, status: 'accepted' },
      ],
      recordings: [],
    };

    const tree = render(<HomeView onEnterSession={() => {}} />);
    const text = textOf(tree);
    expect(text).toContain('tap to join');
    expect(text).toContain('Miro Okafor');
    expect(text).toContain('Still there — you left');
    expect(text).toContain('Priya Raman');
    expect(text).toContain('Accept');
    expect(text).toContain('Quinn Ito');
    expect(text).toContain('Start session');
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
          sessionId: 'sess_1',
          other: { id: THEM, displayName: 'Dana Chu' },
          startedAt: NOW,
          durationMs: 92_000,
        },
      ],
    };

    const tree = render(<HomeView onEnterSession={() => {}} />);
    expect(textOf(tree)).toContain('1:32');

    const button = findButton(tree, 'Export');
    expect(button).toBeDefined();
    await act(async () => button!.props.onPress());
    expect(exportRecording).toHaveBeenCalledWith('token', 'rec_1', 'Dana Chu');
    act(() => tree.unmount());
  });

  it('says so when the connection is down', () => {
    mockApp.home = { invites: [], rejoinable: [], contacts: [], recordings: [] };
    mockApp.status = 'closed';
    const tree = render(<HomeView onEnterSession={() => {}} />);
    expect(textOf(tree)).toContain('Not connected');
    act(() => tree.unmount());
  });
});

describe('Session', () => {
  it('waits rather than rendering a stale screen before the first snapshot', () => {
    const tree = render(<SessionView sessionId="sess_1" onExit={() => {}} />);
    expect(textOf(tree)).toContain('Loading session');
    expect(mockApp.watchSession).toHaveBeenCalledWith('sess_1');
    act(() => tree.unmount());
  });

  it('shows the claim control when eligible', () => {
    showSession(sessionOf());
    const tree = render(<SessionView sessionId="sess_1" onExit={() => {}} />);
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
    let session = sessionOf((s) =>
      reduce(s, { type: 'CLAIM_FLOOR', userId: THEM }, NOW)
    );
    session = reduce(session, { type: 'START_RECORDING', userId: THEM }, NOW);
    showSession(session);

    const tree = render(<SessionView sessionId="sess_1" onExit={() => {}} />);
    const text = textOf(tree);
    expect(text).toContain('still being recorded');
    expect(text).toContain('left out of the exported recording');
    act(() => tree.unmount());
  });

  it('reflects being silenced by the other party', () => {
    showSession(
      sessionOf((s) => reduce(s, { type: 'CLAIM_FLOOR', userId: THEM }, NOW))
    );
    const tree = render(<SessionView sessionId="sess_1" onExit={() => {}} />);
    const text = textOf(tree);
    expect(text).toContain('Dana Chu has the floor — your mic is cut');
    expect(text).toContain('cannot claim the floor while you are silenced');
    act(() => tree.unmount());
  });

  it('counts down against the server clock, not the device clock', () => {
    const claimed = sessionOf((s) =>
      reduce(s, { type: 'CLAIM_FLOOR', userId: ME }, NOW)
    );
    showSession(claimed);
    // Device clock is irrelevant; serverNow decides. 40s into a 3:00 claim.
    mockApp.serverNow = () => NOW + 40_000;
    const tree = render(<SessionView sessionId="sess_1" onExit={() => {}} />);
    expect(textOf(tree)).toContain('2:20');
    mockApp.serverNow = () => NOW;
    act(() => tree.unmount());
  });

  it('dispatches a claim rather than mutating anything locally', () => {
    showSession(sessionOf());
    const tree = render(<SessionView sessionId="sess_1" onExit={() => {}} />);
    const claim = findButton(tree, 'Claim the floor');
    expect(claim).toBeDefined();
    expect(claim!.props.accessibilityState.disabled).toBe(false);
    act(() => claim!.props.onPress());
    expect(mockApp.act).toHaveBeenCalledWith('sess_1', { type: 'CLAIM_FLOOR' });
    act(() => tree.unmount());
  });

  it('warns that a dropped connection counts as leaving', () => {
    showSession(sessionOf());
    mockApp.status = 'connecting';
    const tree = render(<SessionView sessionId="sess_1" onExit={() => {}} />);
    expect(textOf(tree)).toContain('dropped connection counts as leaving');
    act(() => tree.unmount());
  });

  it('renders the ended state', () => {
    showSession(sessionOf((s) => reduce(s, { type: 'END', userId: THEM }, NOW)));
    const tree = render(<SessionView sessionId="sess_1" onExit={() => {}} />);
    expect(textOf(tree)).toContain('Session ended');
    act(() => tree.unmount());
  });
});
