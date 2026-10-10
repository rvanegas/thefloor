import React from 'react';
import { AppState, Text } from 'react-native';
import renderer, { act, type ReactTestRenderer } from 'react-test-renderer';
import type { RealtimeHandlers } from '../../api/socket';
import { AppProvider, useApp } from '../AppProvider';

/**
 * Being made a screen, and being made to stop.
 *
 * **A film shows on one device at a time**, which the server enforces by
 * telling every other instance of an account to stop the moment one of them
 * declares itself the screen. Both directions of that arrive here as the
 * same message, and what this file is really about is the half that used to
 * be missing: a device *asked* to show a film set its own role and told the
 * server nothing, so the server went on believing it was idle — the picker
 * offered it as free while it was playing, and the *Watch on* switch on the
 * device that had just handed the film over never learnt that it had landed.
 */

const T0 = 1_700_000_000_000;

let handlers: RealtimeHandlers = {};
/** Every `screens.showing` this provider has sent, in order. */
const reported: Array<string | null> = [];
/** Every `watch.channel` it has sent, in order. */
const watched: string[] = [];

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

/** Enough of `Realtime` to record the one report these tests are about. */
jest.mock('../../api/socket', () => ({
  Realtime: class {
    connect(_token: string, h: RealtimeHandlers) {
      handlers = h;
    }
    watchHome() {}
    watchChannel(channelId: string) {
      watched.push(channelId);
    }
    unwatchChannel() {}
    showingScreen(channelId: string | null) {
      reported.push(channelId);
    }
    // The foreground listeners this provider holds are not this file's
    // subject, but firing the one that is means firing all of them — so the
    // two they reach have to exist.
    resume() {}
    suspend() {}
    disconnect() {}
  },
}));

/**
 * Every `AppState` listener the provider is holding, since several effects
 * watch the same transition and only one of them is this file's business.
 * Fired together, which is what the platform does.
 */
const appStateListeners: Array<(next: string) => void> = [];

/**
 * Awaited rather than fired, because a foreground wakes more than the one
 * effect this file is about: the reconnect re-asks `/healthz`, whose answer
 * lands in state a microtask later. Leaving that outside `act` is a warning
 * per transition about a promise nothing here is waiting for.
 */
async function goes(next: 'active' | 'background'): Promise<void> {
  (AppState as unknown as { currentState: string }).currentState = next;
  await act(async () => {
    for (const listener of [...appStateListeners]) listener(next);
  });
}

let latest: ReturnType<typeof useApp> | null = null;

