import React from 'react';
import renderer, { act, type ReactTestRenderer } from 'react-test-renderer';
import { useInviteLink } from '../useInviteLink';

/**
 * Holding an invitation until there is a session, which is the half a module
 * variable could not do.
 *
 * **The case under test is the one that looks least likely and is the designed
 * walk.** Somebody installs the app from the invite page, opens it, signs in,
 * goes back to Safari and taps *Open in the app*. The token never changes, so
 * an effect keyed on the token alone never runs again; a module-level hold in
 * `handover.ts` would be written and never read. Everything here is about the
 * invitation surviving to be noticed.
 */

let mockInitialUrl: string | null = null;
const mockListeners: Array<(event: { url: string }) => void> = [];
const mockRemovals = { count: 0 };

// Mocked wholesale, which is the convention here — see `micPermission.test.ts`
// and `shareWeb.test.ts`. Nothing under test renders anything, so `Linking` is
// the whole of what this module needs to be.
jest.mock('react-native', () => ({
  Linking: {
    getInitialURL: jest.fn(async () => mockInitialUrl),
    addEventListener: jest.fn(
      (_event: string, handler: (e: { url: string }) => void) => {
        mockListeners.push(handler);
        return {
          remove: () => {
            mockRemovals.count += 1;
            mockListeners.splice(mockListeners.indexOf(handler), 1);
          },
        };
      }
    ),
  },
}));


type Seen = { username: string; pin: string } | null;

let seen: Seen = null;
let clear: () => void = () => {};

function Probe() {
  const { invite, clearInvite } = useInviteLink();
  seen = invite;
  clear = clearInvite;
  return null;
}

beforeEach(() => {
  mockInitialUrl = null;
  mockListeners.length = 0;
  mockRemovals.count = 0;
  seen = null;
  // The browser road is absent on native, and absent here unless a test says
  // otherwise. `takeInvite` reads `globalThis.sessionStorage`.
  delete (globalThis as { sessionStorage?: unknown }).sessionStorage;
});

async function mount() {
  let tree: ReactTestRenderer | undefined;
  await act(async () => {
    tree = renderer.create(<Probe />);
  });
  return tree!;
}

it('holds an invitation that was waiting at a cold launch', async () => {
  // The path that reaches no listener at all, because the tap happened before
  // the process existed — which after an install is everybody.
  mockInitialUrl = 'thefloor://i/annak/042317';
  await mount();
  expect(seen).toEqual({ username: 'annak', pin: '042317' });
});

it('holds one that arrives while the app is already running and signed in', async () => {
  // The walk this design is for: install, open, sign in, back to Safari, tap.
  // Nothing about the session changes, so the invitation itself has to be what
  // wakes the effect that spends it.
  await mount();
  expect(seen).toBeNull();

  await act(async () => {
    mockListeners.forEach((fire) => fire({ url: 'thefloor://i/annak/042317' }));
  });
  expect(seen).toEqual({ username: 'annak', pin: '042317' });
});

it('takes the browser’s invitation out of storage on mount', async () => {
  const store = new Map([
    ['thefloor.invite', JSON.stringify({ username: 'beth', pin: '112233' })],
  ]);
  (globalThis as { sessionStorage?: unknown }).sessionStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    removeItem: (k: string) => store.delete(k),
    setItem: (k: string, v: string) => store.set(k, v),
  };

  await mount();
  expect(seen).toEqual({ username: 'beth', pin: '112233' });
  // One-shot: it is gone from storage, so a reload cannot spend it twice.
  expect(store.has('thefloor.invite')).toBe(false);
});

it('keeps the first arrival when two roads answer at once', async () => {
  // A cold launch can carry a URL *and* something in storage. Whichever is
  // first stands, rather than the two overwriting each other by timing.
  const store = new Map([
    ['thefloor.invite', JSON.stringify({ username: 'beth', pin: '112233' })],
  ]);
  (globalThis as { sessionStorage?: unknown }).sessionStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    removeItem: (k: string) => store.delete(k),
    setItem: (k: string, v: string) => store.set(k, v),
  };
  mockInitialUrl = 'thefloor://i/annak/042317';

  await mount();
  // Storage is read synchronously on mount and the URL resolves after, so
  // storage wins. What matters is that one of them wins whole.
  expect(seen).toEqual({ username: 'beth', pin: '112233' });
});

it('ignores a second link while one is still unspent', async () => {
  mockInitialUrl = 'thefloor://i/annak/042317';
  await mount();
  await act(async () => {
    mockListeners.forEach((fire) => fire({ url: 'thefloor://i/carol/999999' }));
  });
  // The pin in hand is the one somebody is part-way through accepting.
  expect(seen).toEqual({ username: 'annak', pin: '042317' });
});

it('empties when spent, so nothing redeems it twice', async () => {
  mockInitialUrl = 'thefloor://i/annak/042317';
  await mount();
  await act(async () => {
    clear();
  });
  expect(seen).toBeNull();
});

it('ignores a URL that is not an invitation', async () => {
  mockInitialUrl = 'thefloor://channel/chan_one';
  await mount();
  expect(seen).toBeNull();
});

it('drops its listener when it goes away', async () => {
  const tree = await mount();
  await act(async () => {
    tree.unmount();
  });
  expect(mockRemovals.count).toBe(1);
  expect(mockListeners).toHaveLength(0);
});
