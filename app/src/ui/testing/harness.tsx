import React from 'react';
import renderer, {
  act,
  type ReactTestInstance,
  type ReactTestRenderer,
} from 'react-test-renderer';
import { createChannel, reduce } from '../../../../core/channel';
import { DEFAULT_ACCOUNT_SETTINGS } from '../../../../core/settings';
import type { ChannelState } from '../../../../core/types';
import type {
  GuestView,
  HomeView as HomeViewData,
  ProfileView as ProfileViewData,
  RecordingView,
  ScreenDevice,
} from '../../../../core/protocol';
import type { UploadHooks } from '../../api/upload';
import type { GuestLinkSummary } from '../../api/http';
import type { Introduction } from '../../state/introduction';
import { Alert } from 'react-native';

/**
 * The fixture every view test renders against: one mutable `mockApp` standing
 * in for the provider, the helpers that read a rendered tree, and the three
 * module mocks.
 *
 * It was the first four hundred lines of `views.test.tsx`, which by 2026-09-04
 * was 8,495 lines and 343 tests in one file — long enough that two describes
 * 1,900 lines apart had grown near-identical names and separate copies of the
 * same fixtures. The file is now seven, split at its own describe seams, and
 * this is what they share. **A helper belongs here once a second file wants
 * it, and not before**: a fixture only one file uses is clearer next to the
 * tests that use it.
 *
 * `resetHarness` is what the old `beforeEach` did, and every file calls it —
 * `mockApp` is module state, so a field one test sets is a field the next one
 * inherits.
 */
/**
 * The views now render server snapshots rather than driving a local model, so
 * these feed them protocol-shaped data directly. That also pins the views to
 * the real protocol types: a change on the server that the client has not kept
 * up with fails here rather than on a phone.
 */

export const ME = 'acct_me';
export const THEM = 'acct_them';
export const NOW = 1_700_000_000_000;

/** A help screen with nothing asked yet, which is where everybody starts. */
function emptyHelp() {
  return jest.fn(async () => ({
    questions: [] as Array<{
      id: string;
      text: string;
      askedAt: number;
      answer: string | null;
      answeredAt: number | null;
    }>,
    canAsk: true,
    askBlocked: null as string | null,
  }));
}

/**
 * A server that takes the question, with a fresh id each time.
 *
 * Fresh rather than fixed because the screen keys its list on the id, and two
 * questions sharing one is a React warning that a test will not fail on but
 * that hides a real duplicate if one ever appears.
 */
function takesQuestion() {
  let n = 0;
  return jest.fn(async (text: string) => {
    n += 1;
    return {
      id: `q_${n}`,
      text,
      askedAt: NOW,
      answer: null as string | null,
      answeredAt: null as number | null,
    };
  });
}

