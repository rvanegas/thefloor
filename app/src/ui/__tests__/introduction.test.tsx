import React from 'react';
import { act } from 'react-test-renderer';
import { HomeView } from '../HomeView';
import {
  findButton,
  homeNav,
  mockApp,
  render,
  resetHarness,
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
 * The introduction, as Home draws it. What it decides is
 * `state/__tests__/introduction.test.ts`; this is the half that is only true
 * on screen — that it is in the tier rather than in a list, that it survives
 * the switch between them, and that it is gone for everybody who has finished
 * with it.
 */

beforeEach(resetHarness);

const empty = { invites: [], rejoinable: [], contacts: [], recordings: [] };

const ladder = {
  show: 'alone' as const,
  steps: [
    {
      id: 'somebody' as const,
      label: 'Get somebody here',
      instruction: 'On Contacts, send an invite link.',
      note: 'why',
      done: false,
    },
    {
      id: 'stepIn' as const,
      label: 'Step in',
      instruction: 'On Channels, start one and step in.',
      note: 'why',
      done: false,
    },
  ],
};

const installRung = {
  id: 'install' as const,
  label: 'Put The Floor on your home screen',
  instruction: 'Tap Share in Safari, then Add to Home Screen.',
  note: 'why',
  done: false,
};

describe('the introduction on Home', () => {
  it('draws nothing at all for an account that has finished with it', () => {
    mockApp.home = empty;
    const tree = render(<HomeView {...homeNav} />);
    expect(textOf(tree)).not.toContain('Getting started');
    act(() => tree.unmount());
  });

  it('draws the ladder, every rung of it, with what to do on each', () => {
    mockApp.home = empty;
    mockApp.introduction = ladder;
    const tree = render(<HomeView {...homeNav} />);
    const text = textOf(tree);
    expect(text).toContain('Getting started');
    expect(text).toContain('Get somebody here');
    expect(text).toContain('On Contacts, send an invite link.');
    expect(text).toContain('Step in');
    expect(text).toContain('On Channels, start one and step in.');
    act(() => tree.unmount());
  });

  it('offers a control on every rung, both of them going to a list', () => {
    mockApp.home = empty;
    mockApp.introduction = ladder;
    const lists: string[] = [];
    const tree = render(
      <HomeView {...homeNav} onList={(list) => lists.push(list)} />
    );

    const contacts = findButton(tree, 'Open Contacts');
    expect(contacts).toBeDefined();
    act(() => contacts?.props.onPress());

    const channels = findButton(tree, 'Open Channels');
    expect(channels).toBeDefined();
    act(() => channels?.props.onPress());

    expect(lists).toEqual(['contacts', 'channels']);
    act(() => tree.unmount());
  });

  it('keeps the control on a rung that is already done', () => {
    // Two rows, and the second is the one that matters: hiding the first
    // row's button would change the card's shape under somebody who had just
    // finished with it.
    mockApp.home = empty;
    mockApp.introduction = {
      show: 'alone',
      steps: [{ ...ladder.steps[0], done: true }, ladder.steps[1]],
    };
    const tree = render(<HomeView {...homeNav} />);
    expect(findButton(tree, 'Open Contacts')).toBeDefined();
    act(() => tree.unmount());
  });

  it('stays put when the list underneath is switched', () => {
    // The reason it is in the tier: ticking a rung on Contacts must not take
    // the ladder away, and half of what it asks for happens on the other tab.
    mockApp.home = empty;
    mockApp.introduction = ladder;
    const tree = render(<HomeView {...homeNav} list="contacts" />);
    expect(textOf(tree)).toContain('Getting started');
    act(() => tree.unmount());
  });

  it('names the person who invited them, and offers the way in', () => {
    mockApp.home = empty;
    mockApp.introduction = {
      show: 'invited',
      from: 'Dana Chu',
      channelId: 'sess_a',
      install: null,
    };
    const entered: string[] = [];
    const tree = render(
      <HomeView {...homeNav} onEnterChannel={(id) => entered.push(id)} />
    );
    expect(textOf(tree)).toContain('Dana Chu invited you');
    // One card, not a list: no rungs, and nothing about getting somebody here,
    // which was done for them before they arrived.
    expect(textOf(tree)).not.toContain('Getting started');

    const stepIn = findButton(tree, 'Step in');
    expect(stepIn).toBeDefined();
    act(() => stepIn?.props.onPress());
    expect(entered).toEqual(['sess_a']);
    act(() => tree.unmount());
  });

  it('says the one thing left when the invitation is already taken up', () => {
    mockApp.home = empty;
    mockApp.introduction = {
      show: 'invited',
      from: null,
      channelId: null,
      install: null,
    };
    const tree = render(<HomeView {...homeNav} />);
    expect(textOf(tree)).toContain('You have not stepped in yet');
    // Nowhere to send them from here, so nothing pretends there is.
    expect(findButton(tree, 'Step in')).toBeUndefined();
    act(() => tree.unmount());
  });
});

describe('the install rung', () => {
  it('says where the command is, and offers no button when there is none', () => {
    // Most browsers keep installing in their own chrome and will not let a
    // page raise it. The instruction is then the whole row, and a button that
    // opened something else would be worse than the sentence alone.
    mockApp.home = empty;
    mockApp.introduction = {
      show: 'alone',
      steps: [ladder.steps[0], installRung, ladder.steps[1]],
    };
    const tree = render(<HomeView {...homeNav} />);
    expect(textOf(tree)).toContain('Tap Share in Safari');
    expect(findButton(tree, 'Install')).toBeUndefined();
    act(() => tree.unmount());
  });

  it('does the deed itself where the browser volunteered a way', () => {
    mockApp.home = empty;
    mockApp.introduction = {
      show: 'alone',
      steps: [ladder.steps[0], installRung, ladder.steps[1]],
    };
    const prompted = jest.fn();
    mockApp.installPrompt = prompted;
    const tree = render(<HomeView {...homeNav} />);
    const install = findButton(tree, 'Install');
    expect(install).toBeDefined();
    act(() => install?.props.onPress());
    expect(prompted).toHaveBeenCalled();
    act(() => tree.unmount());
  });

  it('joins the invited card without turning it into a list', () => {
    mockApp.home = empty;
    mockApp.introduction = {
      show: 'invited',
      from: 'Dana Chu',
      channelId: 'sess_a',
      install: installRung,
    };
    const tree = render(<HomeView {...homeNav} />);
    const text = textOf(tree);
    expect(text).toContain('Dana Chu invited you');
    expect(text).toContain('Put The Floor on your home screen');
    // Still the card: no heading, and the way in is still the point.
    expect(text).not.toContain('Getting started');
    expect(findButton(tree, 'Step in')).toBeDefined();
    act(() => tree.unmount());
  });
});
