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
    { id: 'name' as const, label: 'Say who you are', note: 'why', done: true },
    {
      id: 'username' as const,
      label: 'Choose a username',
      note: 'why',
      done: false,
    },
    {
      id: 'somebody' as const,
      label: 'Get somebody here',
      note: 'why',
      done: false,
    },
    { id: 'stepIn' as const, label: 'Step in', note: 'why', done: false },
  ],
};

describe('the introduction on Home', () => {
  it('draws nothing at all for an account that has finished with it', () => {
    mockApp.home = empty;
    const tree = render(<HomeView {...homeNav} />);
    expect(textOf(tree)).not.toContain('Getting started');
    act(() => tree.unmount());
  });

  it('draws the ladder, every rung of it, for an alone arrival', () => {
    mockApp.home = empty;
    mockApp.introduction = ladder;
    const tree = render(<HomeView {...homeNav} />);
    const text = textOf(tree);
    expect(text).toContain('Getting started');
    expect(text).toContain('Say who you are');
    expect(text).toContain('Choose a username');
    expect(text).toContain('Get somebody here');
    expect(text).toContain('Step in');
    act(() => tree.unmount());
  });

  it('offers a control on the next rung and on no other', () => {
    mockApp.home = empty;
    mockApp.introduction = ladder;
    const tree = render(<HomeView {...homeNav} />);
    // The first undone rung is the username, so that is the one with a way in.
    expect(findButton(tree, 'Choose a Username')).toBeDefined();
    // The rung below it is undone too, and deliberately silent: four calls to
    // action stacked above a list is not a ladder, it is a wall.
    expect(findButton(tree, 'Invite somebody')).toBeUndefined();
    act(() => tree.unmount());
  });

  it('sends the last rung nowhere, there being nowhere to send it', () => {
    mockApp.home = empty;
    mockApp.introduction = {
      show: 'alone',
      steps: [
        { id: 'stepIn', label: 'Step in', note: 'why', done: false },
      ],
    };
    const tree = render(<HomeView {...homeNav} />);
    expect(textOf(tree)).toContain('Step in');
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
    mockApp.introduction = { show: 'invited', from: null, channelId: null };
    const tree = render(<HomeView {...homeNav} />);
    expect(textOf(tree)).toContain('You have not stepped in yet');
    // Nowhere to send them from here, so nothing pretends there is.
    expect(findButton(tree, 'Step in')).toBeUndefined();
    act(() => tree.unmount());
  });
});
