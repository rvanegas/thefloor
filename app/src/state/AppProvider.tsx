import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
// Aliased: `AppState` is already the name of this file's own state shape.
import { AppState as NativeAppState, Platform } from 'react-native';
import type {
  ClientAction,
  HelpQuestion,
  HelpView,
  HomeView,
  LeaderboardEntry,
  ProfileView,
  PublicAccount,
  ChannelView,
  ScreenDevice,
  SupportView,
} from '../../../core/protocol';
import type { ImHandles } from '../../../core/im';
import type { NotificationLevel } from '../../../core/notifications';
import { useHelpSeen, type HelpSeen } from './useHelpSeen';
import { isRecordingActive } from '../../../core/recording';
import { appBuild } from '../api/build';
import { recordEvent } from '../audio/diagnostics';
import { startShippingDiagnostics } from '../audio/shipping';
import { mustUpdate } from '../api/expiry';
import { api, ApiError, type GuestLinkSummary, onSignedOut } from '../api/http';
import { Realtime, type ConnectionStatus } from '../api/socket';
import { shouldReport } from './attention';
import { storage } from './storage';
import {
  onNotificationTap,
  registerIfGranted,
  sweepArrivals,
  sweepChannel,
} from '../push';
import {
  useNotificationAsk,
  type NotificationAsk,
} from './useNotificationAsk';
import { useInstall } from './useInstall';
import { isConversing } from './conversing';
import { useIntroduction } from './useIntroduction';
import type { Introduction, StepId } from './introduction';
import type { TriedId } from './tried';
import type { NavAction } from '../../../core/navigation';
import {
  APPEARANCE_KEY,
  applyPreference,
  isPreference,
  type ColorSchemePreference,
} from '../ui/appearance';
import { takeInvite } from '../ui/handover';
import {
  DEFAULT_ACCOUNT_SETTINGS,
  type AccountSettings,
} from '../../../core/settings';

const TOKEN_KEY = 'thefloor.token';
/**
 * The address most recently signed in on this install.
 *
 * Written when a sign-in succeeds and **never removed** except by *Forget this
 * phone*: signing out does not make somebody a new user, and this is the only
 * signal the sign-in screen has about which kind of person is looking at it.
 * The server cannot tell it — `/auth/request-code` deliberately answers the
 * same whether or not an address has an account, so that sign-in cannot be
 * used to ask which addresses exist, and by the time the answer is knowable
 * the code has already been spent.
 *
 * **One address rather than a list, and the most recent one.** What it buys
 * over a bare "somebody has signed in here" flag is the phone that has held
 * two accounts: a person signing up on a friend's handset types an address
 * this key does not match and is offered the opt-in, where a flag would have
 * taken them for a returning user and asked nothing. A list would extend that
 * to every account a device has ever held, which is more addresses at rest for
 * a case that is rarer than the one this covers.
 *
 * **It is the one piece of data this app keeps on a device that identifies a
 * person**, so it is worth knowing where it sits: the keychain on iOS, which
 * outlives deleting the app, and `localStorage` in a browser. Plaintext, and
 * deliberately — it is somebody's own address on somebody's own device, which
 * is no secret from them, and hashing would only have obscured it from the one
 * reader it could never be hidden from anyway. *Forget this phone* is what
 * clears it; see `INSTALL_KEYS`.
 *
 * **What it cannot do is the reason it is affordable.** It decides whether one
 * checkbox is drawn. A second phone has no record of any address and so asks
 * again, which is harmless: that box is a grant and never a withdrawal, so
 * ticking it twice keeps the first date and leaving it clear takes nothing
 * away. See `marketingEmail` in core/settings.ts.
 */
const LAST_IDENTIFIER_KEY = 'thefloor.lastIdentifier';

/**
 * Whether two addresses name the same person, matched the way the server
 * matches them — trimmed, and case-insensitively, since `byIdentifier` looks
 * up `COLLATE NOCASE`. `sameIdentifier` in server/src/accounts.ts is the same
 * rule; a stricter one here would re-ask somebody who typed their own address
 * with a capital letter this time.
 */
function sameIdentifier(x: string, y: string): boolean {
  return x.trim().toLowerCase() === y.trim().toLowerCase();
}
/**
 * The two keys the tap setting used to be cached under.
 *
 * **Kept only to be deleted off devices that still hold them.** The setting
 * went on 2026-09-21 and a tap only ever looks now, so nothing reads either of
 * these — but a phone that ran an older build still has one sitting in its
 * keychain, and a value nothing can reach or explain is exactly what the
 * account-deletion path exists to make impossible. `applySettings` clears them
 * on the first `hello` and `forgetSettings` on the way out; both lines may go
 * once no install can plausibly still be carrying one.
 */
const TAP_TO_LOOK_KEY = 'thefloor.tapToLook';

/**
 * What that key was called until 2026-09-07, holding the negation of it.
 *
 * Read once, when the current key is missing, so that a phone upgrading into
 * this build does not spend the first second of its first cold start with a
 * tap that steps in for somebody who turned that off. Removed as soon as the
 * server states the settings, which is a second later. Delete this, and the
 * fallback that reads it, once no install can plausibly still be carrying it —
 * it is a cache, so the cost of being wrong about that is one second and not a
 * setting. See `tapToLook` in core/settings.ts.
 */
const LEGACY_TAP_TO_STEP_IN_KEY = 'thefloor.tapToStepIn';

/**
 * Whether the channel screen repeats its footer's controls as cards, cached
 * from the account in exactly the way the key above is.
 *
 * Stored as `'true'`/`'false'` and read as "only `'true'` is on", so the
 * default survives a missing key and a build that never wrote one. The gap
 * this covers is smaller than the tap's — nobody is mid-gesture on a
 * channel screen a second after a cold start — but it is cached anyway rather
 * than left to arrive, because the alternative is a screen that draws four
 * cards and then removes them under a thumb already reaching past them.
 */
const HIDE_CONTROL_CARDS_KEY = 'thefloor.hideControlCards';

/** What that key was called until 2026-09-07, holding its negation. */
const LEGACY_CONTROL_CARDS_KEY = 'thefloor.controlCards';

/**
 * Where the channel tabs used to be cached, written by builds 193 and earlier
 * and read by nothing since 2026-09-13 — the tabs are at the top for
 * everybody. Kept only so the two paths that empty this install can empty it
 * too: `forgetSettings` below and `INSTALL_KEYS` in state/storage.ts, which
 * would otherwise leave a dead string on every phone that upgrades. The same
 * shape the two legacy keys above have. See
 * planning/decisions/2026-09-13-the-channel-tabs-stay-at-the-top.md.
 */
const DEAD_TABS_AT_FOOT_KEY = 'thefloor.tabsAtFoot';

/**
 * Whether the experimental features are visible to this account, cached from
 * the account the way the two keys above are.
 *
 * Read the way both keys above are — only `'true'` turns it on — because the
 * default is off, as it is for all three since 2026-09-07. That is what makes
 * a missing key, a key from a build that never wrote one and a value nobody
 * recognises all mean "not asked for", which is the honest reading of every
 * one of them.
 */
const LABS_KEY = 'thefloor.labs';

/**
 * Where the chosen loudness used to be cached, written by builds 211 and
 * earlier and read by nothing since 2026-09-15 — the chime has one loudness
 * again, `CHIME_AMPLITUDE` in the audio-route module. Kept on
 * `DEAD_TABS_AT_FOOT_KEY`'s terms above: only so the two paths that empty this
 * install can empty it too. See
 * planning/decisions/2026-09-15-the-chime-has-one-loudness-again.md.
 */
const DEAD_CHIME_AMPLITUDE_KEY = 'thefloor.chimeAmplitude';

/**
 * How long `START_RECORDING` waits for a microphone before asking anyway.
 *
 * **The wait is the point and the ceiling is the safety.** Waiting buys the
 * server a track to point its egress at from the first instant; the ceiling
 * means nothing that could go wrong with a microphone can cost somebody the
 * ability to record at all. A device with no input never publishes, and a
 * recording of the other party is still worth having.
 *
 * Two seconds because a publish on a working connection is comfortably inside
 * it, and because this is a button somebody just pressed: longer would be felt
 * as the app ignoring them.
 */
const RECORD_PUBLISH_WAIT_MS = 2_000;

