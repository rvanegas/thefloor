import React from 'react';
import renderer, {
  act,
  type ReactTestRenderer,
} from 'react-test-renderer';
import { HomeView } from '../HomeView';
import { HomeSettingsView } from '../HomeSettingsView';
import { SupportView } from '../SupportView';
import { LeaderboardView } from '../LeaderboardView';
import { Alert, StyleSheet } from 'react-native';
import {
  NOW,
  findButton,
  homeNav,
  labelOf,
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
 * Settings and what is reached from it: the three preferences, the privacy
 * link, deleting the account, and Support with the standings.
 *
 * Split out of `views.test.tsx` on 2026-09-04, which was 8,495 lines and 343
 * tests by then; the fixtures every one of these files shares are in
 * `testing/harness`.
 */

/**
 * The resting background of a labelled button, which is how these three
 * settings say which option is in force — there is no other mark on the row.
 * `pressed: false` because `style` is a function here: what a test means is
 * the untouched state, not the one under a finger.
 */
const styleOf = (tree: ReactTestRenderer, label: string) =>
  StyleSheet.flatten(
    findButton(tree, label)!.props.style({ pressed: false })
  ) as { backgroundColor?: unknown };

beforeEach(resetHarness);

describe('Home settings', () => {
  /** The view fetches on mount, so every case has to let that settle. */
  async function openSettings() {
    let tree!: ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(<HomeSettingsView onBack={() => {}} />);
    });
    return tree;
  }

  /**
   * The privacy policy, which Guideline 5.1.1(i) requires to be reachable from
   * inside the application and not only from the App Store listing.
   *
   * The page itself is the server's, and tested there. What is asserted here is
   * that there is a way to it, and that it points at the server actually
   * holding the data rather than at a URL somebody typed into the app.
   */
  describe('the privacy policy link', () => {
    it('is offered on the settings screen', async () => {
      // That it points at *this* app's server is asserted in
      // privacyLink.test.tsx, which needs the address configured at import time
      // and so cannot share this file's module registry.
      const tree = await openSettings();
      expect(findButton(tree, 'Privacy policy')).toBeDefined();
      act(() => tree.unmount());
    });

    it('says so rather than opening nothing when there is no server', async () => {
      // Which is the case here: these tests run with no EXPO_PUBLIC_API_URL,
      // the same state a development build with no `app/.env` is in.
      const { Linking } = require('react-native');
      const opened = jest
        .spyOn(Linking, 'openURL')
        .mockResolvedValue(undefined as never);

      const tree = await openSettings();
      await act(async () =>
        findButton(tree, 'Privacy policy')!.props.onPress()
      );

      expect(opened).not.toHaveBeenCalled();
      expect(textOf(tree)).toContain('No server configured');

      opened.mockRestore();
      act(() => tree.unmount());
    });
  });

  /**
   * Deleting the account, which App Store Guideline 5.1.1(v) requires to be
   * reachable from inside the application rather than by writing to anybody.
   *
   * What is asserted here is the shape of the offer — findable on the settings
   * screen, asked about before it happens, and honest about what it takes — not
   * what the server does with it, which is the server's own test.
   */
  describe('deleting the account', () => {
    const alertSpy = () => {
      const { Alert } = require('react-native');
      return jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    };

    it('is offered on the same screen as signing out', async () => {
      const tree = await openSettings();
      expect(findButton(tree, 'Delete account')).toBeDefined();
      expect(findButton(tree, 'Sign out')).toBeDefined();
      act(() => tree.unmount());
    });

    it('asks first, and says what it does not take', async () => {
      const asked = alertSpy();
      const tree = await openSettings();

      act(() => findButton(tree, 'Delete account')!.props.onPress());
      expect(asked).toHaveBeenCalled();
      expect(mockApp.deleteAccount).not.toHaveBeenCalled();

      // The part nobody would guess: a channel is not yours to take with you.
      // "This cannot be undone" alone would be true and useless.
      const body = asked.mock.calls[0][1] as string;
      expect(body).toContain('carry on without you');
      expect(body).toContain('cannot be undone');

      asked.mockRestore();
      act(() => tree.unmount());
    });

    it('does it when the destructive choice is taken', async () => {
      const asked = alertSpy();
      const tree = await openSettings();
      act(() => findButton(tree, 'Delete account')!.props.onPress());

      const actions = asked.mock.calls[0][2] as Array<{
        style?: string;
        onPress?: () => void;
      }>;
      await act(async () =>
        actions.find((a) => a.style === 'destructive')!.onPress!()
      );
      expect(mockApp.deleteAccount).toHaveBeenCalled();

      asked.mockRestore();
      act(() => tree.unmount());
    });

    it('stays put and says so when the server refused', async () => {
      // The failure that matters: a screen claiming the account is gone while
      // the server still has one would leave nobody able to try again.
      const asked = alertSpy();
      mockApp.deleteAccount.mockRejectedValueOnce(
        new Error('server said no') as never
      );
      const tree = await openSettings();
      act(() => findButton(tree, 'Delete account')!.props.onPress());

      const actions = asked.mock.calls[0][2] as Array<{
        style?: string;
        onPress?: () => void;
      }>;
      await act(async () =>
        actions.find((a) => a.style === 'destructive')!.onPress!()
      );
      expect(textOf(tree)).toContain('server said no');
      expect(findButton(tree, 'Delete account')).toBeDefined();

      asked.mockRestore();
      act(() => tree.unmount());
    });
  });


  it('holds signing out, which is no longer on Home', () => {
    // It sat in the header beside a dozen harmless taps. Here it is among the
    // other things that are about the account rather than about a channel.
    const tree = render(
      <HomeView {...homeNav} />
    );
    expect(findButton(tree, 'Sign out')).toBeUndefined();
    act(() => tree.unmount());
  });

  it('signs out behind a confirmation', async () => {
    const tree = await openSettings();
    const signOut = findButton(tree, 'Sign out');
    expect(signOut).toBeDefined();
    act(() => signOut!.props.onPress());
    // The alert carries it; the tap alone must not.
    expect(mockApp.signOut).not.toHaveBeenCalled();
    act(() => tree.unmount());
  });

  it('opens from Home', () => {
    const onOpenSettings = jest.fn();
    mockApp.home = {
      invites: [],
      rejoinable: [],
      contacts: [],
      recordings: [],
    };
    const tree = render(
      <HomeView {...homeNav} onOpenSettings={onOpenSettings} />
    );
    act(() => findButton(tree, 'Settings')!.props.onPress());
    expect(onOpenSettings).toHaveBeenCalled();
    act(() => tree.unmount());
  });
});

