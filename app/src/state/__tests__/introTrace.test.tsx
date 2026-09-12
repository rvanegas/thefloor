import React from 'react';
import { Text } from 'react-native';
import renderer, { act, type ReactTestRenderer } from 'react-test-renderer';
import { useIntroduction } from '../useIntroduction';
import type { Introduction } from '../introduction';

const mockKeychain = new Map<string, string>();

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(async (key: string) => mockKeychain.get(key) ?? null),
  setItemAsync: jest.fn(async (key: string, value: string) => {
    mockKeychain.set(key, value);
  }),
  deleteItemAsync: jest.fn(async (key: string) => {
    mockKeychain.delete(key);
  }),
}));

const home = (over: Partial<any> = {}): any => ({
  contacts: [],
  rejoinable: [],
  invites: [],
  ...over,
});

function Probe({
  conversing,
  homeView,
  report,
}: {
  conversing: boolean;
  homeView: any;
  report: (i: Introduction) => void;
}) {
  const { introduction } = useIntroduction({
    token: 'auth',
    home: homeView,
    displayName: 'Rodrigo',
    conversing,
    loadUsername: async () => 'rod',
  });
  report(introduction);
  return <Text>{introduction.show}</Text>;
}

beforeEach(() => mockKeychain.clear());

it('TRACE: a conversation with members retires it, and it stays retired', async () => {
  let latest: Introduction = { show: 'none' };
  const view = home({ contacts: [{ id: 'b' }] });
  let tree: ReactTestRenderer;

  await act(async () => {
    tree = renderer.create(
      <Probe conversing={false} homeView={view} report={(i) => (latest = i)} />
    );
  });
  console.log('1. signed in, not conversing:', JSON.stringify(latest));

  await act(async () => {
    tree!.update(
      <Probe conversing={true} homeView={view} report={(i) => (latest = i)} />
    );
  });
  console.log('2. in a channel with somebody:', JSON.stringify(latest));
  console.log('   doneAt in keychain:', mockKeychain.get('thefloor.intro.doneAt'));

  await act(async () => {
    tree!.update(
      <Probe conversing={false} homeView={view} report={(i) => (latest = i)} />
    );
  });
  console.log('3. back on Home afterwards:', JSON.stringify(latest));
  console.log('   doneAt in keychain:', mockKeychain.get('thefloor.intro.doneAt'));
});