interface AppState {
  ready: boolean;
  token: string | null;
  me: PublicAccount | null;
  /**
   * Whether this account is shown the audio diagnostic panel, per the server's
   * `hello`.
   *
   * **Not persisted, and deliberately false until a socket says otherwise.** A
   * cached flag would survive the flag being turned off, so somebody would be
   * left with a panel nobody could take away without a reinstall; and it is
   * only ever read by a screen that needs a live connection to be interesting
   * anyway. It arrives within the same round trip as `me`, which is what every
   * other screen already waits for.
   */
  debug: boolean;
  /**
   * Whether this account may see the invitation standings, from the same
   * `hello` and on exactly the same terms as `debug` above: not persisted,
   * false until a socket says otherwise, so revoking the column takes the
   * screen away at the next connection rather than at the next reinstall.
   */
  leaderboard: boolean;
  home: HomeView | null;
  /**
   * The latest snapshot of each channel this client is watching, by id.
   *
   * A map rather than a single slot, and that is the whole point. A watch is
   * not exclusive: the server pushes a snapshot for *every* channel this
   * socket has said it is watching, and it goes on watching one after the
   * screen has moved to another — deliberately, since a watch is also what
   * reports presence when the socket dies. One slot meant the last snapshot to
   * arrive won, whichever channel it was about, so a change in a channel
   * nobody was looking at overwrote the one on screen: the channel screen fell
   * back to "Loading channel…" and, worse, the audio hung up, because the
   * connection follows the channel the snapshot says you are present in and
   * that snapshot was now about somewhere else. Two people idly moving between
   * two channels is enough to produce it. See planning/decisions/DECISIONS.md.
   */
  channelViews: Record<string, ChannelView>;
  /**
   * Channels the server has said are gone — ended and cleaned up, or no longer
   * ours to see. Kept so a screen still open on one can say so, rather than
   * waiting forever for a snapshot that is never coming.
   */
  goneChannels: string[];
  /**
   * The last move the server reported: a conversation that changed channels
   * because somebody was asked into an unnamed one and arrived. **The server
   * stopped sending `channel.moved` on 2026-08-17** — unnamed channels widen
   * rather than move — so this is never set any more, and is kept only so an
   * old server would still be understood.
   *
   * Kept as state rather than delivered as an event because the screen that
   * has to follow it may not be mounted at the moment it lands — coming back
   * to a channel you were in should land you where its people actually are.
   */
  movedChannel: { from: string; to: string } | null;
  /**
   * Whether another of this account's devices has taken the room, or given it
   * up on this account's behalf.
   *
   * An account may be signed in on several devices at once and is still in at
   * most one channel, so the newest device to step into one is the device
   * standing there. When the other device went somewhere *else*, the snapshot
   * says so by itself and this flag changes nothing; when it stepped into the
   * same channel, the account is present either way and the snapshot cannot
   * say anything at all — which is the case this exists for. A Step Out taken
   * on another device says it too, and there the snapshot does say so: this
   * arrives beside it and stops this device re-entering on its next
   * connection, which is what used to undo that Step Out.
   *
   * What it does is withhold `live` in App.tsx, which is what the audio
   * follows. It is not a screen and not an error: the channel is still open,
   * still watched, and still shows Enter — pressing it takes the room back,
   * which is the same gesture that took it away on the other device.
   *
   * Cleared by entering anywhere from this device, since that is precisely the
   * act of standing somewhere again, and by signing out.
   */
  displaced: boolean;
  /**
   * This account's live instances, as of the last time they were asked for.
   *
   * Empty until somebody taps *Watch on another device*, and not refreshed
   * afterwards: the list is read at the moment a choice is made, and one that
   * reordered itself under a finger would be worse than one a second old.
   */
  screens: ScreenDevice[];
  /**
   * The channels this account's *other* instances are showing a film for.
   *
   * **Live, where `screens` is frozen**, and they are two questions rather
   * than one. That list is the picker's and is read at the moment of
   * choosing; this is the single fact the watch card's *Watch on* switch
   * needs — whether the film is on somewhere else of yours — and it has to
   * arrive by itself, because the device that hands a film away is the one
   * that would otherwise show no selection at all.
   *
   * Pushed by the server whenever any of the account's instances starts or
   * stops showing something, and once when this one connects. Never includes
   * this device: see `screenFor` for that half.
   */
  screensElsewhere: string[];
  /**
   * The channel this device has been asked to show a film for, or null.
   *
   * Set by another of this account's own instances, and by nothing else. It is
   * **not** presence: this device does not step in, does not take the room and
   * does not displace whatever is holding it — see `screen` in
   * core/protocol.ts.
   */
  screenFor: string | null;
  /**
   * A channel this device has just been *asked* to show, waiting to be opened.
   *
   * **`screenFor`'s other half, and the two are not the same question.** That
   * one is a role and holds for as long as the film is here; this one is an
   * arrival, and it is spent the moment something has acted on it — see
   * `takeScreenAsked`, which is what spends it.
   *
   * It exists because a television is a whole screen rather than a picture in
   * a corner, and nothing else in the app can put this device on that screen.
   * The person who sent the film here is looking at their other device; there
   * is no tap to come on this one, and until 2026-09-20 there was nothing at
   * all — the picture floated over whatever this device happened to be
   * showing, which is the state the second device was cleaned up to stop
   * being.
   *
   * **Set only by the server's ask, never by a local declaration**, which is
   * the whole of why it is a field rather than a reading of `screenFor`.
   * Pressing *This device* on the device you are holding sets `screenFor` too,
   * and a rule written against that would drag somebody who had pressed Home
   * back into the channel they had just left.
   */
  screenAsked: string | null;
  /**
   * The channel *this device* is standing in, or null.
   *
   * **The account's presence and this device's are different facts, and only
   * this one is about the app you are holding.** A snapshot reports the
   * account: it says present whether the room is being held here, on a phone
   * in another room, or by a process that has since been killed. Reading the
   * roster as though it described this device is what let a second device open
   * a channel it had never entered, draw itself a Step Out button, and join
   * the audio room — where the media plane admits one participant per account
   * and the two devices took it from each other in turn.
   *
   * Owned by `Realtime`, which has kept it all along as the thing a reconnect
   * re-enters, and mirrored here so the screen and the audio can follow it.
   * See `onStanding`.
   */
  standingIn: string | null;
  /**
   * The channels this **device** declared itself nearby in.
   *
   * **Its own fact, beside `standingIn` and for the same reason.** Being in
   * `waiting` is the account's, and a snapshot says it whether the wait was
   * declared here, declared on another phone, or merely inferred from a socket
   * that went. Only a declaration made *here* says so on this device when
   * somebody arrives — see `useNearby` — because a wait somebody's other
   * phone is in the middle of is not this screen's to narrate.
   *
   * **A set rather than one id, since 2026-09-12, because nearby is not
   * exclusive and this was the one place that assumed it was.** `standingIn`
   * beside it is a single id and correctly so: entering steps you out of
   * everywhere else, so there is one room a device can be standing in. Nothing
   * of the kind is true here — the wire says so, `nearby` being a bit on every
   * home entry rather than one id on the snapshot — and holding one id meant
   * declaring in a second channel silently forgot the first. The server went
   * on listing both waits, Home went on pinning both bars, and the absent
   * phone went on buzzing when somebody walked into the forgotten one; the
   * only thing that stopped happening was the arrival being said at all,
   * which is the whole of what being nearby does for the person who declared
   * it.
   *
   * Entries are cleared by anything that ends *that* declaration: entering,
   * stepping out, leaving. Being displaced and signing out clear the lot. Not
   * cleared by a wait lapsing to *Stepped out*, which the server decides and
   * `useNearby` reads off the snapshot rather than from here.
   */
  nearbyIn: string[];
  /**
   * Who has just stepped into each channel this device is nearby in, keyed by
   * channel.
   *
   * **All that is left of promotion.** Until 2026-09-08 an arrival stepped
   * this phone in by itself; it then put a *Step in* under the thumb, and
   * since 2026-09-15 it says one line under the roster and nothing more.
   * `state/nearby.ts` carries the rule,
   * `decisions/2026-09-08-the-arrival-is-offered.md` the reversal and
   * `decisions/2026-09-15-the-arrival-is-a-line.md` the card's deletion —
   * every button on it was somewhere else on the same screen.
   *
   * **Keyed rather than single, for the reason `nearbyIn` is a set**: two
   * rooms you are within reach of can each receive somebody, and one slot
   * meant the second arrival overwrote the first — a room going quietly
   * unmentioned. Each channel's screen draws its own.
   *
   * The array accumulates, so two people arriving in quick succession are one
   * line naming both rather than a line that forgets the first. It is not
   * filtered here: whether somebody named is still in the room is a question
   * about the roster the screen is already drawing, and `ChannelView` answers
   * it there rather than this provider keeping a second copy of presence.
   *
   * **Nothing dismisses an entry**, there being nothing to answer since the
   * card went; one is cleared by whatever clears its channel from `nearbyIn`,
   * since an arrival outside a declaration is news about nothing.
   */
  nearbyArrival: Record<string, string[]>;
  /**
   * A channel where recording has been asked for and not yet confirmed.
   *
   * **The microphone stopped reading it on 2026-09-08.** It was passed to both
   * audio predicates because alone in a channel the microphone was closed and a
   * recording was what reopened it — and *a recording is running* is learned
   * from the server, so capture began a round trip after the button and a short
   * run ended having captured nothing. Stepping in is now the claim, so the
   * device is already open before the button and there is nothing left to be
   * ahead of.
   *
   * What it still does is the other half, which is unchanged: `act` holds
   * `START_RECORDING` back until a microphone track exists. Cleared when the
   * snapshot confirms the run, and on a timer in case it never does.
   */
  recordingAsked: string | null;
  status: ConnectionStatus;
  /**
   * Whether the socket has been gone long enough to stop calling it a blip.
   *
   * **Not derivable from `status`**, which cycles through `connecting` and
   * `closed` several times a second while the client is retrying. This is the
   * sticky one: true from `OFFLINE_AFTER_MS` after the drop until an open
   * succeeds, and what `Root` renders the wall from. See socket.ts and
   * planning/decisions/2026-09-16-being-offline-is-one-state.md.
   */
  offline: boolean;
  lastError: string | null;
}

