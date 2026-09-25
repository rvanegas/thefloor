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
  findTab,
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
    mockApp.home = { invites: [], rejoinable: [], contacts: [] };
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
      // since 2026-09-05 — and is named by the tier's waiting bar, which is
      // not this list and is what the two assertions below now tell apart.
      contacts: [
        { account: { id: 'acct_p', displayName: 'Priya Raman' }, status: 'incoming' },
        { account: { id: 'acct_q', displayName: 'Quinn Ito' }, status: 'accepted' },
      ],
    };

    const tree = render(<HomeView {...homeNav} />);
    const text = textOf(tree);
    // "tap to join" went with the setting on 2026-09-21: the tap opens the
    // channel and joins nothing, so the row no longer promises otherwise.
    expect(text).not.toContain('tap to join');
    expect(text).toContain('asked you in · waiting');
    expect(text).toContain('Miro Okafor');
    expect(text).toContain('1 present');
    // Named once, by the bar, and as a request rather than as a row: the list
    // still draws no contact of any status. An accepted one is named nowhere
    // on this screen at all, which is what `Quinn Ito` holds.
    expect(text).toContain('Priya Raman wants to be a contact');
    expect(text).not.toContain('Quinn Ito');
    act(() => tree.unmount());
  });

  it('draws a seat as somewhere to go back to, on every platform', () => {
    /*
      A channel you are a guest of is a place you can return to, which is what
      this list means — so it belongs among the rest rather than in a section
      of its own.

      **It was drawn in a browser and nowhere else until 2026-09-22**, because
      a seat was a document this app did not own and a row a phone could not
      open is worse than no row. The app sits in seats of its own now, so both
      halves of that are gone: the row stands everywhere, and it says the same
      thing on each. See `SeatView`.
    */
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
    };

    // `Platform.OS` is 'ios' under the preset, which is the case that used to
    // be withheld and is now the ordinary one.
    const phone = render(<HomeView {...homeNav} />);
    const onPhone = textOf(phone);
    expect(onPhone).toContain('Alice and Bob');
    // Still said plainly, on both: a row that read like the others would
    // promise a membership where there is a seat.
    expect(onPhone).toContain('You are a guest here');
    expect(onPhone).toContain('2 present');
    act(() => phone.unmount());

    const wasOs = Platform.OS;
    // Assigned rather than mocked: `Platform` is one object the preset hands
    // every importer, so setting it here is what the module under test reads.
    (Platform as { OS: string }).OS = 'web';
    try {
      const browser = render(<HomeView {...homeNav} />);
      const text = textOf(browser);
      expect(text).toContain('Alice and Bob');
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
    mockApp.home = { invites: [], rejoinable: [], contacts: [] };
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
    mockApp.home = { invites: [], rejoinable: [], contacts: [] };
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
    };

    const tree = render(<HomeView {...homeNav} />);
    // From the first section label down, which is where the list starts.
    // Above it is the tier, and the tier names this invitation's channel in
    // the waiting bar — so measuring from the top of the screen would find
    // *Asked In* before *Live* and read the sections as out of order when
    // what had happened is that something above them mentioned one. The
    // claim here is about the list's own sequence.
    const text = textOf(tree).slice(textOf(tree).indexOf('Live'));
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
    };
    const tree = render(<HomeView {...homeNav} />);
    const text = textOf(tree);
    expect(text).toContain('Live');
    expect(text).not.toContain('Invitations');
    // **Says it was an invitation, not merely that somebody is there.** The
    // heading that would have said so is the one this promotion gives up, and
    // "Dana Chu is waiting" — which this asserted until 2026-09-15 — is a
    // sentence a channel of your own could equally carry. The clause that
    // cannot is `asked you in`.
    expect(text).toContain('Dana Chu asked you in · waiting');
    act(() => tree.unmount());
  });

  /**
   * Violet is the floor and nothing else. This row and Home's live bar wore
   * the same four lines until 2026-09-15 — `floorDim` under `floor` — which
   * put *you are standing in this room* and *you were asked into one* in
   * identical paint on one screen. The fill went; the edge carries `waiting`,
   * the token that already means something is waiting for you.
   */
  it('marks a live invitation in the waiting hue, not the floor accent', () => {
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
    };
    const tree = render(<HomeView {...homeNav} />);
    const row = findButton(tree, 'Come In')!;
    // The `Card` inside the pressable, which is the thing that carries the
    // edge; the pressable's own style is the press feedback.
    const card = row.findAll(
      (n) =>
        typeof n.type === 'string' &&
        (StyleSheet.flatten(n.props.style) as { borderRadius?: unknown })
          ?.borderRadius != null
    )[0]!;
    const style = StyleSheet.flatten(card.props.style) as {
      backgroundColor?: unknown;
      borderColor?: unknown;
    };
    expect(style.borderColor).toBe(colors.waiting);
    expect(style.borderColor).not.toBe(colors.floor);
    // No tinted block: the live bar is the only one of those above this list.
    expect(style.backgroundColor).not.toBe(colors.floorDim);
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
    };
    const tree = render(<HomeView {...homeNav} />);
    const text = textOf(tree);
    // The whole word, since 2026-09-15: the live row's status is now `·
    // waiting` rather than `is waiting`, so the narrower match would pass on a
    // row that had gone back to claiming it.
    expect(text).not.toContain('waiting');
    expect(text).toContain('asked you in · an hour ago');
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
      expect(textOf(tree)).toContain('asked you in · waiting');

      asked.mockRestore();
      act(() => tree.unmount());
    });
  });

  it('says so when the connection is down', () => {
    // After a grace period, deliberately — see "the connection warning"
    // below. The banner is about a connection that failed, not about one
    // that has not finished being made.
    jest.useFakeTimers();
    mockApp.home = { invites: [], rejoinable: [], contacts: [] };
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

  /**
   * **The film, fetched rather than sent.**
   *
   * Sending it away was always a control on the device in your hand; fetching
   * it back meant opening the app on the device you had walked to, finding
   * the channel, opening it, going to *Watch* and throwing a switch. This is
   * the other half, offered where somebody already is.
   */
  describe('a film on another of your devices', () => {
    const inChannel = (
      onReturn: jest.Mock = jest.fn()
    ): ReactTestRenderer =>
      render(
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

    it('is not mentioned when the film is on this device or nowhere', () => {
      // The ordinary case, and the one this must not clutter: a bar offering
      // to fetch a film that is already here would be a control that does
      // nothing, on the screen somebody reads most.
      home();
      mockApp.screensElsewhere = [];
      const tree = inChannel();
      expect(textOf(tree)).not.toContain('The film is on another device');
      act(() => tree.unmount());
    });

    it('offers to bring it here, and claims the screen on the tap', () => {
      home();
      mockApp.screensElsewhere = ['sess_1'];
      const onReturn = jest.fn();
      const tree = inChannel(onReturn);
      expect(textOf(tree).replace(/\s+/g, ' ')).toContain(
        'The film is on another device'
      );

      const bar = tree.root
        .findAll((n) => n.props?.accessibilityRole === 'button')
        .find((n) =>
          String(n.props?.accessibilityLabel ?? '').includes(
            'on another of your devices'
          )
        );
      expect(bar).toBeDefined();
      act(() => bar!.props.onPress());

      // The whole claim is one call: the server takes the film off every
      // other instance of this account. See `screens.showing`.
      expect(mockApp.showScreenFor).toHaveBeenCalledWith('sess_1');
      // And it opens where the film is, which is the tab the picture is on.
      expect(onReturn).toHaveBeenCalledWith('sess_1', 'watch');
      act(() => tree.unmount());
    });

    it('says nothing at all when you are not in a channel', () => {
      // A film cannot be on any of your devices unless you are in the room it
      // belongs to, so there is no such thing as this offer without a live
      // channel — and reading `screensElsewhere` without one would be reading
      // a list that cannot apply.
      home();
      mockApp.screensElsewhere = ['sess_1'];
      const tree = render(<HomeView {...homeNav} />);
      expect(textOf(tree)).not.toContain('The film is on another device');
      act(() => tree.unmount());
    });
  });

  /**
   * **The room, on the device that is not holding it.**
   *
   * Presence is the account's and standing is the device's, and Home's live
   * bar can only speak for the second — so a phone whose owner's laptop was
   * sitting in a conversation pinned nothing at all, while the laptop pinned
   * the room. One account, one moment, two different lists of pinned rooms,
   * which is what these are about. See `standingElsewhere` in
   * `state/AppProvider`.
   */
  describe('a room another of your devices is standing in', () => {
    /** The channel in the snapshot, which is where its name and count come from. */
    const withRoom = (presentCount = 1) => {
      mockApp.home = {
        invites: [],
        rejoinable: [
          {
            channelId: 'sess_1',
            name: 'Book club',
            others: [{ id: 'acct_x', displayName: 'Miro Okafor' }],
            presentCount,
            createdAt: NOW,
            lastActiveAt: NOW,
          },
        ],
        contacts: [],
      };
    };

    it('pins the room, with the sentence that says which device holds it', () => {
      withRoom(2);
      mockApp.standingElsewhere = ['sess_1'];
      const tree = render(<HomeView {...homeNav} />);
      const text = textOf(tree).replace(/\s+/g, ' ');
      // Named, the way the bar on the other device names it — one channel,
      // one name, whichever screen is asking.
      expect(text).toContain('Book club');
      expect(text).toContain('On another device · 2 present');
      // And never the live bar's line, which offers a way back into a room
      // this device is not in.
      expect(text).not.toContain('tap to go back');
      act(() => tree.unmount());
    });

    it('draws the room once, pinned, and not as a row as well', () => {
      // **The bar and the row are two renderings of one channel**, so exactly
      // one appears — the rule the live bar and the nearby bars are already
      // held to, and the one this bar shipped without. `ChannelsView` is told
      // which channels a bar above has taken; it was told about the nearby
      // ones only, so the room came out pinned at the top *and* listed under
      // *Live*, which is how somebody saw one channel twice on one screen.
      withRoom(2);
      mockApp.standingElsewhere = ['sess_1'];
      const tree = render(<HomeView {...homeNav} />);
      const text = textOf(tree);
      expect(text.match(/Book club/g)).toHaveLength(1);
      act(() => tree.unmount());
    });

    it('says nobody else is there rather than counting you', () => {
      // One present is you, standing there on the other device. "1 present"
      // would be the bar reporting somebody to wait for.
      withRoom(1);
      mockApp.standingElsewhere = ['sess_1'];
      const tree = render(<HomeView {...homeNav} />);
      expect(textOf(tree).replace(/\s+/g, ' ')).toContain(
        'On another device · nobody else there'
      );
      act(() => tree.unmount());
    });

    it('opens the channel on the tap, and does not step in', () => {
      // Stepping in here would take the room off the device somebody is
      // talking into. That is a thing to do on purpose, on the channel's own
      // screen, and never on the way past — the nearby bar's rule, with a
      // sharper edge.
      withRoom(2);
      mockApp.standingElsewhere = ['sess_1'];
      const onEnter = jest.fn();
      const tree = render(
        <HomeView {...homeNav} onEnterChannel={onEnter} />
      );
      const bar = findButton(tree, 'Book club');
      expect(bar).toBeDefined();
      act(() => bar!.props.onPress());
      expect(onEnter).toHaveBeenCalledWith('sess_1');
      expect(mockApp.act).not.toHaveBeenCalled();
      act(() => tree.unmount());
    });

    it('draws one bar, not two, when this device is the one standing there', () => {
      // The server never reports a connection to itself, so this should not
      // arrive — but the two pushes are independent, and the moment between
      // them must not pin one room twice.
      withRoom(2);
      mockApp.standingElsewhere = ['sess_1'];
      const tree = render(
        <HomeView
          {...homeNav}
          liveChannel={{
            channelId: 'sess_1',
            title: 'Book club',
            present: 2,
            muted: false,
          }}
        />
      );
      const text = textOf(tree).replace(/\s+/g, ' ');
      expect(text).toContain('tap to go back');
      expect(text).not.toContain('On another device');
      act(() => tree.unmount());
    });

    it('draws nothing for a channel the snapshot has not heard of', () => {
      // The pushes are independent: a laptop can enter a channel before this
      // device's Home knows it exists. A bar with no name and no count is
      // worse than the half-second before the snapshot catches up.
      home();
      mockApp.standingElsewhere = ['sess_unknown'];
      const tree = render(<HomeView {...homeNav} />);
      expect(textOf(tree)).not.toContain('On another device');
      act(() => tree.unmount());
    });
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
    expect(findTab(header, 'Channels')).toBeDefined();
    expect(findTab(header, 'Contacts')).toBeDefined();
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
    mockApp.home = { invites: [], rejoinable: [], contacts: [] };
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

/**
 * The two dabs on the switch: something is waiting on this tab.
 *
 * **They are not symmetrical, and every test here is about one half of that.**
 * A request to answer is live state on the Home snapshot, so the Contacts mark
 * arrives with the request and leaves when it is answered — nothing is
 * remembered. An answered question stays answered for ever, so the Support mark
 * is the difference between what the server holds and what this phone has read.
 * See `answerableRequests` in `ContactsView` and `state/helpSeen.ts`.
 */
describe('the dab on Home\'s tabs', () => {
  /**
   * The mark itself, found by the one colour it is drawn in. Counting nodes
   * rather than reading a style off a named tab, because what a test about a
   * mark wants to know is how many are on the screen — two tabs can wear one
   * at once, and the bug worth catching is a mark on the wrong tab rather than
   * a mark of the wrong shape, which `segmented.test.tsx` has.
   */
  const dabs = (tree: ReactTestRenderer) =>
    tree.root.findAll(
      (n) =>
        typeof n.type === 'string' &&
        StyleSheet.flatten(n.props?.style)?.backgroundColor === colors.waiting
    );

  const withContacts = (
    contacts: Array<{
      id: string;
      displayName: string;
      status: 'accepted' | 'incoming' | 'outgoing';
    }>,
    help: { answeredAt?: number | null } = {}
  ) => {
    mockApp.home = {
      invites: [],
      rejoinable: [],
      contacts: contacts.map(({ id, displayName, status }) => ({
        account: { id, displayName },
        status,
      })),
      ...('answeredAt' in help ? { helpAnsweredAt: help.answeredAt } : {}),
    };
  };

  const home = () => render(<HomeView {...homeNav} />);

  /**
   * The same screen standing on the Support tab, which is a prop rather than a
   * press: the tier is controlled from above, so pressing the tab here calls a
   * handler that goes nowhere. See `homeNav`.
   */
  const support = () => render(<HomeView {...homeNav} list="support" />);

  /** Somebody has asked, and it is this reader's turn. */
  it('marks Contacts when somebody has asked to be a contact', () => {
    withContacts([{ id: 'b', displayName: 'Pat Ito', status: 'incoming' }]);
    const tree = home();
    expect(dabs(tree)).toHaveLength(1);
    expect(findTab(tree, 'Contacts')!.props.accessibilityLabel).toBe(
      'Contacts, requests waiting'
    );
    act(() => tree.unmount());
  });

  /**
   * **The bug this pair exists for.** The *Requests* section inside Contacts is
   * everything outstanding in both directions, which is right for a section
   * saying where things stand. A mark drawn from that count would sit on the
   * switch for a request only the other person can answer — unresolvable by
   * tapping through, and gone only when somebody else acts.
   */
  it('leaves Contacts unmarked for a request only they can answer', () => {
    withContacts([
      { id: 'b', displayName: 'someone@example.com', status: 'outgoing' },
    ]);
    const tree = home();
    expect(dabs(tree)).toHaveLength(0);
    expect(findTab(tree, 'Contacts')!.props.accessibilityLabel).toBeUndefined();
    act(() => tree.unmount());
  });

  /**
   * And it clears itself, which is the whole of why this half remembers
   * nothing: the mark is a view of the snapshot, so answering the request takes
   * it off without anything being marked as seen.
   */
  it('leaves Contacts unmarked once everybody is a contact', () => {
    withContacts([{ id: 'a', displayName: 'Dana Chu', status: 'accepted' }]);
    const tree = home();
    expect(dabs(tree)).toHaveLength(0);
    act(() => tree.unmount());
  });

  /** An answer this phone has not read. */
  it('marks Support when an answer has arrived that this phone has not read', () => {
    withContacts([], { answeredAt: NOW });
    mockApp.helpSeen.seenAnsweredAt = null;
    const tree = home();
    expect(dabs(tree)).toHaveLength(1);
    expect(findTab(tree, 'Support')!.props.accessibilityLabel).toBe(
      'Support, answered'
    );
    act(() => tree.unmount());
  });

  /** Read, and so nothing waiting — the state after the screen has been open. */
  it('leaves Support unmarked once the answer has been read', () => {
    withContacts([], { answeredAt: NOW });
    mockApp.helpSeen.seenAnsweredAt = NOW;
    const tree = home();
    expect(dabs(tree)).toHaveLength(0);
    act(() => tree.unmount());
  });

  /**
   * Nothing before the keychain has answered. `seenAnsweredAt` reads as never
   * seen until the read lands, so without this gate an install that has read
   * everything flashes a dab on every cold start — on the one control the whole
   * tier is navigated by.
   */
  it('leaves Support unmarked while the keychain has not answered', () => {
    withContacts([], { answeredAt: NOW });
    mockApp.helpSeen.seenAnsweredAt = null;
    mockApp.helpSeen.loaded = false;
    const tree = home();
    expect(dabs(tree)).toHaveLength(0);
    act(() => tree.unmount());
  });

  /**
   * A server that predates the field sends no such key, which is what an
   * installed build meets between its release and the deploy after it. Silence
   * is nothing to say rather than something waiting. See planning/SHIMS.md.
   */
  it('leaves Support unmarked by a server that has never heard of the field', () => {
    withContacts([]);
    mockApp.helpSeen.seenAnsweredAt = null;
    const tree = home();
    expect(dabs(tree)).toHaveLength(0);
    act(() => tree.unmount());
  });

  /** Both at once is ordinary: two unrelated things can be waiting. */
  it('marks both tabs when both have something waiting', () => {
    withContacts([{ id: 'b', displayName: 'Pat Ito', status: 'incoming' }], {
      answeredAt: NOW,
    });
    mockApp.helpSeen.seenAnsweredAt = null;
    const tree = home();
    expect(dabs(tree)).toHaveLength(2);
    act(() => tree.unmount());
  });

  /**
   * The debug override, from the Diagnostics card in settings: both marks on
   * an account with nothing whatsoever waiting.
   *
   * It exists because the two real states are a nuisance to arrange — a second
   * account has to send a request, an answer has to be published by hand — so
   * the mark itself was the part nobody could put on a screen and look at.
   * **The words are the real words**, which is the half of this that could
   * silently rot: a preview announcing something a screen reader never hears
   * would be a preview of the wrong thing.
   */
  it('draws both dabs when the debug override is on', () => {
    withContacts([{ id: 'a', displayName: 'Dana Chu', status: 'accepted' }]);
    mockApp.forcedDabs = true;
    const tree = home();
    expect(dabs(tree)).toHaveLength(2);
    expect(findTab(tree, 'Contacts')!.props.accessibilityLabel).toBe(
      'Contacts, requests waiting'
    );
    expect(findTab(tree, 'Support')!.props.accessibilityLabel).toBe(
      'Support, answered'
    );
    act(() => tree.unmount());
  });

  /**
   * The second half of the Support mark: the card the tab meant.
   *
   * A tab says *go and look* and the Support tab holds four cards, three of
   * which have nothing to do with a help answer. Without this the mark sends
   * somebody to a screen where nothing is marked, which is a search rather
   * than a direction.
   */
  it('marks the Help card when the Support tab is marked', () => {
    withContacts([], { answeredAt: NOW });
    mockApp.helpSeen.seenAnsweredAt = null;
    const tree = support();
    // The tab and the card, which is the whole claim: one condition, two
    // marks, and the second one on the thing to press.
    expect(dabs(tree)).toHaveLength(2);
    expect(findButton(tree, 'Help')!.props.accessibilityLabel).toBe(
      'Help, answered'
    );
    act(() => tree.unmount());
  });

  /**
   * And it is the same fact, not a second one: what clears the tab clears the
   * card, in the same frame, because neither remembers anything of its own.
   */
  it('leaves the Help card unmarked once the answer has been read', () => {
    withContacts([], { answeredAt: NOW });
    mockApp.helpSeen.seenAnsweredAt = NOW;
    const tree = support();
    expect(dabs(tree)).toHaveLength(0);
    expect(findButton(tree, 'Help')!.props.accessibilityLabel).toBeUndefined();
    act(() => tree.unmount());
  });

  /**
   * *Show every dab* has to show every dab. A preview that lit the tab and not
   * the card would be a preview of a state the app never has — which is the
   * one thing the override cannot afford to be, being the only way anybody
   * looks at these marks.
   */
  it("draws the Help card's dab under the debug override", () => {
    withContacts([]);
    mockApp.forcedDabs = true;
    const tree = support();
    expect(findButton(tree, 'Help')!.props.accessibilityLabel).toBe(
      'Help, answered'
    );
    act(() => tree.unmount());
  });

  /**
   * And it forces the drawing alone. The two conditions are still computed and
   * still right underneath, so turning it off is exactly turning it off — which
   * is what the override buys over writing a contact request into the snapshot.
   */
  it('leaves the tabs as they were once the override is off', () => {
    withContacts([{ id: 'a', displayName: 'Dana Chu', status: 'accepted' }]);
    mockApp.forcedDabs = false;
    const tree = home();
    expect(dabs(tree)).toHaveLength(0);
    act(() => tree.unmount());
  });
});

describe('a guest invitation', () => {
  /**
   * Two offers, two sentences.
   *
   * A membership is permanent and spends one of the channel's six places; a
   * seat lasts while the room does and carries none of a member's standing.
   * The card is where somebody decides whether to tap, so it is where the
   * difference has to be legible.
   */
  const invite = (extra: Record<string, unknown> = {}) => ({
    channelId: 'sess_asked',
    from: { id: THEM, displayName: 'Dana Chu' },
    createdAt: NOW,
    name: 'Design review',
    others: [],
    presentCount: 2,
    ...extra,
  });

  it('says a seat is a seat', () => {
    mockApp.home = {
      invites: [invite({ guest: true })],
      rejoinable: [],
      contacts: [],
    };
    const text = textOf(render(<HomeView {...homeNav} />));
    expect(text).toContain('asked you in as a guest');
  });

  it('takes up the seat and walks to the guest page, in a browser', async () => {
    /*
      **Two steps, and the first is a round trip.** A seat got by knocking is
      already in this tab's storage; an invitation is a row on the server that
      nobody has answered, so it is answered against the account's own session
      and the credential that comes back is left where the guest page looks.
      Only then does the tab walk — `/g/seat`, a different document on this
      origin, which is why nothing here is a route change.
    */
    mockApp.home = {
      invites: [invite({ guest: true })],
      rejoinable: [],
      contacts: [],
    };
    mockApp.enterSeat.mockResolvedValueOnce({
      guestId: 'guest_1',
      secret: 'sec_1',
    });
    const wasOs = Platform.OS;
    (Platform as { OS: string }).OS = 'web';
    const assign = jest.fn();
    const wasLocation = globalThis.location;
    // Neither exists under the react-native preset, and `handover` reaches
    // both off `globalThis` with optional chaining — so without these the
    // walk succeeds silently and asserts nothing.
    const store = new Map<string, string>();
    const wasSession = (globalThis as { sessionStorage?: unknown }).sessionStorage;
    Object.defineProperty(globalThis, 'sessionStorage', {
      value: {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => void store.set(k, v),
        removeItem: (k: string) => void store.delete(k),
      },
      configurable: true,
      writable: true,
    });
    Object.defineProperty(globalThis, 'location', {
      value: { assign },
      configurable: true,
      writable: true,
    });
    try {
      const tree = render(<HomeView {...homeNav} />);
      await act(async () => {
        findButton(tree, 'asked you in as a guest')!.props.onPress();
      });
      expect(mockApp.enterSeat).toHaveBeenCalledWith('sess_asked');
      // The credential and the channel, both, because the page needs both:
      // one to know which seat page it is, one to open a socket with.
      expect(store.get('thefloor.seat')).toContain('sec_1');
      expect(store.get('thefloor.seat.channel')).toBe('sess_asked');
      expect(assign).toHaveBeenCalledWith('/g/seat');
      act(() => tree.unmount());
    } finally {
      (Platform as { OS: string }).OS = wasOs;
      Object.defineProperty(globalThis, 'location', {
        value: wasLocation,
        configurable: true,
        writable: true,
      });
      Object.defineProperty(globalThis, 'sessionStorage', {
        value: wasSession,
        configurable: true,
        writable: true,
      });
    }
  });

  it('takes up a seat in the app on a phone, rather than sending it away', async () => {
    /*
      **This used to be an alert saying *a guest joins in a browser*.** The
      offer had to stand — the invitation wakes the phone, and a card that
      vanished would leave that notification pointing at an empty Home screen
      — but all the tap could do was name a web address and a second sign-in,
      for a conversation that was happening now.

      It takes the seat and opens it. Which screen the channel then draws is
      the server's answer rather than this list's: a watch is answered with a
      seat where there is no membership, and `App.tsx` reads that. See
      `SeatView` and planning/decisions/2026-09-22-a-seat-rides-the-member-socket.md.
    */
    mockApp.home = {
      invites: [invite({ guest: true })],
      rejoinable: [],
      contacts: [],
    };
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const opened = jest.fn();
    const tree = render(<HomeView {...homeNav} onEnterChannel={opened} />);
    await act(async () => {
      findButton(tree, 'asked you in as a guest')!.props.onPress();
    });
    expect(mockApp.enterSeat).toHaveBeenCalledWith('sess_asked');
    expect(opened).toHaveBeenCalledWith('sess_asked');
    // Nothing is said about browsers any more, there being nowhere else to go.
    expect(alert).not.toHaveBeenCalled();
    act(() => tree.unmount());
    alert.mockRestore();
  });

  it('leaves an ordinary invitation saying what it always said', () => {
    mockApp.home = { invites: [invite()], rejoinable: [], contacts: [] };
    const text = textOf(render(<HomeView {...homeNav} />));
    expect(text).toContain('asked you in');
    expect(text).not.toContain('as a guest');
  });

  it('reads an older server as offering a membership', () => {
    // `guest` absent is what every invitation was before guest invitations
    // existed, and a client meeting a server that predates them must read it
    // as the only kind that server can send. See SHIMS.md, gate 264.
    mockApp.home = {
      invites: [invite({ guest: undefined })],
      rejoinable: [],
      contacts: [],
    };
    const text = textOf(render(<HomeView {...homeNav} />));
    expect(text).not.toContain('as a guest');
  });
});

describe('a quiet seat', () => {
  it('stays on the list when the room it is in goes quiet', () => {
    // **The bug this fixes.** `rest` tested `kind === 'member'`, so a seat
    // with nobody present qualified for no section and was drawn nowhere — it
    // existed only while `isLive` put it under Live, and disappeared the
    // moment the last person stepped out of a room the seat was still good
    // for. A place you can go back to is exactly what this list means.
    const seat = {
      channelId: 'sess_seat',
      name: 'Alice and Bob',
      others: [],
      presentCount: 0,
      createdAt: NOW,
      lastActiveAt: NOW,
      everUsed: true,
      seat: true,
    };
    mockApp.home = { invites: [], rejoinable: [seat], contacts: [] };

    const wasOs = Platform.OS;
    (Platform as { OS: string }).OS = 'web';
    try {
      const text = textOf(render(<HomeView {...homeNav} />));
      expect(text).toContain('Alice and Bob');
      expect(text).toContain('You are a guest here');
    } finally {
      (Platform as { OS: string }).OS = wasOs;
    }
  });
});
