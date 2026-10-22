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
 * The Claude card on *People*, and the *Response model* setting, since
 * 2026-10-22. What is asserted is what the screen owes each reader: the card
 * only where the server can answer, *Responding…* on every screen while
 * anybody's press is out, the reason when a press fails, and the model on show
 * to everybody but settable by `debug` alone.
 */

beforeEach(resetHarness);

let tree: ReactTestRenderer | undefined;
afterEach(() => {
  if (tree) act(() => tree!.unmount());
  tree = undefined;
});

const here = () => reduce(channelOf(), { type: 'ENTER', userId: ME }, NOW);

const people = () =>
  (tree = render(
    <ChannelView channelId="sess_1" audio={AUDIO} onClose={() => {}} onExit={() => {}} />
  ));

describe('the Claude card', () => {
  it('is not drawn where the server cannot ask Claude', () => {
    showChannel(here());
    expect(textOf(people())).not.toContain('Reads the Record');
    expect(findButton(tree!, 'Respond')).toBeUndefined();
  });

  it('is drawn, with Respond in the ping’s place, where it can', async () => {
    showChannel(here(), [], { claude: true });
    people();
    expect(textOf(tree!)).toContain('Claude');
    expect(textOf(tree!)).toContain('Reads the Record and adds to it');
    const respond = findButton(tree!, 'Respond');
    expect(respond?.props.accessibilityState?.disabled ?? respond?.props.disabled).toBeFalsy();
    await act(async () => {
      respond!.props.onPress();
    });
    expect(mockApp.askClaude).toHaveBeenCalledWith('sess_1');
  });

  it('says Responding, and who asked, on a screen that did not press', () => {
    const asked = reduce(
      here(),
      { type: 'CLAUDE_ASKED', ask: { askedBy: THEM, since: NOW } },
      NOW
    );
    showChannel(asked, [], { claude: true });
    people();
    expect(textOf(tree!)).toContain('Responding…');
    expect(textOf(tree!)).toContain('Dana Chu asked');
    // Grey on this screen too: the guard is the channel's, not the presser's.
    const busy = findButton(tree!, 'Responding\u2026')!;
    expect(busy.props.accessibilityState?.disabled ?? busy.props.disabled).toBe(true);
  });

  it('says You asked to the one who did', () => {
    const asked = reduce(here(), { type: 'CLAUDE_ASKED', ask: { askedBy: ME, since: NOW } }, NOW);
    showChannel(asked, [], { claude: true });
    expect(textOf(people())).toContain('You asked');
  });

  it('shows the sentence when a press fails', async () => {
    mockApp.askClaude.mockRejectedValueOnce(new Error('Claude took too long to respond.'));
    showChannel(here(), [], { claude: true });
    people();
    await act(async () => {
      findButton(tree!, 'Respond')!.props.onPress();
    });
    expect(textOf(tree!)).toContain('Claude took too long to respond.');
  });

  it('is grey, and says why, for somebody who has stepped out', () => {
    const out = reduce(here(), { type: 'STEP_OUT', userId: ME }, NOW);
    showChannel(out, [], { claude: true });
    people();
    expect(textOf(tree!)).toContain('Step in to ask');
  });

  it('says Pro on the card only when the channel is on Pro', () => {
    const pro = reduce(here(), { type: 'SET_RESPONSE_MODEL', userId: ME, responseModel: 'pro' }, NOW);
    showChannel(pro, [], { claude: true });
    expect(textOf(people())).toContain('Reads the Record and adds to it · Pro');
    act(() => tree!.unmount());
    showChannel(here(), [], { claude: true });
    expect(textOf(people())).not.toContain('· Pro');
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
    const pro = findButton(tree!, 'Pro');
    expect(pro).toBeDefined();
    expect(pro!.props.accessibilityState?.disabled ?? pro!.props.disabled).toBe(true);
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
  });

  it('is not drawn where the server cannot ask Claude', () => {
    showChannel(here());
    open();
    expect(textOf(tree!)).not.toContain('Response model');
  });
});
