import React from 'react';
import { Linking, Text } from 'react-native';
import renderer, { act, type ReactTestRenderer } from 'react-test-renderer';
import { AppProvider, useApp } from '../AppProvider';

/**
 * A community link opens the community, whether or not the person tapping it
 * is already in it. The server answers a member with `already: true` and the
 * channel's id; what this guards is the app acting on that answer, since the
 * effect that spends the link clears it before the request goes out and so
 * re-runs while the request is in flight. A contact invitation is spent the
 * same way and had the same fault, so it is here too.
 */

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(async () => 'stored-token'),
  setItemAsync: jest.fn(async () => {}),
  deleteItemAsync: jest.fn(async () => {}),
}));

// Prefixed `mock` because jest hoists the factory below above this line and
// only permits out-of-scope names that say so.
const mockJoinCommunity = jest.fn();
const mockAcceptInvite = jest.fn();

jest.mock('../../api/http', () => ({
  ApiError: class ApiError extends Error {},
  onSignedOut: jest.fn(),
  api: {
    health: jest.fn(async () => ({ ok: true })),
    home: jest.fn(async () => ({
      invites: [],
      rejoinable: [],
      contacts: [],
      recordings: [],
    })),
    joinCommunity: (...args: unknown[]) => mockJoinCommunity(...args),
    acceptInvite: (...args: unknown[]) => mockAcceptInvite(...args),
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
    disconnect() {}
  },
}));

function Says() {
  const { landedChannel } = useApp();
  return <Text>landed:{landedChannel ?? 'none'}</Text>;
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

describe('a community link', () => {
  beforeEach(() => {
    mockJoinCommunity.mockReset();
    jest
      .spyOn(Linking, 'getInitialURL')
      .mockResolvedValue('https://thefloor.rvanegas.co/j/cafe-products-k3x9abcd');
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it.each([
    ['somebody already in the community', true],
    ['somebody joining it now', false],
  ])('opens the community for %s', async (_who, already) => {
    mockJoinCommunity.mockResolvedValue({
      ok: true,
      channelId: 'chan_cafe',
      name: 'Cafe',
      already,
    });
    const tree = await mount();
    expect(mockJoinCommunity).toHaveBeenCalledTimes(1);
    expect(mockJoinCommunity).toHaveBeenCalledWith('stored-token', 'cafe-products-k3x9abcd');
    expect(textOf(tree)).toContain('landed:chan_cafe');
    await act(async () => tree.unmount());
  });
});

describe('a contact invitation link', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('opens the channel it makes', async () => {
    mockAcceptInvite.mockReset();
    mockAcceptInvite.mockResolvedValue({ ok: true, contact: null, channelId: 'chan_pair' });
    jest
      .spyOn(Linking, 'getInitialURL')
      .mockResolvedValue('https://thefloor.rvanegas.co/i/annak');
    const tree = await mount();
    expect(mockAcceptInvite).toHaveBeenCalledTimes(1);
    expect(textOf(tree)).toContain('landed:chan_pair');
    await act(async () => tree.unmount());
  });
});
