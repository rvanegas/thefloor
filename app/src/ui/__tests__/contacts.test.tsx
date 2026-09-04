import React from 'react';
import renderer, {
  act,
  type ReactTestRenderer,
} from 'react-test-renderer';
import { type ProfileView as ProfileViewData } from '../../../../core/protocol';
import { HomeView } from '../HomeView';
import { ChannelView } from '../ChannelView';
import { Screen } from '../components';
import { ProfileView } from '../ProfileView';
import { ContactsView } from '../ContactsView';
import { Alert } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import {
  AUDIO,
  ME,
  NOW,
  THEM,
  channelOf,
  findButton,
  homeNav,
  mockApp,
  render,
  resetHarness,
  showChannel,
  textOf,
} from '../testing/harness';

/**
 * The three module mocks. They live in each test file rather than in the
 * harness because `jest.mock` is hoisted above the imports of its own file and
 * of no other — `testing/harness` holds the factories, and the single copy of
 * the state they close over.
 */
jest.mock('../../api/download', () =>
  require('../testing/harness').downloadMock()
);
jest.mock('../../api/upload', () => require('../testing/harness').uploadMock());
jest.mock('../../state/AppProvider', () =>
  require('../testing/harness').appProviderMock()
);

/**
 * People rather than rooms: the contacts list and its order, a profile —
 * yours and somebody else’s — the ways to reach one, and what adding and
 * removing a contact does.
 *
 * Split out of `views.test.tsx` on 2026-09-04, which was 8,495 lines and 343
 * tests by then; the fixtures every one of these files shares are in
 * `testing/harness`.
 */

/**
 * A text input by its placeholder, which is the only thing distinguishing the
 * two on the address-change form. Absent rather than throwing when there is
 * none: half of what these tests assert is that the code box is *not* drawn
 * until a code has been asked for.
 */
const field = (tree: ReactTestRenderer, placeholder: string) =>
  tree.root.findAll((n) => n.props?.placeholder === placeholder)[0];

beforeEach(resetHarness);

