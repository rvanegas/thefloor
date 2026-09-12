import React from 'react';
import { Text } from 'react-native';
import renderer, { act, type ReactTestRenderer } from 'react-test-renderer';
import type { RealtimeHandlers } from '../../api/socket';
import { AppProvider, useApp } from '../AppProvider';

/**
 * Which settings belong to the person and which belong to the phone.
 *
 * The scheme, the tap and the control cards follow the account: the server
 * states them, every device this account holds is told, and this one applies
 * what it is told. **All of them do, since 2026-09-05.** There used to be one
 * that did not — `steadyHeadset`, about the headset in somebody's ears rather
 * than about the person — and two cases here guarded it: that signing out kept
 * it, and that it was never sent to the server. Both went with the setting.
 * If a phone-scoped setting is added back, they are the shape to restore.
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
      return {
        appearance: 'system',
        tapToLook: false,
        hideControlCards: false,
        tabsAtFoot: false,
        labs: false,
      };
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
      {app.appearance}/{app.tapToLook ? 'open' : 'tap'}/
      {app.hideControlCards ? 'bare' : 'cards'}/{app.labs ? 'labs' : 'plain'}/
      {app.tabsAtFoot ? 'foot' : 'top'}
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
  tapToLook: boolean;
  hideControlCards: boolean;
  tabsAtFoot: boolean;
  labs: boolean;
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
    mockStored['thefloor.tapToLook'] = 'false';
    mockStored['thefloor.hideControlCards'] = 'true';
    mockStored['thefloor.tabsAtFoot'] = 'true';
    // All of them read as "only 'true' turns it on", every one defaulting
    // off since 2026-09-07.
    mockStored['thefloor.labs'] = 'true';
    const tree = await mount();
    // The cache first, which is the whole of what a cold start has.
    expect(textOf(tree)).toContain('light/tap/bare/labs/foot');

    await act(async () =>
      hello({
        appearance: 'dark',
        tapToLook: true,
        hideControlCards: false,
        tabsAtFoot: false,
        labs: false,
      })
    );
    expect(textOf(tree)).toContain('dark/open/cards/plain/top');
    // And written through, so the next cold start starts from the right one.
    expect(mockStored['thefloor.appearance']).toBe('dark');
    expect(mockStored['thefloor.tapToLook']).toBe('true');
    expect(mockStored['thefloor.hideControlCards']).toBe('false');
    expect(mockStored['thefloor.tabsAtFoot']).toBe('false');
    expect(mockStored['thefloor.labs']).toBe('false');
  });

  /**
   * A phone upgrading into the build that renamed these has only the old keys
   * cached, holding the negation of what they hold now.
   *
   * The gap this covers is the second between a cold start and `hello`, and it
   * is the tap that makes it worth covering: read as absent, that second is
   * one in which a tap on Home walks somebody into a channel they meant only
   * to open. Delete this with the fallback it tests — see BACKLOG.md § *The
   * two renamed settings still answer to their old names on the wire*.
   */
  it('falls back to the cache an earlier build left under the old names', async () => {
    mockStored['thefloor.tapToStepIn'] = 'false';
    mockStored['thefloor.controlCards'] = 'false';
    const tree = await mount();
    expect(textOf(tree)).toContain('system/open/bare/plain');

    // And the old keys go the moment the server states anything, rather than
    // being kept in step with the new ones.
    await act(async () =>
      hello({
        appearance: 'system',
        tapToLook: true,
        hideControlCards: true,
        tabsAtFoot: true,
        labs: false,
      })
    );
    expect(mockStored['thefloor.tapToLook']).toBe('true');
    expect(mockStored['thefloor.tapToStepIn']).toBeUndefined();
    expect(mockStored['thefloor.controlCards']).toBeUndefined();
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
    await act(async () =>
      hello({
        appearance: 'system',
        tapToLook: false,
        hideControlCards: false,
        tabsAtFoot: false,
        labs: false,
      })
    );
    await act(async () =>
      handlers.onSettings?.({
        appearance: 'light',
        tapToLook: true,
        hideControlCards: true,
        tabsAtFoot: true,
        labs: true,
      })
    );
    expect(textOf(tree)).toContain('light/open/bare/labs');
  });

  /**
   * Applied on the tap and sent afterwards, and the tap is what the screen
   * shows. Partial, so saving the scheme cannot reset the tap on the way past.
   */
  it('applies a choice at once and tells the server which one changed', async () => {
    const tree = await mount();
    await act(async () =>
      hello({
        appearance: 'system',
        tapToLook: false,
        hideControlCards: false,
        tabsAtFoot: false,
        labs: false,
      })
    );

    await act(async () => latest!.setAppearance('dark'));
    expect(textOf(tree)).toContain('dark/tap');
    expect(mockSaved).toEqual([{ appearance: 'dark' }]);

    await act(async () => latest!.setTapToLook(true));
    expect(textOf(tree)).toContain('dark/open');
    expect(mockSaved).toEqual([{ appearance: 'dark' }, { tapToLook: true }]);

    await act(async () => latest!.setHideControlCards(true));
    expect(textOf(tree)).toContain('dark/open/bare');
    expect(mockSaved).toEqual([
      { appearance: 'dark' },
      { tapToLook: true },
      { hideControlCards: true },
    ]);

    await act(async () => latest!.setLabs(true));
    expect(textOf(tree)).toContain('dark/open/bare/labs');
    expect(mockSaved).toEqual([
      { appearance: 'dark' },
      { tapToLook: true },
      { hideControlCards: true },
      { labs: true },
    ]);

    await act(async () => latest!.setTabsAtFoot(true));
    expect(textOf(tree)).toContain('dark/open/bare/labs/foot');
    expect(mockSaved).toEqual([
      { appearance: 'dark' },
      { tapToLook: true },
      { hideControlCards: true },
      { labs: true },
      { tabsAtFoot: true },
    ]);
  });

  /**
   * They belong to the account, so they go with it. Keeping them would paint
   * the sign-in screen in the last person's scheme and hand their tap to
   * whoever signs in next, for as long as it takes the next hello to arrive.
   */
  it('forgets them at sign-out, and leaves the headset alone', async () => {
    const tree = await mount();
    await act(async () =>
      hello({
        appearance: 'dark',
        tapToLook: true,
        hideControlCards: true,
        tabsAtFoot: true,
        labs: true,
      })
    );
    await act(async () => {
      await latest!.signOut();
    });
    expect(textOf(tree)).toContain('system/tap/cards/plain');
    expect(mockStored['thefloor.appearance']).toBeUndefined();
    expect(mockStored['thefloor.tapToLook']).toBeUndefined();
    expect(mockStored['thefloor.hideControlCards']).toBeUndefined();
    expect(mockStored['thefloor.labs']).toBeUndefined();
  });
});
