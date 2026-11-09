import React from 'react';
import { Text } from 'react-native';
import renderer, { act, type ReactTestRenderer } from 'react-test-renderer';
import type { RealtimeHandlers } from '../../api/socket';
import { AppProvider, useApp } from '../AppProvider';
import { api } from '../../api/http';
import * as WebBrowser from 'expo-web-browser';

/**
 * What this install remembers about signing in, since sign-in moved to
 * dianoia-auth (2026-11-09).
 *
 * - **No address.** The one the old screen kept for its opt-in is deleted at
 *   start: nothing reads it, and it identified a person. See
 *   `LAST_IDENTIFIER_KEY` in AppProvider.tsx.
 * - **Whether somebody signed out here**, so that the next sign-in asks
 *   dianoia-auth for the code whatever its session in the browser.
 * - **The ticket a sign-in came back with**, traded for the session; a new
 *   account is welcomed, and a declined one is nothing.
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
    startSignIn: jest.fn(async () => ({ url: 'https://auth.example/authorize?state=s' })),
    redeemTicket: jest.fn(async () => ({
      token: 'fresh-token',
      account: { id: 'acct_me', displayName: 'Anna' },
      created: true,
    })),
    signOut: jest.fn(async () => {}),
    saveSettings: jest.fn(async () => ({
      appearance: 'system',
      tapToLook: false,
      hideControlCards: false,
      labs: false,
      chimeAmplitude: 0.18,
      marketingEmail: false,
    })),
  },
}));

const mockSheet = { result: { type: 'success', url: 'thefloor://auth?ticket=t1' } as { type: string; url?: string } };
jest.mock('expo-web-browser', () => ({
  openAuthSessionAsync: jest.fn(async () => mockSheet.result),
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

function Probe() {
  latest = useApp();
  return <Text>probe</Text>;
}

let mounted: ReactTestRenderer | null = null;

/** Unmounted in `afterEach` for the reason settings.test.tsx sets out. */
async function mount(): Promise<void> {
  await act(async () => {
    mounted = renderer.create(
      <AppProvider>
        <Probe />
      </AppProvider>
    );
  });
}

describe('signing in, as this install remembers it', () => {
  beforeEach(() => {
    handlers = {};
    mockStored = {};
    latest = null;
    mockSheet.result = { type: 'success', url: 'thefloor://auth?ticket=t1' };
    jest.clearAllMocks();
  });

  afterEach(async () => {
    await act(async () => {
      mounted?.unmount();
    });
    mounted = null;
  });

  it('deletes the address old builds kept', async () => {
    mockStored['thefloor.lastIdentifier'] = 'anna.k@example.com';
    await mount();
    expect(mockStored['thefloor.lastIdentifier']).toBeUndefined();
  });

  it('signs in in the sheet, trades the ticket, and welcomes a new account', async () => {
    await mount();
    await act(async () => {
      await latest!.signIn();
    });
    expect(api.startSignIn).toHaveBeenCalledWith({ returnTo: 'app', prompt: undefined });
    expect(WebBrowser.openAuthSessionAsync).toHaveBeenCalledWith(
      'https://auth.example/authorize?state=s',
      'thefloor://auth'
    );
    expect(api.redeemTicket).toHaveBeenCalledWith('t1');
    expect(latest!.token).toBe('fresh-token');
    expect(latest!.welcoming).toBe(true);
    expect(mockStored['thefloor.token']).toBe('fresh-token');
  });

  it('asks for the code after somebody signed out here, and stops asking once signed in', async () => {
    await mount();
    await act(async () => {
      await latest!.signIn();
    });
    await act(async () => {
      await latest!.signOut();
    });
    await act(async () => {
      await latest!.signIn();
    });
    expect(api.startSignIn).toHaveBeenLastCalledWith({ returnTo: 'app', prompt: 'login' });
    expect(mockStored['thefloor.signedOut']).toBeUndefined();
  });

  it('is nothing when the sheet is closed or the sign-in declined, and says so when it fails', async () => {
    await mount();
    mockSheet.result = { type: 'cancel' };
    await act(async () => {
      await latest!.signIn();
    });
    mockSheet.result = { type: 'success', url: 'thefloor://auth?error=declined' };
    await act(async () => {
      await latest!.signIn();
    });
    expect(api.redeemTicket).not.toHaveBeenCalled();
    expect(latest!.token).toBeNull();
    mockSheet.result = { type: 'success', url: 'thefloor://auth?error=failed' };
    await expect(
      act(async () => {
        await latest!.signIn();
      })
    ).rejects.toThrow();
  });
});
