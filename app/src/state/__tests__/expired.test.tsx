import React from 'react';
import { Text } from 'react-native';
import renderer, { act, type ReactTestRenderer } from 'react-test-renderer';
import { AppProvider, useApp } from '../AppProvider';

/**
 * A build below the server's floor stops being an app: the provider says so,
 * and — the half nobody sees — it hangs the socket up, so this account does
 * not go on standing in channels it can no longer draw.
 */

let disconnected = 0;

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(async () => 'stored-token'),
  setItemAsync: jest.fn(async () => {}),
  deleteItemAsync: jest.fn(async () => {}),
}));

/** This install claims to be build 35, whatever the test runner is really on. */
jest.mock('../../api/build', () => ({
  appBuild: () => 35,
  BUILD_HEADER: 'x-thefloor-build',
}));

// Prefixed `mock` because jest hoists the factory below above this line and
// only permits out-of-scope names that say so.
const mockHealth = jest.fn();

jest.mock('../../api/http', () => ({
  ApiError: class ApiError extends Error {},
  onSignedOut: jest.fn(),
  api: {
    health: (...args: unknown[]) => mockHealth(...args),
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
    connect() {}
    watchHome() {}
    watchChannel() {}
    unwatchChannel() {}
    act() {}
    resume() {}
    disconnect() {
      disconnected += 1;
    }
  },
}));

function Says() {
  const { expired, updateUrl } = useApp();
  return (
    <Text>
      expired:{String(expired)} url:{updateUrl ?? 'none'}
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

async function mount(): Promise<ReactTestRenderer> {
  let tree!: ReactTestRenderer;
  await act(async () => {
    tree = renderer.create(
      <AppProvider>
        <Says />
      </AppProvider>
    );
  });
  return tree;
}

describe('an expired build', () => {
  beforeEach(() => {
    disconnected = 0;
    mockHealth.mockReset();
  });

  it('is discovered on launch, and carries where to go', async () => {
    mockHealth.mockResolvedValue({
      ok: true,
      minBuild: 36,
      updateUrl: 'https://apps.apple.com/app/id1',
    });
    const tree = await mount();
    expect(textOf(tree)).toContain('expired:true');
    expect(textOf(tree)).toContain('url:https://apps.apple.com/app/id1');
    // The socket goes, whether or not anything was being watched: a watch left
    // open reports presence for somebody who can no longer hear the channel.
    expect(disconnected).toBeGreaterThan(0);
    await act(async () => tree.unmount());
  });

  it('is not declared by a server that could not be reached', async () => {
    // The failure modes are not symmetric. Refusing to run is total; running
    // one release too long is what the app did for its whole life until now.
    mockHealth.mockRejectedValue(new Error('Cannot reach the server.'));
    const tree = await mount();
    expect(textOf(tree)).toContain('expired:false');
    await act(async () => tree.unmount());
  });

  it('is not declared for the build that is the floor', async () => {
    mockHealth.mockResolvedValue({ ok: true, minBuild: 35, updateUrl: null });
    const tree = await mount();
    expect(textOf(tree)).toContain('expired:false');
    expect(textOf(tree)).toContain('url:none');
    await act(async () => tree.unmount());
  });
});