describe('the control-cards setting', () => {
  const openSettings = async () => {
    let tree!: ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(<HomeSettingsView onBack={() => {}} />);
    });
    return tree;
  };

  /**
   * Three cards on this screen offer On and Off, so the label alone does not
   * pick one out. They are found in render order and this is the second — the
   * tap is above it and the headset below.
   *
   * One node per button. `findAll` matches three for each — the Pressable, the
   * component it renders and the host view under that — and an unfiltered
   * search would make "the second Off" the first button's insides. The one
   * that carries `onPress` is the one there is exactly one of.
   */
  const cardsButton = (tree: ReactTestRenderer, label: string) =>
    tree.root
      .findAll(
        (n) =>
          n.props?.accessibilityRole === 'button' &&
          typeof n.props.onPress === 'function'
      )
      .filter((n) => labelOf(n).includes(label))[1];

  it('offers both answers and names what goes with the cards', async () => {
    const tree = await openSettings();
    const text = textOf(tree);
    expect(text).toContain('Repeat the channel controls as cards');
    // What the second paragraph promises, and what the channel screen keeps.
    expect(text).toContain('its card stays either way');
    // The promise the channel screen keeps by moving two sentences upward.
    expect(text).toContain('still being recorded');
    act(() => tree.unmount());
  });

  it('reports a change rather than keeping it', async () => {
    const tree = await openSettings();
    act(() => cardsButton(tree, 'Off').props.onPress());
    expect(mockApp.setControlCards).toHaveBeenCalledWith(false);
    expect(mockApp.setTapToStepIn).not.toHaveBeenCalled();
    act(() => tree.unmount());
  });

  it('marks which one is in force', async () => {
    mockApp.controlCards = false;
    const tree = await openSettings();
    const cardStyleOf = (label: string) =>
      StyleSheet.flatten(
        cardsButton(tree, label).props.style({ pressed: false })
      ) as { backgroundColor?: unknown };
    expect(cardStyleOf('Off').backgroundColor).not.toBe(
      cardStyleOf('On').backgroundColor
    );
    act(() => tree.unmount());
  });
});

/**
 * Whether a tap on a channel arrives or only looks.
 *
 * The setting itself is a phone preference held in the provider; what this
 * screen owes is the two choices, a mark on the one in force, and reporting a
 * change upward. What the choice *does* is asserted on Home and in the
 * channel, which are the two screens it changes.
 */

