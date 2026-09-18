import React from 'react';
import { Text } from 'react-native';
import renderer, { act, type ReactTestRenderer } from 'react-test-renderer';
import type { RealtimeHandlers } from '../../api/socket';
import { AppProvider, useApp } from '../AppProvider';

/**
 * Being made a screen, and being made to stop.
 *
 * **A film shows on one device at a time**, which the server enforces by
 * telling every other instance of an account to stop the moment one of them
 * declares itself the screen. Both directions of that arrive here as the
 * same message, and what this file is really about is the half that used to
 * be missing: a device *asked* to show a film set its own role and told the
 * server nothing, so the server went on believing it was idle — the picker
 * offered it as free while it was playing, and the *Watch on* switch on the
 * device that had just handed the film over never learnt that it had landed.
 */

const T0 = 1_700_000_000_000;

let handlers: RealtimeHandlers = {};
/** Every `screens.showing` this provider has sent, in order. */
const reported: Array<string | null> = [];

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(async () => 'stored-token'),
  setItemAsync: jest.fn(async () => {}),
  deleteItemAsync: jest.fn(async () => {}),
}));

jest.mock('../../api/http', () => ({
  ApiError: class ApiError extends Error {},
  onSignedOut: jest.fn(),
  api: {
    health: jest.fn(async () => ({ ok: true, minBuild: 1, updateUrl: null })),
    home: jest.fn(async () => ({
      invites: [],
      rejoinable: [],
      contacts: [],
      recordings: [],
    })),
  },
}));

/** Enough of `Realtime` to record the one report these tests are about. */
jest.mock('../../api/socket', () => ({
  Realtime: class {
    connect(_token: string, h: RealtimeHandlers) {
      handlers = h;
    }
    watchHome() {}
    watchChannel() {}
    unwatchChannel() {}
    showingScreen(channelId: string | null) {
      reported.push(channelId);
    }
    disconnect() {}
  },
}));

let latest: ReturnType<typeof useApp> | null = null;

function Screen() {
  const app = useApp();
  latest = app;
  return <Text>screen:{app.screenFor ?? 'nowhere'}</Text>;
}

function textOf(tree: ReactTestRenderer): string {
  const out: string[] = [];
  const walk = (n: unknown): void => {
    if (typeof n === 'string') out.push(n);
    else if (Array.isArray(n)) n.forEach(walk);
    else if (n && typeof n === 'object' && 'children' in n) {
      walk((n as { children: unknown }).children);
    }
  };
  walk(tree.toJSON());
  return out.join('');
}

let tree: ReactTestRenderer | null = null;

async function open(): Promise<ReactTestRenderer> {
  await act(async () => {
    tree = renderer.create(
      <AppProvider>
        <Screen />
      </AppProvider>
    );
  });
  return tree!;
}

beforeEach(() => {
  handlers = {};
  reported.length = 0;
  latest = null;
  jest.useFakeTimers({ now: T0, doNotFake: ['nextTick'] });
});

afterEach(() => {
  act(() => {
    tree?.unmount();
  });
  tree = null;
  jest.useRealTimers();
});

describe('being handed a film', () => {
  it('takes the role and tells the server it has', async () => {
    const shown = await open();
    act(() => handlers.onScreenAsked?.('sess_1'));

    expect(textOf(shown)).toContain('screen:sess_1');
    // The half that was missing. Without it the server counts this device as
    // idle while it plays a film, which is a picker offering a television
    // that is already busy and a switch elsewhere showing no answer.
    expect(reported).toEqual(['sess_1']);
  });

  it('gives it up when the film moves to another device', async () => {
    const shown = await open();
    act(() => handlers.onScreenAsked?.('sess_1'));
    reported.length = 0;

    // The server's half of somebody else's handover — a film shows on one
    // device at a time, so this is not a refusal.
    act(() => handlers.onScreenAsked?.(null));

    expect(textOf(shown)).toContain('screen:nowhere');
    expect(reported).toEqual([null]);
  });

  it('is the same fact the app can set for itself', async () => {
    await open();
    act(() => latest?.showScreenFor('sess_1'));
    expect(reported).toEqual(['sess_1']);
  });
});
