import React from 'react';
import { Text } from 'react-native';
import renderer, { act, type ReactTestRenderer } from 'react-test-renderer';
import type { RealtimeHandlers } from '../../api/socket';
import { api } from '../../api/http';
import { AppProvider, useApp } from '../AppProvider';

/**
 * Switching to another of the developer's own accounts from Floor Settings.
 *
 * The property worth pinning is the one that is not on the screen: that a
 * switch passes through signed out on its way, so whatever this install keeps
 * for one account — the introduction's keys here — is forgotten before the
 * other one is adopted, exactly as if somebody had signed out and back in.
 */

let handlers: RealtimeHandlers = {};
let mockStored: Record<string, string> = {};

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(async (key: string) => mockStored[key] ?? null),
  setItemAsync: jest.fn(async (key: string, value: string) => {
    mockStored[key] = value;
  }),
  deleteItemAsync: jest.fn(async (key: string) => {
    delete mockStored[key];
  }),
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
    switchAccount: jest.fn(async () => ({
      token: 'rtest1-token',
      account: { id: 'acct_rtest1', displayName: 'rtest1' },
    })),
    signOut: jest.fn(async () => {}),
    saveSettings: jest.fn(async () => ({})),
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

let latest: ReturnType<typeof useApp> | null = null;
let tokensSeen: Array<string | null> = [];

function Probe() {
  latest = useApp();
  if (tokensSeen[tokensSeen.length - 1] !== latest.token) {
    tokensSeen.push(latest.token);
  }
  return <Text>probe</Text>;
}

let mounted: ReactTestRenderer | null = null;

async function mount(): Promise<void> {
  await act(async () => {
    mounted = renderer.create(
      <AppProvider>
        <Probe />
      </AppProvider>
    );
  });
}

describe('switching account', () => {
  beforeEach(() => {
    handlers = {};
    mockStored = {
      'thefloor.token': 'me-token',
      'thefloor.intro.dismissed': '["contact"]',
    };
    latest = null;
    tokensSeen = [];
    jest.clearAllMocks();
  });

  afterEach(async () => {
    await act(async () => {
      mounted?.unmount();
    });
    mounted = null;
  });

  it('takes the list to offer from hello', async () => {
    await mount();
    act(() => {
      handlers.onHello?.(
        { id: 'acct_me', displayName: 'Me' },
        false,
        false,
        null,
        ['rtest1@example.co']
      );
    });
    expect(latest!.switchAccounts).toEqual(['rtest1@example.co']);
  });

  it('passes through signed out, then is the other account', async () => {
    await mount();
    expect(latest!.token).toBe('me-token');
    // From here: the cold start renders a null of its own before the restore.
    tokensSeen = ['me-token'];

    await act(async () => {
      await latest!.switchAccount('rtest1@example.co');
    });

    expect(api.switchAccount).toHaveBeenCalledWith(
      'me-token',
      'rtest1@example.co',
      undefined
    );
    expect(tokensSeen).toEqual(['me-token', null, 'rtest1-token']);
    expect(latest!.me?.id).toBe('acct_rtest1');
    expect(mockStored['thefloor.token']).toBe('rtest1-token');
    expect(mockStored['thefloor.lastIdentifier']).toBe('rtest1@example.co');
    // The account left took its checklist with it.
    expect(mockStored['thefloor.intro.dismissed']).toBeUndefined();
  });

  it('leaves the session alone when the server refuses', async () => {
    (api.switchAccount as jest.Mock).mockRejectedValueOnce(new Error('Not found.'));
    await mount();

    await act(async () => {
      await expect(
        latest!.switchAccount('someone@example.com')
      ).rejects.toThrow('Not found.');
    });

    expect(latest!.token).toBe('me-token');
    expect(mockStored['thefloor.token']).toBe('me-token');
  });
});
