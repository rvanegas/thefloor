import React from 'react';
import renderer, {
  act,
  type ReactTestRenderer,
} from 'react-test-renderer';
import { reduce } from '../../../../core/channel';
import { WAITING_WINDOW_MS } from '../../../../core/constants';
import { type HomeView as HomeViewData } from '../../../../core/protocol';
import { HomeView } from '../HomeView';
import { ChannelView } from '../ChannelView';
import { ProfileView } from '../ProfileView';
import { StyleSheet } from 'react-native';
import { colors } from '../theme';
import {
  AUDIO,
  ME,
  NOW,
  THEM,
  channelOf,
  findButton,
  homeNav,
  labelOf,
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
 * How Home lists your channels, which is a different subject from what Home
 * is — and had grown two describes with near-identical names 1,900 lines
 * apart in the file this came out of. Ordering is decided twice here on
 * purpose: by recency, and by whether anybody is in the room. Read both
 * before changing either.
 *
 * Split out of `views.test.tsx` on 2026-09-04, which was 8,495 lines and 343
 * tests by then; the fixtures every one of these files shares are in
 * `testing/harness`.
 */

/**
 * The given names in the order they are rendered, which is the only way to ask
 * this screen about ordering: the list is one flat run of text, so position in
 * it is position on screen.
 *
 * Names not on screen are dropped rather than reported missing, so a caller
 * lists everything it might see and compares against what it should.
 */
const namesInOrder = (tree: ReturnType<typeof render>, names: string[]) => {
  const text = textOf(tree);
  return names
    .filter((n) => text.includes(n))
    .sort((a, b) => text.indexOf(a) - text.indexOf(b));
};

beforeEach(resetHarness);

describe('named channels and described ones do not look alike', () => {
  const titleStyleOf = (tree: ReactTestRenderer, text: string) => {
    const node = tree.root.findAll(
      (n) => typeof n.props?.children === 'string' && n.props.children === text
    )[0];
    return StyleSheet.flatten(node.props.style) as {
      fontStyle?: string;
      color?: string;
    };
  };

  const homeWith = (name: string | null) => {
    mockApp.home = {
      invites: [],
      rejoinable: [
        {
          channelId: 'sess_b',
          name,
          others: [{ id: 'acct_x', displayName: 'Miro Okafor' }],
          presentCount: 1,
          createdAt: NOW,
          lastActiveAt: NOW,
        },
      ],
      contacts: [],
      recordings: [],
    };
    return render(
      <HomeView {...homeNav} />
    );
  };

  it('sets a described channel in italic on Home', () => {
    // Italic and nothing else. Dimming it too said "less important" on top of
    // "not a name", and most channels have no name.
    const tree = homeWith(null);
    const style = titleStyleOf(tree, 'Miro Okafor');
    expect(style.fontStyle).toBe('italic');
    expect(style.color).toBe(colors.text);
    act(() => tree.unmount());
  });

  it('leaves a named channel asserted, upright and full strength', () => {
    const tree = homeWith('Thursday rehearsal');
    const style = titleStyleOf(tree, 'Thursday rehearsal');
    expect(style.fontStyle).toBeUndefined();
    expect(style.color).toBe(colors.text);
    act(() => tree.unmount());
  });

  it('marks the channel header the same way', () => {
    showChannel(channelOf());
    const tree = render(
      <ChannelView
        channelId="sess_1"
        audio={AUDIO}
        onClose={() => {}}
        onExit={() => {}}
      />
    );
    // The header, not the roster below it: both say "Dana Chu". 20 since the
    // header was pinned — it rides above every screenful now, so a large
    // title's height would be paid for on all of them rather than once at the
    // top of the scroll.
    const [header] = tree.root.findAll(
      (n) =>
        n.props?.children === 'Dana Chu' &&
        StyleSheet.flatten(n.props?.style)?.fontSize === 20
    );
    const style = StyleSheet.flatten(header.props.style) as {
      fontStyle?: string;
      color?: string;
    };
    expect(style.fontStyle).toBe('italic');
    expect(style.color).toBe(colors.text);
    act(() => tree.unmount());
  });

  it('says so plainly when everyone else has left', () => {
    mockApp.home = {
      invites: [],
      rejoinable: [
        {
          channelId: 'sess_b',
          name: null,
          others: [],
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
    expect(textOf(tree)).toContain('Just you');
    act(() => tree.unmount());
  });
});

/**
 * The order of Home's channel list. A name is something somebody chose to
 * write, so named channels are the ones being kept deliberately; sorting the
 * whole list by recency alone would bury them among channels nobody has
 * bothered to name, which costs the naming its point.
 */

describe('the order of your channels', () => {
  const channel = (
    id: string,
    name: string | null,
    lastActiveAt: number,
    other = 'Miro Okafor'
  ): HomeViewData['rejoinable'][number] => ({
    channelId: id,
    name,
    others: [{ id: `acct_${id}`, displayName: other }],
    presentCount: 0,
    createdAt: NOW,
    lastActiveAt,
    // The two are the same by default: a channel that has been used, last used
    // when it was last entered or left. The tests that care set them apart.
    lastPresenceAt: lastActiveAt,
  });

  /** The rendered titles, in the order they appear. */
  const titlesIn = (tree: ReactTestRenderer, expected: string[]) => {
    const text = textOf(tree);
    return expected
      .map((title) => ({ title, at: text.indexOf(title) }))
      .filter((entry) => entry.at >= 0)
      .sort((a, b) => a.at - b.at)
      .map((entry) => entry.title);
  };

  const show = (rejoinable: ReturnType<typeof channel>[]) => {
    mockApp.home = { invites: [], rejoinable, contacts: [], recordings: [] };
    return render(
      <HomeView {...homeNav} />
    );
  };

  it('ranks a described channel above a staler named one', () => {
    // The old rule was the other way about — every named channel above every
    // described one, on the reasoning that a name is something somebody chose
    // to write. It buried the freshest conversation on the screen under
    // whatever had been named and abandoned. One list, one order: least idle
    // first, and the name still reads as a name.
    const tree = show([
      channel('a', null, NOW),
      channel('b', 'Thursday rehearsal', NOW - 900_000),
    ]);
    expect(titlesIn(tree, ['Thursday rehearsal', 'Miro Okafor'])).toEqual([
      'Miro Okafor',
      'Thursday rehearsal',
    ]);
    act(() => tree.unmount());
  });

  it('sinks a channel nobody has ever been in, whatever its stamp says', () => {
    // The standing channel a pair of contacts get. Its `lastPresenceAt` is the
    // moment it was made, which is not a visit — without `everUsed` it would
    // arrive at the top of the list as the freshest thing on it.
    const tree = show([
      { ...channel('a', null, NOW, 'Dana Chu'), everUsed: false },
      channel('b', 'Standup', NOW - 900_000),
    ]);
    expect(titlesIn(tree, ['Standup', 'Dana Chu'])).toEqual([
      'Standup',
      'Dana Chu',
    ]);
    expect(textOf(tree)).toContain('Not used yet');
    act(() => tree.unmount());
  });

  it('orders the never-used ones by name, there being nothing else true', () => {
    const tree = show([
      { ...channel('a', null, NOW, 'Priya Raman'), everUsed: false },
      { ...channel('b', null, NOW - 900_000, 'Dana Chu'), everUsed: false },
    ]);
    expect(titlesIn(tree, ['Dana Chu', 'Priya Raman'])).toEqual([
      'Dana Chu',
      'Priya Raman',
    ]);
    act(() => tree.unmount());
  });

  it('reads recency from the presence stamp, not from the last entry', () => {
    // `lastActiveAt` freezes for the whole of a conversation — it moves on an
    // entry and an exit and at no point between. A channel two people have
    // been talking in for an hour must not sink below one somebody walked out
    // of five minutes ago.
    const tree = show([
      { ...channel('a', 'Talking now', NOW - 3_600_000), lastPresenceAt: NOW },
      {
        ...channel('b', 'Left recently', NOW - 300_000),
        lastPresenceAt: NOW - 300_000,
      },
    ]);
    expect(titlesIn(tree, ['Talking now', 'Left recently'])).toEqual([
      'Talking now',
      'Left recently',
    ]);
    act(() => tree.unmount());
  });

  it('sorts by when each was last used, not when it was made', () => {
    const tree = show([
      channel('a', 'Standup', NOW - 900_000),
      channel('b', 'Thursday rehearsal', NOW),
      channel('c', 'Book club', NOW - 60_000),
    ]);
    expect(
      titlesIn(tree, ['Thursday rehearsal', 'Book club', 'Standup'])
    ).toEqual(['Thursday rehearsal', 'Book club', 'Standup']);
    act(() => tree.unmount());
  });

  it('sorts the described ones by recency too', () => {
    const tree = show([
      channel('a', null, NOW - 900_000, 'Dana Chu'),
      channel('b', null, NOW, 'Priya Raman'),
    ]);
    expect(titlesIn(tree, ['Priya Raman', 'Dana Chu'])).toEqual([
      'Priya Raman',
      'Dana Chu',
    ]);
    act(() => tree.unmount());
  });
});

/**
 * Rows you tap.
 *
 * A channel row is a single target rather than a button on the end of one:
 * there is one thing to do with a channel you are not in. Contact rows were
 * briefly the way to a profile and are gone with the contact list; the roster
 * inside a channel opens one, and the Contacts View will.
 */

describe('tapping a row', () => {
  /** The pressable whose accessibility label starts with `prefix`. */
  const pressableFor = (tree: ReactTestRenderer, prefix: string) =>
    tree.root.findAll(
      (n) =>
        n.props?.accessibilityRole === 'button' &&
        typeof n.props?.accessibilityLabel === 'string' &&
        n.props.accessibilityLabel.startsWith(prefix)
    )[0];

  it('leaves a sent request alone, there being no account behind it yet', () => {
    // `displayName` holds the address for these rows, and there is no person
    // behind it to open — which is the point of the row carrying no id. A
    // request is listed and answered, and is not a target.
    mockApp.home = {
      invites: [],
      rejoinable: [],
      contacts: [
        {
          account: { id: '', displayName: 'nobody@example.com' },
          status: 'outgoing',
        },
      ],
      recordings: [],
    };
    const tree = render(
      <HomeView {...homeNav} />
    );

    expect(textOf(tree)).toContain('nobody@example.com');
    expect(pressableFor(tree, 'nobody@example.com')).toBeUndefined();
    act(() => tree.unmount());
  });

  it('steps into a channel from anywhere on its row, there being no button', () => {
    const onEnterChannel = jest.fn();
    mockApp.home = {
      invites: [],
      rejoinable: [
        {
          channelId: 'sess_b',
          name: 'Thursday rehearsal',
          others: [{ id: 'acct_x', displayName: 'Miro Okafor' }],
          presentCount: 1,
          createdAt: NOW,
          lastActiveAt: NOW,
        },
      ],
      contacts: [],
      recordings: [],
    };
    const tree = render(
      <HomeView {...homeNav} onEnterChannel={onEnterChannel} />
    );

    expect(findButton(tree, 'Step in')).toBeUndefined();
    act(() => pressableFor(tree, 'Thursday rehearsal').props.onPress());
    expect(mockApp.act).toHaveBeenCalledWith('sess_b', { type: 'ENTER' });
    expect(onEnterChannel).toHaveBeenCalledWith('sess_b');
    act(() => tree.unmount());
  });

  /**
   * The other half of "Tap a channel to step in", which is off here.
   *
   * The channel opens and nothing is dispatched: no ENTER, so nobody is told
   * you have arrived and the microphone is never asked for. The screen that
   * opens is the one with a Step In button on it — see the channel tests.
   */
  it('opens a channel without entering it when stepping in is deliberate', () => {
    const onEnterChannel = jest.fn();
    mockApp.tapToStepIn = false;
    mockApp.home = {
      invites: [],
      rejoinable: [
        {
          channelId: 'sess_b',
          name: 'Thursday rehearsal',
          others: [{ id: 'acct_x', displayName: 'Miro Okafor' }],
          presentCount: 1,
          createdAt: NOW,
          lastActiveAt: NOW,
        },
      ],
      contacts: [],
      recordings: [],
    };
    const tree = render(
      <HomeView {...homeNav} onEnterChannel={onEnterChannel} />
    );

    act(() => pressableFor(tree, 'Thursday rehearsal').props.onPress());
    expect(mockApp.act).not.toHaveBeenCalled();
    expect(onEnterChannel).toHaveBeenCalledWith('sess_b');
    act(() => tree.unmount());
  });

  /** What the row promises has to be what the tap does. */
  it('says the tap opens rather than joins when it does not step in', () => {
    mockApp.tapToStepIn = false;
    mockApp.home = {
      invites: [
        {
          channelId: 'sess_i',
          name: null,
          from: { id: THEM, displayName: 'Dana Chu' },
          others: [{ id: THEM, displayName: 'Dana Chu' }],
          presentCount: 1,
          createdAt: NOW,
        },
      ],
      rejoinable: [],
      contacts: [],
      recordings: [],
    };
    const tree = render(<HomeView {...homeNav} />);

    expect(textOf(tree)).toContain('Dana Chu is waiting');
    expect(textOf(tree)).not.toContain('tap to join');
    expect(pressableFor(tree, 'Dana Chu').props.accessibilityLabel).toContain(
      'Open.'
    );
    act(() => tree.unmount());
  });

  /**
   * Starting a channel asks nobody anything. It used to arm a selection mode
   * over the contact list, which was a form to fill in before the first
   * channel could exist and which was hidden until you had two contacts —
   * exactly backwards for somebody with nowhere to talk yet.
   */
  it('starts a channel with nobody in it and walks straight in', async () => {
    const onEnterChannel = jest.fn();
    mockApp.startChannel.mockResolvedValue('sess_alone');
    mockApp.home = {
      invites: [],
      rejoinable: [],
      contacts: [],
      recordings: [],
    };
    const tree = render(
      <HomeView {...homeNav} onEnterChannel={onEnterChannel} />
    );

    // Offered with an empty contact list, which the old affordance was not.
    expect(findButton(tree, 'Start a channel with several people')).toBeUndefined();
    await act(async () => {
      findButton(tree, 'Start a channel')!.props.onPress();
    });

    expect(mockApp.startChannel).toHaveBeenCalledWith([]);
    expect(mockApp.act).toHaveBeenCalledWith('sess_alone', { type: 'ENTER' });
    expect(onEnterChannel).toHaveBeenCalledWith('sess_alone');
    act(() => tree.unmount());
  });

  /**
   * The row lives above the channel list, in the place *Add a contact* has on
   * the tab beside it, and the list and its label are drawn only when there is
   * a channel in them — so the row has to sit outside that guard. Rendering it
   * inside would hide the only way to open a channel from the one account that
   * has none, which is the mistake the affordance it replaced already made
   * once.
   */
  it('offers to start one whether or not there are channels already', () => {
    const withChannel = {
      invites: [],
      rejoinable: [
        {
          channelId: 'sess_b',
          name: 'Thursday rehearsal',
          others: [{ id: 'acct_x', displayName: 'Miro Okafor' }],
          presentCount: 0,
          createdAt: NOW,
          lastActiveAt: NOW,
        },
      ],
      contacts: [],
      recordings: [],
    };

    for (const home of [withChannel, { ...withChannel, rejoinable: [] }]) {
      mockApp.home = home;
      const tree = render(
        <HomeView {...homeNav} />
      );
      expect(findButton(tree, 'Start a channel')).toBeDefined();
      act(() => tree.unmount());
    }
  });

});

/**
 * A profile now says what you already share with somebody, not only who they
 * are. The list is drawn from Home's own channels, which is exactly the set
 * you can step into.
 */

describe('channels you share with somebody', () => {
  const withChannels = (rejoinable: HomeViewData['rejoinable']) => {
    mockApp.home = { invites: [], rejoinable, contacts: [], recordings: [] };
  };

  const channel = (id: string, name: string | null, otherId: string) => ({
    channelId: id,
    name,
    others: [{ id: otherId, displayName: 'Dana Chu' }],
    presentCount: 0,
    createdAt: NOW,
    lastActiveAt: NOW,
  });

  it('lists only the ones they are in, and steps into the one tapped', async () => {
    const onEnterChannel = jest.fn();
    withChannels([
      channel('sess_shared', 'Thursday rehearsal', THEM),
      channel('sess_other', 'Someone else entirely', 'acct_stranger'),
    ]);

    let tree!: ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(
        <ProfileView
          accountId={THEM}
          fallbackName="Dana Chu"
          onBack={() => {}}
          onEnterChannel={onEnterChannel}
        />
      );
    });

    const text = textOf(tree);
    expect(text).toContain('Thursday rehearsal');
    expect(text).not.toContain('Someone else entirely');

    const row = tree.root.findAll(
      (n) =>
        n.props?.accessibilityRole === 'button' &&
        typeof n.props?.accessibilityLabel === 'string' &&
        n.props.accessibilityLabel.startsWith('Thursday rehearsal')
    )[0];
    act(() => row.props.onPress());

    expect(mockApp.act).toHaveBeenCalledWith('sess_shared', { type: 'ENTER' });
    expect(onEnterChannel).toHaveBeenCalledWith('sess_shared');
    act(() => tree.unmount());
  });

  it('measures idleness the way Home does', async () => {
    // It used to say "Nobody here right now" for any empty channel whatever
    // its age, so the room Home called two hours ago read here as merely
    // empty, and one neither of you had ever opened claimed to have been
    // left. One function draws both lines now.
    withChannels([
      { ...channel('sess_quiet', 'Thursday rehearsal', THEM),
        lastPresenceAt: NOW - 2 * 3_600_000 },
      { ...channel('sess_new', 'Never opened', THEM), everUsed: false },
    ]);

    let tree!: ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(
        <ProfileView
          accountId={THEM}
          fallbackName="Dana Chu"
          onBack={() => {}}
          onEnterChannel={() => {}}
        />
      );
    });

    const text = textOf(tree);
    expect(text).toContain('2 hours ago');
    expect(text).toContain('Not used yet');
    expect(text).not.toContain('Nobody here right now');
    act(() => tree.unmount());
  });

  /**
   * The card for the room you are standing in wears Home's live bar.
   *
   * The most common way to open a profile is from the roster of the channel
   * you are in, so this section is routinely drawn on top of a live
   * conversation — and until this it drew that room exactly like one neither
   * of you had opened in a week. Home refuses to be that quiet about an open
   * microphone; this is the same mark, from the same helper.
   */
  describe('the one you are standing in', () => {
    /** The card's own style, flattened past the press-state function. */
    const cardFor = (tree: ReactTestRenderer, name: string) => {
      const node = tree.root
        .findAll(
          (n) =>
            typeof n.type === 'string' &&
            String(n.props?.accessibilityLabel ?? '').startsWith(name)
        )
        .at(0);
      const style = node?.props?.style;
      return {
        node,
        style: StyleSheet.flatten(
          typeof style === 'function' ? style({ pressed: false }) : style
        ) as { borderColor?: unknown; backgroundColor?: unknown },
      };
    };

    /** Every dot drawn in the section, in the order they appear. */
    const dots = (tree: ReactTestRenderer) =>
      tree.root
        .findAll((n) => {
          const flat = StyleSheet.flatten(n.props?.style) as
            | { width?: number; borderRadius?: number }
            | undefined;
          return (
            typeof n.type === 'string' &&
            flat?.width === 9 &&
            flat?.borderRadius === 5
          );
        })
        .map(
          (n) =>
            StyleSheet.flatten(n.props.style) as {
              backgroundColor?: unknown;
              borderColor?: unknown;
            }
        );

    const open = async () => {
      let tree!: ReactTestRenderer;
      await act(async () => {
        tree = renderer.create(
          <ProfileView
            accountId={THEM}
            fallbackName="Dana Chu"
            onBack={() => {}}
            onEnterChannel={() => {}}
          />
        );
      });
      return tree;
    };

    beforeEach(() => {
      withChannels([
        channel('sess_other', 'Someone else entirely', THEM),
        channel('sess_1', 'Thursday rehearsal', THEM),
      ]);
    });

    it('marks it, puts it first, and leaves the rest alone', async () => {
      showChannel(channelOf());
      const tree = await open();

      const live = cardFor(tree, 'Thursday rehearsal');
      const other = cardFor(tree, 'Someone else entirely');
      expect(live.style.borderColor).toBe(colors.floor);
      expect(live.style.backgroundColor).toBe(colors.floorDim);
      expect(other.style.borderColor).not.toBe(colors.floor);

      // The dot is invisible to a screen reader, so the label says it in
      // words — and only on the card it is true of.
      expect(String(live.node!.props.accessibilityLabel)).toContain(
        'You are here'
      );
      expect(String(other.node!.props.accessibilityLabel)).toContain('Step in');

      // One dot, filled, because nothing is muted.
      const drawn = dots(tree);
      expect(drawn).toHaveLength(1);
      expect(drawn[0]!.backgroundColor).toBe(colors.floor);

      // First, the way Home pins its live bar above the lists — the fixture
      // lists it second.
      const text = textOf(tree);
      expect(text.indexOf('Thursday rehearsal')).toBeLessThan(
        text.indexOf('Someone else entirely')
      );
      act(() => tree.unmount());
    });

    it('goes hollow when you have muted yourself', async () => {
      showChannel(
        channelOf((c) =>
          reduce(c, { type: 'SET_SELF_MUTE', userId: ME, muted: true }, NOW)
        )
      );
      const tree = await open();

      const drawn = dots(tree);
      expect(drawn).toHaveLength(1);
      expect(drawn[0]!.backgroundColor).toBe('transparent');
      expect(drawn[0]!.borderColor).toBe(colors.textFaint);
      expect(
        String(
          cardFor(tree, 'Thursday rehearsal').node!.props.accessibilityLabel
        )
      ).toContain('your microphone is muted');
      act(() => tree.unmount());
    });

    it('marks nothing when the room is held by another device', async () => {
      // Being present and being the device that is present are different
      // facts. The roster says the account is in there; this device is not,
      // so there is no microphone here to admit to. See state/live.ts.
      showChannel(channelOf());
      mockApp.standingIn = null;
      const tree = await open();

      expect(cardFor(tree, 'Thursday rehearsal').style.borderColor).not.toBe(
        colors.floor
      );
      expect(dots(tree)).toHaveLength(0);
      act(() => tree.unmount());
    });

    it('marks nothing once the build is expired', async () => {
      // The socket is already hung up and the screen behind this says to
      // update; a card claiming you are in a conversation would outlive it.
      showChannel(channelOf());
      mockApp.expired = true;
      const tree = await open();

      expect(cardFor(tree, 'Thursday rehearsal').style.borderColor).not.toBe(
        colors.floor
      );
      expect(dots(tree)).toHaveLength(0);
      act(() => tree.unmount());
    });
  });

  it('still lists them when there is nowhere to send you', async () => {
    // No route in the app leaves this out any more — both callers pass one,
    // ChannelView included since 2026-08-31 — but the prop stays optional and
    // this is what a caller without one gets. The section used to be left out
    // entirely when it was absent, which meant nobody ever saw it, neither
    // caller then passing one. What you share with somebody is worth reading
    // where it cannot be acted on; only the tap goes.
    withChannels([channel('sess_shared', 'Thursday rehearsal', THEM)]);

    let tree!: ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(
        <ProfileView
          accountId={THEM}
          fallbackName="Dana Chu"
          onBack={() => {}}
        />
      );
    });

    const text = textOf(tree);
    expect(text).toContain('Channels with them');
    expect(text).toContain('Thursday rehearsal');
    // A card rather than a button: nothing here claims to be pressable.
    expect(
      tree.root.findAll(
        (n) =>
          n.props?.accessibilityRole === 'button' &&
          typeof n.props?.accessibilityLabel === 'string' &&
          n.props.accessibilityLabel.startsWith('Thursday rehearsal')
      )
    ).toHaveLength(0);
    act(() => tree.unmount());
  });

  it('says where they have been in each, which is not where the room has', async () => {
    // The point of the section. `lastPresenceAt` is the maximum across
    // everybody in the channel, so a room two other people sat in all
    // afternoon reads as busy while the person whose profile this is has not
    // opened it for a week — and the card is about them.
    withChannels([
      {
        ...channel('sess_busy', 'Thursday rehearsal', THEM),
        presentCount: 3,
        lastPresenceAt: NOW,
      },
      { ...channel('sess_here', 'Quartet', THEM), presentCount: 1 },
      { ...channel('sess_never', 'Just the two of us', THEM) },
    ]);
    mockApp.loadProfile.mockResolvedValueOnce({
      account: { id: THEM, displayName: 'Dana Chu' },
      sharedChannels: [
        {
          channelId: 'sess_busy',
          present: false,
          lastPresentAt: NOW - 7 * 24 * 3_600_000,
        },
        { channelId: 'sess_here', present: true, lastPresentAt: NOW },
        { channelId: 'sess_never', present: false, lastPresentAt: null },
      ],
    });

    let tree!: ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(
        <ProfileView
          accountId={THEM}
          fallbackName="Dana Chu"
          onBack={() => {}}
        />
      );
    });

    const text = textOf(tree);
    // Theirs first, and the room's occupancy after it — the second is why you
    // would tap, and dropping it would leave the card honest and unhelpful.
    expect(text).toContain('Last here 7 days ago · 3 present');
    expect(text).toContain('Here now · 1 present');
    // Never, which is an ordinary state: nobody has opened the channel a pair
    // get for becoming contacts. No count, there being nobody to count.
    expect(text).toContain('Never been here');
    expect(text).not.toContain('Never been here · ');
    act(() => tree.unmount());
  });

  it('keeps the room’s own number here, where Home no longer does', async () => {
    // The fallback branch of `describeQuiet`, pinned deliberately rather than
    // left as a happy accident. A profile card gets no `lastPresenceByOthers`
    // and must not: it already carries `sharedChannels`, which is the same
    // question asked per person and answered with more detail — and this line
    // is the one drawn when that array is missing, whose whole job is to
    // describe the *room*. Excluding the reader from a card that is about
    // somebody else answers nobody's question.
    //
    // Somebody tidying will one day notice Home passes a field here that this
    // does not. This says the asymmetry is the design.
    withChannels([
      {
        ...channel('sess_quiet', 'Thursday rehearsal', THEM),
        presentCount: 0,
        lastPresenceAt: NOW - 5 * 60_000,
      },
    ]);
    mockApp.loadProfile.mockResolvedValueOnce({
      account: { id: THEM, displayName: 'Dana Chu' },
    });

    let tree!: ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(
        <ProfileView
          accountId={THEM}
          fallbackName="Dana Chu"
          onBack={() => {}}
        />
      );
    });

    expect(textOf(tree)).toContain('5 minutes ago');
    expect(textOf(tree)).not.toContain('Nobody else yet');
    act(() => tree.unmount());
  });

  it('leaves the section out when the profile is your own', async () => {
    // It would be Home's list of your channels with your own name against
    // every line. The Contact card goes for the same reason.
    withChannels([channel('sess_shared', 'Thursday rehearsal', ME)]);

    let tree!: ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(
        <ProfileView accountId={ME} fallbackName="Me" onBack={() => {}} />
      );
    });

    expect(textOf(tree)).not.toContain('Channels with them');
    act(() => tree.unmount());
  });
});

