import React from 'react';
import { Text } from 'react-native';
import renderer, { act, type ReactTestRenderer } from 'react-test-renderer';
import type { RealtimeHandlers } from '../../api/socket';
import { AppProvider, useApp } from '../AppProvider';

/**
 * Which settings belong to the person and which belong to the phone.
 *
 * The scheme and the tap follow the account: the server states them, every
 * device this account holds is told, and this one applies what it is told.
 * `steadyHeadset` does not, and the last case here is what keeps that true —
 * it is about the headset in somebody's ears, and the phone is where the
 * headset is.
 *
 * The gap these are really about is the cold start. A launch has to draw
 * something before the socket has said hello, so the provider keeps this
 * device's copy of the last thing the server said and paints from that. It is
 * a cache, which means the two things worth asserting are that the server
 * overwrites it and that signing out empties it.
 */

let handlers: RealtimeHandlers = {};
let mockStored: Record<string, string> = {};
const mockSaved: Array<Record<string, unknown>> = [];

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
    signOut: jest.fn(async () => {}),
    saveSettings: jest.fn(async (_token: string, changes: Record<string, unknown>) => {
      mockSaved.push(changes);
      return { appearance: 'system', tapToStepIn: true };
    }),
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

function Settings() {
  const app = useApp();
  latest = app;
  return (
    <Text>
      {app.appearance}/{app.tapToStepIn ? 'tap' : 'open'}/
      {app.steadyHeadset ? 'steady' : 'switching'}
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

/** What the socket does on connecting, with whatever the server holds. */
function hello(settings: {
  appearance: 'light' | 'dark' | 'system';
  tapToStepIn: boolean;
} | null): void {
  handlers.onHello?.(
    { id: 'acct_me', displayName: 'Me' },
    false,
    false,
    settings
  );
}

/**
 * Rendered and remembered, so `afterEach` can take it down again.
 *
 * Unmounting is not tidiness here. The provider keeps timers and writes to the
 * keychain as it goes, and a tree left standing goes on doing both after Jest
 * has torn the environment down — which surfaces as a `ReferenceError` about
 * importing a file too late, attributed to whichever test happened to be last.
 */
let mounted: ReactTestRenderer | null = null;

async function mount(): Promise<ReactTestRenderer> {
  await act(async () => {
    mounted = renderer.create(
      <AppProvider>
        <Settings />
      </AppProvider>
    );
  });
  return mounted!;
}

describe('the settings that follow the account', () => {
  beforeEach(() => {
    handlers = {};
    mockSaved.length = 0;
    mockStored = { 'thefloor.token': 'stored-token' };
    latest = null;
  });

  afterEach(async () => {
    await act(async () => {
      mounted?.unmount();
    });
    mounted = null;
  });

  it('takes what the server says over what this device had cached', async () => {
    mockStored['thefloor.appearance'] = 'light';
    mockStored['thefloor.tapToStepIn'] = 'true';
    const tree = await mount();
    // The cache first, which is the whole of what a cold start has.
    expect(textOf(tree)).toContain('light/tap');

    await act(async () => hello({ appearance: 'dark', tapToStepIn: false }));
    expect(textOf(tree)).toContain('dark/open');
    // And written through, so the next cold start starts from the right one.
    expect(mockStored['thefloor.appearance']).toBe('dark');
    expect(mockStored['thefloor.tapToStepIn']).toBe('false');
  });

  /**
   * A server that predates the field has said nothing about the account's
   * preferences, which is not the same as saying it holds the defaults.
   */
  it('keeps the cached answer when the server says nothing', async () => {
    mockStored['thefloor.appearance'] = 'dark';
    const tree = await mount();
    await act(async () => hello(null));
    expect(textOf(tree)).toContain('dark/');
  });

  it('follows a change made on another device', async () => {
    const tree = await mount();
    await act(async () => hello({ appearance: 'system', tapToStepIn: true }));
    await act(async () =>
      handlers.onSettings?.({ appearance: 'light', tapToStepIn: false })
    );
    expect(textOf(tree)).toContain('light/open');
  });

  /**
   * Applied on the tap and sent afterwards, and the tap is what the screen
   * shows. Partial, so saving the scheme cannot reset the tap on the way past.
   */
  it('applies a choice at once and tells the server which one changed', async () => {
    const tree = await mount();
    await act(async () => hello({ appearance: 'system', tapToStepIn: true }));

    await act(async () => latest!.setAppearance('dark'));
    expect(textOf(tree)).toContain('dark/tap');
    expect(mockSaved).toEqual([{ appearance: 'dark' }]);

    await act(async () => latest!.setTapToStepIn(false));
    expect(textOf(tree)).toContain('dark/open');
    expect(mockSaved).toEqual([{ appearance: 'dark' }, { tapToStepIn: false }]);
  });

  /**
   * They belong to the account, so they go with it. Keeping them would paint
   * the sign-in screen in the last person's scheme and hand their tap to
   * whoever signs in next, for as long as it takes the next hello to arrive.
   */
  it('forgets them at sign-out, and leaves the headset alone', async () => {
    const tree = await mount();
    await act(async () => hello({ appearance: 'dark', tapToStepIn: false }));
    await act(async () => latest!.setSteadyHeadset(true));

    await act(async () => {
      await latest!.signOut();
    });
    expect(textOf(tree)).toContain('system/tap/steady');
    expect(mockStored['thefloor.appearance']).toBeUndefined();
    expect(mockStored['thefloor.tapToStepIn']).toBeUndefined();
    // The phone still has the same headset in front of it as it did a moment
    // ago, and nobody has said otherwise.
    expect(mockStored['thefloor.steadyHeadset']).toBe('true');
  });

  it('never sends the headset setting to the server', async () => {
    await mount();
    await act(async () => hello({ appearance: 'system', tapToStepIn: true }));
    await act(async () => latest!.setSteadyHeadset(true));
    expect(mockSaved).toEqual([]);
  });
});
