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
  show: 'ladder' as const,
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
      label: 'Step in with somebody',
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

  it('shows the next rung alone, and puts a finished one behind See more', () => {
    // Since 2026-09-24 a done rung is hidden with the rest rather than kept
    // as a line above the ask. One rung in full and nothing else unasked —
    // the card's whole rule, applied to the half that used to be exempt.
    mockApp.home = empty;
    mockApp.introduction = {
      show: 'ladder',
      steps: [{ ...ladder.steps[0], done: true }, ladder.steps[1]],
    };
    const tree = render(<HomeView {...homeNav} />);
    const text = textOf(tree);
    expect(text).toContain('On Channels, start one and step in.');
    expect(text).not.toContain('Get somebody here');
    act(() => tree.unmount());
  });

  it('says a finished rung in a line, and asks nothing more of it', () => {
    // The instruction tells somebody how to do what they have just done and
    // the note argues for doing it; neither is any use afterwards, and the
    // label still is. See `Row`. Behind *See more* since 2026-09-24, which is
    // where the progress now lives rather than above the ask.
    mockApp.home = empty;
    mockApp.introduction = {
      show: 'ladder',
      steps: [{ ...ladder.steps[0], done: true }, ladder.steps[1]],
    };
    const tree = render(<HomeView {...homeNav} />);
    act(() => findButton(tree, 'See more')!.props.onPress());
    const text = textOf(tree);
    expect(text).toContain('Get somebody here');
    expect(text).not.toContain('On Contacts, send an invite link.');
    expect(findButton(tree, 'Open Contacts')).toBeUndefined();
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

  it('sends somebody to Channels rather than into a channel', () => {
    // **What went with the invited card.** Its *Step in* opened the waiting
    // channel outright, which is the one thing `actionFor` rules out for every
    // rung — a card reaches as far as a list and no further. The rung goes to
    // Channels, where that channel is the first row.
    mockApp.home = empty;
    mockApp.introduction = ladder;
    const lists: string[] = [];
    const tree = render(<HomeView {...homeNav} onList={(l) => lists.push(l)} />);
    const open = findButton(tree, 'Open Contacts');
    expect(open).toBeDefined();
    act(() => open?.props.onPress());
    expect(lists).toEqual(['contacts']);
    act(() => tree.unmount());
  });
});

describe('the rungs that are done inside a channel', () => {
  /**
   * The four *try* rungs, which is the whole of what this describes: they
   * name a control two screens away, and where somebody is standing decides
   * whether that is a list away or a tab away.
   */
  const trying = {
    show: 'ladder' as const,
    steps: [
      {
        id: 'floor' as const,
        label: 'Claim the floor',
        instruction: 'In a channel, tap Claim in the bar along the bottom.',
        note: 'why',
        done: false,
      },
      {
        id: 'guest' as const,
        label: 'Bring in a guest',
        instruction: "On a channel's Invite tab, share a guest link.",
        note: 'why',
        done: false,
      },
      {
        id: 'player' as const,
        label: 'Play something together',
        instruction: "On a channel's Listen tab, add audio.",
        note: 'why',
        done: false,
      },
    ],
  };

  const live = {
    channelId: 'sess_1',
    title: 'Dana Chu',
    present: 1,
    muted: false,
  };

  it('names the channel list for somebody who is not in a channel', () => {
    // There is nowhere in particular to send them, and the list is where a
    // channel is found or started.
    mockApp.home = empty;
    mockApp.introduction = trying;
    const lists: string[] = [];
    const tree = render(
      <HomeView {...homeNav} onList={(l) => lists.push(l)} />
    );
    act(() => findButton(tree, 'See more')?.props.onPress());
    expect(findButton(tree, 'Open the channel')).toBeUndefined();
    const channels = findButton(tree, 'Open Channels');
    expect(channels).toBeDefined();
    act(() => channels?.props.onPress());
    expect(lists).toEqual(['channels']);
    act(() => tree.unmount());
  });

  it('opens the channel being stood in, on the tab the rung is about', () => {
    mockApp.home = empty;
    mockApp.introduction = trying;
    const opened: [string, string | undefined][] = [];
    const tree = render(
      <HomeView
        {...homeNav}
        liveChannel={live}
        onReturnToChannel={(id, tab) => opened.push([id, tab])}
      />
    );
    act(() => findButton(tree, 'See more')?.props.onPress());
    // The list is not offered at all while there is a room to go to.
    expect(findButton(tree, 'Open Channels')).toBeUndefined();

    // The bar along the bottom is on the members tab, and Claim is in it.
    act(() => findButton(tree, 'Open the channel')?.props.onPress());
    // The other two name their tab, in the word the tab bar uses.
    act(() => findButton(tree, 'Open Invite')?.props.onPress());
    act(() => findButton(tree, 'Open Listen')?.props.onPress());

    expect(opened).toEqual([
      ['sess_1', 'people'],
      ['sess_1', 'invites'],
      ['sess_1', 'listen'],
    ]);
    act(() => tree.unmount());
  });

  it('still sends the stepping-in rung to the list from inside a channel', () => {
    // The half of that rung which is not done is somebody *else* being in the
    // room, and no tab of the channel screen is about that. Opening the room
    // they are already alone in would be a control that moves nothing.
    mockApp.home = empty;
    mockApp.introduction = ladder;
    const lists: string[] = [];
    const tree = render(
      <HomeView
        {...homeNav}
        liveChannel={live}
        onList={(l) => lists.push(l)}
        onReturnToChannel={() => lists.push('channel')}
      />
    );
    act(() => findButton(tree, 'See more')?.props.onPress());
    act(() => findButton(tree, 'Open Channels')?.props.onPress());
    expect(lists).toEqual(['channels']);
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
      show: 'ladder',
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
      show: 'ladder',
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
      show: 'ladder',
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
          instruction: "On a channel's Listen tab, add audio.",
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
    // The done one is behind *See more* since 2026-09-24, and a line and
    // nothing else once it is showing — its title, and no way in.
    expect(text).not.toContain('Play something together');
    act(() => findButton(tree, 'See more')!.props.onPress());
    const opened = textOf(tree);
    expect(opened).toContain('Play something together');
    expect(opened).not.toContain("On a channel's Listen tab, add audio.");
    act(() => tree.unmount());
  });

  it('is an ordinary rung wherever the account came from', () => {
    // It was the one row allowed to join the invited card. With one ladder it
    // has one place, between getting somebody here and stepping in.
    mockApp.home = empty;
    mockApp.introduction = {
      show: 'ladder',
      steps: [
        { ...ladder.steps[0], done: true },
        installRung,
        ...ladder.steps.slice(1),
      ],
    };
    const tree = render(<HomeView {...homeNav} />);
    expect(textOf(tree)).toContain('Getting started');
    expect(textOf(tree)).toContain('Put The Floor on your home screen');
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
      show: 'ladder',
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
      show: 'ladder',
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

  it('names the step-in rung for what actually ticks it', () => {
    // The rung is `stepIn` and its label is *Step in with somebody*, because
    // what ticks it is a conversation rather than the act of stepping in — so
    // the control that puts it away has to say the same thing.
    mockApp.home = empty;
    // Drawn as the next rung, the one before it being behind them.
    mockApp.introduction = {
      show: 'ladder',
      steps: [{ ...ladder.steps[0], done: true }, ladder.steps[1]],
    };
    const tree = render(<HomeView {...homeNav} />);
    act(() =>
      findButton(tree, 'Dismiss Step in with somebody')?.props.onPress()
    );
    expect(mockApp.dismissStep).toHaveBeenCalledWith('stepIn');
    act(() => tree.unmount());
  });
});
