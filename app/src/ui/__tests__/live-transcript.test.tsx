import React from 'react';
import { act } from 'react-test-renderer';
import { reduce } from '../../../../core/channel';
import type { LiveLine } from '../../../../core/protocol';
import { ChannelView } from '../ChannelView';
import { HoistedRoom, RoomLine, merge } from '../RecordTab';
import { receiveLiveLine } from '../../live/lines';
import {
  AUDIO,
  ME,
  NOW,
  THEM,
  channelOf,
  findButton,
  findRecording,
  findSwitch,
  findTab,
  mockApp,
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

/** One segment of a room: a stretch kept one way throughout. */
const seg = (
  id: string,
  startedAt: number,
  endedAt: number | null,
  recordingId: string | null,
  text: boolean
) => ({ id, startedAt, endedAt, recordingId, text });

/**
 * A room, by default kept as text from end to end — one segment — unless the
 * test says what its segments were.
 */
const room = (
  id: string,
  openedAt: number,
  closedAt: number | null,
  recordingIds: string[],
  segments = [seg(`${id}_text`, openedAt, closedAt, null, true)]
) => ({ id, openedAt, closedAt, recordingIds, transcribed: true, segments });

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

    // Each recording is a segment's line, kept both ways here, with what was
    // said inside it under it.
    const text = textOf(tree);
    const first = text.indexOf('Audio + Text');
    const second = text.indexOf('Audio + Text', first + 1);
    const order = [
      text.indexOf('before the first'),
      first,
      text.indexOf('between the two'),
      second,
      text.indexOf('after the second'),
    ];
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
    expect(findRecording(tree, 'Long ago')).toBeUndefined();
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
  /*
    **On the *Record* tab since 2026-10-09**, as *Text* beside *Audio*, and no
    longer in *Channel Settings*. Everybody sees it, since everybody is owed
    what it says; only somebody on the house may move it.
  */
  it('is moved only by somebody who may turn it on, and asks the server', async () => {
    showChannel(channelOf());
    const plain = render(screen());
    act(() => findButton(plain, 'Settings')!.props.onPress());
    expect(textOf(plain)).not.toContain('Live transcript');
    act(() => findButton(plain, 'Close')!.props.onPress());
    showTab(plain, 'Record');
    // Selecting it while nothing runs spends nothing, so it is anybody's in
    // the room since 2026-10-11; paying is Play's question.
    expect(findSwitch(plain, 'Text')!.props.disabled).toBe(false);
    act(() => plain.unmount());

    const asked = jest
      .spyOn(api, 'setKeep')
      .mockResolvedValue({ ok: true, keep: { audio: false, text: true } } as never);
    showChannel(channelOf(), [], { mayTranscribeLive: true });
    const house = render(screen());
    act(() => findButton(house, 'Settings')!.props.onPress());
    expect(textOf(house)).not.toContain('Live transcript');
    act(() => findButton(house, 'Close')!.props.onPress());
    showTab(house, 'Record');
    const text = findSwitch(house, 'Text')!;
    expect(text.props.disabled).toBe(false);
    await act(async () => text.props.onValueChange(true));
    expect(asked).toHaveBeenCalledWith('token', 'sess_1', { audio: false, text: true });
    act(() => house.unmount());
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
  to last step out, each headed by a line with its date and its hours, which
  is hoisted over the top once it scrolls off. **And segments, since
  2026-10-10**: within a room, each stretch kept one way throughout is a line
  of its own — its hours, what it kept, its share — with its text under it.
*/
describe('rooms on the Record tab', () => {
  const { shareRecording } = require('../../api/download');
  const { ActionSheetIOS, Share } = require('react-native');

  /** A segment's share, named by its hours. The tests run as iOS. */
  const sharesOf = (tree: ReturnType<typeof render>) =>
    tree.root.findAll(
      (node: { props: Record<string, unknown> }) =>
        /^Share \d/.test(String(node.props.accessibilityLabel ?? '')) && !!node.props.onPress
    );
  const shareOf = (tree: ReturnType<typeof render>) => sharesOf(tree)[0];

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

  it('opens with an old recording as a room of its own, without the talk around it', async () => {
    jest.spyOn(api, 'liveTranscript').mockResolvedValue({
      lines: [
        line('l0', ME, 'Me', NOW - 86_400_000 + 5_000, 'said during the old one'),
        line('l1', ME, 'Me', NOW + 1_000, 'in the sitting'),
      ],
      more: false,
    } as never);
    const old = NOW - 86_400_000;
    showChannel(transcribed(), [segment('rec_old', 'Before rooms', old)]);
    jest.spyOn(api, 'rooms').mockResolvedValue({
      rooms: [
        {
          ...room('standin_rec_old', old, old + 30_000, ['rec_old'], [
            seg('standin_rec_old', old, old + 30_000, 'rec_old', false),
          ]),
          transcribed: false,
          standIn: true,
        },
        room('room_1', NOW, NOW + 60_000, []),
      ],
    } as never);
    const tree = render(screen());
    showTab(tree, 'Record');
    await settle();

    const text = textOf(tree);
    expect(findRecording(tree, 'Before rooms')).toBeDefined();
    expect(text.indexOf('· Audio')).toBeGreaterThanOrEqual(0);
    expect(text.indexOf('· Audio')).toBeLessThan(text.indexOf('in the sitting'));
    expect(text).not.toContain('said during the old one');
    act(() => tree.unmount());
  });

  it('draws a line for each segment of a room, saying what it kept', async () => {
    jest.spyOn(api, 'liveTranscript').mockResolvedValue({
      lines: [
        line('l1', ME, 'Me', NOW + 5_000, 'said on the record'),
        line('l2', ME, 'Me', NOW + 45_000, 'said off the record'),
      ],
      more: false,
    } as never);
    showChannel(transcribed(), [segment('rec_1', 'Planning', NOW)]);
    jest.spyOn(api, 'rooms').mockResolvedValue({
      rooms: [
        room('room_1', NOW, NOW + 60_000, ['rec_1'], [
          seg('s1', NOW, NOW + 30_000, 'rec_1', true),
          seg('s2', NOW + 30_000, NOW + 60_000, null, true),
        ]),
      ],
    } as never);
    const tree = render(screen());
    showTab(tree, 'Record');
    await settle();

    const text = textOf(tree);
    const both = text.indexOf('· Audio + Text');
    const textOnly = text.indexOf('· Text');
    expect(both).toBeGreaterThanOrEqual(0);
    expect(both).toBeLessThan(text.indexOf('said on the record'));
    expect(text.indexOf('said on the record')).toBeLessThan(textOnly);
    expect(textOnly).toBeLessThan(text.indexOf('said off the record'));
    // One share each, and none on the room.
    expect(sharesOf(tree)).toHaveLength(2);
    act(() => tree.unmount());
  });

  /*
    **A batch transcript is drawn as the live one is, since 2026-10-10**:
    under its recording's line, each speaker's run under their name and the
    clock time it began, and shared as the segment's text.
  */
  it("draws a recording's batch transcript under it, as live lines are", async () => {
    jest.spyOn(api, 'liveTranscript').mockResolvedValue({
      lines: [line('l0', ME, 'Me', NOW - 86_400_000 + 5_000, 'said during the old one')],
      more: false,
    } as never);
    const transcript = jest.spyOn(api, 'transcript').mockResolvedValue({
      state: 'ready',
      requestedBy: null,
      missing: [],
      lines: [
        { identity: ME, displayName: 'Me', startMs: 1_000, endMs: 2_000, text: 'first in batch', confidence: 0.9 },
        { identity: ME, displayName: 'Me', startMs: 3_000, endMs: 4_000, text: 'then more', confidence: 0.9 },
        { identity: THEM, displayName: 'Dana Chu', startMs: 9_000, endMs: 10_000, text: 'and Dana', confidence: 0.9 },
      ],
    } as never);
    const at = NOW - 86_400_000;
    const old = {
      ...segment('rec_old', 'Before rooms', at),
      transcript: { state: 'ready' as const, provider: 'AssemblyAI', requestedBy: null },
    };
    showChannel(transcribed(), [old]);
    jest.spyOn(api, 'rooms').mockResolvedValue({
      rooms: [
        {
          ...room('standin_rec_old', at, at + 30_000, ['rec_old'], [
            seg('standin_rec_old', at, at + 30_000, 'rec_old', false),
          ]),
          standIn: true,
        },
      ],
    } as never);
    const tree = render(screen());
    showTab(tree, 'Record');
    await settle();

    const text = textOf(tree);
    expect(transcript).toHaveBeenCalledWith(expect.anything(), 'rec_old');
    // Kept as audio, and now as text by batch: both, on its line.
    expect(text.indexOf('· Audio + Text')).toBeLessThan(text.indexOf('first in batch'));
    expect(text.indexOf('first in batch')).toBeLessThan(text.indexOf('and Dana'));
    // A stand-in carries its recording's text, never live talk it overlaps.
    expect(text).not.toContain('said during the old one');

    const sheet = jest
      .spyOn(ActionSheetIOS, 'showActionSheetWithOptions')
      .mockImplementation((...args: unknown[]) => (args[1] as (index: number) => void)(1));
    const handed = jest.spyOn(Share, 'share').mockResolvedValue({ action: Share.sharedAction } as never);
    await act(async () => shareOf(tree).props.onPress());
    const message = (handed.mock.calls[0][0] as { message: string }).message;
    expect(message).toContain('first in batch\nthen more');
    expect(message).toContain('and Dana');
    expect(message).not.toContain('said during the old one');
    sheet.mockRestore();
    handed.mockRestore();
    transcript.mockRestore();
    act(() => tree.unmount());
  });

  it("puts each room's line at the head of the room", async () => {
    showChannel(channelOf(), [
      segment('rec_1', 'Planning', NOW + 10_000),
      segment('rec_2', 'Review', NOW + 1_000_000),
    ]);
    jest.spyOn(api, 'rooms').mockResolvedValue({
      rooms: [
        room('room_1', NOW, NOW + 60_000, ['rec_1'], [
          seg('s1', NOW + 10_000, NOW + 40_000, 'rec_1', false),
        ]),
        room('room_2', NOW + 900_000, NOW + 1_100_000, ['rec_2'], [
          seg('s2', NOW + 1_000_000, NOW + 1_030_000, 'rec_2', false),
        ]),
      ],
    } as never);
    const tree = render(screen());
    showTab(tree, 'Record');
    await settle();

    // Inline, one per room; nothing is hoisted until something has scrolled
    // off the top, which in a renderer that measures nothing is never.
    expect(tree.root.findAll((n: { type: unknown }) => n.type === RoomLine).map((n) => (n.props.room as { id: string }).id)).toEqual([
      'room_1',
      'room_2',
    ]);
    expect(tree.root.findAll((n: { type: unknown }) => n.type === HoistedRoom)[0].props.room).toBeNull();
    expect(sharesOf(tree)).toHaveLength(2);
    act(() => tree.unmount());
  });

  it("offers a segment's audio and text under its hours, and shares its recording", async () => {
    const sheet = jest
      .spyOn(ActionSheetIOS, 'showActionSheetWithOptions')
      .mockImplementation((...args: unknown[]) => (args[1] as (index: number) => void)(0));
    showChannel(transcribed(), [segment('rec_1', 'Planning', NOW + 10_000)]);
    jest.spyOn(api, 'liveTranscript').mockResolvedValue({
      lines: [line('l1', ME, 'Me', NOW + 12_000, 'said')],
      more: false,
    } as never);
    jest.spyOn(api, 'rooms').mockResolvedValue({
      rooms: [
        room('room_1', NOW, NOW + 60_000, ['rec_1'], [
          seg('s1', NOW + 10_000, NOW + 40_000, 'rec_1', true),
        ]),
      ],
    } as never);
    shareRecording.mockClear();
    const tree = render(screen());
    showTab(tree, 'Record');
    await settle();

    const share = shareOf(tree);
    expect(share.props.accessibilityState.disabled).toBe(false);
    await act(async () => share.props.onPress());
    expect(sheet.mock.calls[0][0]).toMatchObject({
      title: expect.stringMatching(/^Share \d/),
      options: ['Audio', 'Text', 'Cancel'],
      disabledButtonIndices: [],
    });
    expect(String((sheet.mock.calls[0][0] as { title?: string }).title)).not.toMatch(/room/i);
    expect(shareRecording).toHaveBeenCalledWith(
      expect.any(String),
      'rec_1',
      expect.any(String),
      NOW + 40_000
    );
    sheet.mockRestore();
    act(() => tree.unmount());
  });

  it('greys audio on a segment with none, and shares its text', async () => {
    jest.spyOn(api, 'liveTranscript').mockResolvedValue({
      lines: [
        line('l0', ME, 'Me', NOW - 5_000, 'before the room'),
        line('l1', ME, 'Me', NOW + 1_000, 'only written down'),
        line('l2', ME, 'Me', NOW + 2_000, 'and again'),
      ],
      more: false,
    } as never);
    jest.spyOn(api, 'rooms').mockResolvedValue({
      rooms: [room('room_1', NOW, NOW + 60_000, [])],
    } as never);
    const sheet = jest
      .spyOn(ActionSheetIOS, 'showActionSheetWithOptions')
      .mockImplementation((...args: unknown[]) => (args[1] as (index: number) => void)(1));
    const handed = jest.spyOn(Share, 'share').mockResolvedValue({ action: Share.sharedAction } as never);
    shareRecording.mockClear();
    showChannel(transcribed());
    const tree = render(screen());
    showTab(tree, 'Record');
    await settle();

    await act(async () => shareOf(tree).props.onPress());
    expect(sheet.mock.calls[0][0]).toMatchObject({ disabledButtonIndices: [0] });
    expect(shareRecording).not.toHaveBeenCalled();
    const message = (handed.mock.calls[0][0] as { message: string }).message;
    expect(message).toContain('only written down\nand again');
    expect(message).not.toContain('before the room');
    sheet.mockRestore();
    handed.mockRestore();
    act(() => tree.unmount());
  });

  it('greys the share on a segment that has kept nothing yet', async () => {
    // A recording still running is a segment whose recording is not filed:
    // drawn, with nothing yet to share.
    jest.spyOn(api, 'rooms').mockResolvedValue({
      rooms: [
        {
          ...room('room_1', NOW, null, [], [seg('s1', NOW + 1_000, null, 'rec_running', false)]),
          transcribed: false,
        },
      ],
    } as never);
    showChannel(channelOf());
    const tree = render(screen());
    showTab(tree, 'Record');
    await settle();
    expect(shareOf(tree).props.accessibilityState.disabled).toBe(true);
    act(() => tree.unmount());
  });
});

/*
  **Several voices on my microphone**, since 2026-10-16: under Audio and
  Text, your own track told apart into voices for this sitting. Only while
  you are here, and only ever your own.
*/
describe('several voices on my microphone', () => {
  it('is drawn while you are here, says what is chosen, and asks for the change', () => {
    mockApp.act.mockClear();
    showChannel(channelOf());
    const tree = render(screen());
    showTab(tree, 'Record');
    const off = findSwitch(tree, 'Several voices on my microphone')!;
    expect(off.props.value).toBe(false);
    act(() => off.props.onValueChange(true));
    expect(mockApp.act).toHaveBeenCalledWith('sess_1', { type: 'SET_DIARIZE', on: true });
    act(() => tree.unmount());

    showChannel(channelOf((s) => reduce(s, { type: 'SET_DIARIZE', userId: ME, on: true }, NOW)));
    const on = render(screen());
    showTab(on, 'Record');
    expect(findSwitch(on, 'Several voices on my microphone')!.props.value).toBe(true);
    act(() => on.unmount());
  });

  it('is not drawn while you are away', () => {
    showChannel(channelOf((s) => reduce(s, { type: 'STEP_OUT', userId: ME }, NOW)));
    const tree = render(screen());
    showTab(tree, 'Record');
    expect(findSwitch(tree, 'Several voices on my microphone')).toBeUndefined();
    act(() => tree.unmount());
  });

  it('letters a stem in the log only where it holds more than one voice', async () => {
    jest.spyOn(api, 'liveTranscript').mockResolvedValue({
      lines: [
        { ...line('l1', 'media', 'Played audio', NOW, 'welcome to the show'), speaker: 'A' },
        { ...line('l2', 'media', 'Played audio', NOW + 2_000, 'glad to be here'), speaker: 'B' },
        { ...line('l3', ME, 'Me', NOW + 4_000, 'just me here'), speaker: 'A' },
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
    expect(text).toContain('Played audio (A)');
    expect(text).toContain('Played audio (B)');
    expect(text).not.toContain('Me (A)');
    act(() => tree.unmount());
  });
});