export const mockApp = {
  ready: true,
  token: 'token',
  me: { id: ME, displayName: 'Me' },
  home: null as HomeViewData | null,
  /**
   * The seats this account is sitting in, empty for every test but the ones
   * about them — as it is on a phone, most of the time. `App.tsx` reads it
   * for the audio and for which screen a channel opens.
   */
  seatViews: {} as Record<string, GuestView>,
  channelViews: {} as Record<
    string,
    {
      channel: ChannelState;
      participants: Array<{ id: string; displayName: string }>;
      recordings: RecordingView[];
      // Always present, as it is on the wire; `showChannel` supplies an empty
      // one. A missing *entry* means pingable now, so the empty map is a
      // channel nobody has been pinged in, which is most of these.
      pingableAt: Record<string, number>;
      // Likewise absent on most of these, and it means something different
      // when it is: no attention clock for that person, which is a build too
      // old to report one. A test that wants the *nearby* line's number sets
      // it, and until 2026-09-09 none did — which is how a change to what the
      // roster counts got past a suite that asserts on those very lines.
      attentiveAt?: Record<string, number>;
      // Absent on all but the tests about it, as it is on the wire: nobody is
      // talking into a claim. See `ChannelView.speakingWhileWithheld` — this
      // is the only thing on a snapshot that says who is *speaking*, every
      // other such fact arriving through the media connection.
      speakingWhileWithheld?: string[];
      serverNow: number;
      /**
       * Which *getting-started cohort* this channel is, absent on all but the
       * tests about it — exactly as it is on the wire for all but a handful of
       * channels. See `ChannelView.cohort`.
       */
      cohort?: number | null;
    }
  >,
  goneChannels: [] as string[],
  /**
   * The channel this *device* is standing in, which is not what the roster
   * says — see `AppProvider.standingIn`. `showChannel` sets it whenever the
   * snapshot has ME present, because that is what every test here but the
   * two-device ones means by putting somebody in a channel: one person, one
   * phone, in the room. A test that wants the other case clears it by hand.
   */
  standingIn: null as string | null,
  /**
   * The channels this *device* declared itself nearby in, and who has walked
   * into each since — `AppProvider.nearbyIn` and `nearbyArrival`, both keyed
   * by channel because nearby is not exclusive. Empty by default, which is
   * every test here but the arrival ones: no declaration, so no offer.
   */
  nearbyIn: [] as string[],
  nearbyArrival: {} as Record<string, string[]>,
  displaced: false,
  /**
   * This account's other live instances, for the screen picker. Empty by
   * default, which is the ordinary case and the one the banner is for: a
   * person with a phone and nothing else signed in.
   */
  screens: [] as ScreenDevice[],
  /**
   * The channels this account's *other* instances are showing. Empty by
   * default for `screens`' reason, and it is what the *Watch on* switch reads
   * to show *other device* as chosen.
   */
  screensElsewhere: [] as string[],
  /** The channel this device has been asked to show a film for. */
  screenFor: null as string | null,
  /** A channel this device has just been asked to show, not yet opened. */
  screenAsked: null as string | null,
  listScreens: jest.fn(),
  useScreen: jest.fn(),
  showScreenFor: jest.fn(),
  takeScreenAsked: jest.fn(),
  /**
   * Below the compatibility floor, which stops anything from being live
   * however present the roster says you are — the socket is already hung up.
   * Cleared in `beforeEach` like the rest.
   */
  expired: false,
  /**
   * Where to get the app, from `/healthz`. Null by default, as it is on a box
   * that has not been told — which is also the state in which the install
   * notice is not drawn at all.
   */
  updateUrl: null as string | null,
  /**
   * What is due about notifications, defaulting to nothing — which is what
   * every view test but the notification ones wants, and is the state of a
   * phone that said yes. A test that wants the banner sets `ask` to `'nudge'`.
   * See `state/notificationAsk.ts`.
   */
  notifications: {
    ask: 'none' as 'none' | 'pitch' | 'nudge',
    permission: 'granted' as 'granted' | 'undetermined' | 'denied',
    canPrompt: false,
    noteShown: jest.fn(),
    allow: jest.fn(async () => true),
  },
  /**
   * What this install has read of its own help answers, defaulting to
   * everything: `loaded` true and the watermark far in the future, so the
   * Support tab wears no dab. That is what every test but the dab ones wants —
   * an account with no answered questions reaches the same state, and the
   * default here also holds for one that has.
   *
   * A test about the mark sets `seenAnsweredAt` to null, or below the
   * `helpAnsweredAt` it puts on the home snapshot. See `state/helpSeen.ts`.
   */
  helpSeen: {
    seenAnsweredAt: Number.MAX_SAFE_INTEGER as number | null,
    loaded: true,
    noteAnswersSeen: jest.fn(),
  },
  /**
   * The debug override that draws both dabs whether or not anything is
   * waiting, off — which is every test but the two that are about it, and the
   * state of every account that has not been handed the `debug` grant. See
   * `forcedDabs` in `state/AppProvider`.
   */
  forcedDabs: false,
  forceDabs: jest.fn(),
  /**
   * What the introduction is showing, defaulting to nothing — the state of
   * every account that has ever had a conversation, which is what every test
   * here but the introduction ones wants. A test that wants the ladder or the
   * card replaces it. See `state/introduction.ts`.
   */
  introduction: { show: 'none' } as Introduction,
  markTried: jest.fn(),
  /**
   * The navigation counter, which no test asserts on and every screen holding
   * one of the four controls calls. A spy rather than a no-op so that the
   * tests which press Home go on measuring what they were written to measure
   * — see `core/navigation.ts`.
   */
  recordNav: jest.fn(),
  /** Puts one rung of the introduction away — `state/useIntroduction.ts`. */
  dismissStep: jest.fn(),
  forgetIntroduction: jest.fn(async () => undefined),
  /**
   * The shortcut a browser volunteered for installing this, which is null on
   * the phone every one of these tests pretends to be. A test about the
   * install rung's button sets it. See `state/useInstall.web.ts`.
   */
  installPrompt: null as (() => void) | null,
  status: 'open' as 'open' | 'connecting' | 'closed',
  offline: false,
  lastError: null,
  serverNow: () => NOW,
  reportAttentive: jest.fn(),
  lookAt: jest.fn(),
  requestCode: jest.fn(),
  verify: jest.fn(),
  signOut: jest.fn(),
  deleteAccount: jest.fn(async () => {}),
  requestContact: jest.fn(),
  // Null by default, which is the account with no username: the invite section
  // then draws its *choose a username* half, and every test that is about
  // something else on this card is unaffected by it being there.
  // Typed rather than inferred, so a test can hand back a link: inferred from
  // this one answer it would be `Promise<null>` and every override a type
  // error.
  inviteLink: jest.fn(async (): Promise<string | null> => null),
  acceptContact: jest.fn(),
  declineContact: jest.fn(),
  withdrawContact: jest.fn(async () => {}),
  startChannel: jest.fn(),
  // Answers for whoever is asked about, as the server does — a mock that
  // returns one person regardless would hide a component reading the wrong id.
  // Typed as the protocol shape rather than inferred from this one answer, so
  // a test can hand back the availability fields a contact's profile carries,
  // or leave them out the way the server does for everybody else.
  loadProfile: jest.fn(
    async (accountId: string): Promise<ProfileViewData> => ({
      account: {
        id: accountId,
        displayName: accountId === ME ? 'Me' : 'Dana Chu',
      },
    })
  ),
  saveProfile: jest.fn(async () => {}),
  requestEmailChange: jest.fn(async () => {}),
  confirmEmailChange: jest.fn(async (identifier: string) => ({
    account: { id: ME, displayName: 'Me' },
    invited: 2,
    email: identifier,
  })),
  // Nobody has the standings by default, matching the column that grants them.
  leaderboard: false,
  loadLeaderboard: jest.fn(async () => [
    { account: { id: 'acct_a', displayName: 'Ada' }, invited: 4 },
    { account: { id: 'acct_b', displayName: 'Grace' }, invited: 1 },
  ]),
  // Configured by default, so the Support section is exercised rather than
  // skipped; the tests that care about it absent override this.
  loadSupport: jest.fn(async () => ({
    // Typed as nullable, which is what the protocol says: a server with
    // nowhere to give answers null, and a test that wants that case cannot
    // express it against a mock inferred as `string`.
    url: 'https://ko-fi.com/thefloor' as string | null,
    identifier: 'me@example.com',
    mine: null as {
      count: number;
      since: number;
      totals: Array<{ currency: string; cents: number }>;
    } | null,
  })),
  // No questions asked yet and a slot free, which is the state everybody is
  // in the first time they open the Help screen. The tests about a backlog or
  // an answer replace these, and `resetHarness` puts them back — a test that
  // seeded a question is otherwise still seeding it three tests later.
  loadHelp: emptyHelp(),
  askHelp: takesQuestion(),
  connectWith: jest.fn(async () => ({ accepted: false })),
  // Resolves, which is what the card's wordless shortcut expects; the tests
  // about a refusal make it reject.
  ping: jest.fn(async () => {}),
  // A channel with no guest links, which is every channel until somebody makes
  // one. The settings screen reads this when it opens, so a mock without it is
  // a screen that throws rather than a screen with an empty section.
  inviteGuest: jest.fn(async () => 'https://example.test/g/tok'),
  askInAsGuest: jest.fn(async () => {}),
  enterSeat: jest.fn(async () => ({ guestId: 'guest_1', secret: 'sec_1' })),
  withdrawGuestInvite: jest.fn(async () => {}),
  guestLinks: jest.fn(async () => [] as GuestLinkSummary[]),
  // Echoes what it was asked for, as the server does when the level is not the
  // default. A test about the refusal path overrides it.
  setNotificationLevel: jest.fn(async (_channelId: string, level: string) => level),
  revokeGuestLink: jest.fn(async () => {}),
  acknowledgeChannelPublic: jest.fn(async () => {}),
  // Answers as the server does, the address being derived from the id: the
  // settings screen shows it, so a mock returning nothing would be a screen
  // that says a page was made and cannot say where.
  setChannelPublic: jest.fn(
    async (channelId: string, isPublic: boolean) => ({
      publicAt: isPublic ? 1_700_000_000_000 : null,
      url: isPublic ? `https://example.test/c/${channelId}` : null,
      feedUrl: isPublic ? `https://example.test/c/${channelId}/feed.xml` : null,
    })
  ),
  watchChannel: jest.fn(),
  leaveChannelView: jest.fn(),
  // **Returns `true` by default: the socket is up unless a test says it is
  // not.** `act` answers whether the action reached the socket, and a mock
  // returning `undefined` would put every screen into the queued branch —
  // which is the honest reading of `undefined` and the wrong default for a
  // fixture. See AppProvider's `act` and planning/decisions/2026-09-16-being-offline-is-one-state.md.
  act: jest.fn(() => true),
  // The seat's half, on the same terms and with the same default: `true` is
  // "it went", which is what every screen reading the answer is written
  // against. See `AppProvider.actAsSeat`.
  actAsSeat: jest.fn(() => true),
  clearError: jest.fn(),
  removeContact: jest.fn(async () => {}),
  setEmailShown: jest.fn(async () => {}),
  // Off, which is what every account is until somebody sets the column by
  // hand. The panel's own tests are the only ones that turn it on.
  debug: false,
  appearance: 'system' as 'light' | 'dark' | 'system',
  setAppearance: jest.fn((preference: 'light' | 'dark' | 'system') => {
    mockApp.appearance = preference;
  }),
  // Off, for the same reason and with the same consequence: the channel screen
  // draws a card for each of its footer's three controls unless a test says
  // otherwise, so every assertion written before the setting existed is still
  // asserting about the screen everybody gets.
  hideControlCards: false,
  setHideControlCards: jest.fn((value: boolean) => {
    mockApp.hideControlCards = value;
  }),
  // Off, which is what every account has until somebody asks — as it is for
  // all three of these now. The tests about the watch party turn it on, in as
  // many words, which is the point: a screen that draws a watch card without
  // it would be a screen no ordinary account ever sees.
  labs: false,
  setLabs: jest.fn((value: boolean) => {
    mockApp.labs = value;
  }),
};

