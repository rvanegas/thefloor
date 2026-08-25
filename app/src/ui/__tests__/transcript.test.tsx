import React from 'react';
import renderer, {
  act,
  type ReactTestInstance,
  type ReactTestRenderer,
} from 'react-test-renderer';
import { Alert } from 'react-native';
import type { RecordingView } from '../../../../core/protocol';
import { RecordingRow, Screen, TranscriptSearch } from '../components';
import { TranscriptView } from '../TranscriptView';

/**
 * The transcript, from the row that starts one to the screen that reads it.
 *
 * Two things here are worth a test rather than a look: that asking names the
 * provider before it spends anything, because whoever taps is deciding for
 * everybody who was in the room; and that jumping to a line is offered only
 * when it would do what it says.
 */

const ME = 'acct_me';
const NOW = 1_700_000_000_000;

const mockStart = jest.fn(async () => ({ ok: true as const }));
const mockDelete = jest.fn(async () => ({ ok: true as const }));
const mockGet = jest.fn(async () => ({
  state: 'ready' as const,
  requestedBy: { id: ME, displayName: 'Me' },
  missing: [],
  lines: [
    {
      identity: ME,
      displayName: 'Me',
      speaker: 'A',
      startMs: 4_000,
      endMs: 5_000,
      text: 'the part about the badgers',
      confidence: 0.9,
    },
    {
      identity: 'acct_them',
      displayName: 'Dana Chu',
      speaker: 'A',
      startMs: 9_000,
      endMs: 10_000,
      text: 'and then the owls',
      confidence: 0.9,
    },
  ],
}));

jest.mock('../../api/http', () => ({
  api: {
    startTranscript: (...args: unknown[]) => mockStart(...(args as [])),
    deleteTranscript: (...args: unknown[]) => mockDelete(...(args as [])),
    transcript: (...args: unknown[]) => mockGet(...(args as [])),
    declareVoices: (...args: unknown[]) => mockDeclare(...(args as [])),
    searchTranscripts: (...args: unknown[]) => mockSearch(...(args as [])),
  },
}));

const mockSearch = jest.fn(async () => ({
  hits: [
    {
      recordingId: 'rec_1',
      recordingName: 'Book club',
      identity: 'acct_them',
      displayName: 'Dana Chu',
      speaker: 'A',
      startMs: 9_000,
      endMs: 10_000,
      text: 'and then the owls',
      confidence: 0.9,
    },
  ],
}));

const mockDeclare = jest.fn(async () => ({ ok: true as const }));

const mockExport = jest.fn(async () => {});
jest.mock('../../api/download', () => ({
  exportRecording: jest.fn(async () => {}),
  exportTranscript: (...args: unknown[]) => mockExport(...(args as [])),
}));

jest.mock('../../state/AppProvider', () => ({
  useApp: () => ({ token: 'token', me: { id: 'acct_me', displayName: 'Me' } }),
}));

function textOf(tree: ReactTestRenderer): string {
  const strings: string[] = [];
  const walk = (node: unknown): void => {
    if (typeof node === 'string') strings.push(node);
    else if (Array.isArray(node)) node.forEach(walk);
    else if (node && typeof node === 'object' && 'children' in node) {
      walk((node as { children: unknown }).children);
    }
  };
  walk(tree.toJSON());
  return strings.join(' ');
}

/** The visible text inside one instance, used to identify a button by label. */
function labelOf(instance: ReactTestInstance): string {
  const out: string[] = [];
  const walk = (node: unknown): void => {
    if (typeof node === 'string') out.push(node);
    else if (Array.isArray(node)) node.forEach(walk);
    else if (node && typeof node === 'object') {
      const props = (node as { props?: { children?: unknown } }).props;
      if (props?.children !== undefined) walk(props.children);
    }
  };
  walk(instance.props.children);
  return out.join(' ');
}

function findButton(
  tree: ReactTestRenderer,
  label: string
): ReactTestInstance | undefined {
  return tree.root
    .findAll((n) => n.props?.accessibilityRole === 'button')
    .find(
      (n) =>
        labelOf(n).includes(label) ||
        String(n.props?.accessibilityLabel ?? '').includes(label)
    );
}