describe('Contacts', () => {
  const withContacts = (
    contacts: Array<{
      id: string;
      displayName: string;
      /** Accepted unless a case is specifically about the other two. */
      status?: 'accepted' | 'incoming' | 'outgoing';
      inApp?: boolean;
      lastSeenAt?: number | null;
    }>
  ) => {
    mockApp.home = {
      invites: [],
      rejoinable: [],
      recordings: [],
      contacts: contacts.map(({ id, displayName, status, ...rest }) => ({
        account: { id, displayName },
        status: status ?? 'accepted',
        ...rest,
      })),
    };
  };

  /*
    Through the tier, with the Contacts tab selected, which is the only way
    this list is ever on screen — and the only way a tapped row opens
    anything, the profile having moved up there with everything else that was
    not a list.
  */
  const open = () => {
    let tree!: ReactTestRenderer;
    act(() => {
      tree = renderer.create(<HomeView {...homeNav} list="contacts" />);
    });
    return tree;
  };

  /*
    The list has no header of its own any more — the tier above it does, and
    what identifies this tab up there is the switch. Asserted on `Screen`'s
    prop for the reason the channel's is: both arrangements flatten to one
    string, so a text search reads a header that scrolls away and one that does
    not as identical.

    This list is as long as the number of people somebody knows, and the switch
    is the only way off it, so a header that scrolled would strand whoever has
    the most contacts.
  */
  it('is reached by the switch in the tier\'s pinned header', () => {
    withContacts([{ id: 'a', displayName: 'Dana Chu' }]);
    const tree = open();
    const [screen] = tree.root.findAll((node) => node.type === Screen);
    const header = render(screen.props.header);

    // Both halves are up there, and the one you are on says so to a screen
    // reader rather than in a word nobody else's label carries.
    const contacts = findButton(header, 'Contacts');
    const channels = findButton(header, 'Channels');
    expect(contacts!.props.accessibilityState).toEqual({ selected: true });
    expect(channels!.props.accessibilityState).toEqual({ selected: false });
    // The way back is that switch and nothing else.
    expect(findButton(header, 'Home')).toBeUndefined();

    // Adding somebody stayed in the scroll. Once opened it is a field that
    // grows a line when it has something to report, and the header is the one
    // place that cannot afford something changing height for a reason nobody
    // asked about. Asserted on its collapsed label, which is rendered text —
    // the placeholder would not do, being a prop that `textOf` cannot see.
    expect(textOf(tree)).toContain('Add a contact');
    expect(textOf(header)).not.toContain('Add a contact');
    act(() => header.unmount());
    act(() => tree.unmount());
  });

  it('switches back to the channels from the same place', () => {
    withContacts([{ id: 'a', displayName: 'Dana Chu' }]);
    const onList = jest.fn();
    let tree!: ReactTestRenderer;
    act(() => {
      tree = renderer.create(
        <HomeView {...homeNav} list="contacts" onList={onList} />
      );
    });
    const [screen] = tree.root.findAll((node) => node.type === Screen);
    const header = render(screen.props.header);
    act(() => findButton(header, 'Channels')!.props.onPress());
    expect(onList).toHaveBeenCalledWith('channels');
    act(() => header.unmount());
    act(() => tree.unmount());
  });

  it('puts you first, outside the list of everybody else', async () => {
    // The server has never put you in your own contact list \u2014 it returns the
    // other id of each contacts row \u2014 so the card is drawn from `app.me`, and
    // it opens the one profile that can be edited.
    withContacts([{ id: 'a', displayName: 'Dana Chu' }]);
    const tree = open();
    const you = tree.root.findAll(
      (n) => n.props?.accessibilityLabel === 'Me. You. Open your profile.'
    )[0];
    expect(you).toBeDefined();
    expect(textOf(tree)).toContain('You');

    await act(async () => you.props.onPress());
    expect(mockApp.loadProfile).toHaveBeenCalledWith(ME);
    expect(findButton(tree, 'Edit')).toBeDefined();
    act(() => tree.unmount());
  });

  it('still says nobody is here when you are the only card', () => {
    // Your own card is not a contact and is not counted as one. A list that
    // read "Nobody yet" under a card with your name on it would be answering a
    // different question than the one it was asked.
    withContacts([]);
    const tree = open();
    const text = textOf(tree);
    expect(text).toContain('Me');
    expect(text).toContain('Nobody yet');
    act(() => tree.unmount());
  });

  it('carries no settings button of its own, those having been your profile', () => {
    // The tier has one, in its header, and it is about the application. What
    // this list must not grow back is a second one meaning your own account —
    // that is your profile, behind the card under "You".
    withContacts([{ id: 'a', displayName: 'Dana Chu' }]);
    // The body on its own, which is the thing being asserted about. Rendered
    // bare rather than through the tier, whose header carries a Settings of
    // its own that would answer the search.
    let body!: ReactTestRenderer;
    act(() => {
      body = renderer.create(<ContactsView onOpenProfile={() => {}} />);
    });
    expect(findButton(body, 'Settings')).toBeUndefined();
    act(() => body.unmount());

    // And the one the tier has is about the application, not your account.
    const tree = open();
    const [screen] = tree.root.findAll((node) => node.type === Screen);
    const header = render(screen.props.header);
    expect(findButton(header, 'Settings')).toBeDefined();
    act(() => header.unmount());
    act(() => tree.unmount());
  });

  it('says where each contact is, in the words the profile uses', () => {
    mockApp.serverNow = () => NOW;
    withContacts([
      { id: 'a', displayName: 'Dana Chu', inApp: true },
      { id: 'b', displayName: 'Sam Rivera', inApp: false, lastSeenAt: NOW - 3 * 60 * 60_000 },
    ]);
    const tree = open();
    const text = textOf(tree);
    expect(text).toContain('In the app now');
    expect(text).toContain('Last seen 3 hours ago');
    act(() => tree.unmount());
  });

  it('says nothing rather than hedging when it is not known', () => {
    // A server that predates the fields, or somebody who has not connected
    // since they existed. "Unknown" would report on the rule, not the person.
    mockApp.serverNow = () => NOW;
    withContacts([{ id: 'a', displayName: 'Dana Chu' }]);
    const tree = open();
    expect(textOf(tree)).toContain('Dana Chu');
    expect(textOf(tree)).not.toContain('Last seen');
    expect(textOf(tree)).not.toContain('In the app');
    act(() => tree.unmount());
  });

  it('lists people you are contacts with, and not requests', () => {
    // Requests stay in the channel list, where they were drawn when it was
    // Home: they are not contacts yet, and answering one is something to do
    // rather than somebody to look up.
    withContacts([
      { id: 'a', displayName: 'Dana Chu', status: 'accepted' },
      { id: 'b', displayName: 'Pat Ito', status: 'incoming' },
      { id: '', displayName: 'someone@example.com', status: 'outgoing' },
    ]);
    const tree = open();
    const text = textOf(tree);
    expect(text).toContain('Dana Chu');
    expect(text).not.toContain('Pat Ito');
    expect(text).not.toContain('someone@example.com');
    act(() => tree.unmount());
  });

  it('opens the person when their row is tapped', () => {
    withContacts([{ id: 'a', displayName: 'Dana Chu' }]);
    const tree = open();
    const row = tree.root.findAll(
      (n) =>
        typeof n.props?.accessibilityLabel === 'string' &&
        n.props.accessibilityLabel.startsWith('Dana Chu.')
    )[0];
    act(() => row.props.onPress());
    // The profile screen, which fetches on mount and offers the one
    // destructive thing you can do about a person.
    expect(mockApp.loadProfile).toHaveBeenCalledWith('a');
    act(() => tree.unmount());
  });

  it('keeps the add-contact field folded away until it is wanted', () => {
    withContacts([{ id: 'a', displayName: 'Dana Chu' }]);
    const tree = open();
    const field = () =>
      tree.root.findAll(
        (n) => n.props?.placeholder === 'Search by email address'
      )[0];

    // A line, not a form: reading the list is what somebody came for.
    expect(field()).toBeUndefined();
    expect(findButton(tree, 'Add a contact')).toBeDefined();

    act(() => findButton(tree, 'Add a contact')!.props.onPress());
    expect(field()).toBeDefined();
    expect(findButton(tree, 'Send request')).toBeDefined();
    act(() => tree.unmount());
  });

  it('sends the request, and folds away again on cancel', async () => {
    withContacts([]);
    const tree = open();
    act(() => findButton(tree, 'Add a contact')!.props.onPress());
    const field = tree.root.findAll(
      (n) => n.props?.placeholder === 'Search by email address'
    )[0];
    act(() => field.props.onChangeText('someone@example.com'));
    await act(async () => findButton(tree, 'Send request')!.props.onPress());
    expect(mockApp.requestContact).toHaveBeenCalledWith('someone@example.com');

    act(() => findButton(tree, 'Cancel')!.props.onPress());
    expect(
      tree.root.findAll(
        (n) => n.props?.placeholder === 'Search by email address'
      )[0]
    ).toBeUndefined();
    act(() => tree.unmount());
  });

  it('says so plainly when there is nobody yet', () => {
    withContacts([]);
    const tree = open();
    expect(textOf(tree)).toContain('Nobody yet');
    act(() => tree.unmount());
  });

  it('steps into a channel tapped on the profile it opened', async () => {
    // The "Channels with them" section was inert from here until this screen
    // took `onEnterChannel`: the cards were drawn and nothing happened when
    // one was pressed. A contact *row* still opens a person rather than a
    // room — that separation is why this screen exists — but the profile
    // underneath it is about the pair, and the rooms the pair share are worth
    // going to.
    const onEnterChannel = jest.fn();
    withContacts([{ id: 'a', displayName: 'Dana Chu' }]);
    mockApp.home!.rejoinable = [
      {
        channelId: 'sess_shared',
        name: 'Thursday rehearsal',
        others: [{ id: 'a', displayName: 'Dana Chu' }],
        presentCount: 0,
        createdAt: NOW,
        lastActiveAt: NOW,
      },
    ];

    let tree!: ReactTestRenderer;
    act(() => {
      tree = renderer.create(
        <HomeView
          {...homeNav}
          list="contacts"
          onEnterChannel={onEnterChannel}
        />
      );
    });
    const row = tree.root.findAll(
      (n) =>
        typeof n.props?.accessibilityLabel === 'string' &&
        n.props.accessibilityLabel.startsWith('Dana Chu.')
    )[0];
    // Awaited: the profile fetches on mount, and the section is drawn from
    // Home either way but the presence line is not.
    await act(async () => row.props.onPress());

    const card = tree.root.findAll(
      (n) =>
        n.props?.accessibilityRole === 'button' &&
        typeof n.props?.accessibilityLabel === 'string' &&
        n.props.accessibilityLabel.startsWith('Thursday rehearsal')
    )[0];
    act(() => card.props.onPress());

    expect(mockApp.act).toHaveBeenCalledWith('sess_shared', { type: 'ENTER' });
    expect(onEnterChannel).toHaveBeenCalledWith('sess_shared');
    act(() => tree.unmount());
  });
});

