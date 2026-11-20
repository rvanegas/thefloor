import React from 'react';
import { act, type ReactTestRenderer } from 'react-test-renderer';
import { reduce } from '../../../../core/channel';
import { ChannelSettingsView } from '../ChannelSettingsView';
import { ChannelView } from '../ChannelView';
import {
  AUDIO,
  ME,
  NOW,
  THEM,
  channelOf,
  findButton,
  labelOf,
  mockApp,
  render,
  resetHarness,
  showChannel,
  showPeople,
  showRecord,
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
 * *Ask Claude* on the *Record* bar, and the *Response model* setting, since
 * 2026-10-22. What is asserted is what the screen owes each reader: the
 * three buttons only where the server can answer and only on *Record* — never as a
 * card on *People* — *Responding…* on every screen while anybody's press is
 * out, the reason when a press fails, and the model on show to everybody but
 * settable by *Pro* alone (`debug` until 2026-11-08).
 */

beforeEach(resetHarness);

let tree: ReactTestRenderer | undefined;
afterEach(() => {
  if (tree) act(() => tree!.unmount());
  tree = undefined;
});

const here = () => reduce(channelOf(), { type: 'ENTER', userId: ME }, NOW);

const record = () => {
  tree = render(
    <ChannelView channelId="sess_1" audio={AUDIO} onClose={() => {}} onExit={() => {}} />
  );
  showRecord(tree);
  return tree;
};

const disabled = (button: { props: Record<string, any> }) =>
  button.props.accessibilityState?.disabled ?? button.props.disabled;

describe('Ask Claude on the Record bar', () => {
  it('is not drawn where the server cannot ask Claude', () => {
    showChannel(here());
    record();
    expect(findButton(tree!, 'Medium')).toBeUndefined();
  });

  it('is on the Record bar, and not a card on People', () => {
    showChannel(here(), [], { claude: true });
    record();
    expect(findButton(tree!, 'Medium')).toBeDefined();
    showPeople(tree!);
    expect(findButton(tree!, 'Medium')).toBeUndefined();
    expect(textOf(tree!)).not.toContain('Reads the Record');
  });

  it('warns, without refusing, while somebody here is on an app from before the room reader', () => {
    showChannel(here(), [], {
      claude: true,
      speech: true,
      speechKept: [],
      roomReaderUnheard: [THEM, ME],
    });
    record();
    // The viewer is on this build, so only the others are named.
    expect(textOf(tree!)).toContain(
      'Dana Chu needs to update The Floor, or will hear Claude’s reply twice.'
    );
    expect(textOf(tree!)).not.toContain('Me needs');
    expect(disabled(findButton(tree!, 'Medium')!)).toBeFalsy();
  });

  it('says nothing while everybody here has updated', () => {
    showChannel(here(), [], { claude: true, speech: true, speechKept: [] });
    record();
    expect(textOf(tree!)).not.toContain('to update The Floor');
  });

  it('asks Claude for the length of the button pressed', async () => {
    showChannel(here(), [], { claude: true });
    record();
    expect(textOf(tree!)).toContain('Ask Claude');
    for (const [label, length] of [
      ['Brief', 'brief'],
      ['Medium', 'medium'],
      ['Extended', 'extended'],
    ] as const) {
      const button = findButton(tree!, label)!;
      expect(disabled(button)).toBeFalsy();
      await act(async () => {
        button.props.onPress();
      });
      expect(mockApp.askClaude).toHaveBeenLastCalledWith('sess_1', length);
    }
  });

  it('says Responding, and who asked, on a screen that did not press', () => {
    const asked = reduce(
      here(),
      { type: 'CLAUDE_ASKED', ask: { askedBy: THEM, since: NOW } },
      NOW
    );
    showChannel(asked, [], { claude: true });
    record();
    expect(textOf(tree!)).toContain('Dana Chu asked Claude');
    expect(textOf(tree!)).toContain('Responding\u2026');
    // Grey on this screen too: the guard is the channel's, not the presser's.
    for (const label of ['Brief', 'Medium', 'Extended']) {
      expect(disabled(findButton(tree!, label)!)).toBe(true);
    }
  });

  it('says You asked Claude to the one who did', () => {
    const asked = reduce(here(), { type: 'CLAUDE_ASKED', ask: { askedBy: ME, since: NOW } }, NOW);
    showChannel(asked, [], { claude: true });
    expect(textOf(record())).toContain('You asked Claude');
  });

  it('shows the sentence when a press fails', async () => {
    mockApp.askClaude.mockRejectedValueOnce(new Error('Claude took too long to respond.'));
    showChannel(here(), [], { claude: true });
    record();
    await act(async () => {
      findButton(tree!, 'Medium')!.props.onPress();
    });
    expect(textOf(tree!)).toContain('Claude took too long to respond.');
  });

  it('is grey for somebody who has stepped out', () => {
    const out = reduce(here(), { type: 'STEP_OUT', userId: ME }, NOW);
    showChannel(out, [], { claude: true });
    record();
    expect(disabled(findButton(tree!, 'Medium')!)).toBe(true);
  });

  it('says Pro beside Ask Claude only while the channel is Pro, whoever is reading', () => {
    // The reader is not Pro; somebody else in the channel is.
    showChannel(here(), [], { claude: true, pro: true });
    expect(textOf(record())).toContain('Ask Claude \u00b7 Pro');
    act(() => tree!.unmount());
    mockApp.pro = true;
    showChannel(here(), [], { claude: true });
    expect(textOf(record())).not.toContain('\u00b7 Pro');
  });
});

/**
 * The card Claude asks with before it reads, since 2026-11-20: on every
 * screen, its boxes ticked, *Read* with what is still ticked and *Answer
 * without* with nothing, for anybody who could have pressed.
 */
describe('when Claude asks to read', () => {
  const proposal = {
    id: 'proposal_1',
    askedBy: THEM,
    documents: [
      { name: 'on-attention.document.md', library: 'dana/essays', title: 'On Attention', reason: 'It is about attention.' },
      { name: 'on-will.document.md', library: 'dana/essays', reason: 'Will comes up.' },
    ],
  };
  const boxes = () =>
    tree!.root.findAll(
      (n) => typeof n.type !== 'string' && n.props.accessibilityRole === 'checkbox' && 'onPress' in n.props
    );

  it('lists what it wants, each with its reason, ticked, on a screen that did not press', () => {
    showChannel(here(), [], { claude: true, claudeProposal: proposal });
    record();
    expect(textOf(tree!)).toContain('Claude wants to read these before it replies:');
    expect(boxes().map((box) => box.props.accessibilityLabel)).toEqual([
      'On Attention \u2014 It is about attention.',
      'on-will.document.md \u2014 Will comes up.',
    ]);
    expect(boxes().every((box) => box.props.accessibilityState.checked)).toBe(true);
  });

  it('reads what is still ticked, and answers without on nothing', async () => {
    showChannel(here(), [], { claude: true, claudeProposal: proposal });
    record();
    act(() => boxes()[1].props.onPress());
    await act(async () => {
      findButton(tree!, 'Read')!.props.onPress();
    });
    expect(mockApp.answerClaude).toHaveBeenLastCalledWith('sess_1', 'proposal_1', ['on-attention.document.md']);
    await act(async () => {
      findButton(tree!, 'Answer without')!.props.onPress();
    });
    expect(mockApp.answerClaude).toHaveBeenLastCalledWith('sess_1', 'proposal_1', []);
  });

  it('greys Read with nothing ticked, and both for somebody who has stepped out', () => {
    showChannel(here(), [], { claude: true, claudeProposal: proposal });
    record();
    act(() => boxes()[0].props.onPress());
    act(() => boxes()[1].props.onPress());
    expect(disabled(findButton(tree!, 'Read')!)).toBe(true);
    expect(disabled(findButton(tree!, 'Answer without')!)).toBeFalsy();
    act(() => tree!.unmount());
    showChannel(reduce(here(), { type: 'STEP_OUT', userId: ME }, NOW), [], { claude: true, claudeProposal: proposal });
    record();
    expect(disabled(findButton(tree!, 'Answer without')!)).toBe(true);
  });

  it('offers back unticked, saying why, what was read for a reply since hidden', async () => {
    const offered = {
      ...proposal,
      documents: [...proposal.documents, { name: 'on-memory', library: 'dana/essays', title: 'On Memory', hidden: true as const }],
    };
    showChannel(here(), [], { claude: true, claudeProposal: offered });
    record();
    expect(boxes()[2].props.accessibilityLabel).toBe('On Memory \u2014 Read before, then hidden from Claude');
    expect(boxes().map((box) => box.props.accessibilityState.checked)).toEqual([true, true, false]);
    act(() => boxes()[2].props.onPress());
    await act(async () => {
      findButton(tree!, 'Read')!.props.onPress();
    });
    expect(mockApp.answerClaude).toHaveBeenLastCalledWith('sess_1', 'proposal_1', [
      'on-attention.document.md',
      'on-will.document.md',
      'on-memory',
    ]);
  });

  it('shows the sentence when the answer fails', async () => {
    mockApp.answerClaude.mockRejectedValueOnce(new Error('Claude is no longer asking that.'));
    showChannel(here(), [], { claude: true, claudeProposal: proposal });
    record();
    await act(async () => {
      findButton(tree!, 'Answer without')!.props.onPress();
    });
    expect(textOf(tree!)).toContain('Claude is no longer asking that.');
  });

  it('is not drawn while Claude asks nothing', () => {
    showChannel(here(), [], { claude: true });
    record();
    expect(textOf(tree!)).not.toContain('Claude wants to read');
    expect(findButton(tree!, 'Answer without')).toBeUndefined();
  });
});

/**
 * *Transcription model*, *Response model* and *Read aloud* were cards on
 * *Channel Settings* until 2026-11-19, when a channel became *Pro* while any
 * member is: nothing on the screen chooses a grade now, for anybody.
 */
describe('Channel Settings', () => {
  it('draws no grade to choose, even for Pro where the server speaks', () => {
    mockApp.pro = true;
    mockApp.me = { id: ME, displayName: 'Me' } as typeof mockApp.me;
    showChannel(here(), [], { claude: true, speech: true, speechKept: [] });
    tree = render(
      <ChannelSettingsView
        publicAt={null}
        channel={here()}
        derivedTitle="Dana Chu"
        onBack={() => {}}
        onLeft={() => {}}
      />
    );
    const text = textOf(tree!);
    for (const gone of ['Transcription model', 'Response model', 'Read aloud']) {
      expect(text).not.toContain(gone);
    }
    expect(findButton(tree!, 'Max')).toBeUndefined();
  });
});