/**
 * Handing somebody your address, which is the one thing about a person this
 * app will not release on a relationship alone.
 *
 * Two decisions rather than one, and the screen draws them as two: what they
 * have chosen to show you, and what you have chosen to show them. Neither
 * implies or asks for the other.
 */

describe('the order channels are listed in', () => {
  const channel = (
    id: string,
    name: string | null,
    presentCount: number,
    lastActiveAt: number
  ) => ({
    channelId: id,
    name,
    others: [{ id: 'acct_q', displayName: 'Quinn Ito' }],
    presentCount,
    createdAt: NOW,
    lastActiveAt,
  });


  it('puts an occupied channel above one that emptied more recently', () => {
    // `lastActiveAt` is written on entry and on the way out and never in
    // between, so a channel two people have been talking in for an hour
    // carries the hour-old moment the second of them arrived. Ordering on it
    // alone sinks the live conversation under an abandoned one.
    mockApp.home = {
      invites: [],
      rejoinable: [
        channel('chan_b', 'Emptied', 0, NOW - 5 * 60_000),
        channel('chan_a', 'Occupied', 2, NOW - 3_600_000),
        channel('chan_c', 'Older', 0, NOW - 86_400_000),
      ],
      recordings: [],
      contacts: [],
    };
    const tree = render(
      <HomeView {...homeNav} />
    );
    const order = ['Occupied', 'Emptied', 'Older'];
    expect(namesInOrder(tree, order)).toEqual(order);
    act(() => tree.unmount());
  });

  it('separates the occupied ones under their own heading', () => {
    // The sections are the coarse sort, and they are a ladder rather than a
    // taxonomy: a channel appears once, in the first one it qualifies for.
    // Occupancy is what the top one is for, so an unnamed channel with two
    // people in it outranks a named one with nobody — which is the opposite of
    // the rule this list used to keep, and the right way round.
    mockApp.home = {
      invites: [],
      rejoinable: [
        channel('chan_a', null, 2, NOW),
        channel('chan_b', 'Emptied', 0, NOW - 3_600_000),
      ],
      recordings: [],
      contacts: [],
    };
    const tree = render(
      <HomeView {...homeNav} />
    );
    const text = textOf(tree);
    expect(text.indexOf('Live')).toBeLessThan(text.indexOf('Quinn Ito'));
    expect(text.indexOf('Quinn Ito')).toBeLessThan(text.indexOf('Your channels'));
    expect(text.indexOf('Your channels')).toBeLessThan(text.indexOf('Emptied'));
    act(() => tree.unmount());
  });
});


