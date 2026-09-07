import React from 'react';
import { Text } from 'react-native';
import renderer, { act, type ReactTestRenderer } from 'react-test-renderer';
import { createChannel, reduce } from '../../../../core/channel';
import type { ChannelState } from '../../../../core/types';
import type { RealtimeHandlers } from '../../api/socket';
import { AppProvider, useApp } from '../AppProvider';

/**
 * When `START_RECORDING` is allowed to leave the phone.
 *
 * **The server points an egress at a published track the instant the action
 * arrives, and a miss is not retried for five seconds.** So asking before the
 * microphone is up does not merely start late — it files a stem key with no
 * object behind it, and leaves a card that offers Play and can never play.
 * Observed 2026-09-04 as `rec_ub4l1XLe6NCd`: a six-second run with one second
 * of audio in it. See `Channels.dropHollowStems` for the server's half.
 *
 * The wait is bounded because a microphone is not guaranteed. A device with
 * no input never publishes, and a recording of the other party is still worth
 * having, so the request goes anyway rather than being lost.
 */

const ME = 'acct_me';
const THEM = 'acct_them';
const T0 = 1_700_000_000_000;

let handlers: RealtimeHandlers = {};
const acted: Array<{ channelId: string; action: { type: string } }> = [];

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
    startChannel: jest.fn(async () => ({ channelId: 'chan_new' })),
  },
}));

jest.mock('../../api/socket', () => ({
  Realtime: class {
    handlers: RealtimeHandlers = {};
    connect(_token: string, h: RealtimeHandlers) {
      handlers = h;
      this.handlers = h;
    }
    watchHome() {}
    watchChannel() {}
    unwatchChannel() {}
    act(channelId: string, action: { type: string }) {
      acted.push({ channelId, action });
      if (action.type === 'ENTER') this.handlers.onStanding?.(channelId);
    }
    disconnect() {}
  },
}));

function present(id: string): ChannelState {
  let channel = createChannel({ id, initiator: ME, invitees: [THEM], now: T0 });
  channel = reduce(channel, { type: 'ENTER', userId: THEM }, T0);
  return reduce(channel, { type: 'ENTER', userId: ME }, T0);
}

function push(channel: ChannelState): void {
  handlers.onChannel?.({
    channel,
    participants: [
      { id: ME, displayName: 'Me' },
      { id: THEM, displayName: 'Dana' },
    ],
    recordings: [],
    serverNow: T0,
  });
}

let latest: ReturnType<typeof useApp> | null = null;

function Asking() {
  const app = useApp();
  latest = app;
  return <Text>asked:{app.recordingAsked ?? 'nothing'}</Text>;
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

const sent = () => acted.filter((a) => a.action.type === 'START_RECORDING');

describe('asking to record', () => {
  let tree!: ReactTestRenderer;

  beforeEach(async () => {
    jest.useFakeTimers();
    handlers = {};
    acted.length = 0;
    await act(async () => {
      tree = renderer.create(
        <AppProvider>
          <Asking />
        </AppProvider>
      );
    });
    await act(async () => push(present('chan_a')));
    acted.length = 0;
  });

  afterEach(async () => {
    await act(async () => tree.unmount());
    jest.useRealTimers();
  });

  it('waits for a published microphone before asking', async () => {
    await act(async () => latest!.reportMicPublished(false));
    await act(async () => latest!.act('chan_a', { type: 'START_RECORDING' }));

    // Nothing on the wire yet, and the screen already says it was asked for:
    // the optimistic flag is what opens the microphone this is waiting on, so
    // it cannot wait for the send.
    expect(sent()).toHaveLength(0);
    expect(textOf(tree)).toContain('asked:chan_a');

    await act(async () => latest!.reportMicPublished(true));

    expect(sent()).toHaveLength(1);
    expect(sent()[0].channelId).toBe('chan_a');
  });

  it('asks at once when a microphone is already published', async () => {
    await act(async () => latest!.reportMicPublished(true));
    await act(async () => latest!.act('chan_a', { type: 'START_RECORDING' }));

    // The ordinary case, and the one that must not be made slower: alone in a
    // quiet channel with nothing else playing, the device is already open.
    expect(sent()).toHaveLength(1);
  });

  it('asks anyway when no microphone ever arrives', async () => {
    await act(async () => latest!.reportMicPublished(false));
    await act(async () => latest!.act('chan_a', { type: 'START_RECORDING' }));
    expect(sent()).toHaveLength(0);

    // A device with no input publishes nothing, ever. Losing the request would
    // cost somebody the ability to record the other party at all.
    await act(async () => {
      jest.advanceTimersByTime(2_000);
    });

    expect(sent()).toHaveLength(1);
  });

  it('sends once when the microphone arrives and the wait then expires', async () => {
    await act(async () => latest!.reportMicPublished(false));
    await act(async () => latest!.act('chan_a', { type: 'START_RECORDING' }));
    await act(async () => latest!.reportMicPublished(true));
    await act(async () => {
      jest.advanceTimersByTime(5_000);
    });

    // The timer is cancelled rather than left to fire into a request that has
    // already gone: two STARTs would start two runs.
    expect(sent()).toHaveLength(1);
  });

  it('drops a held request when the run is stopped before it goes', async () => {
    await act(async () => latest!.reportMicPublished(false));
    await act(async () => latest!.act('chan_a', { type: 'START_RECORDING' }));
    await act(async () => latest!.act('chan_a', { type: 'STOP_RECORDING' }));
    await act(async () => {
      jest.advanceTimersByTime(5_000);
    });

    // Changed their mind inside the wait. Starting a run afterwards, because a
    // timer outlived the decision, is the one outcome nobody asked for.
    expect(sent()).toHaveLength(0);
    expect(textOf(tree)).toContain('asked:nothing');
  });
});