interface AppValue extends AppState {
  /** Server time, tracked against the server's clock rather than the device's. */
  serverNow: () => number;
  /**
   * Says somebody is attending this application, which is the whole of what a
   * client does about attention since 2026-09-09. See `state/attention.ts`.
   *
   * Rate-limited here rather than by each caller, there being three with
   * nothing in common: a touch anywhere in the tree, the app coming forward,
   * and a poll of the foreground. `force` skips the gate for the one kind of
   * evidence worth a message immediately — arriving back, which is what can
   * rescue a clock about to run out.
   */
  reportAttentive: (force?: boolean) => void;
  /**
   * Says which channel screen is open, so a touch can be attributed to the
   * room it was attention to. Null on the way out.
   */
  lookAt: (channelId: string | null) => void;
  requestCode: (identifier: string) => Promise<void>;
  verify: (
    identifier: string,
    code: string,
    displayName?: string,
    marketingEmail?: boolean
  ) => Promise<void>;
  signOut: () => Promise<void>;
  /**
   * Signs out every other device, and stays signed in here.
   *
   * Answers with how many sessions ended, which is the only thing the caller
   * can say afterwards — nothing lists sessions, so "two others were signed
   * out" is the whole of what is knowable. Zero is an ordinary answer.
   *
   * Rejects rather than swallowing a failure, unlike `signOut`: this one is
   * about somewhere else, so there is nothing locally that having done it
   * would explain, and a screen that says devices were signed out when none
   * were is worse than an error.
   */
  signOutOthers: () => Promise<number>;
  /**
   * Deletes the account and signs out. Rejects — leaving you signed in — if the
   * server did not do it, since the alternative is a screen that says you have
   * no account while the server still has one.
   */
  deleteAccount: () => Promise<void>;
  requestContact: (identifier: string) => Promise<{ accepted: boolean }>;
  /**
   * A fresh invite link to hand to one person, or null when there is no
   * username to build one out of.
   *
   * Null is a state rather than a failure, and the screen asking draws a way
   * to choose a username from it. Each call mints — a link is good once, so
   * two people must not be handed the same one.
   */
  inviteLink: () => Promise<string | null>;
  /** Takes back a sent request, by the address it went to. */
  withdrawContact: (identifier: string) => Promise<void>;
  acceptContact: (contactId: string) => Promise<void>;
  declineContact: (contactId: string) => Promise<void>;
  /**
   * Ends an accepted contact. Mutual, and it takes the channels that held only
   * the two of you — which is why it is offered from a profile, where there is
   * room to say so, rather than from a row in a list.
   */
  removeContact: (contactId: string) => Promise<void>;
  /**
   * Shows your sign-in address to one contact, or stops showing it.
   *
   * No snapshot follows and none is fetched here: what changes is one field on
   * one profile, and the screen that asked for it is the screen holding that
   * profile. It re-reads it, the same way it read it in the first place.
   */
  setEmailShown: (contactId: string, shown: boolean) => Promise<void>;
  /** Reads a profile. Rejects when it is not yours to see. */
  loadProfile: (accountId: string) => Promise<ProfileView>;
  /**
   * Asks one absent participant to come to a channel, in your own words.
   *
   * Nothing about the channel changes, so this is not an action and no
   * snapshot follows it — the only thing that happens is a notification on
   * somebody else's phone. Rejects with a message worth showing when the
   * server refuses, which it does for ordinary reasons: they have walked in
   * since the screen was drawn, or somebody pinged them a moment ago.
   */
  ping: (channelId: string, targetId: string, text: string) => Promise<void>;
  /** Where to donate, and what you have already given. */
  loadSupport: () => Promise<SupportView>;
  /**
   * The questions you have asked of The Floor, with any answers.
   *
   * Read when the screen opens and held nowhere, for the reason `loadSupport`
   * gives and one more: an answer arrives because a person wrote it, at a
   * moment no client can be told about, so anything cached here is stale by an
   * unknown amount.
   */
  loadHelp: () => Promise<HelpView>;
  /**
   * Asks one, and gives back the question as the server stored it — trimmed,
   * with the id and the timestamp it will be listed under.
   *
   * Throws `ApiError` when the server refuses, which it does for reasons the
   * screen can print verbatim: an empty question, one over the length, or too
   * many already waiting.
   */
  askHelp: (text: string) => Promise<HelpQuestion>;
  /**
   * The invitation standings, read when the screen opens.
   *
   * Held nowhere, for the reason `loadSupport` is not: one screen reads it, it
   * gates nothing, and a cached ranking is wrong the moment anybody signs up.
   */
  loadLeaderboard: () => Promise<LeaderboardEntry[]>;
  /**
   * Mints a link that lets somebody with no account knock at this channel from
   * a browser, and hands it to the share sheet.
   *
   * A fresh link each time it is tapped, which is the server's model rather
   * than a shortcut here: links are handed out, and one per audience is what
   * makes revoking a link mean something narrower than closing the door on
   * everybody.
   */
  inviteGuest: (channelId: string) => Promise<string>;
  /** Every link this channel has, for settings. */
  guestLinks: (channelId: string) => Promise<GuestLinkSummary[]>;
  /**
   * Sets how loudly one channel may interrupt you, and resolves to what the
   * server stored — which is the answer to show, not the one just sent.
   */
  setNotificationLevel: (
    channelId: string,
    level: NotificationLevel
  ) => Promise<NotificationLevel>;
  revokeGuestLink: (channelId: string, linkToken: string) => Promise<void>;
  /**
   * Turns this channel's public page on or off, resolving to the page's
   * address or null.
   *
   * Any member may. It decides whether there is a page at all — nothing
   * appears on it until every participant of a given recording has agreed to
   * that recording separately.
   */
  setChannelPublic: (
    channelId: string,
    isPublic: boolean
  ) => Promise<{ url: string | null; feedUrl: string | null }>;
  /**
   * Agrees that one recording may be published, or takes that agreement back.
   *
   * One call rather than two because the card offers one control: the
   * viewer's own agreement, on or off. What it does to the recording depends
   * on everybody else's, which is the server's business and the card reads
   * back off the snapshot.
   */
  setPublishConsent: (recordingId: string, agreed: boolean) => Promise<void>;
  /**
   * Sets what this channel declares about itself for a podcast directory:
   * its language, whether it is explicit, and which category it is under.
   *
   * Absent fields are unchanged, so a control sends only its own.
   */
  setChannelDeclarations: (
    channelId: string,
    declarations: {
      language?: string | null;
      explicit?: boolean | null;
      category?: string | null;
    }
  ) => Promise<void>;
  /**
   * Asks somebody you share a channel with to be a contact. Resolves to
   * whether it went straight through, which happens when they had already
   * asked you.
   */
  connectWith: (accountId: string) => Promise<{ accepted: boolean }>;
  /** Writes your own; whatever is left undefined is left alone. */
  saveProfile: (changes: {
    displayName?: string;
    im?: ImHandles;
    /** Blank gives it up; see `core/username.ts`. */
    username?: string;
  }) => Promise<void>;
  /** Sends a code to an address you would like to sign in with instead. */
  requestEmailChange: (identifier: string) => Promise<void>;
  /** Spends it and moves the account, resolving to the profile that results. */
  confirmEmailChange: (
    identifier: string,
    code: string
  ) => Promise<ProfileView>;
  startChannel: (contactIds: string[]) => Promise<string>;
  watchChannel: (channelId: string) => void;
  /** Asks the server which of this account's instances could show a film. */
  listScreens: () => void;
  /**
   * Hands the film to one of them — or, with a null device, to whichever is
   * standing in the channel, which is how a television gives the picture back
   * to the device holding the room. See `ClientMessage.screens.use`.
   */
  useScreen: (channelId: string, device: string | null) => void;
  /**
   * Says this device is showing a film for that channel, or for none.
   *
   * Two things read the answer and they are not the same thing: the picker, so
   * that a connected-but-idle device is not offered as a screen, and this
   * device itself, which is what draws the player.
   */
  showScreenFor: (channelId: string | null) => void;
  /**
   * Spends {@link AppState.screenAsked}, the caller having acted on it.
   *
   * **Spent rather than latched**, which matters for the one sequence a
   * latched string gets wrong: a film sent here, sent away, and sent back
   * again names the same channel both times, so nothing would change and the
   * second arrival would open nothing. The eviction that comes between them
   * sets this to null by itself — the server asks with a null channel — but
   * a television that let go of the picture on its own, by being navigated
   * away from, gets no such message.
   */
  takeScreenAsked: () => void;
  leaveChannelView: (channelId: string) => void;
  /**
   * Dispatches a channel action, returning whether it reached the socket.
   *
   * **A screen that records the action as done must check this.** `false`
   * means it was queued or deferred, so nothing has happened yet and may
   * never; the caller's own record of "saved" is what otherwise stops it ever
   * being retried. See `ChannelSettingsView.persist` and planning/decisions/2026-09-16-being-offline-is-one-state.md.
   */
  act: (channelId: string, action: ClientAction) => boolean;
  /**
   * Records that somebody arrived in one of the channels this device is nearby
   * in.
   *
   * Called by `useNearby`, which does the noticing and nothing else. It is
   * here rather than in that hook's own state because the line is drawn on a
   * screen the hook does not own, and because everything that ends a
   * declaration already clears its neighbour `nearbyIn` in this file.
   */
  noteNearbyArrival: (channelId: string, who: string[]) => void;
  /**
   * Tells this provider whether a microphone track is published right now.
   *
   * The audio hook is mounted above the screens and this provider knows
   * nothing about rooms, so the one fact `act` needs about the media plane is
   * handed to it rather than reached for. See the `START_RECORDING` branch of
   * `act` for what it is needed for.
   */
  reportMicPublished: (published: boolean) => void;
  /**
   * Says this device is speaking into a channel that is withholding it, or
   * has stopped.
   *
   * Here for `reportMicPublished`'s reason inverted: the fact is known only to
   * the audio hook mounted above the screens, and the socket is known only to
   * this provider. See `ClientMessage.channel.speaking` for why the media
   * plane cannot carry it.
   */
  reportSpeaking: (channelId: string, speaking: boolean) => void;
  clearError: () => void;
  /**
   * A channel a notification asked to be opened, waiting to be navigated to.
   *
   * Held here rather than acted on where it arrives, because a tap can land
   * before there is anything to navigate — during a cold start the app is
   * still restoring its token when the response is read.
   *
   * **Three states and not two, which is why this is an object and not the
   * boolean it was until 2026-09-15.** No tap is `null`; a tap naming a
   * channel carries it; a tap naming nothing is an object with a null
   * `channelId`, and still has to navigate — to the live rooms, which is what
   * every tap did while the payload was being ignored. Folding the last two
   * together would make an unreadable payload silently do nothing, which is
   * the failure the old code was safe from only by never reading one.
   *
   * A fresh object per tap, deliberately: two pings from the same channel in a
   * row are two taps, and a value compared equal to its predecessor would let
   * the second one do nothing.
   */
  notificationTap: { channelId: string | null } | null;
  clearNotificationTap: () => void;
  /**
   * This build is below the floor the server still answers, so nothing it
   * does can be trusted to mean what the screens say it means.
   *
   * True only on a positive answer — a build this app knows, a `minBuild` the
   * server gave, and the first below the second. An unreachable server leaves
   * it false, which is the pre-existing behaviour and the safe one: see
   * api/expiry.ts for why the two failures are not symmetric.
   */
  expired: boolean;
  /** Where to get a newer build, when the server has been told. */
  updateUrl: string | null;
  /**
   * Light, dark, or follow the phone. Applied to the window immediately.
   *
   * **An account setting**, since 2026-08-31: somebody who has chosen dark has
   * chosen it, and signing in on a second device to find the app light is the
   * app forgetting something it was told. It is applied on the tap and sent to
   * the server, which tells every other device this account holds.
   *
   * The value here is the server's, once the server has said anything. Before
   * that — the frames between a cold start and `hello` — it is this device's
   * cached copy of the last thing the server said. See `APPEARANCE_KEY`.
   */
  appearance: ColorSchemePreference;
  setAppearance: (preference: ColorSchemePreference) => void;
  /**
   * Whether the channel screen has dropped the card it keeps for each of the
   * three controls in its pinned footer, letting the footer be the whole of
   * them.
   *
   * **An account setting**, on the same reasoning as the tap: how much a
   * screen should repeat itself to you is something you have learnt, not
   * something about the handset you learnt it on, and the second phone
   * disagreeing with the first is the app forgetting it.
   *
   * **Read by nothing since 2026-09-13.** The cards it hid are deleted for
   * everybody and the Home settings toggle with them; this stays wired up
   * because it is on the wire and in a column, and retiring it is a two-step
   * rather than an edit. See `hideControlCards` in core/settings.ts, which
   * carries the whole of it.
   */
  hideControlCards: boolean;
  setHideControlCards: (value: boolean) => void;
  /**
   * Whether this account has asked to see the experimental features.
   *
   * Off by default like the two above it, and unlike them it hides things
   * rather than rearranging them: with it off there is no transcript anywhere.
   * Nothing in the app reads this value to decide that — the server withholds
   * each recording's `transcript` field from a viewer without Labs, and the
   * app already draws nothing when that field is absent, which is how a server
   * with no transcription key has always been handled. It is read here so the
   * settings screen can show the switch and so signing in can restore it.
   *
   * The watch party was the other half of this and left Labs on 2026-09-18,
   * which is why nothing on the channel screen consults it now. See `labs` in
   * core/settings.ts.
   */
  labs: boolean;
  setLabs: (value: boolean) => void;
  /**
   * Whether this account has said we may write to them about the application
   * rather than only to sign them in.
   *
   * **A permission rather than a preference**, and the one setting here that
   * is granted in two places and withdrawn in one: the sign-in screen offers
   * it to somebody signing up and can only ever grant it, and Floor Settings —
   * which is behind a session and can therefore show the answer in force — is
   * where it goes both ways. See `marketingEmail` in core/settings.ts.
   *
   * **Not cached to storage, unlike the four above.** Their cache exists to
   * stop a cold start painting the wrong palette or drawing a control that
   * then vanishes; this one is read by a single card on a settings screen that
   * cannot be reached before `hello` has arrived, so there is no frame for a
   * stale value to be wrong in.
   */
  marketingEmail: boolean;
  setMarketingEmail: (value: boolean) => void;
  /**
   * Whether this address is the one that last signed in on this install.
   *
   * Read by the sign-in screen and by nothing else: the marketing opt-in is
   * offered to somebody signing up and not to somebody coming back, who has
   * answered it once already and has it on Floor Settings. **A guess, and the
   * only one available** — see `LAST_IDENTIFIER_KEY`, which carries why the
   * server cannot answer this, what it costs to keep, and why being wrong
   * about it is affordable.
   *
   * A predicate rather than the address itself, so that the one place holding
   * somebody's address stays this file: a screen that could read it could draw
   * it, and nothing should.
   */
  signedInHere: (identifier: string) => boolean;
  /**
   * Whether this install should be asked to turn notifications on, and what it
   * takes to do it.
   *
   * **Not a setting**, which is why it is one object rather than a value and a
   * setter beside the four above: notifications are not something this app
   * holds an opinion about and stores, they are a permission the system holds
   * and a decision about when to spend the one chance there is to request it.
   * See `state/notificationAsk.ts`.
   */
  notifications: NotificationAsk;
  /**
   * What this install has read of its own answered help questions, and how it
   * records having read more.
   *
   * Here for `notifications`' reason: two screens share it. `HomeView` reads it
   * against `home.helpAnsweredAt` to decide whether the Support tab wears a
   * dab, and `HelpView` writes it on the way in. See `state/helpSeen.ts`.
   */
  helpSeen: HelpSeen;
  /**
   * Whether every dab is being drawn on purpose, for looking at.
   *
   * **A debug-only override, off unless somebody with the `debug` grant has
   * just turned it on from settings.** The two marks are drawn from states that
   * are a nuisance to arrange — a second account has to ask to be a contact,
   * and a help answer has to be published by hand through `bin/help` — so the
   * one thing nobody could do easily was look at the mark itself, which is the
   * half that is a design decision. See `HomeSettingsView` and `ui/HomeView`.
   *
   * **An override rather than faked state**, deliberately. Writing a contact
   * request into the snapshot or a watermark into the keychain would light the
   * dabs and also change what the screens below them say, so what is on show is
   * no longer the app. This changes one thing: whether the mark is drawn.
   *
   * In memory, so it is gone at the next launch. Persisting it would leave a
   * phone wearing marks for nothing, found weeks later by somebody who does not
   * know what turned them on — and the cost of that is the one thing these
   * marks trade on, which is being believed.
   */
  forcedDabs: boolean;
  /**
   * Turns that override on or off — the button in `HomeSettingsView`'s
   * Diagnostics card, and nothing else.
   */
  forceDabs: (on: boolean) => void;
  /**
   * What a new account is shown above the two lists, until every rung of it
   * is done — the ladder, the single card, or nothing at all.
   *
   * Computed here rather than in `HomeView` for the reason `notifications` is:
   * it turns on `conversing`, which is read off every channel snapshot this
   * client is watching, and that map is deliberately not on this context. See
   * `state/introduction.ts`, and planning/ONBOARDING.md for the shape.
   */
  introduction: Introduction;
  /**
   * Puts the introduction back, on this account, for a debug account to look
   * at it again.
   *
   * On the context rather than imported straight from the module it writes,
   * because the state that decides what is drawn is held in this hook and a
   * bare `storage.remove` would clear the keys under a component that goes on
   * believing the old answer until the next launch. See
   * `state/useIntroduction.ts` for what it does and what it cannot undo.
   */
  forgetIntroduction: () => Promise<void>;
  /**
   * Records one of the checklist's four *try* rungs as done.
   *
   * **Called from the control that does the thing, not from the checklist** —
   * `ChannelView`, at the four places somebody claims the floor, declares
   * themselves nearby, shares a guest link or plays something. That is the
   * whole difference between these rungs and the ones above them: the others
   * are read off a snapshot the server sends, and nothing in any snapshot says
   * whether this has ever been done. See `state/tried.ts`.
   */
  markTried: (id: TriedId) => void;
  /**
   * Counts one use of one of the four ways between Home and a channel — the
   * Home glyph in a channel header, the swipe that does the same thing, and
   * the two ways back into the channel this device is standing in.
   *
   * **Instrumentation, and the only thing on this context that is.** It
   * changes nothing on screen, nothing waits for it, and a failure is not
   * reported: a navigation that hesitated while a counter was written would be
   * the measurement altering the thing measured. See `core/navigation.ts` for
   * the four names and what the pairing is for, and the server's `nav_counts`
   * for what is kept — a count, with nobody's name on it.
   *
   * On the context rather than called from `api` at each site, because the
   * token lives here and the four sites are in two different files.
   */
  recordNav: (id: NavAction) => void;
  /**
   * Puts one rung of the introduction away for good, from the card itself —
   * `useIntroduction.dismiss`. On the context for the reason the rest of this
   * feature is: the card is drawn in the tier that holds both lists, and the
   * state it acts on belongs to a hook held here.
   */
  dismissStep: (id: StepId) => void;
  /**
   * Installs the web app from inside it, where the browser volunteered a way.
   *
   * Null on every phone, in every browser that has already installed this, and
   * in the several that have an install command of their own and no way to
   * raise it from a page — which is most of them, so the rung says where the
   * menu is and this is the shortcut when there is one. See
   * `state/useInstall.web.ts`, which holds the event this replays.
   */
  installPrompt: (() => void) | null;
}