// The views are rendered without a native audio stack: @livekit/react-native
// ships untranspiled ESM, and more importantly a render test has no business
// opening a microphone. Audio behaviour is verified on a device, not here.


/**
 * Every upload started by a test, held open rather than resolved.
 *
 * The interesting part of an upload is the middle — a percentage that is or is
 * not moving, and a Cancel that has or has not something to cancel — and a
 * mock that resolves immediately has no middle. Each entry carries the hooks
 * the screen passed in, so a test can drive progress itself, and the resolver,
 * so it can decide when the thing ends.
 */
export const uploads: Array<{
  hooks: UploadHooks;
  finish: (result: { cancelled: boolean }) => void;
  fail: (error: unknown) => void;
}> = [];



/**
 * The audio connection is held in App.tsx now, so these screens receive it
 * rather than opening it. That is the point of the change: a render test has
 * no business opening a microphone, and neither does navigating to Home.
 */
export const AUDIO = {
  status: 'idle' as const,
  message: null,
  mutedByServer: false,
  othersAudible: 0,
  speaking: [] as string[],
  failing: [] as string[],
  micOpen: true,
  // A track is published, matching `micOpen`: the ordinary connected case.
  micPublished: true,
  // A microphone exists, which is the ordinary case and the one every view
  // test means. `channel.test.tsx` is where the other one is rendered.
  inputAvailable: true,
  // Nothing has been asked of the audio session, which is what a view test
  // renders against: the diagnostic panel is gated on `mockApp.debug` and is
  // absent from every case here but its own.
  asked: null,
  // The probe harness's way back from a dead engine. Never pressed by these
  // tests: the panel it lives on is gated on `mockApp.debug`.
  reconnect: () => {},
  resubscribe: () => {},
  // The browser's two, which are constants on a phone and false in the
  // ordinary web case as well: the page is playing sound and the microphone is
  // producing some. A test that wants either notice sets it on a copy.
  playbackBlocked: false,
  micSilent: false,
  allowPlayback: () => {},
};

