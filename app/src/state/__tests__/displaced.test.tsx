import React from 'react';
import { Text } from 'react-native';
import renderer, { act, type ReactTestRenderer } from 'react-test-renderer';
import { createChannel, reduce } from '../../../../core/channel';
import type { ChannelState } from '../../../../core/types';
import type { RealtimeHandlers } from '../../api/socket';
import { AppProvider, useApp } from '../AppProvider';
import { liveChannelView } from '../live';

/**
 * What the provider does when another of this account's devices takes the
 * room.
 *
 * The case that needs a flag at all is the *same* channel on two devices.
 * When the other device went somewhere else the server steps this account out
 * and the snapshot says so by itself; when it stepped into the channel this
 * device is already in, the account is present either way, nothing about the
 * channel changes, and no snapshot anybody could push says a word. So the
 * server sends `displaced`, and this is what the app does with it.
 *
 * Not a screen and not an error: the channel stays open and stays watched,
 * and what changes is that this device stops counting itself as standing in
 * it — which is what the audio follows. See App.tsx.
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
    act(channelId: string, action: { type: string }) {
      acted.push({ channelId, action });
    }
    disconnect() {}
  },
}));

/** A channel this person is standing in, as a snapshot would report it. */
function present(id: string): ChannelState {
  let channel = createChannel({ id, initiator: ME, invitees: [THEM], now: T0 });
  channel = reduce(channel, { type: 'ENTER', userId: THEM }, T0);
  return reduce(channel, { type: 'ENTER', userId: ME }, T0);
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

/**
 * The two facts App.tsx combines into `live`: where the snapshots say this
 * person is standing, and whether this device is the one standing there.
 */
let latest: ReturnType<typeof useApp> | null = null;

function Standing() {
  const app = useApp();
  // Held so a test can do what a button does. Reassigned on every render, so
  // it is never a stale closure over an earlier state.
  latest = app;
  const view = liveChannelView(app.channelViews, ME);
  const live = view && !app.displaced ? view.channel.id : 'nowhere';
  return (
    <Text>
      roster:{view?.channel.id ?? 'nowhere'} live:{live}
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

describe('another device takes the room', () => {
  let tree!: ReactTestRenderer;

  beforeEach(async () => {
    handlers = {};
    acted.length = 0;
    await act(async () => {
      tree = renderer.create(
        <AppProvider>
          <Standing />
        </AppProvider>
      );
    });
  });

  afterEach(async () => {
    await act(async () => tree.unmount());
  });

  it('stops standing here while the roster goes on saying otherwise', async () => {
    await act(async () => push(present('chan_a')));
    expect(textOf(tree)).toContain('roster:chan_a live:chan_a');

    await act(async () => handlers.onDisplaced?.());

    // Both halves. The roster is right — this person *is* in the channel, on
    // the phone in their hand — and so is this device, which is not the one
    // they are in it on.
    expect(textOf(tree)).toContain('roster:chan_a live:nowhere');
  });

  it('keeps the snapshot, because the screen has to stay open', async () => {
    await act(async () => push(present('chan_a')));
    await act(async () => handlers.onDisplaced?.());

    // A channel that is gone is a different message with a different handler.
    // This one leaves the screen showing the channel and offering a way in.
    expect(textOf(tree)).toContain('roster:chan_a');
  });

  /**
   * Taking the room back, which is the same gesture that took it away on the
   * other device. Ahead of the server deliberately: in the same-channel case
   * there is no snapshot coming that would confirm it, since nothing about
   * the channel changed.
   */
  it('is undone by stepping in from this device', async () => {
    await act(async () => push(present('chan_a')));
    await act(async () => handlers.onDisplaced?.());
    expect(textOf(tree)).toContain('live:nowhere');

    await act(async () => latest!.act('chan_a', { type: 'ENTER' }));

    expect(textOf(tree)).toContain('live:chan_a');
    expect(acted).toContainEqual({
      channelId: 'chan_a',
      action: { type: 'ENTER' },
    });
  });

  /** Any other action is somebody using the screen, not arriving on it. */
  it('is not undone by some other action', async () => {
    await act(async () => push(present('chan_a')));
    await act(async () => handlers.onDisplaced?.());

    await act(async () => latest!.act('chan_a', { type: 'CLAIM_FLOOR' }));

    expect(textOf(tree)).toContain('live:nowhere');
  });

  it('survives a fresh snapshot, which says nothing about which device', async () => {
    await act(async () => push(present('chan_a')));
    await act(async () => handlers.onDisplaced?.());

    // Somebody else speaks, and a snapshot lands. It carries this person as
    // present — they are — and must not be read as this device being back.
    await act(async () => push(present('chan_a'), T0 + 1000));

    expect(textOf(tree)).toContain('live:nowhere');
  });
});
