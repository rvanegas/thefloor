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
import { Screen } from '../components';
import { WholeWindowContext } from '../layout';
import { WatchPlayer } from '../../watch/WatchPlayer';
import { Share } from 'react-native';
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
 * The window, which is a fourth mock and the newest of them.
 *
 * Full screen has two ways in and the window decides which a surface gets: a
 * *handheld* turned sideways is expanded and nothing else is, so a test that
 * wants the picture either turns a phone or presses a button, and which one
 * is the point of most of what is below. The factory closes over nothing; the
 * reading is taken at render, which is why every test sets this before the
 * render or the update that should see it.
 *
 * The default is jest's own 750×1334, which is deliberately *not* handheld —
 * see `layout.test.ts` — so every other test in this file gets exactly the
 * window it got before this existed, and a test has to ask for a phone.
 */
let mockWindow = { width: 750, height: 1334, scale: 2, fontScale: 1 };
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: () => mockWindow,
}));
const PORTRAIT = { width: 750, height: 1334, scale: 2, fontScale: 1 };
/** The same window turned, which is still nobody's phone and still upright-ish. */
const PORTRAIT_TURNED = { width: 1334, height: 750, scale: 2, fontScale: 1 };
/** An iPhone 16 Pro Max held upright, which is the only shape the lock allows
    a phone away from the film. */
const PHONE = { width: 440, height: 956, scale: 3, fontScale: 1 };
/** The same phone on its side, which is the widest a phone gets and is the
    one window in this file that means *somebody turned something*. */
const LANDSCAPE = { width: 956, height: 440, scale: 3, fontScale: 1 };
/**
 * An iPad mini on its side, which is landscape and is *not* somebody turning
 * anything. The distinction this window exists to draw is the whole of the
 * 2026-09-20 fix; see `isHandheld` in `../layout`.
 */
