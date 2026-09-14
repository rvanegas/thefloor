import React from 'react';
import { act } from 'react-test-renderer';
import { HomeView } from '../HomeView';
import {
  findButton,
  homeNav,
  labelOf,
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

  it('draws the next rung in full and holds the rest back', () => {
    mockApp.home = empty;
    mockApp.introduction = ladder;
    const tree = render(<HomeView {...homeNav} />);
    const text = textOf(tree);
    expect(text).toContain('Getting started');
    expect(text).toContain('Get somebody here');
    expect(text).toContain('On Contacts, send an invite link.');
    // Not even its title: a rung that is neither done nor next is waiting,
    // and the card is asking for one thing at a time.
    expect(text).not.toContain('Step in');
    expect(text).not.toContain('On Channels, start one and step in.');
    act(() => tree.unmount());
  });

  it('shows what is waiting when asked, and hides it again', () => {
    mockApp.home = empty;
    mockApp.introduction = ladder;
    const tree = render(<HomeView {...homeNav} />);

    const more = findButton(tree, 'See more');
    expect(more).toBeDefined();
    act(() => more?.props.onPress());
    expect(textOf(tree)).toContain('On Channels, start one and step in.');

    const less = findButton(tree, 'See less');
    expect(less).toBeDefined();
    act(() => less?.props.onPress());
    expect(textOf(tree)).not.toContain('On Channels, start one and step in.');
    act(() => tree.unmount());
  });

  it('offers a control on every rung it draws in full', () => {
    mockApp.home = empty;
    mockApp.introduction = ladder;
    const lists: string[] = [];
    const tree = render(
      <HomeView {...homeNav} onList={(list) => lists.push(list)} />
    );

    const contacts = findButton(tree, 'Open Contacts');
    expect(contacts).toBeDefined();
    act(() => contacts?.props.onPress());
    // The rung after it is not being asked for yet, so neither is its button.
    expect(findButton(tree, 'Open Channels')).toBeUndefined();

    act(() => findButton(tree, 'See more')?.props.onPress());
    const channels = findButton(tree, 'Open Channels');
    expect(channels).toBeDefined();
    act(() => channels?.props.onPress());

    expect(lists).toEqual(['contacts', 'channels']);
    act(() => tree.unmount());
  });

  it('says a finished rung in a line, and asks nothing more of it', () => {
    // The instruction tells somebody how to do what they have just done and
    // the note argues for doing it; neither is any use afterwards, and the
    // label still is. See `Row`.
    mockApp.home = empty;
    mockApp.introduction = {
      show: 'alone',
      steps: [{ ...ladder.steps[0], done: true }, ladder.steps[1]],
    };
    const tree = render(<HomeView {...homeNav} />);
    const text = textOf(tree);
    expect(text).toContain('Get somebody here');
    expect(text).not.toContain('On Contacts, send an invite link.');
    expect(findButton(tree, 'Open Contacts')).toBeUndefined();
    // And the next one is now the one in full, with nothing left to disclose.
    expect(text).toContain('On Channels, start one and step in.');
    expect(findButton(tree, 'See more')).toBeUndefined();
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
    //
    // Asked of the exact name rather than of `findButton` alone, since
    // 2026-09-13: every row carries a *Dismiss <rung>* control now, and that
    // helper falls back to a substring match when nothing matches exactly —
    // so *Dismiss Step in* answers for the button this is asserting is absent.
    const stepIn = findButton(tree, 'Step in');
    expect(stepIn && labelOf(stepIn).trim()).not.toBe('Step in');
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
    // Behind the first rung, which is the one being asked for, so the
    // disclosure is what puts it on screen at all.
    act(() => findButton(tree, 'See more')?.props.onPress());
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
    act(() => findButton(tree, 'See more')?.props.onPress());
    const install = findButton(tree, 'Install');
    expect(install).toBeDefined();
    act(() => install?.props.onPress());
    expect(prompted).toHaveBeenCalled();
    act(() => tree.unmount());
  });

  it('draws the thing to try next, with a way into Channels', () => {
    // Every rung drawn in full carries a control, and for these four there is
    // exactly one place to send somebody — the row's own instruction is what
    // differs. See `actionFor`.
    mockApp.home = empty;
    mockApp.introduction = {
      show: 'alone',
      steps: [
        {
          id: 'floor',
          label: 'Claim the floor',
          instruction: 'In a channel, tap Claim in the bar along the bottom.',
          note: 'why',
          done: false,
        },
        {
          id: 'player',
          label: 'Play something together',
          instruction: "On a channel's Player tab, add audio.",
          note: 'why',
          done: true,
        },
      ],
    };
    const tree = render(<HomeView {...homeNav} />);
    const text = textOf(tree);
    expect(text).toContain('Claim the floor');
    expect(text).toContain(
      'In a channel, tap Claim in the bar along the bottom.'
    );
    expect(findButton(tree, 'Open Channels')).toBeDefined();
    // The done one is a line and nothing else — its title, and no way in.
    expect(text).toContain('Play something together');
    expect(text).not.toContain("On a channel's Player tab, add audio.");
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

/**
 * The way out of one row, added 2026-09-13 — see `ui/Introduction.tsx`.
 *
 * The policy is `state/introduction.ts`' and is tested there; this is that the
 * control is drawn, is named for the rung it sits on, and reports that rung.
 */
describe('putting a rung away', () => {
  it('offers a cross on the row, naming the rung to a screen reader', () => {
    mockApp.home = empty;
    mockApp.introduction = {
      show: 'alone',
      steps: [
        {
          id: 'guest',
          label: 'Bring in a guest',
          instruction: 'Share a guest link.',
          note: 'They need no account.',
          done: false,
        },
      ],
    };
    const tree = render(<HomeView {...homeNav} />);

    const dismiss = findButton(tree, 'Dismiss Bring in a guest');
    expect(dismiss).toBeDefined();
    act(() => dismiss?.props.onPress());
    expect(mockApp.dismissStep).toHaveBeenCalledWith('guest');
    act(() => tree.unmount());
  });

  it('offers one on a finished rung too', () => {
    // Deliberate: a done rung is a line somebody may be tired of reading, and
    // a control on six rows out of seven would read as an accident on the
    // seventh.
    mockApp.home = empty;
    mockApp.introduction = {
      show: 'alone',
      steps: [
        {
          id: 'somebody',
          label: 'Get somebody here',
          instruction: 'Send an invite link.',
          note: 'Nobody can reach you until you do.',
          done: true,
        },
      ],
    };
    const tree = render(<HomeView {...homeNav} />);
    act(() => findButton(tree, 'Dismiss Get somebody here')?.props.onPress());
    expect(mockApp.dismissStep).toHaveBeenCalledWith('somebody');
    act(() => tree.unmount());
  });

  it('closes the invited card as the rung it draws', () => {
    // The card is a single-rung drawing of `stepIn`, so its cross reports that
    // and not a name of its own — otherwise somebody could dismiss the card
    // and meet the row again the day they first conversed.
    mockApp.home = empty;
    mockApp.introduction = {
      show: 'invited',
      from: 'Dana Chu',
      channelId: 'sess_a',
      install: null,
    };
    const tree = render(<HomeView {...homeNav} />);
    act(() => findButton(tree, 'Dismiss Step in')?.props.onPress());
    expect(mockApp.dismissStep).toHaveBeenCalledWith('stepIn');
    act(() => tree.unmount());
  });
});