describe('the stepping-in setting', () => {
  const openSettings = async () => {
    let tree!: ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(<HomeSettingsView onBack={() => {}} />);
    });
    return tree;
  };

  it('offers both answers and says what each means', async () => {
    const tree = await openSettings();
    expect(textOf(tree)).toContain('Tap a channel to step in');
    expect(findButton(tree, 'On')).toBeDefined();
    expect(findButton(tree, 'Off')).toBeDefined();
    expect(textOf(tree)).toContain('everyone there can hear you');
    act(() => tree.unmount());
  });

  it('reports a change rather than keeping it', async () => {
    const tree = await openSettings();
    act(() => findButton(tree, 'Off')!.props.onPress());
    expect(mockApp.setTapToStepIn).toHaveBeenCalledWith(false);
    act(() => tree.unmount());
  });

  it('marks which one is in force', async () => {
    mockApp.tapToStepIn = false;
    const tree = await openSettings();
    // Button's style is a function of press state, not an array.
    expect(styleOf(tree, 'Off').backgroundColor).not.toBe(
      styleOf(tree, 'On').backgroundColor
    );
    act(() => tree.unmount());
  });
});

/**
 * Choosing a colour scheme.
 *
 * What the choice *looks* like cannot be asserted here — the colours resolve
 * in UIKit, below anything JavaScript observes. What can be asserted is that
 * the screen offers the three choices, marks the current one, and reports a
 * change upward rather than keeping it to itself.
 */

describe('the appearance setting', () => {
  const openSettings = async () => {
    let tree!: ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(<HomeSettingsView onBack={() => {}} />);
    });
    return tree;
  };

  it('offers light, dark and following the phone', async () => {
    const tree = await openSettings();
    expect(findButton(tree, 'Light')).toBeDefined();
    expect(findButton(tree, 'Dark')).toBeDefined();
    expect(findButton(tree, 'System')).toBeDefined();
    act(() => tree.unmount());
  });

  it('reports a choice rather than keeping it', async () => {
    const tree = await openSettings();
    act(() => findButton(tree, 'Light')!.props.onPress());
    expect(mockApp.setAppearance).toHaveBeenCalledWith('light');
    act(() => tree.unmount());
  });

  it('marks which one is in force', async () => {
    // Three buttons that all look alike would leave the current scheme
    // guessable only by looking at the screen it is describing.
    mockApp.appearance = 'dark';
    const tree = await openSettings();
    // Button's style is a function of press state, not an array.
    expect(styleOf(tree, 'Dark').backgroundColor).not.toBe(
      styleOf(tree, 'Light').backgroundColor
    );
    expect(styleOf(tree, 'Light').backgroundColor).toBe(
      styleOf(tree, 'System').backgroundColor
    );
    act(() => tree.unmount());
  });
});

/**
 * Where somebody is, which decides whether to try them at all.
 *
 * It lived on Home's contact rows until Home became a list of channels and
 * those rows went. Moved rather than deleted: the server still composes it —
 * `ContactView` carries it untouched — and it is shown here, to contacts
 * alone, which is exactly the audience that could see it before.
 */