/** The same connection, with somebody audible on it. */
export function audioWith(...speaking: string[]) {
  return { ...AUDIO, speaking };
}



export function textOf(tree: ReactTestRenderer): string {
  const strings: string[] = [];
  const walk = (node: unknown): void => {
    if (typeof node === 'string') strings.push(node);
    else if (Array.isArray(node)) node.forEach(walk);
    else if (node && typeof node === 'object' && 'children' in node) {
      walk((node as { children: unknown }).children);
    }
  };
  walk(tree.toJSON());
  return strings.join(' ');
}

/** The visible text inside one instance, used to identify a button by label. */
export function labelOf(instance: ReactTestInstance): string {
  const out: string[] = [];
  const walk = (node: unknown): void => {
    if (typeof node === 'string') out.push(node);
    else if (Array.isArray(node)) node.forEach(walk);
    else if (node && typeof node === 'object') {
      const props = (node as { props?: { children?: unknown } }).props;
      if (props?.children !== undefined) walk(props.children);
    }
  };
  walk(instance.props.children);
  // A control drawn as a glyph has no text under it, and its name is the
  // `accessibilityLabel` instead — which is the name a screen reader reads
  // out, so it is the honest thing to search by. Only when there is no text
  // at all: plenty of rows carry both, and there the words on screen are what
  // a test naming them means. See `IconButton`.
  if (out.length === 0 && typeof instance.props.accessibilityLabel === 'string')
    return instance.props.accessibilityLabel;
  return out.join(' ');
}

