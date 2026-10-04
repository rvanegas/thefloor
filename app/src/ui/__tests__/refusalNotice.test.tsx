import React from 'react';
import { act } from 'react-test-renderer';

import { ChannelView } from '../ChannelView';
import {
  AUDIO,
  channelOf,
  findExactButton,
  mockApp,
  render,
  resetHarness,
  showChannel,
  showClipboard,
  textOf,
} from '../testing/harness';

/**
 * The card that says a channel action was refused, in the server's sentence.
 *
 * Until 2026-10-03 those sentences went to `lastError`, which only the sign-in
 * screen draws, so a refused act read as a dead button. What is worth
 * asserting is that the sentence reaches the channel it was about, whichever
 * tab is open, and nowhere else.
 */

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

jest.mock('../../api/download', () =>
  require('../testing/harness').downloadMock()
);
jest.mock('../../api/upload', () => require('../testing/harness').uploadMock());
jest.mock('../../state/AppProvider', () =>
  require('../testing/harness').appProviderMock()
);

beforeEach(() => {
  resetHarness();
  mockKeychain.clear();
});

const SENTENCE = 'Channels hold up to 8 people.';

async function show(refusals: (channelId: string) => Record<string, string>) {
  const channel = channelOf();
  showChannel(channel, []);
  mockApp.refusals = refusals(channel.id);
  const tree = render(
    <ChannelView
      channelId={channel.id}
      audio={AUDIO}
      onClose={() => {}}
      onExit={() => {}}
      onEnterChannel={() => {}}
    />
  );
  await act(async () => {});
  return { tree, channelId: channel.id };
}

describe('a refused channel action', () => {
  it('is said on the channel it was taken in, whichever tab is open', async () => {
    const { tree } = await show((id) => ({ [id]: SENTENCE }));
    expect(textOf(tree)).toContain('That did not go through');
    expect(textOf(tree)).toContain(SENTENCE);
    await showClipboard(tree);
    expect(textOf(tree)).toContain(SENTENCE);
  });

  it('is not said on another channel', async () => {
    const { tree } = await show(() => ({ chan_elsewhere: SENTENCE }));
    expect(textOf(tree)).not.toContain(SENTENCE);
    expect(textOf(tree)).not.toContain('That did not go through');
  });

  it('is taken away when it has been read', async () => {
    const { tree, channelId } = await show((id) => ({ [id]: SENTENCE }));
    await act(async () => findExactButton(tree, 'Got it')!.props.onPress());
    expect(mockApp.dismissRefusal).toHaveBeenCalledWith(channelId);
  });
});