function recordingWith(
  state?: 'none' | 'pending' | 'ready' | 'failed',
  extra: Record<string, unknown> = {}
): RecordingView {
  return {
    id: 'rec_1',
    channelId: 'sess_1',
    name: 'Book club',
    others: [{ id: 'acct_them', displayName: 'Dana Chu' }],
    startedAt: NOW,
    endedAt: NOW + 92_000,
    durationMs: 92_000,
    ...(state
      ? {
          transcript: {
            state,
            provider: 'AssemblyAI',
            requestedBy: state === 'none' ? null : { id: ME, displayName: 'Me' },
            ...extra,
          },
        }
      : {}),
  };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('the button on a recording', () => {
  /** Opens the row's drawer, which is where every action lives. */
  const open = (recording: RecordingView, onOpenTranscript = () => {}) => {
    // Inside a Screen, as it is in the app: the row measures itself against
    // the scroll view to bring its own drawer into view. And inside `act`,
    // without which the renderer is torn down before anything can be found.
    let tree!: ReactTestRenderer;
    act(() => {
      tree = renderer.create(
        <Screen>
          <RecordingRow
            recording={recording}
            onOpenTranscript={onOpenTranscript}
          />
        </Screen>
      );
    });
    act(() => findButton(tree, 'Book club')!.props.onPress());
    return tree;
  };

  it('is not offered at all by a server that cannot transcribe', () => {
    // Absent and 'none' are different answers. This is absent.
    const tree = open(recordingWith());
    expect(findButton(tree, 'Transcribe')).toBeUndefined();
    act(() => tree.unmount());
  });

  it('names the provider before it spends anything', () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const tree = open(recordingWith('none'));

    act(() => findButton(tree, 'Transcribe')!.props.onPress());

    const [title, body] = alert.mock.calls[0];
    expect(title).toContain('Transcribe this recording');
    // The company by name, the fact that it is shared, and the cost. Whoever
    // taps is deciding for everybody who was in the room.
    expect(body).toContain('AssemblyAI');
    expect(body).toContain('everybody in the channel will see');
    expect(body).toContain('costs a little');
    // Nothing was started by opening the dialog.
    expect(mockStart).not.toHaveBeenCalled();

    act(() => tree.unmount());
    alert.mockRestore();
  });

  it('starts one once the dialog is confirmed', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const tree = open(recordingWith('none'));
    act(() => findButton(tree, 'Transcribe')!.props.onPress());

    const buttons = alert.mock.calls[0][2] as Array<{
      text: string;
      onPress?: () => void;
    }>;
    await act(async () => {
      buttons.find((b) => b.text === 'Transcribe')!.onPress!();
    });

    expect(mockStart).toHaveBeenCalledWith('token', 'rec_1');
    act(() => tree.unmount());
    alert.mockRestore();
  });

  it('says it is working, and offers nothing to press meanwhile', () => {
    const tree = open(recordingWith('pending'));
    const button = findButton(tree, 'Transcribing…');
    expect(button).toBeDefined();
    expect(button!.props.accessibilityState).toEqual({ disabled: true });
    act(() => tree.unmount());
  });

  it('opens the transcript once there is one', () => {
    const opened = jest.fn();
    const tree = open(recordingWith('ready'), opened);
    act(() => findButton(tree, 'Transcript')!.props.onPress());
    expect(opened).toHaveBeenCalled();
    act(() => tree.unmount());
  });

  it('is withheld entirely from somebody who may not spend', () => {
    // Nothing rather than a disabled button: everywhere else a disabled
    // control means "not now" and carries a sentence saying why. This is
    // "not you, ever, on this server".
    const tree = open(recordingWith('none', { mayRequest: false }));
    expect(findButton(tree, 'Transcribe')).toBeUndefined();
    act(() => tree.unmount());
  });

  it('still opens a transcript they may not have started', () => {
    // Reading is never restricted. A transcript is a shared artefact of a
    // shared conversation.
    const opened = jest.fn();
    const tree = open(recordingWith('ready', { mayRequest: false }), opened);
    act(() => findButton(tree, 'Transcript')!.props.onPress());
    expect(opened).toHaveBeenCalled();
    act(() => tree.unmount());
  });

  it('is withheld from somebody who is not in the room', () => {
    // The manage rule, the same one renaming and deleting use: this changes
    // what everybody's screen says.
    let tree!: ReactTestRenderer;
    act(() => {
      tree = renderer.create(
        <Screen>
          <RecordingRow
            recording={recordingWith('none')}
            manageable={false}
            onOpenTranscript={() => {}}
          />
        </Screen>
      );
    });
    act(() => findButton(tree, 'Book club')!.props.onPress());
    expect(findButton(tree, 'Transcribe')!.props.accessibilityState).toEqual({
      disabled: true,
    });
    act(() => tree.unmount());
  });
});