/**
 * The tabs of whatever `Segmented` switches this tree draws, as a set.
 *
 * A tab is a different kind of control from a button on the pane below it,
 * and since 2026-09-12 the two can carry the same word: the channel screen's
 * *Invite* tab and the *Invite* button on the contact it shows. Searching by
 * label alone cannot tell them apart, and the pass that used to — exact text
 * before substring — stopped working the moment the tab's label became
 * exactly the button's. So the seam is the control's kind rather than its
 * wording: `findButton` looks outside this set and `findTab` looks inside it.
 *
 * Found by the `tablist` role `Segmented` puts on itself rather than by
 * importing the component: this module is loaded from inside `jest.mock`
 * factories, which are hoisted above the imports of the file doing the
 * mocking, so a value import of anything that reaches `AppProvider` breaks
 * every file that mocks it.
 */
function tabInstances(tree: ReactTestRenderer): Set<ReactTestInstance> {
  const tabs = new Set<ReactTestInstance>();
  for (const switcher of tree.root.findAll(
    (n) => n.props?.accessibilityRole === 'tablist'
  ))
    for (const tab of switcher.findAll(
      (n) => n.props?.accessibilityRole === 'button'
    ))
      tabs.add(tab);
  return tabs;
}

/**
 * A control by its label — **the one whose text is exactly this, if there is
 * one, and otherwise the first that contains it.** Never a tab: see
 * `tabInstances`, and `findTab` for the other half.
 *
 * The substring match is what almost every caller wants: most controls here
 * are named by a phrase out of a longer sentence. The exact pass in front of
 * it is for the case where the substring has two answers among the controls
 * that are left.
 */
export function findButton(
  tree: ReactTestRenderer,
  label: string
): ReactTestInstance | undefined {
  const tabs = tabInstances(tree);
  const buttons = tree.root.findAll(
    (n) => n.props?.accessibilityRole === 'button' && !tabs.has(n)
  );
  return (
    buttons.find((n) => labelOf(n).trim() === label) ??
    buttons.find((n) => labelOf(n).includes(label))
  );
}

/**
 * One answer of a labelled choice, by its label — a `Segmented` with
 * `role="choice"` rather than a tab strip.
 *
 * Its own finder rather than a case of `findButton`, for that one's reason
 * turned around: a choice is not a tab and must not be swept up by
 * `findTab`, and it is not a button either — a test enumerating the controls
 * on a card should not find two of them because a switch happens to sit
 * there. The watch card's *Watch on* is the only one today.
 */
export function findChoice(
  tree: ReactTestRenderer,
  label: string
): ReactTestInstance | undefined {
  const answers = tree.root.findAll(
    (n) => n.props?.accessibilityRole === 'radio'
  );
  return (
    answers.find((n) => labelOf(n).trim() === label) ??
    answers.find((n) => labelOf(n).includes(label))
  );
}