/**
 * What a channel row says about how quiet it is, and what it is ordered by —
 * one number for both, and the reader is not in it.
 *
 * The complaint that produced this: presence is exclusive, so stepping into a
 * channel to announce yourself and then stepping into the next left the first
 * sitting at the top of Home, above a room two other people had spent an hour
 * in yesterday. The list ordered on visits, and what somebody scanning it wants
 * is what they missed.
 */

describe('how quiet a channel is, counting other people only', () => {
  const row = (
    id: string,
    name: string,
    extra: Record<string, unknown> = {}
  ) => ({
    channelId: id,
    name,
    others: [{ id: 'acct_q', displayName: 'Quinn Ito' }],
    presentCount: 0,
    createdAt: NOW - 90 * 86_400_000,
    lastActiveAt: NOW,
    ...extra,
  });

  const show = (rejoinable: unknown[]) => {
    mockApp.home = {
      invites: [],
      rejoinable: rejoinable as never,
      contacts: [],
      recordings: [],
    };
    return render(<HomeView {...homeNav} />);
  };

  it('names the gap since anybody else was here, not since anybody was', () => {
    // The reader sat in it five minutes ago; the last other person was here two
    // days ago. Two days is the answer.
    const tree = show([
      row('chan_a', 'Book club', {
        lastPresenceAt: NOW - 5 * 60_000,
        lastPresenceByOthers: NOW - 2 * 86_400_000,
      }),
    ]);
    const text = textOf(tree);
    expect(text).toContain('2 days ago');
    expect(text).not.toContain('5 minutes ago');
    act(() => tree.unmount());
  });

  it('says nobody else yet for a room only the reader has been in', () => {
    // Null is a fact, not a gap, and must not fall back to the room's own
    // number — that number is the solitary morning this exists to leave out.
    const tree = show([
      row('chan_a', 'Book club', {
        lastPresenceAt: NOW - 5 * 60_000,
        lastPresenceByOthers: null,
      }),
    ]);
    const text = textOf(tree);
    // Sentence-cased by `sentence()`, this being the whole line rather than
    // the second half of one, as it is on an invitation.
    expect(text).toContain('Nobody else yet');
    expect(text).not.toContain('5 minutes ago');
    act(() => tree.unmount());
  });

  it('still says a channel nobody has used has not been used', () => {
    const tree = show([
      row('chan_a', 'Book club', {
        everUsed: false,
        lastPresenceAt: NOW - 5 * 60_000,
        lastPresenceByOthers: null,
      }),
    ]);
    expect(textOf(tree)).toContain('Not used yet');
    act(() => tree.unmount());
  });

  it('draws the old line against a server that does not send the number', () => {
    // Absent is not a fact about anybody. Falling back is far better than
    // telling somebody a channel they talk in every day has never held anyone
    // but them.
    const tree = show([
      row('chan_a', 'Book club', { lastPresenceAt: NOW - 5 * 60_000 }),
    ]);
    expect(textOf(tree)).toContain('5 minutes ago');
    act(() => tree.unmount());
  });

  it('says only how many are present when somebody is in it', () => {
    // The interval and the count answer different questions and never draw at
    // once — which is what makes them impossible to contradict.
    const tree = show([
      row('chan_a', 'Book club', {
        presentCount: 2,
        lastPresenceAt: NOW,
        lastPresenceByOthers: NOW - 2 * 86_400_000,
      }),
    ]);
    const text = textOf(tree);
    expect(text).toContain('2 present');
    expect(text).not.toContain('2 days ago');
    act(() => tree.unmount());
  });


  it('sorts a room somebody else used above one only the reader has', () => {
    // The whole complaint, as an assertion. Under the old number "Alone" was
    // the freshest thing on the screen.
    const tree = show([
      row('chan_a', 'Alone', {
        lastPresenceAt: NOW - 5 * 60_000,
        lastPresenceByOthers: null,
      }),
      row('chan_b', 'Others', {
        lastPresenceAt: NOW - 86_400_000,
        lastPresenceByOthers: NOW - 86_400_000,
      }),
    ]);
    expect(namesInOrder(tree, ['Alone', 'Others'])).toEqual(['Others', 'Alone']);
    act(() => tree.unmount());
  });

  it('keeps a room only the reader has used above one nobody has touched', () => {
    // The middle tier. Somebody went there, possibly to wait, and that is
    // worth more than a channel neither of them has ever opened — and less
    // than one somebody else visited. Three tiers, in one assertion.
    const tree = show([
      row('chan_c', 'Never', {
        everUsed: false,
        lastPresenceAt: NOW,
        lastPresenceByOthers: null,
      }),
      row('chan_a', 'Alone', {
        lastPresenceAt: NOW - 5 * 60_000,
        lastPresenceByOthers: null,
      }),
      row('chan_b', 'Others', {
        lastPresenceAt: NOW - 86_400_000,
        lastPresenceByOthers: NOW - 86_400_000,
      }),
    ]);
    expect(namesInOrder(tree, ['Others', 'Alone', 'Never'])).toEqual([
      'Others',
      'Alone',
      'Never',
    ]);
    act(() => tree.unmount());
  });

  it('orders the reader-only tier by their own visits, having nothing else', () => {
    const tree = show([
      row('chan_a', 'Older', {
        lastPresenceAt: NOW - 86_400_000,
        lastPresenceByOthers: null,
      }),
      row('chan_b', 'Newer', {
        lastPresenceAt: NOW - 60_000,
        lastPresenceByOthers: null,
      }),
    ]);
    expect(namesInOrder(tree, ['Newer', 'Older'])).toEqual(['Newer', 'Older']);
    act(() => tree.unmount());
  });

  it('keeps the old order exactly against a server without the number', () => {
    // The fallback has to restore the previous behaviour rather than collapse
    // every row into the middle tier and shuffle the list by name.
    const tree = show([
      row('chan_a', 'Older', { lastPresenceAt: NOW - 86_400_000 }),
      row('chan_b', 'Newer', { lastPresenceAt: NOW - 60_000 }),
    ]);
    expect(namesInOrder(tree, ['Newer', 'Older'])).toEqual(['Newer', 'Older']);
    act(() => tree.unmount());
  });
});

