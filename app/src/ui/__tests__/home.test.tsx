import React from 'react';
import renderer, {
  act,
  type ReactTestInstance,
  type ReactTestRenderer,
} from 'react-test-renderer';
import { HomeView } from '../HomeView';
import { Screen } from '../components';
import { colors } from '../theme';
import { ProfileView } from '../ProfileView';
import { Alert, Platform, StyleSheet } from 'react-native';
import {
  NOW,
  THEM,
  findButton,
  findExactButton,
  homeNav,
  mockApp,
  render,
  resetHarness,
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
 * Home itself: what the screen shows, what it shows while you are already
 * standing in a channel, and the states it has to say out loud — an empty
 * channel, a connection that has dropped, how many people you have brought
 * in.
 *
 * Split out of `views.test.tsx` on 2026-09-04, which was 8,495 lines and 343
 * tests by then; the fixtures every one of these files shares are in
 * `testing/harness`.
 */

beforeEach(resetHarness);

describe('Home', () => {
  it('no longer says who you are signed in as', () => {
    // It is a fact about the account, and the screen about the account is
    // Contact settings, which now carries it. Home is a list of rooms.
    mockApp.home = { invites: [], rejoinable: [], contacts: [], recordings: [] };
    const tree = render(<HomeView {...homeNav} />);
    expect(textOf(tree)).not.toContain('Signed in');
    act(() => tree.unmount());
  });

  it('renders the channels from a snapshot, and no contact of any kind', () => {
    mockApp.home = {
      invites: [
        {
          channelId: 'sess_a',
          from: { id: THEM, displayName: 'Dana Chu' },
          createdAt: NOW,
        },
      ],
      rejoinable: [
        {
          channelId: 'sess_b',
          name: null,
          others: [{ id: 'acct_x', displayName: 'Miro Okafor' }],
          presentCount: 1,
          createdAt: NOW,
          lastActiveAt: NOW,
        },
      ],
      // No contact of any status is drawn by this list. An accepted one is a
      // channel and appears above as that; a request is the contacts tab's,
      // since 2026-09-05.
      contacts: [
        { account: { id: 'acct_p', displayName: 'Priya Raman' }, status: 'incoming' },
        { account: { id: 'acct_q', displayName: 'Quinn Ito' }, status: 'accepted' },
      ],
      recordings: [],
    };

    const tree = render(<HomeView {...homeNav} />);
    const text = textOf(tree);
    expect(text).toContain('tap to join');
    expect(text).toContain('Miro Okafor');
    expect(text).toContain('1 present');
    expect(text).not.toContain('Priya Raman');
    expect(text).not.toContain('Quinn Ito');
    act(() => tree.unmount());
  });

  it('draws a seat as somewhere to go back to, and never on a phone', () => {
    // A channel you are a guest of is a place you can return to, which is what
    // this list means — so it belongs among the rest rather than in a section
    // of its own. It opens the guest page, a document this app does not own,
    // and it can only do that in a browser.
    const seat = {
      channelId: 'sess_seat',
      name: 'Alice and Bob',
      others: [],
      presentCount: 2,
      createdAt: NOW,
      lastActiveAt: NOW,
      everUsed: true,
      seat: true,
    };
    mockApp.home = {
      invites: [],
      rejoinable: [seat],
      contacts: [],
      recordings: [],
    };

    const phone = render(<HomeView {...homeNav} />);
    // `Platform.OS` is 'ios' under the preset, which is the case this guards:
    // the same account may hold a seat opened on a laptop, and a row a phone
    // cannot open is worse than no row.
    expect(textOf(phone)).not.toContain('Alice and Bob');
    act(() => phone.unmount());

    const wasOs = Platform.OS;
    // Assigned rather than mocked: `Platform` is one object the preset hands
    // every importer, so setting it here is what the module under test reads.
    (Platform as { OS: string }).OS = 'web';
    try {
      const browser = render(<HomeView {...homeNav} />);
      const text = textOf(browser);
      expect(text).toContain('Alice and Bob');
      // Said plainly: a row that read like the others would promise the
      // channel screen and open a different page.
      expect(text).toContain('You are a guest here');
      expect(text).toContain('2 present');
      act(() => browser.unmount());
    } finally {
      (Platform as { OS: string }).OS = wasOs;
    }
  });

  /**
   * The install notice, which is about the one thing a browser cannot do.
   *
   * Not a nag about a nicer client: what a browser-only install costs is other
   * people's ability to reach you, which is not something somebody can be said
   * to have chosen without being told. Hence a browser, hence once.
   */
  it('offers the app to a browser, once, and never on a phone', () => {
    mockApp.home = { invites: [], rejoinable: [], contacts: [], recordings: [] };
    mockApp.updateUrl = 'https://apps.apple.com/app/id123';

    // A phone is already the thing the notice is asking for.
    const phone = render(<HomeView {...homeNav} />);
    expect(textOf(phone)).not.toContain('Put The Floor on your phone');
    act(() => phone.unmount());

    const wasOs = Platform.OS;
    (Platform as { OS: string }).OS = 'web';
    try {
      const browser = render(<HomeView {...homeNav} />);
      expect(textOf(browser)).toContain('Put The Floor on your phone');

      // Answered is answered: a standing banner about an install somebody has
      // declined is an advertisement. That it survives a reload is
      // `installNotice.test.ts`, which has a browser's storage to check it in
      // — this preset has none.
      act(() => findButton(browser, 'Not now')!.props.onPress());
      expect(textOf(browser)).not.toContain('Put The Floor on your phone');
      act(() => browser.unmount());
    } finally {
      (Platform as { OS: string }).OS = wasOs;
    }
  });

  it('offers no install where there is no App Store to offer', () => {
    mockApp.home = { invites: [], rejoinable: [], contacts: [], recordings: [] };
    // Unset on a box that has not been told, and a call to action that goes
    // nowhere is worse than none.
    mockApp.updateUrl = null;

    const wasOs = Platform.OS;
    (Platform as { OS: string }).OS = 'web';
    try {
      const browser = render(<HomeView {...homeNav} />);
      expect(textOf(browser)).not.toContain('Put The Floor on your phone');
      act(() => browser.unmount());
    } finally {
      (Platform as { OS: string }).OS = wasOs;
    }
  });

  /**
   * Three sections, in one order, and each channel in exactly the first one it
   * qualifies for.
   */
  it('sections the channels into live, invited and the rest', () => {
    mockApp.home = {
      invites: [
        {
          channelId: 'sess_quiet',
          from: { id: THEM, displayName: 'Dana Chu' },
          createdAt: NOW,
          name: 'Asked In',
          others: [{ id: THEM, displayName: 'Dana Chu' }],
          presentCount: 0,
          lastPresenceAt: NOW - 3_600_000,
        },
      ],
      rejoinable: [
        {
          channelId: 'sess_live',
          name: 'Talking Now',
          others: [{ id: 'acct_x', displayName: 'Miro Okafor' }],
          presentCount: 2,
          createdAt: NOW,
          lastActiveAt: NOW,
          lastPresenceAt: NOW,
        },
        {
          channelId: 'sess_cold',
          name: 'Long Quiet',
          others: [{ id: 'acct_y', displayName: 'Priya Raman' }],
          presentCount: 0,
          createdAt: NOW,
          lastActiveAt: NOW - 3 * 86_400_000,
          lastPresenceAt: NOW - 3 * 86_400_000,
        },
      ],
      contacts: [],
      recordings: [],
    };

    const tree = render(<HomeView {...homeNav} />);
    const text = textOf(tree);
    const order = ['Live', 'Talking Now', 'Invitations', 'Asked In', 'Your channels', 'Long Quiet'];
    expect(order.map((t) => text.indexOf(t))).toEqual(
      [...order.map((t) => text.indexOf(t))].sort((a, b) => a - b)
    );
    act(() => tree.unmount());
  });

  it('puts an invitation somebody is waiting in under Live, not Invitations', () => {
    // The sections are a ladder rather than a taxonomy. An invitation with
    // people in it is the most urgent thing on the screen, and burying it
    // under channels nobody is in to keep the categories tidy would be sorting
    // by classification instead of by what to do next.
    mockApp.home = {
      invites: [
        {
          channelId: 'sess_a',
          from: { id: THEM, displayName: 'Dana Chu' },
          createdAt: NOW,
          name: 'Come In',
          others: [{ id: THEM, displayName: 'Dana Chu' }],
          presentCount: 2,
        },
      ],
      rejoinable: [],
      contacts: [],
      recordings: [],
    };
    const tree = render(<HomeView {...homeNav} />);
    const text = textOf(tree);
    expect(text).toContain('Live');
    expect(text).not.toContain('Invitations');
    // Still says who asked, which is the thing a live channel of your own
    // would not have to say.
    expect(text).toContain('Dana Chu is waiting');
    act(() => tree.unmount());
  });

  it('says how long a quiet channel has been quiet', () => {
    mockApp.serverNow = () => NOW + 2 * 3_600_000;
    mockApp.home = {
      invites: [],
      rejoinable: [
        {
          channelId: 'sess_b',
          name: 'Standup',
          others: [{ id: 'acct_x', displayName: 'Miro Okafor' }],
          presentCount: 0,
          createdAt: NOW,
          lastActiveAt: NOW,
          lastPresenceAt: NOW,
        },
      ],
      contacts: [],
      recordings: [],
    };
    const tree = render(<HomeView {...homeNav} />);
    expect(textOf(tree)).toContain('2 hours ago');
    mockApp.serverNow = () => NOW;
    act(() => tree.unmount());
  });

  it('invents no idleness for a server that sends no stamp', () => {
    // An installed build meets this between its release and the deploy that
    // follows, and an invitation is the only row that can reach it: a channel
    // row falls back to `lastActiveAt`, which for a channel nobody is in is
    // the same answer. With nothing to measure from, the interval is dropped
    // rather than guessed at — the row still says who asked.
    mockApp.home = {
      invites: [
        {
          channelId: 'sess_b',
          from: { id: 'acct_x', displayName: 'Miro Okafor' },
          createdAt: NOW,
          presentCount: 0,
        },
      ],
      rejoinable: [],
      contacts: [],
      recordings: [],
    };
    const tree = render(<HomeView {...homeNav} />);
    const text = textOf(tree);
    expect(text).toContain('Miro Okafor asked you in');
    expect(text).not.toContain('ago');
    expect(text).not.toContain('·');
    act(() => tree.unmount());
  });

  it('says how long ago even when it was moments ago', () => {
    // There used to be a floor here, and under it the row said "Nobody here
    // right now" — which the reader already knew, an occupied channel showing
    // its count instead. Every row answers the same question the same way.
    mockApp.home = {
      invites: [],
      rejoinable: [
        {
          channelId: 'sess_b',
          name: 'Standup',
          others: [{ id: 'acct_x', displayName: 'Miro Okafor' }],
          presentCount: 0,
          createdAt: NOW,
          lastActiveAt: NOW,
          lastPresenceAt: NOW - 5_000,
        },
      ],
      contacts: [],
      recordings: [],
    };
    const tree = render(<HomeView {...homeNav} />);
    const text = textOf(tree);
    expect(text).toContain('A few seconds ago');
    expect(text).not.toContain('Nobody here right now');
    act(() => tree.unmount());
  });

  /**
   * Two invitations from one person used to be the same banner twice: it named
   * only the sender, so there was no way to tell which channel either was for.
   * The App Review account met exactly that on 2026-08-17.
   */
  it('says which channel each invitation is for', () => {
    mockApp.home = {
      invites: [
        {
          channelId: 'sess_a',
          from: { id: THEM, displayName: 'Dana Chu' },
          createdAt: NOW,
          name: 'Weekly Convo',
          others: [{ id: THEM, displayName: 'Dana Chu' }],
          presentCount: 1,
        },
        {
          channelId: 'sess_b',
          from: { id: THEM, displayName: 'Dana Chu' },
          createdAt: NOW,
          name: null,
          others: [{ id: THEM, displayName: 'Dana Chu' }],
          presentCount: 1,
        },
      ],
      rejoinable: [],
      contacts: [],
      recordings: [],
    };
    const tree = render(<HomeView {...homeNav} />);
    const text = textOf(tree);
    expect(text).toContain('Weekly Convo');
    // The unnamed one is described by its roster rather than left blank.
    expect(text).toContain('Dana Chu');
    act(() => tree.unmount());
  });

  /**
   * An invitation outlives the moment it was sent. What it must not do is go on
   * claiming that moment is still happening — the banner said somebody "is
   * waiting in a channel" after they had stepped out of it.
   */
  it('does not say somebody is waiting in an empty channel', () => {
    mockApp.home = {
      invites: [
        {
          channelId: 'sess_a',
          from: { id: THEM, displayName: 'Dana Chu' },
          createdAt: NOW,
          name: 'Weekly Convo',
          others: [{ id: THEM, displayName: 'Dana Chu' }],
          presentCount: 0,
          lastPresenceAt: NOW - 3_600_000,
        },
      ],
      rejoinable: [],
      contacts: [],
      recordings: [],
    };
    const tree = render(<HomeView {...homeNav} />);
    const text = textOf(tree);
    expect(text).not.toContain('is waiting');
    expect(text).toContain('asked you in · an hour ago');
    act(() => tree.unmount());
  });

  it('does not list recordings, which belong to their channel', () => {
    // They were here, as one flat list belonging to nothing. The server still
    // sends the field for build 20, which renders it; this screen ignores it.
    mockApp.home = {
      invites: [],
      rejoinable: [],
      contacts: [],
      recordings: [
        {
          id: 'rec_1',
          channelId: 'sess_1',
          name: 'Dana Chu and Me',
          others: [{ id: THEM, displayName: 'Dana Chu' }],
          startedAt: NOW,
          endedAt: NOW + 92_000,
          durationMs: 92_000,
        },
      ],
    };

    const tree = render(<HomeView {...homeNav} />);
    const text = textOf(tree);
    expect(text).not.toContain('Dana Chu and Me');
    expect(text).not.toContain('1:32');
    expect(findExactButton(tree, 'Share')).toBeUndefined();
    act(() => tree.unmount());
  });

  describe('declining an invitation', () => {
    const invited = () => {
      mockApp.home = {
        invites: [
          {
            channelId: 'sess_a',
            from: { id: THEM, displayName: 'Dana Chu' },
            createdAt: NOW,
          },
        ],
        rejoinable: [],
        contacts: [
          { account: { id: THEM, displayName: 'Dana Chu' }, status: 'accepted' },
        ],
        recordings: [],
      };
      const tree = render(<HomeView {...homeNav} />);
      const [decline] = tree.root.findAll(
        (n: ReactTestInstance) => n.props?.accessibilityLabel === 'Decline invite'
      );
      return { tree, decline };
    };

    const alertSpy = () => {
      const { Alert } = require('react-native');
      return jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    };

    it('asks first, and says what it costs', () => {
      const asked = alertSpy();
      const { tree, decline } = invited();
      expect(decline).toBeDefined();

      act(() => decline.props.onPress());
      expect(asked).toHaveBeenCalled();
      // Nothing has happened yet, which is the whole point of asking: this
      // used to be a hide, and it is now a departure that cannot be undone
      // from this screen.
      expect(mockApp.act).not.toHaveBeenCalled();
      expect(asked.mock.calls[0][1] as string).toContain('fresh invitation');

      asked.mockRestore();
      act(() => tree.unmount());
    });

    it('leaves the channel when the destructive choice is taken', () => {
      // The defect it answers: dismissal was a list in the provider that no
      // storage ever saw, so the invitation came back on the next launch and
      // had never gone from any other device. Leaving is the action that
      // already means no, and the server tells every device at once.
      const asked = alertSpy();
      const { tree, decline } = invited();
      act(() => decline.props.onPress());

      const buttons = asked.mock.calls[0][2] as {
        text: string;
        onPress?: () => void;
      }[];
      act(() => buttons.find((b) => b.text === 'Decline')!.onPress!());
      expect(mockApp.act).toHaveBeenCalledWith('sess_a', {
        type: 'LEAVE_CHANNEL',
      });

      asked.mockRestore();
      act(() => tree.unmount());
    });

    it('does nothing when the ask is cancelled', () => {
      const asked = alertSpy();
      const { tree, decline } = invited();
      act(() => decline.props.onPress());

      const buttons = asked.mock.calls[0][2] as {
        text: string;
        onPress?: () => void;
      }[];
      act(() => buttons.find((b) => b.text === 'Cancel')!.onPress?.());
      expect(mockApp.act).not.toHaveBeenCalled();
      // And the row is still there, the invitation being the server's to
      // withdraw rather than this screen's to hide.
      expect(textOf(tree)).toContain('tap to join');

      asked.mockRestore();
      act(() => tree.unmount());
    });
  });

  it('says so when the connection is down', () => {
    // After a grace period, deliberately — see "the connection warning"
    // below. The banner is about a connection that failed, not about one
    // that has not finished being made.
    jest.useFakeTimers();
    mockApp.home = { invites: [], rejoinable: [], contacts: [], recordings: [] };
    mockApp.status = 'closed';
    const tree = render(<HomeView {...homeNav} />);
    act(() => {
      jest.advanceTimersByTime(3_000);
    });
    expect(textOf(tree)).toContain('Not connected');
    act(() => tree.unmount());
    jest.useRealTimers();
  });
});

describe('Home while still in a channel', () => {
  const home = () => {
    mockApp.home = {
      invites: [],
      rejoinable: [],
      contacts: [],
      recordings: [],
    };
  };

  it('says so, and offers the way back', () => {
    // An open microphone behind a screen that gives no sign of it is the one
    // way this could be worse than having to step out first.
    home();
    const onReturn = jest.fn();
    const tree = render(
      <HomeView
        {...homeNav}
        liveChannel={{
          channelId: 'sess_1',
          title: 'Book club',
          present: 2,
          muted: false,
        }}
        onReturnToChannel={onReturn}
      />
    );
    const text = textOf(tree).replace(/\s+/g, ' ');
    // The title is a title. That you are inside it is said by the badge, not
    // by a preposition glued to the front of the name.
    expect(text).toContain('Book club');
    expect(text).not.toContain('In Book club');
    expect(text).toContain('2 present');
    expect(text).toContain('tap to go back');

    // Found the way a person using VoiceOver would: the bar announces itself
    // as a button, which it should have done regardless of this test.
    const bar = findButton(tree, 'Book club');
    expect(bar).toBeDefined();
    act(() => bar!.props.onPress());
    expect(onReturn).toHaveBeenCalledWith('sess_1');
    act(() => tree.unmount());
  });

  /*
    And it is pinned, which is the half of "says so" a text search cannot see:
    a bar that scrolls out of the viewport on the first flick gives no sign of
    an open microphone for most of a list as long as somebody's channels.

    Asserted on `Screen`'s `header` prop for the reason the channel's version
    is — both arrangements flatten to the same string.
  */
  it('pins the live bar and the header above the list', () => {
    home();
    const tree = render(
      <HomeView
        {...homeNav}
        liveChannel={{
          channelId: 'sess_1',
          title: 'Book club',
          present: 2,
          muted: false,
        }}
        onReturnToChannel={jest.fn()}
      />
    );
    const [screen] = tree.root.findAll((node) => node.type === Screen);
    const header = render(screen.props.header);
    const text = textOf(header);

    expect(text).toContain('The Floor');
    expect(text).toContain('Book club');
    // The switch is pinned with it, being the other thing that is about the
    // frame rather than about the list inside it.
    expect(findButton(header, 'Channels')).toBeDefined();
    expect(findButton(header, 'Contacts')).toBeDefined();
    expect(findButton(header, 'Settings')).toBeDefined();
    act(() => header.unmount());
    act(() => tree.unmount());
  });

  /**
   * The fault the tier was built for.
   *
   * The bar was in the channel list's header, so switching to the contacts
   * took it off the screen. On a phone that survived — the contacts covered
   * the channels and you had been there a moment ago — but in a split the
   * contact list holds the left pane while something else holds the right, and
   * then somebody is present in a conversation with nothing anywhere on screen
   * saying so. The fix proposed first was to draw the bar in the contact list
   * too, which is why this asserts on the *tier's* header rather than merely
   * on the text: a live room is not a contact, and the bar being above both
   * lists is the whole of the change.
   */
  it('keeps the live bar over the contacts, not only over the channels', () => {
    home();
    const bar = {
      channelId: 'sess_1',
      title: 'Book club',
      present: 2,
      muted: false,
    };
    for (const list of ['channels', 'contacts'] as const) {
      const tree = render(
        <HomeView
          {...homeNav}
          list={list}
          liveChannel={bar}
          onReturnToChannel={jest.fn()}
        />
      );
      const [screen] = tree.root.findAll((node) => node.type === Screen);
      const header = render(screen.props.header);
      expect(textOf(header)).toContain('Book club');
      act(() => header.unmount());
      act(() => tree.unmount());
    }
  });

  /*
    And Chip in is the tier's too, for the same reason said the other way
    round: it is about the application rather than about either list. It was
    drawn under both of them until the tier grew a third body; now it is on
    that body, one tap from either list and at the tail of neither.
  */
  it('offers Chip in on the Support tab and under neither list', async () => {
    home();
    // The default stub is a server with somewhere to give, which is what makes
    // this about where the row is drawn rather than about whether it is.
    for (const list of ['channels', 'contacts', 'support'] as const) {
      let tree!: ReactTestRenderer;
      await act(async () => {
        tree = renderer.create(<HomeView {...homeNav} list={list} />);
      });
      if (list === 'support') expect(findButton(tree, 'Chip in')).toBeTruthy();
      else expect(findButton(tree, 'Chip in')).toBeUndefined();
      act(() => tree.unmount());
    }
  });

  /*
    The tab itself, which is the whole of how anybody reaches any of that.
    Asserted from either list rather than only from Channels: the switch is
    the tier's, so a body that drew two of the three would be a body somebody
    could get stuck on.
  */
  it('offers the Support tab from either list', () => {
    home();
    for (const list of ['channels', 'contacts'] as const) {
      const tree = render(<HomeView {...homeNav} list={list} />);
      const [screen] = tree.root.findAll((node) => node.type === Screen);
      const header = render(screen.props.header);
      expect(textOf(header)).toContain('Support');
      act(() => header.unmount());
      act(() => tree.unmount());
    }
  });

  it('falls back to the roster when the channel has no name', () => {
    // The same fallback the channel's own header uses, computed in App.tsx —
    // a channel must not answer to one thing here and another there.
    home();
    const tree = render(
      <HomeView
        {...homeNav}
        liveChannel={{
          channelId: 'sess_1',
          title: 'Dana Chu',
          present: 1,
          muted: false,
        }}
        onReturnToChannel={() => {}}
      />
    );
    const text = textOf(tree).replace(/\s+/g, ' ');
    expect(text).toContain('Dana Chu');
    expect(text).toContain('Nobody else is here yet');
    // No preposition dressing up the title.
    expect(text).not.toContain('In Dana Chu');
    act(() => tree.unmount());
  });

  it('does not also list the channel the banner is showing', () => {
    // The server now sends every channel you belong to, the one you are in
    // included, because withholding it is what made it invisible when the two
    // ends disagreed about where you were. The banner and the row are two
    // renderings of one channel, so exactly one of them appears.
    mockApp.home = {
      invites: [],
      rejoinable: [
        {
          channelId: 'sess_1',
          name: 'Book club',
          others: [{ id: 'acct_2', displayName: 'Dana Chu' }],
          presentCount: 2,
          createdAt: 1,
          lastActiveAt: 2,
        },
      ],
      contacts: [],
      recordings: [],
    };
    const tree = render(
      <HomeView
        {...homeNav}
        liveChannel={{
          channelId: 'sess_1',
          title: 'Book club',
          present: 2,
          muted: false,
        }}
        onReturnToChannel={() => {}}
      />
    );
    const text = textOf(tree).replace(/\s+/g, ' ');
    expect(text).toContain('tap to go back');
    expect(text.match(/Book club/g)).toHaveLength(1);
    act(() => tree.unmount());
  });

  it('lists a channel the server thinks you are in when this app is not', () => {
    // The reinstall case, and the invariant that answers it: a channel you
    // belong to is reachable from Home whatever the server believes about your
    // presence. With no banner to render it — this process has entered
    // nothing — the row is what must be there.
    mockApp.home = {
      invites: [],
      rejoinable: [
        {
          channelId: 'sess_1',
          name: 'A Priori',
          others: [{ id: 'acct_2', displayName: 'Dana Chu' }],
          presentCount: 1,
          createdAt: 1,
          lastActiveAt: 2,
        },
      ],
      contacts: [],
      recordings: [],
    };
    const tree = render(
      <HomeView {...homeNav} />
    );
    expect(textOf(tree)).toContain('A Priori');
    act(() => tree.unmount());
  });

  it('shows nothing when you are not in one', () => {
    home();
    const tree = render(
      <HomeView {...homeNav} />
    );
    expect(textOf(tree)).not.toContain('tap to go back');
    act(() => tree.unmount());
  });
});

/**
 * Home while nearby, which is the same hoist for the rung below presence.
 *
 * The tier pins the channel you are standing in; these pin the ones you are
 * within reach of. Four properties are worth holding it to, and each is a
 * different kind of mistake: **several**, because nearby is not exclusive and
 * a design that assumed one would drop the rest; **quieter and in another
 * hue**, because two saturated bars in one header read as two alarms; **a tap
 * that does not step in**, since stepping in is what ends the state; and
 * **never both**, because presence and a wait cannot be true of one account at
 * once and a snapshot saying so is one that has not caught up.
 *
 * Adopted 2026-09-12. The bit itself is `RejoinableView.nearby`, and the state
 * it reports is planning/GLOSSARY.md § *Nearby / Stepped out*.
 */
describe('Home while nearby', () => {
  const nearbyIn = (
    ...channels: Array<{ id: string; name: string; present?: number }>
  ) => {
    mockApp.home = {
      invites: [],
      rejoinable: channels.map((channel) => ({
        channelId: channel.id,
        name: channel.name,
        others: [{ id: 'acct_2', displayName: 'Dana Chu' }],
        presentCount: channel.present ?? 0,
        createdAt: 1,
        lastActiveAt: 2,
        nearby: true,
      })),
      contacts: [],
      recordings: [],
    };
  };

  it('pins a bar for it, above the list and saying which rung it is', () => {
    nearbyIn({ id: 'sess_b', name: 'Thursday rehearsal', present: 2 });
    const tree = render(<HomeView {...homeNav} />);
    // Pinned rather than merely present, asserted on `Screen`'s header for the
    // reason the live bar's version is: a sign that leaves the viewport on the
    // first flick is a sign for most of a screen.
    const [screen] = tree.root.findAll((node) => node.type === Screen);
    const header = render(screen.props.header);
    const text = textOf(header).replace(/\s+/g, ' ');
    expect(text).toContain('Thursday rehearsal');
    expect(text).toContain('Nearby · 2 present');
    act(() => header.unmount());
    act(() => tree.unmount());
  });

  it('says nobody is there rather than printing a nought', () => {
    nearbyIn({ id: 'sess_b', name: 'Thursday rehearsal' });
    const tree = render(<HomeView {...homeNav} />);
    const text = textOf(tree).replace(/\s+/g, ' ');
    expect(text).toContain('Nearby · nobody there');
    expect(text).not.toContain('0 present');
    act(() => tree.unmount());
  });

  it('pins one for every channel, nearby not being exclusive', () => {
    nearbyIn(
      { id: 'sess_b', name: 'Thursday rehearsal' },
      { id: 'sess_c', name: 'Book club', present: 1 },
      { id: 'sess_d', name: 'The shop' }
    );
    const tree = render(<HomeView {...homeNav} />);
    const text = textOf(tree);
    for (const name of ['Thursday rehearsal', 'Book club', 'The shop']) {
      // Once each: a bar or a row, never both.
      expect(text.match(new RegExp(name, 'g'))).toHaveLength(1);
    }
    act(() => tree.unmount());
  });

  it('opens the channel without stepping in', () => {
    // The whole of the difference between this bar and a list row. Stepping in
    // ends the declaration, so a bar that dispatched ENTER could be pressed
    // exactly once and would answer a question nobody asked — the offer lives
    // on the channel's own screen, which is where the tap goes.
    nearbyIn({ id: 'sess_b', name: 'Thursday rehearsal' });
    const onEnterChannel = jest.fn();
    const tree = render(
      <HomeView {...homeNav} onEnterChannel={onEnterChannel} />
    );
    const bar = findButton(tree, 'Thursday rehearsal');
    expect(bar).toBeDefined();
    // The dot is the whole of the distinction on screen, so the state is in
    // the label as well — found the way somebody using VoiceOver would.
    expect(bar!.props.accessibilityLabel).toContain('you are nearby');
    act(() => bar!.props.onPress());
    expect(onEnterChannel).toHaveBeenCalledWith('sess_b');
    expect(mockApp.act).not.toHaveBeenCalled();
    act(() => tree.unmount());
  });

  it('is drawn over the contacts as well, the state outliving both lists', () => {
    for (const list of ['channels', 'contacts'] as const) {
      nearbyIn({ id: 'sess_b', name: 'Thursday rehearsal' });
      const tree = render(<HomeView {...homeNav} list={list} />);
      const [screen] = tree.root.findAll((node) => node.type === Screen);
      const header = render(screen.props.header);
      expect(textOf(header)).toContain('Thursday rehearsal');
      act(() => header.unmount());
      act(() => tree.unmount());
    }
  });

  it('reads in the nearby hue rather than the floor accent', () => {
    // The two bars differ in hue first and weight second, and the palette has
    // its own token for it — a dimmer `floor` would say *less of the same
    // state* about a different one. Compared as resolved values, which on this
    // platform is the light palette; what they look like on a phone is a walk.
    nearbyIn({ id: 'sess_b', name: 'Thursday rehearsal' });
    const tree = render(<HomeView {...homeNav} />);
    const bar = findButton(tree, 'Thursday rehearsal')!;
    const style = StyleSheet.flatten(bar.props.style) as {
      backgroundColor?: unknown;
      borderColor?: unknown;
    };
    expect(style.borderColor).toBe(colors.nearby);
    expect(style.backgroundColor).toBe(colors.nearbyDim);
    expect(style.borderColor).not.toBe(colors.floor);
    act(() => tree.unmount());
  });

  it('draws it under the live bar, both at once', () => {
    // **Corrected 2026-09-12**, when entering a channel stopped stepping you
    // out of the others and started leaving you nearby in them: present here
    // and nearby there is now the ordinary state of somebody who has moved
    // rather than a stale snapshot. The whole tier used to be suppressed
    // whenever anything was live, which hid the reader's own nearby rooms from
    // the reader alone — everybody else's roster said *Nearby* about them, and
    // the way back was a bar that was not drawn.
    nearbyIn({ id: 'sess_b', name: 'Thursday rehearsal' });
    const tree = render(
      <HomeView
        {...homeNav}
        liveChannel={{
          channelId: 'sess_1',
          title: 'Book club',
          present: 2,
          muted: false,
        }}
        onReturnToChannel={() => {}}
      />
    );
    const text = textOf(tree).replace(/\s+/g, ' ');
    expect(text).toContain('tap to go back');
    expect(text).toContain('Nearby ·');
    expect(text).toContain('Thursday rehearsal');
    act(() => tree.unmount());
  });

  it('draws no bar for the live channel itself, however the snapshot reads', () => {
    // The half of the old rule that survives, and it is the narrow one: you
    // cannot be present in a room and nearby in *that* room, `ENTER` clearing
    // the wait — so a snapshot saying both about one channel has not caught up
    // and presence is the one that is true. It keeps its row rather than
    // gaining a second bar.
    nearbyIn({ id: 'sess_b', name: 'Thursday rehearsal' });
    const tree = render(
      <HomeView
        {...homeNav}
        liveChannel={{
          channelId: 'sess_b',
          title: 'Thursday rehearsal',
          present: 2,
          muted: false,
        }}
        onReturnToChannel={() => {}}
      />
    );
    const text = textOf(tree).replace(/\s+/g, ' ');
    expect(text).toContain('tap to go back');
    expect(text).not.toContain('Nearby ·');
    act(() => tree.unmount());
  });

  it('draws no bar for a channel the server said nothing about', () => {
    // An older server sends no such key, and the client draws what every build
    // drew before there was a bar: the row.
    mockApp.home = {
      invites: [],
      rejoinable: [
        {
          channelId: 'sess_b',
          name: 'Thursday rehearsal',
          others: [{ id: 'acct_2', displayName: 'Dana Chu' }],
          presentCount: 0,
          createdAt: 1,
          lastActiveAt: 2,
        },
      ],
      contacts: [],
      recordings: [],
    };
    const tree = render(<HomeView {...homeNav} />);
    const text = textOf(tree).replace(/\s+/g, ' ');
    expect(text).toContain('Thursday rehearsal');
    expect(text).not.toContain('Nearby ·');
    act(() => tree.unmount());
  });
});

describe('a channel with nobody in it', () => {
  it('is described as resting, not as expiring', () => {
    // It used to say "Empty — ends within a minute", which was true when a
    // channel was a session and self-destructed. A permanent channel with
    // nobody in it is simply quiet, and saying otherwise sends someone
    // hurrying back to save something that was never at risk.
    mockApp.home = {
      invites: [],
      rejoinable: [
        {
          channelId: 'sess_b',
          name: 'Book club',
          others: [{ id: THEM, displayName: 'Dana Chu' }],
          presentCount: 0,
          createdAt: NOW,
          lastActiveAt: NOW,
        },
      ],
      contacts: [],
      recordings: [],
    };
    const tree = render(
      <HomeView {...homeNav} />
    );
    const text = textOf(tree);
    expect(text).toContain('A few seconds ago');
    expect(text).not.toContain('ends within a minute');
    act(() => tree.unmount());
  });
});

describe('the connection warning', () => {
  const empty = () => {
    mockApp.home = { invites: [], rejoinable: [], contacts: [], recordings: [] };
  };

  it('stays quiet while the first connection is being made', () => {
    // The socket opens a moment after this screen does. A warning that
    // resolves itself before it can be read teaches people to ignore
    // warnings, and this one is in the colour reserved for trouble.
    empty();
    mockApp.status = 'connecting';
    const tree = render(
      <HomeView {...homeNav} />
    );
    expect(textOf(tree)).not.toContain('Reconnecting');
    act(() => tree.unmount());
  });

  it('speaks up once the connection has had its chance', () => {
    jest.useFakeTimers();
    empty();
    mockApp.status = 'closed';
    const tree = render(
      <HomeView {...homeNav} />
    );
    expect(textOf(tree)).not.toContain('Not connected');

    act(() => {
      jest.advanceTimersByTime(3_000);
    });
    expect(textOf(tree)).toContain('Not connected');
    act(() => tree.unmount());
    jest.useRealTimers();
  });

  it('holds a later drop back too, not only the first', () => {
    // This used to assert the opposite — "a real drop, after a real
    // connection: no grace this time" — and that is what people were seeing.
    // Every foreground drops the socket, so a warning with no grace after the
    // first connection is a warning on every foreground.
    jest.useFakeTimers();
    empty();
    mockApp.status = 'open';
    const tree = render(
      <HomeView {...homeNav} />
    );
    const show = (status: 'connecting' | 'open' | 'closed') => {
      mockApp.status = status;
      act(() => {
        tree.update(
          <HomeView {...homeNav} />
        );
      });
    };

    show('connecting');
    expect(textOf(tree)).not.toContain('Reconnecting…');

    // Back before the delay is up: never mentioned at all.
    act(() => void jest.advanceTimersByTime(1_000));
    show('open');
    act(() => void jest.advanceTimersByTime(60_000));
    expect(textOf(tree)).not.toContain('Reconnecting…');

    // One that genuinely lasts is still reported.
    show('connecting');
    act(() => void jest.advanceTimersByTime(3_000));
    expect(textOf(tree)).toContain('Reconnecting…');

    act(() => tree.unmount());
    jest.useRealTimers();
  });
});

describe('the invited count', () => {
  async function profileShowing(invited: number | undefined) {
    mockApp.loadProfile.mockResolvedValueOnce({
      account: { id: THEM, displayName: 'Dana Chu' },
      ...(invited === undefined ? {} : { invited }),
    });
    let tree!: ReactTestRenderer;
    await act(async () => {
      tree = render(
        <ProfileView accountId={THEM} fallbackName="Dana Chu" onBack={() => {}} />
      );
    });
    return tree;
  }

  it('says how many', async () => {
    const tree = await profileShowing(7);
    expect(textOf(tree)).toContain('Invited 7');
    act(() => tree.unmount());
  });

  it('says nought rather than going quiet', async () => {
    const tree = await profileShowing(0);
    expect(textOf(tree)).toContain('Invited 0');
    act(() => tree.unmount());
  });

  it('says nothing when the server did not', async () => {
    const tree = await profileShowing(undefined);
    expect(textOf(tree)).not.toContain('Invited');
    act(() => tree.unmount());
  });
});

/**
 * Who invited them. The server sends this only when the inviter is you or one
 * of your contacts, so there is no case here where the name is a stranger's —
 * absent simply means there is no line, and the client does not need to know
 * which of the three reasons it was.
 */

describe('who invited them', () => {
  async function profileInvitedBy(
    invitedBy: { id: string; displayName: string } | undefined
  ) {
    mockApp.loadProfile.mockResolvedValueOnce({
      account: { id: THEM, displayName: 'Dana Chu' },
      invited: 0,
      ...(invitedBy === undefined ? {} : { invitedBy }),
    });
    let tree!: ReactTestRenderer;
    await act(async () => {
      tree = render(
        <ProfileView accountId={THEM} fallbackName="Dana Chu" onBack={() => {}} />
      );
    });
    return tree;
  }

  it('names the inviter when there is one to name', async () => {
    const tree = await profileInvitedBy({ id: 'acct_a', displayName: 'Ada' });
    expect(textOf(tree)).toContain('Invited by Ada');
    act(() => tree.unmount());
  });

  it('draws no line when the server sent no name', async () => {
    const tree = await profileInvitedBy(undefined);
    expect(textOf(tree)).not.toContain('Invited by');
    act(() => tree.unmount());
  });
});

/**
 * Ending a contact, which is more than forgetting a name: it takes the
 * channels that held only the two of you, and it takes them for both.
 */
