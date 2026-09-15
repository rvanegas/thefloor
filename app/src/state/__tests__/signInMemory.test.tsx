import React from 'react';
import { Text } from 'react-native';
import renderer, { act, type ReactTestRenderer } from 'react-test-renderer';
import type { RealtimeHandlers } from '../../api/socket';
import { AppProvider, useApp } from '../AppProvider';

/**
 * What this install remembers about who has signed in on it.
 *
 * One address, the most recent, kept so the sign-in screen can tell somebody
 * signing up from somebody coming back — which nothing else can tell it. The
 * server deliberately cannot: `/auth/request-code` answers the same whether or
 * not an address has an account, so that sign-in cannot be used to ask which
 * addresses exist. See `LAST_IDENTIFIER_KEY` in AppProvider.tsx.
 *
 * The three cases below are the three the guess has to get right; the fourth,
 * a second device, has no record at all and is covered by the sign-in screen's
 * own tests, where the box simply appears.
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
    requestCode: jest.fn(async () => {}),
    verify: jest.fn(async () => ({
      token: 'fresh-token',
      account: { id: 'acct_me', displayName: 'Anna' },
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

describe('the address this install last signed in as', () => {
  beforeEach(() => {
    handlers = {};
    // No token: this is the signed-out install the sign-in screen is drawn on.
    mockStored = {};
    latest = null;
  });

  afterEach(async () => {
    await act(async () => {
      mounted?.unmount();
    });
    mounted = null;
  });

  it('is nobody on a fresh install, so everybody is new', async () => {
    await mount();
    expect(latest!.signedInHere('anna.k@example.com')).toBe(false);
  });

  it('is remembered when a sign-in succeeds', async () => {
    await mount();
    await act(async () => {
      await latest!.verify('anna.k@example.com', '123456');
    });
    expect(mockStored['thefloor.lastIdentifier']).toBe('anna.k@example.com');
    expect(latest!.signedInHere('anna.k@example.com')).toBe(true);
  });

  /**
   * Matched the way the server matches, which looks up `COLLATE NOCASE`. A
   * stricter comparison here would re-ask somebody who typed their own address
   * with a capital letter this time.
   */
  it('recognises the same address typed differently', async () => {
    await mount();
    await act(async () => {
      await latest!.verify(' anna.k@example.com ', '123456');
    });
    expect(latest!.signedInHere('Anna.K@Example.com')).toBe(true);
  });

  /**
   * The case one address buys over a bare "somebody has signed in here" flag:
   * a handset that has held another account is a new person's handset too.
   */
  it('does not recognise anybody else', async () => {
    mockStored['thefloor.lastIdentifier'] = 'somebody.else@example.com';
    await mount();
    expect(latest!.signedInHere('anna.k@example.com')).toBe(false);
    expect(latest!.signedInHere('somebody.else@example.com')).toBe(true);
  });

  /** Signing out is not becoming somebody else. */
  it('survives signing out', async () => {
    await mount();
    await act(async () => {
      await latest!.verify('anna.k@example.com', '123456');
    });
    await act(async () => {
      await latest!.signOut();
    });
    expect(mockStored['thefloor.lastIdentifier']).toBe('anna.k@example.com');
    expect(latest!.signedInHere('anna.k@example.com')).toBe(true);
  });
});
