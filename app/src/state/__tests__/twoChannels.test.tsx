import React from 'react';
import { Text } from 'react-native';
import renderer, { act, type ReactTestRenderer } from 'react-test-renderer';
import { createChannel, reduce } from '../../../../core/channel';
import type { ChannelState } from '../../../../core/types';
import type { RealtimeHandlers } from '../../api/socket';
import { AppProvider, useApp } from '../AppProvider';

/**
 * A client watches more than one channel at once, and the server pushes a
 * snapshot for every one of them.
 *
 * It goes on watching a channel after the screen has moved elsewhere, which is
 * deliberate — the watch is also what reports presence when the socket dies,
 * so unwatching on navigation would leave somebody standing in a room they
 * have left. What that costs is snapshots for channels nobody is looking at,
 * and the provider used to keep only the last one to arrive: opening a second
 * channel meant every change in the first overwrote it. The screen fell back
 * to "Loading channel…" and the audio hung up. Reported from production on
 * 2026-08-16.
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
  ApiError: class ApiError extends Error {},
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

function channelOf(id: string): ChannelState {
  return reduce(
    createChannel({ id, initiator: ME, invitees: [THEM], now: T0 }),
    { type: 'ENTER', userId: THEM },
    T0
  );
}

function push(channel: ChannelState, serverNow = T0): void {
  handlers.onChannel?.({
    channel,
    participants: [
      { id: ME, displayName: 'Me' },
      { id: THEM, displayName: 'Dana' },
    ],
    recordings: [],
    serverNow,
  });
}

/** Names every channel the provider is holding a snapshot of, in order. */
function Held() {
  const { channelViews, goneChannels } = useApp();
  return (
    <Text>
      held:{Object.keys(channelViews).sort().join(',')} gone:
      {[...goneChannels].sort().join(',')}
    </Text>
  );
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

describe('watching two channels at once', () => {
  let tree!: ReactTestRenderer;

  beforeEach(async () => {
    handlers = {};
    await act(async () => {
      tree = renderer.create(
        <AppProvider>
          <Held />
        </AppProvider>
      );
    });
  });

  afterEach(async () => {
    await act(async () => tree.unmount());
  });

  it('keeps both snapshots rather than the last one to arrive', async () => {
    await act(async () => {
      push(channelOf('chan_a'));
      push(channelOf('chan_b'), T0 + 1000);
    });
    expect(textOf(tree)).toContain('held:chan_a,chan_b');

    // And a further change in the second does not cost us the first, which is
    // the screen the person is actually looking at.
    await act(async () => push(channelOf('chan_b'), T0 + 2000));
    expect(textOf(tree)).toContain('held:chan_a,chan_b');
  });

  it('drops only the channel the server says is gone', async () => {
    await act(async () => {
      push(channelOf('chan_a'));
      push(channelOf('chan_b'));
    });
    await act(async () => handlers.onChannelGone?.('chan_b'));

    expect(textOf(tree)).toContain('held:chan_a');
    expect(textOf(tree)).toContain('gone:chan_b');
  });

  it('takes a channel back off the gone list if it sends a snapshot', async () => {
    await act(async () => handlers.onChannelGone?.('chan_a'));
    expect(textOf(tree)).toContain('gone:chan_a');

    await act(async () => push(channelOf('chan_a')));
    expect(textOf(tree)).toContain('held:chan_a gone:');
  });
});