/**
 * The mark, which is the other half and is not a measure.
 *
 * The number above forgets the reader on purpose, so nothing in it can report
 * that the reader themselves stepped in. Presence being exclusive, stepping
 * into the next channel steps you out of the last — so without this a room you
 * knocked on a minute ago carries no trace of it at all.
 */

describe('the mark for a channel you have just stepped into', () => {
  const steppedIn = (extra: Record<string, unknown> = {}) => {
    mockApp.home = {
      invites: [],
      rejoinable: [
        {
          channelId: 'chan_a',
          name: 'Book club',
          others: [{ id: 'acct_q', displayName: 'Quinn Ito' }],
          presentCount: 0,
          createdAt: NOW - 90 * 86_400_000,
          lastActiveAt: NOW,
          lastPresenceAt: NOW - 60_000,
          lastPresenceByOthers: NOW - 4 * 86_400_000,
          steppedInAt: NOW - 60_000,
          ...extra,
        },
      ],
      contacts: [],
      recordings: [],
    } as never;
    return render(<HomeView {...homeNav} />);
  };

  const labelOf = (tree: ReturnType<typeof render>) =>
    String(
      tree.root
        .findAll(
          (n) =>
            typeof n.props?.accessibilityLabel === 'string' &&
            n.props.accessibilityLabel.startsWith('Book club')
        )
        .at(0)?.props.accessibilityLabel ?? ''
    );

  it('draws the glyph, and says it in words for a screen reader', () => {
    // A glyph reads as nothing, so the label is where that cost is paid.
    const tree = steppedIn();
    expect(textOf(tree)).toContain('↗');
    expect(labelOf(tree)).toContain('Stepped in and out.');
    act(() => tree.unmount());
  });

  it('does not say the state in the same words as the action', () => {
    // Why the label is "Stepped in and out" and not "Stepped in". The action at
    // the end of this same label is "Step in", so the short form put a state
    // and a button a syllable apart — "Stepped in. Step in." — which reads as a
    // stutter and tells a screen reader user nothing about which is which. The
    // long form is two words more and is the whole of what happened.
    const tree = steppedIn();
    const label = labelOf(tree);
    expect(label).toContain('Stepped in and out. Step in.');
    expect(label).not.toContain('Stepped in. Step in.');
    act(() => tree.unmount());
  });

  it('leaves the row’s own number alone', () => {
    // Two facts, not one. The interval still reports the others, and it is
    // four days old whatever the reader did a minute ago.
    const tree = steppedIn();
    expect(textOf(tree)).toContain('4 days ago');
    act(() => tree.unmount());
  });

  it('goes once the visit it reports is old enough', () => {
    // Expired against the phone's own clock, which is why the wire carries a
    // moment rather than a flag: nothing has to happen in the channel for the
    // mark to go.
    const tree = steppedIn({ steppedInAt: NOW - WAITING_WINDOW_MS - 1 });
    expect(textOf(tree)).not.toContain('↗');
    expect(labelOf(tree)).not.toContain('Stepped in and out.');
    act(() => tree.unmount());
  });

  it('lasts as long as the roster goes on calling that visit nearby', () => {
    // The window is WAITING_WINDOW_MS and not the push's PRESENCE_LIFETIME_MS,
    // which it read for a day. Pinned against the constant at both ends rather
    // than against fifteen minutes, since what is being asserted is that the
    // mark and the "Nearby" line expire together — one visit told to two
    // audiences — not that either is any particular length.
    const alive = steppedIn({ steppedInAt: NOW - WAITING_WINDOW_MS + 1000 });
    expect(textOf(alive)).toContain('↗');
    act(() => alive.unmount());
    // Six minutes: gone under the old five-minute window, still drawn now.
    const wasExpired = steppedIn({ steppedInAt: NOW - 6 * 60_000 });
    expect(textOf(wasExpired)).toContain('↗');
    act(() => wasExpired.unmount());
  });

  it('is not drawn for somebody else’s arrival', () => {
    // Their arrival is already in the number. Null is the server saying the
    // last person in here was not this reader.
    const tree = steppedIn({ steppedInAt: null });
    expect(textOf(tree)).not.toContain('↗');
    act(() => tree.unmount());
  });

  it('is not drawn against a server that does not send it', () => {
    const tree = steppedIn({ steppedInAt: undefined });
    expect(textOf(tree)).not.toContain('↗');
    act(() => tree.unmount());
  });

  it('is not drawn on a row somebody is in', () => {
    // A channel the reader is still standing in does not need to be told they
    // arrived, and a row with people in it is showing its count.
    const tree = steppedIn({ presentCount: 1 });
    expect(textOf(tree)).not.toContain('↗');
    act(() => tree.unmount());
  });

  it('does not move the channel up the list', () => {
    // Sorting on it would put the reader's own echo back at the top, undoing
    // with the second signal exactly what the first one was for.
    mockApp.home = {
      invites: [],
      rejoinable: [
        {
          channelId: 'chan_a',
          name: 'Knocked',
          others: [{ id: 'acct_q', displayName: 'Quinn Ito' }],
          presentCount: 0,
          createdAt: NOW - 90 * 86_400_000,
          lastActiveAt: NOW,
          lastPresenceAt: NOW - 60_000,
          lastPresenceByOthers: NOW - 4 * 86_400_000,
          steppedInAt: NOW - 60_000,
        },
        {
          channelId: 'chan_b',
          name: 'Quiet',
          others: [{ id: 'acct_r', displayName: 'Rae Lin' }],
          presentCount: 0,
          createdAt: NOW - 90 * 86_400_000,
          lastActiveAt: NOW,
          lastPresenceAt: NOW - 3_600_000,
          lastPresenceByOthers: NOW - 3_600_000,
          steppedInAt: null,
        },
      ],
      contacts: [],
      recordings: [],
    } as never;
    const tree = render(<HomeView {...homeNav} />);
    const text = textOf(tree);
    expect(text.indexOf('Quiet')).toBeLessThan(text.indexOf('Knocked'));
    act(() => tree.unmount());
  });
});