/**
 * Whether a labelled choice is showing this answer as the chosen one.
 *
 * `checked` rather than `selected`, which is the word a tab uses — see
 * `Segmented`'s `role`.
 */
export function chosen(
  tree: ReactTestRenderer,
  label: string
): boolean | undefined {
  return findChoice(tree, label)?.props?.accessibilityState?.checked;
}

/**
 * A tab by its label, and nothing but a tab — the mirror of `findButton`.
 * Undefined when this screen is not offering one by that name, which is what
 * a test asserting the whole bar is still there wants to ask.
 */
export function findTab(
  tree: ReactTestRenderer,
  label: string
): ReactTestInstance | undefined {
  const tabs = [...tabInstances(tree)];
  return (
    tabs.find((n) => labelOf(n).trim() === label) ??
    tabs.find((n) => labelOf(n).includes(label))
  );
}

/**
 * Press the channel screen's *Invite* tab, so the invitation controls
 * are rendered.
 *
 * The two ways into a channel used to sit at the foot of the same scroll as
 * the roster; they are one tap away now, and a test that names a button there
 * has to take that tap. It throws rather than returning quietly when the tab
 * is missing: a test that went on looking at the members tab would pass for the
 * wrong reason the day a control moved back.
 */
export function showInvites(tree: ReactTestRenderer): void {
  showTab(tree, 'Invite');
}

/** The tab you land on, for a test that has to look at two in one render. */
export function showPeople(tree: ReactTestRenderer): void {
  showTab(tree, 'People');
}

/** The notepad and the channel clipboard. */
export function showNotepad(tree: ReactTestRenderer): void {
  showTab(tree, 'Notepad');
}

/** The shared track and the recording controls. */
export function showListen(tree: ReactTestRenderer): void {
  showTab(tree, 'Listen');
}

/** What has been recorded here, and the search over their transcripts. */
export function showRecordings(tree: ReactTestRenderer): void {
  showTab(tree, 'Recordings');
}

/**
 * The watch party, which since 2026-09-18 is a tab like the other five.
 *
 * It was the one tab that was not always there, Labs deciding, and `showTab`
 * throwing when it is missing was what kept a test from quietly asserting
 * against the roster instead. The throw stays; there is nothing left that can
 * take the tab away.
 */
export function showWatch(tree: ReactTestRenderer): void {
  showTab(tree, 'Watch');
}

export function showTab(tree: ReactTestRenderer, label: string): void {
  const tab = findTab(tree, label);
  if (!tab) throw new Error(`No ${label} tab on this screen.`);
  act(() => tab.props.onPress());
}

/**
 * The button whose label is *exactly* this, where a substring catches another.
 *
 * `Share` is the case that forced it, when the recordings list stopped saying
 * `Export`: a channel screen carries `Share a guest link` beside it, so a
 * substring search for the row's own button finds that instead — and an
 * assertion that the row is closed passes or fails on a control at the other
 * end of the screen. The player's own button is now `Share` exactly, so an
 * exact search only disambiguates while that card is off screen.
 */
export function findExactButton(
  tree: ReactTestRenderer,
  label: string
): ReactTestInstance | undefined {
  return tree.root
    .findAll((n) => n.props?.accessibilityRole === 'button')
    .find((n) => labelOf(n) === label);
}

/**
 * The button whose *accessible name* is exactly this, whatever it draws.
 *
 * `labelOf` prefers the words under a control and falls back to the
 * `accessibilityLabel` only when there are none — which is right for a glyph
 * and wrong for a glyph that happens to be a character. The `+` on a
 * contact's invite row draws the text `+` and is named *Invite Miro Okafor*,
 * so `findButton` sees a button called `+` and a test naming the person finds
 * nothing. This searches the name a screen reader would read out, which is
 * the one a test should be spelling anyway.
 */
export function findNamed(
  tree: ReactTestRenderer,
  label: string
): ReactTestInstance | undefined {
  return tree.root
    .findAll((n) => n.props?.accessibilityRole === 'button')
    .find((n) => n.props?.accessibilityLabel === label);
}

