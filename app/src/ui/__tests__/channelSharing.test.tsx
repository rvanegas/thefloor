import React from 'react';
import renderer, {
  act,
  type ReactTestInstance,
  type ReactTestRenderer,
} from 'react-test-renderer';
import { reduce } from '../../../../core/channel';
import { MAX_CLIP_LENGTH } from '../../../../core/constants';
import { type ChannelState } from '../../../../core/types';
import { ChannelView } from '../ChannelView';
import { WatchPlayer } from '../../watch/WatchPlayer';
import { Share, TextInput } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import {
  AUDIO,
  ME,
  NOW,
  THEM,
  channelOf,
  chosen,
  findButton,
  findChoice,
  findTab,
  labelOf,
  mockApp,
  render,
  resetHarness,
  showChannel,
  showNotepad,
  showRecordings,
  showWatch,
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
 * The three things a channel carries besides audio: a watch link somebody
 * else is following, the one-slot clipboard, and the diagnostic panel.
 * Together rather than with the roster because each is gated — on a link, on
 * being in the room, and on `debug`.
 *
 * Split out of `views.test.tsx` on 2026-09-04, which was 8,495 lines and 343
 * tests by then; the fixtures every one of these files shares are in
 * `testing/harness`.
 */

/**
 * A button by its exact `accessibilityLabel`, which the diagnostic rows need
 * and `findButton` cannot give them: that one matches on a substring of the
 * visible text, and every row here is a glyph whose only name is the label.
 * `· engineAvailability` is also a prefix of nothing and a substring of
 * everything its own panel draws.
 */
const button = (tree: ReactTestRenderer, label: string) =>
  tree.root
    .findAll((n) => n.props?.accessibilityRole === 'button')
    .find((n) => n.props?.accessibilityLabel === label);

beforeEach(resetHarness);

describe('Channel, watching together', () => {
  const URL = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';

  function watching(mutate: (s: ChannelState) => ChannelState = (s) => s) {
    return channelOf((s) =>
      mutate(
        reduce(
          s,
          { type: 'START_WATCH', userId: ME, videoId: 'dQw4w9WgXcQ', url: URL },
          NOW
        )
      )
    );
  }

  /** The same party, running — which is when a screen is evidence of anybody. */
  function playing(mutate: (s: ChannelState) => ChannelState = (s) => s) {
    return watching((s) =>
      mutate(reduce(s, { type: 'WATCH_PLAY', userId: ME }, NOW))
    );
  }

  /**
   * The screen, on the tab the watch card lives on.
   *
   * The card is one tap from the roster since the channel screen became six
   * tabs, and the tap is here rather than in every test because it is not
   * what any of them is about. `showWatch` throws when the tab is missing,
   * which is what keeps a test from quietly going on to assert against the
   * roster instead.
   */
  function open() {
    const tree = openOnMembers();
    showWatch(tree);
    return tree;
  }

  /**
   * The screen left where it opens, for the three tests whose subject is not
   * the card: the party-muted line, which is a claim about the roster, and
   * the gate, which is about the tab not being offered at all.
   */
  function openOnMembers() {
    return render(<ChannelView
        channelId="sess_1"
        audio={AUDIO}
        onClose={() => {}}
        onExit={() => {}}
      />);
  }

  /**
   * Labs off throughout, the watch party having left it on 2026-09-18: what
   * these tests are about is the card, and it is everybody's card now.
   */
  beforeEach(() => {
    mockApp.labs = false;
  });

  /** The link field, which is the only TextInput in the empty card. */
  function pasteLink(tree: ReactTestRenderer, text: string) {
    const field = tree.root
      .findAll((node) => node.type === TextInput)
      .find((n) => n.props.placeholder === 'Paste a YouTube link');
    act(() => field!.props.onChangeText(text));
  }

  it('will not start on something that is not a YouTube link', () => {
    showChannel(channelOf());
    const tree = open();
    expect(
      findButton(tree, 'Watch something together')!.props.disabled
    ).toBe(true);

    pasteLink(tree, 'https://vimeo.com/123456');
    expect(
      findButton(tree, 'Watch something together')!.props.disabled
    ).toBe(true);
    act(() => tree.unmount());
  });

  it('lights up on one, and sends the link as typed', () => {
    showChannel(channelOf());
    const tree = open();
    pasteLink(tree, URL);

    const start = findButton(tree, 'Watch something together')!;
    expect(start.props.disabled).toBe(false);
    act(() => start.props.onPress());
    expect(mockApp.act).toHaveBeenCalledWith('sess_1', {
      type: 'START_WATCH',
      url: URL,
    });
    act(() => tree.unmount());
  });

  it('shows the transport once a party is loaded', () => {
    /*
      **One transport with two surfaces.** The film's own bar reaches the same
      three actions these buttons do, and both are live — what was wrong
      before was not that there were two sets but that one of them did not
      work. These matter most on a device that is *not* showing the film,
      which has no bar to reach for and is most of a party most of the time.
      See planning/decisions/2026-09-18-the-bar-is-the-transport.md.
    */
    showChannel(watching());
    const tree = open();
    expect(findButton(tree, 'Play')).toBeDefined();
    expect(findButton(tree, '−15s')).toBeDefined();
    expect(findButton(tree, '+15s')).toBeDefined();
    expect(findButton(tree, 'Stop')).toBeDefined();
    act(() => tree.unmount());
  });

  it('leaves the transport live on the device that is not showing the film', () => {
    /*
      **The surface with no bar to reach for.** The film's own controls are on
      the picture, so a device watching from the other side of the switch has
      only this row — and it is the common case, a *screen* being one device
      per person. `canControlWatch` asks about the account rather than about
      this instance, so a phone that handed the picture to the laptop is still
      in the room and still drives it.
    */
    mockApp.screensElsewhere = ['sess_1'];
    showChannel(watching());
    const tree = open();
    expect(chosen(tree, 'Other device')).toBe(true);
    expect(findButton(tree, 'Play')!.props.disabled).toBe(false);
    expect(findButton(tree, '−15s')!.props.disabled).toBe(false);
    expect(findButton(tree, '+15s')!.props.disabled).toBe(false);
    act(() => findButton(tree, 'Play')!.props.onPress());
    expect(mockApp.act).toHaveBeenCalledWith('sess_1', { type: 'WATCH_PLAY' });
    act(() => tree.unmount());
  });

  it('seeks to where the progress bar is tapped', () => {
    /*
      **Where dragging YouTube's bar went.** The picture's own controls are
      off since 2026-09-18, so ±15s would otherwise be the only way to cross
      a two-hour film. The tap lands where it is put, in the one place that
      was already drawing where everybody is.
    */
    showChannel(
      watching((s) =>
        reduce(s, { type: 'WATCH_READY', userId: ME, durationMs: 600_000 }, NOW)
      )
    );
    const tree = open();
    const track = tree.root
      .findAll((n) => n.props?.accessibilityLabel === 'Seek')
      .at(0);
    expect(track).toBeDefined();

    act(() => track!.props.onLayout({ nativeEvent: { layout: { width: 200 } } }));
    act(() => track!.props.onPress({ nativeEvent: { locationX: 50 } }));

    // A quarter of the way along a ten-minute film.
    expect(mockApp.act).toHaveBeenCalledWith('sess_1', {
      type: 'WATCH_SEEK',
      positionMs: 150_000,
    });
    act(() => tree.unmount());
  });

  it('says how far in everybody is before any screen has said how long it is', () => {
    showChannel(watching());
    const tree = open();
    // A progress bar would have to invent a denominator. Nothing here ever
    // asks YouTube anything, so until a follower reports one there is only the
    // elapsed figure to show.
    expect(textOf(tree)).toContain('in');
    act(() => tree.unmount());
  });

  it('is not touched by a claim, because no claim can be made', () => {
    // **A film refuses the floor outright** — see `watchPartyIsOn`. It used
    // to be that a claim greyed a video's controls for everybody else, which
    // on a bar that is inside the picture meant a visible control that did
    // nothing.
    showChannel(
      watching((s) => reduce(s, { type: 'CLAIM_FLOOR', userId: THEM }, NOW))
    );
    const tree = open();
    expect(findButton(tree, 'Stop')!.props.disabled).toBe(false);
    expect(textOf(tree)).not.toContain('Dana Chu has the floor');
    act(() => tree.unmount());
  });

  it('leaves where you watch alone while somebody else holds the floor', () => {
    // Choosing a screen of your own is not changing what the channel is doing,
    // so the floor has no business governing it. A claim decides what plays;
    // it does not decide which of your devices shows it.
    showChannel(
      watching((s) => reduce(s, { type: 'CLAIM_FLOOR', userId: THEM }, NOW))
    );
    const tree = open();
    expect(findChoice(tree, 'This device')!.props.disabled).toBeFalsy();
    expect(findChoice(tree, 'Other device')!.props.disabled).toBeFalsy();
    act(() => tree.unmount());
  });

  /**
   * Somebody looking at a conversation they are not in. The whole card greys,
   * the second screen included — that being the control this rule was reported
   * about, and the one that used to be wired to nothing but `linking`.
   */
  it('refuses the whole card to somebody outside an occupied channel', () => {
    showChannel(watching((s) => reduce(s, { type: 'STEP_OUT', userId: ME }, NOW)));
    const tree = open();
    expect(findButton(tree, 'Stop')!.props.disabled).toBe(true);
    expect(findButton(tree, 'Change video')!.props.disabled).toBe(true);
    expect(textOf(tree)).toContain('Step in to start a watch party');
    act(() => tree.unmount());
  });

  /**
   * The same person on an *empty* channel, where the two halves of the rule
   * come apart: what is already on is theirs to drive, and putting something
   * else on is not. Two live controls beside two greyed ones is exactly the
   * arrangement that reads as a bug, so the card says which is which.
   */
  it('lets somebody outside an empty channel stop what is on, not change it', () => {
    showChannel(
      watching((s) =>
        reduce(
          reduce(s, { type: 'STEP_OUT', userId: THEM }, NOW),
          { type: 'STEP_OUT', userId: ME },
          NOW
        )
      )
    );
    const tree = open();
    expect(findButton(tree, 'Stop')!.props.disabled).toBe(false);
    expect(findButton(tree, 'Change video')!.props.disabled).toBe(true);
    expect(textOf(tree)).toContain('Step in to put something else on');
    act(() => tree.unmount());
  });

  it('greys Record while a party runs, and gives no reason for it', () => {
    showChannel(watching());
    // On *Recordings*, which is where recording is. The reason used to travel
    // with the button, the party being a tab away; it left on 2026-09-13 with
    // the rest of the prose under the transport, which is now failure and
    // nothing else. What survives is the refusal itself, and the word under
    // the glyph saying what is being refused.
    const tree = openOnMembers();
    showRecordings(tree);
    expect(findButton(tree, 'Record')!.props.disabled).toBe(true);
    expect(textOf(tree)).not.toContain('Stop the watch party to record');
    act(() => tree.unmount());
  });

  it('refuses a party with the reason while a recording runs', () => {
    showChannel(
      channelOf((s) =>
        reduce(s, { type: 'START_RECORDING', userId: ME, runId: 'run1' }, NOW)
      )
    );
    const tree = open();
    expect(textOf(tree)).toContain('Stop the recording first');
    act(() => tree.unmount());
  });

  it('asks what this account has signed in, on the way to another device', () => {
    showChannel(watching());
    const tree = open();
    act(() => findChoice(tree, 'Other device')!.props.onPress());
    // Asked at the moment of the tap rather than watched: a list that
    // refreshed itself would be a list that changed under a finger.
    expect(mockApp.listScreens).toHaveBeenCalled();
    act(() => tree.unmount());
  });

  it('says plainly when there is no other device to watch on', () => {
    showChannel(watching());
    const tree = open();
    act(() => findChoice(tree, 'Other device')!.props.onPress());
    expect(textOf(tree)).toContain('No other device is signed in');
    // And the banner is the whole answer: no link is offered, because the one
    // that would help is a full session credential. See planning/WATCH-IN-APP.md.
    expect(mockApp.useScreen).not.toHaveBeenCalled();
    act(() => tree.unmount());
  });

  it('takes the only other device without offering it as a choice', () => {
    mockApp.screens = [
      { device: 'dev-me', name: 'iPhone 15 Pro', client: 'native', self: true, watching: false },
      { device: 'dev-laptop', name: 'Chrome on macOS', client: 'web', self: false, watching: false },
    ];
    showChannel(watching());
    const tree = open();
    act(() => findChoice(tree, 'Other device')!.props.onPress());
    expect(mockApp.useScreen).toHaveBeenCalledWith('sess_1', 'dev-laptop');
    /*
      **And does not stop showing it here**, which reversed on 2026-09-18.
      `screens.use` only *asks*: the film moves when the target declares
      itself the screen, and the server then takes it off every other
      instance including this one. Clearing eagerly was the app
      second-guessing that, and it opened a window with the film on nothing —
      cleared here and never picked up there if the target was slow,
      backgrounded, or no longer had the channel open.
    */
    expect(mockApp.showScreenFor).not.toHaveBeenCalledWith(null);
    act(() => tree.unmount());
  });

  it('keeps the film where it is when there is nowhere to hand it', () => {
    // Cleared on the hand-over rather than on the press, because a press may
    // find nowhere to go: an account with one device gets the banner and
    // keeps its film, where an eager clear would take it away and offer
    // nothing in its place.
    showChannel(watching());
    const tree = open();
    act(() => findChoice(tree, 'Other device')!.props.onPress());
    expect(textOf(tree)).toContain('No other device is signed in');
    // Not *cleared*. Asking to be the screen is what a loaded party does by
    // default now, so the assertion is about the hand-over and not about
    // every call.
    expect(mockApp.showScreenFor).not.toHaveBeenCalledWith(null);
    act(() => tree.unmount());
  });

  it('offers the list once there is more than one to choose between', () => {
    mockApp.screens = [
      { device: 'dev-me', name: 'iPhone 15 Pro', client: 'native', self: true, watching: false },
      { device: 'dev-laptop', name: 'Chrome on macOS', client: 'web', self: false, watching: false },
      { device: 'dev-pad', name: null, client: 'native', self: false, watching: false },
    ];
    showChannel(watching());
    const tree = open();
    act(() => findChoice(tree, 'Other device')!.props.onPress());
    expect(findButton(tree, 'Chrome on macOS')).toBeDefined();
    // A device that gave no name is described by its kind rather than by an
    // invented name, which in a list of real ones would be worse than a gap.
    expect(findButton(tree, 'Another phone')).toBeDefined();
    act(() => findButton(tree, 'Chrome on macOS')!.props.onPress());
    expect(mockApp.useScreen).toHaveBeenCalledWith('sess_1', 'dev-laptop');
    // Asked for, not taken away: the film moves when the laptop declares,
    // and the server is what takes it off this device. See `handOver`.
    expect(mockApp.showScreenFor).not.toHaveBeenCalledWith(null);
    act(() => tree.unmount());
  });

  it('reports attention while it is showing a film', () => {
    // **Otherwise watching a film is how you get stepped out of the room you
    // are watching it in.** A browser's attention clock counts a hand on the
    // page, and somebody watching a video produces none for two hours — a
    // cross-origin iframe swallows even the clicks they do make. Fifteen
    // minutes in, the tab would step them out of the channel the party is
    // running in.
    mockApp.screenFor = 'sess_1';
    showChannel(playing());
    const tree = open();
    // Without an argument, which is what distinguishes it from the forced
    // report the channel screen makes as it opens: this one is the periodic
    // evidence, and it is rate limited by `shouldReport` rather than by us.
    expect(mockApp.reportAttentive).toHaveBeenCalledWith();
    act(() => tree.unmount());
  });

  it('says nothing about attention while the film is paused', () => {
    // Evidence rather than an exemption: a paused film is a tab that may
    // genuinely have been abandoned, which is the ghost the clock is hunting.
    mockApp.screenFor = 'sess_1';
    showChannel(watching());
    const tree = open();
    // Opening the screen reports once and forces it — that is somebody's hand
    // arriving, and it is not this. What must not happen is the periodic
    // report, which is the claim that a film is running.
    expect(mockApp.reportAttentive).not.toHaveBeenCalledWith();
    act(() => tree.unmount());
  });

  it('shows the film here, and tells the room, when this device is the screen', () => {
    mockApp.screenFor = 'sess_1';
    showChannel(watching());
    const tree = open();
    expect(chosen(tree, 'This device')).toBe(true);
    // The room is told, because a screen and a microphone on one device is
    // what decides whether the next run's mute can be lifted.
    expect(mockApp.act).toHaveBeenCalledWith('sess_1', {
      type: 'WATCH_HERE',
      watching: true,
    });
    act(() => tree.unmount());
  });

  it('says nothing about the room from a device that is not in it', () => {
    /*
      **The second screen, which used to unsay what the first one said.**

      `watchingHere` is a list of people and *this device is the screen* is a
      fact about an instance, so a laptop merely holding the channel open read
      the phone's answer as its own and disagreed with it. Each report pushed a
      snapshot that made the other device wrong again; the flag flipped between
      them for as long as both screens were up, and `isScreening` reads it — so
      the phone's microphone opened and closed under a film that was playing on
      it. The picture stuttered until the laptop was closed.

      The room is present, the party is running, and somebody is watching it on
      the device they are in it on. All of that is the other device's business.
    */
    showChannel(playing((s) => reduce(s, { type: 'WATCH_HERE', userId: ME, watching: true }, NOW)));
    mockApp.standingIn = null;
    mockApp.screenFor = null;
    const tree = open();
    expect(mockApp.act).not.toHaveBeenCalledWith('sess_1', {
      type: 'WATCH_HERE',
      watching: false,
    });
    act(() => tree.unmount());
  });

  /*
    **Full screen, and the four ways back out of it.**

    The picture fills the device because this application makes it fill the
    device: YouTube's own bar went on 2026-09-18 and took its full-screen
    button with it, and nothing inside the player gives one back. What that
    buys is a state whose only exits are the ones written here — so the two a
    person presses are asserted in watch/__tests__/fullScreen.test.tsx, and the
    ones nobody presses are asserted below, each being a way for the film to
    leave the screen without the person who expanded it doing anything.
  */
  describe('Full screen', () => {
    /** Expanded, from the card, on the device showing the film. */
    function expand() {
      mockApp.screenFor = 'sess_1';
      showChannel(watching());
      const tree = open();
      act(() => findButton(tree, 'Full screen')!.props.onPress());
      return tree;
    }

    /** What the card has and the expanded picture does not. */
    const onTheCard = (tree: ReactTestRenderer) =>
      findButton(tree, 'Change video') !== undefined;

    it('is offered on the device showing the film and on no other', () => {
      // A phone that handed the picture to the laptop still drives the party
      // — that is what the transport is for — but it has no picture, and a
      // control that filled its screen with black would be offering the film
      // to whoever has the least reason to want it.
      showChannel(watching());
      const away = open();
      expect(findButton(away, '−15s')).toBeDefined();
      expect(findButton(away, 'Full screen')).toBeUndefined();
      act(() => away.unmount());

      mockApp.screenFor = 'sess_1';
      showChannel(watching());
      const here = open();
      expect(findButton(here, 'Full screen')).toBeDefined();
      act(() => here.unmount());
    });

    it('takes the transport with it, and leaves the card behind', () => {
      const tree = expand();
      // One row drawn in two places rather than two rows: the seek and the
      // three buttons are the same element the card had.
      expect(findButton(tree, '−15s')).toBeDefined();
      expect(findButton(tree, 'Play')).toBeDefined();
      expect(findButton(tree, 'Exit full screen')).toBeDefined();
      // And everything that is about arranging a party rather than watching
      // one is not on the screen at all.
      expect(onTheCard(tree)).toBe(false);
      act(() => tree.unmount());
    });

    it('collapses when the party stops under it', () => {
      // Otherwise Stop, pressed on somebody else's phone, leaves this one
      // holding a black rectangle and two controls that do nothing.
      const tree = expand();
      showChannel(channelOf());
      act(() =>
        tree.update(<ChannelView
            channelId="sess_1"
            audio={AUDIO}
            onClose={() => {}}
            onExit={() => {}}
          />)
      );
      expect(findButton(tree, 'Exit full screen')).toBeUndefined();
      act(() => tree.unmount());
    });

    it('collapses when the film moves to another device', () => {
      // The same rectangle, arrived at from the other direction: the picture
      // is on the laptop now, and what is expanded here is nothing.
      const tree = expand();
      mockApp.screenFor = null;
      showChannel(watching());
      act(() =>
        tree.update(<ChannelView
            channelId="sess_1"
            audio={AUDIO}
            onClose={() => {}}
            onExit={() => {}}
          />)
      );
      expect(findButton(tree, 'Exit full screen')).toBeUndefined();
      expect(onTheCard(tree)).toBe(true);
      act(() => tree.unmount());
    });

    it('collapses when YouTube refuses the film', () => {
      /*
        A refusal is YouTube's own message in the middle of the frame, with
        the way out it offers — and edge to edge, with the rest of the channel
        gone, it is an explanation nobody can act on. On the card it has the
        channel around it: the link, Change video, and Stop.
      */
      const tree = expand();
      const player = tree.root.findAll((n) => n.type === WatchPlayer)[0]!;
      act(() => player.props.onRefusal('This video is gone — deleted, or private.'));
      expect(findButton(tree, 'Exit full screen')).toBeUndefined();
      expect(onTheCard(tree)).toBe(true);
      act(() => tree.unmount());
    });
  });

  it('starts muted, which is what makes the default safe', () => {
    // Muted *and* paused, so a fresh party asserts nothing until Play — and
    // the first thing the default can do is the thing it is for. The headphone
    // advice that used to be tested here is gone: the leak it warned about is
    // prevented now rather than advised against.
    showChannel(watching());
    const tree = open();
    expect(findButton(tree, 'Unmute the room')).toBeDefined();
    expect(textOf(tree)).not.toContain('Headphones');
    // Paused, so nothing is actually withheld yet.
    expect(textOf(tree)).not.toContain('Party-muted');
    act(() => tree.unmount());
  });

  it('says so when somebody has unmuted against the default', () => {
    showChannel(
      watching((s) =>
        reduce(s, { type: 'SET_WATCH_MUTE', userId: ME, muted: false }, NOW)
      )
    );
    const tree = open();
    expect(textOf(tree)).toContain('The room is unmuted');
    expect(findButton(tree, 'Mute the room')).toBeDefined();
    act(() => tree.unmount());
  });

  it('does not ask for headphones before there is anything to watch', () => {
    // Advice about a sound nothing is making yet is noise on an empty card.
    showChannel(channelOf());
    const tree = open();
    expect(textOf(tree)).not.toContain('Headphones on the screen end');
    act(() => tree.unmount());
  });

  /** Muted *and* playing, which is the only combination that withholds. */
  const muted = () =>
    watching((s) =>
      reduce(
        reduce(s, { type: 'SET_WATCH_MUTE', userId: ME, muted: true }, NOW),
        { type: 'WATCH_PLAY', userId: ME },
        NOW
      )
    );

  /** Muted, but paused — so everybody has their voice back. */
  const mutedAndPaused = () =>
    watching((s) => reduce(s, { type: 'SET_WATCH_MUTE', userId: ME, muted: true }, NOW));

  it('offers to mute the room again once it has been unmuted', () => {
    showChannel(
      watching((s) =>
        reduce(s, { type: 'SET_WATCH_MUTE', userId: ME, muted: false }, NOW)
      )
    );
    const tree = open();
    const button = findButton(tree, 'Mute the room')!;
    expect(button).toBeDefined();
    act(() => button.props.onPress());
    expect(mockApp.act).toHaveBeenCalledWith('sess_1', {
      type: 'SET_WATCH_MUTE',
      muted: true,
    });
    act(() => tree.unmount());
  });

  it('offers to clear it, and says the self-mute is untouched', () => {
    showChannel(muted());
    const tree = open();
    const button = findButton(tree, 'Unmute the room')!;
    expect(labelOf(button)).toContain('your own mute is unchanged');
    act(() => button.props.onPress());
    expect(mockApp.act).toHaveBeenCalledWith('sess_1', {
      type: 'SET_WATCH_MUTE',
      muted: false,
    });
    act(() => tree.unmount());
  });

  it('says it once under the roster, not on every card', () => {
    // One fact about the room rather than six about six people. Six badges
    // would also imply each person had been muted individually, which is the
    // one thing this deliberately does not do.
    showChannel(muted());
    // On the roster, which is the tab it is a claim about: those people cannot
    // be heard right now. It is not on the watch tab at all, where the control
    // is — the same separation the card and the roster had when both were on
    // one scroll.
    const tree = openOnMembers();
    const text = textOf(tree);
    expect(text).toContain('Party-muted');
    expect(text.match(/Party-muted/g)).toHaveLength(1);
    act(() => tree.unmount());
  });

  it('says nothing about party-muting when the room is not muted', () => {
    showChannel(watching());
    const tree = openOnMembers();
    expect(textOf(tree)).not.toContain('Party-muted');
    act(() => tree.unmount());
  });

  it('drops the headphone advice while the room is muted', () => {
    // The mute is the stronger remedy for the same problem, so the advice is
    // not true while it holds — and two warnings about one thing is one too
    // many. What replaces it says why the room has gone quiet.
    showChannel(muted());
    const tree = open();
    const text = textOf(tree);
    expect(text).not.toContain('Headphones on the screen end');
    expect(text).toContain('The room is muted');
    act(() => tree.unmount());
  });

  it('says the room can talk while the video is paused', () => {
    // The mute holds only while the video plays, so a paused party is a room
    // with its voice back — and the silence returning on the next tap of Play
    // is the surprise worth heading off.
    showChannel(mutedAndPaused());
    const tree = open();
    const text = textOf(tree);
    expect(text).not.toContain('Party-muted');
    expect(text).toContain('Paused, so you can talk');
    expect(text).toContain('quiet again when the video resumes');
    act(() => tree.unmount());
  });

  it('keeps the toggle on the intent, not on what the transport is doing', () => {
    // A button that flipped itself back to "Mute the room" at every pause
    // would be a control fighting its owner.
    showChannel(mutedAndPaused());
    const tree = open();
    expect(findButton(tree, 'Unmute the room')).toBeDefined();
    expect(findButton(tree, 'Mute the room')).toBeUndefined();
    act(() => tree.unmount());
  });

  it('copies the video link, which is the public one', async () => {
    (Clipboard.setStringAsync as jest.Mock).mockImplementation(async () => true);
    showChannel(watching());
    const tree = open();
    await act(async () => findButton(tree, 'Copy video link')!.props.onPress());

    expect(Clipboard.setStringAsync).toHaveBeenCalledWith(URL);
    expect(textOf(tree)).toContain('✓ copied');
    act(() => tree.unmount());
  });

  it('says so when the clipboard declines, rather than claiming a copy', async () => {
    // `copyText` returns whether it landed precisely so that a refusal is not
    // announced as a success — discovered otherwise at the paste, by somebody
    // who has already moved on.
    (Clipboard.setStringAsync as jest.Mock).mockImplementation(async () => false);
    showChannel(watching());
    const tree = open();
    await act(async () => findButton(tree, 'Copy video link')!.props.onPress());

    expect(textOf(tree)).toContain('✗ copy failed');
    act(() => tree.unmount());
  });

  it('leaves the screen buttons alone when the link is copied', async () => {
    (Clipboard.setStringAsync as jest.Mock).mockImplementation(async () => true);
    showChannel(watching());
    const tree = open();
    await act(async () => findButton(tree, 'Copy video link')!.props.onPress());

    // The copied state belongs to one button. The switch that decides where
    // the film is shown is a different question and must go on offering both
    // of its answers.
    expect(findChoice(tree, 'This device')).toBeDefined();
    expect(findChoice(tree, 'Other device')).toBeDefined();
    act(() => tree.unmount());
  });

  it('leaves the mute to anybody in the room, no claim being possible', () => {
    showChannel(
      watching((s) => reduce(s, { type: 'CLAIM_FLOOR', userId: THEM }, NOW))
    );
    const tree = open();
    // "Unmute", the party having started muted — the label follows the intent.
    expect(findButton(tree, 'Unmute the room')!.props.disabled).toBe(false);
    act(() => tree.unmount());
  });

  it('swaps the video without stopping the party first', () => {
    showChannel(watching());
    const tree = open();
    act(() => findButton(tree, 'Change video')!.props.onPress());

    const field = tree.root
      .findAll((node) => node.type === TextInput)
      .find((n) => n.props.placeholder === 'Paste a YouTube link');
    act(() => field!.props.onChangeText('https://youtu.be/abcdefghijk'));
    act(() => findButton(tree, 'Watch this instead')!.props.onPress());

    // START_WATCH replaces a party in place, so the followers never see
    // "Nothing is playing" between one video and the next.
    expect(mockApp.act).toHaveBeenCalledWith('sess_1', {
      type: 'START_WATCH',
      url: 'https://youtu.be/abcdefghijk',
    });
    expect(mockApp.act).not.toHaveBeenCalledWith('sess_1', { type: 'STOP_WATCH' });
    act(() => tree.unmount());
  });

  it('lets the swap be abandoned without changing anything', () => {
    showChannel(watching());
    const tree = open();
    act(() => findButton(tree, 'Change video')!.props.onPress());
    act(() => findButton(tree, 'Cancel')!.props.onPress());

    expect(findButton(tree, 'Change video')).toBeDefined();
    expect(mockApp.act).not.toHaveBeenCalled();
    act(() => tree.unmount());
  });

  it('asks nothing about screens before there is a film to show', () => {
    // The choice belongs to a film: it is cleared when one ends and asked
    // again for the next, so an idle card has nothing to ask.
    showChannel(channelOf());
    const tree = open();
    expect(findChoice(tree, 'This device')).toBeUndefined();
    expect(findChoice(tree, 'Other device')).toBeUndefined();
    act(() => tree.unmount());
  });
  /**
   * Where the gate used to be. There is no account this is hidden from any
   * more: the tab is on the bar and the card behind it offers starting one,
   * with Labs off. See `labs` in core/settings.ts.
   */
  it('is on the screen without Labs', () => {
    mockApp.labs = false;
    showChannel(channelOf());
    const tree = openOnMembers();
    expect(findTab(tree, 'Watch')).toBeDefined();
    act(() => tree.unmount());

    const card = open();
    expect(textOf(card)).toContain('Watch together');
    act(() => card.unmount());
  });

  /**
   * And a party already running, which was the exception that kept the gate
   * honest and is now just the ordinary case. A party is channel state:
   * somebody else in this channel has one running, this person's own player is
   * being driven by it, and the recording controls are refusing them because
   * of it.
   */
  it('shows a party already running', () => {
    showChannel(watching());
    const tree = open();
    // The controls a loaded party has and an empty card does not. The URL
    // was the evidence here until it stopped being drawn — see the card,
    // which says why a link is not what tells you a film is on.
    expect(findButton(tree, 'Change video')).toBeDefined();
    expect(findButton(tree, 'Stop')).toBeDefined();
    act(() => tree.unmount());
  });

  /**
   * The link is on the clipboard's button and nowhere on the card.
   *
   * It was the card's heading until 2026-09-18, truncated after
   * `https://www.youtube.com/watc…` — machine text claiming to be the
   * subject of the card while naming nothing. *Copy video link* is the whole
   * of how a URL leaves this screen now, which is why this asserts the
   * button is still there: a link nobody can reach is a different change
   * from a link nobody is shown.
   */
  it('does not draw the video URL', () => {
    showChannel(watching());
    const tree = open();
    expect(textOf(tree)).not.toContain(URL);
    expect(textOf(tree)).not.toContain('youtube.com');
    expect(findButton(tree, 'Copy video link')).toBeDefined();
    act(() => tree.unmount());
  });

  /**
   * *Watch on*, which is one question with two answers and used to be two
   * buttons.
   *
   * **The labels were relative and inverted as you crossed the room** — the
   * laptop's *Watch here* and the phone's *Watch here* are opposite
   * instructions in identical words — and neither of them said what the other
   * device was doing. Both halves are asserted here: that the answers are a
   * matched pair, and that the device which hands a film away shows the choice
   * it just made rather than nothing at all.
   */
  describe('where the film is shown', () => {
    it('asks once and offers two answers', () => {
      showChannel(watching());
      const tree = open();
      expect(textOf(tree)).toContain('Watch on');
      expect(findChoice(tree, 'This device')).toBeDefined();
      expect(findChoice(tree, 'Other device')).toBeDefined();
      act(() => tree.unmount());
    });

    it('asks for this device as soon as a party is loaded, stepped in', () => {
      /*
        **There is no third answer any more.** This used to show neither
        segment chosen for a party whose film was on nothing — which in
        practice meant starting a watch party showed you no film until you
        noticed a switch you had not touched. The film now comes up on the
        device you are in the room on, so the answer is a fact rather than a
        claim, and the switch is how you move it rather than how you turn it
        on. What it renders once the role lands is the test below.
      */
      showChannel(watching());
      const tree = open();
      expect(mockApp.showScreenFor).toHaveBeenCalledWith('sess_1');
      act(() => tree.unmount());
    });

    it('asks for nothing while stepped out, and says other device', () => {
      /*
        **The other half of the rule**: *this device* is the default in the
        room and *other device* is the default outside it. Somebody reading a
        channel they have stepped out of has not asked to watch anything, and
        a film starting on its own in front of them — with its sound — is the
        thing this must not do.
      */
      showChannel(watching((s) => reduce(s, { type: 'STEP_OUT', userId: ME }, NOW)));
      const tree = open();
      expect(mockApp.showScreenFor).not.toHaveBeenCalledWith('sess_1');
      expect(chosen(tree, 'Other device')).toBe(true);
      expect(chosen(tree, 'This device')).toBe(false);
      act(() => tree.unmount());
    });

    it('does not ask when another of my devices already has it', () => {
      // **What stops two of somebody's own instances fighting.** The server
      // takes the film off every other instance the moment one declares, so
      // a phone and a laptop that both asked would evict each other for ever.
      mockApp.screensElsewhere = ['sess_1'];
      showChannel(watching());
      const tree = open();
      expect(mockApp.showScreenFor).not.toHaveBeenCalledWith('sess_1');
      act(() => tree.unmount());
    });

    it('mirrors the choice on the device that handed the film away', () => {
      // **The half that needed a new fact.** This phone is not the screen and
      // never will be for this film; what it knows is that another of its own
      // instances is showing this channel, which the server pushes — see
      // `screensElsewhere`. Without it the phone shows no selection at all and
      // the choice it just made looks as though it never landed.
      mockApp.screensElsewhere = ['sess_1'];
      showChannel(watching());
      const tree = open();
      expect(chosen(tree, 'Other device')).toBe(true);
      expect(chosen(tree, 'This device')).toBe(false);
      act(() => tree.unmount());
    });

    it('is about this channel and not about any film of yours', () => {
      // A laptop showing something in *another* channel must not stop this
      // device taking this channel's film: reading the fact as a bare "is a
      // film on somewhere" would leave every channel after the first with no
      // screen at all. The switch itself no longer consults this — it asks
      // only whether the film is here — so the scoping now lives in the
      // default.
      mockApp.screensElsewhere = ['sess_other'];
      showChannel(watching());
      const tree = open();
      expect(mockApp.showScreenFor).toHaveBeenCalledWith('sess_1');
      act(() => tree.unmount());
    });

    it('takes this device as the answer when it is the screen', () => {
      mockApp.screenFor = 'sess_1';
      showChannel(watching());
      const tree = open();
      expect(chosen(tree, 'This device')).toBe(true);
      expect(chosen(tree, 'Other device')).toBe(false);
      act(() => tree.unmount());
    });

    it('refuses to be moved while the film is running', () => {
    // **Moving a picture between devices mid-scene is the confusing act
    // whichever way it goes**: the film leaves what you are looking at and
    // turns up on something across the room, a second later and in the
    // middle of a sentence. Pausing first makes the move deliberate, and
    // the Play/Pause control is inches above this one.
    mockApp.screenFor = 'sess_1';
    showChannel(playing());
    const tree = open();
    expect(findChoice(tree, 'This device')!.props.disabled).toBe(true);
    expect(findChoice(tree, 'Other device')!.props.disabled).toBe(true);
    // Refused rather than hidden: the answer goes on saying where the film
    // is, which is what somebody looking for the picture needs to read.
    expect(chosen(tree, 'This device')).toBe(true);
    // And a sentence beside it, as every disabled control here has.
    expect(textOf(tree)).toContain('Pause the film');
    act(() => tree.unmount());
  });

  it('can be moved again the moment it is paused', () => {
    showChannel(
      watching((s) =>
        reduce(
          reduce(s, { type: 'WATCH_PLAY', userId: ME }, NOW),
          { type: 'WATCH_PAUSE', userId: ME },
          NOW + 5_000
        )
      )
    );
    const tree = open();
    expect(findChoice(tree, 'This device')!.props.disabled).toBeFalsy();
    expect(textOf(tree)).not.toContain('Pause the film');
    act(() => tree.unmount());
  });

  it('makes this device the screen when the same answer is pressed', () => {
      showChannel(watching());
      const tree = open();
      act(() => findChoice(tree, 'This device')!.props.onPress());
      expect(mockApp.showScreenFor).toHaveBeenCalledWith('sess_1');
      act(() => tree.unmount());
    });
  });

});

describe('the channel clipboard', () => {
  /**
   * One slot, and how much of it is on screen is as much the point as what is.
   *
   * The preview shows never more than fits on one line — so a short paste
   * appears whole and a long one is truncated. The bound is the line rather
   * than any notion of withholding: it keeps the card from becoming a place
   * long things are read, a channel screen being one that gets left face-up
   * on tables. `numberOfLines={1}` is what enforces it, asserted rather than
   * assumed.
   */
  const CLIP = {
    id: 'clip_1',
    authorId: THEM,
    pastedAt: NOW - 180_000,
    kind: 'text' as const,
    text: 'https://example.com/the-thing',
  };

  function showClip(clip: Partial<typeof CLIP> = {}) {
    showChannel(channelOf((s) => ({ ...s, clip: { ...CLIP, ...clip } })));
  }

  /**
   * The screen, on *Notepad* — where the clipboard lives with the notepad
   * itself, the two of them being text the channel holds rather than a
   * control on the room. One tap from the roster, taken here rather than in
   * every test because it is not what any of them is about.
   */
  function open() {
    const tree = render(<ChannelView
        channelId="sess_1"
        audio={AUDIO}
        onClose={() => {}}
        onExit={() => {}}
      />);
    showNotepad(tree);
    return tree;
  }

  beforeEach(() => {
    (Clipboard.setStringAsync as jest.Mock).mockImplementation(async () => true);
    (Clipboard.getStringAsync as jest.Mock).mockImplementation(async () => '');
  });

  /**
   * The host Text carrying `contains`.
   *
   * Identified by its content rather than by `numberOfLines`, which the
   * channel title higher up the screen also sets — selecting on the property
   * under test found that one instead and passed for the wrong reason.
   *
   * And the content has to be the clip's own: the notepad above it on this
   * tab illustrates links with `example.com`, so a bare host now matches the
   * help text first. Whatever is passed here must be a string only the clip
   * can carry.
   */
  function textNodeWith(
    tree: ReactTestRenderer,
    contains: string
  ): ReactTestInstance | undefined {
    return tree.root
      .findAll((n) => n.type === 'Text')
      .find((n) => labelOf(n).includes(contains));
  }

  it('says who pasted, how long ago, and shows one line of what', () => {
    showClip();
    const tree = open();

    // `textOf` joins adjacent strings with a space, so the interpolated name
    // arrives with two — matched loosely rather than pinning that detail.
    expect(textOf(tree)).toMatch(/Pasted by\s+Dana Chu/);
    expect(textOf(tree)).toContain('3 minutes ago');
    expect(textOf(tree)).toContain('example.com');
    act(() => tree.unmount());
  });

  it('holds the preview to a single truncated line', () => {
    showClip();
    const tree = open();
    // The prop, not the rendered height: the test renderer lays nothing out,
    // so the truncation is only observable as the instruction to truncate.
    expect(
      textNodeWith(tree, 'example.com/the-thing')!.props.numberOfLines
    ).toBe(1);
    act(() => tree.unmount());
  });

  it('collapses whitespace so a leading newline does not preview as blank', () => {
    // `numberOfLines` counts rendered lines. Text beginning with a newline
    // would spend the only one on nothing, which reads as a failed paste.
    showClip({ text: '\n\n  first line\n  second line  ' });
    const tree = open();
    expect(labelOf(textNodeWith(tree, 'first line')!)).toBe(
      'first line second line'
    );
    act(() => tree.unmount());
  });

  it('says the clipboard is empty when nothing has been pasted', () => {
    showChannel(channelOf());
    const tree = open();

    expect(textOf(tree)).toContain('Nothing on the channel clipboard');
    act(() => tree.unmount());
  });

  it('copies the whole text, not the line that was shown', async () => {
    const long = `https://example.com/${'x'.repeat(400)}`;
    showClip({ text: long });
    const tree = open();
    await act(async () => {
      findButton(tree, 'Copy')!.props.onPress();
    });

    expect(Clipboard.setStringAsync).toHaveBeenCalledWith(long);
    expect(textOf(tree)).toContain('✓ copied');
    act(() => tree.unmount());
  });

  it('says so when the clipboard declines the copy', async () => {
    (Clipboard.setStringAsync as jest.Mock).mockImplementation(async () => false);
    showClip();
    const tree = open();
    await act(async () => {
      findButton(tree, 'Copy')!.props.onPress();
    });

    expect(textOf(tree)).toContain('✗ copy failed');
    act(() => tree.unmount());
  });

  it('offers to open what was pasted when the whole of it is a link', () => {
    showClip();
    const tree = open();
    expect(findButton(tree, 'Open')).toBeDefined();
    act(() => tree.unmount());
  });

  it('offers no such thing for text that merely contains one', () => {
    // Finding a URL inside longer text would mean guessing which of several
    // somebody meant, and guessing wrong opens the wrong page.
    showClip({ text: 'have a look at https://example.com when you can' });
    const tree = open();
    expect(findButton(tree, 'Open')).toBeUndefined();
    act(() => tree.unmount());
  });

  it('offers no such thing for a scheme the app will not hand to the OS', () => {
    showClip({ text: 'javascript:alert(1)' });
    const tree = open();
    expect(findButton(tree, 'Open')).toBeUndefined();
    act(() => tree.unmount());
  });

  it('sends what is on the device clipboard', async () => {
    (Clipboard.getStringAsync as jest.Mock).mockImplementation(
      async () => 'https://example.com/new'
    );
    showChannel(channelOf());
    const tree = open();
    await act(async () => {
      findButton(tree, 'Paste my clipboard')!.props.onPress();
    });

    expect(mockApp.act).toHaveBeenCalledWith('sess_1', {
      type: 'PASTE_CLIP',
      text: 'https://example.com/new',
    });
    act(() => tree.unmount());
  });

  it('says so rather than sending nothing when the device clipboard is empty', async () => {
    showChannel(channelOf());
    const tree = open();
    await act(async () => {
      findButton(tree, 'Paste my clipboard')!.props.onPress();
    });

    expect(mockApp.act).not.toHaveBeenCalled();
    expect(textOf(tree)).toContain('nothing on your clipboard');
    act(() => tree.unmount());
  });

  /**
   * The refusal that has to happen here or nowhere. A paste travels as a
   * socket action, which reports back only through `lastError` — rendered on
   * the auth screen and on no other. Sending it and letting the reducer
   * silently decline would look like a dead button.
   */
  it('refuses text past the cap before it is sent', async () => {
    (Clipboard.getStringAsync as jest.Mock).mockImplementation(async () =>
      'x'.repeat(MAX_CLIP_LENGTH + 1)
    );
    showChannel(channelOf());
    const tree = open();
    await act(async () => {
      findButton(tree, 'Paste my clipboard')!.props.onPress();
    });

    expect(mockApp.act).not.toHaveBeenCalled();
    expect(textOf(tree)).toContain('too long to share');
    act(() => tree.unmount());
  });

  it('will not let somebody who has stepped out paste or clear', () => {
    showChannel(
      channelOf((s) => ({
        ...reduce(s, { type: 'STEP_OUT', userId: ME }, NOW),
        clip: CLIP,
      }))
    );
    const tree = open();

    expect(findButton(tree, 'with my clipboard')!.props.disabled).toBe(true);
    expect(findButton(tree, 'Clear')!.props.disabled).toBe(true);
    // Copying out is not restricted: the content is already on this phone.
    expect(findButton(tree, 'Copy')!.props.disabled).toBeFalsy();
    act(() => tree.unmount());
  });

  it('empties the slot on Clear', () => {
    showClip();
    const tree = open();
    act(() => findButton(tree, 'Clear')!.props.onPress());

    expect(mockApp.act).toHaveBeenCalledWith('sess_1', { type: 'CLEAR_CLIP' });
    act(() => tree.unmount());
  });
});

/**
 * The watch party card.
 *
 * What is under test here is the card's judgement rather than the transport's
 * arithmetic, which is core's — whether the button lights up, whether the
 * controls grey, and whether the two things a party is exclusive with say so
 * rather than going quietly dead.
 */

describe('the audio diagnostic panel', () => {
  /**
   * The gate, which is the whole of what makes this panel permissible to ship.
   *
   * The panel it replaces went to every user because there was no way to show
   * it to one; this one is invisible to every account in the database until
   * somebody sets `accounts.debug` by hand. A regression here is not cosmetic
   * — it puts `playAndRecord/videoChat` under the mute button of a stranger.
   */
  it('is absent for an ordinary account', () => {
    showChannel(channelOf());
    const tree = render(<ChannelView
        channelId="sess_1"
        audio={AUDIO}
        onClose={() => {}}
        onExit={() => {}}
      />);
    expect(textOf(tree)).not.toContain('Audio diagnostics');
    act(() => tree.unmount());
  });

  it('is offered, collapsed, to an account with the flag', () => {
    mockApp.debug = true;
    showChannel(channelOf());
    const tree = render(<ChannelView
        channelId="sess_1"
        audio={AUDIO}
        onClose={() => {}}
        onExit={() => {}}
      />);
    expect(textOf(tree)).toContain('Audio diagnostics');
    // Collapsed: even for the one account that asked for it, the channel
    // screen is not what this is for.
    expect(textOf(tree)).not.toContain('Session — asked vs actual');
    act(() => tree.unmount());
  });

  /**
   * **The panel must take no reading until it is asked to, and this is the
   * assertion that says so.**
   *
   * It used to read on mount, through a lazy `useState` initializer, and again
   * once a second while open. Reading the audio engine is what stops it: the
   * sound cut the instant the panel was expanded, on a device, and since the
   * panel mounts with this screen, "walk to Home and come back" was a read.
   * The instrument was the fault. So what is pinned here is the absence of a
   * reading, which is a thing a test can check and a person cannot see.
   */
  it('takes no reading of its own until Read now is pressed', () => {
    mockApp.debug = true;
    showChannel(channelOf());
    const { AudioDeviceModule } = require('@livekit/react-native');
    AudioDeviceModule.isEngineRunning.mockClear();
    AudioDeviceModule.getEngineAvailability.mockClear();

    const tree = render(<ChannelView
        channelId="sess_1"
        audio={AUDIO}
        onClose={() => {}}
        onExit={() => {}}
      />);
    // Mounting the screen is the case that mattered: it is what a walk back
    // from Home does.
    expect(AudioDeviceModule.isEngineRunning).not.toHaveBeenCalled();

    const toggle = tree.root
      .findAll((n) => n.props?.accessibilityRole === 'button')
      .find((n) => n.props?.accessibilityLabel === 'Audio diagnostics');
    act(() => toggle!.props.onPress());
    // And opening it is the case that was caught by ear.
    expect(AudioDeviceModule.isEngineRunning).not.toHaveBeenCalled();
    expect(AudioDeviceModule.getEngineAvailability).not.toHaveBeenCalled();

    const text = textOf(tree);
    expect(text).toContain('nothing read yet');
    expect(text).toContain('nothing recorded yet');
    act(() => tree.unmount());
  });

  it('reads once, and only once, when Read now is pressed', () => {
    mockApp.debug = true;
    showChannel(channelOf());
    const { AudioDeviceModule } = require('@livekit/react-native');
    AudioDeviceModule.isEngineRunning.mockClear();

    const tree = render(<ChannelView
        channelId="sess_1"
        audio={AUDIO}
        onClose={() => {}}
        onExit={() => {}}
      />);
    act(() => button(tree, 'Audio diagnostics')!.props.onPress());
    act(() => button(tree, 'Read now (all nine at once)')!.props.onPress());

    // One press, one pass over the readers — not a poll that starts on the
    // first press and runs until the screen goes away.
    expect(AudioDeviceModule.isEngineRunning).toHaveBeenCalledTimes(1);

    const text = textOf(tree);
    expect(text).toContain('Session — asked vs actual');
    // Nothing native is present under jest, and the panel has to say that
    // rather than render a blank line — the failure mode five instruments fell
    // into on 2026-08-20. See src/audio/diagnostics.ts.
    expect(text).toContain('unreadable');
    act(() => tree.unmount());
  });

  /**
   * One probe is one native call. The whole harness rests on it: a button that
   * quietly took two readings would name the wrong culprit, and naming the
   * wrong culprit is how four fixes were written for one symptom in August.
   */
  it('makes exactly one native call per probe, and logs either side of it', () => {
    mockApp.debug = true;
    showChannel(channelOf());
    const { AudioDeviceModule } = require('@livekit/react-native');
    AudioDeviceModule.getEngineAvailability.mockClear();
    AudioDeviceModule.isEngineRunning.mockClear();

    const tree = render(<ChannelView
        channelId="sess_1"
        audio={AUDIO}
        onClose={() => {}}
        onExit={() => {}}
      />);
    act(() => button(tree, 'Audio diagnostics')!.props.onPress());
    act(() => button(tree, '· engineAvailability')!.props.onPress());

    expect(AudioDeviceModule.getEngineAvailability).toHaveBeenCalledTimes(1);
    expect(AudioDeviceModule.isEngineRunning).not.toHaveBeenCalled();

    const text = textOf(tree);
    expect(text).toContain('probe engineAvailability →');
    expect(text).toContain('probe engineAvailability ✓');
    // And the button says it was pressed. On a panel whose whole job is to
    // correlate a tap against a sound, a press you are unsure of is a reading
    // you cannot use — a probe that did nothing and a probe that never ran
    // look identical without this.
    expect(text).toContain('✓ · engineAvailability');
    act(() => tree.unmount());
  });
});

describe('copying the diagnostics', () => {
  /**
   * The copy button, whose failure mode is the one this panel cannot have.
   *
   * `expo-clipboard`'s `setStringAsync` resolves to a boolean, so there are
   * two distinct ways to fail — it can reject, and it can decline by resolving
   * false — and only one of them is an exception. Both are pinned, because the
   * whole diagnostic is written against instruments that go quiet: a copy that
   * appeared to work while doing nothing would send somebody away believing
   * they held a reading they did not.
   */
  function openPanel() {
    mockApp.debug = true;
    showChannel(channelOf());
    const tree = render(<ChannelView
        channelId="sess_1"
        audio={AUDIO}
        onClose={() => {}}
        onExit={() => {}}
      />);
    const toggle = tree.root
      .findAll((n) => n.props?.accessibilityRole === 'button')
      .find((n) => n.props?.accessibilityLabel === 'Audio diagnostics');
    act(() => toggle!.props.onPress());
    return tree;
  }

  function copyButton(tree: ReturnType<typeof render>) {
    return tree.root
      .findAll((n) => n.props?.accessibilityRole === 'button')
      .find((n) => n.props?.accessibilityLabel === 'Copy diagnostics');
  }

  /** The press and the promise it starts, settled. */
  async function pressCopy(tree: ReturnType<typeof render>) {
    await act(async () => {
      copyButton(tree)!.props.onPress();
    });
  }

  beforeEach(() => {
    (Clipboard.setStringAsync as jest.Mock).mockImplementation(async () => true);
  });

  it('puts the whole panel on the clipboard, alarms included', async () => {
    const tree = openPanel();
    await pressCopy(tree);

    expect(Clipboard.setStringAsync).toHaveBeenCalledTimes(1);
    const copied = (Clipboard.setStringAsync as jest.Mock).mock
      .calls[0]![0] as string;
    expect(copied).toContain('The Floor — audio diagnostics');
    expect(copied).toContain('Session — asked vs actual');
    // Nothing native under jest, so the readings are unreadable — and that has
    // to survive the copy as an alarm rather than as a blank.
    expect(copied).toContain('unreadable');
    expect(copied).toContain('<<');
    expect(textOf(tree)).toContain('copied');

    act(() => tree.unmount());
  });

  it('says so on the button when the clipboard throws', async () => {
    (Clipboard.setStringAsync as jest.Mock).mockImplementation(async () => {
      throw new Error('no clipboard on this device');
    });
    const tree = openPanel();
    await pressCopy(tree);

    expect(textOf(tree)).toContain('copy failed');
    expect(textOf(tree)).toContain('screenshot');
    act(() => tree.unmount());
  });

  /**
   * The case the deprecated core API could not express at all: it returned
   * void, so a clipboard that declined was indistinguishable from one that
   * worked. Moving to `expo-clipboard` is what made this testable, and a
   * button that ignored the boolean would have thrown the benefit away.
   */
  it('says so when the clipboard declines without throwing', async () => {
    (Clipboard.setStringAsync as jest.Mock).mockImplementation(async () => false);
    const tree = openPanel();
    await pressCopy(tree);

    expect(textOf(tree)).toContain('copy failed');
    expect(textOf(tree)).not.toContain('✓ copied');
    act(() => tree.unmount());
  });
});
