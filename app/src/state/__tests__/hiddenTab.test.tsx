import React from 'react';
import { Platform, AppState } from 'react-native';
import renderer, { act, type ReactTestRenderer } from 'react-test-renderer';
import { createChannel, reduce } from '../../../../core/channel';
import { DEFAULT_NOTIFICATION_LEVEL } from '../../../../core/notifications';
import type { ChannelState } from '../../../../core/types';
import type { RealtimeHandlers } from '../../api/socket';
import { AppProvider, useApp } from '../AppProvider';

/**
 * The provider putting the socket down when the tab goes hidden.
 *
 * `Realtime.suspend` carries why this exists at all — Chrome parks a hidden
 * tab's timers and the server sweeps the connection every twenty seconds.
 * What is under test here is the half that decides *whether*: the web only,
 * because iOS suspends a backgrounded process by itself; and only when this
 * device is not standing in a room, which is where audio is live in one
 * direction or the other and where a phone is kept alive by the audio
 * background mode.
 *
 * `Platform.OS` is written to rather than mocked, this suite running under
 * the native platform — see `configWeb.test.ts`, which has the same problem
 * from the other end.
 */

const ME = 'acct_me';
const THEM = 'acct_them';
const T0 = 1_700_000_000_000;

let handlers: RealtimeHandlers = {};
// `mock`-prefixed so the module factory below may reach it, which is jest's
// rule rather than a preference.
const mockSuspend = jest.fn();

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
    attentive() {
      return true;
    }
    speaking() {
      return true;
    }
    resume() {}
    suspend() {
      mockSuspend();
    }
    standIn(channelId: string) {
      this.handlers.onStanding?.(channelId);
    }
    act(channelId: string, action: { type: string }) {
      if (action.type === 'ENTER') this.handlers.onStanding?.(channelId);
      if (action.type === 'STEP_OUT') this.handlers.onStanding?.(null);
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
    pingableAt: {},
    notificationLevel: DEFAULT_NOTIFICATION_LEVEL,
    serverNow: T0,
  });
}

let latest: ReturnType<typeof useApp> | null = null;

function Probe() {
  latest = useApp();
  return null;
}

/**
 * Every `AppState` listener the provider holds, since several effects watch
 * the same transition and only one of them is this one. They are all fired,
 * which is what the platform does.
 */
const listeners: Array<(next: string) => void> = [];
const realOS = Platform.OS;

/**
 * The tab going hidden, which react-native-web reports as this transition.
 *
 * **`Platform.OS` is flipped here rather than at mount**, because `storage`
 * switches on it too: a provider mounted as the web reads `localStorage`,
 * which jest does not have, finds no token and never connects — so the whole
 * suite would be asserting against a signed-out app.
 */
function background(os = 'web'): void {
  (Platform as { OS: string }).OS = os;
  for (const listener of listeners) listener('background');
}

describe('a hidden tab', () => {
  let tree!: ReactTestRenderer;

  beforeEach(async () => {
    handlers = {};
    mockSuspend.mockClear();
    listeners.length = 0;
    jest
      .spyOn(AppState, 'addEventListener')
      .mockImplementation(((_type: string, handler: (next: string) => void) => {
        listeners.push(handler);
        return { remove: () => {} };
      }) as unknown as typeof AppState.addEventListener);
    await act(async () => {
      tree = renderer.create(
        <AppProvider>
          <Probe />
        </AppProvider>
      );
    });
  });

  afterEach(async () => {
    await act(async () => tree.unmount());
    (Platform as { OS: string }).OS = realOS;
    jest.restoreAllMocks();
  });

  it('puts the socket down when nothing is holding audio', async () => {
    await act(async () => push(present('chan_a')));

    await act(async () => background());

    expect(mockSuspend).toHaveBeenCalled();
  });

  it('keeps it while this device is standing in a room', async () => {
    // The room is the whole exemption: a member stepped in is publishing, and
    // a browser that dropped its socket here would leave the conversation.
    await act(async () => push(present('chan_a')));
    await act(async () => void latest!.act('chan_a', { type: 'ENTER' }));

    await act(async () => background());

    expect(mockSuspend).not.toHaveBeenCalled();
  });

  it('puts it down again once the person steps out', async () => {
    await act(async () => push(present('chan_a')));
    await act(async () => void latest!.act('chan_a', { type: 'ENTER' }));
    await act(async () => void latest!.act('chan_a', { type: 'STEP_OUT' }));

    await act(async () => background());

    expect(mockSuspend).toHaveBeenCalled();
  });

  it('says nothing to a phone, which iOS suspends by itself', async () => {
    await act(async () => push(present('chan_a')));

    await act(async () => background('ios'));

    expect(mockSuspend).not.toHaveBeenCalled();
  });
});
