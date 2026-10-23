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
 * settable by `debug` alone.
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

  it('says Max beside Ask Claude on a Max channel', () => {
    const max = reduce(here(), { type: 'SET_RESPONSE_MODEL', userId: ME, responseModel: 'max' }, NOW);
    showChannel(max, [], { claude: true });
    const text = textOf(record());
    expect(text).toContain('Ask Claude \u00b7 Max');
    expect(text).not.toContain('\u00b7 Pro');
  });

  it('says Pro beside Claude only when the channel is on Pro', () => {
    const pro = reduce(here(), { type: 'SET_RESPONSE_MODEL', userId: ME, responseModel: 'pro' }, NOW);
    showChannel(pro, [], { claude: true });
    expect(textOf(record())).toContain('Ask Claude \u00b7 Pro');
    act(() => tree!.unmount());
    showChannel(here(), [], { claude: true });
    expect(textOf(record())).not.toContain('\u00b7 Pro');
  });
});

describe('the response model', () => {
  const open = () => {
    mockApp.me = { id: ME, displayName: 'Me' } as typeof mockApp.me;
    const channel = here();
    return (tree = render(
      <ChannelSettingsView
        publicAt={null}
        channel={channel}
        derivedTitle="Dana Chu"
        onBack={() => {}}
        onLeft={() => {}}
      />
    ));
  };

  it('is drawn for everybody where the server can ask Claude, and greyed without debug', () => {
    showChannel(here(), [], { claude: true });
    open();
    expect(textOf(tree!)).toContain('Response model');
    expect(textOf(tree!)).toContain('Only the people who run The Floor can change it.');
    for (const label of ['Pro', 'Max']) {
      const button = findButton(tree!, label);
      expect(button).toBeDefined();
      expect(button!.props.accessibilityState?.disabled ?? button!.props.disabled).toBe(true);
    }
  });

  it('is settable by debug, and sends the choice', () => {
    mockApp.debug = true;
    showChannel(here(), [], { claude: true });
    open();
    expect(textOf(tree!)).not.toContain('Only the people who run The Floor');
    const buttons = tree!.root.findAll(
      (n) =>
        n.props?.accessibilityRole === 'button' &&
        typeof n.props?.onPress === 'function' &&
        labelOf(n).trim() === 'Pro'
    );
    // The transcription model's Pro is drawn for debug too; the response
    // model's is the last.
    const pro = buttons[buttons.length - 1];
    act(() => pro.props.onPress());
    expect(mockApp.act).toHaveBeenCalledWith('sess_1', {
      type: 'SET_RESPONSE_MODEL',
      responseModel: 'pro',
    });
    // Max is the response model's alone.
    const max = findButton(tree!, 'Max')!;
    expect(max.props.accessibilityState?.disabled ?? max.props.disabled).toBeFalsy();
    act(() => max.props.onPress());
    expect(mockApp.act).toHaveBeenLastCalledWith('sess_1', {
      type: 'SET_RESPONSE_MODEL',
      responseModel: 'max',
    });
  });

  it('is not drawn where the server cannot ask Claude', () => {
    showChannel(here());
    open();
    expect(textOf(tree!)).not.toContain('Response model');
  });
});