describe('the order contacts are listed in', () => {
  /**
   * The names in the order the screen puts them, top to bottom.
   *
   * Consecutive duplicates are dropped: one row is several nodes carrying the
   * same accessibilityLabel — the Pressable and what it renders through — so
   * findAll reports each row once per layer. Only *consecutive* ones, so two
   * contacts who genuinely share a display name still count twice.
   */
  const namesOn = (tree: ReactTestRenderer) =>
    tree.root
      .findAll(
        (n) =>
          typeof n.props?.accessibilityLabel === 'string' &&
          n.props.accessibilityLabel.includes('Open their profile.')
      )
      .map((n) => String(n.props.accessibilityLabel).split('.')[0])
      .filter((name, i, all) => i === 0 || all[i - 1] !== name);

  const listed = (
    contacts: Array<{
      id: string;
      displayName: string;
      inApp?: boolean;
      lastSeenAt?: number | null;
    }>
  ) => {
    mockApp.serverNow = () => NOW;
    mockApp.home = {
      invites: [],
      rejoinable: [],
      recordings: [],
      contacts: contacts.map(({ id, displayName, ...rest }) => ({
        account: { id, displayName },
        status: 'accepted' as const,
        ...rest,
      })),
    };
    let tree!: ReactTestRenderer;
    act(() => {
      tree = renderer.create(<ContactsView onOpenProfile={() => {}} />);
    });
    const names = namesOn(tree);
    act(() => tree.unmount());
    return names;
  };

  it('puts whoever is in the app above everybody who is not', () => {
    expect(
      listed([
        { id: 'a', displayName: 'Ana', lastSeenAt: NOW - 60_000 },
        { id: 'b', displayName: 'Bo', inApp: true },
      ])
    ).toEqual(['Bo', 'Ana']);
  });

  it('falls back on how recently, which is what the line under each name says', () => {
    expect(
      listed([
        { id: 'a', displayName: 'Ana', lastSeenAt: NOW - 3 * 60 * 60_000 },
        { id: 'b', displayName: 'Bo', lastSeenAt: NOW - 60 * 60_000 },
        { id: 'c', displayName: 'Cy', lastSeenAt: NOW - 24 * 60 * 60_000 },
      ])
    ).toEqual(['Bo', 'Ana', 'Cy']);
  });

  it('sinks anybody there is nothing known about', () => {
    // No stamp is not evidence of being around — it is a contact who has not
    // connected since the field existed, or a server that predates it.
    expect(
      listed([
        { id: 'a', displayName: 'Ana' },
        { id: 'b', displayName: 'Bo', lastSeenAt: NOW - 30 * 24 * 60 * 60_000 },
      ])
    ).toEqual(['Bo', 'Ana']);
  });

  it('breaks a tie on the name, so the list does not reshuffle', () => {
    // Two contacts nothing is known about would otherwise swap places between
    // renders, and a list that moves under a thumb is worse than any fixed one.
    expect(listed([
      { id: 'a', displayName: 'Zoe' },
      { id: 'b', displayName: 'Ada' },
    ])).toEqual(['Ada', 'Zoe']);
  });
});

describe('reading somebody else’s profile', () => {
  it('opens from the roster and comes back', async () => {
    // The line naming who you are with is the only place their name appears,
    // and "who is this?" is a real question about somebody an acquaintance
    // brought in — so that line is the way to their profile.
    showChannel(channelOf());
    const tree = render(
      <ChannelView
        channelId="sess_1"
        audio={AUDIO}
        onClose={() => {}}
        onExit={() => {}}
      />
    );

    const row = tree.root
      .findAll((n) => n.props?.accessibilityRole === 'button')
      .find((n) => String(n.props?.accessibilityLabel).includes('Dana Chu'));
    expect(row).toBeDefined();

    await act(async () => row!.props.onPress());
    expect(mockApp.loadProfile).toHaveBeenCalledWith(THEM);

    // Their name is there before the fetch lands, because the roster knew it.
    const text = textOf(tree);
    expect(text).toContain('Dana Chu');
    // And the channel is gone from view without anything being dispatched.
    expect(mockApp.act).not.toHaveBeenCalled();

    await act(async () => findButton(tree, 'Close')!.props.onPress());
    expect(textOf(tree)).toContain('The floor');
    act(() => tree.unmount());
  });

  it('says so plainly when there is nothing to show', async () => {
    // Refused and absent are one answer by design, and this must not try to
    // tell them apart either.
    mockApp.loadProfile.mockRejectedValueOnce(new Error('nope'));
    showChannel(channelOf());
    const tree = render(
      <ChannelView
        channelId="sess_1"
        audio={AUDIO}
        onClose={() => {}}
        onExit={() => {}}
      />
    );
    const row = tree.root
      .findAll((n) => n.props?.accessibilityRole === 'button')
      .find((n) => String(n.props?.accessibilityLabel).includes('Dana Chu'));
    await act(async () => row!.props.onPress());

    const text = textOf(tree);
    expect(text).toContain('no profile here to show you');
    expect(text).toContain('Dana Chu');
    act(() => tree.unmount());
  });
});

describe('a screen saying which kind of screen it is', () => {
  const openProfile = async (accountId: string = THEM) => {
    let tree!: ReactTestRenderer;
    await act(async () => {
      tree = render(
        <ProfileView
          accountId={accountId}
          fallbackName="Dana Chu"
          onBack={() => {}}
        />
      );
    });
    return tree;
  };

  const withContact = (status: string | null) => {
    mockApp.home = {
      invites: [],
      rejoinable: [],
      recordings: [],
      contacts: status
        ? [{ account: { id: THEM, displayName: 'Dana Chu' }, status }]
        : [],
    } as never;
  };

  it('heads a channel with the word, above its name', () => {
    showChannel(channelOf());
    const tree = render(
      <ChannelView channelId="sess_1" audio={AUDIO} onClose={() => {}} onExit={() => {}} />
    );
    const text = textOf(tree);
    expect(text.indexOf('Channel')).toBeLessThan(text.indexOf('Dana Chu'));
    act(() => tree.unmount());
  });

  it('calls a contact a Contact', async () => {
    withContact('accepted');
    const tree = await openProfile();
    const text = textOf(tree);
    expect(text).toContain('Contact');
    expect(text.indexOf('Contact')).toBeLessThan(text.indexOf('Dana Chu'));
    act(() => tree.unmount());
  });

  it('calls you You, since you are not among your own contacts', async () => {
    withContact(null);
    const tree = await openProfile(ME);
    // The word the section label on Contacts uses for the card that opens
    // this, so the route and the destination agree.
    expect(textOf(tree)).toContain('You');
    act(() => tree.unmount());
  });

  it.each(['outgoing', 'incoming'])(
    'says a %s request is outstanding rather than settled',
    async (status) => {
      withContact(status);
      const tree = await openProfile();
      expect(textOf(tree)).toContain('Contact requested');
      act(() => tree.unmount());
    }
  );

  /**
   * The case the word exists to get right. This screen is reachable from a
   * channel roster, where somebody may be nobody of yours — and *Contact*
   * asserts a mutual standing GLOSSARY defines as exactly that, so it must not
   * be said here. What is claimed instead is the one thing the screen can
   * prove: they belong to a channel you are in.
   */
  it('calls a stranger in a channel a Channel member, not a Contact', async () => {
    withContact(null);
    const tree = await openProfile();
    const text = textOf(tree);
    expect(text).toContain('Channel member');
    expect(text.indexOf('Channel member')).toBeLessThan(text.indexOf('Dana Chu'));
    act(() => tree.unmount());
  });

  /**
   * Before the first snapshot there are no contacts to be absent from, so a
   * contact and a stranger are indistinguishable. Saying nothing for that
   * frame beats calling somebody a channel member and correcting it.
   */
  it('says nothing at all until it knows', async () => {
    mockApp.home = null;
    const tree = await openProfile();
    const text = textOf(tree);
    expect(text).not.toContain('Channel member');
    expect(text).toContain('Dana Chu');
    act(() => tree.unmount());
  });
});

/**
 * Where else somebody can be reached, which is the other half of the errand
 * the Email card is the first half of.
 *
 * The screen's job is small — the rules are in `core/im.ts` and tested there —
 * so what is asserted here is the link a tap opens, that a handle is written
 * the way it is stored rather than the way it was typed, and that a section
 * with nothing in it is absent rather than empty.
 */

