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
    startChannel: jest.fn(async () => ({ channelId: 'chan_new' })),
  },
}));

/**
 * Enough of `Realtime` to carry the one thing these tests are about: which
 * channel this device is standing in. The real class keeps it as
 * `enteredChannel` and reports every move through `onStanding`, so the fake
 * has to do the same or the provider would never hear the fact under test.
 */
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
    standIn(channelId: string) {
      this.handlers.onStanding?.(channelId);
    }
    act(channelId: string, action: { type: string }) {
      acted.push({ channelId, action });
      if (action.type === 'ENTER') this.handlers.onStanding?.(channelId);
      if (action.type === 'STEP_OUT' || action.type === 'LEAVE_CHANNEL') {
        this.handlers.onStanding?.(null);
      }
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
  // App.tsx's own test, rather than a paraphrase of it: where the account is
  // present, narrowed to the channel this device is the one standing in.
  const live =
    view && view.channel.id === app.standingIn ? view.channel.id : 'nowhere';
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

/**
 * What the real socket does on a `displaced` message, in the order it does it.
 *
 * Two calls rather than one, because they are two facts: the standing record
 * is cleared inside `Realtime` — that is the half a reconnect reads, so it
 * cannot wait for React — and `onDisplaced` is the announcement. A test that
 * fired only the second would be asserting against a client that does not
 * exist.
 */
function displace(): void {
  handlers.onStanding?.(null);
  handlers.onDisplaced?.();
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
    // Standing here to begin with, which every case below starts from and
    // which nothing but entering can establish. A snapshot cannot: it reports
    // the account, and the account is present whichever device holds it.
    await act(async () => push(present('chan_a')));
    await act(async () => latest!.act('chan_a', { type: 'ENTER' }));
    acted.length = 0;
  });

  afterEach(async () => {
    await act(async () => tree.unmount());
  });

  it('stops standing here while the roster goes on saying otherwise', async () => {
    expect(textOf(tree)).toContain('roster:chan_a live:chan_a');

    await act(async () => displace());

    // Both halves. The roster is right — this person *is* in the channel, on
    // the phone in their hand — and so is this device, which is not the one
    // they are in it on.
    expect(textOf(tree)).toContain('roster:chan_a live:nowhere');
  });

  it('keeps the snapshot, because the screen has to stay open', async () => {
    await act(async () => displace());

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
    await act(async () => displace());
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
    await act(async () => displace());

    await act(async () => latest!.act('chan_a', { type: 'CLAIM_FLOOR' }));

    expect(textOf(tree)).toContain('live:nowhere');
  });

  it('survives a fresh snapshot, which says nothing about which device', async () => {
    await act(async () => displace());

    // Somebody else speaks, and a snapshot lands. It carries this person as
    // present — they are — and must not be read as this device being back.
    await act(async () => push(present('chan_a'), T0 + 1000));

    expect(textOf(tree)).toContain('live:nowhere');
  });

  /** Stepping out here gives the room up rather than handing it anywhere. */
  it('stops standing here when this device steps out', async () => {
    await act(async () => latest!.act('chan_a', { type: 'STEP_OUT' }));

    expect(textOf(tree)).toContain('live:nowhere');
  });
});

/**
 * **The case that had no message and so was never noticed**, and the one this
 * whole distinction exists for.
 *
 * Every test above starts from a `displaced` message, which the server sends
 * only when another session *acts*. A device that merely opens a channel the
 * account is already in is told nothing — there is nothing to tell, since the
 * channel did not change — and it used to read the roster, conclude it was
 * standing there, draw a Step Out button and connect the audio. The media
 * plane admits one participant per account, so the two devices then took the
 * room from each other in turn.
 *
 * No `displaced` is fired anywhere here, deliberately. The point is that the
 * second device gets this right with nothing said to it at all.
 */
describe('a second device that only opens the channel', () => {
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

  it('is not standing there, whatever the roster says', async () => {
    await act(async () => push(present('chan_a')));

    // The roster is right and so is this device: the account is in the
    // channel, and this copy of the app is not the one holding it.
    expect(textOf(tree)).toContain('roster:chan_a live:nowhere');
  });

  it('takes the room by stepping in, which is the whole gesture', async () => {
    await act(async () => push(present('chan_a')));
    await act(async () => latest!.act('chan_a', { type: 'ENTER' }));

    expect(textOf(tree)).toContain('live:chan_a');
    expect(acted).toContainEqual({
      channelId: 'chan_a',
      action: { type: 'ENTER' },
    });
  });

  /**
   * Snapshots keep arriving while the other device talks, and not one of them
   * is evidence about which device is holding the room.
   */
  it('stays out through every snapshot that follows', async () => {
    await act(async () => push(present('chan_a')));
    await act(async () => push(present('chan_a'), T0 + 1000));
    await act(async () => push(present('chan_a'), T0 + 2000));

    expect(textOf(tree)).toContain('live:nowhere');
  });
});

/**
 * Creating a channel is entering it — `createChannel` puts the initiator in
 * `present` the moment it exists — so it is the one route in that sends no
 * ENTER, and the one the standing record has to be told about by hand.
 * Without that the creator would be offered a way into their own new channel.
 */
describe('a channel this device started', () => {
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

  it('is one this device is standing in, without an ENTER', async () => {
    await act(async () => {
      await latest!.startChannel([THEM]);
    });
    await act(async () => push(present('chan_new')));

    expect(textOf(tree)).toContain('live:chan_new');
    // Nothing was dispatched: the server had it present already.
    expect(acted).toHaveLength(0);
  });
});
