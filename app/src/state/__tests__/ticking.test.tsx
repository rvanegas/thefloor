import React from 'react';
import { Text } from 'react-native';
import renderer, { act, type ReactTestRenderer } from 'react-test-renderer';
import { createChannel, reduce } from '../../../../core/channel';
import type { RealtimeHandlers } from '../../api/socket';
import { AppProvider, useApp } from '../AppProvider';

/**
 * Countdowns advance between server snapshots, which only arrive when something
 * changes. That relies on a local tick reaching consumers — and a memoised
 * context value whose identity never changes lets React skip every one of them,
 * so the provider re-renders and the screen does not.
 *
 * The symptom is subtle: every value is correct whenever it does update, so it
 * looks like the timers are merely slow rather than never running.
 */

const ME = 'acct_me';
const THEM = 'acct_them';
const T0 = 1_700_000_000_000;

let handlers: RealtimeHandlers = {};

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(async () => 'stored-token'),
  setItemAsync: jest.fn(async () => {}),
  deleteItemAsync: jest.fn(async () => {}),
}));

jest.mock('../../api/http', () => ({
  // A bare class is enough: the provider only uses it for instanceof checks.
  ApiError: class ApiError extends Error {},
  // The provider registers a sign-out listener on mount; these tests never
  // exercise it, so accepting the registration is all that is needed.
  onSignedOut: jest.fn(),
  api: {
    home: jest.fn(async () => ({
      invites: [],
      rejoinable: [],
      contacts: [],
      recordings: [],
    })),
  },
}));

jest.mock('../../api/socket', () => ({
  Realtime: class {
    connect(_token: string, h: RealtimeHandlers) {
      handlers = h;
    }
    watchHome() {}
    watchChannel() {}
    unwatchChannel() {}
    act() {}
    disconnect() {}
  },
}));

/** Renders whatever the current server time is, so ticking is observable. */
function Clock() {
  const { serverNow } = useApp();
  return <Text>now:{serverNow()}</Text>;
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

describe('countdown ticking', () => {
  beforeEach(() => {
    handlers = {};
    jest.useFakeTimers();
    jest.setSystemTime(T0);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('re-renders consumers between server snapshots', async () => {
    let tree!: ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(
        <AppProvider>
          <Clock />
        </AppProvider>
      );
    });

    // A channel on screen is what starts the local tick.
    const channel = reduce(
      createChannel({ id: 'sess_1', initiator: ME, invitees: [THEM], now: T0 }),
      { type: 'ENTER', userId: THEM },
      T0
    );
    await act(async () => {
      handlers.onServerTime?.(T0);
      handlers.onChannel?.({
        channel,
        participants: [
          { id: ME, displayName: 'Me' },
          { id: THEM, displayName: 'Dana' },
        ],
        serverNow: T0,
      });
    });

    const before = textOf(tree);

    // No further snapshots — only time passing.
    await act(async () => {
      jest.advanceTimersByTime(3000);
    });

    const after = textOf(tree);
    expect(before).not.toBe(after);
    // And it tracks the server's clock, not an arbitrary local one.
    expect(after).toBe(`now:${T0 + 3000}`);

    await act(async () => tree.unmount());
  });

  it('stops ticking once the channel is gone', async () => {
    let tree!: ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(
        <AppProvider>
          <Clock />
        </AppProvider>
      );
    });

    const channel = createChannel({
      id: 'sess_1',
      initiator: ME,
      invitees: [THEM],
      now: T0,
    });
    await act(async () => {
      handlers.onServerTime?.(T0);
      handlers.onChannel?.({
        channel,
        participants: [
          { id: ME, displayName: 'Me' },
          { id: THEM, displayName: 'Dana' },
        ],
        serverNow: T0,
      });
    });
    await act(async () => {
      handlers.onChannelGone?.('sess_1');
    });

    const before = textOf(tree);
    await act(async () => {
      jest.advanceTimersByTime(3000);
    });
    // Nothing on screen depends on the clock any more, so no work is done.
    expect(textOf(tree)).toBe(before);

    await act(async () => tree.unmount());
  });
});
