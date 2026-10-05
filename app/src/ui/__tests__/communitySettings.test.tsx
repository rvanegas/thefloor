import React from 'react';
import { Linking, TextInput } from 'react-native';
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
jest.mock('../../api/config', () => ({
  ...jest.requireActual('../../api/config'),
  API_URL: 'https://example.com',
}));
jest.mock('../../state/AppProvider', () =>
  require('../testing/harness').appProviderMock()
);

/**
 * Channel Settings for a *community*: the owner has the link and *Delete*,
 * and has no *Leave*; a member sees neither the link nor the owner's controls.
 * A channel of one is offered *Make channel into a community*, unless it is a
 * podcast; a community is offered no podcast.
 */

let tree: ReactTestRenderer;

beforeEach(() => resetHarness());
afterEach(async () => {
  await act(async () => {});
  tree?.unmount();
});

function community(owner: string, member: string): ChannelState {
  const base = createChannel({ id: 'sess_c', initiator: owner, invitees: [], now: NOW });
  const made = reduce(base, { type: 'MAKE_COMMUNITY', userId: owner, name: 'Cafe Products' }, NOW);
  return reduce(made, { type: 'JOIN', userId: member }, NOW);
}

const screen = (channel: ChannelState, publicAt: number | null = null) => (
  <ChannelSettingsView
    publicAt={publicAt}
    channel={channel}
    derivedTitle="Cafe Products"
    onBack={jest.fn()}
    onLeft={jest.fn()}
  />
);

async function open(channel: ChannelState, publicAt: number | null = null) {
  mockApp.me = { id: ME, displayName: 'Me' } as typeof mockApp.me;
  (mockApp.communityLink as jest.Mock).mockResolvedValue(
    'https://example.com/j/cafe-products-k3x9abcd'
  );
  tree = render(screen(channel, publicAt));
  await act(async () => {});
}

const fields = () => tree.root.findAll((node) => node.type === TextInput);

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

it('leaves the name and the recording setting to the owner, and says so', async () => {
  await open(community(THEM, ME));
  expect(fields()[0].props.editable).toBe(false);
  expect(textOf(tree)).toContain('Only the community\u2019s owner can change this.');
  expect(textOf(tree)).not.toContain('Step in to rename');
  tree.unmount();

  await open(community(ME, THEM));
  expect(fields()[0].props.editable).toBe(true);
  expect(textOf(tree)).toContain('only you can change it');
});

it('says what a community is, and offers it no podcast', async () => {
  await open(community(THEM, ME));
  const text = textOf(tree);
  expect(text).toContain('This channel is a community');
  expect(text).toContain('A community cannot also be a podcast');
  expect(text).not.toContain('A podcast has a page on the web');
});

it('offers a named channel of one to become a community, asking no name', async () => {
  const alone = reduce(
    createChannel({ id: 'sess_a', initiator: ME, invitees: [], now: NOW }),
    { type: 'SET_NAME', userId: ME, name: 'Mine' },
    NOW
  );
  (mockApp.makeCommunity as jest.Mock).mockResolvedValue('https://example.com/j/mine-k3x9abcd');
  await open(alone);
  expect(textOf(tree)).toContain('This channel is a podcast');
  const before = fields().length;
  await act(async () => findButton(tree, 'Make channel into a community')!.props.onPress());
  expect(fields()).toHaveLength(before);
  expect(textOf(tree)).not.toContain('A community needs a name');
  await act(async () => findButton(tree, 'Make it a community')!.props.onPress());
  expect(mockApp.makeCommunity).toHaveBeenCalledWith('sess_a', '');
});

it('asks an unnamed channel of one for the name it will have', async () => {
  (mockApp.makeCommunity as jest.Mock).mockResolvedValue('https://example.com/j/cafe-k3x9abcd');
  await open(createChannel({ id: 'sess_u', initiator: ME, invitees: [], now: NOW }));
  const before = fields().length;
  await act(async () => findButton(tree, 'Make channel into a community')!.props.onPress());
  expect(fields()).toHaveLength(before + 1);
  expect(textOf(tree)).toContain('This becomes the channel\u2019s name');
  expect(findButton(tree, 'Make it a community')!.props.disabled).toBe(true);
  await act(async () => fields()[before].props.onChangeText('Cafe'));
  await act(async () => findButton(tree, 'Make it a community')!.props.onPress());
  expect(mockApp.makeCommunity).toHaveBeenCalledWith('sess_u', 'Cafe');
});

it('shows a name given elsewhere in the name field, and reads the link again', async () => {
  const before = community(ME, THEM);
  await open(before);
  expect(fields()[0].props.value).toBe('Cafe Products');
  expect(mockApp.communityLink).toHaveBeenCalledTimes(1);

  const renamed = reduce(before, { type: 'SET_NAME', userId: ME, name: 'Cafe' }, NOW);
  await act(async () => tree.update(screen(renamed)));
  expect(fields()[0].props.value).toBe('Cafe');
  expect(mockApp.communityLink).toHaveBeenCalledTimes(2);
  expect(textOf(tree)).toContain('changing it resets the community link');
});

it('offers it to nobody in a channel with anybody else in it', async () => {
  await open(createChannel({ id: 'sess_b', initiator: ME, invitees: [THEM], now: NOW }));
  expect(textOf(tree)).not.toContain('Community');
  expect(findButton(tree, 'Make channel into a community')).toBeUndefined();
});

it('says why a podcast cannot become one', async () => {
  const alone = reduce(
    createChannel({ id: 'sess_p', initiator: ME, invitees: [], now: NOW }),
    { type: 'SET_NAME', userId: ME, name: 'On air' },
    NOW
  );
  await open(alone, NOW);
  expect(textOf(tree)).toContain('A podcast cannot also be a community');
  expect(findButton(tree, 'Make channel into a community')).toBeUndefined();
});

it('opens the community page outside the app, for its owner', async () => {
  const opened = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
  await open(community(ME, THEM));
  await act(async () => findButton(tree, 'Open page')!.props.onPress());
  expect(opened).toHaveBeenCalledWith('https://example.com/j/cafe-products-k3x9abcd');
  opened.mockRestore();
});

it('shows a podcast its page and opens it outside the app', async () => {
  const opened = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
  const alone = reduce(
    createChannel({ id: 'sess_p', initiator: ME, invitees: [], now: NOW }),
    { type: 'SET_NAME', userId: ME, name: 'On air' },
    NOW
  );
  await open(alone, NOW);
  expect(textOf(tree)).toContain('example.com/c/sess_p');
  await act(async () => findButton(tree, 'Open page')!.props.onPress());
  expect(opened).toHaveBeenCalledWith('https://example.com/c/sess_p');
  opened.mockRestore();
});