describe('searching a whole channel', () => {
  const show = async () => {
    let tree!: ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(
        <Screen>
          <TranscriptSearch channelId="sess_1" onOpen={opened} />
        </Screen>
      );
    });
    return tree;
  };

  const opened = jest.fn();

  /** Types, then lets the debounce elapse. */
  const type = async (tree: ReactTestRenderer, text: string) => {
    const field = tree.root.findAll((n) => n.props?.onChangeText)[0];
    act(() => field.props.onChangeText(text));
    await act(async () => {
      jest.advanceTimersByTime(400);
    });
  };

  beforeEach(() => {
    jest.useFakeTimers();
    opened.mockClear();
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it('asks nothing until somebody stops typing', async () => {
    // A keystroke is not a question. Without this, searching for one word runs
    // a query per letter on the way to it.
    const tree = await show();
    const field = tree.root.findAll((n) => n.props?.onChangeText)[0];

    act(() => field.props.onChangeText('o'));
    act(() => field.props.onChangeText('ow'));
    act(() => field.props.onChangeText('owl'));
    expect(mockSearch).not.toHaveBeenCalled();

    await act(async () => {
      jest.advanceTimersByTime(400);
    });
    expect(mockSearch).toHaveBeenCalledTimes(1);
    expect(mockSearch).toHaveBeenCalledWith('token', 'sess_1', 'owl');
    act(() => tree.unmount());
  });

  it('asks nothing at all for an empty query', async () => {
    const tree = await show();
    await type(tree, '   ');
    expect(mockSearch).not.toHaveBeenCalled();
    act(() => tree.unmount());
  });

  it('says which conversation each hit came from', async () => {
    // The one thing a per-recording filter cannot do, which is the whole
    // reason this exists separately from the field on the transcript screen.
    const tree = await show();
    await type(tree, 'owls');

    const text = textOf(tree);
    expect(text).toContain('and then the owls');
    expect(text).toContain('Book club');
    expect(text).toContain('Dana Chu');
    act(() => tree.unmount());
  });

  it('opens the recording a hit was said in', async () => {
    const tree = await show();
    await type(tree, 'owls');

    act(() => findButton(tree, 'and then the owls')!.props.onPress());
    expect(opened).toHaveBeenCalledWith('rec_1');
    act(() => tree.unmount());
  });

  it('says so when nothing matches', async () => {
    mockSearch.mockResolvedValueOnce({ hits: [] });
    const tree = await show();
    await type(tree, 'penguins');
    expect(textOf(tree)).toContain('Nothing matches');
    act(() => tree.unmount());
  });
});

