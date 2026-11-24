import React from 'react';
import { act } from 'react-test-renderer';
import { reduce } from '../../../../core/channel';
import type { ChannelAction } from '../../../../core/types';
import { ChannelView } from '../ChannelView';
import {
  AUDIO,
  ME,
  NOW,
  channelOf,
  findButton,
  mockApp,
  render,
  resetHarness,
  showChannel,
  showListen,
  textOf,
} from '../testing/harness';

jest.mock('../../api/download', () => require('../testing/harness').downloadMock());
jest.mock('../../api/upload', () => require('../testing/harness').uploadMock());
jest.mock('../../state/AppProvider', () => require('../testing/harness').appProviderMock());

/**
 * A library document read aloud into *Listen*, since 2026-11-20: offered on a
 * Pro channel, chosen from the libraries on in it, and followed along by the
 * sentence being said. See server/__tests__/readings.test.ts for the rest.
 */

/** This file's spies on `api`, put back after each test; the harness's own mocks are left alone. */
const spies: jest.SpyInstance[] = [];
afterEach(() => spies.splice(0).forEach((spy) => spy.mockRestore()));
const spy = <K extends string>(name: K, value: unknown) => {
  const { api } = require('../../api/http');
  const made = jest.spyOn(api, name as never).mockResolvedValue(value as never);
  spies.push(made);
  return made;
};
/** Connected to noesis unless a test says otherwise, which the button waits on. */
beforeEach(() => {
  resetHarness();
  spy('noesis', { available: true, connected: true, libraries: [] });
});

const flush = () => act(async () => new Promise((resolve) => setTimeout(resolve, 0)));

const DOCUMENT = { name: 'x.document.md', library: 'alice/philosophy', title: 'On Attention' };

describe('Read a document aloud', () => {
  it('is offered only on a Pro channel', async () => {
    showChannel(channelOf());
    const standard = render(
      <ChannelView channelId="sess_1" audio={AUDIO} onClose={() => {}} onExit={() => {}} />
    );
    showListen(standard);
    expect(findButton(standard, 'Read a document aloud')).toBeUndefined();
    act(() => standard.unmount());

    showChannel(channelOf(), [], { pro: true });
    const pro = render(<ChannelView channelId="sess_1" audio={AUDIO} onClose={() => {}} onExit={() => {}} />);
    await flush();
    showListen(pro);
    expect(findButton(pro, 'Read a document aloud')).toBeDefined();
    act(() => pro.unmount());
  });

  it('is offered only to somebody connected to noesis', async () => {
    spy('noesis', { available: true, connected: false });
    showChannel(channelOf(), [], { pro: true });
    const tree = render(<ChannelView channelId="sess_1" audio={AUDIO} onClose={() => {}} onExit={() => {}} />);
    await flush();
    showListen(tree);
    expect(findButton(tree, 'Read a document aloud')).toBeUndefined();
    act(() => tree.unmount());
  });

  it('lists the documents, and reads the one chosen into Listen and plays it', async () => {
    spy('channelDocuments', { libraries: ['alice/philosophy'], documents: [DOCUMENT] });
    const read = spy('readDocumentAloud', { track: {} });

    showChannel(channelOf(), [], { pro: true });
    const tree = render(<ChannelView channelId="sess_1" audio={AUDIO} onClose={() => {}} onExit={() => {}} />);
    await flush();
    showListen(tree);
    act(() => findButton(tree, 'Read a document aloud')!.props.onPress());
    await flush();
    await act(async () => {
      await findButton(tree, 'On Attention')!.props.onPress();
    });
    await flush();
    expect(read).toHaveBeenCalledWith('token', 'sess_1', DOCUMENT, undefined);
    expect(mockApp.act).toHaveBeenCalledWith('sess_1', { type: 'PLAY' });
    act(() => tree.unmount());
  });

  it('reads a book a part at a time, the part chosen from its outline', async () => {
    const BOOK = { name: 'h.source.epub', library: 'alice/philosophy', title: 'Tiempo de hormigas', parts: true };
    spy('channelDocuments', { libraries: ['alice/philosophy'], documents: [BOOK] });
    const PART = { number: 2, title: 'Uno', size: '5 words' };
    spy('documentParts', { parts: [{ number: 1, title: 'Prólogo', size: '1,234 words' }, PART] });
    const read = spy('readDocumentAloud', { track: {} });

    showChannel(channelOf(), [], { pro: true });
    const tree = render(<ChannelView channelId="sess_1" audio={AUDIO} onClose={() => {}} onExit={() => {}} />);
    await flush();
    showListen(tree);
    act(() => findButton(tree, 'Read a document aloud')!.props.onPress());
    await flush();
    act(() => findButton(tree, 'Tiempo de hormigas')!.props.onPress());
    await flush();
    expect(read).not.toHaveBeenCalled();
    expect(findButton(tree, 'Prólogo')).toBeDefined();
    await act(async () => {
      await findButton(tree, 'Uno')!.props.onPress();
    });
    await flush();
    expect(read).toHaveBeenCalledWith('token', 'sess_1', BOOK, PART);
    act(() => tree.unmount());
  });

  it('says what to do where no library is on', async () => {
    spy('channelDocuments', { libraries: [], documents: [] });
    showChannel(channelOf(), [], { pro: true });
    const tree = render(<ChannelView channelId="sess_1" audio={AUDIO} onClose={() => {}} onExit={() => {}} />);
    await flush();
    showListen(tree);
    act(() => findButton(tree, 'Read a document aloud')!.props.onPress());
    await flush();
    expect(textOf(tree)).toContain('Turn a library on in Channel Settings');
    act(() => tree.unmount());
  });

  it('shows the sentence being said under the progress bar', async () => {
    spy('channelReading', {
      reading: 'rdg_1',
      sentences: [
        { startMs: 0, endMs: 900, text: 'On Attention' },
        { startMs: 1000, endMs: 4000, text: 'Attention is a kind of will.' },
      ],
    });
    const loaded = channelOf((c) =>
      reduce(
        c,
        {
          type: 'SET_TRACK',
          userId: ME,
          track: {
            id: 'trk1',
            title: 'On Attention',
            durationMs: 5_000,
            document: { ...DOCUMENT, reading: 'rdg_1' },
          },
        } as ChannelAction,
        NOW
      )
    );
    showChannel(
      { ...loaded, playback: { ...loaded.playback, status: 'paused', positionMs: 1_500, startedAt: null } },
      [],
      { pro: true }
    );
    const tree = render(<ChannelView channelId="sess_1" audio={AUDIO} onClose={() => {}} onExit={() => {}} />);
    showListen(tree);
    await flush();
    expect(textOf(tree)).toContain('Attention is a kind of will.');
    act(() => tree.unmount());
  });
});