const TABLET_LANDSCAPE = { width: 1133, height: 744, scale: 2, fontScale: 1 };
beforeEach(() => {
  mockWindow = PORTRAIT;
});

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
    const tree = openOnPeople();
    showWatch(tree);
    return tree;
  }

  /**
   * The screen left where it opens, for the three tests whose subject is not
   * the card: the party-muted line, which is a claim about the roster, and
   * the gate, which is about the tab not being offered at all.
   */
  function openOnPeople() {
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

  /**
   * What is on the device's clipboard when the button is pressed.
   *
   * There is no field to type into since 2026-09-20 — see `watchPasteError`
   * in `ChannelView` — so the fixture a watch test sets is the clipboard.
   */
  function onClipboard(text: string) {
    (Clipboard.getStringAsync as jest.Mock).mockImplementation(
      async () => text
    );
  }

  /** Presses a button and lets the clipboard read settle. */
  async function press(tree: ReactTestRenderer, label: string) {
    await act(async () => {
      findButton(tree, label)!.props.onPress();
    });
  }

  it('will not start on something that is not a YouTube link', async () => {
    showChannel(channelOf());
    const tree = open();
    onClipboard('https://vimeo.com/123456');

    // Lit, unlike the old field's button: whether the clipboard holds a link
    // is not knowable without reading it, and reading it unasked is a paste
    // notification on iOS. The refusal is in words, after the press.
    expect(
      findButton(tree, 'Watch something together')!.props.disabled
    ).toBe(false);
    await press(tree, 'Watch something together');

    expect(mockApp.act).not.toHaveBeenCalled();
    expect(textOf(tree)).toContain('That is not a YouTube link');
    act(() => tree.unmount());
  });

  it('says so when there is nothing on the clipboard at all', async () => {
    showChannel(channelOf());
    const tree = open();
    // The jest.setup default, stated here because it is the fixture: an empty
    // clipboard and an unreadable one are the same answer from `pasteText`.
    onClipboard('');
    await press(tree, 'Watch something together');

    expect(mockApp.act).not.toHaveBeenCalled();
    expect(textOf(tree)).toContain('There is nothing on your clipboard');
    act(() => tree.unmount());
  });

  it('starts on the link that is on the clipboard, trimmed', async () => {
    showChannel(channelOf());
    const tree = open();
    onClipboard(`  ${URL}\n`);
    await press(tree, 'Watch something together');

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
    // The transport too, which is the half a party makes visible: these three
    // move a film other people are looking at.
    expect(findButton(tree, 'Play')!.props.disabled).toBe(true);
    expect(findButton(tree, '−15s')!.props.disabled).toBe(true);
    expect(findButton(tree, '+15s')!.props.disabled).toBe(true);
    expect(textOf(tree)).toContain('Step in to drive the film');
    act(() => tree.unmount());
  });

  /**
   * The same person on an *empty* channel, which **stopped being the case
   * where the rule comes apart on 2026-09-20**. Stop was live here beside a
   * greyed *Change video*, on the reasoning that a film left running on a
   * channel nobody is in is tidying rather than interruption — and two live
   * controls beside two greyed ones is exactly the arrangement that reads as a
   * bug. The whole card greys now, for one sentence and one tap: an empty
   * channel is the one it costs least to step into. See `canControlWatch`.
   */
  it('greys the card for somebody outside an empty channel too', () => {
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
    expect(findButton(tree, 'Stop')!.props.disabled).toBe(true);
    expect(findButton(tree, 'Change video')!.props.disabled).toBe(true);
    expect(findButton(tree, 'Play')!.props.disabled).toBe(true);
    // One sentence rather than two, there being one rule to explain now.
    expect(textOf(tree)).toContain('Step in to drive the film');
    expect(textOf(tree)).not.toContain('you can still stop');
    act(() => tree.unmount());
  });

  it('greys Record while a party runs, and gives no reason for it', () => {
    showChannel(watching());
    // On *Recordings*, which is where recording is. The reason used to travel
    // with the button, the party being a tab away; it left on 2026-09-13 with
    // the rest of the prose under the transport, which is now failure and
    // nothing else. What survives is the refusal itself, and the word under
    // the glyph saying what is being refused.
    const tree = openOnPeople();
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

  /**
   * **What is on, in words.** The card carried a URL until 2026-09-18 and
   * nothing at all after it, on the grounds that fetching a name would be the
   * first request this application ever made to Google. The name now comes
   * from the player, which already has it — see
   * `decisions/2026-09-20-the-film-says-what-it-is-called.md`.
   */
  it('draws the film name once a player has reported one', () => {
    showChannel(
      watching((s) =>
        reduce(
          s,
          { type: 'WATCH_READY', userId: ME, durationMs: 600_000, title: 'A Film' },
          NOW
        )
      )
    );
    const tree = open();
    expect(textOf(tree)).toContain('A Film');
    act(() => tree.unmount());
  });

  it('draws no name until one has been reported', () => {
    // Every party spends its first seconds here, and a party nobody is
    // showing anywhere spends all of it here: a player is what names a film.
    showChannel(watching());
    const tree = open();
    expect(textOf(tree)).not.toContain('A Film');
    act(() => tree.unmount());
  });

  /**
   * **Who is actually watching, which is the question a host asks.** Somebody
   * who starts a film wants to know whether the room is with them, and until
   * 2026-09-20 nothing on the screen said: a participant whose app is
   * backgrounded, or who is looking at another tab, is drawn exactly like one
   * sitting in front of the picture.
   *
   * It is read off the snapshot rather than off `watchingHere`, which is the
   * microphone's list and names nobody who is watching on a *second device*.
   * See `ChannelView.watching`.
   */
  it('says on the roster who has the film up', () => {
    showChannel(playing(), [], { watching: [THEM] });
    const tree = openOnPeople();
    const text = textOf(tree);
    expect(text).toContain('Dana Chu Present  · watching');
    // Not said about somebody the server does not count, which is the whole
    // of what makes the line worth reading.
    expect(text).toContain('Me (you) Present ');
    expect(text).not.toContain('Me (you) Present  · watching');
    act(() => tree.unmount());
  });

  /**
   * The television case, and the reason this cannot be `watchingHere`: the
   * film on a laptop and the voice on a phone is one person watching, and the
   * list that decides a microphone deliberately does not name them.
   */
  it('says it of somebody watching on a device that is not in the room', () => {
    showChannel(playing(), [], { watching: [THEM] });
    expect(mockApp.channelViews['sess_1'].channel.watchingHere).toEqual([]);
    const tree = openOnPeople();
    expect(textOf(tree)).toContain('Dana Chu Present  · watching');
    act(() => tree.unmount());
  });

  /**
   * **A declaration outlives the film it was made for**, which is why the
   * roster asks about the party rather than about the list. `screening` is a
   * device saying which channel it would show a film for, and it is set from
   * the moment somebody opens a party's channel — so a party that has just
   * stopped leaves it standing on every device until each of them notices.
   * Drawn unguarded, the roster would report a room full of people watching
   * nothing.
   */
  it('says nothing about watching when there is no film', () => {
    showChannel(channelOf(), [], { watching: [THEM] });
    const tree = openOnPeople();
    expect(textOf(tree)).not.toContain('· watching');
    act(() => tree.unmount());
  });

  /**
   * **A pause is when nobody is watching anything**, and the declaration does
   * not know that: `screening` is a device offering to show a film, not a
   * picture in motion, so it stands unchanged across a pause on every device
   * in the room. The film is stopped so that the room can talk about it, and
   * whoever put their phone down while it was stopped is reported exactly like
   * the person still looking at it — which is the wrong answer to the only
   * question the line was added to answer.
   */
  it('says nothing about watching while the film is paused', () => {
    showChannel(
      playing((s) => reduce(s, { type: 'WATCH_PAUSE', userId: ME }, NOW)),
      [],
      { watching: [THEM] }
    );
    const tree = openOnPeople();
    const text = textOf(tree);
    expect(text).toContain('Dana Chu Present ');
    expect(text).not.toContain('· watching');
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
    **Full screen, which is the phone being sideways and nothing else.**

    The picture fills the device because this application makes it fill the
    device: YouTube's own bar went on 2026-09-18 and took its full-screen
    button with it, and nothing inside the player gives one back. Since
    2026-09-19 this application does not draw a button for it either — the
    state is derived from the shape of the window, so what these tests turn is
    the phone. The one control left inside it is about the hardware rather than
    about the picture and is asserted in watch/__tests__/fullScreen.test.tsx;
    what is asserted here is the derivation, and in particular every way the
    film can leave the screen without the person watching it doing anything.
  */
  /**
   * **Where the transport sits relative to the film**, which is the half of
   * `watchShapeFor` that reaches a screen as a prop rather than as a style.
   *
   * The arithmetic itself is proved in `layout.test.ts` against a table of
   * surfaces; what is left to show here is that the channel screen asks for
   * the answer and hands it to `Screen` — the wiring, which a pure test
   * cannot see and which is where this would break.
   */
  describe('the watch body’s two columns', () => {
    /** iPad 10.2" in landscape: a 740-point pane, under the turnover. */
    const PANE_740 = { width: 1080, height: 810, scale: 2, fontScale: 1 };
    /** iPad Pro 12.9" in landscape: 1026, over it. */
    const PANE_1026 = { width: 1366, height: 1024, scale: 2, fontScale: 1 };

    const placeOn = (window: typeof PORTRAIT) => {
      mockWindow = window;
      mockApp.screenFor = 'sess_1';
      showChannel(watching());
      const tree = open();
      const place = tree.root.findAll((node) => node.type === Screen)[0]?.props
        .asidePlace;
      act(() => tree.unmount());
      return place;
    };

    it('stacks the transport under the film on a pane too narrow for both', () => {
      // The iPad this was reported from. 740 is short of the sum of the two
      // minimums, and a picture shrunk to 430 to buy a column would be the
      // trade the wrong way round.
      expect(placeOn(PANE_740)).toBe('above');
    });

    it('puts it beside the film once there is room for both', () => {
      expect(placeOn(PANE_1026)).toBe('beside');
    });

    it('leaves a phone stacked', () => {
      // Nothing about any of this reaches a phone, which is the surface this
      // application is mostly used on and the one with no room to spare.
      expect(placeOn(PORTRAIT)).toBe('above');
    });
  });

  describe('Full screen', () => {
    /**
     * On the *Watch* tab, on the device showing the film, asked for.
     *
     * **Pressed rather than turned**, from the default window, which is not
     * handheld — so this is how a laptop and an iPad get there, and how a
     * phone held upright or lying flat does. The turn has its own tests
     * below and needs a `PHONE`.
     */
    function expand() {
      mockApp.screenFor = 'sess_1';
      showChannel(watching());
      const tree = open();
      act(() => findButton(tree, 'Full screen')!.props.onPress());
      return tree;
    }

    /** Whatever has changed, drawn again — the reading is taken at render. */
    const again = (tree: ReactTestRenderer) =>
      act(() =>
        tree.update(<ChannelView
            channelId="sess_1"
            audio={AUDIO}
            onClose={() => {}}
            onExit={() => {}}
          />)
      );

    /** What the card has and the expanded picture does not. */
    const onTheCard = (tree: ReactTestRenderer) =>
      findButton(tree, 'Change video') !== undefined;
    /**
     * What the expanded picture has and the card does not.
     *
     * **The scrim itself, rather than a control on it.** It was *Back to
     * portrait* until 2026-09-20, when the last control over the film went and
     * left this state with nothing in it that the card has not also got — the
     * transport being deliberately the same row in both places. What is left
     * to recognise it by is the thing that is structural rather than
     * cosmetic: the fading bar `FullScreen` draws over the picture, which no
     * other screen in this application has.
     */
    const expanded = (tree: ReactTestRenderer) =>
      tree.root.findAll((n) => n.props?.testID === 'chrome').length > 0;

    /** The same, from a phone, which starts upright because the lock says so. */
    function phone() {
      mockWindow = PHONE;
      mockApp.screenFor = 'sess_1';
      showChannel(watching());
      return open();
    }

    it('is turned into on a handheld, the wrist being the gesture', () => {
      /*
        **The route the narrowed lock brought back.** It existed from
        2026-09-19, went on 2026-09-20 with an application-wide portrait lock
        — a phone that may not be sideways anywhere is never handed the window
        this reads — and is here again because the lock is the film's alone
        now: the watch card and the picture are the two screens a phone may
        turn on, and nothing else is.
      */
      const tree = phone();
      expect(expanded(tree)).toBe(false);
      expect(onTheCard(tree)).toBe(true);

      mockWindow = LANDSCAPE;
      again(tree);
      expect(expanded(tree)).toBe(true);
      act(() => tree.unmount());
    });

    it('is turned back out of, which is the exit on a handheld', () => {
      // The half that makes it a toggle rather than a trap, and the half the
      // 2026-09-19 arrangement got right.
      const tree = phone();
      mockWindow = LANDSCAPE;
      again(tree);
      expect(expanded(tree)).toBe(true);

      mockWindow = PHONE;
      again(tree);
      expect(expanded(tree)).toBe(false);
      expect(onTheCard(tree)).toBe(true);
      act(() => tree.unmount());
    });

    it('draws no way out on the scrim while the phone is the way out', () => {
      /*
        **A dead button is worse than an absent one.** While the phone is
        sideways the state is the window's, so a press of an exit would set a
        flag the window immediately overrules and nothing at all would happen.
        The transport is still there — it is the film's, not the state's.
      */
      const tree = phone();
      mockWindow = LANDSCAPE;
      again(tree);
      expect(expanded(tree)).toBe(true);
      expect(findButton(tree, 'Exit full screen')).toBeUndefined();
      expect(findButton(tree, '−15s')).toBeDefined();
      act(() => tree.unmount());
    });

    it('expires a press when the phone is turned, so the turn back lands', () => {
      /*
        **The one thing a press has to give way to.** Somebody who pressed
        *Full screen* upright and then turned the phone is holding a press and
        a turn at once; if the press survived, turning back would leave the
        picture expanded for a gesture that visibly should collapse it. The
        turn is the stronger statement and takes the flag with it.
      */
      const tree = phone();
      act(() => findButton(tree, 'Full screen')!.props.onPress());
      expect(expanded(tree)).toBe(true);

      mockWindow = LANDSCAPE;
      again(tree);
      expect(expanded(tree)).toBe(true);

      mockWindow = PHONE;
      again(tree);
      expect(expanded(tree)).toBe(false);
      act(() => tree.unmount());
    });

    it('answers a press on a phone that is never turned', () => {
      /*
        **A phone lying flat is what the button is for there.** iOS holds the
        interface orientation it had when the gravity vector stops saying
        anything, so a phone on a table never turns and never turns back —
        and portrait is a supported way to be here, reached and left by the
        button exactly as on a laptop.
      */
      const tree = phone();
      act(() => findButton(tree, 'Full screen')!.props.onPress());
      expect(expanded(tree)).toBe(true);
      act(() => findButton(tree, 'Exit full screen')!.props.onPress());
      expect(expanded(tree)).toBe(false);
      act(() => tree.unmount());
    });

    it('is pressed into, upright, on the device showing the film', () => {
      /*
        **The button is back, on every platform including the phone.** It was
        removed on 2026-09-19 as a control saying what the phone already knew,
        and what that missed is that most surfaces cannot say it: a browser
        window and a tablet have no turn to perform. One control that means the
        same thing everywhere beats one that appears on some surfaces — and a
        phone held upright that wants the film big has no other way to ask.
      */
      mockApp.screenFor = 'sess_1';
      showChannel(watching());
      const tree = open();
      expect(expanded(tree)).toBe(false);
      const button = findButton(tree, 'Full screen');
      expect(button).toBeDefined();
      act(() => button!.props.onPress());
      expect(expanded(tree)).toBe(true);
      act(() => tree.unmount());
    });

    it('offers no Full screen on a device that is not the screen', () => {
      // A phone that handed the picture to the laptop has no picture of its
      // own to expand. It still drives the party from the transport.
      showChannel(watching());
      const tree = open();
      expect(findButton(tree, 'Full screen')).toBeUndefined();
      expect(findButton(tree, '−15s')).toBeDefined();
      act(() => tree.unmount());
    });

    /*
      **The bug the handheld rule exists for, from both ends.**

      `width > height` was read as *somebody turned this* for a day. A desktop
      browser window satisfies it sitting still, and so does an iPad held the
      way iPads are held — so both went full screen the moment somebody opened
      *Watch*, and then had no way out: there is no device to turn in a
      browser, and the only control on the scrim turned a device.
    */
    it('leaves a tablet alone until it is asked', () => {
      mockWindow = TABLET_LANDSCAPE;
      mockApp.screenFor = 'sess_1';
      showChannel(watching());
      const tree = open();
      // Landscape, and emphatically not expanded.
      expect(expanded(tree)).toBe(false);
      expect(onTheCard(tree)).toBe(true);
      // And the button is how it gets there, which is the whole point of
      // restoring it.
      act(() => findButton(tree, 'Full screen')!.props.onPress());
      expect(expanded(tree)).toBe(true);
      act(() => tree.unmount());
    });

    it('keeps a tablet expanded when it is turned', () => {
      /*
        **A press outlives a rotation on anything but a handheld**, which is
        the other half of the tri-state. Somebody who asked a tablet for full
        screen and then turned it over has not asked for anything; a picture
        that collapsed there would be the new bug in place of the old one.
      */
      mockWindow = TABLET_LANDSCAPE;
      mockApp.screenFor = 'sess_1';
      showChannel(watching());
      const tree = open();
      act(() => findButton(tree, 'Full screen')!.props.onPress());
      expect(expanded(tree)).toBe(true);
      mockWindow = { width: 744, height: 1133, scale: 2, fontScale: 1 };
      again(tree);
      expect(expanded(tree)).toBe(true);
      act(() => tree.unmount());
    });

    it('lets a press out and a press back in, and no shape moves it', () => {
      /*
        **On anything without a wrist, a press is the whole of the state.**
        Out, and it stays out across a resize — a browser window dragged
        wider, an iPad app rotated — which is the defect of 2026-09-20 from
        the other side: `width > height` was read as a request on three
        surfaces that had made none. And back in from the card, which is where
        *Full screen* is.

        Both windows here are deliberately not handheld. The turn on a phone
        is a different rule with its own tests above.
      */
      const tree = expand();
      expect(expanded(tree)).toBe(true);

      act(() => findButton(tree, 'Exit full screen')!.props.onPress());
      expect(expanded(tree)).toBe(false);
      expect(onTheCard(tree)).toBe(true);

      mockWindow = PORTRAIT_TURNED;
      again(tree);
      expect(expanded(tree)).toBe(false);
      mockWindow = PORTRAIT;
      again(tree);
      expect(expanded(tree)).toBe(false);

      act(() => findButton(tree, 'Full screen')!.props.onPress());
      expect(expanded(tree)).toBe(true);
      act(() => tree.unmount());
    });

    it('takes the room’s own bar off the film', () => {
      /*
        **Sideways, the only controls are the film's.** The channel's pinned
        bar — mute, the floor, and the three rungs of presence — was drawn over
        the picture with the transport for a day, on the argument that this is
        a talking application before it is a video one. It is upright-only as
        of 2026-09-20: what the bar bought was reachability that was never more
        than a turn of the wrist away, and what it cost was a fifth of a
        sideways phone spent on controls nobody had asked the film for.

        Asserted from this end as well as from `FullScreen`'s, because the two
        halves fail differently: that file can only prove it draws nothing it
        is not given, and this one proves the footer is not given.
      */
      const tree = expand();
      expect(expanded(tree)).toBe(true);
      for (const word of ['Nearby', 'In', 'Out', 'Mute', 'Unmute', 'Claim']) {
        expect(findButton(tree, word)).toBeUndefined();
      }
      // The transport and the way out are the exceptions and are the whole of
      // them.
      expect(findButton(tree, '+15s')).toBeDefined();
      expect(findButton(tree, '−15s')).toBeDefined();
      expect(findButton(tree, 'Exit full screen')).toBeDefined();
      act(() => tree.unmount());
    });

    it('never turns a window that cannot have been turned', () => {
      /*
        **The whole of the 2026-09-20 defect, asserted from this end.** The
        default window is short of `HANDHELD_UNDER` in neither orientation, so
        neither shape is a gesture and the press is the only thing that has
        said anything. This is a laptop being dragged about, an iPad app
        rotated, and a phone browser is expressly not covered by it — that one
        is handheld and turns.
      */
      mockWindow = PORTRAIT_TURNED;
      mockApp.screenFor = 'sess_1';
      showChannel(watching());
      const tree = open();
      expect(expanded(tree)).toBe(false);
      mockWindow = PORTRAIT;
      again(tree);
      expect(expanded(tree)).toBe(false);
      act(() => tree.unmount());
    });

    it('leaves the other tabs alone', () => {
      // Belt and braces against the rule that is gone: a window wider than it
      // is tall is not a request anywhere, and least of all on the roster.
      mockWindow = LANDSCAPE;
      mockApp.screenFor = 'sess_1';
      showChannel(watching());
      const tree = openOnPeople();
      expect(expanded(tree)).toBe(false);
      act(() => tree.unmount());
    });

    it('expands on the device showing the film and on no other', () => {
      // A phone that handed the picture to the laptop still drives the party
      // — that is what the transport is for — but it has no picture, and a
      // sideways phone filled with black would be offering the film to
      // whoever has the least reason to want it.
      mockWindow = LANDSCAPE;
      showChannel(watching());
      const away = open();
      expect(findButton(away, '−15s')).toBeDefined();
      expect(expanded(away)).toBe(false);
      act(() => away.unmount());
    });

    it('takes the transport with it, and leaves the card behind', () => {
      const tree = expand();
      // One row drawn in two places rather than two rows: the seek and the
      // three buttons are the same element the card had.
      expect(findButton(tree, '−15s')).toBeDefined();
      expect(findButton(tree, 'Play')).toBeDefined();
      // And everything that is about arranging a party rather than watching
      // one is not on the screen at all.
      expect(onTheCard(tree)).toBe(false);
      act(() => tree.unmount());
    });

    it('collapses when the party stops under it', () => {
      // Otherwise Stop, pressed on somebody else's phone, leaves this one
      // holding a black rectangle and a row of controls that do nothing.
      const tree = expand();
      showChannel(channelOf());
      again(tree);
      expect(expanded(tree)).toBe(false);
      act(() => tree.unmount());
    });

    it('collapses when the film moves to another device', () => {
      // The same rectangle, arrived at from the other direction: the picture
      // is on the laptop now, and what is expanded here is nothing.
      const tree = expand();
      mockApp.screenFor = null;
      showChannel(watching());
      again(tree);
      expect(expanded(tree)).toBe(false);
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
      expect(expanded(tree)).toBe(false);
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
    const tree = openOnPeople();
    const text = textOf(tree);
    expect(text).toContain('Party-muted');
    expect(text.match(/Party-muted/g)).toHaveLength(1);
    act(() => tree.unmount());
  });

  it('says nothing about party-muting when the room is not muted', () => {
    showChannel(watching());
    const tree = openOnPeople();
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

  /**
   * A run that began with somebody's screen in the room — the one shape of
   * party whose mute is nobody's to lift. `WATCH_HERE` before `WATCH_PLAY`
   * because the question is sampled at the edge of the run.
   */
  const enforced = (mutate: (s: ChannelState) => ChannelState = (s) => s) =>
    watching((s) =>
      mutate(
        reduce(
          reduce(s, { type: 'WATCH_HERE', userId: ME, watching: true }, NOW),
          { type: 'WATCH_PLAY', userId: ME },
          NOW
        )
      )
    );

  it('takes the unmute away when the mute is not anybody\'s to lift', () => {
    // Gone rather than grey. Every other refusal on this card is about the
    // reader and changes when they step in or somebody lets go of the floor;
    // this one is a fact about the run, and a button that is grey for the
    // whole of a film offers something that is not on offer.
    showChannel(enforced());
    const tree = open();
    expect(findButton(tree, 'Unmute the room')).toBeUndefined();
    expect(findButton(tree, 'Mute the room')).toBeUndefined();
    act(() => tree.unmount());
  });

  it('says why, the button not being there to say it', () => {
    // The sentence is what is left, so it has to carry the reason as well as
    // the state. It names the condition and not the person.
    showChannel(enforced());
    const tree = open();
    const text = textOf(tree);
    expect(text).toContain('The room is muted');
    expect(text).toContain('watching on the device they are in the room on');
    act(() => tree.unmount());
  });

  it('gives it back at the pause, which is when the question is re-asked', () => {
    showChannel(
      enforced((s) => reduce(s, { type: 'WATCH_PAUSE', userId: ME }, NOW))
    );
    const tree = open();
    expect(findButton(tree, 'Unmute the room')).toBeDefined();
    expect(textOf(tree)).not.toContain(
      'watching on the device they are in the room on'
    );
    act(() => tree.unmount());
  });

  it('keeps the unmute when everybody is watching on a second device', () => {
    // Nobody's screen is in the room, so the quiet is a preference and the
    // control that set it is the control that clears it.
    showChannel(muted());
    const tree = open();
    expect(findButton(tree, 'Unmute the room')).toBeDefined();
    expect(textOf(tree)).not.toContain(
      'watching on the device they are in the room on'
    );
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

  it('swaps the video without stopping the party first', async () => {
    showChannel(watching());
    const tree = open();
    onClipboard('https://youtu.be/abcdefghijk');
    // Two presses, and the clipboard is read only on the second: a swap
    // empties everybody's picture, so it is not something one press on a
    // stale clipboard can do.
    act(() => findButton(tree, 'Change video')!.props.onPress());
    await press(tree, 'Watch this instead');

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

  /** A channel with one film behind it and nothing on. */
  function watchedBefore() {
    return watching((s) =>
      reduce(
        reduce(
          s,
          { type: 'WATCH_READY', userId: ME, durationMs: 600_000, title: 'Casablanca' },
          NOW
        ),
        { type: 'STOP_WATCH', userId: ME },
        NOW
      )
    );
  }

  it('offers nothing to choose from before anything has been watched', () => {
    showChannel(channelOf());
    const tree = open();
    expect(findButton(tree, 'Watched before')).toBeUndefined();
    act(() => tree.unmount());
  });

  it('puts a film the channel has watched back on, without a link', async () => {
    showChannel(watchedBefore());
    const tree = open();
    // Shut on arrival: the card's subject is starting something, and the list
    // stands behind one press so it is not a wall above the commitment.
    expect(findButton(tree, 'Casablanca')).toBeUndefined();
    act(() => findButton(tree, 'Watched before (1)')!.props.onPress());

    await press(tree, 'Casablanca');
    // The stored URL, which is what makes this the same act as a paste: the
    // server parses it with `parseYouTubeUrl` either way.
    expect(mockApp.act).toHaveBeenCalledWith('sess_1', {
      type: 'START_WATCH',
      url: URL,
    });
    act(() => tree.unmount());
  });

  it('offers the same films while a party is being swapped', async () => {
    // *Change video* is the press that says somebody means to empty four
    // other people's picture, so the list is open behind it rather than
    // behind a second disclosure of its own.
    showChannel(
      watching((s) =>
        reduce(
          s,
          {
            type: 'START_WATCH',
            userId: ME,
            videoId: 'abcdefghijk',
            url: 'https://youtu.be/abcdefghijk',
          },
          NOW
        )
      )
    );
    const tree = open();
    act(() => findButton(tree, 'Change video')!.props.onPress());
    await press(tree, 'A film nobody named');

    expect(mockApp.act).toHaveBeenCalledWith('sess_1', {
      type: 'START_WATCH',
      url: URL,
    });
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
    const tree = openOnPeople();
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

  /**
   * **The second device, which is a television and not a channel screen.**
   *
   * Two instances of one account, and the party split across them: the film
   * on this one, the room on the other. Until 2026-09-20 this device drew the
   * whole channel with the film docked on the sixth tab, so every control of
   * the party existed twice on two devices; it draws the film, the transport,
   * *Full screen* and the three rungs now, and that is the whole of it.
   *
   * **`standingIn` is the variable and it is the only one.** `showChannel`
   * sets it whenever ME is present, which is the single-device case every
   * other test in this file is about — so what makes a device the second one
   * is clearing it afterwards, leaving the account in the room by way of some
   * other instance.
   *
   * **Not the follower page**, which is the other thing conversation calls a
   * second screen: `follow()` in `server/src/watch-page.ts`, the script a
   * guest browser runs, is untouched by any of this and still has the backlog
   * entry saying it has no test.
   */
  describe('the second device', () => {
    /** The screen here, the room elsewhere, which is the whole of the state. */
    function asSecondDevice(state = watching()) {
      showChannel(state);
      mockApp.screenFor = 'sess_1';
      mockApp.standingIn = null;
      // `openOnPeople` rather than `open`: there is no tab strip to tap, and
      // `showWatch` would throw — which is itself asserted below.
      return openOnPeople();
    }

    it('keeps the role while the first snapshot is still on its way', () => {
      /*
        **The repair of 2026-09-20, and the reason a television went blank as
        you walked up to it.** The effect that stops being a screen when there
        is nothing to show reads `partyLoaded`, which is false for two quite
        different reasons: the party is over, and the view has not arrived
        yet. Opening a channel sends `watch.channel` and the snapshot lands a
        round trip later, so this screen mounts in the second state every
        time — and a device handed a film while it was looking at anything
        else gave the role straight back on the frame it opened the channel
        to watch it on.
      */
      mockApp.screenFor = 'sess_1';
      mockApp.standingIn = null;
      // No `showChannel`: this is the gap, and it is the ordinary one.
      const tree = openOnPeople();
      expect(mockApp.showScreenFor).not.toHaveBeenCalled();
      act(() => tree.unmount());
    });

    it('gives it up once a snapshot says the party is over', () => {
      // The case the effect is actually for, which must still work.
      showChannel(channelOf());
      mockApp.screenFor = 'sess_1';
      mockApp.standingIn = null;
      const tree = openOnPeople();
      expect(mockApp.showScreenFor).toHaveBeenCalledWith(null);
      act(() => tree.unmount());
    });

    it('draws the film\u2019s controls and nothing else of the party', () => {
      const tree = asSecondDevice();
      // The transport, which is the same row the watch card has.
      expect(findButton(tree, 'Play')).toBeDefined();
      expect(findButton(tree, '\u221215s')).toBeDefined();
      expect(findButton(tree, '+15s')).toBeDefined();
      expect(findButton(tree, 'Full screen')).toBeDefined();
      /*
        And none of the party's other controls, all of which belong to the
        device holding the room. *Watch on* is the one that would be actively
        wrong here: the switch that sent the film to this device is on the
        other one, and a second copy of it pointing at itself is the remote
        control being in two places.
      */
      expect(findChoice(tree, 'This device')).toBeUndefined();
      expect(findChoice(tree, 'Other device')).toBeUndefined();
      expect(findButton(tree, 'Stop')).toBeUndefined();
      expect(findButton(tree, 'Change video')).toBeUndefined();
      expect(findButton(tree, 'Settings')).toBeUndefined();
      act(() => tree.unmount());
    });

    it('offers no tabs, the five other ones not being the film', () => {
      const tree = asSecondDevice();
      expect(findTab(tree, 'Watch')).toBeUndefined();
      expect(findTab(tree, 'People')).toBeUndefined();
      act(() => tree.unmount());
    });

    it('keeps the three rungs, which are how this state is left', () => {
      /*
        The exception, and it is mechanical rather than tasteful: *In* is what
        makes this the first device, and *Nearby* and *Out* are what end the
        film. Take them away and a second device can neither take the room nor
        give the picture back, and nothing on the screen reaches the switch
        that sent it here.
      */
      const tree = asSecondDevice();
      expect(findButton(tree, 'In')).toBeDefined();
      expect(findButton(tree, 'Nearby')).toBeDefined();
      expect(findButton(tree, 'Out')).toBeDefined();
      // And not the other two, which are about the room rather than the film.
      expect(findButton(tree, 'Mute')).toBeUndefined();
      expect(findButton(tree, 'Claim')).toBeUndefined();
      act(() => tree.unmount());
    });

    it('steps in from the rung, which is what swaps the two devices', () => {
      const tree = asSecondDevice();
      act(() => findButton(tree, 'In')!.props.onPress());
      expect(mockApp.act).toHaveBeenCalledWith('sess_1', { type: 'ENTER' });
      act(() => tree.unmount());
    });

    it('offers no Home, a television not being a way into the app', () => {
      /*
        *Home* was here for a day, on the argument that without it this device
        is an application that cannot be used for anything else until somebody
        stops watching — which is what a television is. The way off it is to
        stop watching, and that is a rung; every other way into the rest of
        the application is on the device holding the room, which is the one
        the account is actually holding.
      */
      const tree = asSecondDevice();
      expect(findButton(tree, 'Home')).toBeUndefined();
      act(() => tree.unmount());
    });

    /** The same screen, with somebody listening to what it claims. */
    function claimWatcher() {
      const claim = jest.fn();
      const tree = render(
        <WholeWindowContext.Provider value={{ taken: null, claim }}>
          <ChannelView
            channelId="sess_1"
            audio={AUDIO}
            onClose={() => {}}
            onExit={() => {}}
          />
        </WholeWindowContext.Provider>
      );
      return { claim, tree };
    }

    it('takes the window, a list beside it being the remote control twice', () => {
      /*
        Above `SPLIT_AT` — a laptop, which is where a party is actually watched
        — the channel list was two thirds of this window, on the one device
        that exists because the rest of the channel is somewhere else. `list`
        rather than `glass`: the three rungs stay off the home indicator.
      */
      showChannel(watching());
      mockApp.screenFor = 'sess_1';
      mockApp.standingIn = null;
      const { claim, tree } = claimWatcher();
      expect(claim).toHaveBeenCalledWith('list');
      // And gives it back, by the unmount rather than by any press — the
      // party ending and the film moving both arrive that way.
      act(() => tree.unmount());
      expect(claim).toHaveBeenLastCalledWith(null);
    });

    it('claims nothing from the ordinary channel screen', () => {
      // The single-device case, which is a channel screen and wants its list.
      showChannel(watching());
      mockApp.screenFor = 'sess_1';
      const { claim, tree } = claimWatcher();
      expect(claim).not.toHaveBeenCalled();
      act(() => tree.unmount());
    });

    it('declines the job, which is the way out that leaves the room alone', () => {
      /*
        The three rungs are all answers to the *room*: *In* takes the
        presence, *Nearby* and *Out* leave. Somebody who simply does not want
        the film on this particular glass had to change their standing in the
        channel to say so. This ends nothing — not the party, not anybody's
        presence — it hands the screen role back, and the *Watch on* switch on
        the device holding the room learns it from the server.
      */
      const tree = asSecondDevice();
      act(() => findButton(tree, 'Other device')!.props.onPress());
      expect(mockApp.showScreenFor).toHaveBeenCalledWith(null);
      // The room is untouched: no STOP_WATCH and no rung. The transport is
      // the one thing it does say to the channel, and only while the film is
      // running — see the two cases below.
      expect(mockApp.act).not.toHaveBeenCalledWith(
        'sess_1',
        expect.objectContaining({ type: 'STOP_WATCH' })
      );
      act(() => tree.unmount());
    });

    it('pauses a running film rather than tearing it off the scene', () => {
      /*
        **The *Watch on* switch thrown from the far end.** That switch refuses
        a move while the film is running — *pause the film to move it to
        another device* — so a press here, which is the same move made from
        the television, does the pause the person would have done first.
      */
      const tree = asSecondDevice(playing());
      act(() => findButton(tree, 'Other device')!.props.onPress());
      expect(mockApp.act).toHaveBeenCalledWith('sess_1', {
        type: 'WATCH_PAUSE',
      });
      act(() => tree.unmount());
    });

    it('says nothing to the transport when the film is already paused', () => {
      // A paused film needs no pause, and a channel told to pause one twice
      // is this screen inventing traffic.
      const tree = asSecondDevice();
      act(() => findButton(tree, 'Other device')!.props.onPress());
      expect(mockApp.act).not.toHaveBeenCalledWith('sess_1', {
        type: 'WATCH_PAUSE',
      });
      act(() => tree.unmount());
    });

    it('sends the picture back to the device holding the room', () => {
      /*
        **The second half of the switch, and without it the film lands on
        nothing.** No device showing it, and — before the pause above — the
        control that would move it disabled precisely because it was still
        running. So the picture follows the person who walked away from the
        television: paused, on the device in their hand.

        **Asked for by description and not chosen from a list.** A null device
        is *the one standing in this channel*, which the server resolves —
        `screens.use` in server/src/ws.ts. The picker's list says which of the
        account's instances are signed in and nothing about where the person
        is, so a television reading it would be choosing between devices when
        it already knows the answer.
      */
      mockApp.screens = [
        { device: 'dev-tv', name: 'Apple TV', client: 'native', self: true, watching: true },
        { device: 'dev-me', name: 'iPhone 15 Pro', client: 'native', self: false, watching: false },
        { device: 'dev-pad', name: 'iPad', client: 'native', self: false, watching: false },
      ];
      const tree = asSecondDevice(playing());
      act(() => findButton(tree, 'Other device')!.props.onPress());
      expect(mockApp.useScreen).toHaveBeenCalledWith('sess_1', null);
      // No list and no picker: two other devices signed in is not a question
      // for the person who has walked away from this one.
      expect(mockApp.listScreens).not.toHaveBeenCalled();
      expect(findButton(tree, 'iPad')).toBeUndefined();
      // And the role goes at the press: the film leaving this glass is the
      // whole of what was asked for, and may not wait on a device that might
      // never answer.
      expect(mockApp.showScreenFor).toHaveBeenCalledWith(null);
      act(() => tree.unmount());
    });

    it('takes the device over, whatever it was showing', () => {
      /*
        **The ask is an assignment, not an offer.** Somebody at another of
        this account's devices has decided the picture belongs on this glass
        and there is no tap coming on this one, so the arrival opens the
        channel — `App.tsx` — and the second device replaces whatever this one
        was on. What that alone does not reach is this screen's own three: the
        profile, the settings screen and a transcript are early returns
        *above* the television and are state this component holds, so a device
        sitting in one of them was handed a film and went on drawing it.
      */
      showChannel(watching());
      const tree = openOnPeople();
      act(() => findButton(tree, 'Settings')!.props.onPress());
      expect(findButton(tree, 'Settings')).toBeUndefined();

      // And now the film is sent here, which is the role arriving.
      mockApp.screenFor = 'sess_1';
      mockApp.standingIn = null;
      act(() =>
        tree.update(<ChannelView
            channelId="sess_1"
            audio={AUDIO}
            onClose={() => {}}
            onExit={() => {}}
          />)
      );
      expect(textOf(tree)).toContain('Watching');
      expect(findButton(tree, 'Other device')).toBeDefined();
      act(() => tree.unmount());
    });

    it('offers it on the television and nowhere else', () => {
      // The ordinary channel screen has the *Watch on* switch, which is the
      // same act said the other way round; two of them is the remote control
      // in two places, which is what this screen exists to stop.
      showChannel(watching());
      mockApp.screenFor = 'sess_1';
      const tree = openOnPeople();
      expect(findButton(tree, 'Other device')).toBeUndefined();
      act(() => tree.unmount());
    });

    it('gives the screen up when it goes, there being no corner for it', () => {
      /*
        The picture floats when no screen leaves it a hole, which is right on
        the device somebody is standing in the room on and wrong here: a
        television shrunk into a corner with the channel list back beside it
        is the state this screen was cleaned up to stop being. Nothing on the
        screen reaches that — but on the web the browser's back button leaves
        any screen in this application, and that route was reaching it.
      */
      showChannel(watching());
      mockApp.screenFor = 'sess_1';
      mockApp.standingIn = null;
      const tree = openOnPeople();
      act(() => tree.unmount());
      expect(mockApp.showScreenFor).toHaveBeenCalledWith(null);
    });

    it('keeps it on the way out of the ordinary channel screen', () => {
      // The first device, where going Home is meant to leave the film in the
      // corner and a tap on it is meant to come back.
      showChannel(watching());
      mockApp.screenFor = 'sess_1';
      const tree = openOnPeople();
      act(() => tree.unmount());
      expect(mockApp.showScreenFor).not.toHaveBeenCalledWith(null);
    });

    it('expands, there being no Watch tab left to gate that on', () => {
      /*
        `atTheFilm` was `tab === 'watch'` and everything else, and on a screen
        with no tab strip the tab is whichever one `tab` happens to hold —
        *Members*. So the one surface whose entire purpose is the picture was
        the one that could not expand it.
      */
      const tree = asSecondDevice();
      act(() => findButton(tree, 'Full screen')!.props.onPress());
      act(() =>
        tree.update(<ChannelView
            channelId="sess_1"
            audio={AUDIO}
            onClose={() => {}}
            onExit={() => {}}
          />)
      );
      expect(findButton(tree, 'Exit full screen')).toBeDefined();
      // Expanded, the rungs go with everything else: the scrim is the
      // transport and the way out, which is what 2026-09-20 settled.
      expect(findButton(tree, 'Nearby')).toBeUndefined();
      act(() => tree.unmount());
    });

    it('is the ordinary channel screen once the room is on this device too', () => {
      // The single-device case, which is what every other test here is, and
      // the state pressing *In* above arrives at.
      showChannel(watching());
      mockApp.screenFor = 'sess_1';
      const tree = openOnPeople();
      expect(findTab(tree, 'Watch')).toBeDefined();
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
