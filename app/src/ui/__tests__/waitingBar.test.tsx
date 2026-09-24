import React from 'react';
import renderer, { act, type ReactTestRenderer } from 'react-test-renderer';
import { HomeView } from '../HomeView';
import {
  NOW,
  THEM,
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
 * The waiting bar: what somebody has asked of you, said in the tier.
 *
 * **The case it exists for is the first hour of an invited account**, and it
 * is the one these tests keep coming back to. Such an account arrives with a
 * contact request already written — `Accounts.resolvePendingInvites` does it
 * at signup — and Home opens on *Channels*, where there is nothing. Every
 * assertion below that renders `list="channels"` is that arrival: the thing
 * waiting is on the other tab, and the question is whether this screen says
 * so in words.
 */

beforeEach(resetHarness);

describe('The waiting bar', () => {
  const withWaiting = (home: Partial<typeof mockApp.home>) => {
    mockApp.home = { invites: [], rejoinable: [], contacts: [], ...home };
  };

  const incoming = (displayName: string, id = 'them') => ({
    account: { id, displayName },
    status: 'incoming' as const,
  });

  const invite = (extra: Record<string, unknown> = {}) => ({
    channelId: 'sess_a',
    from: { id: THEM, displayName: 'Dana Chu' },
    createdAt: NOW,
    ...extra,
  });

  /**
   * Inside `act`, which is not decoration: `renderer.create` alone leaves the
   * tree unflushed and `textOf` then reads the empty string, which passes a
   * `not.toContain` for the wrong reason.
   */
  const at = (list: 'channels' | 'contacts') => {
    let tree!: ReactTestRenderer;
    act(() => {
      tree = renderer.create(<HomeView {...homeNav} list={list} />);
    });
    return tree;
  };

  /** On Channels, which is the tab Home opens on and the arrival's problem. */
  const onChannels = () => at('channels');
  /** And on Contacts, which is where accepting a request leaves somebody. */
  const onContacts = () => at('contacts');

  it('says nothing at all when nothing is waiting', () => {
    // The whole of the rest of the time. A bar that drew empty would spend the
    // top of the header on the absence of news.
    withWaiting({});
    const tree = render(<HomeView {...homeNav} />);
    expect(textOf(tree)).not.toContain('tap to answer');
    act(() => tree.unmount());
  });

  it('names an incoming contact request from the tab that does not hold it', () => {
    withWaiting({ contacts: [incoming('Pat Ito')] });
    const tree = onChannels();
    const text = textOf(tree);
    expect(text).toContain('Pat Ito wants to be a contact');
    expect(text).toContain('tap to answer');
    act(() => tree.unmount());
  });

  it('sends that tap to the list that holds the row', () => {
    // A bar rather than the row itself: the *Accept* stays in `ContactsView`,
    // and this only has to get somebody to it. See `WaitingBar`.
    withWaiting({ contacts: [incoming('Pat Ito')] });
    const onList = jest.fn();
    let tree!: ReactTestRenderer;
    act(() => {
      tree = renderer.create(
        <HomeView {...homeNav} list="channels" onList={onList} />
      );
    });
    act(() => findButton(tree, 'wants to be a contact')!.props.onPress());
    expect(onList).toHaveBeenCalledWith('contacts');
    act(() => tree.unmount());
  });

  it('counts requests rather than naming two of them', () => {
    withWaiting({
      contacts: [incoming('Pat Ito', 'a'), incoming('Dana Chu', 'b')],
    });
    const tree = onChannels();
    const text = textOf(tree);
    expect(text).toContain('2 people want to be contacts');
    // "Ana and 2 others" reads as a group doing one thing; these asked
    // separately, and the list one tap away is where they are enumerated.
    expect(text).not.toContain('Pat Ito wants');
    act(() => tree.unmount());
  });

  it('names an invitation, who sent it and the channel', () => {
    withWaiting({ invites: [invite({ name: 'Kitchen' })] });
    const tree = onContacts();
    expect(textOf(tree)).toContain('Dana Chu asked you into Kitchen');
    act(() => tree.unmount());
  });

  it('says a seat is a seat, and not a membership', () => {
    // `InviteView.guest`'s standing rule: the two are different offers, and a
    // line that said *asked you into* for both would be wrong about one.
    withWaiting({ invites: [invite({ name: 'Kitchen', guest: true })] });
    const tree = onContacts();
    expect(textOf(tree)).toContain('Dana Chu kept you a seat in Kitchen');
    act(() => tree.unmount());
  });

  it('sends an invitation tap to the channel list', () => {
    withWaiting({ invites: [invite({ name: 'Kitchen' })] });
    const onList = jest.fn();
    let tree!: ReactTestRenderer;
    act(() => {
      tree = renderer.create(
        <HomeView {...homeNav} list="contacts" onList={onList} />
      );
    });
    act(() => findButton(tree, 'asked you into')!.props.onPress());
    expect(onList).toHaveBeenCalledWith('channels');
    act(() => tree.unmount());
  });

  it('draws both bars when both are outstanding, and names each', () => {
    // Two bars rather than one counting unlike things: *2 things waiting*
    // names neither and points at one tab while meaning two.
    withWaiting({
      contacts: [incoming('Pat Ito')],
      invites: [invite({ name: 'Kitchen' })],
    });
    const tree = onChannels();
    const text = textOf(tree);
    expect(text).toContain('Pat Ito wants to be a contact');
    expect(text).toContain('Dana Chu asked you into Kitchen');
    act(() => tree.unmount());
  });

  it('draws an invitation the channel list has hoisted under Live', () => {
    // The sections below decide *where* a row is drawn; the bar answers
    // whether there is one to go and find. A live invitation leaves the
    // *Invitations* section for the top of the list, and it is still an
    // invitation waiting for an answer. See `waitingInvitations`.
    withWaiting({
      invites: [invite({ name: 'Kitchen', presentCount: 2 })],
    });
    const tree = onContacts();
    expect(textOf(tree)).toContain('Dana Chu asked you into Kitchen');
    act(() => tree.unmount());
  });

  it('leaves the room unnamed rather than saying one name twice', () => {
    // An unnamed channel whose roster the server withheld is called after the
    // person who asked — `inviteCard` — and *Dana Chu asked you into Dana Chu*
    // reads as a bug. The channel introduces itself one tap away.
    withWaiting({ invites: [invite()] });
    const tree = onContacts();
    const text = textOf(tree);
    expect(text).toContain('Dana Chu asked you into a channel');
    expect(text).not.toContain('Dana Chu asked you into Dana Chu');
    act(() => tree.unmount());
  });

  it('holds the introduction checklist back while somebody is waiting', () => {
    // The ladder's first rung is *get somebody here*, which is the wrong
    // thing to say to an account that arrived because somebody got them here
    // and has not been answered yet. Answering is the shorter job and ticks
    // nothing on the ladder, so nothing is lost by drawing it a moment later.
    mockApp.introduction = {
      show: 'ladder',
      steps: [
        {
          id: 'somebody',
          label: 'Get somebody here',
          instruction: 'On Contacts, send an invite link.',
          note: 'why',
          done: false,
        },
      ],
    };
    withWaiting({ contacts: [incoming('Pat Ito')] });
    const waiting = onChannels();
    expect(textOf(waiting)).toContain('Pat Ito wants to be a contact');
    expect(textOf(waiting)).not.toContain('Getting started');
    act(() => waiting.unmount());

    // And back the moment there is nothing outstanding, which is the same
    // snapshot with the request answered.
    withWaiting({});
    const clear = onChannels();
    expect(textOf(clear)).toContain('Getting started');
    act(() => clear.unmount());
  });

  it('says a seat with no room name without trailing off', () => {
    withWaiting({ invites: [invite({ guest: true })] });
    const tree = onContacts();
    expect(textOf(tree)).toContain('Dana Chu kept you a seat');
    act(() => tree.unmount());
  });
});