describe('your own profile', () => {
  /**
   * The screen as the first card on the contact list opens it: on you, with no
   * action for entering a channel, since the only channels it could list are
   * ones you share with yourself.
   */
  async function mine() {
    mockApp.home = {
      invites: [],
      rejoinable: [],
      recordings: [],
      contacts: [],
    };
    mockApp.loadProfile.mockResolvedValueOnce({
      account: { id: ME, displayName: 'Me' },
      // What the server sends about you: the invited count, and your own
      // address always — but no availability and no `myEmailShown`, there
      // being nobody to be shown to.
      invited: 2,
      email: 'me@example.com',
    });
    let tree!: ReactTestRenderer;
    await act(async () => {
      tree = render(
        <ProfileView accountId={ME} fallbackName="Me" onBack={() => {}} />
      );
    });
    return tree;
  }

  it('does not offer to make you a contact of yourself', async () => {
    const tree = await mine();
    expect(findButton(tree, 'Add contact')).toBeUndefined();
    expect(findButton(tree, 'Remove contact')).toBeUndefined();
    // The copy that goes with the button, in case the label ever changes but
    // the card does not.
    expect(textOf(tree)).not.toContain('They will see a request');
    act(() => tree.unmount());
  });

  it('offers Edit, which nobody else\u2019s profile does', async () => {
    const tree = await mine();
    expect(findButton(tree, 'Edit')).toBeDefined();
    act(() => tree.unmount());
  });

  it('says which address you sign in with, and offers to copy it', async () => {
    // Left out until 2026-08-31, on the reading that the card is about a
    // disclosure and there is none to make to yourself. What that missed is
    // that nothing in the application said which address this account is.
    const tree = await mine();
    expect(textOf(tree)).toContain('me@example.com');
    expect(findButton(tree, 'Copy')).toBeDefined();
    act(() => tree.unmount());
  });

  it('offers no way to show your address to yourself', async () => {
    // The bottom half of the card is a decision about one named reader, and
    // there is no reader here. A dead control saying so would be worse than
    // the sentence that replaces it.
    const tree = await mine();
    expect(findButton(tree, 'Show my email')).toBeUndefined();
    expect(findButton(tree, 'Stop showing my email')).toBeUndefined();
    expect(textOf(tree)).toContain('How you sign in');
    act(() => tree.unmount());
  });

  it('says nothing about a profile that arrived and is thin', async () => {
    // A loaded profile with nothing optional on it draws no card saying so.
    // The card that is left answers only "still fetching" and "not yours to
    // read", which is what remains of the one the bio used to live in.
    const tree = await mine();
    expect(textOf(tree)).not.toContain('There is no profile here');
    act(() => tree.unmount());
  });

  it('still offers the contact card for somebody who is not you', async () => {
    mockApp.home = {
      invites: [],
      rejoinable: [],
      recordings: [],
      contacts: [],
    };
    mockApp.loadProfile.mockResolvedValueOnce({
      account: { id: THEM, displayName: 'Dana Chu' },
    });
    let tree!: ReactTestRenderer;
    await act(async () => {
      tree = render(
        <ProfileView accountId={THEM} fallbackName="Dana Chu" onBack={() => {}} />
      );
    });
    expect(findButton(tree, 'Add contact')).toBeDefined();
    // Somebody else's profile is theirs to write.
    expect(findButton(tree, 'Edit')).toBeUndefined();
    act(() => tree.unmount());
  });
});