describe('the transcript screen', () => {
  const show = async (
    recording: RecordingView,
    onSeek?: (positionMs: number) => void
  ) => {
    let tree!: ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(
        <TranscriptView
          recording={recording}
          onBack={() => {}}
          onSeek={onSeek}
          manageable
        />
      );
    });
    return tree;
  };

  it('shows what was said, by whom, and when', async () => {
    const tree = await show(recordingWith('ready'));
    const text = textOf(tree);

    expect(text).toContain('the part about the badgers');
    expect(text).toContain('Dana Chu');
    expect(text).toContain('0:04');
    act(() => tree.unmount());
  });

  it('filters to what somebody typed, without telling anybody', async () => {
    const tree = await show(recordingWith('ready'));
    const field = tree.root.findAll((n) => n.props?.onChangeText)[0];

    act(() => field.props.onChangeText('owls'));

    const text = textOf(tree);
    expect(text).toContain('and then the owls');
    expect(text).not.toContain('the part about the badgers');
    act(() => tree.unmount());
  });

  it('says that searching is private and jumping is not', async () => {
    // The one thing about this screen that is not guessable: playback here is
    // shared, so a jump moves it for the whole room.
    const seek = jest.fn();
    const tree = await show(recordingWith('ready'), seek);
    expect(textOf(tree)).toContain(
      'Searching is yours alone. Tapping a line moves playback for everybody.'
    );
    act(() => tree.unmount());
  });

  it('jumps to a line when this recording is what is playing', async () => {
    const seek = jest.fn();
    const tree = await show(recordingWith('ready'), seek);

    act(() => findButton(tree, 'the part about the badgers')!.props.onPress());

    // The recording's own timeline, which is what rendering the stems with
    // their delays in place bought.
    expect(seek).toHaveBeenCalledWith(4_000);
    act(() => tree.unmount());
  });

  it('offers no jump when it is not, and says why', async () => {
    const tree = await show(recordingWith('ready'));
    expect(findButton(tree, 'the part about the badgers')).toBeUndefined();
    expect(textOf(tree)).toContain('Play this recording to jump to a line');
    act(() => tree.unmount());
  });

  /**
   * A recording where the played-media stem came back holding two voices,
   * which is the ordinary case for it: what somebody plays into a room may be
   * an interview, and the provider labels the two apart.
   */
  const played = (identity: string, speaker: string, startMs: number, text: string) => ({
    identity,
    displayName: `Played audio (${speaker})`,
    speaker,
    startMs,
    endMs: startMs + 1_000,
    text,
    confidence: 0.9,
  });

  const withTwoVoices = () =>
    mockGet.mockResolvedValueOnce({
      state: 'ready' as const,
      requestedBy: { id: ME, displayName: 'Me' },
      missing: [],
      lines: [
        played('media', 'A', 1_000, 'welcome to the programme'),
        played('media', 'B', 2_000, 'thank you for having me'),
        played('media', 'B', 3_000, 'it is a subject I care about'),
      ],
    } as never);

  it('names a run once and puts its sentences underneath', async () => {
    // Otherwise one person saying two sentences reads as two speakers — which
    // is what 176 consecutive lines of one voice looked like.
    withTwoVoices();
    const tree = await show(recordingWith('ready'));
    const text = textOf(tree);

    expect(text).toContain('thank you for having me');
    expect(text).toContain('it is a subject I care about');
    expect(text.split('Played audio (B)')).toHaveLength(2);
    act(() => tree.unmount());
  });

  it('separates the voices the provider heard inside one stem', async () => {
    withTwoVoices();
    const tree = await show(recordingWith('ready'));
    const text = textOf(tree);

    expect(text).toContain('Played audio (A)');
    expect(text).toContain('Played audio (B)');
    // And says what the letter means. It is a count of voices, never an
    // identification, and a bare letter would invite the other reading.
    expect(text).toContain('more than one voice was heard on that microphone');
    act(() => tree.unmount());
  });

  it('says nothing about voices when every stem held one', async () => {
    const tree = await show(recordingWith('ready'));
    expect(textOf(tree)).not.toContain('more than one voice');
    act(() => tree.unmount());
  });

  it('jumps to the sentence that was tapped, not to the top of its entry', async () => {
    // The precision grouping would otherwise cost: a run can be a minute
    // long, and somebody tapping the third paragraph means that paragraph.
    withTwoVoices();
    const seek = jest.fn();
    const tree = await show(recordingWith('ready'), seek);

    act(() => findButton(tree, 'it is a subject I care about')!.props.onPress());

    expect(seek).toHaveBeenCalledWith(3_000);
    act(() => tree.unmount());
  });

  it('leaves search results ungrouped, since matches are not a conversation', async () => {
    // Two matching paragraphs minutes apart under one heading would read as
    // having been said together.
    withTwoVoices();
    const tree = await show(recordingWith('ready'));
    const field = tree.root.findAll((n) => n.props?.onChangeText)[0];

    act(() => field.props.onChangeText('subject'));

    const text = textOf(tree);
    expect(text).toContain('it is a subject I care about');
    expect(text).not.toContain('thank you for having me');
    act(() => tree.unmount());
  });

  /** The roster the server sends beside the lines. */
  const roster = [
    {
      identity: 'media',
      speaker: 'A',
      key: 'media\u0000A',
      displayName: 'Played audio (A)',
      defaultName: 'Played audio (A)',
      lines: 1,
      sample: 'welcome to the programme',
      declaration: {},
    },
    {
      identity: 'media',
      speaker: 'B',
      key: 'media\u0000B',
      displayName: 'Played audio (B)',
      defaultName: 'Played audio (B)',
      lines: 2,
      sample: 'thank you for having me',
      declaration: {},
    },
  ];

  const withVoices = () =>
    mockGet.mockResolvedValueOnce({
      state: 'ready' as const,
      requestedBy: { id: ME, displayName: 'Me' },
      missing: [],
      lines: [
        played('media', 'A', 1_000, 'welcome to the programme'),
        played('media', 'B', 2_000, 'thank you for having me'),
      ],
      voices: roster,
    } as never);

  /**
   * The name field for one voice, by the default it offers as a placeholder.
   *
   * By placeholder rather than by position: `findAll` matches the `Field`
   * wrapper and the `TextInput` inside it alike, so indexes count each field
   * twice and picking the second one silently edits the first voice again.
   */
  const fieldFor = (tree: ReactTestRenderer, placeholder: string) =>
    tree.root.findAll(
      (n) => n.props?.placeholder === placeholder && !!n.props?.onChangeText
    )[0];

  /** Opens the naming screen, which is where the roster is edited. */
  const openNaming = async () => {
    withVoices();
    const tree = await show(recordingWith('ready'));
    act(() => findButton(tree, 'Name the voices')!.props.onPress());
    return tree;
  };

  it('offers no naming to somebody who may not spend', async () => {
    // The same pair of rules as deleting: naming shapes a shared artefact that
    // only one account can make again.
    withVoices();
    const tree = await show(recordingWith('ready', { mayRequest: false }));
    expect(findButton(tree, 'Name the voices')).toBeUndefined();
    act(() => tree.unmount());
  });

  it('offers no naming when there is only one voice to name', async () => {
    // A screen with a single row on it teaches people to ignore the button.
    const tree = await show(recordingWith('ready'));
    expect(findButton(tree, 'Name the voices')).toBeUndefined();
    act(() => tree.unmount());
  });

  it('lists each voice with what it said and how much of it', async () => {
    const tree = await openNaming();
    const text = textOf(tree);

    expect(text).toContain('Played audio (A)');
    expect(text).toContain('welcome to the programme');
    expect(text).toContain('2 lines');
    // And says the thing that makes the screen safe to use.
    expect(text).toContain('The transcript itself is not changed');
    act(() => tree.unmount());
  });

  it('sends the whole declaration, so clearing one voice is expressible', async () => {
    const tree = await openNaming();

    act(() => fieldFor(tree, 'Played audio (A)').props.onChangeText('Host'));
    act(() => fieldFor(tree, 'Played audio (B)').props.onChangeText('Douglas'));
    await act(async () => findButton(tree, 'Save')!.props.onPress());

    expect(mockDeclare).toHaveBeenCalledWith('token', 'rec_1', {
      'media\u0000A': { name: 'Host' },
      'media\u0000B': { name: 'Douglas' },
    });
    act(() => tree.unmount());
  });

  it('says a voice was never a person, without deleting what it said', async () => {
    const tree = await openNaming();

    act(() => findButton(tree, 'Remove from transcript')!.props.onPress());
    await act(async () => findButton(tree, 'Save')!.props.onPress());

    const [, , sent] = mockDeclare.mock.calls[0] as unknown as [
      string,
      string,
      Record<string, unknown>,
    ];
    expect(sent['media\u0000A']).toEqual({ removed: true });
    act(() => tree.unmount());
  });

  it('clears the draft without saving it, since undoing is not committing', async () => {
    const tree = await openNaming();
    act(() => fieldFor(tree, 'Played audio (A)').props.onChangeText('Host'));

    act(() => findButton(tree, 'Clear all')!.props.onPress());

    expect(mockDeclare).not.toHaveBeenCalled();
    await act(async () => findButton(tree, 'Save')!.props.onPress());
    expect(mockDeclare).toHaveBeenCalledWith('token', 'rec_1', {
      'media\u0000A': {},
      'media\u0000B': {},
    });
    act(() => tree.unmount());
  });

  it('asks the server again after saving rather than guessing the new names', async () => {
    // The naming rules are the server's, so that this screen, an export and a
    // search result cannot drift apart.
    const tree = await openNaming();
    const before = mockGet.mock.calls.length;

    await act(async () => findButton(tree, 'Save')!.props.onPress());

    expect(mockGet.mock.calls.length).toBe(before + 1);
    act(() => tree.unmount());
  });

  it('says who is missing rather than presenting a partial as whole', async () => {
    const tree = await show(recordingWith('ready', { missing: 1 }));
    expect(textOf(tree)).toContain(
      'One person could not be transcribed and is missing from this.'
    );
    act(() => tree.unmount());
  });

  it('asks for no text while the provider is still working', async () => {
    const tree = await show(recordingWith('pending'));
    expect(mockGet).not.toHaveBeenCalled();
    expect(textOf(tree)).toContain('Being transcribed');
    act(() => tree.unmount());
  });

  it('says so when it failed, and why', async () => {
    const tree = await show(recordingWith('failed', { failure: 'audio_too_short' }));
    expect(textOf(tree)).toContain('Transcribing failed — audio_too_short');
    act(() => tree.unmount());
  });

  it('warns that deleting is not free to undo', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const tree = await show(recordingWith('ready'));

    act(() => findButton(tree, 'Delete transcript')!.props.onPress());

    const [, body] = alert.mock.calls[0];
    expect(body).toContain('The recording is kept');
    expect(body).toContain('costs the same as the first time');
    act(() => tree.unmount());
    alert.mockRestore();
  });
});