function Screen() {
  const app = useApp();
  latest = app;
  return (
    <Text>
      screen:{app.screenFor ?? 'nowhere'}
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

let tree: ReactTestRenderer | null = null;

async function open(): Promise<ReactTestRenderer> {
  await act(async () => {
    tree = renderer.create(
      <AppProvider>
        <Screen />
      </AppProvider>
    );
  });
  return tree!;
}

beforeEach(() => {
  handlers = {};
  reported.length = 0;
  watched.length = 0;
  appStateListeners.length = 0;
  latest = null;
  (AppState as unknown as { currentState: string }).currentState = 'active';
  jest
    .spyOn(AppState, 'addEventListener')
    .mockImplementation(((_event: string, handler: (next: string) => void) => {
      appStateListeners.push(handler);
      return {
        remove: () => {
          const at = appStateListeners.indexOf(handler);
          if (at !== -1) appStateListeners.splice(at, 1);
        },
      };
    }) as unknown as typeof AppState.addEventListener);
  jest.useFakeTimers({ now: T0, doNotFake: ['nextTick'] });
});

afterEach(() => {
  act(() => {
    tree?.unmount();
  });
  tree = null;
  jest.useRealTimers();
});

describe('being handed a film', () => {
  it('takes the role and tells the server it has', async () => {
    const shown = await open();
    act(() => handlers.onScreenAsked?.('sess_1'));

    expect(textOf(shown)).toContain('screen:sess_1');
    // The half that was missing. Without it the server counts this device as
    // idle while it plays a film, which is a picker offering a television
    // that is already busy and a switch elsewhere showing no answer.
    expect(reported).toEqual(['sess_1']);
  });

  /**
   * **What the roster's *watching* line is worth**, which is the whole reason
   * this transition is reported at all. A member's card says *watching* while
   * the server holds a `screening` for them — see `ChannelView.watching` — and
   * the person a host is looking for is exactly the one whose phone is in
   * their pocket. iOS suspends a backgrounded WebView, so the film has
   * genuinely stopped; a card still saying *watching* would be a wrong answer
   * to the one question the line was added to answer.
   */
  it('stops telling the room it has the film up while the app is away', async () => {
    const shown = await open();
    act(() => handlers.onScreenAsked?.('sess_1'));
    reported.length = 0;

    await goes('background');
    expect(reported).toEqual([null]);
    // **And the role is untouched**, which is what keeps the retraction
    // cheap: the picture stays mounted, and the return restates a belief this
    // device still holds rather than reclaiming a film from wherever it went.
    expect(textOf(shown)).toContain('screen:sess_1');

    await goes('active');
    expect(reported).toEqual([null, 'sess_1']);
  });

  /**
   * **The same claim, taken while the app is already away**, which the
   * retraction above used to miss entirely: a listener hears a *change*, and
   * there is no change to hear when the role arrives after the backgrounding.
   *
   * It is the ordinary way for it to happen rather than a corner. Somebody
   * else pastes a link, the arriving snapshot makes the default-screen effect
   * in `ChannelView` take the role without asking where the app is, and a
   * stepped-in phone is still running because the call keeps it alive — so the
   * room read *watching* at a pocket for the length of the film.
   */
  it('stops telling the room when the role arrives while it is already away', async () => {
    const shown = await open();
    await goes('background');
    reported.length = 0;

    act(() => handlers.onScreenAsked?.('sess_1'));

    // Two messages to say one thing: the declaration the handover makes, and
    // the reconciler withdrawing it behind. What matters is where it lands.
    expect(reported[reported.length - 1]).toBeNull();
    // And the role is kept, as it is for a device that was away when it
    // arrived — the picture is mounted and the film resumes on return.
    expect(textOf(shown)).toContain('screen:sess_1');

    await goes('active');
    expect(reported[reported.length - 1]).toBe('sess_1');
  });

  /**
   * A device displaced while it was away comes back with nothing to say. The
   * `screen` message that displaced it cleared the role, and the report is
   * made off the role rather than off a memory of one — otherwise a phone
   * coming out of a pocket would take the film back off the television it was
   * handed to.
   */
  it('says nothing on return once the film has gone elsewhere', async () => {
    await open();
    act(() => handlers.onScreenAsked?.('sess_1'));
    await goes('background');
    reported.length = 0;

    act(() => handlers.onScreenAsked?.(null));
    reported.length = 0;
    await goes('active');
    expect(reported).toEqual([]);
  });

  it('gives it up when the film moves to another device', async () => {
    const shown = await open();
    act(() => handlers.onScreenAsked?.('sess_1'));
    reported.length = 0;

    // The server's half of somebody else's handover — a film shows on one
    // device at a time, so this is not a refusal.
    act(() => handlers.onScreenAsked?.(null));

    expect(textOf(shown)).toContain('screen:nowhere');
    expect(reported).toEqual([null]);
  });

  /**
   * **An eviction that takes nothing away is not an event.** The server tells
   * every one of an account's instances to stop showing a film when one of
   * them declares — it cannot ask its own record who is playing what, that
   * record being what a dropped socket takes with it — so a device showing
   * nothing now hears a null on every declaration anybody makes. Answering
   * one would retract nothing at the server and re-render the application to
   * say what it already said.
   */
  it('says nothing when told to stop showing what it was not showing', async () => {
    const shown = await open();
    act(() => handlers.onScreenAsked?.(null));

    expect(reported).toEqual([]);
    expect(watched).toEqual([]);
    expect(textOf(shown)).toContain('screen:nowhere');
  });

  it('is the same fact the app can set for itself', async () => {
    await open();
    act(() => latest?.showScreenFor('sess_1'));
    expect(reported).toEqual(['sess_1']);
  });

  it('subscribes to the channel, having nothing to draw otherwise', async () => {
    /*
      `Picture` reads the film off `channelViews[screenFor]`, and that map is
      filled only by snapshots for channels this socket has asked to watch. So
      a device handed a film it did not already have open took the role, told
      the server it was busy, and drew nothing whatsoever.
    */
    await open();
    act(() => handlers.onScreenAsked?.('sess_1'));
    expect(watched).toContain('sess_1');
  });

  it('asks nothing of the socket when the film is taken away', async () => {
    await open();
    act(() => handlers.onScreenAsked?.('sess_1'));
    watched.length = 0;
    act(() => handlers.onScreenAsked?.(null));
    expect(watched).toEqual([]);
  });

  it('takes the role without opening anything', async () => {
    /*
      Until 2026-10-09 the ask also recorded an arrival that `App.tsx` spent
      by opening the channel. The film floats over whatever is open now, so
      the role is the whole of what the ask sets.
    */
    const shown = await open();
    act(() => handlers.onScreenAsked?.('sess_1'));
    expect(textOf(shown)).toContain('screen:sess_1');
  });
});