/**
 * The offer a contact's `+` opens: its sentence, and the two ways in.
 *
 * Presses the mark for `name` and reads the expansion that appears under the
 * row. **It read back the last `Alert.alert` until 2026-09-22**, which is why
 * the callers still mock one — the fork is drawn in the list now, and nothing
 * here raises an alert at all.
 *
 * `choices` is every offer drawn and `refused` those drawn and unavailable,
 * which is the pair the alert could not express: a full roster used to remove
 * `Member` from the list, there being no greying a button inside an alert,
 * and now greys it. Pressing one is still awaited — the guest half is a round
 * trip to the server.
 */
export function invitePrompt(
  tree: ReactTestRenderer,
  name: string
): {
  message: string;
  choices: string[];
  refused: string[];
  /** Awaited always: one of the two offers is a round trip to the server. */
  take: (label: string) => Promise<void>;
} {
  const mark = findNamed(tree, `Invite ${name}`);
  if (!mark) throw new Error(`No invite mark for ${name}.`);
  if (!mark.props?.accessibilityState?.expanded) act(() => mark.props.onPress());
  // By their words rather than by position: `Guest` and `Member` are exact
  // labels that nothing else on this screen carries, and at most one row's
  // offer is open at a time. `findNamed` is the wrong finder here — a
  // `Button` that draws its word sets no `accessibilityLabel`, deliberately,
  // so that a screen reader reads the word and any `sublabel` under it.
  const offers = ['Guest', 'Member']
    .map((label) => ({ label, node: findButton(tree, label) }))
    .filter((offer) => offer.node);
  if (offers.length === 0)
    throw new Error(`The invite mark for ${name} opened nothing.`);
  return {
    // The sentence sits between the row and the buttons; the whole screen's
    // text is what a caller wants to assert against anyway, and `textOf` is
    // the thing every other test reaches for.
    message: textOf(tree),
    choices: offers.map((offer) => offer.label),
    refused: offers
      .filter((offer) => offer.node!.props.accessibilityState?.disabled)
      .map((offer) => offer.label),
    take: async (label) => {
      const offer = offers.find((o) => o.label === label);
      if (!offer) throw new Error(`The offer for ${name} has no ${label}.`);
      await act(async () => {
        await offer.node!.props.onPress?.();
      });
    },
  };
}

export function render(element: React.ReactElement): ReactTestRenderer {
  let tree!: ReactTestRenderer;
  act(() => {
    tree = renderer.create(element);
  });
  return tree;
}

/**
 * What the tier requires, as no-ops — and the Channels tab, which is what it
 * opens on and what almost every test below is about.
 *
 * Spread first, so a test that is about one of them overrides just that one and
 * every other site stays quiet about navigation it does not exercise. These
 * tests are almost all about what Home *shows*.
 *
 * It exists because `onOpenContacts` was added to HomeView and broke
 * thirty-eight call sites that had each written the same two no-ops out by
 * hand — a compile error per test, none of them about anything the test was
 * testing. The next required handler now costs one line here, which is what it
 * cost when the tier arrived and took `list` and `onList`.
 */
export const homeNav = {
  list: 'channels' as const,
  onList: () => {},
  onEnterChannel: () => {},
  onOpenSettings: () => {},
};

export function channelOf(mutate: (s: ChannelState) => ChannelState = (s) => s) {
  const base = createChannel({
    id: 'sess_1',
    initiator: ME,
    invitees: [THEM],
    now: NOW,
  });
  return mutate(reduce(base, { type: 'ENTER', userId: THEM }, NOW));
}

export function showChannel(
  channel: ChannelState,
  recordings: RecordingView[] = [],
  // `watching` is the server's count of who has the film up, which no
  // reducer holds — see `ChannelView.watching`. Passed here for the same
  // reason `cohort` is: it rides the snapshot and nothing in `core/` can
  // produce it.
  extra: {
    cohort?: number | null;
    watching?: string[];
    /** Whether this reader has yet to be told the channel has a page. */
    publicNotice?: boolean;
  } = {}
) {
  const names: Record<string, string> = {
    [ME]: 'Me',
    [THEM]: 'Dana Chu',
    acct_3: 'Miro Okafor',
    acct_4: 'Priya Raman',
  };
  mockApp.channelViews[channel.id] = {
    channel,
    participants: channel.participants.map((id) => ({
      id,
      displayName: names[id] ?? id,
    })),
    recordings,
    pingableAt: {},
    serverNow: NOW,
    ...extra,
  };
  // Being in the channel and being the device that is in it are different
  // facts, and these tests mean both unless they say otherwise.
  if (channel.present.includes(ME)) mockApp.standingIn = channel.id;
}

