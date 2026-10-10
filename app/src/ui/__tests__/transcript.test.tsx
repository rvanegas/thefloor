import React from 'react';
import renderer, {
  act,
  type ReactTestInstance,
  type ReactTestRenderer,
} from 'react-test-renderer';
import { Alert } from 'react-native';
import type { RecordingView } from '../../../../core/protocol';
import { RecordingRow, Screen } from '../components';

/**
 * A recording's transcript, from the row that starts one. Its lines are drawn
 * in the *Record* log since 2026-10-10 — `live-transcript.test.tsx` — so what
 * is left here is asking for one and deleting it.
 *
 * The thing worth a test rather than a look: that asking names the provider
 * before it spends anything, because whoever taps is deciding for everybody
 * who was in the room.
 */

const ME = 'acct_me';
const NOW = 1_700_000_000_000;

const mockStart = jest.fn(async () => ({ ok: true as const }));
const mockDelete = jest.fn(async () => ({ ok: true as const }));
jest.mock('../../api/http', () => ({
  api: {
    startTranscript: (...args: unknown[]) => mockStart(...(args as [])),
    deleteTranscript: (...args: unknown[]) => mockDelete(...(args as [])),
  },
}));

jest.mock('../../api/download', () => ({
  shareRecording: jest.fn(async () => {}),
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
  const open = (recording: RecordingView, manageable = true) => {
    // Inside a Screen, as it is in the app: the row measures itself against
    // the scroll view to bring its own drawer into view. And inside `act`,
    // without which the renderer is torn down before anything can be found.
    let tree!: ReactTestRenderer;
    act(() => {
      tree = renderer.create(
        <Screen>
          <RecordingRow recording={recording} manageable={manageable} />
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

  it('is not offered for a recording transcribed live, and says nothing', () => {
    // Its words are in the log already. The refusal and its sentence are for
    // builds that predate `live`.
    const tree = open(
      recordingWith('none', {
        live: true,
        mayRequest: false,
        requestLimit: 'This recording was transcribed as it was said.',
      })
    );
    expect(findButton(tree, 'Transcribe')).toBeUndefined();
    expect(textOf(tree)).not.toContain('transcribed as it was said');
    act(() => tree.unmount());
  });

  it('offers to delete one that is ready, and opens nothing', () => {
    const tree = open(recordingWith('ready'));
    expect(findButton(tree, 'Delete transcript')).toBeDefined();
    expect(findButton(tree, 'Transcribe')).toBeUndefined();
    act(() => tree.unmount());
  });

  it('warns that deleting is not free to undo', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const tree = open(recordingWith('ready'));
    act(() => findButton(tree, 'Delete transcript')!.props.onPress());

    const [, body, buttons] = alert.mock.calls[0] as [
      string,
      string,
      Array<{ text: string; onPress?: () => void }>,
    ];
    expect(body).toContain('The recording is kept');
    expect(body).toContain('costs the same as the first time');
    await act(async () => {
      buttons.find((b) => b.text === 'Delete')!.onPress!();
    });
    expect(mockDelete).toHaveBeenCalledWith('token', 'rec_1');
    act(() => tree.unmount());
    alert.mockRestore();
  });

  it('greys deleting for somebody who is not in the room', () => {
    const tree = open(recordingWith('ready'), false);
    expect(findButton(tree, 'Delete transcript')!.props.disabled).toBe(true);
    act(() => tree.unmount());
  });

  it('says who is missing rather than presenting a partial as whole', () => {
    const tree = open(recordingWith('ready', { missing: 1 }));
    expect(textOf(tree)).toContain(
      'One person could not be transcribed and is missing from this.'
    );
    act(() => tree.unmount());
  });

  it('says why one failed, and offers to ask again', () => {
    const tree = open(recordingWith('failed', { failure: 'audio_too_short' }));
    expect(textOf(tree)).toContain('Transcribing failed — audio_too_short');
    expect(findButton(tree, 'Transcribe')!.props.disabled).toBeFalsy();
    act(() => tree.unmount());
  });

  it('is withheld entirely when the server gives no reason', () => {
    // Nothing rather than a disabled button. A server old enough to limit
    // transcribing to one account sends no sentence, and "not you, ever, on
    // this server" is not worth a control on every recording.
    const tree = open(recordingWith('none', { mayRequest: false }));
    expect(findButton(tree, 'Transcribe')).toBeUndefined();
    act(() => tree.unmount());
  });

  it('is disabled with the reason beside it when there is one', () => {
    // Which is what a disabled control means everywhere else on this card:
    // "not now", with a sentence. Having used your one free transcript is a
    // fact about you rather than about this recording, and saying it is much
    // better than a button that has quietly gone.
    const tree = open(
      recordingWith('none', {
        mayRequest: false,
        requestLimit: 'You have used your one free transcript.',
      })
    );
    expect(findButton(tree, 'Transcribe')!.props.disabled).toBe(true);
    expect(textOf(tree)).toContain('You have used your one free transcript.');
    act(() => tree.unmount());
  });

  it('says the free use is being spent, and offers to cancel', async () => {
    // The thing that can only be done once should not be discovered
    // afterwards. Cancel is the first button, as it is on every Alert here.
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const tree = open(recordingWith('none', { spendsFreeUse: true }));
    act(() => findButton(tree, 'Transcribe')!.props.onPress());

    const [title, body, buttons] = alert.mock.calls[0] as [
      string,
      string,
      Array<{ text: string; style?: string }>,
    ];
    expect(title).toMatch(/one free transcript/i);
    expect(body).toMatch(/deleting this transcript does not give it back/i);
    expect(buttons[0]).toMatchObject({ text: 'Cancel', style: 'cancel' });
    expect(buttons[1].text).toBe('Use it');
    alert.mockRestore();
    act(() => tree.unmount());
  });

  it('says what the minutes are and what is left, from a server that counts them', () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const tree = open(
      recordingWith('none', { spendsFreeUse: true, freeMinutes: { cost: 4, left: 37 } })
    );
    act(() => findButton(tree, 'Transcribe')!.props.onPress());

    const [title, body, buttons] = alert.mock.calls[0] as [
      string,
      string,
      Array<{ text: string; style?: string }>,
    ];
    expect(title).toBe('Use your free minutes?');
    expect(body).toMatch(/uses 4 of the 37 free transcription minutes you have left this week/);
    expect(body).not.toMatch(/one free transcript/i);
    expect(buttons[0]).toMatchObject({ text: 'Cancel', style: 'cancel' });
    expect(buttons[1].text).toBe('Transcribe');
    alert.mockRestore();
    act(() => tree.unmount());
  });

  it('does not mention a free use to an account that has no limit', () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const tree = open(recordingWith('none'));
    act(() => findButton(tree, 'Transcribe')!.props.onPress());

    const [title, body] = alert.mock.calls[0] as [string, string];
    expect(title).toBe('Transcribe this recording?');
    expect(body).not.toMatch(/free/i);
    alert.mockRestore();
    act(() => tree.unmount());
  });


  it('is withheld from somebody who is not in the room', () => {
    // The manage rule, the same one renaming and deleting use: this changes
    // what everybody's screen says.
    const tree = open(recordingWith('none'), false);
    expect(findButton(tree, 'Transcribe')!.props.accessibilityState).toEqual({
      disabled: true,
    });
    act(() => tree.unmount());
  });
});
