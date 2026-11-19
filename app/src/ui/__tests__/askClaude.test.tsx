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
