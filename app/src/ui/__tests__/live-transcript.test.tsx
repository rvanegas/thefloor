import React from 'react';
import { act } from 'react-test-renderer';
import { reduce } from '../../../../core/channel';
import type { LiveLine } from '../../../../core/protocol';
import { ChannelView } from '../ChannelView';
import { merge } from '../RecordTab';
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

const room = (
  id: string,
  openedAt: number,
  closedAt: number | null,
  recordingIds: string[]
) => ({ id, openedAt, closedAt, recordingIds, transcribed: true });

/** Lets the history fetch settle. */
const settle = () => act(async () => {});

const segment = (id: string, name: string, startedAt: number) => ({
  id,
  channelId: 'sess_1',
  name,
  others: [{ id: THEM, displayName: 'Dana Chu' }],
  startedAt,
  endedAt: startedAt + 30_000,
  durationMs: 30_000,
});

/*
  **The Transcript tab went into *Record* on 2026-10-09**, which is
  always offered: a recording is the conversation kept as audio and the live
  transcript is the same conversation kept as text, and the one tab shows
  whichever this channel keeps, with each recording a segment at the moment
  it began.
*/
describe('the Record tab', () => {
  it('is offered whether or not there is a live transcript, and there is no Transcript tab', () => {
    showChannel(channelOf());
    const tree = render(screen());
    expect(findTab(tree, 'Record')).toBeDefined();
    expect(findTab(tree, 'Transcript')).toBeUndefined();
    showTab(tree, 'Record');
    // Nothing fetched and nothing said about a transcript nobody turned on.
    expect(textOf(tree)).toContain('Nothing kept yet');
    act(() => tree.unmount());
  });

  it('draws the transcript while it is on, and after it, while there is any', async () => {
    const spy = jest
      .spyOn(api, 'liveTranscript')
      .mockResolvedValue({ lines: [line('l1', ME, 'Me', NOW, 'hello')], more: false } as never);
    showChannel(channelOf(), [], { liveTranscript: true });
    const after = render(screen());
    showTab(after, 'Record');
    await settle();
    expect(spy).toHaveBeenCalled();
    expect(textOf(after)).toContain('hello');
    act(() => after.unmount());
  });

  it('stands each recording in the transcript at the moment it began', async () => {
    jest.spyOn(api, 'liveTranscript').mockResolvedValue({
      lines: [
        line('l1', ME, 'Me', NOW, 'before the first'),
        line('l2', ME, 'Me', NOW + 20_000, 'between the two'),
        line('l3', THEM, 'Dana Chu', NOW + 60_000, 'after the second'),
      ],
      more: false,
    } as never);
    showChannel(transcribed(), [
      segment('rec_2', 'Second stretch', NOW + 40_000),
      segment('rec_1', 'First stretch', NOW + 10_000),
    ]);
    const tree = render(screen());
    showTab(tree, 'Record');
    await settle();

    const text = textOf(tree);
    const order = [
      'before the first',
      'First stretch',
      'between the two',
      'Second stretch',
      'after the second',
    ].map((said) => text.indexOf(said));
    expect(order.every((at) => at >= 0)).toBe(true);
    expect([...order].sort((x, y) => x - y)).toEqual(order);
    act(() => tree.unmount());
  });

  it('holds back a recording older than the transcript loaded so far', async () => {
    jest.spyOn(api, 'liveTranscript').mockResolvedValue({
      lines: [line('l2', ME, 'Me', NOW, 'newer')],
      more: true,
    } as never);
    showChannel(transcribed(), [segment('rec_1', 'Long ago', NOW - 600_000)]);
    const tree = render(screen());
    showTab(tree, 'Record');
    await settle();
    expect(textOf(tree)).toContain('newer');
    expect(textOf(tree)).not.toContain('Long ago');
    act(() => tree.unmount());
  });

  it('reads as a log: grouped by speaker, under the room and its date', async () => {
    jest.spyOn(api, 'liveTranscript').mockResolvedValue({
      lines: [
        line('l1', ME, 'Me', NOW, 'so the plan is'),
        line('l2', ME, 'Me', NOW + 2_000, 'we start on Monday'),
        line('l3', THEM, 'Dana Chu', NOW + 4_000, 'Monday works'),
      ],
      more: false,
    } as never);
    jest.spyOn(api, 'rooms').mockResolvedValue({
      rooms: [room('room_1', NOW - 1_000, NOW + 60_000, [])],
    } as never);
    showChannel(transcribed());
    const tree = render(screen());
    showTab(tree, 'Record');
    await settle();

    const text = textOf(tree);
    expect(text).toContain('so the plan is');
    expect(text).toContain('we start on Monday');
    expect(text).toContain('Monday works');
    // One entry for two lines in a row from one person: the name once.
    expect(text.split('Me ').length - 1).toBeGreaterThanOrEqual(1);
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
    showTab(tree, 'Record');
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
    showTab(tree, 'Record');
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

  it('gives way to the recording, which says the same', () => {
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

/*
  **Rooms, since 2026-10-09**: the log is laid out in sittings, first step in
  to last step out, and the pinned bar over it names the one at the top and
  shares its audio.
*/
describe('rooms on the Record tab', () => {
  const { shareRoom } = require('../../api/download');
  const { Alert } = require('react-native');

  it('starts each room with its date and hours, and leaves out what fell in none', async () => {
    jest.spyOn(api, 'liveTranscript').mockResolvedValue({
      lines: [
        line('l0', ME, 'Me', NOW - 3_600_000, 'before rooms existed'),
        line('l1', ME, 'Me', NOW, 'in the first'),
        line('l2', THEM, 'Dana Chu', NOW + 600_000, 'in the second'),
      ],
      more: false,
    } as never);
    jest.spyOn(api, 'rooms').mockResolvedValue({
      rooms: [
        room('room_1', NOW - 1_000, NOW + 60_000, []),
        room('room_2', NOW + 500_000, null, []),
      ],
    } as never);
    showChannel(transcribed());
    const tree = render(screen());
    showTab(tree, 'Record');
    await settle();

    const text = textOf(tree);
    expect(text).not.toContain('before rooms existed');
    expect(text.indexOf('in the first')).toBeLessThan(text.indexOf('in the second'));
    // The second is still going, so it has no end yet.
    expect(text).toContain('now');
    act(() => tree.unmount());
  });

  it("shares the audio of the room on the bar, whole", async () => {
    showChannel(channelOf(), [segment('rec_1', 'Planning', NOW + 10_000)]);
    jest.spyOn(api, 'rooms').mockResolvedValue({
      rooms: [room('room_1', NOW, NOW + 60_000, ['rec_1'])],
    } as never);
    const tree = render(screen());
    showTab(tree, 'Record');
    await settle();

    const share = tree.root.findAll(
      (node: { props: Record<string, unknown> }) =>
        node.props.accessibilityLabel === "Share this room's audio" && !!node.props.onPress
    )[0];
    expect(share.props.accessibilityState.disabled).toBe(false);
    await act(async () => share.props.onPress());
    expect(shareRoom).toHaveBeenCalledWith(expect.any(String), 'sess_1', 'room_1', expect.any(String), NOW);
    act(() => tree.unmount());
  });

  it('keeps the share icon on a room with no audio, and says why when pressed', async () => {
    jest.spyOn(api, 'liveTranscript').mockResolvedValue({
      lines: [line('l1', ME, 'Me', NOW + 1_000, 'only written down')],
      more: false,
    } as never);
    jest.spyOn(api, 'rooms').mockResolvedValue({
      rooms: [room('room_1', NOW, NOW + 60_000, [])],
    } as never);
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    shareRoom.mockClear();
    showChannel(transcribed());
    const tree = render(screen());
    showTab(tree, 'Record');
    await settle();

    const share = tree.root.findAll(
      (node: { props: Record<string, unknown> }) =>
        node.props.accessibilityLabel === "Share this room's audio" && !!node.props.onPress
    )[0];
    expect(share.props.accessibilityState.disabled).toBe(true);
    await act(async () => share.props.onPress());
    expect(alert).toHaveBeenCalledWith('No audio', expect.stringContaining('Nothing was recorded'));
    expect(shareRoom).not.toHaveBeenCalled();
    act(() => tree.unmount());
  });
});