describe('editing your own profile', () => {
  /**
   * Your name and your handles, which are what a contact reads and were a
   * settings screen of their own until 2026-08-29. They are fields on this
   * screen now, behind Edit: a profile that cannot be edited is a read-only
   * profile, and an editor for one is that profile editing.
   *
   * Every case has to let the fetch settle. The fields are seeded from it —
   * which is why Edit is refused until it lands — and there is no second fetch
   * of the kind the separate screen needed.
   */
  const openMine = async () => {
    mockApp.home = { invites: [], rejoinable: [], recordings: [], contacts: [] };
    mockApp.loadProfile.mockResolvedValueOnce({
      account: { id: ME, displayName: 'Me' },
      im: { telegram: 'me_here' },
      invited: 2,
      invitedBy: { id: 'acct_x', displayName: 'Dana Chu' },
      email: 'me@example.com',
    });
    let tree!: ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(
        <ProfileView accountId={ME} fallbackName="Me" onBack={() => {}} />
      );
    });
    return tree;
  };

  /** Into edit mode, which is where every case below starts. */
  const edit = async (tree: ReactTestRenderer) => {
    await act(async () => findButton(tree, 'Edit')!.props.onPress());
    return tree;
  };

  const nameField = (tree: ReactTestRenderer) =>
    tree.root.findAll(
      (n) => n.props?.placeholder === 'What people should call you'
    )[0];

  it('is refused until the profile it would seed the fields from arrives', () => {
    // Otherwise the fields open empty and a blur writes that emptiness over
    // handles somebody has, which is the one way this screen could destroy
    // work.
    mockApp.home = { invites: [], rejoinable: [], recordings: [], contacts: [] };
    mockApp.loadProfile.mockReturnValueOnce(new Promise(() => {}) as never);
    const tree = render(
      <ProfileView accountId={ME} fallbackName="Me" onBack={() => {}} />
    );
    expect(findButton(tree, 'Edit')!.props.disabled).toBe(true);
    act(() => tree.unmount());
  });

  it('puts what the server holds into the fields, with no second fetch', async () => {
    const tree = await openMine();
    expect(mockApp.loadProfile).toHaveBeenCalledTimes(1);
    await edit(tree);
    expect(mockApp.loadProfile).toHaveBeenCalledTimes(1);

    expect(nameField(tree).props.value).toBe('Me');
    // The handles are seeded from the same fetch, canonical as the server
    // answered with them.
    expect(
      tree.root.findAll((n) => n.props?.placeholder === '@username')[0].props
        .value
    ).toBe('me_here');
    act(() => tree.unmount());
  });

  it('keeps an edit when the field is left, with no button to press', async () => {
    const tree = await edit(await openMine());
    expect(findButton(tree, 'Save')).toBeUndefined();

    act(() => nameField(tree).props.onChangeText('Alice Nkemdirim'));
    await act(async () => nameField(tree).props.onBlur());

    // Only what changed: the handles were never touched, so they are not
    // sent.
    expect(mockApp.saveProfile).toHaveBeenCalledWith({
      displayName: 'Alice Nkemdirim',
    });
    act(() => tree.unmount());
  });

  it('puts the name under a label of its own', async () => {
    // It stood in the header until 2026-08-31, where the heading it replaces
    // stands — a text field sharing a line with a button, and the one field on
    // the screen whose label had to be inferred from its placeholder. Which
    // side of the header Done sits on is layout and is not pinned here; that
    // the section exists is the change.
    const tree = await edit(await openMine());
    expect(textOf(tree)).toContain('Name');
    expect(nameField(tree)).toBeDefined();
    // And it is gone again when the mode is, rather than becoming a heading
    // with a label over it.
    await act(async () => findButton(tree, 'Done')!.props.onPress());
    expect(textOf(tree)).not.toContain('Name');
    act(() => tree.unmount());
  });

  it('leaves the facts out, which read mode is where to read', async () => {
    // The one place the two modes order the screen differently rather than
    // swapping a line for a field. None of these is editable or in doubt, and
    // three lines you cannot change between the name and the fields make the
    // screen longer without making it say anything.
    const tree = await openMine();
    expect(textOf(tree)).toContain('Invited 2');
    expect(textOf(tree)).toContain('Invited by Dana Chu');

    await edit(tree);
    expect(textOf(tree)).not.toContain('Invited 2');
    expect(textOf(tree)).not.toContain('Invited by Dana Chu');
    act(() => tree.unmount());
  });

  it('changes the address only once a code comes back', async () => {
    // Every other field here writes on blur. This one cannot: the whole
    // question is whether the person typing reads the mail there, and the
    // code is the only thing that answers it.
    const tree = await edit(await openMine());

    act(() => field(tree, 'A different address').props.onChangeText('new@example.com'));
    // Nothing has been asked for yet, so there is nowhere to type a code.
    expect(field(tree, 'Six digits')).toBeUndefined();

    await act(async () => findButton(tree, 'Send a code')!.props.onPress());
    expect(mockApp.requestEmailChange).toHaveBeenCalledWith('new@example.com');
    expect(mockApp.confirmEmailChange).not.toHaveBeenCalled();

    act(() => field(tree, 'Six digits').props.onChangeText('123456'));
    await act(async () =>
      findButton(tree, 'Change my address')!.props.onPress()
    );
    expect(mockApp.confirmEmailChange).toHaveBeenCalledWith(
      'new@example.com',
      '123456'
    );
    // What the card says above is now the address the server answered with,
    // and the form is back at its first step.
    expect(textOf(tree)).toContain('new@example.com');
    expect(field(tree, 'Six digits')).toBeUndefined();
    act(() => tree.unmount());
  });

  it('drops a code that belonged to a different address', async () => {
    // The code proves one mailbox. Typing another address is the start of a
    // different change, and carrying the first step over would let a code sent
    // to one address be spent against another.
    const tree = await edit(await openMine());

    act(() => field(tree, 'A different address').props.onChangeText('new@example.com'));
    await act(async () => findButton(tree, 'Send a code')!.props.onPress());
    expect(field(tree, 'Six digits')).toBeDefined();

    act(() =>
      field(tree, 'A different address').props.onChangeText('other@example.com')
    );
    expect(field(tree, 'Six digits')).toBeUndefined();
    expect(findButton(tree, 'Send a code')).toBeDefined();
    act(() => tree.unmount());
  });

  it('says what the server said, and keeps the address it has', async () => {
    // A taken address is the one refusal somebody can act on, and it arrives
    // only after they have proved the mailbox is theirs to read.
    mockApp.confirmEmailChange.mockRejectedValueOnce(
      new Error('That address already signs in to another account.')
    );
    const tree = await edit(await openMine());

    act(() => field(tree, 'A different address').props.onChangeText('bob@example.com'));
    await act(async () => findButton(tree, 'Send a code')!.props.onPress());
    act(() => field(tree, 'Six digits').props.onChangeText('123456'));
    await act(async () =>
      findButton(tree, 'Change my address')!.props.onPress()
    );

    expect(textOf(tree)).toContain('already signs in to another account');
    expect(textOf(tree)).toContain('me@example.com');
    // The code was spent by the attempt whatever came of it, so the field is
    // cleared rather than left holding something that can no longer work.
    expect(field(tree, 'Six digits').props.value).toBe('');
    act(() => tree.unmount());
  });

  it('offers no way to change an address in read mode', async () => {
    // Read mode is where the address is a fact to copy. A form for replacing
    // it does not belong under a line somebody opened the screen to read.
    const tree = await openMine();
    expect(
      tree.root.findAll((n) => n.props?.placeholder === 'A different address')
    ).toHaveLength(0);
    expect(findButton(tree, 'Send a code')).toBeUndefined();
    act(() => tree.unmount());
  });

  it('keeps the address, which is the question a name field raises', async () => {
    // "What am I signed in as" is what somebody wants while looking at their
    // own name in a field, and it is the one thing on this screen that
    // answers it.
    const tree = await edit(await openMine());
    expect(textOf(tree)).toContain('me@example.com');
    act(() => tree.unmount());
  });

  it('keeps an edit that Done is tapped on directly', async () => {
    // The trap this replaced: the way out was nearer and more obvious than
    // Save, and discarded the edit without saying so.
    const tree = await edit(await openMine());
    act(() => nameField(tree).props.onChangeText('Alice Nkemdirim'));

    await act(async () => findButton(tree, 'Done')!.props.onPress());
    expect(mockApp.saveProfile).toHaveBeenCalledWith({
      displayName: 'Alice Nkemdirim',
    });
    // And the fields are gone, which is the whole of what Done does besides.
    expect(nameField(tree)).toBeUndefined();
    expect(findButton(tree, 'Edit')).toBeDefined();
    act(() => tree.unmount());
  });

  it('shows the name it just wrote, with no second fetch', async () => {
    // The write is patched into the profile this screen holds rather than
    // re-read: the server was handed the string, so a second GET would spend a
    // round trip being told what we had just said.
    const tree = await edit(await openMine());
    act(() => nameField(tree).props.onChangeText('Alice Nkemdirim'));
    await act(async () => findButton(tree, 'Done')!.props.onPress());

    expect(mockApp.loadProfile).toHaveBeenCalledTimes(1);
    expect(textOf(tree)).toContain('Alice Nkemdirim');
    act(() => tree.unmount());
  });

  it('writes nothing when nothing was changed', async () => {
    const tree = await edit(await openMine());
    await act(async () => nameField(tree).props.onBlur());
    await act(async () => findButton(tree, 'Done')!.props.onPress());
    expect(mockApp.saveProfile).not.toHaveBeenCalled();
    expect(nameField(tree)).toBeUndefined();
    act(() => tree.unmount());
  });

  it('stays put when the edit could not be kept', async () => {
    mockApp.saveProfile.mockRejectedValueOnce(new Error('server said no'));
    const tree = await edit(await openMine());
    act(() => nameField(tree).props.onChangeText('Alice Nkemdirim'));

    await act(async () => findButton(tree, 'Done')!.props.onPress());
    // Leaving edit mode anyway would be the silent discard again, wearing a
    // hat: the words would be gone from a screen that never wrote them.
    expect(nameField(tree)).toBeDefined();
    expect(textOf(tree)).toContain('server said no');
    act(() => tree.unmount());
  });

  it('does not say whose account this is, the way in having said so', async () => {
    // A "Signed in as ..." line rode here from the settings screen and from
    // Home before that, where each time it was the only sentence about the
    // account on a screen about something else. The only way in is the card
    // under "You" on Contacts, so it was answering an answered question.
    const tree = await edit(await openMine());
    expect(textOf(tree)).not.toContain('Signed in');
    act(() => tree.unmount());
  });

  it('will not save an empty name, and says why', async () => {
    // The server refuses this too; the point of refusing it here as well is
    // that a disabled control and a rejected request cannot disagree.
    const tree = await edit(await openMine());
    act(() => nameField(tree).props.onChangeText('   '));
    await act(async () => nameField(tree).props.onBlur());

    expect(mockApp.saveProfile).not.toHaveBeenCalled();
    expect(textOf(tree)).toContain('A name cannot be empty');
    act(() => tree.unmount());
  });
});

