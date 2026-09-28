import React from 'react';
import { Text } from 'react-native';
import renderer, { act, type ReactTestRenderer } from 'react-test-renderer';
import { createChannel, reduce } from '../../../../core/channel';
import { DEFAULT_NOTIFICATION_LEVEL } from '../../../../core/notifications';
import type { ChannelState } from '../../../../core/types';
import type { GuestView } from '../../../../core/protocol';
import type { RealtimeHandlers } from '../../api/socket';
import { AppProvider, useApp } from '../AppProvider';

/**
 * What the provider does when a seat ends *upwards*.
 *
 * A member asks the account behind a seat into the channel, so the seat closes
 * and the person is a member of the room they were already sitting in —
 * `Channels.closeSeatFor`, reached from `INVITE`. The socket says so by
 * answering the same watch with a `channel` where it was answering with a
 * `seat`, and by nothing else: no channel is gone, so `onChannelGone` never
 * fires and the seat's snapshot would otherwise be left where it was.
 *
 * Two things follow from holding both, and both were visible on a phone: the
 * audio went on running against the seat's credential, because `App.tsx` reads
 * the seat whenever no membership is live and a new member is present nowhere;
 * and the channel screen said *out* while the room could still be heard. See
 * `onChannel`.
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
      // The real client records the standing inside itself and reports it
      // back, which is the half the provider mirrors. See `Realtime.act`.
      if (action.type === 'ENTER') this.handlers.onStanding?.(channelId);
    }
    actAsSeat(channelId: string, action: { type: string }) {
      acted.push({ channelId, action });
    }
    disconnect() {}
  },
}));

/** The room as a member's snapshot reports it: ME belongs, and is not in it. */
function asMember(id: string): ChannelState {
  const channel = createChannel({
    id,
    initiator: THEM,
    invitees: [ME],
    now: T0,
  });
  return reduce(channel, { type: 'ENTER', userId: THEM }, T0);
}

function pushChannel(channel: ChannelState): void {
  handlers.onChannel?.({
    channel,
    participants: [
      { id: ME, displayName: 'Me' },
      { id: THEM, displayName: 'Dana' },
    ],
    recordings: [],
    pingableAt: {},
    notificationLevel: DEFAULT_NOTIFICATION_LEVEL,
    serverNow: T0,
  });
}

/** The seat's own snapshot, which is what says this device is sitting in one. */
function pushSeat(channelId: string, mic: GuestView['you']['mic']): void {
  handlers.onSeat?.({
    channelId,
    channelName: 'Golf',
    you: {
      id: 'guest_1',
      name: 'Rodrigo',
      mic,
      silenced: false,
      accountId: ME,
      canAsk: true,
      publishConsent: false,
    },
    others: [],
    asks: [],
    invites: [],
    recording: false,
    clip: null,
    serverNow: T0,
  });
}

let latest: ReturnType<typeof useApp> | null = null;

function Watching() {
  const app = useApp();
  latest = app;
  return (
    <Text>
      seats:{Object.keys(app.seatViews).join(',') || 'none'} standing:
      {app.standingIn ?? 'nowhere'}
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

describe('a seat that ends upwards', () => {
  let tree!: ReactTestRenderer;

  beforeEach(async () => {
    handlers = {};
    acted.length = 0;
    latest = null;
    await act(async () => {
      tree = renderer.create(
        <AppProvider>
          <Watching />
        </AppProvider>
      );
    });
    await act(async () => pushSeat('chan_a', 'listening'));
    acted.length = 0;
  });

  afterEach(async () => {
    await act(async () => tree.unmount());
  });

  it('drops the seat when the same channel arrives as a membership', async () => {
    expect(textOf(tree)).toContain('seats:chan_a');

    await act(async () => pushChannel(asMember('chan_a')));

    // Holding both is the disagreement `pushChannel` answers one or the other
    // to prevent, and it is what left the audio on the seat's credential.
    expect(textOf(tree)).toContain('seats:none');
    expect(latest!.channelViews['chan_a']).toBeTruthy();
  });

  it('takes the standing the seat had, so the room does not change underneath', async () => {
    await act(async () => pushChannel(asMember('chan_a')));

    expect(acted.map((a) => a.action.type)).toContain('ENTER');
    expect(textOf(tree)).toContain('standing:chan_a');
  });

  it('steps in self-muted when the room could not hear them', async () => {
    await act(async () => pushChannel(asMember('chan_a')));

    // `INVITE` clears `selfMuted` for the invitee, so a guest who was merely
    // listening would otherwise be made audible by somebody else's act.
    expect(acted).toContainEqual({
      channelId: 'chan_a',
      action: { type: 'SET_SELF_MUTE', muted: true },
    });
  });

  it('leaves the microphone alone for a guest who was holding one', async () => {
    await act(async () => pushSeat('chan_a', 'open'));
    acted.length = 0;

    await act(async () => pushChannel(asMember('chan_a')));

    expect(acted.map((a) => a.action.type)).toEqual(['ENTER']);
  });

  it('does nothing of the kind for an ordinary snapshot', async () => {
    await act(async () => pushChannel(asMember('chan_b')));

    expect(acted).toEqual([]);
    expect(textOf(tree)).toContain('seats:chan_a');
  });

  it('enters once however many snapshots follow', async () => {
    await act(async () => {
      pushChannel(asMember('chan_a'));
      pushChannel(asMember('chan_a'));
    });

    expect(acted.filter((a) => a.action.type === 'ENTER')).toHaveLength(1);
  });
});