/**
 * Who I am a contact of, which is half of whether I may ping them.
 *
 * Stated per test rather than folded into `showChannel`, which has well over a
 * hundred call sites: `app.home` is read by the Invite section and by the
 * profile as well, so making everybody a contact by default would quietly
 * change what those render in tests about neither — and would mask this gate
 * rather than exercise it. Set before `showChannel`, per the convention the
 * other home-reading tests already follow.
 */
export function knowing(...ids: string[]) {
  mockApp.home = {
    invites: [],
    rejoinable: [],
    contacts: ids.map((id) => ({
      account: { id, displayName: id === THEM ? 'Dana Chu' : id },
      status: 'accepted' as const,
    })),
  };
}

/**
 * The three module mocks, as factories rather than as `jest.mock` calls.
 *
 * They cannot be called here. `jest.mock` is hoisted above the imports of the
 * file it is written in and of no other, so a call in this module would run
 * only once this module had been imported — by which time the importing test
 * file has already pulled in the real `ChannelView` and, through it, the real
 * provider. Each test file therefore writes the three one-line calls itself
 * and reaches back here for the factory, which is the documented escape hatch
 * from the hoisting rule and the reason the `require` is inside.
 *
 * The state stays single: every file gets this module's one `mockApp` and one
 * `uploads`, so a helper written against either behaves the same everywhere.
 */
export const downloadMock = () => ({
  shareRecording: jest.fn(async () => {}),
  shareTrack: jest.fn(async () => {}),
});

export const uploadMock = () => ({
  pickAndUploadTrack: jest.fn(
    (_token: string, _channelId: string, hooks: UploadHooks = {}) =>
      new Promise((finish, fail) => {
        uploads.push({ hooks, finish, fail });
      })
  ),
});

export const appProviderMock = () => ({
  useApp: () => mockApp,
  AppProvider: ({ children }: { children: React.ReactNode }) => children,
});

/** What the old file's `beforeEach` did. Every test file calls it in one. */
export function resetHarness(): void {
  // Who the app thinks it is. Reset like everything else here, because a test
  // that renders a channel from a *guest's* side has to say so by setting it
  // and would otherwise leave every later test in the file signed in as
  // somebody who is not in the room.
  mockApp.me = { id: ME, displayName: 'Me' };
  mockApp.home = null;
  mockApp.channelViews = {};
  mockApp.seatViews = {};
  mockApp.goneChannels = [];
  mockApp.standingIn = null;
  mockApp.nearbyIn = [];
  mockApp.nearbyArrival = {};
  mockApp.displaced = false;
  mockApp.screens = [];
  mockApp.screenFor = null;
  mockApp.screenAsked = null;
  // **Reset with its two neighbours**, which it was not until 2026-09-18: a
  // test that set it left every later test in the file believing another of
  // this account's devices was showing a film, which is exactly the state
  // that stops a party taking the screen it is looking at.
  mockApp.screensElsewhere = [];
  mockApp.expired = false;
  mockApp.updateUrl = null;
  mockApp.notifications.ask = 'none';
  mockApp.notifications.permission = 'granted';
  mockApp.notifications.canPrompt = false;
  // Everything read, and the keychain has answered — the state in which no tab
  // wears a dab, which is what every test but the dab ones is about.
  mockApp.helpSeen.seenAnsweredAt = Number.MAX_SAFE_INTEGER;
  mockApp.helpSeen.loaded = true;
  mockApp.forcedDabs = false;
  mockApp.forceDabs.mockClear();
  mockApp.introduction = { show: 'none' };
  mockApp.dismissStep.mockClear();
  mockApp.status = 'open';
  mockApp.appearance = 'system';
  mockApp.hideControlCards = false;
  mockApp.labs = false;
  mockApp.debug = false;
  mockApp.loadHelp = emptyHelp();
  mockApp.askHelp = takesQuestion();
  uploads.length = 0;
  uploads.length = 0;
  jest.clearAllMocks();
}