describe('adding a contact you met in a channel', () => {
  /** Open the roster line for the other person, which is their profile. */
  async function openTheirProfile() {
    showChannel(channelOf());
    const tree = render(
      <ChannelView
        channelId="sess_1"
        audio={AUDIO}
        onClose={() => {}}
        onExit={() => {}}
      />
    );
    const row = tree.root
      .findAll((n) => n.props?.accessibilityRole === 'button')
      .find((n) => String(n.props?.accessibilityLabel).includes('Dana Chu'));
    await act(async () => row!.props.onPress());
    return tree;
  }

  it('offers to add a stranger, and asks by id', async () => {
    // The whole point: you know their name and their account id, and nothing
    // else. Adding them by address was never possible.
    mockApp.home = { invites: [], rejoinable: [], contacts: [], recordings: [] };
    const tree = await openTheirProfile();

    expect(textOf(tree)).toContain('They will see a request');
    await act(async () => findButton(tree, 'Add contact')!.props.onPress());
    expect(mockApp.connectWith).toHaveBeenCalledWith(THEM);
    act(() => tree.unmount());
  });

  it('says nothing to add when they are already a contact', async () => {
    mockApp.home = {
      invites: [],
      rejoinable: [],
      contacts: [
        { account: { id: THEM, displayName: 'Dana Chu' }, status: 'accepted' },
      ],
      recordings: [],
    };
    const tree = await openTheirProfile();
    expect(textOf(tree)).toContain('Already one of your contacts');
    expect(findButton(tree, 'Add contact')).toBeUndefined();
    act(() => tree.unmount());
  });

  it('waits rather than asking twice', async () => {
    mockApp.home = {
      invites: [],
      rejoinable: [],
      contacts: [
        { account: { id: THEM, displayName: 'Dana Chu' }, status: 'outgoing' },
      ],
      recordings: [],
    };
    const tree = await openTheirProfile();
    expect(textOf(tree)).toContain('waiting for them to accept');
    expect(findButton(tree, 'Add contact')).toBeUndefined();
    act(() => tree.unmount());
  });

  it('offers to accept when they asked first', async () => {
    mockApp.home = {
      invites: [],
      rejoinable: [],
      contacts: [
        { account: { id: THEM, displayName: 'Dana Chu' }, status: 'incoming' },
      ],
      recordings: [],
    };
    const tree = await openTheirProfile();
    const accept = findButton(tree, 'Accept their request');
    expect(accept).toBeDefined();
    await act(async () => accept!.props.onPress());
    expect(mockApp.connectWith).toHaveBeenCalledWith(THEM);
    act(() => tree.unmount());
  });
});

/**
 * A named channel is called something; an unnamed one is only being described,
 * from the viewer's side alone — Alice reads different words for the same
 * channel. Listed side by side in one type they look alike, and the
 * description reads as a shared name it is not, so the styling has to carry
 * the difference. Asserted on style rather than text because that *is* the
 * feature.
 */

describe('removing a contact', () => {
  function shownFor(status: 'accepted' | 'incoming') {
    mockApp.home = {
      invites: [],
      rejoinable: [],
      recordings: [],
      contacts: [
        { account: { id: THEM, displayName: 'Dana Chu' }, status },
      ],
    };
    return render(
      <ProfileView accountId={THEM} fallbackName="Dana Chu" onBack={() => {}} />
    );
  }

  it('is offered for a contact and for nobody else', async () => {
    let tree!: ReactTestRenderer;
    await act(async () => {
      tree = shownFor('accepted');
    });
    expect(findButton(tree, 'Remove contact')).toBeDefined();
    act(() => tree.unmount());

    // Somebody who has asked and not been answered is not a contact to remove;
    // the answer to them is Accept, which is already on this screen.
    await act(async () => {
      tree = shownFor('incoming');
    });
    expect(findButton(tree, 'Remove contact')).toBeUndefined();
    act(() => tree.unmount());
  });

  it('asks first, and says what it costs', async () => {
    const alert = jest
      .spyOn(Alert, 'alert')
      .mockImplementation(() => undefined);
    let tree!: ReactTestRenderer;
    await act(async () => {
      tree = shownFor('accepted');
    });

    await act(async () => findButton(tree, 'Remove contact')!.props.onPress());
    expect(mockApp.removeContact).not.toHaveBeenCalled();

    const [, body, buttons] = alert.mock.calls[0] as [
      string,
      string,
      Array<{ text: string; onPress?: () => void }>,
    ];
    // Both consequences named, because neither is guessable from the button.
    expect(body).toContain('each stop being');
    expect(body).toContain('only the two of you');
    expect(body).toContain('other people');

    await act(async () => {
      buttons.find((b) => b.text === 'Remove')!.onPress!();
    });
    expect(mockApp.removeContact).toHaveBeenCalledWith(THEM);
    alert.mockRestore();
    act(() => tree.unmount());
  });

  /**
   * The profile can be open over the very channel the removal empties — a
   * one-to-one channel is exactly the case — so closing it onto that channel
   * would land on "Channel gone", which is true and a strange answer to a tap
   * about a person. The caller decides where to go; ChannelView sends it Home.
   */
  it('leaves by the route the caller chose', async () => {
    const alert = jest
      .spyOn(Alert, 'alert')
      .mockImplementation(() => undefined);
    const onBack = jest.fn();
    const onRemoved = jest.fn();
    mockApp.home = {
      invites: [],
      rejoinable: [],
      recordings: [],
      contacts: [
        { account: { id: THEM, displayName: 'Dana Chu' }, status: 'accepted' },
      ],
    };
    let tree!: ReactTestRenderer;
    await act(async () => {
      tree = render(
        <ProfileView
          accountId={THEM}
          fallbackName="Dana Chu"
          onBack={onBack}
          onRemoved={onRemoved}
        />
      );
    });

    await act(async () => findButton(tree, 'Remove contact')!.props.onPress());
    const [, , buttons] = alert.mock.calls[0] as [
      string,
      string,
      Array<{ text: string; onPress?: () => void }>,
    ];
    await act(async () => {
      buttons.find((b) => b.text === 'Remove')!.onPress!();
    });

    expect(onRemoved).toHaveBeenCalled();
    expect(onBack).not.toHaveBeenCalled();
    alert.mockRestore();
    act(() => tree.unmount());
  });
});

