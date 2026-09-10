import React from 'react';
import { act } from 'react-test-renderer';
import { HelpView } from '../HelpView';
import { HomeView } from '../HomeView';
import {
  NOW,
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
 * Asking The Floor a question, from the button at the foot of the list to the
 * answer appearing under what was asked.
 *
 * What is worth pinning here is small and is all about honesty: that the way
 * in is offered to everybody rather than to whoever has been granted
 * something, that an unanswered question says so rather than looking lost, and
 * that a refusal from the server reaches the person who typed the question
 * instead of vanishing into a catch.
 */

beforeEach(resetHarness);

/** Lets the screen's fetch-on-open effect settle before anything is asserted. */
const settle = async () => {
  await act(async () => {});
};

describe('the way in', () => {
  it('offers Help at the foot of the channel list', async () => {
    mockApp.home = { invites: [], rejoinable: [], contacts: [], recordings: [] };
    const tree = render(<HomeView {...homeNav} />);
    await settle();

    expect(findButton(tree, 'Help')).toBeDefined();
    act(() => tree.unmount());
  });

  it('offers it with nowhere to donate and no granted screens', async () => {
    // Every other row in that part of the tier is conditional — the donate
    // link on a region, the standings and the bench on a column set by hand.
    // A way to ask a question that only some accounts have is not a help
    // mechanism, so this is the one row down there with no gate on it.
    mockApp.home = { invites: [], rejoinable: [], contacts: [], recordings: [] };
    mockApp.loadSupport.mockResolvedValueOnce({
      url: null,
      identifier: 'me@example.com',
      mine: null,
    });

    const tree = render(<HomeView {...homeNav} />);
    await settle();

    expect(findButton(tree, 'Help')).toBeDefined();
    expect(findButton(tree, 'Chip in')).toBeUndefined();
    act(() => tree.unmount());
  });

  it('opens the screen rather than doing anything itself', async () => {
    mockApp.home = { invites: [], rejoinable: [], contacts: [], recordings: [] };
    const onOpenHelp = jest.fn();
    const tree = render(<HomeView {...homeNav} onOpenHelp={onOpenHelp} />);
    await settle();

    act(() => findButton(tree, 'Help')!.props.onPress());
    expect(onOpenHelp).toHaveBeenCalled();
    act(() => tree.unmount());
  });
});

describe('the help screen', () => {
  it('shows an unanswered question as waiting rather than hiding it', async () => {
    mockApp.loadHelp.mockResolvedValueOnce({
      questions: [
        {
          id: 'q_1',
          text: 'How do I stop a recording?',
          askedAt: NOW - 3_600_000,
          answer: null,
          answeredAt: null,
        },
      ],
      canAsk: true,
      askBlocked: null,
    });

    const tree = render(<HelpView onBack={() => {}} />);
    await settle();

    const text = textOf(tree);
    expect(text).toContain('How do I stop a recording?');
    expect(text).toContain('not answered yet');
    act(() => tree.unmount());
  });

  it('shows the answer under the question it belongs to', async () => {
    mockApp.loadHelp.mockResolvedValueOnce({
      questions: [
        {
          id: 'q_1',
          text: 'Why is my microphone off?',
          askedAt: NOW - 3_600_000,
          answer: 'Somebody else has the floor.',
          answeredAt: NOW - 60_000,
        },
      ],
      canAsk: true,
      askBlocked: null,
    });

    const tree = render(<HelpView onBack={() => {}} />);
    await settle();

    const text = textOf(tree);
    expect(text).toContain('Somebody else has the floor.');
    // The waiting line is the alternative to an answer, not a companion to it.
    expect(text).not.toContain('not answered yet');
    act(() => tree.unmount());
  });

  it('will not send an empty question', async () => {
    const tree = render(<HelpView onBack={() => {}} />);
    await settle();

    expect(findButton(tree, 'Ask')!.props.accessibilityState.disabled).toBe(true);
    act(() => tree.unmount());
  });

  it('sends what was typed and lists it straight away', async () => {
    const tree = render(<HelpView onBack={() => {}} />);
    await settle();

    const field = tree.root.findAll((n) => n.props?.placeholder !== undefined)[0];
    act(() => field.props.onChangeText('Can two people talk at once?'));
    await act(async () => findButton(tree, 'Ask')!.props.onPress());

    expect(mockApp.askHelp).toHaveBeenCalledWith('Can two people talk at once?');
    // Listed from the answer the server gave rather than re-read, so the
    // question is there without a second round trip.
    expect(textOf(tree)).toContain('Can two people talk at once?');
    act(() => tree.unmount());
  });

  it('says why the button is greyed when too many are waiting', async () => {
    // The reason comes from the server and is printed verbatim: the limit is a
    // policy, and a screen that invented its own wording would drift from it.
    mockApp.loadHelp.mockResolvedValueOnce({
      questions: [],
      canAsk: false,
      askBlocked: 'You have 5 questions waiting for an answer.',
    });

    const tree = render(<HelpView onBack={() => {}} />);
    await settle();

    expect(textOf(tree)).toContain('You have 5 questions waiting for an answer.');
    expect(findButton(tree, 'Ask')!.props.accessibilityState.disabled).toBe(true);
    act(() => tree.unmount());
  });

  it('shows a refusal to the person who typed the question', async () => {
    mockApp.askHelp.mockRejectedValueOnce(
      new Error('Questions are limited to 4000 characters.')
    );

    const tree = render(<HelpView onBack={() => {}} />);
    await settle();

    const field = tree.root.findAll((n) => n.props?.placeholder !== undefined)[0];
    act(() => field.props.onChangeText('a very long question'));
    await act(async () => findButton(tree, 'Ask')!.props.onPress());

    expect(textOf(tree)).toContain('Questions are limited to 4000 characters.');
    act(() => tree.unmount());
  });
});
