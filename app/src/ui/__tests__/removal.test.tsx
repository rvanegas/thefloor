import React from 'react';
import renderer, { act, type ReactTestRenderer } from 'react-test-renderer';
import { Alert } from 'react-native';

import { reduce } from '../../../../core/channel';
import { ChannelView } from '../ChannelView';
import { ChannelsView } from '../ChannelsView';
import { ProfileView } from '../ProfileView';
import {
  AUDIO,
  ME,
  NOW,
  THEM,
  channelOf,
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
 * Removing a member, from both ends: the control on their profile, and the card
 * the removed person is left with on their channels list.
 *
 * **What is worth asserting is the shape of the two-person rule**, because every
 * way of getting it wrong is quiet. A screen that offered *Remove* and meant
 * *propose* would be a button people press believing it has done something. A
 * screen that let one member press twice would be one person with a power the
 * whole design says nobody has. And a removal with no card afterwards is a
 * channel that has vanished for reasons its member cannot find out — which is
 * the failure the card exists for, and the one nothing else in the app would
 * reveal.
 */

beforeEach(resetHarness);

const THIRD = 'acct_3';

/** Three members, which is the smallest channel a removal is possible in. */
const trio = () =>
  channelOf((s) =>
    reduce(s, { type: 'INVITE', userId: ME, inviteeId: THIRD }, NOW)
  );

const buttonFor = (tree: ReactTestRenderer, label: string) =>
  tree.root.findAll((n) => n.props?.label === label)[0];

describe('the removal control on a profile', () => {
  const renderProfile = async (
    removal: { wanted: number; iHaveMoved: boolean } | null,
    moved: string[] = [],
    withdrawn: string[] = []
  ) => {
    mockApp.home = { invites: [], rejoinable: [], contacts: [] };
    let tree!: ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(
        <ProfileView
          accountId={THEM}
          fallbackName="Dana Chu"
          onBack={() => {}}
          removal={removal}
          onMoveToRemove={() => moved.push(THEM)}
          onWithdrawRemoval={() => withdrawn.push(THEM)}
        />
      );
    });
    return tree;
  };

  it('says nothing at all where the caller offers no removal', async () => {
    // Which is a channel of two, and your own card. An absent section rather
    // than a disabled control: the explanation would be a sentence about the
    // channel's size that nobody reading a profile came for.
    const tree = await renderProfile(null);
    expect(textOf(tree)).not.toContain('Removing them');
  });

  it('offers a move, and says plainly that it removes nobody', async () => {
    const tree = await renderProfile({ wanted: 2, iHaveMoved: false });
    const text = textOf(tree);
    expect(text).toContain('Removing them from this channel');
    // The one thing this sentence has to carry. A button under the word
    // *remove* that quietly did nothing reads as broken rather than restrained.
    expect(text).toContain('It takes two members');
    expect(text).toContain('another member agrees');
    expect(buttonFor(tree, 'Move to remove them')).toBeDefined();
    expect(buttonFor(tree, 'Agree and remove')).toBeUndefined();
  });

  it('offers the second member a confirmation, and names nobody', async () => {
    const tree = await renderProfile({ wanted: 1, iHaveMoved: false });
    const text = textOf(tree);
    expect(text).toContain('Another member has moved to remove them');
    expect(text).toContain('Agreeing removes them from this channel');
    expect(buttonFor(tree, 'Agree and remove')).toBeDefined();
    expect(buttonFor(tree, 'Move to remove them')).toBeUndefined();
    // Whoever moved is not named. Naming them turns an agreement two people
    // reached into one person's grievance — the same rule the card follows.
    expect(text).not.toContain('Me');
  });

  it('offers a mover nothing but standing down', async () => {
    // The press that would let one person be both agreements must not exist,
    // and the guard refusing it is not enough — a button offered and refused is
    // the one shape this codebase does not allow.
    const tree = await renderProfile({ wanted: 1, iHaveMoved: true });
    const text = textOf(tree);
    expect(text).toContain('You have moved to remove them');
    expect(text).toContain('Another member has to agree');
    expect(buttonFor(tree, 'Stand down')).toBeDefined();
    expect(buttonFor(tree, 'Agree and remove')).toBeUndefined();
    expect(buttonFor(tree, 'Move to remove them')).toBeUndefined();
  });

  it('withdraws without asking, where both the others ask first', async () => {
    const withdrawn: string[] = [];
    const tree = await renderProfile(
      { wanted: 1, iHaveMoved: true },
      [],
      withdrawn
    );
    const spy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    act(() => buttonFor(tree, 'Stand down').props.onPress());
    // Standing down takes nothing away from anybody, so there is nothing to
    // confirm. The two directions that can cost somebody their place do ask.
    expect(spy).not.toHaveBeenCalled();
    expect(withdrawn).toEqual([THEM]);
    spy.mockRestore();
  });

  it('asks before moving, and before agreeing', async () => {
    const spy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});

    const proposing = await renderProfile({ wanted: 2, iHaveMoved: false });
    act(() => buttonFor(proposing, 'Move to remove them').props.onPress());
    expect(spy.mock.calls[0]?.[0]).toContain('Dana Chu');
    // And it says the thing somebody pressing it needs to know: nothing has
    // happened, and the person is not told.
    expect(String(spy.mock.calls[0]?.[1])).toContain('not told');

    const agreeing = await renderProfile({ wanted: 1, iHaveMoved: false });
    act(() => buttonFor(agreeing, 'Agree and remove').props.onPress());
    expect(spy.mock.calls[1]?.[0]).toContain('Dana Chu');
    expect(String(spy.mock.calls[1]?.[1])).toContain('recordings');

    spy.mockRestore();
  });
});