describe('showing your email to a contact', () => {
  const asContact = (status: 'accepted' | 'outgoing' = 'accepted') => {
    mockApp.home = {
      invites: [],
      rejoinable: [],
      recordings: [],
      contacts: [
        { account: { id: THEM, displayName: 'Dana Chu' }, status },
      ],
    };
  };

  const withProfile = (extra: Partial<ProfileViewData>) =>
    mockApp.loadProfile.mockResolvedValue({
      account: { id: THEM, displayName: 'Dana Chu' },
      ...extra,
    } as ProfileViewData);

  async function open() {
    let tree!: ReactTestRenderer;
    await act(async () => {
      tree = render(
        <ProfileView accountId={THEM} fallbackName="Dana Chu" onBack={() => {}} />
      );
    });
    return tree;
  }

  /**
   * `withProfile` sets a standing implementation rather than a one-shot,
   * because pressing either button re-reads the profile — so a `…Once` would
   * answer the first read and leave the second with the shared default. A
   * standing one outlives the test, `clearAllMocks` clearing calls and not
   * implementations, so it is put back by hand.
   */
  const defaultProfile = mockApp.loadProfile.getMockImplementation()!;

  beforeEach(() => {
    (Clipboard.setStringAsync as jest.Mock).mockImplementation(async () => true);
  });

  afterEach(() => {
    mockApp.loadProfile.mockImplementation(defaultProfile);
  });

  it('offers the button, and says what it does', async () => {
    asContact();
    withProfile({ myEmailShown: false });
    const tree = await open();

    expect(findButton(tree, 'Show my email')).toBeDefined();
    expect(textOf(tree)).toContain('Show my email to this contact.');
    act(() => tree.unmount());
  });

  it('sends the decision and re-reads what the server now says', async () => {
    // Re-read rather than patched in place: the server decides the field, and
    // a screen that assumed the answer would be a second copy of the rule.
    asContact();
    withProfile({ myEmailShown: false });
    const tree = await open();
    mockApp.loadProfile.mockClear();

    await act(async () => findButton(tree, 'Show my email')!.props.onPress());

    expect(mockApp.setEmailShown).toHaveBeenCalledWith(THEM, true);
    expect(mockApp.loadProfile).toHaveBeenCalledWith(THEM);
    act(() => tree.unmount());
  });

  it('offers to stop once it is shown, and says what stopping cannot do', async () => {
    asContact();
    withProfile({ myEmailShown: true });
    const tree = await open();

    const text = textOf(tree);
    expect(text).toContain('They can see your email.');
    // The honest half: it ends the standing ability to come back for it, and
    // reaches nowhere they have already written it down.
    expect(text).toContain('already have it written down');
    expect(findButton(tree, 'Show my email')).toBeUndefined();

    await act(async () =>
      findButton(tree, 'Stop showing my email')!.props.onPress()
    );
    expect(mockApp.setEmailShown).toHaveBeenCalledWith(THEM, false);
    act(() => tree.unmount());
  });

  it('shows theirs with a button that copies it', async () => {
    asContact();
    withProfile({ email: 'dana@example.com', myEmailShown: false });
    const tree = await open();

    expect(textOf(tree)).toContain('dana@example.com');
    await act(async () => findButton(tree, 'Copy')!.props.onPress());

    expect(Clipboard.setStringAsync).toHaveBeenCalledWith('dana@example.com');
    expect(textOf(tree)).toContain('copied');
    act(() => tree.unmount());
  });

  it('says so when the clipboard declines, rather than claiming a copy', async () => {
    // `setStringAsync` resolves to a boolean precisely so a copy that did not
    // happen is not announced as one — see src/clipboard.ts.
    (Clipboard.setStringAsync as jest.Mock).mockImplementation(async () => false);
    asContact();
    withProfile({ email: 'dana@example.com' });
    const tree = await open();

    await act(async () => findButton(tree, 'Copy')!.props.onPress());
    expect(textOf(tree)).toContain('copy failed');
    act(() => tree.unmount());
  });

  it('says which half is empty rather than leaving a gap', async () => {
    asContact();
    withProfile({ myEmailShown: false });
    expect(textOf(await open())).toContain(
      'They are not showing you their email.'
    );
  });

  it('is not offered to anybody who is not a contact', async () => {
    // The server refuses the same call, and that is the load-bearing half.
    // This is the screen agreeing with it rather than offering a button that
    // would be refused — somebody met in a channel is asked to be a contact
    // first, which the card above does.
    for (const home of ['outgoing', 'none'] as const) {
      if (home === 'none') mockApp.home = null;
      else asContact('outgoing');
      withProfile({ myEmailShown: false });
      const tree = await open();
      expect(textOf(tree)).not.toContain('Show my email');
      act(() => tree.unmount());
    }
  });
});

/**
 * What each of these two screens says it *is*, above what it is called.
 *
 * They were the only screens headed by their contents rather than by their
 * kind, which reads worst on an unnamed channel: its header is a muted italic
 * list of who is in it, and so is very nearly what a contact's header looks
 * like. What is asserted here is the word and its position — above the name,
 * not beside it — and, on the contact screen, that the word tells the truth
 * about a relationship rather than about a route.
 */

describe('reaching somebody in the messaging apps they use', () => {
  const withProfile = (extra: Partial<ProfileViewData>) =>
    mockApp.loadProfile.mockResolvedValueOnce({
      account: { id: THEM, displayName: 'Dana Chu' },
      ...extra,
    } as ProfileViewData);

  const open = async (id: string = THEM) => {
    mockApp.home = { invites: [], rejoinable: [], recordings: [], contacts: [] };
    let tree!: ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(
        <ProfileView accountId={id} fallbackName="Dana Chu" onBack={() => {}} />
      );
    });
    return tree;
  };

  it('draws one row per handle, and opens the app on a tap', async () => {
    const { Linking } = require('react-native');
    const opened = jest
      .spyOn(Linking, 'openURL')
      .mockResolvedValue(undefined as never);

    withProfile({
      im: { whatsapp: '+15551234567', telegram: 'dana_chu' },
    });
    const tree = await open();

    const text = textOf(tree);
    expect(text).toContain('WhatsApp');
    expect(text).toContain('+15551234567');
    expect(text).toContain('Telegram');
    // Nothing is drawn for the service they left blank.
    expect(text).not.toContain('Signal');

    await act(async () => findButton(tree, 'Open')!.props.onPress());
    expect(opened).toHaveBeenCalledWith('https://wa.me/15551234567');

    opened.mockRestore();
    act(() => tree.unmount());
  });

  it('leaves the section out when there is nothing in it', async () => {
    // Which is the same screen a stranger gets, the server withholding the
    // handles from anybody who is not a contact — and the same one an older
    // server produces. All three mean there is no way to reach this person
    // elsewhere from here, and none is worth a card saying so.
    withProfile({});
    const tree = await open();
    expect(textOf(tree)).not.toContain('Messaging');
    act(() => tree.unmount());
  });

  it('offers the fields on your own profile, and stores what it can read', async () => {
    mockApp.home = { invites: [], rejoinable: [], recordings: [], contacts: [] };
    mockApp.loadProfile.mockResolvedValueOnce({
      account: { id: ME, displayName: 'Me' },
      im: { telegram: 'me_here' },
    } as ProfileViewData);
    let tree!: ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(
        <ProfileView accountId={ME} fallbackName="Me" onBack={() => {}} />
      );
    });
    await act(async () => findButton(tree, 'Edit')!.props.onPress());

    const field = (placeholder: string, index = 0) =>
      tree.root.findAll(
        (n) => typeof n.type === 'string' && n.props?.placeholder === placeholder
      )[index];

    // Seeded from what the server holds, like the name.
    expect(field('@username').props.value).toBe('me_here');

    // WhatsApp first, Signal second — the two share a hint, both being phone
    // numbers, which is why this is by position.
    act(() =>
      field('+1 555 123 4567').props.onChangeText('+1 (555) 987-6543')
    );
    await act(async () => field('+1 555 123 4567').props.onBlur());

    // Canonical on the wire, whatever was typed into the field.
    expect(mockApp.saveProfile).toHaveBeenCalledWith({
      im: { whatsapp: '+15559876543' },
    });
    act(() => tree.unmount());
  });

  it('says what a half-typed handle needs rather than sending it', async () => {
    mockApp.home = { invites: [], rejoinable: [], recordings: [], contacts: [] };
    mockApp.loadProfile.mockResolvedValueOnce({
      account: { id: ME, displayName: 'Me' },
    } as ProfileViewData);
    let tree!: ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(
        <ProfileView accountId={ME} fallbackName="Me" onBack={() => {}} />
      );
    });
    await act(async () => findButton(tree, 'Edit')!.props.onPress());

    const whatsapp = tree.root.findAll(
      (n) =>
        typeof n.type === 'string' && n.props?.placeholder === '+1 555 123 4567'
    )[0];
    act(() => whatsapp.props.onChangeText('555 1234'));
    await act(async () => whatsapp.props.onBlur());

    // The server would refuse it — and refuse the name it travelled with,
    // this being one write — so it is not sent, and the field says what
    // is missing while the typing stays where it was typed.
    expect(mockApp.saveProfile).not.toHaveBeenCalled();
    expect(textOf(tree)).toContain('country code');
    expect(whatsapp.props.value).toBe('555 1234');
    act(() => tree.unmount());
  });
});