const AppContext = createContext<AppValue | null>(null);

export function useApp(): AppValue {
  const value = useContext(AppContext);
  if (!value) throw new Error('useApp must be used inside AppProvider');
  return value;
}

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [notificationTap, setNotificationTap] = useState<{
    channelId: string | null;
  } | null>(null);
  /**
   * Read from this device's cache before anything is drawn, so a chosen scheme
   * does not arrive as a flash of the other one, and overwritten by the
   * account's own answer as soon as the socket says hello.
   *
   * Two reads deep, in other words, and the first is not the truth — it is the
   * last thing this device was told, kept for the second or so before the
   * server can say it again. A launch signed in as somebody else has no cache
   * to be wrong from: signing out clears it.
   */
  const [appearance, setAppearanceState] =
    useState<ColorSchemePreference>(DEFAULT_ACCOUNT_SETTINGS.appearance);
  useEffect(() => {
    void (async () => {
      const stored = await storage.get(APPEARANCE_KEY);
      if (!isPreference(stored)) return;
      setAppearanceState(stored);
      applyPreference(stored);
    })();
  }, []);
  /*
   * `tapToLook` was read here, cached against the gap between a cold start and
   * `hello`. It is not a setting any more — a tap only ever looks — so there
   * is no gap to cover and nothing to be wrong about for a second. See
   * decisions/2026-09-21-a-tap-only-ever-looks.md.
   */
  /** Read the same way, at the same moment, for the same second or so. */
  const [hideControlCards, setHideControlCardsState] = useState(
    DEFAULT_ACCOUNT_SETTINGS.hideControlCards
  );
  useEffect(() => {
    void (async () => {
      if ((await storage.get(HIDE_CONTROL_CARDS_KEY)) === 'true') {
        setHideControlCardsState(true);
        return;
      }
      if ((await storage.get(LEGACY_CONTROL_CARDS_KEY)) === 'false') {
        setHideControlCardsState(true);
      }
    })();
  }, []);
  /**
   * Read the same way and at the same moment, and tested for `'true'` rather
   * than `'false'` because this one defaults off. The gap it covers is a
   * channel screen drawing without its watch card for the first frames after a
   * cold start, which is the harmless direction: something appearing is a
   * better surprise than a control vanishing under a thumb.
   */
  const [labs, setLabsState] = useState(DEFAULT_ACCOUNT_SETTINGS.labs);
  useEffect(() => {
    void (async () => {
      if ((await storage.get(LABS_KEY)) === 'true') setLabsState(true);
    })();
  }, []);
  /** No cache and no effect; the interface entry above says why. */
  const [marketingEmail, setMarketingEmailState] = useState(
    DEFAULT_ACCOUNT_SETTINGS.marketingEmail
  );
  /**
   * The address last signed in here, read once at start.
   *
   * Null until the read comes back, which is the right way round for what
   * reads it: the sign-in screen shows the opt-in to somebody it takes for
   * new, and a box appearing a frame late on a returning person's screen is a
   * smaller wrong than one that flickers away under a thumb.
   */
  const [lastIdentifier, setLastIdentifier] = useState<string | null>(null);
  useEffect(() => {
    void (async () => {
      const stored = await storage.get(LAST_IDENTIFIER_KEY);
      if (stored) setLastIdentifier(stored);
    })();
  }, []);
  /** Called where a sign-in succeeds, which is the one place the address is known. */
  const rememberIdentifier = useCallback((identifier: string) => {
    const trimmed = identifier.trim();
    setLastIdentifier(trimmed);
    void storage.set(LAST_IDENTIFIER_KEY, trimmed);
  }, []);
  /**
   * Takes the account's settings as the server states them, whichever device
   * caused them to change.
   *
   * Everything about a settings change goes through here: the tap that made
   * it, the `hello` that restates it on this connection, and the push that
   * arrives because the other phone was tapped. One path rather than three, so
   * a value applied optimistically and the same value confirmed a moment later
   * cannot take different routes into the window.
   *
   * The cache is written on the way through — that is what makes the next cold
   * start show the right palette immediately — and the window is repainted
   * whether or not the scheme is the one already showing, since
   * `applyPreference` is idempotent and cheaper than deciding.
   */
  const applySettings = useCallback((settings: AccountSettings) => {
    setAppearanceState(settings.appearance);
    applyPreference(settings.appearance);
    void storage.set(APPEARANCE_KEY, settings.appearance);
    // Dropped rather than written: there is no tap setting to cache any more.
    void storage.remove(TAP_TO_LOOK_KEY);
    void storage.remove(LEGACY_TAP_TO_STEP_IN_KEY);
    setHideControlCardsState(settings.hideControlCards);
    void storage.set(
      HIDE_CONTROL_CARDS_KEY,
      settings.hideControlCards ? 'true' : 'false'
    );
    void storage.remove(LEGACY_CONTROL_CARDS_KEY);
    setLabsState(settings.labs);
    void storage.set(LABS_KEY, settings.labs ? 'true' : 'false');
    setMarketingEmailState(settings.marketingEmail);
  }, []);
  /**
   * Puts the settings back to what somebody who has never signed in sees, and
   * empties the cache.
   *
   * Called wherever the session ends — signing out, deleting the account, and
   * being signed out from elsewhere. These belong to the account, so keeping
   * them after it has gone would paint the sign-in screen in the last person's
   * scheme and hand their tap to whoever signs in next before `hello` arrives.
   */
  const forgetSettings = useCallback(() => {
    setAppearanceState(DEFAULT_ACCOUNT_SETTINGS.appearance);
    applyPreference(DEFAULT_ACCOUNT_SETTINGS.appearance);
    void storage.remove(APPEARANCE_KEY);
    void storage.remove(TAP_TO_LOOK_KEY);
    void storage.remove(LEGACY_TAP_TO_STEP_IN_KEY);
    setHideControlCardsState(DEFAULT_ACCOUNT_SETTINGS.hideControlCards);
    void storage.remove(HIDE_CONTROL_CARDS_KEY);
    void storage.remove(LEGACY_CONTROL_CARDS_KEY);
    void storage.remove(DEAD_TABS_AT_FOOT_KEY);
    setLabsState(DEFAULT_ACCOUNT_SETTINGS.labs);
    void storage.remove(LABS_KEY);
    void storage.remove(DEAD_CHIME_AMPLITUDE_KEY);
    setMarketingEmailState(DEFAULT_ACCOUNT_SETTINGS.marketingEmail);
  }, []);
  /**
   * The address this install is registered at, kept so sign-out can hand it
   * back. Without it the row survives, and a phone that has been signed out of
   * goes on receiving somebody else's notifications.
   */
  const deviceToken = useRef<string | null>(null);
  /**
   * What the last reachable `/healthz` said about this install: whether it is
   * below the server's floor, and where to go if it is.
   *
   * Both come from the same answer, so they are one piece of state. A check
   * that fails to reach the server changes neither — an expiry already
   * discovered stays discovered rather than being cleared by a tunnel, and one
   * not yet discovered is not invented from a timeout.
   */
  const [expiry, setExpiry] = useState<{
    expired: boolean;
    updateUrl: string | null;
  }>({ expired: false, updateUrl: null });
  /** Gives up on a recording request the server never confirmed. */
  const askedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Whether the media plane currently has a microphone track of ours. */
  const micPublished = useRef(false);
  /** A `START_RECORDING` held back until there is a track to record. */
  const pendingRecord = useRef<{
    channelId: string;
    timer: ReturnType<typeof setTimeout>;
  } | null>(null);
  const [state, setState] = useState<AppState>({
    ready: false,
    token: null,
    me: null,
    debug: false,
    leaderboard: false,
    home: null,
    channelViews: {},
    goneChannels: [],
    recordingAsked: null,
    movedChannel: null,
    displaced: false,
    screens: [],
    screensElsewhere: [],
    screenFor: null,
    screenAsked: null,
    standingIn: null,
    nearbyIn: [],
    nearbyArrival: {},
    status: 'closed',
    offline: false,
    lastError: null,
  });

  const realtime = useRef(new Realtime()).current;
  /**
   * serverNow - Date.now() at the last snapshot. Countdowns are derived from
   * this rather than the device clock, which drifts and which the user can set.
   */
  const clockOffset = useRef(0);
  /**
   * Snapshots only arrive when something changes, so a local tick is what keeps
   * a running countdown moving between them. The counter is a dependency of the
   * context value below, not merely local state: re-rendering this provider is
   * not enough, because a memoised value with an unchanged identity lets React
   * skip every consumer. Without it the timers only advance when the server
   * happens to push, which looks like the countdowns are frozen.
   */
  const [tick, forceTick] = useState(0);

  const serverNow = useCallback(() => Date.now() + clockOffset.current, []);

  /**
   * When this client last said somebody was here.
   *
   * The device's own clock rather than the server's, because it is compared
   * only against itself — what it gates is how often a message is sent, and
   * the stamp that matters is the one the server takes on arrival.
   */
  const attentiveReportedAt = useRef(0);
  /**
   * The channel screen this device currently has open, or null.
   *
   * A ref rather than state because nothing renders from it: it exists to say
   * which room a touch was attention to, and re-rendering the whole tree when
   * a screen opens is what `channelViews` already does. Held here rather than
   * derived from `channelViews`, which deliberately outlives the screen —
   * pressing Home keeps the snapshot, because dropping it would be leaving the
   * channel, and a snapshot nobody is looking at is not attention.
   */
  const lookingAt = useRef<string | null>(null);
  const standing = useRef<string | null>(null);
  standing.current = state.standingIn;
  /**
   * The screen role, where a socket handler can read it.
   *
   * `standing`'s shape and `standing`'s reason: the handlers are built once,
   * so a message that has to know what this device is currently showing
   * cannot ask `state`. What reads it is the eviction — a null `screen` now
   * reaches every instance of an account rather than only the ones the server
   * has a record of, and an instance showing nothing has to be able to tell
   * that the message takes nothing away.
   */
  const screenRole = useRef<string | null>(null);
  screenRole.current = state.screenFor;
  const reportAttentive = useCallback(
    (force = false) => {
      const at = Date.now();
      if (!force && !shouldReport(attentiveReportedAt.current, at)) return;
      // **What this device is attending, which is up to two rooms.** The one
      // on screen, because looking at it is attending it; and the one it is
      // standing in, because presence is a claim actively maintained and a
      // phone in a hand is what says somebody is still there to maintain it.
      // Reading Home therefore holds the conversation you are in and nothing
      // else — which is the whole of why the clock is per channel.
      const rooms = new Set<string>();
      if (lookingAt.current) rooms.add(lookingAt.current);
      if (standing.current) rooms.add(standing.current);
      // Only advance the gate on a message that actually went. A report
      // dropped for want of a socket — or for having no room to be about — is
      // not evidence anybody received, and recording it would hold the next
      // one back for half a minute at exactly the moment it mattered.
      if (!realtime.attentive([...rooms])) return;
      attentiveReportedAt.current = at;
    },
    [realtime]
  );
  /**
   * Called by the channel screen for as long as it is the screen. See
   * `lookingAt`.
   */
  const lookAt = useCallback((channelId: string | null) => {
    lookingAt.current = channelId;
  }, []);

  const connect = useCallback(
    (token: string) => {
      realtime.connect(token, {
        onServerTime: (value) => {
          clockOffset.current = value - Date.now();
        },
        // Restoring a stored token skips the sign-in response, so this is the
        // only thing that tells a relaunched app who it is. Without it `me`
        // stays null, and every screen that compares against the current user
        // — the whole floor mechanic — silently compares against nothing.
        onHello: (account, debug, leaderboard, settings) => {
          setState((s) => ({ ...s, me: account, debug, leaderboard }));
          // Null from a server that predates the field, which is not the same
          // as one saying the defaults — this device keeps what it cached.
          if (settings) applySettings(settings);
        },
        // Either this device's own write coming back confirmed, or another
        // device of this account having been tapped. The two are the same
        // fact and take the same path.
        onSettings: applySettings,
        onHome: (home) => setState((s) => ({ ...s, home })),
        // Keyed by the channel the snapshot is about, never by which screen
        // asked for it: whoever is looking picks out the one they want.
        onChannel: (view) =>
          setState((s) => ({
            ...s,
            channelViews: { ...s.channelViews, [view.channel.id]: view },
            // Confirmed: the real rule takes over from here, and it says the
            // same thing for as long as the run lasts.
            recordingAsked:
              s.recordingAsked === view.channel.id &&
              isRecordingActive(view.channel.recording)
                ? null
                : s.recordingAsked,
            // A channel that is sending snapshots is not gone, whatever it was
            // a moment ago — an id can only be reported gone once, but this
            // keeps the two from ever disagreeing.
            goneChannels: s.goneChannels.includes(view.channel.id)
              ? s.goneChannels.filter((id) => id !== view.channel.id)
              : s.goneChannels,
          })),
        onChannelGone: (channelId) =>
          setState((s) => {
            const { [channelId]: gone, ...rest } = s.channelViews;
            return {
              ...s,
              channelViews: rest,
              goneChannels: s.goneChannels.includes(channelId)
                ? s.goneChannels
                : [...s.goneChannels, channelId],
            };
          }),
        // The conversation is in another channel now. Recorded rather than
        // acted on here: the screen showing it has to follow, and only it
        // knows whether it is the screen in question.
        //
        // The snapshot is left alone. One for the destination is already on
        // its way — the socket re-watched before handing this over — and
        // blanking it in between would flash the channel screen empty.
        onChannelMoved: (from, to) =>
          setState((s) => ({ ...s, movedChannel: { from, to } })),
        // Recorded rather than acted on, like a move: what it changes is
        // whether this device counts itself as standing in a channel, which
        // App.tsx reads off `live`. No navigation and no notice — the channel
        // screen simply offers Enter again.
        // A declaration made here is over too, and any offer standing on it:
        // another device has taken the account somewhere, and this one is no
        // longer nearby anything.
        onScreens: (screens) => setState((s) => ({ ...s, screens })),
        // One fact rather than a list, and pushed rather than asked for —
        // see `screensElsewhere`. It is what lets the device that handed a
        // film to the laptop show *other device* as the chosen answer.
        onScreening: (channelIds) =>
          setState((s) => ({ ...s, screensElsewhere: channelIds })),
        /*
          Being asked to show a film reaches the app wherever it is: the
          channel opens on this device and starts playing, and nothing about
          where anybody is standing changes. A null is the same message
          saying the film has gone to another of this account's devices —
          one device shows it at a time, and the handover moves the video.

          **Reported back as well as recorded**, which it was not until
          2026-09-17. The device that is *asked* to show a film used to set
          this and say nothing, so the server went on believing it was idle:
          the picker offered it as free while it was playing, and the
          *Watch on* switch on the device that had just handed the film over
          never learnt that it had landed. `showingScreen` is the one path
          that tells the server, so every way of becoming a screen goes
          through it.
        */
        onScreenAsked: (channelId) => {
          /*
            **A null that takes nothing away is not an event.** The server
            tells every one of an account's instances to stop showing a film
            when one of them declares, rather than only the ones it has a
            record of — see `screens.showing` in server/src/ws.ts — so an
            idle device now hears a null on every declaration anybody makes.
            Answering it would send a retraction of nothing and re-render the
            application to say what it already said.

            Only the null is short-circuited. A grant is always acted on,
            redundant or not: it carries an arrival, and spending it is what
            opens the channel.
          */
          if (channelId === null && screenRole.current === null) return;
          realtime.showingScreen(channelId);
          /*
            **And subscribed to, which is what makes the sentence above true.**
            The film is drawn off `channelViews[screenFor]` — `Picture` reads
            it there and nowhere else — and that map is filled by snapshots,
            which arrive only for a channel this socket has asked to watch. So
            a device asked to show a film it did not already have open took the
            role, told the server it was busy, and drew nothing at all: the
            switch on the other device said the picture was over here and there
            was no picture anywhere.

            `realtime.watchChannel` rather than the app's, which also sweeps
            the channel's notifications. Being handed a film is not somebody
            reading the room, and a television must not mark a ping answered
            on behalf of a person who is looking at their phone.

            Nothing unwatches it afterwards, deliberately: a snapshot
            outliving the screen that wanted it is what `channelViews` already
            does everywhere else — see its declaration — and `leaveChannelView`
            stays the one thing that drops one.
          */
          if (channelId !== null) realtime.watchChannel(channelId);
          setState((s) => ({
            ...s,
            screenFor: channelId,
            // And the arrival beside the role, which is what puts this device
            // on the channel's screen rather than a rectangle in its corner.
            // Null here is the eviction, and it spends a pending ask that
            // nothing got to: the film went somewhere else before this device
            // had drawn it.
            screenAsked: channelId,
          }));
        },
        onDisplaced: () =>
          setState((s) => ({ ...s, displaced: true, nearbyIn: [], nearbyArrival: {} })),
        // Mirrored rather than derived. Every transition of it is a decision
        // already taken in `Realtime` — entering, stepping out, being
        // displaced, following a move, giving up a stale re-entry past the
        // grace — and recomputing any of that here would be a second opinion
        // about the same fact.
        onStanding: (channelId) =>
          setState((s) =>
            s.standingIn === channelId ? s : { ...s, standingIn: channelId }
          ),
        onStatus: (status) => setState((s) => ({ ...s, status })),
        onOffline: (offline) =>
          setState((s) => (s.offline === offline ? s : { ...s, offline })),
        onError: (message) => setState((s) => ({ ...s, lastError: message })),
      });
      realtime.watchHome();
    },
    [realtime, applySettings]
  );

  // Restore a previous sign-in before showing anything.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const token = await storage.get(TOKEN_KEY);
      if (cancelled) return;
      if (!token) {
        setState((s) => ({ ...s, ready: true }));
        return;
      }
      // Connecting from here on, and it matters that it says so: the socket is
      // not opened until after this keychain read and the fetch below, and
      // `closed` in the meantime is indistinguishable from having tried and
      // failed. Home reads it as the latter and says the app cannot reach the
      // server, at the one moment it has not yet attempted to.
      setState((s) => ({ ...s, status: 'connecting' }));
      try {
        const home = await api.home(token);
        if (cancelled) return;
        setState((s) => ({ ...s, ready: true, token, home }));
        connect(token);
      } catch (error) {
        // An expired or revoked token should land on sign-in, not an error.
        if (error instanceof ApiError && error.status === 401) {
          await storage.remove(TOKEN_KEY);
          if (!cancelled) {
            setState((s) => ({ ...s, ready: true, status: 'closed' }));
          }
          return;
        }
        // Back to `closed`, so the optimism above cannot strand the app
        // claiming to be connecting at something it has stopped trying.
        if (!cancelled) {
          setState((s) => ({
            ...s,
            ready: true,
            status: 'closed',
            lastError: error instanceof Error ? error.message : String(error),
          }));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [connect]);

  /**
   * Spends the invitation somebody arrived on, once there is a session to
   * spend it with.
   *
   * **The walk this completes has a sign-in in the middle of it.** Somebody
   * follows a link, the invite page hands the pin to this tab, and the app
   * boots to a sign-in screen — so the invitation has to wait for a token
   * rather than be acted on at boot, which is what separates it from the
   * channel handover in `App.tsx`. Waiting on `state.token` covers both
   * arrivals with one effect: a signup that happened because of the link, and
   * somebody who was already signed in when they opened it.
   *
   * **Nothing is announced on success.** The contact and the channel arrive on
   * the Home snapshot the server pushes, which is the screen this person is
   * looking at; a notice would be telling them about something already in
   * front of them. A refusal is worth saying, because the alternative is a
   * link that visibly did nothing.
   *
   * `takeInvite` is one-shot, so the re-runs this effect gets as `state.token`
   * settles find nothing left to do.
   */
  useEffect(() => {
    if (!state.token) return;
    const invite = takeInvite();
    if (!invite) return;
    const token = state.token;
    let cancelled = false;
    void api
      .acceptInvite(token, invite.username, invite.pin)
      .catch((error: unknown) => {
        if (cancelled) return;
        setState((s) => ({
          ...s,
          lastError:
            error instanceof ApiError
              ? error.message
              : 'Could not accept the invitation.',
        }));
      });
    return () => {
      cancelled = true;
    };
  }, [state.token]);

  /**
   * Registered on every sign-in and every restored launch, not once ever: iOS
   * reissues a device token after a restore or a reinstall, so a registry
   * written once slowly fills with addresses that no longer resolve.
   *
   * **It registers and never asks, since 2026-09-08.** This used to be the one
   * place the system dialog came from, which put it in front of a new account
   * within seconds of arriving, before anything on screen had said what it was
   * for — and iOS grants that dialog once per install, for ever. Asking is now
   * a button on a screen that explains itself; see `useNotificationAsk`. What
   * is left here is the half that was always the point: somebody who has
   * already said yes gets their current address to the server at every launch.
   */
  useEffect(() => {
    if (!state.token) return;
    let cancelled = false;
    void registerIfGranted(state.token).then((token) => {
      if (!cancelled) deviceToken.current = token;
    });
    return () => {
      cancelled = true;
    };
  }, [state.token]);

  /**
   * Whether there is anybody at all who could reach you, which is the floor
   * under every reason to ask about notifications — see `worthAsking`.
   *
   * Three sources because they are three ways of having somebody: a contact, a
   * channel you can walk back into, and an invitation you have not answered.
   * The last one matters most for a new account, since being invited is how
   * most people arrive and the invitation is the first thing they have.
   */
  const somebody =
    !!state.home &&
    (state.home.contacts.length > 0 ||
      state.home.rejoinable.length > 0 ||
      state.home.invites.length > 0);

  /**
   * Whether a conversation is happening — you, in a channel, with somebody
   * else in it.
   *
   * Read off the snapshots rather than from an event, because there is no
   * event: presence is a fact the server restates, and the moment worth
   * recording is simply the first time this is true. `useNotificationAsk`
   * latches it and never asks again.
   */
  const mine = state.me?.id ?? '';
  const conversing = Object.values(state.channelViews).some((view) =>
    isConversing(view.channel, mine)
  );

  /**
   * TEMPORARY — the introduction checklist not retiring. Delete with the
   * diagnosis; see the trace in `useIntroduction`.
   *
   * Every input to `conversing` in one line, written only when it changes, so
   * the panel shows why rather than only what. `me` is the id the `includes`
   * is done with, and it is the one thing no screen displays.
   */
  const introTrace =
    `intro me=${mine || 'MISSING'} conversing=${conversing} views=` +
    (Object.values(state.channelViews)
      .map(
        (view) =>
          `${view.channel.id.slice(0, 4)}[${view.channel.status}]` +
          `present=${view.channel.present
            .map((id) => (id === mine ? 'ME' : id.slice(0, 4)))
            .join('|')}` +
          `+${Object.keys(view.channel.guests ?? {}).length}g`
      )
      .join(' ') || 'none');
  const lastIntroTrace = useRef('');
  useEffect(() => {
    if (introTrace === lastIntroTrace.current) return;
    lastIntroTrace.current = introTrace;
    recordEvent(introTrace);
  }, [introTrace]);

  const helpSeen = useHelpSeen();
  // The debug preview of the two dabs. Here rather than in `HomeView` because
  // it is switched on from the settings screen and read by the tier behind it,
  // which is the same reason `helpSeen` is here.
  const [forcedDabs, setForcedDabs] = useState(false);
  const notifications = useNotificationAsk({
    token: state.token,
    somebody,
    conversing,
    // Absent on a server older than the field, which reads as false and is the
    // behaviour every build before this one had — see `HomeView.cohortEligible`
    // and planning/SHIMS.md.
    cohortEligible: state.home?.cohortEligible ?? false,
    // The same ref the sign-in registration writes, so a token granted from
    // the explanation is the one sign-out later revokes.
    onRegistered: useCallback((token: string) => {
      deviceToken.current = token;
    }, []),
  });

  // Read here rather than in the card, because the checklist's shape depends
  // on it and the checklist is computed here.
  const { install, promptInstall } = useInstall();

  const {
    introduction,
    markTried,
    dismiss: dismissStep,
    forget: forgetIntroduction,
  } = useIntroduction({
    ready: state.ready,
    token: state.token,
    home: state.home,
    conversing,
    install,
  });

  /**
   * Looks again on every foreground, for permission that arrived late.
   *
   * The effect above runs when `state.token` changes — sign-in, and the
   * restore at a cold launch. Nothing else re-runs it, and **iOS does not
   * terminate the app when notification permission changes** the way it does
   * for the microphone. So somebody who refused the prompt, went to Settings
   * and turned notifications on comes back to a suspended process that never
   * asks again: the phone has permission, the server has no address, and it
   * stays that way until a cold launch that may be days off.
   *
   * Foreground is not a compromise, it is the only signal there is — iOS
   * offers no callback for an authorisation change and no way to detect a
   * return from Settings in particular. It is also the right one, since
   * flipping the switch and coming back *is* a foreground transition, made by
   * hand, immediately.
   *
   * A fourth listener rather than a branch inside one of the three below, on
   * the reasoning the sweep already gives for standing apart from the socket
   * resume: watching the same transition is not having anything to do with
   * each other.
   *
   * The `deviceToken.current` guard is what makes this free, and it stops the
   * effect dead once an address is in hand. What it gives up is the other
   * direction — permission *withdrawn* while the app runs is not noticed, and
   * the server goes on sending to a phone that drops everything. That costs
   * sends into the void and nothing else: APNs answers 200 rather than 410 for
   * a live token whose app is silenced, so no data goes stale and nothing is
   * pruned wrongly. Worth revisiting the day anything on screen claims
   * notifications are on.
   */
  useEffect(() => {
    const token = state.token;
    if (!token) return;
    const check = () => {
      if (deviceToken.current) return;
      void registerIfGranted(token).then((registered) => {
        if (registered) deviceToken.current = registered;
      });
    };
    const subscription = NativeAppState.addEventListener('change', (next) => {
      if (next === 'active') check();
    });
    return () => subscription.remove();
  }, [state.token]);

  // A tap on a notification, from either direction it can arrive. Mounted once
  // and independent of sign-in state, because the tap that launched the app is
  // read before the stored token has been restored.
  useEffect(
    () => onNotificationTap((channelId) => setNotificationTap({ channelId })),
    []
  );

  /**
   * Ships the audio log off the phone, for the one account that asked to see it.
   *
   * **Here rather than beside the log itself** because this is where `debug`
   * and the token both are — the shipper needs a credential and the server
   * refuses anybody without the column, so starting it anywhere else would mean
   * plumbing both to it. It is the same gate the panel sits behind, so nothing
   * is collected from a phone that is not already producing these lines for its
   * owner to read.
   *
   * A 403 is the ordinary answer for every other account and is reported as
   * *finished with these lines* rather than as a failure, which is what stops a
   * refused batch being retried every thirty seconds for the life of the app.
   * Anything else — a tunnel, a restarting server, a build the server predates
   * — comes back and waits.
   */
  useEffect(() => {
    const token = state.token;
    if (!state.debug || !token) return;
    return startShippingDiagnostics(async (lines) => {
      try {
        await api.shipDiagnostics(token, appBuild(), lines);
        return true;
      } catch (error) {
        return error instanceof ApiError && error.status === 403;
      }
    });
  }, [state.debug, state.token]);

  // Drives countdowns while a channel *snapshot is held*, which is not the
  // same as while one is on screen: pressing Home from a channel deliberately
  // keeps the snapshot, because dropping it would be leaving the channel.
  const watchingAny = Object.keys(state.channelViews).length > 0;
  useEffect(() => {
    if (!watchingAny) return;
    const timer = setInterval(() => forceTick((n) => n + 1), 500);
    return () => clearInterval(timer);
  }, [watchingAny]);

  /**
   * Ages the words on Home when the fast tick above is not running.
   *
   * Without it a contact row repaints only when a snapshot lands, so "three
   * minutes ago" is drawn once and then simply stops — and whether it stops
   * depended on whether the viewer happened to be holding a channel, which is
   * nothing to do with the person being described.
   *
   * Twenty seconds rather than five hundred milliseconds because the strings
   * come from dayjs's relative-time thresholds, which move at minutes and then
   * hours; anything finer redraws the list to produce the same words. Somebody
   * currently in the app does not need this at all — `inApp` is a fact and
   * says so without arithmetic — so this is only carrying the absent ones.
   */
  useEffect(() => {
    if (watchingAny) return;
    const timer = setInterval(() => forceTick((n) => n + 1), 20_000);
    return () => clearInterval(timer);
  }, [watchingAny]);

  /**
   * Turns a refused credential — from any request, any file transfer, or a
   * socket closed with 4401 — into a clean sign-out.
   *
   * Deliberately does not call `/auth/sign-out`: the token the server would
   * want is the one it has just told us it no longer honours, so the only
   * thing left to do is forget it here.
   *
   * The notice used to name signing in on another device, which was the cause
   * of almost every one of these while only one session per account was
   * allowed. Several are allowed as of 2026-08-24, so that sentence is now
   * wrong as often as it is right: what is left is somebody signing this
   * device out from another one, an account deleted, and a token ninety days
   * old. The wording covers all three rather than guessing between them.
   */
  useEffect(() => {
    onSignedOut(() => {
      realtime.disconnect();
      void storage.remove(TOKEN_KEY);
      forgetSettings();
      setState({
        ready: true,
        token: null,
        me: null,
        debug: false,
        leaderboard: false,
        screens: [],
        screensElsewhere: [],
        screenFor: null,
        screenAsked: null,
        home: null,
        channelViews: {},
        goneChannels: [],
        recordingAsked: null,
        movedChannel: null,
        displaced: false,
        standingIn: null,
        nearbyIn: [],
        nearbyArrival: {},
        status: 'closed',
        offline: false,
        lastError:
          'You were signed out. Sign in again with a fresh code by email.',
      });
    });
    return () => onSignedOut(null);
  }, [realtime, forgetSettings]);

  /**
   * Asks the server what it still supports: once at launch, and again on every
   * return to the foreground.
   *
   * Those two moments rather than a poll. The answer changes only when the
   * *server* is deployed, and what it changes is the whole app — a poll would
   * buy somebody being ejected mid-sentence in exchange for nothing that the
   * next foreground does not catch anyway.
   *
   * Runs signed out as well as in, and before the stored token has been
   * restored. A build below the floor should not be signing in either, and the
   * sign-in path is exactly where a wire change is most likely to have moved
   * under it.
   */
  useEffect(() => {
    let cancelled = false;
    const check = () => {
      void api
        .health()
        .then((health) => {
          if (cancelled) return;
          setExpiry({
            expired: mustUpdate(appBuild(), health.minBuild),
            updateUrl: health.updateUrl ?? null,
          });
        })
        // Silent on purpose. An unreachable server is not an answer about this
        // build, this runs on every foreground, and Home already says when the
        // app cannot reach the server.
        .catch(() => {});
    };
    check();
    const subscription = NativeAppState.addEventListener('change', (next) => {
      if (next === 'active') check();
    });
    return () => {
      cancelled = true;
      subscription.remove();
    };
  }, []);

  /**
   * Hangs up, once, on discovering this build is expired.
   *
   * The screen replacing itself is what the user sees; this is the half they
   * do not. A socket left open goes on watching channels, marking this account
   * present in them, and answering snapshots that the app has stopped drawing
   * — so everybody else would see somebody standing in the channel who cannot
   * hear them. Disabling functionality has to include the functionality that
   * runs without anybody looking at it.
   */
  useEffect(() => {
    if (expiry.expired) realtime.disconnect();
  }, [expiry.expired, realtime]);

  /**
   * Reconnects when the app comes back to the foreground.
   *
   * Nothing else does. iOS suspends the process and the socket does not
   * survive it, so without this the app sat on a dead connection until a
   * heartbeat happened to notice — showing stale channels as live, and then
   * announcing the disconnection at the moment the user had just returned.
   * Foregrounding is the commonest thing anyone does with a phone, and it was
   * the one transition the socket knew nothing about.
   *
   * Not while expired, which is the same reasoning as the disconnect above:
   * the foreground that re-asks `/healthz` must not also undo the answer it is
   * about to get.
   *
   * **Since 2026-09-16 it watches the departure as well as the return**, for
   * the web, where react-native-web maps this listener onto
   * `visibilitychange`. A phone going into the background is suspended by iOS
   * and needs nothing said to it; a tab going hidden is not, and that
   * asymmetry is the whole of the reconnect loop the web client was in.
   */
  useEffect(() => {
    const subscription = NativeAppState.addEventListener('change', (next) => {
      if (next === 'active') {
        if (!expiry.expired) realtime.resume();
        return;
      }
      // And the other half, on the web only, where the browser will not do it
      // for us: a hidden tab keeps its socket and stops being able to prove it
      // is there, which the server reads as death every twenty seconds for as
      // long as the tab is open. `Realtime.suspend` carries the mechanism.
      //
      // **Unless this device is in a room**, which is `standingIn` here and
      // `channelHasAudio` in core/ — stepped in is always capturing, self-
      // muted or not, which is the line the phone draws with its audio
      // background mode. A tab holding a conversation is not a tab nobody is
      // looking at. (The listening half of that predicate belongs to the
      // guest page, which has no members in it; see `web/guest.ts`.)
      if (next === 'background' && Platform.OS === 'web' && !standing.current) {
        realtime.suspend();
      }
    });
    return () => subscription.remove();
  }, [realtime, expiry.expired]);

  /**
   * Clears announcements about rooms, on every foreground and on launch.
   *
   * Separate from the reconnect above though it watches the same transition,
   * because the two have nothing to do with each other: one is about a socket
   * that did not survive suspension, and this is about what is sitting in
   * Notification Center. Merging them would make the sweep conditional on
   * `expiry.expired`, which is not a reason to leave stale notifications on
   * somebody's lock screen.
   *
   * Not awaited and not caught here — `sweepArrivals` never rejects. Tidying
   * up is a courtesy and must not become an error in front of somebody who has
   * just opened the app.
   */
  useEffect(() => {
    void sweepArrivals();
    const subscription = NativeAppState.addEventListener('change', (next) => {
      if (next === 'active') void sweepArrivals();
    });
    return () => subscription.remove();
  }, []);

  /**
   * Stops telling the room this device has the film up while the app is away,
   * and says it again on return.
   *
   * **The roster is why this exists.** A member's card says *watching* while
   * the server holds a `screening` for them — see `ChannelView.watching` — and
   * what that claim is worth depends entirely on it being retracted by a
   * device that has stopped showing anything. The person a host is looking for
   * is precisely the one whose phone is in their pocket: a card that says they
   * are watching is worse than no card at all, being a wrong answer to the one
   * question the line was added to answer.
   *
   * **Native only, and the asymmetry is measured rather than preferred.** iOS
   * suspends a backgrounded WebView: the film stops, and nothing about the
   * phone is showing it. A hidden browser tab goes on playing, picture and
   * sound both, which is why a playing film is already evidence of attention
   * on the web — see the attention report in `ChannelView`. Retracting there
   * would unsay something that is still true.
   *
   * **The role itself is untouched**, which is what keeps this safe. What is
   * withdrawn is the report to the server, not `screenFor`: the picture stays
   * mounted, `watchingHere` and the microphone rule are not involved, and the
   * film resumes from the channel's clock the moment the app is in front
   * again. And a device that was displaced while away has had `screenFor`
   * cleared by the `screen` message that displaced it, so the return re-states
   * a belief this device still holds rather than stealing a film back from
   * wherever it went.
   */
  useEffect(() => {
    const screenFor = state.screenFor;
    if (screenFor === null || Platform.OS === 'web') return;
    const subscription = NativeAppState.addEventListener('change', (next) => {
      realtime.showingScreen(next === 'active' ? screenFor : null);
    });
    return () => subscription.remove();
  }, [realtime, state.screenFor]);

  useEffect(() => () => realtime.disconnect(), [realtime]);

  const value = useMemo<AppValue>(
    () => ({
      ...state,
      serverNow,
      reportAttentive,
      lookAt,
      expired: expiry.expired,
      updateUrl: expiry.updateUrl,
      notificationTap,
      clearNotificationTap: () => setNotificationTap(null),
      notifications,
      helpSeen,
      forcedDabs,
      forceDabs: setForcedDabs,
      introduction,
      markTried,
      /*
        Fire and forget, exactly like the settings write below and with less
        to lose: there is no local state to apply first, and nothing on screen
        that a failed call could contradict. A signed-out app counts nothing,
        which is right — none of the four controls is reachable without a
        session.
      */
      recordNav: (id) => {
        if (!state.token) return;
        void api.recordNav(state.token, id).catch(() => {});
      },
      dismissStep,
      forgetIntroduction,
      installPrompt: promptInstall,

      appearance,
      /*
        Applied here and sent to the server, in that order, and the order is
        the whole of what makes this feel like a setting rather than a
        request. The window override is what the colours actually resolve
        against, so applying first is what makes the tap instant; the write is
        what makes it the account's. The server then says it back to every
        device including this one, which is where the value finally comes
        from — see `applySettings`.

        A failed write is deliberately not reverted and not announced. What is
        on screen is what this person asked for, and a scheme that flicked back
        to light half a second later because a tunnel dropped would be the app
        arguing with them. It is corrected at the next `hello`, which is the
        soonest anybody could honestly be told what the account holds.
      */
      setAppearance: (preference) => {
        applyPreference(preference);
        setAppearanceState(preference);
        void storage.set(APPEARANCE_KEY, preference);
        if (state.token) {
          void api
            .saveSettings(state.token, { appearance: preference })
            .catch(() => {});
        }
      },

      hideControlCards,
      setHideControlCards: (value) => {
        setHideControlCardsState(value);
        void storage.set(HIDE_CONTROL_CARDS_KEY, value ? 'true' : 'false');
        void storage.remove(LEGACY_CONTROL_CARDS_KEY);
        if (state.token) {
          void api
            .saveSettings(state.token, { hideControlCards: value })
            .catch(() => {});
        }
      },

      labs,
      setLabs: (value) => {
        setLabsState(value);
        void storage.set(LABS_KEY, value ? 'true' : 'false');
        if (state.token) {
          void api.saveSettings(state.token, { labs: value }).catch(() => {});
        }
      },

      signedInHere: (identifier) =>
        lastIdentifier !== null && sameIdentifier(identifier, lastIdentifier),
      marketingEmail,
      setMarketingEmail: (value) => {
        setMarketingEmailState(value);
        if (state.token) {
          void api
            .saveSettings(state.token, { marketingEmail: value })
            .catch(() => {});
        }
      },

      requestCode: async (identifier) => {
        await api.requestCode(identifier);
      },

      verify: async (identifier, code, displayName, marketingEmail) => {
        const { token, account } = await api.verify(
          identifier,
          code,
          displayName,
          marketingEmail
        );
        await storage.set(TOKEN_KEY, token);
        rememberIdentifier(identifier);
        setState((s) => ({ ...s, token, me: account, lastError: null }));
        connect(token);
      },

      signOut: async () => {
        const token = state.token;
        const device = deviceToken.current;
        deviceToken.current = null;
        realtime.disconnect();
        await storage.remove(TOKEN_KEY);
        forgetSettings();
        setState({
          ready: true,
          token: null,
          me: null,
          debug: false,
          leaderboard: false,
          home: null,
          channelViews: {},
          goneChannels: [],
          recordingAsked: null,
          movedChannel: null,
          displaced: false,
          screens: [],
          screensElsewhere: [],
          screenFor: null,
          screenAsked: null,
        standingIn: null,
          nearbyIn: [],
          nearbyArrival: {},
          status: 'closed',
          offline: false,
          lastError: null,
        });
        // Best effort: the local channel is already gone either way. The
        // device travels with it so the server forgets where to reach this
        // phone while the credential authorising that is still good.
        if (token) await api.signOut(token, device ?? undefined).catch(() => {});
      },

      signOutOthers: async () => {
        if (!state.token) throw new ApiError('Not signed in.', 401);
        // This device's own address is named so it survives — see the note on
        // `api.signOutOthers`. Nothing local changes: this session is exactly
        // the one being kept.
        const result = await api.signOutOthers(
          state.token,
          deviceToken.current ?? undefined
        );
        return result.sessions;
      },

      /**
       * Deletes the account, then lands where signing out lands.
       *
       * The opposite order to `signOut`, and deliberately: signing out clears
       * the app first because the local session is already gone whether the
       * server hears or not. This one has to hear. A failure has to leave the
       * account intact *and* the person still signed in to try again, so the
       * error is rethrown and nothing local is touched until the server has
       * answered.
       */
      deleteAccount: async () => {
        if (!state.token) throw new ApiError('Not signed in.', 401);
        await api.deleteAccount(state.token);
        deviceToken.current = null;
        realtime.disconnect();
        await storage.remove(TOKEN_KEY);
        forgetSettings();
        setState({
          ready: true,
          token: null,
          me: null,
          debug: false,
          leaderboard: false,
          home: null,
          channelViews: {},
          goneChannels: [],
          recordingAsked: null,
          movedChannel: null,
          displaced: false,
          screens: [],
          screensElsewhere: [],
          screenFor: null,
          screenAsked: null,
        standingIn: null,
          nearbyIn: [],
          nearbyArrival: {},
          status: 'closed',
          offline: false,
          lastError: null,
        });
      },

      requestContact: async (identifier) => {
        if (!state.token) throw new ApiError('Not signed in.', 401);
        const result = await api.requestContact(state.token, identifier);
        const home = await api.home(state.token);
        setState((s) => ({ ...s, home }));
        return { accepted: result.accepted };
      },

      // No `home` refetch, unlike its neighbours: minting a link changes
      // nothing anybody can see. What it changes happens when somebody else
      // opens it, and that arrives on the pushed snapshot like any other
      // contact.
      inviteLink: async () => {
        if (!state.token) throw new ApiError('Not signed in.', 401);
        const { url } = await api.inviteLink(state.token);
        return url;
      },

      withdrawContact: async (identifier) => {
        if (!state.token) return;
        await api.withdrawContact(state.token, identifier);
        const home = await api.home(state.token);
        setState((s) => ({ ...s, home }));
      },

      acceptContact: async (contactId) => {
        if (!state.token) return;
        await api.acceptContact(state.token, contactId);
        const home = await api.home(state.token);
        setState((s) => ({ ...s, home }));
      },

      declineContact: async (contactId) => {
        if (!state.token) return;
        await api.declineContact(state.token, contactId);
        const home = await api.home(state.token);
        setState((s) => ({ ...s, home }));
      },

      removeContact: async (contactId) => {
        if (!state.token) return;
        await api.removeContact(state.token, contactId);
        const home = await api.home(state.token);
        setState((s) => ({ ...s, home }));
      },

      setEmailShown: async (contactId, shown) => {
        if (!state.token) throw new ApiError('Not signed in.', 401);
        await api.setEmailShown(state.token, contactId, shown);
      },

      loadProfile: async (accountId) => {
        if (!state.token) throw new ApiError('Not signed in.', 401);
        return api.profile(state.token, accountId);
      },

      ping: async (channelId, targetId, text) => {
        if (!state.token) throw new ApiError('Not signed in.', 401);
        // Empty means no words rather than an empty sentence, and the server
        // reads it the same way — a ping with nothing in it still says
        // somebody is asking.
        await api.pingParticipant(
          state.token,
          channelId,
          targetId,
          text || undefined
        );
      },

      /**
       * Read when Settings opens rather than held in state: nothing else in the
       * app reads it, donations gate nothing, and a value cached here would go
       * stale the moment somebody gave.
       */
      loadSupport: async () => {
        if (!state.token) throw new ApiError('Not signed in.', 401);
        return api.support(state.token);
      },

      loadHelp: async () => {
        if (!state.token) throw new ApiError('Not signed in.', 401);
        return api.help(state.token);
      },

      askHelp: async (text) => {
        if (!state.token) throw new ApiError('Not signed in.', 401);
        const { question } = await api.askHelp(state.token, text);
        return question;
      },

      loadLeaderboard: async () => {
        if (!state.token) throw new ApiError('Not signed in.', 401);
        const { entries } = await api.leaderboard(state.token);
        return entries;
      },

      inviteGuest: async (channelId) => {
        if (!state.token) throw new ApiError('Not signed in.', 401);
        const link = await api.mintGuestLink(state.token, channelId);
        return link.url;
      },

      guestLinks: async (channelId) => {
        if (!state.token) throw new ApiError('Not signed in.', 401);
        const { links } = await api.guestLinks(state.token, channelId);
        return links;
      },

      setNotificationLevel: async (channelId, level) => {
        if (!state.token) throw new ApiError('Not signed in.', 401);
        const result = await api.setNotificationLevel(
          state.token,
          channelId,
          level
        );
        return result.level;
      },

      revokeGuestLink: async (channelId, linkToken) => {
        if (!state.token) throw new ApiError('Not signed in.', 401);
        await api.revokeGuestLink(state.token, channelId, linkToken);
      },

      setChannelPublic: async (channelId, isPublic) => {
        if (!state.token) throw new ApiError('Not signed in.', 401);
        const result = await api.setChannelPublic(
          state.token,
          channelId,
          isPublic
        );
        return { url: result.url, feedUrl: result.feedUrl };
      },

      setChannelDeclarations: async (channelId, declarations) => {
        if (!state.token) throw new ApiError('Not signed in.', 401);
        await api.setChannelDeclarations(state.token, channelId, declarations);
        // Nothing locally: the server announces the channel, and the
        // snapshot carries these back.
      },

      setPublishConsent: async (recordingId, agreed) => {
        if (!state.token) throw new ApiError('Not signed in.', 401);
        // Nothing is returned to the caller. The server announces the channel
        // on both paths, so the card's own state arrives on the next snapshot
        // — which is also what keeps every member's card in step rather than
        // only the one whose finger it was.
        if (agreed) await api.consentToPublish(state.token, recordingId);
        else await api.withdrawFromPublishing(state.token, recordingId);
      },

      connectWith: async (accountId) => {
        if (!state.token) throw new ApiError('Not signed in.', 401);
        const result = await api.requestContactById(state.token, accountId);
        // Home is where the request shows up, on both sides.
        const home = await api.home(state.token);
        setState((s) => ({ ...s, home }));
        return { accepted: result.accepted };
      },

      saveProfile: async (changes) => {
        if (!state.token) throw new ApiError('Not signed in.', 401);
        const profile = await api.saveProfile(state.token, changes);
        // `me` is what every screen compares against to decide what is yours,
        // so a rename has to land here rather than waiting for a reconnect.
        setState((s) => ({ ...s, me: profile.account }));
      },

      requestEmailChange: async (identifier) => {
        if (!state.token) throw new ApiError('Not signed in.', 401);
        await api.requestEmailChange(state.token, identifier);
      },

      /**
       * Nothing is stored here. The address is not part of `me` — it is on the
       * profile, which is fetched by the one screen that shows it — and the
       * session is unaffected, tokens keying on the account rather than on
       * where its mail goes. So this hands the new profile back to its caller
       * and changes nothing globally.
       */
      confirmEmailChange: async (identifier, code) => {
        if (!state.token) throw new ApiError('Not signed in.', 401);
        return api.confirmEmailChange(state.token, identifier, code);
      },

      startChannel: async (contactIds) => {
        if (!state.token) throw new ApiError('Not signed in.', 401);
        const { channelId } = await api.startChannel(state.token, contactIds);
        realtime.watchChannel(channelId);
        // Creating a channel is entering it — the server puts the initiator in
        // `present` the moment it exists — so this is the one way into a
        // channel that sends no ENTER, and the one place that has to say so
        // itself. See `Realtime.standIn`.
        realtime.standIn(channelId);
        return channelId;
      },

      /**
       * Opening a channel also clears what it had outstanding on the lock
       * screen: a ping about it has been answered by the person walking in,
       * and an arrival is stale because the roster is now on screen.
       *
       * Here rather than in the channel screen because this is the one call
       * every route into a channel makes — a tap on Home, a tap on the
       * notification itself, a channel just created. Hanging it off the screen
       * would mean finding all of them again.
       */
      watchChannel: (channelId) => {
        realtime.watchChannel(channelId);
        void sweepChannel(channelId);
      },

      listScreens: () => realtime.listScreens(),
      useScreen: (channelId, device) => realtime.useScreen(channelId, device),
      // Cleared here as well as sent, so that a device which has stopped being
      // a screen stops believing it is one even if the socket is down. The
      // server's copy is connection state and dies with the socket — which is
      // why the socket remembers what was declared and says it again on the
      // next connection rather than leaving that copy null. See
      // `screeningChannel` in api/socket.ts; a declaration that dies with a
      // socket and is never restated is a roster saying *Present* at somebody
      // sitting in front of the film.
      showScreenFor: (channelId) => {
        realtime.showingScreen(channelId);
        setState((s) =>
          s.screenFor === channelId ? s : { ...s, screenFor: channelId }
        );
      },

      takeScreenAsked: () =>
        setState((s) => (s.screenAsked === null ? s : { ...s, screenAsked: null })),

      // Only this channel's snapshot goes: leaving one is not leaving the
      // others, and dropping the lot would hang up on a conversation being
      // held somewhere else.
      leaveChannelView: (channelId) => {
        realtime.unwatchChannel(channelId);
        setState((s) => {
          const { [channelId]: left, ...rest } = s.channelViews;
          return { ...s, channelViews: rest };
        });
      },

      act: (channelId, action) => {
        // Standing somewhere again, which is the whole of what being displaced
        // was about. Ahead of the server for the same reason the recording
        // request below is: the room is taken by the ENTER arriving, and there
        // is no snapshot in the same-channel case to confirm it with.
        if (action.type === 'ENTER') {
          setState((s) => (s.displaced ? { ...s, displaced: false } : s));
        }
        // Before the send, not after it: the point is to be ahead of the
        // server, and the send is where the round trip starts.
        if (action.type === 'START_RECORDING') {
          setState((s) => ({ ...s, recordingAsked: channelId }));
          // Long enough to cover a round trip and a reconnect, short enough
          // that a request nobody answered stops mattering. The server has no
          // way to decline audibly — a refused action returns a snapshot and no
          // error — so this is the only thing that ends the wait.
          if (askedTimer.current) clearTimeout(askedTimer.current);
          askedTimer.current = setTimeout(() => {
            setState((s) =>
              s.recordingAsked === channelId ? { ...s, recordingAsked: null } : s
            );
          }, 10_000);

          // **Held until there is a track to record.** The server points an
          // egress at a published track the instant this action arrives, and
          // a miss is not retried for five seconds — so asking before the
          // microphone is up is what produced a six-second run with one
          // second of audio in it, and a stem key with no object behind it.
          // See `Channels.dropHollowStems`.
          //
          // **Ordinarily nothing waits here at all**, since 2026-09-08:
          // stepping in opens the device, so anybody in a position to start a
          // recording already has one published. What is left for this to
          // cover is the seconds between connecting and the track landing, and
          // a device with no microphone, which never publishes one.
          if (!micPublished.current) {
            if (pendingRecord.current) {
              clearTimeout(pendingRecord.current.timer);
            }
            pendingRecord.current = {
              channelId,
              timer: setTimeout(() => {
                pendingRecord.current = null;
                realtime.act(channelId, action);
              }, RECORD_PUBLISH_WAIT_MS),
            };
            // Held, not sent — the same answer as queued as far as any caller
            // is concerned: nothing may be concluded yet.
            return false;
          }
        }
        // Nothing to wait for any more: a run being stopped, or a channel
        // being left, is an answer to the held request as much as a
        // microphone would have been.
        if (
          pendingRecord.current &&
          (action.type === 'STOP_RECORDING' ||
            action.type === 'STEP_OUT' ||
            action.type === 'ATTENTION_EXPIRED' ||
            action.type === 'LEAVE_CHANNEL')
        ) {
          clearTimeout(pendingRecord.current.timer);
          pendingRecord.current = null;
          setState((s) =>
            s.recordingAsked === channelId ? { ...s, recordingAsked: null } : s
          );
        }
        // **The device's own record of a declaration**, written here because
        // this is where the declaration is made. `standingIn` is mirrored from
        // `Realtime` for the opposite reason — it has half a dozen writers, all
        // of them there — and this has exactly one.
        //
        // Every other action that ends the wait clears it, including `ENTER`,
        // which is what stepping in from the rung sends: the declaration is
        // over the moment you are in the room, and leaving this set would let a
        // second arrival be announced as news against a room this phone is now
        // standing in.
        //
        // **All of it is per channel, and that is the correction of
        // 2026-09-12.** Each clause used to compare one id against this one, so
        // declaring in a second room dropped the first and stepping out of any
        // room dropped whichever was held. Only this channel's declaration is
        // touched now; the others are none of this action's business, presence
        // being the exclusive one and this not.
        if (action.type === 'DECLARE_NEARBY') {
          setState((s) =>
            s.nearbyIn.includes(channelId)
              ? s
              : { ...s, nearbyIn: [...s.nearbyIn, channelId] }
          );
        } else if (
          action.type === 'ENTER' ||
          action.type === 'STEP_OUT' ||
          action.type === 'ATTENTION_EXPIRED' ||
          action.type === 'LEAVE_CHANNEL'
        ) {
          setState((s) => {
            if (!s.nearbyIn.includes(channelId) && !(channelId in s.nearbyArrival)) {
              return s;
            }
            const { [channelId]: _gone, ...rest } = s.nearbyArrival;
            return {
              ...s,
              nearbyIn: s.nearbyIn.filter((id) => id !== channelId),
              nearbyArrival: rest,
            };
          });
        }
        return realtime.act(channelId, action);
      },

      noteNearbyArrival: (channelId, who) => {
        setState((s) => {
          // Only for a channel this device is actually nearby in, and only
          // while it still is: a snapshot can outrun the action that ended the
          // declaration, and a line raised after that would be reporting an
          // arrival into a room this phone has already left or entered.
          if (!s.nearbyIn.includes(channelId)) return s;
          const standing = s.nearbyArrival[channelId];
          return {
            ...s,
            nearbyArrival: {
              ...s.nearbyArrival,
              [channelId]: standing
                ? [...standing, ...who.filter((id) => !standing.includes(id))]
                : who,
            },
          };
        });
      },

      reportMicPublished: (published) => {
        micPublished.current = published;
        const pending = pendingRecord.current;
        if (!published || !pending) return;
        clearTimeout(pending.timer);
        pendingRecord.current = null;
        realtime.act(pending.channelId, { type: 'START_RECORDING' });
      },

      reportSpeaking: (channelId, speaking) => {
        realtime.speaking(channelId, speaking);
      },

      clearError: () => setState((s) => ({ ...s, lastError: null })),
    }),
    [
      state,
      serverNow,
      reportAttentive,
      lookAt,
      connect,
      realtime,
      tick,
      notificationTap,
      notifications,
      helpSeen,
      forcedDabs,
      introduction,
      markTried,
      dismissStep,
      forgetIntroduction,
      promptInstall,
      appearance,
      hideControlCards,
      labs,
      marketingEmail,
      lastIdentifier,
      rememberIdentifier,
      forgetSettings,
      expiry,
    ]
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}
