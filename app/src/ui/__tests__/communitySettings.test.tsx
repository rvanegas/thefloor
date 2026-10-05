import React from 'react';
import { act, type ReactTestRenderer } from 'react-test-renderer';
import { ChannelSettingsView } from '../ChannelSettingsView';
import { createChannel, reduce } from '../../../../core/channel';
import type { ChannelState } from '../../../../core/types';
import {
  ME,
  NOW,
  THEM,
  findButton,
  mockApp,
  render,
  resetHarness,
  textOf,
} from '../testing/harness';

jest.mock('../../api/download', () =>
  require('../testing/harness').downloadMock()
);
jest.mock('../../api/upload', () => require('../testing/harness').uploadMock());
jest.mock('../../state/AppProvider', () =>
  require('../testing/harness').appProviderMock()
);

/**
 * Channel Settings for a *community*: the owner has the link and *Delete*,
 * and has no *Leave*; a member sees neither the link nor the owner's controls.
 */

let tree: ReactTestRenderer;

beforeEach(() => resetHarness());
afterEach(async () => {
  await act(async () => {});
  tree?.unmount();
});

function community(owner: string, member: string): ChannelState {
  const base = createChannel({ id: 'sess_c', initiator: owner, invitees: [], now: NOW, owner: true });
  return reduce({ ...base, name: 'Cafe Products' }, { type: 'JOIN', userId: member }, NOW);
}

async function open(channel: ChannelState) {
  mockApp.me = { id: ME, displayName: 'Me' } as typeof mockApp.me;
  (mockApp.communityLink as jest.Mock).mockResolvedValue(
    'https://example.com/j/cafe-products-k3x9abcd'
  );
  tree = render(
    <ChannelSettingsView
      publicAt={null}
      channel={channel}
      derivedTitle="Cafe Products"
      onBack={jest.fn()}
      onLeft={jest.fn()}
    />
  );
  await act(async () => {});
}

it('gives the owner the link, and Delete where Leave would be', async () => {
  await open(community(ME, THEM));
  const text = textOf(tree);
  expect(text).toContain('Community link');
  expect(text).toContain('example.com/j/cafe-products-k3x9abcd');
  expect(findButton(tree, 'Reset link')).toBeDefined();
  expect(findButton(tree, 'Delete channel')).toBeDefined();
  expect(findButton(tree, 'Leave channel')).toBeUndefined();
  expect(text).toContain('you cannot leave it');
});

it('gives a member neither the link nor Delete', async () => {
  await open(community(THEM, ME));
  const text = textOf(tree);
  expect(text).not.toContain('Community link');
  expect(mockApp.communityLink).not.toHaveBeenCalled();
  expect(findButton(tree, 'Leave channel')).toBeDefined();
  expect(findButton(tree, 'Delete channel')).toBeUndefined();
});
