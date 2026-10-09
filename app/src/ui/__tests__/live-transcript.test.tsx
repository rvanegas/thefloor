import React from 'react';
import { act } from 'react-test-renderer';
import { reduce } from '../../../../core/channel';
import type { LiveLine } from '../../../../core/protocol';
import { ChannelView } from '../ChannelView';
import { merge } from '../LiveTranscript';
import { receiveLiveLine } from '../../live/lines';
import {
  AUDIO,
  ME,
  NOW,
  THEM,
  channelOf,
  findButton,
  findTab,
  render,
  resetHarness,
  showChannel,
  showTab,
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
 * The live transcript on the app's side: the tab that holds it, the pill that
 * says it is listening, and the switch only somebody on the house may see.
 */

beforeEach(resetHarness);

const { api } = require('../../api/http');

const line = (id: string, identity: string, displayName: string, startAt: number, text: string): LiveLine => ({
  id,
  identity,
  displayName,
  startAt,
  endAt: startAt + 1_000,
  text,
  confidence: null,
});

const transcribed = () =>
  channelOf((s) => reduce(s, { type: 'SET_LIVE_TRANSCRIPTION', on: true }, NOW));

const screen = () => (
  <ChannelView channelId="sess_1" audio={AUDIO} onClose={() => {}} onExit={() => {}} />
);

/** Lets the history fetch settle. */
const settle = () => act(async () => {});

describe('the Transcript tab', () => {
  it('is not offered in a channel that has never had a live transcript', () => {
    showChannel(channelOf());
    const tree = render(screen());
    expect(findTab(tree, 'Transcript')).toBeUndefined();
    act(() => tree.unmount());
  });

  it('is offered while the live transcript is on, and after it, while there is any', () => {
    showChannel(transcribed());
    const on = render(screen());
    expect(findTab(on, 'Transcript')).toBeDefined();
    act(() => on.unmount());

    showChannel(channelOf(), [], { liveTranscript: true });
    const after = render(screen());
    expect(findTab(after, 'Transcript')).toBeDefined();
    act(() => after.unmount());
  });

  it('reads as one conversation: grouped by speaker, under the day', async () => {
    jest.spyOn(api, 'liveTranscript').mockResolvedValue({
      lines: [
        line('l1', ME, 'Me', NOW, 'so the plan is'),
        line('l2', ME, 'Me', NOW + 2_000, 'we start on Monday'),
        line('l3', THEM, 'Dana Chu', NOW + 4_000, 'Monday works'),
      ],
      more: false,
    } as never);
    showChannel(transcribed());
    const tree = render(screen());
    showTab(tree, 'Transcript');
    await settle();

    const text = textOf(tree);
    expect(text).toContain('so the plan is');
    expect(text).toContain('we start on Monday');
    expect(text).toContain('Monday works');
    // One entry for two lines in a row from one person: the name once.
    expect(text.split('Dana Chu').length - 1).toBeGreaterThanOrEqual(1);
    expect(text).toContain(new Date(NOW).toLocaleDateString('en', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
    }));
    act(() => tree.unmount());
  });

  it('adds a line as it is written, once however it arrives', async () => {
    const first = line('l1', ME, 'Me', NOW, 'hello');
    jest.spyOn(api, 'liveTranscript').mockResolvedValue({ lines: [first], more: false } as never);
    showChannel(transcribed());
    const tree = render(screen());
    showTab(tree, 'Transcript');
    await settle();

    act(() => receiveLiveLine('sess_1', line('l2', THEM, 'Dana Chu', NOW + 5_000, 'hi back')));
    // The same line again, as a reconnect's history page would bring it.
    act(() => receiveLiveLine('sess_1', first));

    const text = textOf(tree);
    expect(text).toContain('hi back');
    expect(text.split('hello').length - 1).toBe(1);
    act(() => tree.unmount());
  });

  it('offers what came before, a page at a time', async () => {
    const spy = jest
      .spyOn(api, 'liveTranscript')
      .mockResolvedValueOnce({ lines: [line('l2', ME, 'Me', NOW, 'newer')], more: true } as never)
      .mockResolvedValueOnce({ lines: [line('l1', ME, 'Me', NOW - 60_000, 'older')], more: false } as never);
    showChannel(transcribed());
    const tree = render(screen());
    showTab(tree, 'Transcript');
    await settle();

    await act(async () => findButton(tree, 'Earlier')!.props.onPress());
    expect(spy).toHaveBeenLastCalledWith('token', 'sess_1', NOW);
    expect(textOf(tree)).toContain('older');
    expect(findButton(tree, 'Earlier')).toBeUndefined();
    act(() => tree.unmount());
  });
});

describe('the indicator', () => {
  it('says Transcribing in the header while the room is being transcribed', () => {
    showChannel(transcribed());
    const tree = render(screen());
    expect(textOf(tree)).toContain('Transcribing');
    act(() => tree.unmount());
  });

  it('gives way to the recording, which says the same and has a Stop', () => {
    showChannel(
      reduce(transcribed(), { type: 'START_RECORDING', userId: ME, runId: 'rec_1' }, NOW)
    );
    const tree = render(screen());
    expect(textOf(tree)).toContain('Recording');
    expect(textOf(tree)).not.toContain('Transcribing');
    act(() => tree.unmount());
  });
});

describe('the switch', () => {
  it('is shown only to somebody who may turn it on, and asks the server', async () => {
    showChannel(channelOf());
    const hidden = render(screen());
    act(() => findButton(hidden, 'Settings')!.props.onPress());
    expect(textOf(hidden)).not.toContain('Live transcript');
    act(() => hidden.unmount());

    const asked = jest
      .spyOn(api, 'setLiveTranscription')
      .mockResolvedValue({ ok: true, liveTranscription: true } as never);
    showChannel(channelOf(), [], { mayTranscribeLive: true });
    const shown = render(screen());
    act(() => findButton(shown, 'Settings')!.props.onPress());
    expect(textOf(shown)).toContain('Live transcript');
    expect(textOf(shown)).toContain('Only you see this setting');

    const buttons = shown.root.findAll(
      (n) => n.props?.label === 'On' && typeof n.props?.onPress === 'function'
    );
    // In the order the screen draws them: Record automatically's, this
    // one's, and a later section's.
    await act(async () => buttons[1].props.onPress());
    expect(asked).toHaveBeenCalledWith('token', 'sess_1', true);
    act(() => shown.unmount());
  });
});

describe('merging lines', () => {
  it('keeps one of each, in the order they were said', () => {
    const a = line('a', ME, 'Me', 2, 'two');
    const b = line('b', ME, 'Me', 1, 'one');
    expect(merge([a], [b, a]).map((l) => l.id)).toEqual(['b', 'a']);
  });
});