describe('the removal control, through the channel screen', () => {
  /** Their roster card, which is the way into their profile. */
  function openProfile(tree: ReactTestRenderer, name: string) {
    const card = tree.root
      .findAll(
        (n) =>
          String(n.props?.accessibilityLabel ?? '').startsWith(name) &&
          typeof n.props?.onPress === 'function'
      )
      .at(0);
    act(() => card!.props.onPress());
  }

  const open = async (channel: ReturnType<typeof channelOf>) => {
    showChannel(channel);
    mockApp.home = { invites: [], rejoinable: [], contacts: [] };
    let tree!: ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(
        <ChannelView
          channelId="sess_1"
          audio={AUDIO}
          onClose={() => {}}
          onExit={() => {}}
        />
      );
    });
    return tree;
  };

  it('is not offered at all in a channel of two', async () => {
    const tree = await open(channelOf());
    await act(async () => openProfile(tree, 'Dana Chu'));
    expect(textOf(tree)).not.toContain('Removing them');
    act(() => tree.unmount());
  });

  it('is offered once there is a third member, and sends the move', async () => {
    const tree = await open(trio());
    await act(async () => openProfile(tree, 'Dana Chu'));
    const button = buttonFor(tree, 'Move to remove them');
    expect(button).toBeDefined();

    const spy = jest
      .spyOn(Alert, 'alert')
      .mockImplementation((_t, _b, actions) => {
        // The destructive one, which is the button and not Cancel.
        const go = (actions ?? []).find((a) => a.style === 'destructive');
        go?.onPress?.();
      });
    act(() => button.props.onPress());
    expect(mockApp.act).toHaveBeenCalledWith('sess_1', {
      type: 'MOVE_TO_REMOVE',
      targetId: THEM,
    });
    spy.mockRestore();
    act(() => tree.unmount());
  });

  it('draws the confirmation for the second member off the snapshot alone', async () => {
    // The mover is the third member, so the reader is the one being asked to
    // agree. Nothing is passed in: the count is read from the state, which is
    // what stops the screen and the rule disagreeing.
    const tree = await open(
      reduce(
        trio(),
        { type: 'MOVE_TO_REMOVE', userId: THIRD, targetId: THEM },
        NOW
      )
    );
    await act(async () => openProfile(tree, 'Dana Chu'));
    expect(textOf(tree)).toContain('Another member has moved to remove them');
    act(() => tree.unmount());
  });

  it('shows a mover their own motion rather than a second press', async () => {
    const tree = await open(
      reduce(trio(), { type: 'MOVE_TO_REMOVE', userId: ME, targetId: THEM }, NOW)
    );
    await act(async () => openProfile(tree, 'Dana Chu'));
    expect(textOf(tree)).toContain('You have moved to remove them');
    expect(buttonFor(tree, 'Agree and remove')).toBeUndefined();
    act(() => tree.unmount());
  });

  it('offers nothing about yourself', async () => {
    const tree = await open(trio());
    await act(async () => openProfile(tree, 'Me'));
    expect(textOf(tree)).not.toContain('Removing them');
    act(() => tree.unmount());
  });
});

describe('the card a removed member is left with', () => {
  const show = (
    removals: Array<{ channelId: string; name: string | null; at: number }>
  ) => {
    mockApp.home = { invites: [], rejoinable: [], contacts: [], removals };
    return render(<ChannelsView onEnterChannel={() => {}} />);
  };

  it('is not drawn when there is nothing to say', async () => {
    const tree = show([]);
    expect(textOf(tree)).not.toContain('You are no longer in');
  });

  it('names the channel, and says the members decided without naming one', () => {
    const tree = show([{ channelId: 'sess_9', name: 'Standup', at: NOW }]);
    const text = textOf(tree);
    expect(text).toContain('You are no longer in Standup.');
    expect(text).toContain('Two of its members agreed to remove you');
    // The card is the whole of what they are told and it hands over nobody.
    // Naming one mover makes the other's agreement invisible and points a
    // grievance at whoever happened to move first.
    expect(text).not.toContain('Dana Chu');
    expect(text).not.toContain('Miro Okafor');
  });

  it('says *a channel* for an unnamed one rather than listing who was in it', () => {
    const tree = show([{ channelId: 'sess_9', name: null, at: NOW }]);
    const text = textOf(tree);
    expect(text).toContain('a channel you were part of');
    // Everywhere else in this list an unnamed channel is described by its
    // roster. Here it must not be: who was in that room is not something a
    // removed member gets to keep reading.
    expect(text).not.toContain('Dana Chu');
  });

  it('tells the server when it is closed, and holds nothing locally', () => {
    const tree = show([{ channelId: 'sess_9', name: 'Standup', at: NOW }]);
    const close = tree.root.findAll((n) => n.props?.label === 'Close')[0];
    act(() => close.props.onPress());
    expect(mockApp.acknowledgeRemoval).toHaveBeenCalledWith('sess_9');
    // Still drawn: the row is the notice, so the card goes when the snapshot
    // without it arrives. A dismissal held on this install would come back on
    // the next device, which is the whole reason it is a row.
    expect(textOf(tree)).toContain('You are no longer in Standup.');
  });

  it('draws one per removal', () => {
    const tree = show([
      { channelId: 'sess_9', name: 'Standup', at: NOW },
      { channelId: 'sess_8', name: 'Book club', at: NOW - 1_000 },
    ]);
    const text = textOf(tree);
    expect(text).toContain('Standup');
    expect(text).toContain('Book club');
  });
});
