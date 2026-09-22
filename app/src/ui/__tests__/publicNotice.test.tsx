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
  showNotepad,
  textOf,
} from '../testing/harness';

/**
 * The card that tells a member their channel has a public page.
 *
 * **What is worth asserting is that it is a notice and behaves like one.**
 * The failures it exists to prevent are quiet ones: a member who is never
 * told at all, a card filed under one tab that most people never open, and a
 * card that reads as a vote — so the third test is about the words, which are
 * the only thing standing between this and somebody believing they have been
 * given a veto they have not been given.
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

async function show(publicNotice: boolean) {
  const channel = channelOf();
  showChannel(channel, [], { publicNotice });
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

type Screen = Awaited<ReturnType<typeof show>>['tree'];

const drawn = (tree: Screen) =>
  textOf(tree).includes('This channel has a public page');

describe('the public-page card', () => {
  it('is not drawn for a member who has been told', async () => {
    const { tree } = await show(false);
    expect(drawn(tree)).toBe(false);
  });

  it('is drawn whichever tab the member landed on', async () => {
    const { tree } = await show(true);
    expect(drawn(tree)).toBe(true);
    await showNotepad(tree);
    expect(drawn(tree)).toBe(true);
  });

  it('says what is public and where the decision that matters is taken', async () => {
    const { tree } = await show(true);
    const text = textOf(tree);
    // The page, and that it is findable rather than merely reachable — the
    // correction `2026-09-22-a-public-channel-is-findable-rather-than-unlisted`
    // made to every other piece of copy about this.
    expect(text).toContain('listed publicly');
    expect(text).toContain('No member is named on it');
    // And the half that stops it reading as a consent card: their own voice
    // is protected per recording, by them, and not by this.
    expect(text).toContain('unless you agree to that recording yourself');
  });

  it('goes at once when the member says they have read it, and tells the server', async () => {
    const { tree, channelId } = await show(true);
    await act(async () => findExactButton(tree, 'Got it')!.props.onPress());
    expect(mockApp.acknowledgeChannelPublic).toHaveBeenCalledWith(channelId);
    // Gone before the snapshot carrying the server's answer arrives, which is
    // still saying the card is owed.
    expect(drawn(tree)).toBe(false);
  });
});