describe('Support', () => {
  /** Both screens fetch on mount, so every case has to let that settle. */
  async function open(element: React.ReactElement) {
    let tree!: ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(element);
    });
    return tree;
  }

  const home = () =>
    open(<HomeView {...homeNav} />);

  it('offers a way in from Home, and nothing more than that', async () => {
    const tree = await home();
    expect(findButton(tree, 'Chip in')).toBeTruthy();
    // The argument for giving belongs on the screen behind this, not on the
    // one somebody opened to reach a conversation.
    expect(textOf(tree)).not.toContain('unlocks nothing');
    act(() => tree.unmount());
  });

  it('opens the screen rather than the browser', async () => {
    const opened = jest.fn();
    const tree = await open(
      <HomeView
        {...homeNav}
        onOpenSupport={opened}
      />
    );
    act(() => findButton(tree, 'Chip in')!.props.onPress());
    expect(opened).toHaveBeenCalled();
    act(() => tree.unmount());
  });

  it('says nothing on Home when there is nowhere to give', async () => {
    mockApp.loadSupport.mockResolvedValueOnce({
      url: null as unknown as string,
      identifier: 'me@example.com',
      mine: null,
    });
    const tree = await home();
    expect(findButton(tree, 'Chip in')).toBeUndefined();
    expect(textOf(tree)).not.toContain('Support');
    act(() => tree.unmount());
  });

  it('leaves Home alone when support cannot be read at all', async () => {
    // An older server, or one that fails. Home is what somebody opened the app
    // for and must not wait on, or break with, an extra fetch.
    mockApp.loadSupport.mockRejectedValueOnce(new Error('nope'));
    const tree = await home();
    expect(findButton(tree, 'Chip in')).toBeUndefined();
    expect(textOf(tree)).toContain('Start a channel');
    act(() => tree.unmount());
  });

  it('makes the case on its own screen, and names the address', async () => {
    const tree = await open(<SupportView onBack={() => {}} />);
    const text = textOf(tree);
    expect(text).toContain('costs money every month');
    expect(text).toContain('unlocks nothing');
    // The address is the whole of how a donation finds its way back to an
    // account, so the screen has to name it.
    expect(text).toContain('me@example.com');
    expect(findButton(tree, 'Chip in')).toBeTruthy();
    act(() => tree.unmount());
  });

  it('thanks somebody who has already given, in their own currencies', async () => {
    mockApp.loadSupport.mockResolvedValueOnce({
      url: 'https://ko-fi.com/thefloor',
      identifier: 'me@example.com',
      mine: {
        count: 2,
        since: NOW,
        totals: [
          { currency: 'EUR', cents: 1000 },
          { currency: 'USD', cents: 300 },
        ],
      },
    });
    const tree = await open(<SupportView onBack={() => {}} />);
    expect(textOf(tree)).toContain('€10.00 and $3.00');
    act(() => tree.unmount());
  });

  it('says so plainly when there is nowhere to give', async () => {
    mockApp.loadSupport.mockResolvedValueOnce({
      url: null as unknown as string,
      identifier: 'me@example.com',
      mine: null,
    });
    const tree = await open(<SupportView onBack={() => {}} />);
    expect(findButton(tree, 'Chip in')).toBeUndefined();
    expect(textOf(tree)).toContain('no way to give');
    act(() => tree.unmount());
  });

  /**
   * The way in to the standings, which sits on Home directly under Chip in.
   * Absent unless the account has been granted them, and nothing anywhere
   * says so.
   */
  it('offers the Leaderboard from Home only when there is a way in', async () => {
    const tree = await home();
    expect(findButton(tree, 'Leaderboard')).toBeUndefined();
    act(() => tree.unmount());

    const opened = jest.fn();
    const granted = await open(
      <HomeView {...homeNav} onOpenLeaderboard={opened} />
    );
    const button = findButton(granted, 'Leaderboard');
    expect(button).toBeTruthy();
    act(() => button!.props.onPress());
    expect(opened).toHaveBeenCalled();
    act(() => granted.unmount());
  });

  /**
   * The two are independent: a server with nowhere to give still shows the
   * standings to an account granted them, and the section label survives for
   * it alone.
   */
  it('keeps the Leaderboard when there is nowhere to give', async () => {
    mockApp.loadSupport.mockResolvedValueOnce({
      url: null as unknown as string,
      identifier: 'me@example.com',
      mine: null,
    });
    const tree = await open(
      <HomeView {...homeNav} onOpenLeaderboard={() => {}} />
    );
    expect(findButton(tree, 'Chip in')).toBeUndefined();
    expect(findButton(tree, 'Leaderboard')).toBeTruthy();
    act(() => tree.unmount());
  });

  it('says nothing about the standings on the Support screen', async () => {
    const tree = await open(<SupportView onBack={() => {}} />);
    expect(findButton(tree, 'Leaderboard')).toBeUndefined();
    expect(findButton(tree, 'Invitations')).toBeUndefined();
    act(() => tree.unmount());
  });
});

/**
 * The one screen that shows people who never agreed to be shown to you. There
 * is no way to ask for it and no setting that turns it on, so what this covers
 * is that it renders what it is given and says what the number means.
 */

describe('the invitation standings', () => {
  /** Renders and waits for the fetch, which lands in a microtask. */
  async function open(element: React.ReactElement) {
    let tree!: ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(element);
    });
    return tree;
  }

  it('lists people in order, with what the number counts', async () => {
    const tree = await open(<LeaderboardView onBack={() => {}} />);

    const text = textOf(tree);
    expect(text).toContain('Ada');
    expect(text).toContain('Grace');
    expect(text.indexOf('Ada')).toBeLessThan(text.indexOf('Grace'));
    // Said once, because a reader will otherwise take it for invitations sent.
    expect(text).toContain('all the way down');
    act(() => tree.unmount());
  });

  it('says so plainly when nobody has invited anybody', async () => {
    mockApp.loadLeaderboard.mockResolvedValueOnce([]);
    const tree = await open(<LeaderboardView onBack={() => {}} />);
    expect(textOf(tree)).toContain('Nobody has brought anybody here yet');
    act(() => tree.unmount());
  });

  it('shows the refusal rather than an empty board', async () => {
    // A client that asked without the grant, or an older server. Either way
    // an empty list would be a claim, and this is not one.
    mockApp.loadLeaderboard.mockRejectedValueOnce(new Error('Not found.'));
    const tree = await open(<LeaderboardView onBack={() => {}} />);
    expect(textOf(tree)).toContain('Not found.');
    act(() => tree.unmount());
  });
});