/**
 * The one notification a person composes and aims, so the composer is the one
 * place in the app where a text field feeds a push.
 *
 * The gating is what these are about. It is offered for somebody who is not in
 * the room and withheld for somebody who is, and the server refuses on the same
 * test — so a screen left open while they walked in is refused rather than
 * silently sending.
 *
 * **These render `ProfileView` directly and are given `onPing` as a prop**, so
 * they are about what the composer does with one, not about who gets one. The
 * empty `contacts` below is therefore not a claim that a stranger is offered a
 * composer — whether `onPing` is supplied at all is `ChannelView`'s decision,
 * and pinging requires being a contact. That gate is tested over in
 * *who is in the channel, and who is talking*, which renders `ChannelView`.
 */

describe('when somebody was last in the app', () => {
  function profileWith(
    lastSeenAt: number | null | undefined,
    inApp?: boolean,
    status: 'accepted' | 'incoming' = 'accepted'
  ) {
    mockApp.home = {
      invites: [],
      rejoinable: [],
      recordings: [],
      contacts: [
        { account: { id: THEM, displayName: 'Dana Chu' }, status },
      ],
    };
    mockApp.loadProfile.mockResolvedValueOnce({
      account: { id: THEM, displayName: 'Dana Chu' },
      ...(lastSeenAt === undefined ? {} : { lastSeenAt }),
      ...(inApp === undefined ? {} : { inApp }),
    });
    return render(
      <ProfileView accountId={THEM} fallbackName="Dana Chu" onBack={() => {}} />
    );
  }

  /** Renders and waits for the fetch, which lands in a microtask. */
  async function shown(...args: Parameters<typeof profileWith>) {
    let tree!: ReactTestRenderer;
    await act(async () => {
      tree = profileWith(...args);
    });
    return tree;
  }

  it('says how long ago, in words', async () => {
    mockApp.serverNow = () => NOW + 5 * 60_000;
    const tree = await shown(NOW);
    expect(textOf(tree)).toContain('Last seen 5 minutes ago');
    mockApp.serverNow = () => NOW;
    act(() => tree.unmount());
  });

  it('says they are here rather than counting the seconds', async () => {
    // "A few seconds ago" about somebody sitting in the app is true and
    // useless — and the stored time is a heartbeat stale, so a live user
    // would otherwise flicker between a count and nothing.
    mockApp.serverNow = () => NOW + 3_000;
    const tree = await shown(NOW);
    const text = textOf(tree);
    expect(text).toContain('In the app now');
    expect(text).not.toContain('seconds ago');
    mockApp.serverNow = () => NOW;
    act(() => tree.unmount());
  });

  it('says nothing at all when it does not know', async () => {
    // Three ways to get here and none is worth a word on screen: a server that
    // predates the fields sends none, somebody who has not connected since
    // they existed has nothing recorded, and a reader who is not a contact is
    // told nothing whatever the record says.
    for (const unknown of [null, undefined] as const) {
      const tree = await shown(unknown);
      const text = textOf(tree);
      expect(text).toContain('Dana Chu');
      expect(text).not.toContain('Last seen');
      expect(text).not.toContain('In the app now');
      act(() => tree.unmount());
    }
  });

  it('believes the fact over the arithmetic', async () => {
    // The worked case, on this side of the wire. Dana has been sitting in a
    // channel for an hour, so the timestamp in this snapshot is an hour old —
    // it was true when the server composed it and nothing has been sent
    // since, because nothing needed to be. Reading it as an hour idle is the
    // whole of what the old contact row got wrong.
    mockApp.serverNow = () => NOW + 3_600_000;
    const tree = await shown(NOW, true);
    const text = textOf(tree);
    expect(text).toContain('In the app now');
    expect(text).not.toContain('ago');
    mockApp.serverNow = () => NOW;
    act(() => tree.unmount());
  });

  it('counts from the moment they went, once they have gone', async () => {
    mockApp.serverNow = () => NOW + 5 * 60_000;
    const tree = await shown(NOW, false);
    expect(textOf(tree)).toContain('Last seen 5 minutes ago');
    mockApp.serverNow = () => NOW;
    act(() => tree.unmount());
  });

  it('does not flicker while they are reconnecting', async () => {
    // A tunnel or a lift closes the socket, so `inApp` goes false with the
    // departure a moment ago. No grace period exists on this clock; the
    // sixty-second floor is what keeps the line steady, and it has to keep
    // doing so or every flap shows as a departure.
    mockApp.serverNow = () => NOW + 3_000;
    const tree = await shown(NOW, false);
    expect(textOf(tree)).toContain('In the app now');
    mockApp.serverNow = () => NOW;
    act(() => tree.unmount());
  });

  it('falls back to the old reading when the server sends no such field', async () => {
    // An installed build meets this between its release and the deploy that
    // follows: `lastSeenAt` without `inApp` is what the server sent before the
    // fact existed, and the subtraction is still the best answer available.
    mockApp.serverNow = () => NOW + 5 * 60_000;
    const tree = await shown(NOW, undefined);
    expect(textOf(tree)).toContain('Last seen 5 minutes ago');
    mockApp.serverNow = () => NOW;
    act(() => tree.unmount());
  });
});

/**
 * How many people are here because of them, counting onwards. The line has
 * three states and only two of them are a number: it is shown at nought, and
 * it is left out entirely when the server said nothing — which is what an
 * install meets between its release and the deploy that follows.
 */
