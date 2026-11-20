import React from 'react';
import { act } from 'react-test-renderer';
import { reduce } from '../../../../core/channel';
import type { LiveLine, SegmentView } from '../../../../core/protocol';
import { ChannelView } from '../ChannelView';
import { RoomLine, merge } from '../RecordTab';
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
  menuGlyphs,
  mockApp,
  openMenu,
  openSegments,
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
// The clock a test pins, for what Claude reads (`claudeReads`), goes back after it.
afterEach(() => (Date.now as Partial<jest.Mock>).mockRestore?.());

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
  segments: SegmentView[] = [seg(`${id}_text`, openedAt, closedAt, null, true)]
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
    openSegments(tree);

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
    openSegments(tree);

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
  of its own — its hours, what it kept, its menu — with its text under it.
  The menu opens under the line, as `openMenu` reads it.
*/
describe('rooms on the Record tab', () => {
  const { shareRecording, shareTextFile } = require('../../api/download');
  const { ActionSheetIOS } = require('react-native');

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
    openSegments(tree);

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
    openSegments(tree);

    const text = textOf(tree);
    const both = text.indexOf('· Audio + Text');
    const textOnly = text.indexOf('· Text');
    expect(both).toBeGreaterThanOrEqual(0);
    expect(both).toBeLessThan(text.indexOf('said on the record'));
    expect(text.indexOf('said on the record')).toBeLessThan(textOnly);
    expect(textOnly).toBeLessThan(text.indexOf('said off the record'));
    // One menu each, and none on the room.
    expect(menuGlyphs(tree)).toHaveLength(2);
    act(() => tree.unmount());
  });

  it("names a segment filed in the channel's library by its title there, and opens it", async () => {
    const { Linking } = require('react-native');
    const opened = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
    jest.spyOn(api, 'liveTranscript').mockResolvedValue({
      lines: [line('l1', ME, 'Me', NOW + 5_000, 'said and filed')],
      more: false,
    } as never);
    showChannel(transcribed());
    const url = 'https://noesis.example/web/?library=thefloor%2Fbook-club-k3x9&file=2026%2Fx.chat.md';
    jest.spyOn(api, 'rooms').mockResolvedValue({
      rooms: [
        room('room_1', NOW, NOW + 60_000, [], [
          { ...seg('s1', NOW, NOW + 30_000, null, true), filed: { file: '2026/x.chat.md', title: 'Bach Reads Kant', url } },
          seg('s2', NOW + 30_000, NOW + 60_000, null, true),
        ]),
      ],
    } as never);
    // Not connected to noesis: nothing of noesis's, the title it gave included.
    let tree = render(screen());
    showTab(tree, 'Record');
    await settle();
    expect(textOf(tree)).not.toContain('Bach Reads Kant');
    expect(openMenu(tree, 0).options).toEqual(['Share text', 'Delete']);
    act(() => tree.unmount());

    const noesis = jest
      .spyOn(api, 'noesis')
      .mockResolvedValue({ available: true, connected: true, libraries: [] });
    tree = render(screen());
    showTab(tree, 'Record');
    await settle();

    // Shut, as every closed segment is: the title names it all the same.
    expect(textOf(tree).match(/Bach Reads Kant/g)).toHaveLength(1);
    // Opened from the segment's menu since 2026-11-07, rather than a link
    // under the title; offered by the filed segment's alone.
    expect(findButton(tree, 'Open in noesis')).toBeUndefined();
    // The other, kept as text with nothing said in it, has nothing to offer.
    expect(menuGlyphs(tree)[1].props.accessibilityState.disabled).toBe(true);
    mockApp.noesisLink.mockResolvedValueOnce('https://auth.example/handoff?code=c1');
    openMenu(tree, 0).choose('Open in noesis');
    await settle();
    expect(mockApp.noesisLink).toHaveBeenCalledWith(url);
    expect(opened).toHaveBeenCalledWith('https://auth.example/handoff?code=c1');
    opened.mockRestore();
    noesis.mockRestore();
    act(() => tree.unmount());
  });

  it("fetches the rooms again when a segment is filed, and draws the title it was given", async () => {
    const noesis = jest.spyOn(api, 'noesis').mockResolvedValue({ available: true, connected: true, libraries: [] });
    jest.spyOn(api, 'liveTranscript').mockResolvedValue({
      lines: [line('l1', ME, 'Me', NOW + 5_000, 'said and filed')],
      more: false,
    } as never);
    showChannel(transcribed());
    const unfiled = seg('s1', NOW, NOW + 30_000, null, true);
    const rooms = jest
      .spyOn(api, 'rooms')
      .mockResolvedValue({ rooms: [room('room_1', NOW, NOW + 60_000, [], [unfiled])] } as never);
    const tree = render(screen());
    showTab(tree, 'Record');
    await settle();
    expect(textOf(tree)).not.toContain('Bach Reads Kant');

    // Filed a minute or more after it ended, which nobody did: the snapshot
    // the server pushes for it is all that says so.
    rooms.mockResolvedValue({
      rooms: [
        room('room_1', NOW, NOW + 60_000, [], [
          { ...unfiled, filed: { file: '2026/x.chat.md', title: 'Bach Reads Kant' } },
        ]),
      ],
    } as never);
    const asked = rooms.mock.calls.length;
    mockApp.channelViews['sess_1'] = { ...mockApp.channelViews['sess_1']!, filedAt: NOW + 90_000 };
    act(() => tree.update(screen()));
    await settle();
    expect(rooms.mock.calls.length).toBeGreaterThan(asked);
    expect(textOf(tree)).toContain('Bach Reads Kant');
    act(() => tree.unmount());
    noesis.mockRestore();
  });

  it('closes each segment to its header, which opens it, its actions with it', async () => {
    jest.spyOn(api, 'liveTranscript').mockResolvedValue({
      lines: [
        line('l1', ME, 'Me', NOW + 5_000, 'said on the record'),
        line('l2', ME, 'Me', NOW + 45_000, 'said off the record'),
        line('l3', ME, 'Me', NOW + 75_000, 'said just now'),
      ],
      more: false,
    } as never);
    showChannel(transcribed(), [segment('rec_1', 'Planning', NOW)]);
    jest.spyOn(api, 'rooms').mockResolvedValue({
      rooms: [
        room('room_1', NOW, null, ['rec_1'], [
          seg('s1', NOW, NOW + 30_000, 'rec_1', true),
          seg('s2', NOW + 30_000, NOW + 60_000, null, true),
          seg('s3', NOW + 60_000, null, null, true),
        ]),
      ],
    } as never);
    const tree = render(screen());
    showTab(tree, 'Record');
    await settle();

    // Closed, a segment is its header alone — except the one still being
    // kept, which is open on what is arriving.
    const headers = () =>
      tree.root.findAll(
        (n) =>
          typeof n.type !== 'string' &&
          typeof n.props?.onPress === 'function' &&
          n.props?.accessibilityState?.expanded !== undefined &&
          !menuGlyphs(tree).includes(n)
      );
    expect(headers()).toHaveLength(3);
    expect(textOf(tree)).not.toContain('said on the record');
    expect(textOf(tree)).not.toContain('said off the record');
    expect(textOf(tree)).toContain('said just now');
    expect(textOf(tree)).not.toContain('Planning');

    // A recording's header opens its lines in one press — not its name,
    // which the row stopped drawing on 2026-11-07.
    act(() => headers()[0].props.onPress());
    expect(textOf(tree)).toContain('said on the record');
    expect(textOf(tree)).not.toContain('Planning');
    expect(textOf(tree)).not.toContain('said off the record');

    // And closes them in another.
    act(() => headers()[0].props.onPress());
    expect(textOf(tree)).not.toContain('said on the record');
    expect(textOf(tree)).not.toContain('Planning');

    act(() => headers()[2].props.onPress());
    expect(textOf(tree)).not.toContain('said just now');
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
    openSegments(tree);

    const text = textOf(tree);
    expect(transcript).toHaveBeenCalledWith(expect.anything(), 'rec_old');
    // Kept as audio, and now as text by batch: both, on its line.
    expect(text.indexOf('· Audio + Text')).toBeLessThan(text.indexOf('first in batch'));
    expect(text.indexOf('first in batch')).toBeLessThan(text.indexOf('and Dana'));
    // A stand-in carries its recording's text, never live talk it overlaps.
    expect(text).not.toContain('said during the old one');

    shareTextFile.mockClear();
    openMenu(tree).choose('Share text');
    await settle();
    // A file, stamped as its audio is: the recording's end.
    const [message, , endedAt] = shareTextFile.mock.calls[0];
    expect(endedAt).toBe(old.endedAt);
    expect(message).toContain('first in batch\nthen more');
    expect(message).toContain('and Dana');
    expect(message).not.toContain('said during the old one');
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

    // Inline, one per room, and only ever inline: a line held at the top is
    // the same line moved, not a copy drawn over the scroll.
    expect(tree.root.findAll((n: { type: unknown }) => n.type === RoomLine).map((n) => (n.props.room as { id: string }).id)).toEqual([
      'room_1',
      'room_2',
    ]);
    expect(menuGlyphs(tree)).toHaveLength(2);
    act(() => tree.unmount());
  });

  it("offers a segment's audio and text in its menu, under its hours, and shares its recording", async () => {
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

    const menu = openMenu(tree);
    // The segment's own between Play and the recording's.
    expect(menu.options).toEqual(['Play', 'Share audio', 'Share text', 'Rename', 'Delete']);
    expect(menu.disabled('Share audio')).toBe(false);
    expect(menu.disabled('Share text')).toBe(false);
    menu.choose('Share audio');
    await settle();
    // Under the recording's own name, as everybody who shares it gets it.
    expect(shareRecording).toHaveBeenCalledWith(expect.any(String), 'rec_1', 'Planning', NOW + 40_000);
    act(() => tree.unmount());
  });

  it('offers no audio on a segment with none, and shares its text', async () => {
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
    shareTextFile.mockClear();
    shareRecording.mockClear();
    showChannel(transcribed());
    const tree = render(screen());
    showTab(tree, 'Record');
    await settle();

    const menu = openMenu(tree);
    // Left out rather than greyed: a segment kept as text never will have any.
    expect(menu.options).toEqual(['Share text', 'Delete']);
    menu.choose('Share text');
    await settle();
    expect(shareRecording).not.toHaveBeenCalled();
    // No audio to be named after, so the segment's own end stands in.
    const [message, , endedAt] = shareTextFile.mock.calls[0];
    expect(endedAt).toBe(NOW + 60_000);
    // Where and when, without the filename: the channel, and the year.
    const day = new Date(NOW).toLocaleDateString('sv');
    expect(message).toMatch(new RegExp(`^The Floor — .+\\n${day} · `));
    expect(message).toContain('only written down\nand again');
    expect(message).not.toContain('before the room');
    act(() => tree.unmount());
  });

  // *Delete* since 2026-11-18: one item, and a confirmation the app draws
  // with a box, ticked, for each thing the segment has.
  type Node = {
    type: unknown;
    props: Record<string, unknown> & { children?: unknown };
    findAll: (match: (n: Node) => boolean) => Node[];
  };
  const words = (node: Node) =>
    node
      .findAll((n) => typeof n.props.children === 'string')
      .map((n) => n.props.children as string)
      .join(' ');
  /** The open confirmation — each segment has its own, shut — or none. */
  const confirmation = (tree: ReturnType<typeof render>) => {
    const { Modal } = require('react-native');
    const modal = (tree.root as unknown as Node).findAll((n) => n.type === Modal && n.props.visible === true)[0];
    const hosts = (role: string) =>
      modal
        ? modal.findAll((n) => typeof n.type !== 'string' && n.props.accessibilityRole === role && 'onPress' in n.props)
        : [];
    return {
      visible: !!modal,
      text: modal ? words(modal) : '',
      boxes: () =>
        hosts('checkbox').map((n) => [
          n.props.accessibilityLabel,
          (n.props.accessibilityState as { checked: boolean }).checked,
        ]),
      tick: (label: string) =>
        act(() => {
          (hosts('checkbox').find((n) => n.props.accessibilityLabel === label)!.props.onPress as () => void)();
        }),
      press: async (label: string) => {
        const button = hosts('button').find((n) => words(n).includes(label))!;
        await act(async () => (button.props.onPress as () => void)());
      },
    };
  };

  it("deletes a finished segment's text after asking in a box, and offers it only once it is finished", async () => {
    jest.spyOn(api, 'liveTranscript').mockResolvedValue({
      lines: [
        line('l1', ME, 'Me', NOW + 1_000, 'only written down'),
        line('l2', ME, 'Me', NOW + 31_000, 'still being written'),
      ],
      more: false,
    } as never);
    jest.spyOn(api, 'rooms').mockResolvedValue({
      rooms: [
        room('room_1', NOW, null, [], [
          seg('s1', NOW, NOW + 30_000, null, true),
          seg('s2', NOW + 30_000, null, null, true),
        ]),
      ],
    } as never);
    const deleted = jest.spyOn(api, 'deleteSegment').mockResolvedValue({ ok: true } as never);
    showChannel(transcribed());
    const tree = render(screen());
    showTab(tree, 'Record');
    await settle();

    // Still being written down: more is coming, and the server refuses.
    expect(openMenu(tree, 1).options).not.toContain('Delete');

    const menu = openMenu(tree);
    expect(menu.destructive('Delete')).toBe(true);
    menu.choose('Delete');
    const asked = confirmation(tree);
    expect(asked.visible).toBe(true);
    expect(asked.text).toContain('removed a month from now');
    expect(asked.boxes()).toEqual([['Text', true]]);
    expect(deleted).not.toHaveBeenCalled();
    await asked.press('Delete');
    expect(deleted).toHaveBeenCalledWith('token', 'sess_1', 's1', { audio: false, text: true, document: false });
    expect(confirmation(tree).visible).toBe(false);
    act(() => tree.unmount());
  });

  it('takes the pastes that are part of a segment with its text, and deletes one of its own alone', async () => {
    const pasted = (id: string, at: number, text: string, segmentId?: string) => ({
      id,
      startedAt: at,
      endedAt: at,
      recordingId: null,
      text: false,
      paste: {
        authorId: 'claude',
        displayName: 'Claude',
        text,
        ...(segmentId ? { segmentId, offsetMs: at - NOW } : {}),
      },
    });
    jest.spyOn(api, 'liveTranscript').mockResolvedValue({
      lines: [line('l1', ME, 'Me', NOW + 1_000, 'asked something')],
      more: false,
    } as never);
    jest.spyOn(api, 'rooms').mockResolvedValue({
      rooms: [
        room('room_1', NOW, NOW + 120_000, [], [
          seg('s1', NOW, NOW + 30_000, null, true),
          pasted('p_in', NOW + 10_000, 'An answer inside.', 's1'),
          pasted('p_out', NOW + 60_000, 'An answer after.'),
        ]),
      ],
    } as never);
    const deletedPaste = jest.spyOn(api, 'deletePaste').mockResolvedValue({ ok: true } as never);
    showChannel(transcribed());
    const tree = render(screen());
    showTab(tree, 'Record');
    await settle();

    // Each paste has a menu of its own, the one inside the segment drawn once
    // it is opened; only the one standing alone has a Delete in it.
    openSegments(tree);
    expect(menuGlyphs(tree).map((g) => String(g.props.accessibilityLabel))).toEqual([
      expect.stringMatching(/^Actions for \d/),
      expect.stringMatching(/^Actions for Claude's paste, /),
      expect.stringMatching(/^Actions for Claude's paste, /),
    ]);
    expect(openMenu(tree, 1).options).toEqual(['Copy']);
    expect(openMenu(tree, 2).options).toEqual(['Copy', 'Delete']);

    openMenu(tree).choose('Delete');
    expect(confirmation(tree).text).toContain('What was pasted here goes with the text.');
    confirmation(tree).tick('Text');
    expect(confirmation(tree).text).not.toContain('What was pasted here');
    confirmation(tree).tick('Text');
    await confirmation(tree).press('Keep');

    openMenu(tree, 2).choose('Delete');
    expect(confirmation(tree).text).toContain("Delete Claude's paste?");
    await confirmation(tree).press('Delete');
    expect(deletedPaste).toHaveBeenCalledWith('token', 'sess_1', 'p_out');
    act(() => tree.unmount());
  });

  it("draws Claude's working under its reply, shut, opening to each step in plain words", async () => {
    jest.spyOn(api, 'liveTranscript').mockResolvedValue({ lines: [], more: false } as never);
    jest.spyOn(api, 'rooms').mockResolvedValue({
      rooms: [
        room('room_1', NOW, NOW + 120_000, [], [
          {
            id: 'p_1',
            startedAt: NOW + 10_000,
            endedAt: NOW + 10_000,
            recordingId: null,
            text: false,
            paste: {
              authorId: 'claude',
              displayName: 'Claude',
              text: 'Bach read the first Critique twice.',
              working: [
                {
                  kind: 'search',
                  term: 'bach',
                  library: 'alice/tech',
                  hits: [
                    { name: '2026/b.chat.md', title: 'Bach Reads Kant', words: 900, summary: 'What Bach made of it.', library: 'alice/tech' },
                  ],
                  related: ['kant'],
                  call: 'lookup_term(term="bach") in alice/tech',
                },
                { kind: 'read', name: '2026/b.chat.md', title: 'Bach Reads Kant', library: 'alice/tech', words: 900, call: 'read_file(name="b") in alice/tech' },
                { kind: 'failed', subject: 'gone.chat.md', error: 'No such file', call: 'read_file(name="gone.chat.md")' },
              ],
            },
          },
        ]),
      ],
    } as never);
    showChannel(transcribed());
    const tree = render(screen());
    showTab(tree, 'Record');
    await settle();

    expect(textOf(tree)).toContain('Searched 1 term · Read 1 document · 1 failed');
    expect(textOf(tree)).not.toContain('What Bach made of it.');
    const line = findButton(tree, 'Searched 1 term · Read 1 document · 1 failed')!;
    expect(line.props.accessibilityLabel).toBe("Claude's working: Searched 1 term · Read 1 document · 1 failed");
    expect(line.props.accessibilityState).toEqual({ expanded: false });
    act(() => line.props.onPress());
    const shown = textOf(tree);
    for (const words of [
      'Searched “bach”',
      'Bach Reads Kant',
      'What Bach made of it.',
      'Related: kant',
      'Read Bach Reads Kant',
      'Couldn\'t open “gone.chat.md”',
      'No such file',
    ]) {
      expect(shown).toContain(words);
    }
    // The raw call is for debug alone.
    expect(shown).not.toContain('lookup_term(');
    act(() => tree.unmount());
  });

  it('asks of audio, transcript and document apart, the transcript going with the audio', async () => {
    showChannel(transcribed(), [
      { ...segment('rec_1', 'Planning', NOW + 10_000), transcript: { state: 'ready', provider: 'Memory', requestedBy: { id: ME, displayName: 'Me' } } },
    ]);
    jest.spyOn(api, 'liveTranscript').mockResolvedValue({ lines: [], more: false } as never);
    jest.spyOn(api, 'rooms').mockResolvedValue({
      rooms: [
        room('room_1', NOW, NOW + 60_000, ['rec_1'], [
          {
            ...seg('s1', NOW + 10_000, NOW + 40_000, 'rec_1', false),
            filed: { file: '2026/x.chat.md', title: 'Planning' },
          },
        ]),
      ],
    } as never);
    const deleted = jest.spyOn(api, 'deleteSegment').mockResolvedValue({ ok: true } as never);
    const tree = render(screen());
    showTab(tree, 'Record');
    await settle();

    openMenu(tree).choose('Delete');
    let asked = confirmation(tree);
    expect(asked.boxes()).toEqual([
      ['Audio', true],
      ['Text', true],
      ['Its document in noesis', true],
    ]);
    expect(asked.text).toContain('The transcript goes with the audio.');
    // Sparing the transcript spares the audio it belongs to, and says what
    // asking again would cost.
    asked.tick('Text');
    asked = confirmation(tree);
    expect(asked.boxes()).toEqual([
      ['Audio', false],
      ['Text', false],
      ['Its document in noesis', true],
    ]);
    asked.tick('Audio');
    expect(confirmation(tree).boxes()).toEqual([
      ['Audio', true],
      ['Text', true],
      ['Its document in noesis', true],
    ]);
    // The audio spared alone keeps the recording, and asking again costs.
    confirmation(tree).tick('Audio');
    expect(confirmation(tree).text).toContain('costs the same as the first time');
    expect(confirmation(tree).text).not.toContain('goes with the audio');
    confirmation(tree).tick('Text');
    await confirmation(tree).press('Delete');
    expect(deleted).toHaveBeenCalledWith('token', 'sess_1', 's1', { audio: false, text: false, document: true });
    act(() => tree.unmount());
  });

  it("names a segment's separated voices, under its line, and reads the name given", async () => {
    const { TextInput } = require('react-native');
    const voiced = (id: string, at: number, speaker: string, text: string) => ({
      ...line(id, ME, 'Me', at, text),
      speaker,
    });
    jest.spyOn(api, 'liveTranscript').mockResolvedValue({
      lines: [
        voiced('l1', NOW + 1_000, 'A', 'first voice'),
        voiced('l2', NOW + 2_000, 'B', 'second voice'),
        // One voice alone in its segment is no letter, and nothing to name.
        voiced('l3', NOW + 31_000, 'A', 'alone'),
      ],
      more: false,
    } as never);
    jest.spyOn(api, 'rooms').mockResolvedValue({
      rooms: [
        room('room_1', NOW, NOW + 60_000, [], [
          { ...seg('s1', NOW, NOW + 30_000, null, true), voices: [{ identity: ME, speaker: 'B', name: 'Ana' }] },
          seg('s2', NOW + 30_000, NOW + 60_000, null, true),
        ]),
      ],
    } as never);
    const named = jest.spyOn(api, 'nameVoices').mockResolvedValue({ ok: true } as never);
    showChannel(transcribed());
    const tree = render(screen());
    showTab(tree, 'Record');
    await settle();
    openSegments(tree);

    const text = textOf(tree);
    expect(text).toContain('Me (A)');
    expect(text).toContain('Ana');
    expect(text).not.toContain('Me (B)');
    expect(openMenu(tree, 1).options).not.toContain('Name voices');

    const menu = openMenu(tree);
    expect(menu.options).toEqual(['Share text', 'Name voices', 'Delete']);
    menu.choose('Name voices');
    const fields = tree.root.findAll((node) => node.type === TextInput);
    // Each voice under what it is called with no name, starting on the name given.
    expect(fields.map((field) => field.props.value)).toEqual(['', 'Ana']);
    expect(textOf(tree)).toContain('Me (B)');
    act(() => fields[0].props.onChangeText('Ben'));
    await act(async () => findButton(tree, 'Save')!.props.onPress());
    expect(named).toHaveBeenCalledWith('token', 'sess_1', 's1', [
      { identity: ME, speaker: 'A', name: 'Ben' },
    ]);
    act(() => tree.unmount());
  });

  it('hides a segment from Claude, for everybody, and says so under its line', async () => {
    jest.spyOn(api, 'liveTranscript').mockResolvedValue({
      lines: [
        line('l1', ME, 'Me', NOW + 1_000, 'a tangent'),
        line('l2', ME, 'Me', NOW + 31_000, 'the point'),
        line('l3', ME, 'Me', NOW + 61_000, 'long ago'),
      ],
      more: false,
    } as never);
    jest.spyOn(api, 'rooms').mockResolvedValue({
      rooms: [
        room('room_1', NOW, NOW + 60_000, [], [
          { ...seg('seg_a', NOW, NOW + 30_000, null, true), hiddenFromClaude: true },
          seg('seg_b', NOW + 30_000, NOW + 60_000, null, true),
          // Derived for a room from before segments were: no row to mark.
          seg('derived_c', NOW + 60_000, NOW + 90_000, null, true),
        ]),
      ],
    } as never);
    const hidden = jest.spyOn(api, 'hideFromClaude').mockResolvedValue({ ok: true } as never);
    // Within the last two hours of all three, which a press reads by default.
    jest.spyOn(Date, 'now').mockReturnValue(NOW + 120_000);
    showChannel(transcribed(), [], { claude: true });
    const tree = render(screen());
    showTab(tree, 'Record');
    await settle();

    expect(textOf(tree).match(/Hidden from Claude/g)).toHaveLength(1);
    expect(openMenu(tree, 2).options).not.toContain('Hide from Claude');
    openMenu(tree, 1).choose('Hide from Claude');
    await settle();
    expect(hidden).toHaveBeenCalledWith('token', 'sess_1', 'seg_b', true);
    openMenu(tree).choose('Show to Claude');
    await settle();
    expect(hidden).toHaveBeenCalledWith('token', 'sess_1', 'seg_a', false);
    act(() => tree.unmount());
  });

  it('offers to show Claude a segment older than the last two hours, and says so once it is', async () => {
    jest.spyOn(api, 'liveTranscript').mockResolvedValue({
      lines: [line('l1', ME, 'Me', NOW + 1_000, 'long ago'), line('l2', ME, 'Me', NOW + 31_000, 'shown')],
      more: false,
    } as never);
    jest.spyOn(api, 'rooms').mockResolvedValue({
      rooms: [
        room('room_1', NOW, NOW + 60_000, [], [
          seg('seg_a', NOW, NOW + 30_000, null, true),
          { ...seg('seg_b', NOW + 30_000, NOW + 60_000, null, true), shownToClaude: true },
        ]),
      ],
    } as never);
    const hidden = jest.spyOn(api, 'hideFromClaude').mockResolvedValue({ ok: true } as never);
    jest.spyOn(Date, 'now').mockReturnValue(NOW + 3 * 3_600_000);
    showChannel(transcribed(), [], { claude: true });
    const tree = render(screen());
    showTab(tree, 'Record');
    await settle();

    // The window's edge is no mark: only the one shown says anything.
    expect(textOf(tree).match(/Shown to Claude/g)).toHaveLength(1);
    expect(textOf(tree)).not.toContain('Hidden from Claude');
    openMenu(tree, 0).choose('Show to Claude');
    await settle();
    expect(hidden).toHaveBeenCalledWith('token', 'sess_1', 'seg_a', false);
    openMenu(tree, 1).choose('Hide from Claude');
    await settle();
    expect(hidden).toHaveBeenCalledWith('token', 'sess_1', 'seg_b', true);
    act(() => tree.unmount());
  });

  it('offers nothing about Claude where this server cannot ask it, and still says what is hidden', async () => {
    jest.spyOn(api, 'liveTranscript').mockResolvedValue({ lines: [line('l1', ME, 'Me', NOW + 1_000, 'a tangent')], more: false } as never);
    jest.spyOn(api, 'rooms').mockResolvedValue({
      rooms: [room('room_1', NOW, NOW + 60_000, [], [{ ...seg('seg_a', NOW, NOW + 30_000, null, true), hiddenFromClaude: true }])],
    } as never);
    showChannel(transcribed());
    const tree = render(screen());
    showTab(tree, 'Record');
    await settle();
    expect(openMenu(tree).options).not.toContain('Show to Claude');
    expect(textOf(tree)).toContain('Hidden from Claude');
    act(() => tree.unmount());
  });

  it('shares the text of a segment whose audio is still being filed', async () => {
    // Its recording is named but not listed until egress finishes; the text
    // is kept already and is no less shareable for that.
    jest.spyOn(api, 'liveTranscript').mockResolvedValue({
      lines: [line('l1', ME, 'Me', NOW + 1_000, 'said while recording')],
      more: false,
    } as never);
    jest.spyOn(api, 'rooms').mockResolvedValue({
      rooms: [
        room('room_1', NOW, NOW + 60_000, [], [
          seg('s1', NOW, NOW + 30_000, 'rec_filing', true),
        ]),
      ],
    } as never);
    shareTextFile.mockClear();
    showChannel(transcribed());
    const tree = render(screen());
    showTab(tree, 'Record');
    await settle();

    const menu = openMenu(tree);
    expect(menu.disabled('Share audio')).toBe(true);
    menu.choose('Share text');
    await settle();
    expect(shareTextFile.mock.calls[0][0]).toContain('said while recording');
    act(() => tree.unmount());
  });

  it('opens in the view as buttons under the line, never a sheet, and the glyph closes it', async () => {
    jest.spyOn(api, 'liveTranscript').mockResolvedValue({
      lines: [line('l1', ME, 'Me', NOW + 1_000, 'only written down')],
      more: false,
    } as never);
    jest.spyOn(api, 'rooms').mockResolvedValue({
      rooms: [room('room_1', NOW, NOW + 60_000, [])],
    } as never);
    const sheet = jest.spyOn(ActionSheetIOS, 'showActionSheetWithOptions');
    shareTextFile.mockClear();
    showChannel(transcribed());
    const tree = render(screen());
    showTab(tree, 'Record');
    await settle();

    const choice = () =>
      tree.root.findAll(
        (n: { props: { label?: string; onPress?: unknown } }) =>
          n.props.label === 'Share text' && !!n.props.onPress
      );
    expect(choice()).toHaveLength(0);
    act(() => menuGlyphs(tree)[0].props.onPress());
    expect(choice()).toHaveLength(1);
    act(() => menuGlyphs(tree)[0].props.onPress());
    expect(choice()).toHaveLength(0);

    act(() => menuGlyphs(tree)[0].props.onPress());
    act(() => choice()[0].props.onPress());
    await settle();
    expect(sheet).not.toHaveBeenCalled();
    expect(shareTextFile.mock.calls[0][0]).toContain('only written down');
    // Chosen, it closes.
    expect(choice()).toHaveLength(0);
    sheet.mockRestore();
    act(() => tree.unmount());
  });

  it('offers no Send to noesis, even to somebody connected with sending granted', async () => {
    jest.spyOn(api, 'liveTranscript').mockResolvedValue({
      lines: [line('l1', ME, 'Me', NOW + 1_000, 'worth keeping')],
      more: false,
    } as never);
    jest.spyOn(api, 'rooms').mockResolvedValue({
      rooms: [room('room_1', NOW, NOW + 60_000, [])],
    } as never);
    const noesis = jest.spyOn(api, 'noesis').mockResolvedValue({
      available: true,
      connected: true,
      canSend: true,
      libraries: ['me/essays'],
    });
    showChannel(transcribed());
    const tree = render(screen());
    showTab(tree, 'Record');
    await settle();
    // Gone since 2026-11-10: the channel's library holds it, and a copy of
    // one's own is made at noesis.
    expect(openMenu(tree).options).toEqual(['Share text', 'Delete']);
    act(() => tree.unmount());
    noesis.mockRestore();
  });

  it('shares the text of a segment whose audio is still being mixed, and says why not the audio', async () => {
    jest.spyOn(api, 'liveTranscript').mockResolvedValue({
      lines: [line('l1', ME, 'Me', NOW + 12_000, 'said while recording')],
      more: false,
    } as never);
    jest.spyOn(api, 'rooms').mockResolvedValue({
      rooms: [
        room('room_1', NOW, NOW + 60_000, ['rec_1'], [
          seg('s1', NOW + 10_000, NOW + 40_000, 'rec_1', true),
        ]),
      ],
    } as never);
    shareTextFile.mockClear();
    showChannel(transcribed(), [{ ...segment('rec_1', 'Planning', NOW + 10_000), mixing: true }]);
    const tree = render(screen());
    showTab(tree, 'Record');
    await settle();

    const menu = openMenu(tree);
    expect(menu.disabled('Share audio')).toBe(true);
    expect(menu.disabled('Play')).toBe(true);
    expect(menu.message).toContain('Still being prepared');
    menu.choose('Share text');
    await settle();
    expect(shareTextFile.mock.calls[0][0]).toContain('said while recording');
    act(() => tree.unmount());
  });

  it('greys the menu on a segment that has kept nothing yet', async () => {
    // A recording still running is a segment whose recording is not filed:
    // drawn, with nothing yet to do.
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
    expect(menuGlyphs(tree)[0].props.accessibilityState.disabled).toBe(true);
    act(() => tree.unmount());
  });
});
