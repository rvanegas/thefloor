import { access, readFile, rm, writeFile } from 'node:fs/promises';
import { basename, extname, join } from 'node:path';
import Fastify, {
  type FastifyInstance,
  type FastifyReply,
  type FastifyRequest,
} from 'fastify';
import websocket from '@fastify/websocket';
import fastifyStatic from '@fastify/static';
import type {
  HomeView,
  PublicAccount,
  RecordingView,
} from '../../core/protocol';
import {
  MAX_DISPLAY_NAME_LENGTH,
  MAX_TRACK_BYTES,
} from '../../core/constants';
import {
  IM_SERVICES,
  IM_SERVICE_NAMES,
  normaliseImHandle,
} from '../../core/im';
import { describeChannel, nameRecording } from '../../core/naming';
import { isNavAction, NAV_ACTIONS } from '../../core/navigation';
import { isTriedId, TRIED_IDS } from '../../core/tried';
import { usernameProblem } from '../../core/username';
import {
  isColorSchemePreference,
  isLanguagePreference,
  type AccountSettings,
} from '../../core/settings';
import {
  alertFor,
  DEFAULT_NOTIFICATION_LEVEL,
  NOTIFICATION_LEVELS,
  type NotificationAlert,
  type NotificationLevel,
} from '../../core/notifications';
import { Accounts, UsernameTakenError } from './accounts';
import { openDb, sha256, type AccountRow, type Db, type RecordingRow } from './db';
import { deletionPage } from './deletion';
import { logSafeRequest } from './log-url';
import { Devices, type DevicePlatform } from './devices';
import { NotificationPreferences } from './preferences';
import { Donations } from './donations';
import { artworkKeyFor, MAX_ARTWORK_BYTES, readArtwork } from './artwork';
import { PUBLISHED_CONTENT_TYPE, RECORDING_CONTENT_TYPE } from './export';
import { renderFeed, type FeedEpisode } from './feed';
import { Publication, publishedKeyFor } from './publication';
import { publicChannelPage } from './public-page';
import { podcastDirectoryPage } from './directory-page';
import { isEmailAddress, type Mailer } from './mail';
import type { MediaServer } from './media';
import { probeDurationMs, UnreadableAudioError } from './playback';
import { startsAnEpisode } from './usage';
import { escapeHtml, socialCard, socialTags } from './html';
import { landingPage } from './landing';
import { invitePage, inviteRefusalText } from './invite';
import { openPage } from './open';
import { privacyPage } from './privacy';
import { booleanUnderEitherName, settingsForWire } from './settings-wire';
import type { TranscriptionProvider } from './transcription';
import {
  formatTranscript,
  MEDIA_LABEL,
  Transcripts,
  type TranscriptView,
} from './transcripts';
import {
  readable,
  voiceKey,
  voiceName,
  voiceRoster,
  type VoiceDeclarations,
} from '../../core/transcript';
import {
  BUILD_HEADER,
  NOTIFY_HEADER,
  claimedNotifyState,
  CLIENT_HEADER,
  claimedBuild,
  claimedClient,
  deployed,
  MIN_SUPPORTED_BUILD,
} from './release';
import { withInstallTags } from './shell';
import { supportPage } from './support';
import { Help, MAX_OUTSTANDING, MAX_QUESTION_LENGTH } from './help';
import { donationsVisibleFor } from './region';
import {
  ChannelRegistry,
  MEDIA_IDENTITY,
  type RefusalCode,
} from './channels';
import {
  ConsolePusher,
  createPushNotifier,
  NOTIFICATION_PAUSE_MS,
  notifications,
  type Pusher,
} from './push';
import type { RecordingStore } from './storage';
import {
  createHomeNotifier,
  createReachability,
  createSettingsNotifier,
  registerWebsocket,
} from './ws';

export interface BuildOptions {
  dbPath?: string;
  /** Delivers one-time codes. Without one, only the bypass can sign anyone in. */
  mailer?: Mailer;
  /** Carries audio and enforces the floor as an actual mute. */
  media?: MediaServer;
  /** The wss:// URL clients should connect to. Sent alongside a join token. */
  mediaUrl?: string;
  /** The recordings bucket: stems in, mixes in and out. */
  store?: RecordingStore;
  /**
   * How long a mix waits for a stem the egress has not uploaded yet. Set to
   * zero by tests whose store holds whatever it is going to hold already.
   */
  mixWaitMs?: number;
  /** Grace period before an ended channel's audio room is torn down. */
  roomCloseGraceMs?: number;
  /**
   * Where loaded tracks are kept, and what makes them outlive the process.
   *
   * Durable storage, so it belongs beside the database and outside anything
   * `bin/deploy` synchronises — see `server/.env.example`. Unset, tracks go to
   * a per-pid directory under the system temp and are swept at the next boot,
   * which is what every test wants and what production did until 2026-09-08.
   */
  trackRoot?: string;
  /**
   * Where the web trains are served from — the directory holding `stable` and
   * `beta`.
   *
   * **This exists so that two test runs can happen at once**, added
   * 2026-09-17. The trains are built by `bin/deploy-web` and rsynced straight
   * to the box, so nothing writes them in a checkout except the tests that
   * need one to exist — and those were creating and then `rm -rf`ing
   * `server/web/stable` itself, a fixed real path. Two suites doing that at
   * the same time delete each other's fixture, which is how a `bin/deploy`
   * that overlapped anything else running the suite failed in `open`,
   * `train-root` and `guest-flow` and nowhere else. See
   * `decisions/2026-09-17-the-tests-stopped-sharing-a-directory.md`.
   *
   * Unset, it is `server/web`, which is what production uses and what every
   * caller but a test wants. It covers **only the train directories**: the
   * guest page and the guest bundle live in the same directory and are
   * committed or built rather than fixtures, so they keep resolving from the
   * real one. A test pointing this at a temp directory is saying *no train is
   * deployed here except the ones I make*, which is exactly what each of them
   * wants to say.
   */
  trainRoot?: string;
  /**
   * Reaches an iOS device whose app is not running. Without one, nothing is
   * sent and the in-app path is all there is — which is what it was before
   * push.
   */
  pusher?: Pusher;
  /**
   * The same for Android, which is a different service and so a different
   * sender.
   *
   * **Two options rather than one pusher that knows about platforms.** The
   * choice is made here, above the interface, so that every existing caller
   * and every existing test keeps a `Pusher` that means exactly one service.
   * A router hiding behind `Pusher` would make `MemoryPusher.sent` ambiguous
   * about which of the two a notification had reached, which is the one thing
   * those assertions exist to pin down.
   *
   * Absent, Android addresses fall to `pusher` — which in development is the
   * console, and is why the whole path can be exercised before the FCM
   * credential exists.
   */
  androidPusher?: Pusher;
  now?: () => number;
  logger?: boolean;
  /**
   * One address whose one-time code is fixed rather than random.
   *
   * App Review has to sign in, and signing in here means reading a code out of
   * an inbox a reviewer has no access to — so without this the app cannot be
   * reviewed at all, which is a rejection rather than a rough edge.
   *
   * The code is published in the review notes, so treat it as public: the
   * account it opens must hold nothing that matters. Everything else about the
   * path is unchanged — the code is still stored hashed, still expires, still
   * counts attempts, and every other address still gets randomness.
   *
   * `contact` is the second demo account — the one that exists so the first
   * has somebody to open a channel with, DEMO-ACCOUNT.md. It has no code of
   * its own and is named here for one reason: neither of these is a user, so
   * neither belongs in the build census. See `Accounts.buildsSeenSince`.
   */
  review?: { identifier: string; code: string; contact?: string };
  /**
   * The sign-in addresses of the accounts that host *getting-started
   * channels* — the introductory channel a new account with nobody in it is
   * placed in. See `ChannelRegistry.placeInCohort`.
   *
   * **Unset is off**, which is what this ships as, and is also how it ends:
   * emptying it stops cohorts being created and withdraws the privacy page's
   * section about them in the same restart. The channels already made are left
   * standing — by then they are ordinary channels with conversations in them,
   * and retiring a feature is not a reason to take one away from anybody.
   *
   * It is a growth hack with a sunset written into its off switch. See
   * planning/decisions/2026-09-15-a-new-account-does-not-arrive-alone.md.
   */
  cohortHosts?: string[];
  /**
   * Where to send somebody who wants to donate, and the token that proves an
   * incoming webhook came from Ko-fi.
   *
   * Both halves are independent. No `url` and the app offers nothing, which is
   * also how the donate call to action is withdrawn without an App Store round
   * trip. No `verificationToken` and deliveries are refused, because an
   * unauthenticated writer to this table is worse than no table.
   */
  kofi?: { url?: string; verificationToken?: string };
  /**
   * Where somebody reads the privacy policy and wants to write to a person —
   * including to ask for their account to be deleted, which the policy promises.
   *
   * Unset, the page points at the support address on the App Store listing,
   * which is a real channel rather than a placeholder. Set it once there is an
   * address worth publishing.
   */
  contactEmail?: string;
  /**
   * Where somebody whose build has fallen below `MIN_SUPPORTED_BUILD` goes to
   * get a newer one.
   *
   * Served from here rather than compiled into the app, because the client
   * that needs it is by definition one that cannot be shipped anything: an
   * install too old to talk to this server is also too old to have been given
   * a corrected address. The one place both ends can still agree is the
   * unauthenticated endpoint the client is already asking for `minBuild`.
   *
   * Unset, the screen says to update from the App Store and offers no button,
   * which is honest — a link that opens nothing is worse than a sentence.
   */
  updateUrl?: string;
  /**
   * Turns recorded audio into text. Without one there is no transcription, and
   * the privacy policy says nothing about any of it — which is the whole of
   * what this option does today.
   *
   * Optional in the way `media` and `store` are, and for the same reason: every
   * other rule here is enforced without it, and the suite runs with no network
   * and no key. It is also the switch: this is the first thing the application
   * does that spends money per tap and sends audio to a third party, so an
   * absent credential has to mean absent feature rather than a broken one.
   */
  transcription?: TranscriptionProvider;
  /**
   * An address that may transcribe without limit, on top of whatever accounts
   * carry the `transcripts_unlimited` mark.
   *
   * **A bootstrap, and deprecated.** Until 2026-08-25 this was
   * `transcribeIdentifier` and meant the opposite of what it means now: the
   * *only* address allowed to start a transcript, everybody else refused.
   * Transcription is open to everybody since, one free use each, and the mark
   * that lifts the limit lives on the account — `bin/db --write "update
   * accounts set transcripts_unlimited = 1 where identifier = '…'"`.
   *
   * It is still read so that a server whose `.env` names an address does not
   * silently demote that person to one free use on the deploy that opens the
   * feature up. Set the column, then unset the variable; nothing else should
   * be added to it.
   *
   * Matched the way sign-in matches: trimmed, case-insensitively.
   */
  transcribeUnlimitedIdentifier?: string;
  /**
   * How much audio one free transcript may cover, in transcription minutes —
   * a recording's length times the number of stems, which is the unit the
   * provider bills in and the unit `billed_ms` already records.
   *
   * Unset, a free transcript may be of any length. Set, it is the second
   * thing that can refuse one, and it refuses with the number in the sentence
   * so nobody has to guess how far over they were.
   *
   * It exists because "one free use" caps the count and not the bill: one use
   * of a twenty-minute pair costs about ten cents and one use of a three-hour
   * four-way costs about two dollars. Unlimited accounts ignore it.
   */
  freeTranscriptMinutes?: number;
  /**
   * How often the websocket sweep looks for a socket that has gone silent.
   *
   * Defaults to `HEARTBEAT_INTERVAL_MS` and is set by nothing in production.
   * It is here for the same reason `now` is, and does a different half of the
   * job: `now` is what the sweep reads, this is how often it gets to read it.
   * A test that injects a clock can move a connection past its budget in an
   * instant and then has to wait real seconds for the next tick to notice —
   * which cost `ws.test.ts` thirty-four of its thirty-eight seconds.
   */
  heartbeatIntervalMs?: number;
}

export interface App {
  fastify: FastifyInstance;
  db: Db;
  accounts: Accounts;
  channels: ChannelRegistry;
  devices: Devices;
  donations: Donations;
  transcripts: Transcripts;
  help: Help;
  /**
   * Where a `RecordingView` is composed, and since the floor passed 21 the
   * only place: Home stopped carrying the flat list, so recordings reach a
   * client on the channel snapshot and nowhere else.
   *
   * Both are here because that snapshot travels over the websocket, and a test
   * about what a recording *says* should not have to open a socket to read it.
   * `recordingsInChannel` is right for a channel the registry is holding;
   * `recordingView` is for a row written straight to the database, which the
   * registry has never heard of.
   */
  recordingsInChannel: (channelId: string, userId: string) => RecordingView[];
  recordingView: (row: RecordingRow, userId: string) => RecordingView;
  /**
   * Publishing, exposed on the same terms as `channels`: a test about what
   * publication *decides* should not have to stand up a live room and a
   * socket to reach the decision.
   */
  publication: Publication;
}

/**
 * The largest track anyone may upload, from core so that the refusal the
 * client makes for itself and the `bodyLimit` here are one number.
 */
export { MAX_TRACK_BYTES } from '../../core/constants';

/**
 * What to call a track's bytes when handing them back.
 *
 * Only what the picker actually yields — an audio file somebody has on a
 * phone — and deliberately short rather than a mime database: anything not
 * here is served as `application/octet-stream`, which is a file that saves
 * and does not play, rather than a guess that plays wrongly. `.opus` and
 * `.ogg` are the same container and are listed separately because both names
 * are in use and the extension is all we have to go on.
 */
const TRACK_CONTENT_TYPES: Record<string, string> = {
  '.mp3': 'audio/mpeg',
  '.m4a': 'audio/mp4',
  '.aac': 'audio/aac',
  '.wav': 'audio/wav',
  '.aiff': 'audio/aiff',
  '.aif': 'audio/aiff',
  '.flac': 'audio/flac',
  '.ogg': 'audio/ogg',
  '.opus': 'audio/ogg',
  '.caf': 'audio/x-caf',
};

export function buildApp(options: BuildOptions = {}): App {
  const now = options.now ?? Date.now;
  /**
   * Where `stable` and `beta` are looked for. See `BuildOptions.trainRoot` —
   * the default is the directory production serves, and a test overrides it so
   * that two runs of the suite cannot delete each other's fixtures.
   */
  const trainRoot = options.trainRoot ?? join(__dirname, '..', 'web');
  const db = openDb(options.dbPath ?? ':memory:');
  const accounts = new Accounts(db, options.review);
  const donations = new Donations(
    db,
    accounts,
    options.kofi?.verificationToken
  );
  const help = new Help(db);
  // The `req` serializer is the whole of what keeps credentials out of the
  // journal — several addresses here carry one in the URL, and Fastify's
  // default serializer logs `request.url` verbatim. See log-url.ts for which
  // and why it is a serializer rather than pino's `redact`. Fastify merges
  // this over its own defaults, so `err` and `res` are untouched.
  const fastify = Fastify({
    logger: options.logger
      ? { serializers: { req: logSafeRequest } }
      : false,
  });

  // Several endpoints take no body, and a client that still declares
  // application/json would otherwise be rejected before reaching any handler.
  // Treating an empty body as {} makes that a non-event rather than a 400 that
  // looks like a permissions problem.
  fastify.addContentTypeParser(
    'application/json',
    { parseAs: 'string' },
    (_request, body: string, done) => {
      if (!body || body.trim() === '') return done(null, {});
      try {
        done(null, JSON.parse(body));
      } catch (error) {
        done(error as Error, undefined);
      }
    }
  );

  // Uploaded tracks and cover art arrive as raw bytes rather than multipart:
  // there is exactly one file and no fields, so a multipart parser would be a
  // dependency earning nothing. The body is kept as a Buffer for the two
  // routes that want it.
  const rawBytes = (
    _request: FastifyRequest,
    body: Buffer,
    done: (error: Error | null, body?: unknown) => void
  ) => done(null, body);
  fastify.addContentTypeParser(/^audio\//, { parseAs: 'buffer' }, rawBytes);
  // Cover art, on the same terms. The route validates what it actually got
  // from the bytes rather than trusting this header — see artwork.ts, which
  // is why a lying content-type costs a 400 rather than a wrong image.
  fastify.addContentTypeParser(/^image\//, { parseAs: 'buffer' }, rawBytes);
  fastify.addContentTypeParser(
    'application/octet-stream',
    { parseAs: 'buffer' },
    rawBytes
  );

  // Ko-fi posts form-encoded, with the whole payload as JSON in a single
  // `data` field. Kept as the raw string and handed to Donations intact, since
  // that string is what gets stored verbatim — a parser dependency for one
  // field of one route would earn nothing.
  fastify.addContentTypeParser(
    'application/x-www-form-urlencoded',
    { parseAs: 'string' },
    (_request, body: string, done) => done(null, body)
  );

  // Filled in once the websocket plugin loads; no-ops until then.
  const homeNotifier = createHomeNotifier();
  const settingsNotifier = createSettingsNotifier();
  const reachability = createReachability();
  const devices = new Devices(db);
  const preferences = new NotificationPreferences(db);
  const pusher = options.pusher ?? new ConsolePusher(() => {});
  // **Its own console, never `pusher`.** This fell back to the iOS sender until
  // 2026-09-06, on the reasoning that a server with no FCM credential should
  // still log what it would have sent rather than drop it silently. That was
  // right in development, where `pusher` is a `ConsolePusher` anyway, and
  // wrong everywhere else: on a box with APNs configured it handed FCM
  // registration tokens to Apple, which refuses them with a `BadDeviceToken`
  // that names the token and says nothing about the service being wrong. No
  // row was pruned — `isDeadToken` declines 400 for exactly this class of
  // confusion — so the cost was a log full of a failure whose cause was not in
  // it. A token belongs to the service that issued it, and there is no
  // arrangement under which sending it elsewhere is better than not sending.
  const androidPusher = options.androidPusher ?? new ConsolePusher(() => {});
  const pusherFor = (platform: DevicePlatform): Pusher =>
    platform === 'android' ? androidPusher : pusher;
  const pushNotifier = createPushNotifier();


  /**
   * Turns "these people should know" into notifications actually sent.
   *
   * Three filters now, in this order: on an arrival, leave alone anybody who
   * has been ignoring arrivals for a week, look up where each person can be
   * reached, and forget every address Apple says is dead. The registry
   * supplies none of them — it knows only that something happened.
   *
   * **There was a third and it is gone, on 2026-09-09.** It dropped any device
   * with a live session socket, on the premise that such a device is one
   * somebody is looking at, so the notification would be a second copy of what
   * is already on screen. The premise stopped being true when stepping in
   * became an open microphone: capturing keeps a backgrounded process alive,
   * so a phone in a pocket holds a socket for hours and was the one device
   * being silenced — the one that most needed telling.
   *
   * **The duplicate it guarded against is handled where it can be seen.** The
   * client's notification handler shows a banner only for a notification whose
   * `reachesInApp` is set — a ping — and never plays a sound in the
   * foreground, so an arrival landing on the app it is about is silent and
   * goes to Notification Centre rather than over the screen. That judgement
   * belongs on the device, which knows what is in front of somebody; the
   * server only ever knew that a socket was open. `reachesInApp` survives for
   * exactly that, and is now read by the client alone.
   *
   * Deliberately not awaited. A notification is a courtesy, and a channel
   * transition must not wait on Apple or fail because of it.
   */
  pushNotifier.notify = (userIds, message) => {
    /**
     * **Arrivals alone are pausable, and arrivals alone count towards it.**
     *
     * The pause exists because a week of unread banners is what makes
     * somebody reach for the iOS switch, and the banners that arrive in that
     * volume are all of one kind: a room saying who walked into it. The other
     * three are somebody doing something aimed at one person — adding them to
     * a channel, calling them into one, taking up their invitation — and they
     * happen a handful of times, not a handful of times a day. Silencing
     * those would be spending the whole cost of the feature on the
     * notifications least responsible for it, and would make the pause
     * self-perpetuating: a note from a human is the likeliest thing to bring
     * a lapsed person back, and it would be the thing withheld.
     *
     * So the gate is the kind, and it governs **both halves**. Only an
     * arrival is refused, and only an arrival starts the clock — a clock fed
     * by notifications the rule would never withhold would be measuring one
     * thing and deciding another, and a single ping could then pause a week
     * of arrivals on its own.
     */
    const pausable = message.kind === 'arrived';
    /**
     * Whoever has been sent arrivals for a week without once opening the app,
     * and is therefore owed quiet rather than another one.
     *
     * **Ahead of every other filter, so that a paused person costs nothing** —
     * no address lookup, no grouping, and no stamp.
     */
    const paused = pausable
      ? accounts.notificationsPaused(userIds, now() - NOTIFICATION_PAUSE_MS)
      : new Set<string>();
    /**
     * Who is actually being sent to, for the stamp at the bottom.
     *
     * Written after the fact rather than from `userIds`, because the clock
     * this starts has to measure arrivals that were really sent: a person
     * with no registered device is not ignoring anything, and stamping them
     * would pause an account that has never been reachable.
     */
    const notified: string[] = [];
    // Grouped by how loudly it should land rather than sent per person: two
    // recipients who chose the same thing share one request, and the common
    // case — nobody has touched the setting — is a single group again, which
    // is what this path did before levels existed.
    const levels = preferences.levelsFor(userIds, message.channelId);
    // Keyed on the platform as well as the alert since 2026-09-04. The alert
    // decides how loudly this lands; the platform decides which service is
    // asked to land it, and an address sent to the wrong one is refused in a
    // way indistinguishable from a stale row. Two recipients still share a
    // request whenever they share both answers, which for a single-platform
    // deployment is the same grouping this did before.
    const byGroup = new Map<string, { platform: DevicePlatform; alert: NotificationAlert; tokens: string[] }>();
    /**
     * Every address belonging to an account with `debug` set, so that what was
     * sent to it can be read back afterwards.
     *
     * **Only the debug account, deliberately.** A line per notification per
     * device, for everybody, is a log nobody can read and a record of who is
     * being told what about whom — which is not a thing to accumulate on a box
     * because it was easy. The flag already gates the audio diagnostics panel
     * and is the switch for exactly this kind of looking.
     *
     * Keyed by token because that is the only thing a delivery result carries
     * back: the send is grouped by platform and alert across people, so the
     * answer arrives with no idea whose device it was about.
     */
    const watched = new Map<string, string>();
    for (const [id, addresses] of devices.addressesByAccount(userIds)) {
      if (paused.has(id)) {
        // The debug account's half of the ledger, matching 'push intended'
        // below: *nothing was even attempted* is the commonest answer to "why
        // did that not arrive", and a pause is now one of the ways it happens.
        if (accounts.byId(id)?.debug === 1) {
          fastify.log.info(
            { account: id, channelId: message.channelId, kind: message.kind },
            'push paused'
          );
        }
        continue;
      }
      notified.push(id);
      const alert = alertFor(message.kind, levels.get(id) ?? DEFAULT_NOTIFICATION_LEVEL);
      if (accounts.byId(id)?.debug === 1) {
        for (const address of addresses) watched.set(address.token, id);
        // Logged before the send rather than after it, and whether or not
        // there is anything to send: *nothing was even attempted* is the
        // commonest answer to "why did that not arrive", and it leaves no
        // trace anywhere else.
        fastify.log.info(
          {
            account: id,
            channelId: message.channelId,
            kind: message.kind,
            alert,
            level: levels.get(id) ?? DEFAULT_NOTIFICATION_LEVEL,
            addresses: addresses.map((address) => ({
              token: address.token.slice(0, 8),
              platform: address.platform,
            })),
          },
          'push intended'
        );
      }
      for (const address of addresses) {
        // **Every registered address, since 2026-09-09.** What used to stand
        // here decided which of somebody's devices were "looking at a screen
        // right now" from whether each had a live socket — see the note above
        // this function for why that stopped being an answer to that question,
        // and where the judgement went instead.
        const key = `${address.platform}:${alert}`;
        const group = byGroup.get(key) ?? {
          platform: address.platform,
          alert,
          tokens: [],
        };
        group.tokens.push(address.token);
        byGroup.set(key, group);
      }
    }
    if (byGroup.size === 0) {
      // Logged even though nothing was sent. There are two ways to send
      // nothing again — nobody has registered a device, and every arrival's
      // recipient is paused — and they are named apart, because the second is
      // the server deciding rather than the world being empty, and a pause
      // that cannot be told from an unreachable account is one nobody will
      // ever find at the bottom of a "why did that not arrive".
      fastify.log.info(
        {
          channelId: message.channelId,
          asked: userIds.length,
          paused: paused.size,
          why: paused.size > 0 ? 'everybody paused or unreachable' : 'no registered devices',
        },
        'push skipped'
      );
      return;
    }
    // Stamped before the sends rather than in their callbacks: the clock is
    // about having been notified, which is settled here, and a delivery
    // result arrives per address rather than per person. A refusal from Apple
    // does not un-notify anybody — the notification left — and the address it
    // names is pruned by the 410 path instead.
    if (pausable) accounts.noteNotified(notified, now());
    for (const { platform, alert, tokens } of byGroup.values()) {
      void pusherFor(platform)
        .send(tokens, message, alert)
        .then((results) => {
          for (const result of results) {
            if (result.dead) devices.forget(result.token);
            const account = watched.get(result.token);
            if (account === undefined) continue;
            // The other half of the ledger: what Apple or Google actually
            // said about this one address. `status` 200 is delivered to the
            // service, which is as far as any server can see.
            fastify.log.info(
              {
                account,
                channelId: message.channelId,
                kind: message.kind,
                platform,
                alert,
                token: result.token.slice(0, 8),
                status: result.status,
                reason: result.reason,
                dead: result.dead === true,
                error: result.error,
              },
              'push delivered'
            );
          }
          const failed = results.filter((r) => r.status !== 200);
          fastify.log.info(
            {
              channelId: message.channelId,
              kind: message.kind,
              // How many of the people asked for were left alone because
              // they have stopped opening the app. Zero for every kind but an
              // arrival, and for almost every arrival; the only trace a pause
              // leaves anywhere.
              paused: paused.size,
              // Named because the two services refuse things differently, and
              // a bare status is ambiguous between them once both are live.
              platform,
              alert,
              sent: results.length - failed.length,
              failed: failed.map((r) => ({
                // Truncated: the whole token is in the database if it is ever
                // wanted, and a log line is not the place to accumulate every
                // address the server knows.
                token: r.token.slice(0, 8),
                status: r.status,
                reason: r.reason,
                error: r.error,
              })),
            },
            'push sent'
          );
        })
        .catch((error) => {
          fastify.log.error({ err: error }, 'push failed');
        });
    }
  };

  /**
   * Tells whoever asked that the person they asked has turned up.
   *
   * **The one notification this server sends that nobody could have been
   * waiting for on a screen.** Every other one announces something inside a
   * channel both people already belong to, where the socket has usually drawn
   * it before the push lands. An invite link is handed over and then there is
   * nothing: no row on Home, no way to check, and days between sending it and
   * whatever happens next. This is the answer arriving.
   *
   * Called from the three places a pair becomes contacts — a link redeemed, a
   * request accepted, and the crossed pair of requests that accepts itself —
   * rather than from inside `Accounts`, which is where the rule about *who*
   * becomes a contact lives and which has never heard of a notification.
   * `ChannelRegistry` gets the same separation from the other direction.
   *
   * **Silently does nothing without a pair channel**, which `ensurePairChannel`
   * answers null for only when the two ids are the same — already impossible
   * on every path here, since none of them can make somebody their own
   * contact. It is a guard against a future caller rather than a case: there is
   * no honest notification to send about a channel that does not exist, and
   * inventing an id for one would put a value into the collapse key, the
   * thread and the recipient's level that nothing else in the system would
   * recognise.
   */
  function tellTheInviter(
    inviterId: string,
    whoAccepted: AccountRow,
    pair: { channelId: string } | null,
    how: 'link' | 'request'
  ): void {
    if (!pair) return;
    pushNotifier.notify(
      [inviterId],
      notifications.accepted(whoAccepted.display_name, how, pair.channelId)
    );
  }

  const channels = new ChannelRegistry(
    db,
    accounts,
    now,
    options.media,
    (error, context) =>
      fastify.log.error({ err: error, context }, 'media operation failed'),
    options.roomCloseGraceMs,
    pushNotifier,
    options.store,
    options.mixWaitMs,
    options.trackRoot,
    options.cohortHosts ?? [],
    // Whether somebody can be told that a room they are in went live, which is
    // the whole of what a cohort seat is worth. `ChannelRegistry` is given the
    // question rather than the table for the reason every other wiring here
    // has: the composition root is the only layer allowed to know that push
    // and channels are both in this process — and it is the only one that can
    // see both halves of this answer, the permission living on the account row
    // and the address in `Devices`.
    //
    // **Both halves, and the grant is the one that was missing.** An address
    // was standing in for a permission, and the two come apart in both
    // directions: a token can outlive a permission turned off in Settings, and
    // a permission can outlive the token a sign-out dropped. A seat is spent
    // once and the whole of what it offers is that somebody may speak into it
    // later, so it goes only to an account that is reachable on both counts.
    //
    // **`granted` explicitly, with no exception for builds that cannot say.**
    // `accounts.notifications` is null for every build before 213, and null
    // means *unknown* rather than denied — `markNotifications` refuses to
    // overwrite a phone's real answer with silence, correctly. Reading unknown
    // as eligible is what filled the first two cohorts, so it reads as refused
    // here. The cost is that the boot backfill now passes over the accounts
    // that predate the header, which is the right trade for a feature whose
    // whole point is the arrival who can be told: they are refused for a
    // reason they can undo, and the next build they run says so.
    (userId) =>
      accounts.byId(userId)?.notifications === 'granted' &&
      devices.tokensFor([userId]).length > 0
  );

  // Publishing, which is the one thing this server does that the world can
  // see. Constructed here beside the registry rather than inside it, on the
  // composition root's usual terms: it needs the registry's mix and the
  // registry's snapshots and owns neither, and a channel that never goes
  // public never touches it.
  const publication = new Publication(db, now, {
    store: options.store ?? null,
    usage: channels.usage,
    announce: (channelId) => channels.announce(channelId),
    // The floor-gated Opus mix, and the only audio publication is ever handed
    // — see `transcodeToPublished` on why nothing here may read a stem.
    recordingAudio: (recordingId) => channels.recordingAudio(recordingId),
    onError: (error, context) =>
      fastify.log.error({ err: error, context }, 'publication failed'),
  });

  // A guest changing their mind at the microphone is a withdrawal like any
  // other. Wired here rather than taken by either constructor: the registry
  // has no business knowing about publishing, and publication has no way to
  // hear a guest action.
  channels.onGuestConsentChanged = (channelId, guestId, consented) =>
    publication.guestConsentChanged(channelId, guestId, consented);

  // Reads the stems through the same gate the export does, and spends money,
  // so it is given the provider only when one is configured — with none, it
  // reports itself unavailable and every path into it is closed.
  const transcripts = new Transcripts({
    db,
    usage: channels.usage,
    provider: options.transcription,
    store: options.store,
    now,
    onError: (error, context) =>
      fastify.log.error({ err: error, context }, 'transcription failed'),
    // A transcript landing is not an action anybody took, so nothing else
    // pushes a snapshot on its behalf — the same reason a finished mix emits.
    onChanged: (channelId) => channels.announce(channelId),
    // A transcript that produced nothing gives the free use back. Keyed on
    // the recording, so this does not have to remember who paid — the account
    // row holds that, which is also what makes it survive the sweep that
    // eventually removes the transcript.
    onFailed: (recordingId) => accounts.refundFreeTranscript(recordingId),
  });

  // Channels outlive the process that was holding them, so the first thing a
  // new one does is pick them up again — along with squaring the books on
  // whatever the old process left mid-flight: a recording still capturing, a
  // LiveKit room with nobody in it, an upload directory belonging to a channel
  // this process has never heard of.
  //
  // Here rather than in index.ts so that every test harness exercises it too.
  // Rehydration is the kind of thing that works until the one path nobody
  // tried, and a server that only rehydrates in production has no path anybody
  // tried.
  channels.restore();

  // Every accepted pair is owed a one-to-one channel, and the pairs that
  // became contacts before that was true have none. After `restore`, not
  // before: the check for whether one already exists reads the live registry,
  // so running this against an empty one would give every existing pair a
  // second channel.
  //
  // Idempotent, so the reading that matters is the second boot's, which should
  // create nothing. It is logged either way rather than only when it acts —
  // silence would be indistinguishable from the pass having been skipped.
  const backfilled = channels.backfillPairChannels(accounts.acceptedPairs());
  fastify.log.info({ created: backfilled }, 'contact channels backfilled');

  // The accounts that arrived before *getting-started channels* existed are
  // exactly the ones they were written for: they are still looking at two
  // empty lists. After `restore` and after the pass above, for both of their
  // reasons — placement reads the live registry to find the open cohort, and
  // the gate it applies counts contacts, which the line above does not change
  // but the ordering makes obvious.
  //
  // Does nothing at all with no host configured, which is the state this
  // ships in. Idempotent, so the reading that matters is the second boot's,
  // which should place nobody; logged either way, since silence would be
  // indistinguishable from the pass having been skipped.
  //
  // **It now also passes over anybody unreachable**, on the gate added
  // 2026-09-15, and that needs no code here — `cohortCandidates` was always a
  // candidate list and `placeInCohort` has always been the verdict. Which
  // means this pass is no longer only for accounts predating the feature: an
  // account that turned notifications on while the server was down is picked
  // up by it too, since the registration that would have placed them reached
  // a process that is gone. That is a second reason for the sweep and not a
  // second mechanism.
  // **Before the backfill, and that order is the whole of why this runs here.**
  // The repair gives back the seats that were spent on rows which can never
  // answer, and the pass below fills a cohort that has seats left — so
  // repairing first is what lets a returned seat go to somebody real on the
  // same boot rather than a deploy later.
  //
  // Idempotent like the two above it, so the reading that matters is the
  // second boot's, which should repair nothing; logged either way, since
  // silence would be indistinguishable from the pass having been skipped.
  const repaired = channels.repairCohorts();
  fastify.log.info(repaired, 'cohorts repaired');

  const seeded = channels.backfillCohorts(accounts.cohortCandidates());
  fastify.log.info({ placed: seeded }, 'cohorts backfilled');

  // Expired one-time codes and invitations are dead the moment their deadline
  // passes, and nothing else ever removes them. Sweeping belongs to the
  // application rather than to any one entry point, so it starts here — a
  // deploy, a test harness or a script all get the same behaviour — and runs on
  // the app's own clock so it can never disagree with the rows it is judging.
  accounts.start(now);
  fastify.addHook('onClose', async () => accounts.stop());

  /** Resolves the bearer token to an account, or replies 401 and returns null. */
  function authenticate(request: FastifyRequest): AccountRow | null {
    const header = request.headers.authorization;
    if (!header?.startsWith('Bearer ')) return null;
    return accounts.accountForToken(header.slice(7), now()) ?? null;
  }

  async function requireAccount(
    request: FastifyRequest,
    reply: { code: (n: number) => { send: (body: unknown) => unknown } }
  ): Promise<AccountRow | null> {
    const account = authenticate(request);
    if (!account) {
      reply.code(401).send({ error: 'Unauthorized' });
      return null;
    }
    // Which build is calling, recorded where the caller is already known.
    //
    // Written only when it *changes*, unlike `last_seen_at`, which the socket
    // rewrites on every heartbeat because the value it holds moves constantly.
    // This one is a constant per install, so an unconditional UPDATE on every
    // authenticated request would be a write per request for a value that is
    // almost never different.
    //
    // The socket is the main path — a client sitting in a channel makes almost
    // no HTTP calls — and this catches the rest: signing in, uploading, and
    // anybody whose socket has not reconnected since the upgrade.
    const claimed = claimedBuild(request.headers[BUILD_HEADER]);
    // Which kind of client, so the census can count native installs alone.
    // Absent means native, which is every client built before this existed.
    const client = claimedClient(request.headers[CLIENT_HEADER]);
    // **The account's build is only ever a native one.** `accounts.last_build`
    // is whichever device spoke last, and `bin/people` prints it as *that
    // person's build* with an expired flag against the floor. A web client
    // writing there would put a number that is not an install over one that
    // is — so somebody whose phone is on 56 and below the floor would show as
    // current because they once opened a browser, which is the masking failure
    // that moved the census off this column in the first place, made worse:
    // a second phone at least represents something installed.
    //
    // `last_seen_at` is still stamped, below and unconditionally, because that
    // one is true of a browser — a person with the web app open *is* about,
    // which is what a contact list renders.
    if (
      client === 'native' &&
      claimed !== null &&
      claimed !== account.last_build
    ) {
      accounts.markSeen(account.id, now(), claimed);
    } else if (client === 'web') {
      accounts.markSeen(account.id, now());
    }
    // The session's own row, unguarded, which is the difference between the
    // two writes rather than an inconsistency. The guard above protects a
    // column that is a constant per install and is compared against the
    // account's single value; this one is *per session*, so there is nothing
    // on the account row to compare it with — and it stamps `last_seen_at`,
    // which moves constantly and is what bounds the build census. One UPDATE
    // by primary key per authenticated request, where the socket does the
    // same per message.
    accounts.markSession(
      request.headers.authorization?.slice(7) ?? '',
      now(),
      claimed,
      client
    );
    // Whether the app on this phone may reach them, on the same terms as the
    // build above: a header on a request already being made, written only
    // when it changes, and native only. A browser reports nothing and would
    // have nothing true to report; see NOTIFY_HEADER. Level 3.
    const notify =
      client === 'native'
        ? claimedNotifyState(request.headers[NOTIFY_HEADER])
        : null;
    if (notify !== null) accounts.markNotifications(account.id, notify, now());
    return account;
  }

  // --- Auth ---------------------------------------------------------------

  fastify.post('/auth/request-code', async (request, reply) => {
    const body = request.body as { identifier?: string } | undefined;
    const identifier = body?.identifier?.trim();
    if (!identifier) {
      return reply.code(400).send({ error: 'identifier is required' });
    }

    // Sign-in is by email. The spec also allows a phone number and the backlog
    // keeps the design for it, but nothing user-facing hints at it: an
    // unavailable option is worse than an absent one, because someone will try
    // it and conclude the app is broken.
    if (!isEmailAddress(identifier)) {
      return reply.code(400).send({
        error: 'Enter a valid email address.',
        code: 'invalid_identifier',
      });
    }

    if (!options.mailer) {
      request.log.error('no mailer configured; cannot deliver a code');
      return reply.code(503).send({ error: 'Sign-in is temporarily unavailable.' });
    }

    const code = accounts.issueCode(identifier, now());
    if (code) {
      try {
        await options.mailer.sendCode(identifier, code);
      } catch (error) {
        // Logged without the code: a one-time code in the logs is a credential
        // in the logs, and would be a bypass no flag controls.
        request.log.error({ err: error, identifier }, 'failed to send code');
        return reply.code(502).send({ error: 'Could not send the code.' });
      }
    }

    // Identical whether a code was just sent or the throttle suppressed it, so
    // the endpoint cannot be used to probe recent activity for an address.
    return { sent: true };
  });

  fastify.post('/auth/verify', async (request, reply) => {
    const body = request.body as
      | {
          identifier?: string;
          code?: string;
          displayName?: string;
          marketingEmail?: unknown;
        }
      | undefined;
    if (!body?.identifier || !body?.code) {
      return reply.code(400).send({ error: 'identifier and code are required' });
    }

    // Only `true` grants, and anything else — false, absent, a client too old
    // to send it — is silence rather than a no. `Accounts.establish` says why
    // that distinction matters: the box on the sign-in screen starts clear on
    // every device, so reading a missing field as a refusal would make the
    // second phone somebody signs in on revoke what the first one granted.
    const result = accounts.verifyCode(
      body.identifier,
      body.code,
      body.displayName,
      now(),
      body.marketingEmail === true
    );
    // One message for every failure mode, so this cannot be used to discover
    // which identifiers have accounts.
    if (!result) return reply.code(401).send({ error: 'Invalid or expired code.' });

    // **No cohort placement here, since 2026-09-15.** It used to happen on
    // `result.created`, which was the one moment a brand-new account was
    // knowable and looked like the obvious place for it. It is now the one
    // moment the *other* half of the gate cannot yet be true: a seat goes to
    // somebody who can be told the room went live, and nobody has been asked
    // about notifications ten seconds into an install — the app deliberately
    // does not ask there. Placing is now `POST /devices`'s job, on the
    // registration that brings an account its first address. See
    // decisions/2026-09-15-a-cohort-seat-goes-to-somebody-who-can-be-told.md.

    // **A signup that resolved invitations owes each pair a channel**, added
    // 2026-09-25 with the rule that an invitation sent to an address accepts
    // when that address signs up. `resolveInvitesFor` wrote the contacts and
    // says whose; making the channels is this route's job, `channels` not
    // being `Accounts`' to reach. The same two follow-ups the link path makes,
    // and for the same reasons: a pair who are contacts are owed the channel
    // that is the point of being contacts, and both Homes have somebody on
    // them who was not there a moment ago.
    //
    // The sender is told, exactly as they are when a link is followed — they
    // wrote to an address days ago and have had nothing to check since.
    for (const requesterId of result.resolved) {
      const pair = channels.ensurePairChannel(requesterId, result.account.id);
      // `request` rather than a third body: the sender did send a contact
      // request, and under the rule above signing up with the address it went
      // to *is* the acceptance. "Accepted your contact request" is therefore
      // exactly what happened, said to the person who asked.
      tellTheInviter(requesterId, result.account, pair, 'request');
    }
    if (result.resolved.length > 0) {
      homeNotifier.notify([result.account.id, ...result.resolved]);
    }

    // Nothing is revoked and nothing is forgotten here, which is the whole of
    // what changed on 2026-08-24. Signing in used to end every other session
    // and drop every address those sessions were reachable at; a phone and a
    // tablet may now both be signed in, and both may be notified.
    //
    // The failure that clearing guarded against — a signed-out phone still
    // receiving this account's notifications — has moved to the two routes
    // that actually end a session, `/auth/sign-out` and
    // `/auth/sign-out-others`. It belongs there rather than here: a device
    // being signed out learns it is finished from a 401, at which point it
    // holds no credential to deregister with, so whatever revokes the session
    // has to forget the address in the same breath.
    return {
      token: result.token,
      account: toPublic(result.account),
    };
  });

  fastify.post('/auth/sign-out', async (request, reply) => {
    // Before the token is revoked, because forgetting the device needs to know
    // whose device it was.
    const account = authenticate(request);
    const body = request.body as { deviceToken?: string } | undefined;
    // Only the device signing out, and since 2026-08-24 that is a real
    // distinction again rather than a distinction without a difference: a
    // tablet may be signed in at the same time, and signing out of the phone
    // in your hand must not silence it.
    if (account && body?.deviceToken) devices.forget(body.deviceToken);

    const header = request.headers.authorization;
    if (header?.startsWith('Bearer ')) accounts.revokeToken(header.slice(7));
    return reply.code(204).send();
  });

  /**
   * Signs out every device but this one.
   *
   * The lever that signing in used to pull for free, kept as something
   * somebody does on purpose. A session token is good for ninety days and a
   * lost phone can be revoked by nothing the owner still holds, so with
   * several sessions allowed there had to be one operation that reaches a
   * session whose token you do not have. This is it, and it is the only one.
   *
   * Both halves, in that order: the sessions, then the addresses they were
   * reachable at. The order does not matter for correctness — neither is
   * conditional on the other — but doing the credentials first means a
   * request that dies in the middle has revoked more than it has silenced,
   * which is the right way round to be interrupted.
   *
   * The caller names its own device token for the same reason `/auth/sign-out`
   * carries one: the server knows which *session* is asking, from the bearer
   * token, and has no way at all to know which row in `device_tokens` belongs
   * to the same phone. An install with no notification permission has no such
   * row, sends none, and correctly loses every address the account had.
   *
   * Answers with how many sessions went, which is what the app puts on screen.
   * Zero is an ordinary answer and means there was nowhere else signed in.
   */
  fastify.post('/auth/sign-out-others', async (request, reply) => {
    const account = await requireAccount(request, reply);
    if (!account) return;

    const body = request.body as { deviceToken?: string } | undefined;
    // A bearer header, because `requireAccount` got an account out of one.
    const token = request.headers.authorization?.slice(7) ?? '';
    const sessions = accounts.revokeOthersForAccount(account.id, token);
    devices.forgetOthers(account.id, body?.deviceToken);
    return { sessions };
  });

  // --- Devices ------------------------------------------------------------

  /**
   * Records where this install can be reached.
   *
   * Called on every sign-in and on every launch with a stored token, because a
   * device token is not permanent: iOS reissues it after a restore, and a
   * registry that is only written once slowly fills with addresses that no
   * longer resolve.
   */
  fastify.post('/devices', async (request, reply) => {
    const account = await requireAccount(request, reply);
    if (!account) return;

    const body = request.body as
      | { token?: string; platform?: string }
      | undefined;
    const token = body?.token?.trim();
    if (!token) return reply.code(400).send({ error: 'token is required' });
    const platform = body?.platform === 'android' ? 'android' : 'ios';

    // The session that owns this address, recorded because this is the one
    // request that ever holds both credentials at once — the bearer token in
    // the header and Apple's token in the body. It is what lets a notification
    // be withheld from the device that is looking at it rather than from the
    // person, and nothing else can establish it. See `device_tokens` in db.ts.
    const session = request.headers.authorization?.slice(7);

    // Asked before the write, because afterwards it is always true. This is
    // the arrival of an account's first address rather than the hundredth
    // refresh of one — see `Devices.hasToken`.
    const first = !devices.hasToken(account.id);

    devices.register(
      token,
      account.id,
      platform as DevicePlatform,
      now(),
      session ? sha256(session) : undefined
    );

    // Becoming reachable is what a *getting-started channel* waits for, and
    // this is the moment it happens. Only on the first address: placement is
    // idempotent anyway, but this request runs on every launch for the rest of
    // the account's life and the question is about an event, not a state.
    //
    // Not allowed to cost the registration, for the reason the signup path
    // gave when it held this call: placement is a courtesy, and a throw here
    // would fail the one request that makes somebody reachable — leaving them
    // both unplaced and unnotifiable, which is worse in both halves.
    if (first) {
      try {
        channels.placeInCohort(account.id);
      } catch (error) {
        fastify.log.error({ err: error }, 'cohort placement failed');
      }
    }

    return { ok: true };
  });

  /**
   * The phone's audio diagnostic log, kept where it can be read later.
   *
   * **It exists because a ring in memory is the wrong container for the fault
   * it was built for.** The log was forty lines, then two hundred, held in the
   * app and copied out by hand — which works while somebody is holding the
   * phone at the moment it goes wrong, and not at all for a fault that appears
   * once in a session of stepping in and out. A force-quit, a crash or an
   * update takes it, and those are exactly the three things somebody does when
   * the audio has stopped and they want it back. See decisions/ § *The phone
   * holds a microphone in order to hear*, the investigation this was built
   * for, which lists what the lines mean.
   *
   * **To the journal rather than to a table**, which is a deliberate trade.
   * A table would be queryable and would also need a migration, a sweep, and a
   * line in `erase` so that deleting an account takes its diagnostics with it —
   * three obligations for data whose whole value expires in a day or two.
   * `journalctl` already rotates, and is already how every other question about
   * this box is answered.
   *
   * **Gated on the `debug` column**, so it is not an open log sink: any signed
   * -in account could otherwise write unbounded text into this box's journal.
   * The same column gates the panel that produces these lines, so nothing is
   * lost by refusing everybody else — and a client that gets a refusal drops
   * the lines rather than retrying, which is what stops a rejected batch
   * becoming a loop.
   */
  fastify.post('/diagnostics', async (request, reply) => {
    const account = await requireAccount(request, reply);
    if (!account) return;
    if (account.debug !== 1) return reply.code(403).send({ error: 'not enabled' });

    const body = request.body as
      | { build?: number; lines?: Array<{ at?: number; text?: string }> }
      | undefined;
    const lines = (body?.lines ?? [])
      // Trimmed on arrival rather than trusted: this is free-text from a client
      // being written into a system log, and the only thing standing between a
      // diagnostic and a way to fill a disk is a bound on both counts.
      .filter((line) => typeof line?.text === 'string')
      .slice(-500)
      .map((line) => ({
        at: typeof line.at === 'number' ? line.at : null,
        text: String(line.text).slice(0, 300),
      }));
    if (lines.length === 0) return { ok: true, stored: 0 };

    fastify.log.info(
      { accountId: account.id, build: body?.build ?? null, lines },
      'audio diagnostics'
    );
    return { ok: true, stored: lines.length };
  });

  fastify.delete('/devices/:token', async (request, reply) => {
    const account = await requireAccount(request, reply);
    if (!account) return;
    const { token } = request.params as { token: string };
    // Unconditional: whoever holds this address is entitled to stop it being
    // sent to, and checking ownership first would turn the route into a way of
    // asking whether a given token belongs to somebody else.
    devices.forget(token);
    return reply.code(204).send();
  });

  // --- Contacts -----------------------------------------------------------

  fastify.post('/contacts/request', async (request, reply) => {
    const account = await requireAccount(request, reply);
    if (!account) return;

    const body = request.body as { identifier?: string } | undefined;
    if (!body?.identifier) {
      return reply.code(400).send({ error: 'identifier is required' });
    }

    // A request to an address with no account is stored verbatim in
    // pending_invites and resolves if that address ever signs up, so an
    // identifier that could never name anybody is a row that is permanent and
    // unreachable at once. This is the only place that check can happen, since
    // by then the address is a primary key.
    //
    // Email only, and the same test sign-in uses — narrowed from
    // isPlausibleIdentifier on 2026-08-15, when an invitation stopped being a
    // row and became a message. A phone number is an address this server cannot
    // send to, which makes it an invitation nobody receives.
    //
    // Refusing a well-formed address because no account holds it would answer,
    // one guess at a time, exactly the question pending_invites exists to leave
    // unanswered — so this check must not consult the accounts table, and
    // deliberately does not. See db.ts.
    if (!isEmailAddress(body.identifier)) {
      return reply.code(400).send({ error: 'Enter a valid email address.' });
    }

    const result = accounts.requestContact(account.id, body.identifier, now());
    if (!result.ok) return reply.code(400).send({ error: result.error });

    // Nobody holds this address yet, so the invitation is the only thing that
    // can bring them here — a request whose email did not go out is a request
    // its recipient will never learn about. Undo the row rather than leave one
    // behind: it would show as pending on the sender's screen and make every
    // retry answer "Request already sent", which is the one state from which
    // the mistake cannot be corrected.
    //
    // The cost of awaiting the send is that the response is now slower when the
    // address has no account than when it has one, which is a timing answer to
    // the question the body of this route refuses to answer directly. Accepted
    // knowingly: telling the sender their invitation failed is worth more than
    // closing a side channel that a determined prober could read from the app's
    // own behaviour anyway.
    if (result.targetId === null) {
      if (!options.mailer) {
        accounts.withdrawRequest(account.id, body.identifier);
        request.log.error('no mailer configured; cannot send an invitation');
        return reply
          .code(503)
          .send({ error: 'Invitations are temporarily unavailable.' });
      }
      // **The budget is spent here, after the duplicate check and before the
      // message.** A second invitation to the same address never reaches this
      // line — `requestContact` has already refused it — so asking again
      // costs nothing, and a server with no mailer has refused above rather
      // than charging for a message it cannot send. What is left is exactly
      // the set of requests that are about to put mail on the wire.
      //
      // Nothing below gives it back. The row is withdrawn when a send fails
      // and the count is not, deliberately: see db.ts on why a refund would
      // make a provoked failure the way around this.
      if (!accounts.spendInviteSend(account.id, now())) {
        accounts.withdrawRequest(account.id, body.identifier);
        request.log.warn(
          { accountId: account.id },
          'invitation refused: daily budget spent'
        );
        // Said plainly, unlike the rest of this route. What it discloses is the
        // sender's own rate back to them, and there is no address-existence
        // question in it — the vagueness elsewhere protects the recipient,
        // and there is nothing to protect somebody from about their own
        // sending.
        return reply.code(429).send({
          error:
            'You have sent as many invitations as you can today. Try again tomorrow.',
        });
      }
      // **Every invitation carries a link, and which link depends on the
      // sender.** With a username it is theirs; without one it is the door
      // into the web app. The difference is only how direct the route is.
      //
      // **Both now end in the same relationship**, which they did not until
      // 2026-09-25: following the link accepted outright while ignoring it and
      // signing up left a request to be answered, so one invitation meant two
      // different things depending on which half of the email was acted on.
      // `resolveInvitesFor` accepts on signup now, so the sender asks once and
      // is answered once.
      const link = account.username
        ? inviteLinkUrl(request, account.username, account.display_name)
        : `${origin(request)}/open`;
      try {
        await options.mailer.sendInvite(
          body.identifier,
          account.display_name,
          link
        );
      } catch (error) {
        accounts.withdrawRequest(account.id, body.identifier);
        // Nothing else to undo since 2026-09-25: the link carries no pin, so
        // there is no minted row that a failed send would otherwise leave
        // behind. The request itself still goes, for the reason it always
        // did — an invitation that was not sent must leave nothing behind.
        request.log.error({ err: error }, 'failed to send an invitation');
        return reply.code(502).send({ error: 'Could not send the invitation.' });
      }
    }

    // The same crossed-requests case as the by-id route below: they had asked
    // first, so this accepted theirs, and the pair are owed their channel —
    // and they are owed the news, which is the half a screen cannot give them.
    if (result.accepted && result.targetId) {
      const pair = channels.ensurePairChannel(result.targetId, account.id);
      tellTheInviter(result.targetId, account, pair, 'request');
    }

    // The recipient is the whole point: without telling them, a request simply
    // never appears on their side.
    // No target to notify when the address has no account yet — the invitation
    // above is what stands in for it.
    homeNotifier.notify(
      result.targetId ? [account.id, result.targetId] : [account.id]
    );
    return { ok: true, accepted: result.accepted };
  });

  /**
   * This account's invite link, or the news that it cannot have one.
   *
   * `{ url: null }` rather than a 4xx for an account with no username: it is
   * not a refusal of anything, it is the answer to "what is my link", and the
   * screen asking draws a way to choose a username from exactly this. A status
   * code would make the app read an error to find a state.
   *
   * **It mints nothing, since 2026-09-25.** A link used to be good for one
   * person, so every press had to produce a new one and a cap bounded the
   * accumulation. A link is a standing address now — it is the account's
   * username, and the name to greet a reader with — so this composes a string
   * and writes nothing.
   *
   * **Still a `POST`**, which is now the wrong verb and the right route.
   * Renaming it to a `GET` is a wire change that would have to keep answering
   * the old one, for a tidiness nobody can see; the client has called it this
   * since there were pins.
   */
  fastify.post('/contacts/invite-link', async (request, reply) => {
    const account = await requireAccount(request, reply);
    if (!account) return;

    // Nothing is minted any more and nothing is spent: the link is a fact
    // about the account rather than a row, so this is a read that happens to
    // be a POST. It stays a POST because the client has called it that since
    // there were pins, and renaming a route to suit its new verb is a wire
    // change for no gain.
    //
    // `null` for an account with no username, which is the one case there is
    // no link to write — the client draws *Choose a username* instead.
    if (!account.username) return { url: null };
    return {
      url: inviteLinkUrl(request, account.username, account.display_name),
    };
  });

  /**
   * Spends an invite link: whoever is signed in becomes a contact of whoever
   * minted it.
   *
   * Authenticated, and that is the whole shape of the feature — the link
   * proves who is inviting, the session proves who is accepting, and neither
   * half is any use without the other. The app calls this the moment it has a
   * session and an invitation in hand, which may be a fresh signup arriving
   * through the link or somebody who was already signed in when they opened
   * it.
   *
   * The refusals are told apart here, unlike a sign-in code's: see
   * `InviteRefusal`. What the app does with them is say them.
   */
  fastify.post('/contacts/invite/accept', async (request, reply) => {
    const account = await requireAccount(request, reply);
    if (!account) return;

    const body = request.body as
      | { username?: string; pin?: string }
      | undefined;
    // **The pin is optional since 2026-09-25**, links having stopped carrying
    // one. A request that brings a pin is a link minted before that day, still
    // sitting in the thread it was pasted into, or an app too old to know the
    // pin has gone; both are answered the old way. See planning/SHIMS.md for
    // what retires this branch.
    if (!body?.username) {
      return reply.code(400).send({ error: 'username is required' });
    }

    const owner = accounts.byUsername(body.username);
    // Deliberately the same answer as a wrong pin, and the only place this
    // route is coy. A username that exists and one that does not must look
    // alike, or this becomes the directory `core/username.ts` says there is
    // not — and unlike a pin, a username is guessable by design.
    if (!owner) {
      return reply.code(400).send({ error: inviteRefusalText('unknown') });
    }

    const result = body.pin
      ? accounts.redeemInvitePin(owner.id, body.pin, account.id, now())
      : accounts.acceptInviteLink(owner.id, account.id, now());
    if (!result.ok) {
      return reply.code(400).send({ error: inviteRefusalText(result.reason) });
    }

    // The same two follow-ups the guest acceptance makes, and for the same
    // reasons: a pair who are contacts are owed the channel that is the point
    // of being contacts, and both Homes have somebody on them who was not
    // there a moment ago.
    const pair = channels.ensurePairChannel(result.owner.id, account.id);
    homeNotifier.notify([account.id, result.owner.id]);
    // And a third since 2026-09-13, which the other two cannot do: whoever
    // minted this link is not looking at the app — they handed it over hours
    // or days ago and have had nothing to check since. See `tellTheInviter`.
    tellTheInviter(result.owner.id, account, pair, 'link');
    // **And the channel comes back, since 2026-09-25**, on the reasoning
    // `POST /contacts/:id/accept` set out the day before: becoming contacts is
    // what creates the place the two of you talk, and a channel nobody is told
    // about is the single most important thing this application has done for
    // somebody happening silently in a list they were not looking at.
    //
    // **It matters more on this route than on that one.** There the accepter
    // was already a user with a Home; here they may have signed up seconds ago
    // because of this link, so this is their *first* contact and their first
    // channel, and the whole point of arriving by invitation rather than
    // finding a request waiting.
    //
    // Additive, so no shim: a client that predates it reads `ok` and ignores
    // the rest. `null` is in fact unreachable here — `redeemInvitePin` has
    // already refused `self`, so the pair is never a pair of one — and is sent
    // anyway, because what makes an *older server* harmless is the client
    // reading an absent id as *nowhere to go*, and that is only tested if the
    // shape agrees with the sibling route.
    return {
      ok: true,
      contact: accounts.public(result.owner.id),
      channelId: pair?.channelId ?? null,
    };
  });

  // Withdrawal goes by address, not row id — see Accounts.withdrawRequest for
  // why an id would give away what the empty outgoing id exists to hide.
  //
  // Deliberately *not* validated the way /contacts/request now is: rows written
  // before that check exist and hold identifiers that are not addresses, and
  // withdrawal is the only thing that can remove one. Validating here would
  // make exactly those rows permanent, which is the problem rather than the
  // fix. There is nothing to protect either — this only ever deletes a row
  // whose requester_id is already the caller's.
  fastify.post('/contacts/withdraw', async (request, reply) => {
    const account = await requireAccount(request, reply);
    if (!account) return;

    const body = request.body as { identifier?: string } | undefined;
    if (!body?.identifier) {
      return reply.code(400).send({ error: 'identifier is required' });
    }

    const result = accounts.withdrawRequest(account.id, body.identifier);
    if (!result.withdrawn) {
      return reply.code(400).send({ error: 'No pending request to that address.' });
    }
    // The recipient, if there is one, has a request vanishing from their Home.
    homeNotifier.notify(
      result.targetId ? [account.id, result.targetId] : [account.id]
    );
    return { ok: true };
  });

  /**
   * Asks somebody you are in a channel with to be a contact.
   *
   * By id rather than address, because that is all you have of a person an
   * acquaintance brought into a conversation — and their address is theirs to
   * give out rather than ours to reveal so that this endpoint can work.
   *
   * Sharing a channel is what entitles you to ask. Without that, an account id
   * would be a way to pester anybody whose id you could guess or keep, and ids
   * travel in every roster. Refusals are a 404, matching the profile route, so
   * this cannot be used to find out which ids are real either.
   */
  fastify.post('/contacts/:id/request', async (request, reply) => {
    const account = await requireAccount(request, reply);
    if (!account) return;
    const { id } = request.params as { id: string };

    if (!channels.shareAChannel(account.id, id)) {
      return reply.code(404).send({ error: 'No such person.' });
    }

    const result = accounts.requestContactById(account.id, id, now());
    if (!result.ok) return reply.code(400).send({ error: result.error });
    // They had asked first, so this request accepted theirs — one of the three
    // ways a pair becomes contacts, and each owes the pair a channel. They are
    // therefore the requester, and go first; see the accept route below.
    if (result.accepted) {
      const pair = channels.ensurePairChannel(id, account.id);
      // Their request is the one that was accepted, so they are the one owed
      // the news — the crossed case reaching the same place the accept route
      // below reaches by the ordinary route.
      tellTheInviter(id, account, pair, 'request');
    }
    homeNotifier.notify([account.id, id]);
    return { ok: true, accepted: result.accepted };
  });

  fastify.post('/contacts/:id/accept', async (request, reply) => {
    const account = await requireAccount(request, reply);
    if (!account) return;
    const { id } = request.params as { id: string };
    if (!accounts.acceptContact(account.id, id, now())) {
      return reply.code(400).send({ error: 'No pending request from that user.' });
    }
    // Becoming contacts is what creates the place the two of you talk. Home is
    // a list of channels and nothing else now, so without this an acceptance
    // adds a person to a screen with nowhere to put them.
    //
    // **The requester first**, here and in the two crossed-request cases above,
    // which is the whole of what that argument order decides: a channel's
    // participants keep it, and an unnamed one is described by reading them
    // out. Whoever reached out is the nearest thing this channel has to an
    // initiator, and the alternative was ordering it by which of them happened
    // to tap accept.
    const pair = channels.ensurePairChannel(id, account.id);
    homeNotifier.notify([account.id, id]);
    // The requester asked and has been waiting; this is the answer. Where the
    // request went to an address with no account, the wait has been days.
    tellTheInviter(id, account, pair, 'request');
    // **The channel comes back, since 2026-09-24**, so that the client can put
    // whoever accepted into the place this acceptance just made. It has always
    // been created here and never named in the reply, which left the app to
    // find it in the next snapshot by matching participants — a search for
    // something the server already had in hand.
    //
    // Additive, and the safe direction: a client that predates it reads `ok`
    // and ignores the rest, exactly as every build has. No shim, because
    // nothing was renamed and nothing removed. Null only where
    // `ensurePairChannel` refused, which is a pair of one and cannot happen on
    // this route — the client treats it as *nowhere to go* rather than as an
    // error, so a server too old to send it simply does not move anybody.
    return { ok: true, channelId: pair?.channelId ?? null };
  });

  fastify.post('/contacts/:id/decline', async (request, reply) => {
    const account = await requireAccount(request, reply);
    if (!account) return;
    const { id } = request.params as { id: string };
    if (!accounts.declineContact(account.id, id)) {
      return reply.code(400).send({ error: 'No pending request.' });
    }
    homeNotifier.notify([account.id, id]);
    return { ok: true };
  });

  /**
   * A guest accepts a member's ask to be a contact — and stays where they are.
   *
   * **Over HTTP rather than the guest socket**, and that is the whole reason
   * this route exists: everything else a guest does is addressed to the room
   * and needs no account, where this is addressed to an account and needs one.
   * The seat travels in the body because the caller is holding both — a bearer
   * token for who they are, and the seat's own secret for where they are
   * sitting — and binding the two is what makes the acceptance mean anything.
   *
   * **It used to answer with a channel to open, and no longer answers with
   * anything.** Accepting wrote a membership as well as a contact until
   * 2026-09-16, so the page had somewhere to go the moment it returned; now
   * the seat stands and nothing about where this person is has changed. Being
   * asked into the channel is a second act by a member — an ordinary `INVITE`
   * — and the hand-over went with it.
   */
  /**
   * Asking a contact in as a guest.
   *
   * Beside `/channels/:id/guest-links` rather than beside `INVITE`, because it
   * is the same act as minting a link — opening the room to somebody who will
   * not be a member of it — and the opposite of making somebody one.
   */
  fastify.post('/channels/:id/guest-invites', async (request, reply) => {
    const account = await requireAccount(request, reply);
    if (!account) return;
    const { id } = request.params as { id: string };
    const body = request.body as { contactId?: string } | undefined;
    if (!body?.contactId) {
      return reply.code(400).send({ error: 'contactId is required' });
    }

    const invited = channels.inviteGuest(id, account.id, body.contactId);
    if (!invited.ok) {
      return reply.code(statusFor(invited.code)).send({ error: invited.error });
    }
    // Both ends: the invitee has something new on Home, and the members have a
    // new row among what is outstanding in the room.
    homeNotifier.notify([body.contactId]);
    return { guestId: invited.session.id };
  });

  /** What has been offered in this channel and not yet taken up. */
  fastify.get('/channels/:id/guest-invites', async (request, reply) => {
    const account = await requireAccount(request, reply);
    if (!account) return;
    const { id } = request.params as { id: string };
    return {
      invites: channels.guestInvitesFor(id, account.id).map((session) => ({
        guestId: session.id,
        invitedAt: session.invited_at,
        invitedBy: session.admitted_by,
        who: accounts.public(session.account_id ?? ''),
      })),
    };
  });

  /** Taking one back, which any member in the room may do. */
  fastify.delete('/channels/:id/guest-invites/:guestId', async (request, reply) => {
    const account = await requireAccount(request, reply);
    if (!account) return;
    const { id, guestId } = request.params as { id: string; guestId: string };

    const session = channels.guests.byId(guestId);
    const revoked = channels.revokeGuestInvite(id, account.id, guestId);
    if (!revoked.ok) {
      return reply.code(statusFor(revoked.code)).send({ error: revoked.error });
    }
    // The invitation leaves their Home the moment it is taken back, rather
    // than at their next refresh: an offer that is gone should not still be
    // tappable, and tapping it would answer with a seat that no longer exists.
    if (session?.account_id) homeNotifier.notify([session.account_id]);
    return { ok: true };
  });

  /**
   * Taking up a seat from the app.
   *
   * **The one door into a channel that does not go through a browser.** A seat
   * made by knocking lives in the tab that knocked — its secret is in that
   * tab's `sessionStorage` — and the app has no way to present it and never
   * will. What the app does have is a session, and a seat bound to an account
   * needs nothing more: `enterSeat` says why.
   *
   * It answers with the same `GuestView` the guest page renders, rather than
   * the channel: a guest is shown names and no ids, no profiles and no
   * recordings, and that boundary is the point of having a second shape at all.
   * Handing the app a `ChannelState` here would widen it by accident.
   */
  fastify.post('/channels/:id/seat/enter', async (request, reply) => {
    const account = await requireAccount(request, reply);
    if (!account) return;
    const { id } = request.params as { id: string };

    const entered = channels.enterSeat(account.id, id);
    if (!entered.ok) {
      return reply.code(statusFor(entered.code)).send({ error: entered.error });
    }
    const view = channels.guestView(id, entered.guestId);
    if (!view) {
      return reply.code(404).send({ error: 'No such channel.' });
    }
    // **The secret goes out only here**, to the account that just proved it
    // holds this seat, and the app ignores it. A browser cannot: its guest
    // socket authenticates with the pair and has no session to fall back on.
    return { guestId: entered.guestId, secret: entered.secret, view };
  });

  /**
   * The same acceptance from the app, where the seat is held by an account.
   *
   * **The channel rather than the seat, and no secret.** The caller has a
   * session and is sitting in the room; which seat that is is the server's to
   * resolve, and a client naming a guest id would be holding a credential it
   * has no business with. See `Channels.acceptSeatAsk`.
   *
   * Beside the guest page's route rather than folded into it: the two
   * authenticate differently, and one route that took either shape would be
   * one edit away from accepting a guest id with no secret behind it.
   */
  fastify.post('/channels/:id/seat/contact-ask/accept', async (request, reply) => {
    const account = await requireAccount(request, reply);
    if (!account) return;
    const { id } = request.params as { id: string };
    const body = request.body as { askerId?: string } | undefined;
    if (!body?.askerId) {
      return reply.code(400).send({ error: 'askerId is required' });
    }

    const result = channels.acceptSeatAsk(account.id, id, body.askerId);
    if (!result.ok) {
      return reply.code(statusFor(result.code)).send({ error: result.error });
    }
    // Both, as every contact mutation does — see the guest page's route, whose
    // audience is the same pair for the same reason.
    homeNotifier.notify([account.id, body.askerId]);
    return { ok: true };
  });

  fastify.post('/contacts/guest-ask/accept', async (request, reply) => {
    const account = await requireAccount(request, reply);
    if (!account) return;
    const body = request.body as
      | { guestId?: string; secret?: string; askerId?: string }
      | undefined;
    if (!body?.guestId || !body.secret || !body.askerId) {
      return reply
        .code(400)
        .send({ error: 'guestId, secret and askerId are required' });
    }

    const result = channels.acceptGuestAsk(
      account.id,
      body.guestId,
      body.secret,
      body.askerId
    );
    if (!result.ok) {
      return reply.code(statusFor(result.code)).send({ error: result.error });
    }
    // Both, as every contact mutation does: one of them has a new contact and
    // the pair's own channel, and the other has a Home with a contact and a
    // channel on it that were not there before.
    homeNotifier.notify([account.id, body.askerId]);
    return { ok: true };
  });

  /**
   * A guest accepts a member's ask that they make an account here.
   *
   * The weakest of the three asks and the shortest route of the three: by the
   * time this is called the account exists and the caller holds a token for it
   * — `POST /auth/verify` made it, as it does for anybody — so all that is
   * left is to bind it to the seat and credit whoever asked.
   *
   * **Nothing is notified.** No contact was written and no channel changed, so
   * there is no Home anywhere that reads differently; the one thing that did
   * change is the seat, and the room is told by the ordinary push of the view.
   */
  fastify.post('/contacts/guest-invite/accept', async (request, reply) => {
    const account = await requireAccount(request, reply);
    if (!account) return;
    const body = request.body as
      | { guestId?: string; secret?: string; askerId?: string }
      | undefined;
    if (!body?.guestId || !body.secret || !body.askerId) {
      return reply
        .code(400)
        .send({ error: 'guestId, secret and askerId are required' });
    }

    const result = channels.acceptGuestJoin(
      account.id,
      body.guestId,
      body.secret,
      body.askerId
    );
    if (!result.ok) {
      return reply.code(statusFor(result.code)).send({ error: result.error });
    }
    return { ok: true };
  });

  /**
   * Ends a contact, and with it the channels that existed only because of it.
   *
   * Two effects rather than one, and the second is the reason this is not a
   * line in `Accounts`. Removing the row alone would leave the pair's
   * one-to-one channel standing on both screens with no relationship behind it
   * — reachable, enterable, and no longer meaning anything. `leavePairChannels`
   * is where the rule about *which* channels lives, including the one about
   * what the far side keeps.
   *
   * Mutual, because the contacts row is the pair. It is stated in the app's
   * confirmation rather than hidden: whoever taps this ends it for both.
   *
   * `DELETE` rather than a `/remove` POST, this being the one contact verb that
   * is a deletion of something that exists rather than an answer to a request.
   */
  fastify.delete('/contacts/:id', async (request, reply) => {
    const account = await requireAccount(request, reply);
    if (!account) return;
    const { id } = request.params as { id: string };
    if (!accounts.removeContact(account.id, id)) {
      return reply.code(400).send({ error: 'Not a contact.' });
    }
    channels.leavePairChannels(account.id, id);
    // Both, and for different reasons: one screen has lost a contact and some
    // channels, the other has lost a contact and — where the channel held
    // nothing worth keeping — a channel it did not act on.
    homeNotifier.notify([account.id, id]);
    return { ok: true };
  });

  // --- The web app, and the page in front of it -----------------------------

  /**
   * The two web trains, and the informational page at the root.
   *
   * `/app` is what the App Store release is, `/beta` what TestFlight has, and
   * they are deployed by `bin/deploy-web` rather than by `bin/deploy` — see
   * planning/decisions/DECISIONS.md § *Three variants of deploy*. The server
   * serves whatever is on disk and knows nothing about which build that is.
   *
   * **The directories are `stable/` and `beta/`, not `app/`,** and that is not
   * a preference. An rsync pattern without a leading slash matches a directory
   * of that name at *any* depth, so while `bin/deploy` excluded a bare `app/`
   * a bundle in `web/app/` was silently never shipped: the deploy succeeded
   * and the page 404'd with nothing saying why. That exclude is anchored to
   * `/app/` now, so the hazard is gone and this is belt and braces — but do
   * not rename these back, because the belt is what was found by experiment
   * and the braces are what a future pattern might undo again.
   *
   * **Both directories are also excluded from that rsync**, and that one is
   * load-bearing rather than defensive: they are built by `bin/deploy-web`
   * from a tag and never exist in a working checkout, so `--delete` would take
   * them off the box on the next server deploy. See the comment there.
   */
  const TRAINS = [
    { prefix: '/app', dir: 'stable' },
    { prefix: '/beta', dir: 'beta' },
  ] as const;

  for (const train of TRAINS) {
    /**
     * Every path under the prefix that is not a file on disk: the single-page
     * app's own routes, which this server knows nothing about.
     *
     * Registered as the *not-found handler of this prefix's scope* rather than
     * as a `/*` route, and that is not a stylistic choice. A `/*` route would
     * collide with the plugin's own wildcard, forcing `wildcard: false` — and
     * that makes the plugin enumerate the directory at registration time, so a
     * bundle written after boot would not be routed at all. **Every web deploy
     * would then need a server restart**, and a restart costs presence, which
     * is far too much to pay for copying static files. This way the plugin
     * resolves from disk per request and `bin/deploy-web` never touches the
     * running process.
     */
    const shell = async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const html = await readFile(
          join(trainRoot, train.dir, 'index.html'),
          'utf8'
        );
        reply.type('text/html; charset=utf-8');
        reply.header('cache-control', 'no-store');
        // The manifest and the Apple tags, with this train's prefix in them,
        // and the link preview. See shell.ts for why the export cannot write
        // any of them itself.
        return withInstallTags(html, train.prefix, origin(request));
      } catch {
        // Built rather than committed, so a checkout that has not run
        // `bin/deploy-web` has no app. Said plainly, for the same reason the
        // guest page says it: the alternative is a blank screen and a console
        // nobody is looking at.
        return reply
          .code(503)
          .send({ error: `The web app (${train.dir}) has not been built.` });
      }
    };

    // Encapsulated, so the not-found handler belongs to this prefix alone.
    // Fastify allows one per scope, and the root's own 404 is left as it was.
    void fastify.register(
      async (scope) => {
        void scope.register(fastifyStatic, {
          root: join(trainRoot, train.dir),
          // Relative to the scope, whose prefix is the train's.
          prefix: '/',
          // `sendFile` is unused, and two registrations must not decorate the
          // same reply twice.
          decorateReply: false,
          // The directory index is the shell, and the shell is the handler
          // above — the only place the no-store header is applied and the only
          // place that can explain an absent bundle.
          index: false,
          setHeaders(reply, path) {
            // **The shell must not be cached, and the assets must.** Expo
            // emits hashed filenames, so an asset is immutable by construction
            // and can be held for a year. `index.html` is the one file whose
            // name never changes, and a cached copy means a returning visitor
            // silently runs an old bundle — which would falsify the premise
            // that the web app is always current, and that premise is what
            // excuses it from the build census. See
            // planning/decisions/DECISIONS.md § *Three variants of deploy*.
            //
            // `index: false` means this should never see the shell, but it is
            // still named: a request for `/app/index.html` by hand is served
            // as an ordinary file, and a year-long cache on it would be the
            // same bug by a rarer door.
            if (path.endsWith('index.html')) {
              reply.header('cache-control', 'no-store');
            } else {
              reply.header(
                'cache-control',
                'public, max-age=31536000, immutable'
              );
            }
          },
        });
        /**
         * `/app/` with a trailing slash, which the not-found handler above
         * never sees.
         *
         * The train root is a real directory on disk, so `@fastify/send`
         * stats it and tries to 301 to the slashed form — finds the slash
         * already there, has nothing to redirect to, and returns **403**.
         * That reaches the plugin as an error rather than as a directory, so
         * the `callNotFound()` on its directory branch never runs and the
         * shell is never reached. `index: false` is what puts it on that
         * path; the plugin has no option that changes it.
         *
         * Registering the route covers both spellings — Fastify's
         * `prefixTrailingSlash` defaults to `both`, so this is `/app` and
         * `/app/` — and it goes through `shell` rather than the file on disk
         * so that the no-store header and the 503 for an unbuilt bundle
         * apply at this door too. Serving the app rather than redirecting to
         * the unslashed form is safe because the export references
         * everything absolutely and prefixed, so it runs identically from
         * either URL.
         *
         * A directory *inside* the bundle — `/app/_expo/` — still 403s, and
         * that is left alone: refusing to list a bundle's insides is the
         * right answer, and nobody types one.
         */
        scope.get('/', shell);
        scope.setNotFoundHandler(shell);
      },
      { prefix: train.prefix }
    );
  }

  /**
   * The one door into the web app — see open.ts, which owns the rule.
   *
   * Two routes rather than a wildcard: what may follow is the app's home or
   * one channel, and an open redirector that will forward any path is a
   * different and worse thing than one that will forward two.
   */
  fastify.get('/open', async (_request, reply) => {
    reply.type('text/html; charset=utf-8');
    reply.header('cache-control', 'no-store');
    return openPage({ available: await availableTrains() });
  });

  /**
   * The landing page's own images, and the only static files this server
   * serves that are not part of a web app bundle.
   *
   * **Two screenshots, 52 KB the pair**, which is the whole reason this is
   * acceptable on a page whose founding argument is that shipping 400 KB of
   * React to show a paragraph is the wrong trade. They are WebP, resized to
   * 750px, and committed rather than built — there is no pipeline here and a
   * screenshot is not something a build step can produce anyway. Regenerate
   * them with `cwebp -q 82 -resize 750 0`, from captures taken at the App
   * Store's own sizes.
   *
   * Registered in its own encapsulated scope with `decorateReply: false`, for
   * the reason the train registrations give: two registrations must not
   * decorate the same reply twice.
   *
   * **Immutable, and the filenames are not hashed**, which is the one trap
   * here. `home.webp` keeps its name across a redesign, so a year-long cache
   * on an unhashed name means somebody who has been here before sees the old
   * screenshot indefinitely. A week is the compromise: long enough that the
   * page is not re-fetching decoration, short enough that a stale shot ages
   * out on its own. **If these ever change, rename them.**
   */
  void fastify.register(async (scope) => {
    void scope.register(fastifyStatic, {
      root: join(__dirname, '..', 'public'),
      prefix: '/assets/',
      decorateReply: false,
      index: false,
      setHeaders(reply) {
        reply.header('cache-control', 'public, max-age=604800');
      },
    });
  });

  /**
   * The root, for somebody who is not a user yet.
   *
   * Unauthenticated and server-rendered.
   *
   * **It no longer redirects anybody**, changed 2026-09-14 at the prompt.
   * A script on the page used to send a signed-in visitor to `/open` before
   * paint — this server cannot read `localStorage` and the token is not a
   * cookie, so it could never have been done here. The preference is that
   * somebody signed in sees this page like everybody else, so the script is
   * gone and `?stay`, which existed only to defeat it, is gone with it.
   *
   * **The cost is one tap for a returning visitor**, who now lands on a
   * marketing page rather than in the app. That is what the browser link is
   * for and why it sits directly under the store button rather than at the
   * foot of the page.
   */
  fastify.get('/', async (request, reply) => {
    // Whether there is a web app on this box at all, asked per request because
    // `bin/deploy-web` adds a bundle without restarting anything — so a value
    // read at boot would be wrong for exactly as long as it mattered. One
    // `access` per train on a route nobody hits in a loop.
    //
    // **Any train, not stable**, since 2026-08-30: this asked about stable
    // alone and so withheld the browser entirely from a box that was serving
    // beta. Which train somebody goes to is `/open`'s question, not this
    // page's; all this needs to know is whether there is one.
    const webAppReady = (await availableTrains()).length > 0;
    reply.type('text/html; charset=utf-8');
    return landingPage({
      appStoreUrl: options.updateUrl,
      webAppReady,
      origin: origin(request),
    });
  });

  /**
   * The page an invite link opens — see invite.ts, which owns the prose and
   * the reasoning.
   *
   * **It reads the database for nothing**, since 2026-09-25. It used to hold
   * both halves of a credential and check them before it would say a name;
   * there is no credential now, and the name it draws comes out of the address
   * it was asked for. So this route is a pure function of its own URL, which
   * is what stops it being a directory: `/i/annak` and `/i/nobodyatall` render
   * identically, so nothing is learned by asking, and there is nothing to
   * enumerate.
   *
   * Unauthenticated, necessarily. What it hands out is a page; taking the link
   * up happens later, from inside the app, against a session — and that is
   * where an unknown username is refused, by a route that is deliberately coy
   * about which usernames exist.
   */
  const invitePageFor = (
    request: FastifyRequest,
    reply: FastifyReply,
    username: string
  ) => {
    reply.type('text/html; charset=utf-8');
    // Never cached. The name rides in the query, so two links to one username
    // are two pages, and a shared cache must not answer one with the other.
    reply.header('cache-control', 'no-store');

    const asked = (request.query as { name?: unknown } | undefined)?.name;
    return invitePage({
      username,
      displayName: typeof asked === 'string' && asked ? asked : undefined,
      appStoreUrl: options.updateUrl,
      webAppReady: availableTrainsCount > 0,
      origin: origin(request),
    });
  };

  fastify.get('/i/:username', async (request, reply) => {
    const { username } = request.params as { username: string };
    availableTrainsCount = (await availableTrains()).length;
    return invitePageFor(request, reply, username);
  });

  /**
   * The same page for a link minted before the pin went.
   *
   * **A shim, and the one that cannot be skipped**: invite links live in other
   * people's threads for as long as those threads do, so an address that
   * stopped resolving would be an invitation that stopped working with nothing
   * to tell anybody why. The pin is ignored here — the page no longer has
   * anything to check it against — and is still honoured by the route that
   * takes a link up, which is where it does any work. See planning/SHIMS.md.
   */
  fastify.get('/i/:username/:pin', async (request, reply) => {
    const { username } = request.params as { username: string; pin: string };
    availableTrainsCount = (await availableTrains()).length;
    return invitePageFor(request, reply, username);
  });

  // --- The guest page -------------------------------------------------------

  /**
   * The page a guest link opens.
   *
   * Served by this server rather than by Caddy, which was the other candidate.
   * Caddy would mean a `file_server` block, a path on the box that deploys
   * separately from the code, and a second thing to get right when the media
   * plane eventually moves; this way the page ships with the server that talks
   * to it and cannot be a version behind. It costs two routes and a `readFile`.
   *
   * Unauthenticated, necessarily — whoever opens it has no account, which is
   * the entire point — and it hands out nothing. The token in the URL is
   * checked when the socket opens, not here, so this route answers the same
   * page for a live link and a dead one and the refusal arrives a moment later
   * with a reason.
   */
  fastify.get('/g/assets/:file', async (request, reply) => {
    const { file } = request.params as { file: string };
    // Two files, named rather than resolved: the bundle and its sourcemap.
    // Anything else is a path this route will not join, which is the whole of
    // the traversal story.
    const type =
      file === 'guest.js'
        ? 'text/javascript; charset=utf-8'
        : file === 'guest.js.map'
          ? 'application/json; charset=utf-8'
          : null;
    if (!type) return reply.code(404).send({ error: 'Not found.' });
    try {
      const body = await readFile(join(__dirname, '..', 'web', 'dist', file));
      reply.type(type);
      return body;
    } catch {
      // The bundle is built rather than committed, so a tree that has not run
      // `npm run build:web` has no page. Said plainly, because the alternative
      // is a blank screen and a console nobody is looking at.
      return reply
        .code(503)
        .send({ error: 'The guest page has not been built on this server.' });
    }
  });

  /**
   * Where the web app is on this box, or null when it is nowhere.
   *
   * **Stable first, then beta, and null is a real answer.** The two trains ship
   * separately and stable is expected to lag — it is cut from `released`, so it
   * cannot exist until a release contains the web app — which means a box can
   * quite normally be serving `/beta` and answering `/app` with a 503. That is
   * exactly what it was doing on 2026-08-30, when the guest page's hand-over
   * pointed at `/app` unconditionally: a phone browser was handed a JSON error
   * body and offered to save it as a file, which is what navigating to an API
   * refusal looks like to somebody who has just tapped Accept.
   *
   * Asked per request, like the landing page's check and for the same reason:
   * `bin/deploy-web` adds a bundle without restarting anything, so an answer
   * cached at boot is wrong for exactly as long as it matters.
   *
   * Deliberately not shared with `/`, which asks only about stable: that page
   * offers the browser to a stranger, and sending them to a beta train is a
   * different decision from finding somewhere to put a person who is already
   * mid-flow.
   */
  async function appBase(): Promise<string | null> {
    return (await availableTrains())[0] ?? null;
  }

  /**
   * Which trains this box actually serves, best first.
   *
   * The one fact `/open` decides from, and the reason a remembered train can
   * be trusted without being able to strand anybody: a prefix that is no
   * longer deployed simply is not in this list.
   */
  async function availableTrains(): Promise<string[]> {
    const found: string[] = [];
    for (const train of TRAINS) {
      try {
        await access(join(trainRoot, train.dir, 'index.html'));
        found.push(train.prefix);
      } catch {
        // Not deployed. Ordinary for stable, which is cut from `released`.
      }
    }
    return found;
  }

  async function guestShell(reply: FastifyReply): Promise<string | undefined> {
    try {
      return await readFile(join(__dirname, '..', 'web', 'guest.html'), 'utf8');
    } catch {
      await reply.code(503).send({ error: 'The guest page is not available.' });
      return undefined;
    }
  }

  /**
   * Where the web app is, stamped into the guest page so its one link out can
   * be right — or absent, so the page can leave the link off entirely rather
   * than offering a 503. Same question the acceptance asks; asked again here
   * because a page can sit open across a `bin/deploy-web`.
   */
  async function withAppBase(shell: string): Promise<string> {
    const base = await appBase();
    return base ? shell.replace('data-app=""', `data-app="${base}"`) : shell;
  }

  /**
   * The guest shell's link preview, which **names neither the channel nor
   * anybody in it.**
   *
   * The same reasoning `invite.ts` gives for its card: a preview is read by
   * everybody in the thread the link was pasted into and cached by services
   * that may never re-fetch, where the page is read by whoever opened it. A
   * guest link is handed out while a conversation is happening, so a card
   * naming the room would put that in the thread for good.
   *
   * **It cannot know whether the link is live in any case.** The token is
   * checked when the socket opens, not on this route, so a dead link and a
   * live one are served the same page — and a crawler's fetch and a person's
   * click are different moments besides.
   *
   * `undefined` removes the placeholder instead, which is `/g/seat`: reached
   * rather than addressed, so nobody pastes it anywhere.
   */
  function withSocial(shell: string, card?: ReturnType<typeof socialCard>): string {
    return shell.replace('<!--social-->', card ? socialTags(card) : '');
  }

  fastify.get('/g/:token', async (request, reply) => {
    const { token } = request.params as { token: string };
    const shell = withSocial(
      await withAppBase((await guestShell(reply)) ?? ''),
      socialCard(origin(request), {
        title: 'Join a conversation on The Floor',
        description:
          'Somebody has opened a room and sent you the link. It opens in ' +
          'your browser — no account, and nothing to install.',
        // No `path`: the address carries the link token. See socialCard.
        imageAlt: 'The Floor — it’s a group chat, but voice. Nothing rings.',
      })
    );
    if (!shell) return;
    reply.type('text/html; charset=utf-8');
    // The one interpolation on the page, into an attribute, escaped — the
    // token is 24 bytes of base64url and cannot contain a quote, and that is
    // an argument for why this is cheap rather than for skipping it.
    return shell.replace('data-link=""', `data-link="${escapeHtml(token)}"`);
  });

  /**
   * The way back to a channel somebody is a guest of, from Home.
   *
   * Reached rather than addressed, and that is the change of 2026-09-04. This
   * was `/g/c/:channelId`; **no address in this application carries an id**,
   * so which channel now travels in this tab's `sessionStorage`, written by
   * the app immediately before it navigates. See `app/src/ui/handover.ts`.
   *
   * A seat outliving the link that made it — `link_token` is nullable for
   * exactly that reason — is why this route exists at all rather than sending
   * somebody back through `/g/:token`.
   *
   * **It hands out nothing, and needs no credential to.** The page it returns
   * is the same static document `/g/:token` is; what gets anybody into the
   * room is the seat in their own `sessionStorage`, which survives the walk to
   * the app and back because it is one tab on one origin — the same property
   * the handover above relies on, and the reason the id never needed to be in
   * the path. Somebody arriving here without a seat is told to open the link
   * they were sent, which is also the honest answer for a channel they have
   * never been a guest of.
   */
  fastify.get('/g/seat', async (_request, reply) => {
    const shell = withSocial(await withAppBase((await guestShell(reply)) ?? ''));
    if (!shell) return;
    reply.type('text/html; charset=utf-8');
    return shell;
  });

  /**
   * The privacy policy, which App Store Connect will not accept a submission
   * without.
   *
   * Unauthenticated and served as HTML, because the people who need to read it
   * are a reviewer with a browser and anybody deciding whether to sign up.
   */
  fastify.get('/privacy', async (request, reply) => {
    reply.type('text/html; charset=utf-8');
    return privacyPage({
      contactEmail: options.contactEmail,
      origin: origin(request),
      // Named on the page only where the server can actually reach it. See
      // PolicyOptions.transcription.
      transcription: options.transcription?.name,
      // Disclosed while it can happen to the reader, **or while the channels
      // it already made are still standing**. Switching the hosts off stops
      // new placements; it does not delete the cohorts people are in, and a
      // page that went quiet about channels that still exist would be
      // withdrawing a disclosure rather than a feature. See
      // PolicyOptions.cohorts.
      cohorts: (options.cohortHosts?.length ?? 0) > 0 || channels.hasCohorts(),
    });
  });

  /**
   * The support page, which App Store Connect requires a URL for and which the
   * listing shows to anybody reading it.
   *
   * Its neighbour above rather than the donations routes below, despite the
   * name: those moved to `/donations` precisely so this could be here. A support
   * URL has to be a page a person opens — that field takes no `mailto:` — and
   * the two documents this server serves belong together.
   *
   * Unauthenticated, for the same reason: whoever needs it may not have an
   * account, and may be reading it because they cannot get one.
   */
  fastify.get('/support', async (request, reply) => {
    reply.type('text/html; charset=utf-8');
    return supportPage(options.contactEmail, origin(request));
  });

  /**
   * How to delete your account, which **Google Play requires a URL for** in the
   * Data safety form — and requires before a release to any track, internal and
   * closed testing included, not only production.
   *
   * Its two neighbours above exist because App Store Connect demanded a URL;
   * this one is the same shape of obligation from the other store, so it sits
   * with them rather than near `DELETE /me`, which is the route it describes.
   *
   * Unauthenticated, and that is the point rather than an oversight: the
   * requirement is that somebody can find out how to delete their account
   * *without* the app, so a page that needed a session would not satisfy it.
   * It carries no controls and destroys nothing — deletion itself is still the
   * authenticated `DELETE /me`, reached from Settings in the app or in the web
   * app at `/app`. See server/src/deletion.ts for why a signed-out deletion
   * endpoint was deliberately not built.
   */
  fastify.get('/delete-account', async (request, reply) => {
    reply.type('text/html; charset=utf-8');
    return deletionPage({
      contactEmail: options.contactEmail,
      origin: origin(request),
    });
  });


  // --- Help -----------------------------------------------------------------

  /**
   * The questions this person has asked, and whether they may ask another.
   *
   * A route rather than a field on the Home snapshot, on exactly the argument
   * `/donations` makes above: that snapshot is pushed to every client on every
   * change, and this is read by one screen when it opens. Nothing else in the
   * app is gated on it, so there is nothing that would go stale by not holding
   * it.
   *
   * **`canAsk` is decided here rather than counted in the app.** The limit is a
   * policy, and a policy compiled into the binary is one that needs an App
   * Store submission to loosen. The app greys its button and prints the reason
   * underneath, which is what every other disabled control there does.
   */
  fastify.get('/help', async (request, reply) => {
    const account = await requireAccount(request, reply);
    if (!account) return;

    const outstanding = help.outstandingFor(account.id);
    const canAsk = outstanding < MAX_OUTSTANDING;
    return {
      questions: help.forAccount(account.id),
      canAsk,
      // Said in the second person and about the backlog, because that is what
      // it actually is: not a rate limit somebody has tripped, but a queue on
      // our side that another question would only lengthen.
      askBlocked: canAsk
        ? null
        : `You have ${outstanding} questions waiting for an answer. Once one comes back you can ask another.`,
    };
  });

  /**
   * Asks one.
   *
   * Answers the question as stored, so the screen renders the row the server
   * kept rather than the string the field held — the two differ by a trim, and
   * a list that shows the untrimmed one until the next open is a list that
   * appears to change its mind.
   *
   * The refusals are 400 rather than 429 including the backlog one, which is
   * not a rate: 429 invites a client to retry after a delay, and no delay makes
   * this succeed. What makes it succeed is somebody answering.
   */
  fastify.post('/help', async (request, reply) => {
    const account = await requireAccount(request, reply);
    if (!account) return;

    const { text } = (request.body ?? {}) as { text?: unknown };
    if (typeof text !== 'string') {
      return reply.code(400).send({ error: 'A question is required.' });
    }

    const result = help.ask(account.id, text, now());
    if (!result.ok) {
      if (result.reason === 'empty') {
        return reply.code(400).send({ error: 'A question is required.' });
      }
      if (result.reason === 'too-long') {
        return reply.code(400).send({
          error: `Questions are limited to ${MAX_QUESTION_LENGTH} characters.`,
        });
      }
      return reply.code(400).send({
        error:
          'You have several questions waiting for an answer already. Once one comes back you can ask another.',
      });
    }

    return { question: result.question };
  });

  // --- Donations ----------------------------------------------------------

  /**
   * Where to donate, and what this person has already given.
   *
   * Named for donations rather than support, though the screen reading it is
   * called Support: "support" means money here and help everywhere else, and
   * `/support` is the path a person who wants help will try. That path is left
   * to them.
   *
   * A route rather than a field on the Home snapshot: that snapshot is pushed
   * to every client on every change, and this is read by one settings screen
   * when it opens. The same argument the protocol already makes for keeping
   * the profile fields off PublicAccount.
   *
   * The URL comes from configuration and never from the binary, which is what
   * makes withdrawing the donate call to action a restart rather than an App
   * Store submission — worth having, since the guideline permitting an external
   * payment link at all is under appeal.
   */
  fastify.get('/donations', async (request, reply) => {
    const account = await requireAccount(request, reply);
    if (!account) return;

    /*
      Who may be shown the link at all.

      The app ships worldwide, and Guideline 3.1.1(a) permits an external
      payment link only in the United States storefront — so this has to be
      decided per person rather than per build. The client reports what its
      device says; the policy reading it is server-side, so it can be changed
      without waiting for a release to reach anybody.

      An override on the account wins outright, in both directions. Absent one,
      an ambiguous or missing answer resolves to hidden: showing this to the
      wrong person is a guideline violation, and hiding it from the right one
      costs a donation.
    */
    const { locale, tz } = request.query as {
      locale?: string;
      tz?: string;
    };
    const visible =
      account.donations_allowed === null ||
      account.donations_allowed === undefined
        ? donationsVisibleFor(locale, tz)
        : account.donations_allowed === 1;

    return {
      url: visible ? (options.kofi?.url ?? null) : null,
      // Their own address, shown on that screen so they can pay with the one
      // we can recognise. It is the cheapest half of attribution by a distance.
      identifier: account.identifier,
      mine: donations.forAccount(account.id),
    };
  });

  /**
   * Ko-fi, telling us somebody gave.
   *
   * Unauthenticated, because Ko-fi holds no token of ours — the verification
   * token inside the payload is the whole proof, and checking it is Donations'
   * job. Answers 200 to anything verified, including a replay, because a
   * webhook that errors is a webhook retried forever.
   *
   * This path is configured in Ko-fi's dashboard rather than in any code we
   * ship, so moving it means editing it there in the same breath. Nothing
   * retries a 404 into the right place.
   */
  fastify.post('/donations/kofi', async (request, reply) => {
    const body = typeof request.body === 'string' ? request.body : '';
    const result = donations.record(body, now());

    if (!result.ok) {
      if (result.reason === 'unconfigured') {
        return reply.code(503).send({ error: 'Donations are not configured.' });
      }
      if (result.reason === 'unverified') {
        return reply.code(401).send({ error: 'Unauthorized' });
      }
      return reply.code(400).send({ error: 'Unreadable payload.' });
    }
    return { ok: true };
  });

  // --- Profiles -----------------------------------------------------------

  /**
   * Asks for a code at an address you would like to sign in with instead.
   *
   * `/auth/request-code` with a session behind it, and deliberately the same
   * shape: the same format check, the same mailer, the same throttle, and the
   * same answer whether or not a code went out.
   *
   * **It does not check whether the address is taken**, and the omission is
   * the point. Answering that here would turn this into a probe an
   * authenticated caller could run one address at a time — precisely the
   * disclosure `requestContact` is written to avoid. The check happens at
   * confirmation, where the only person who can reach it has just read a code
   * out of the mailbox in question.
   */
  fastify.post('/me/email', async (request, reply) => {
    const account = await requireAccount(request, reply);
    if (!account) return;

    const body = request.body as { identifier?: string } | undefined;
    const identifier = body?.identifier?.trim();
    if (!identifier) {
      return reply.code(400).send({ error: 'identifier is required' });
    }
    if (!isEmailAddress(identifier)) {
      return reply.code(400).send({
        error: 'Enter a valid email address.',
        code: 'invalid_identifier',
      });
    }

    if (!options.mailer) {
      request.log.error('no mailer configured; cannot deliver a code');
      return reply
        .code(503)
        .send({ error: 'Changing your address is temporarily unavailable.' });
    }

    const code = accounts.issueCode(identifier, now());
    if (code) {
      try {
        await options.mailer.sendCode(identifier, code);
      } catch (error) {
        // Logged without the code, for the reason `/auth/request-code` gives.
        request.log.error({ err: error, identifier }, 'failed to send code');
        return reply.code(502).send({ error: 'Could not send the code.' });
      }
    }
    return { sent: true };
  });

  /**
   * Spends the code and moves the account, or says why it could not.
   *
   * Two failures and they are told apart, unlike sign-in's one. A wrong code
   * is answered the way `/auth/verify` answers it, since the caller has proved
   * nothing; a taken address is answered plainly, since by then they have.
   * See `Accounts.changeIdentifier`.
   *
   * Answers with the profile, so the screen that asked can show the address it
   * now has rather than the one it sent.
   */
  fastify.post('/me/email/confirm', async (request, reply) => {
    const account = await requireAccount(request, reply);
    if (!account) return;

    const body = request.body as
      | { identifier?: string; code?: string }
      | undefined;
    if (!body?.identifier || !body?.code) {
      return reply.code(400).send({ error: 'identifier and code are required' });
    }

    if (!accounts.consumeCode(body.identifier, body.code, now())) {
      return reply.code(401).send({ error: 'Invalid or expired code.' });
    }

    const moved = accounts.changeIdentifier(
      account.id,
      body.identifier,
      now()
    );
    if (!moved.ok) return reply.code(409).send({ error: moved.error });

    // The contact rows a pending invitation to the new address has just become
    // are on somebody else's Home, which is showing a list that no longer says
    // everything it should.
    homeNotifier.notify(accounts.audienceFor(account.id));

    const profile = accounts.profile(account.id, account.id);
    return { ...profile, email: moved.account.identifier };
  });

  /**
   * Your own profile, and the only way to change it.
   *
   * A partial write: a field left out is left alone, so saving a handle cannot
   * blank a name the client did not happen to send.
   *
   * **`bio` is accepted and ignored**, rather than refused. Every build up to
   * and including 122 sends one whenever somebody edits their profile, and the
   * field it was written into is gone as of 2026-08-31 — so a 400 here would
   * turn every one of those saves into an error on a screen where the name
   * beside it saved fine. Ignoring is the two-step this repository already
   * requires in the other direction: the field can stop being tolerated once
   * `MIN_SUPPORTED_BUILD` has passed the last build that sends it.
   */
  fastify.post('/me', async (request, reply) => {
    const account = await requireAccount(request, reply);
    if (!account) return;

    const body = request.body as
      | { displayName?: unknown; im?: unknown; username?: unknown }
      | undefined;
    const changes: {
      displayName?: string;
      im?: Record<string, string>;
      username?: string;
    } = {};
    if (body?.displayName !== undefined) {
      if (typeof body.displayName !== 'string') {
        return reply.code(400).send({ error: 'displayName must be text.' });
      }
      // Refused rather than trimmed away to nothing: somebody with no name is
      // an empty space in every roster they appear in.
      if (body.displayName.trim() === '') {
        return reply.code(400).send({ error: 'A name cannot be empty.' });
      }
      changes.displayName = body.displayName;
    }
    /*
      The name they chose for themselves, which unlike the one above is
      optional — so blank is a removal here rather than a refusal, exactly as
      it is for a messaging handle. Nothing else in a profile can be given up
      once given, and this one can, because nothing depends on it.

      Refused rather than repaired when it is not a username: `@` and
      surrounding space are the only things forgiven, since those are how the
      thing is written rather than mistakes in it. Everything else — a space in
      the middle, a dot, an alphabet — would have to be *changed* to be stored,
      and storing a different name than the one somebody typed is worse than
      saying no to the one they did.

      Whether it is *taken* is not asked here. There is no answer this route
      could read that would still be true by the time it wrote; the unique
      index settles it, and the refusal is caught below.
    */
    if (body?.username !== undefined) {
      if (typeof body.username !== 'string') {
        return reply.code(400).send({ error: 'username must be text.' });
      }
      const problem = usernameProblem(body.username);
      if (problem) return reply.code(400).send({ error: problem });
      changes.username = body.username;
    }
    /*
      Where they can be reached elsewhere. Partial in the same two senses as
      the rest of this route: an absent `im` leaves all three alone, and an
      absent service inside it leaves that one alone — so a screen saving a
      Telegram username cannot blank a phone number it never sent.

      A handle that cannot be made sense of is refused rather than dropped,
      and the service is named. It is the one field here somebody can get
      *wrong* while meaning something — a name only has to be non-empty, but a
      number without its country code is a link to a stranger. Silently storing
      nothing would leave a person looking at an empty field they had just
      filled in.
    */
    if (body?.im !== undefined) {
      if (typeof body.im !== 'object' || body.im === null) {
        return reply.code(400).send({ error: 'im must be an object.' });
      }
      const given = body.im as Record<string, unknown>;
      const im: Record<string, string> = {};
      for (const service of IM_SERVICES) {
        const value = given[service];
        if (value === undefined) continue;
        if (typeof value !== 'string') {
          return reply
            .code(400)
            .send({ error: `${IM_SERVICE_NAMES[service]} must be text.` });
        }
        // Blank is how a handle is removed, so it is not a refusal.
        if (value.trim() !== '' && normaliseImHandle(service, value) === null) {
          return reply.code(400).send({
            error:
              service === 'telegram'
                ? 'That does not look like a Telegram username.'
                : `That does not look like a phone number ${IM_SERVICE_NAMES[service]} could reach — include the country code.`,
          });
        }
        im[service] = value;
      }
      if (Object.keys(im).length > 0) changes.im = im;
    }

    /*
      409 rather than 400, and the distinction is worth keeping: everything
      above is a refusal of what was *sent*, where this is a refusal about the
      state of the world, and what somebody typed may be perfectly good and
      simply somebody else's. The client draws the sentence either way; a
      client that ever wants to offer an alternative spelling needs to be able
      to tell the two apart.
    */
    let updated;
    try {
      updated = accounts.updateProfile(account.id, changes);
    } catch (e) {
      if (e instanceof UsernameTakenError) {
        return reply.code(409).send({ error: e.message });
      }
      throw e;
    }
    if (!updated) return reply.code(404).send({ error: 'No such account.' });
    // Contacts see the name, so a rename has to reach their home screens.
    // An outgoing request to an address with no account yet carries an empty
    // id by design, so those are dropped rather than notified.
    homeNotifier.notify([
      account.id,
      ...accounts
        .contactsFor(account.id)
        .map((entry) => entry.account.id)
        .filter(Boolean),
    ]);
    return accounts.profile(account.id, account.id);
  });

  /**
   * Writes the settings that belong to the account rather than to the phone.
   *
   * Five of them: the colour scheme, whether a tap only looks, whether the
   * channel screen has dropped its control cards, labs, and whether we may
   * write to this person about the application. **A further setting on that
   * screen was never here on
   * purpose** — keeping the hands-free link steady was about the headset
   * somebody is wearing, so it stayed on the device and never reached this
   * server. See core/settings.ts.
   *
   * Two others were here and are not: where the channel tabs are drawn, and
   * how loud the chimes are. Both are still sent by installed builds and both
   * are ignored rather than refused — see the two comments in the body.
   *
   * Two of the five are accepted under their old names as well as their
   * current ones, for as long as builds that know only the old names are
   * installed; settings-wire.ts is that whole arrangement.
   *
   * Partial like `POST /me`, and refused rather than coerced: a scheme this
   * server does not know is a client bug, and storing it would hand every
   * other device of that account a value it cannot render either.
   *
   * The answer is the whole of the settings, and every session this account
   * holds is told the same thing — including the one that asked, whose
   * optimistic copy is then restated by the server rather than trusted.
   */
  fastify.post('/me/settings', async (request, reply) => {
    const account = await requireAccount(request, reply);
    if (!account) return;

    const body = request.body as Record<string, unknown> | undefined;
    const changes: Partial<AccountSettings> = {};
    if (body?.appearance !== undefined) {
      if (!isColorSchemePreference(body.appearance)) {
        return reply
          .code(400)
          .send({ error: 'appearance must be light, dark or system.' });
      }
      changes.appearance = body.appearance;
    }
    // Refused rather than coerced, like the scheme: a tag this server does not
    // know is a client bug, and storing it would hand every other device of
    // this account a language none of them has a catalogue for. The app's own
    // `stringsFor` falls back to English for an unknown tag, which is right
    // for a device's own report and wrong for a stored choice — a preference
    // silently read as something else is one somebody cannot change back.
    if (body?.language !== undefined) {
      if (!isLanguagePreference(body.language)) {
        return reply
          .code(400)
          .send({ error: 'language must be en, es or system.' });
      }
      changes.language = body.language;
    }
    // **`tapToLook` and `tapToStepIn` are read and dropped**, rather than
    // refused. The setting went on 2026-09-21 and its behaviour became
    // unconditional, but a build already on a phone still draws the toggle
    // and still sends whichever name it knows. Answering that with a 400
    // would turn a setting somebody can no longer change into an error they
    // cannot get past; ignoring it leaves the toggle inert, and the next
    // settings push asserts the one answer there now is. See settings-wire.ts
    // and SHIMS.md.
    const hideControlCards = booleanUnderEitherName(
      body,
      'hideControlCards',
      'controlCards',
      true
    );
    if (hideControlCards === null) {
      return reply
        .code(400)
        .send({ error: 'hideControlCards must be true or false.' });
    }
    if (hideControlCards !== undefined) {
      changes.hideControlCards = hideControlCards;
    }
    // `tabsAtFoot` is not read here and is deliberately not refused either.
    // Builds 193 and earlier carry the setting and send it when somebody
    // touches that card, and this endpoint is partial — a field it does not
    // know is a field it leaves alone, which is the behaviour a removed
    // setting wants. The tabs are at the top for those builds too, since the
    // server stops sending the value they draw from. See
    // planning/decisions/2026-09-13-the-channel-tabs-stay-at-the-top.md.
    if (body?.labs !== undefined) {
      if (typeof body.labs !== 'boolean') {
        return reply.code(400).send({ error: 'labs must be true or false.' });
      }
      changes.labs = body.labs;
    }
    // The one field here that is a permission rather than a preference, and
    // the one place it may be withdrawn: this route is behind a session, so it
    // can show the answer in force and can therefore take it back. The other
    // writer is `/auth/verify`, which can only ever grant — see
    // `Accounts.establish`.
    if (body?.marketingEmail !== undefined) {
      if (typeof body.marketingEmail !== 'boolean') {
        return reply
          .code(400)
          .send({ error: 'marketingEmail must be true or false.' });
      }
      changes.marketingEmail = body.marketingEmail;
    }
    // `chimeAmplitude` is not read here and, like `tabsAtFoot` above, is
    // deliberately not refused either. Build 211 and earlier carry the
    // loudness ladder and send a peak when somebody taps a rung; this endpoint
    // is partial, so a field it does not know is one it leaves alone. Those
    // builds keep playing at whatever they last stored locally until they
    // update, which is the honest degradation — the chime has one loudness
    // again for everybody else. See
    // planning/decisions/2026-09-15-the-chime-has-one-loudness-again.md.

    const settings = accounts.updateSettings(account.id, changes, now());
    if (!settings) return reply.code(404).send({ error: 'No such account.' });
    // Nobody else is told. These change nothing anybody but this person can
    // see — no roster, no name, no availability — so unlike a rename there is
    // no audience beyond the account's own devices.
    settingsNotifier.notify(account.id, settings);
    return settingsForWire(settings);
  });

  /**
   * Records one of the introduction's four *try* rungs as done.
   *
   * **Called from where the thing is actually done**, which is a channel
   * screen two screens away from the ladder, and called every time rather
   * than the first: the client cannot know whether some other device got
   * there first, and asking would cost a round trip to save a write that
   * `markTried` already declines to make. So this is idempotent by
   * construction and says nothing about whether it was news — see
   * `Accounts.markTried`, which only pushes when it was.
   *
   * Takes a list rather than one id, because the first snapshot after an
   * upgrade hands up whatever the keychain had and that can be all four at
   * once. One request that half-succeeds is better than four that can fail
   * independently and leave the ladder disagreeing with itself.
   *
   * Answers with all four as they now stand, so the caller that asked need
   * not wait for the Home push to redraw. Every other device gets that push.
   */
  fastify.post('/me/tried', async (request, reply) => {
    const account = await requireAccount(request, reply);
    if (!account) return;

    const body = request.body as
      | { id?: unknown; ids?: unknown }
      | undefined;
    // One or many, the singular being what every call site but the migration
    // sends. Refused rather than ignored when it is neither: a name this
    // server does not know is a client bug, and silently succeeding would
    // leave a rung that never ticks and nothing saying why.
    const raw = Array.isArray(body?.ids)
      ? body.ids
      : body?.id !== undefined
        ? [body.id]
        : [];
    if (raw.length === 0 || !raw.every(isTriedId)) {
      return reply
        .code(400)
        .send({ error: `id must be one of ${TRIED_IDS.join(', ')}.` });
    }

    const at = now();
    let changed = false;
    for (const id of raw) {
      if (accounts.markTried(account.id, id, at)) changed = true;
    }
    // Only when it was news, this being called on every claim of the floor
    // for the rest of somebody's life. Their own devices and nobody else's:
    // what a person has tried is on no roster and changes nothing anybody
    // else can see.
    if (changed) homeNotifier.notify([account.id]);
    return accounts.tried(account.id);
  });

  /**
   * Counts one use of one of the four ways between Home and a channel.
   *
   * **Answers 204 and holds nothing about the caller.** The account is
   * required so that this is not a counter anybody on the internet can move,
   * is read once for the exclusion below, and is then discarded: what goes in
   * the table is the kind, the build, the client and the day. See `nav_counts` in the schema for why it is a count
   * rather than a row, and `core/navigation.ts` for the four names.
   *
   * **Refuses a name it does not know**, on `/me/tried`'s reasoning. A client
   * sending a fifth name is a bug, and a counter that filed it would make the
   * report unreadable while looking like it was working.
   *
   * **A `debug` account is answered and not counted.** The people who build
   * this app know where both gestures are, and they use the app more than
   * anybody — so their taps are the one kind certain to be unrepresentative of
   * the question, which is whether a gesture is *found*. With no account in
   * the table there is no way to subtract them afterwards: either the row is
   * never written or the bias is permanent. So it is dropped here, at the one
   * moment anybody knows whose tap it was. The answer is still 204, because
   * the client has nothing to do differently and a body saying *not counted*
   * would be a fact about the meter on the wire.
   *
   * The client sends this and does not wait for it — a navigation that stalled
   * on a metering call would be the instrumentation changing the thing it
   * measures — so nothing here is on anybody's path to anywhere.
   */
  fastify.post('/nav', async (request, reply) => {
    const account = await requireAccount(request, reply);
    if (!account) return;

    const body = request.body as { id?: unknown } | undefined;
    if (!isNavAction(body?.id)) {
      return reply
        .code(400)
        .send({ error: `id must be one of ${NAV_ACTIONS.join(', ')}.` });
    }

    // See above: counted for everybody but the accounts that built the thing.
    if (account.debug) return reply.code(204).send();

    channels.usage.recordNav({
      kind: body!.id as string,
      // Absent stays absent rather than becoming a guess; `recordNav` floors
      // it to 0, which the schema explains.
      build: claimedBuild(request.headers[BUILD_HEADER]),
      client: claimedClient(request.headers[CLIENT_HEADER]),
    });
    return reply.code(204).send();
  });

  /**
   * Puts the introduction back where it started, for a debug account only.
   *
   * The server half of *Forget the introduction* — the four stamps, which are
   * now the only part of that state this box holds. The rest of what that
   * button forgets is still on the phone. It is gated like the diagnostic
   * panel rather than open to everybody, for the same reason: it is a lever
   * with no screen behind it for ordinary accounts, and the one screen that
   * does offer it is already behind `debug`.
   */
  fastify.delete('/me/tried', async (request, reply) => {
    const account = await requireAccount(request, reply);
    if (!account) return;
    if (!accounts.byId(account.id)?.debug) {
      return reply.code(403).send({ error: 'Not available.' });
    }
    accounts.forgetTried(account.id);
    homeNotifier.notify([account.id]);
    return accounts.tried(account.id);
  });

  /**
   * Deletes your account, from inside the application.
   *
   * App Store Guideline 5.1.1(v) requires this of anything that lets people
   * create an account, and requires it *here* rather than by writing to a
   * support address — which is what the privacy policy used to promise.
   *
   * Three things happen, in this order, and the order is what makes it safe.
   * The people who need telling are read first, while there is still a row to
   * read them from. Then the channels: leaving each one the ordinary way, so a
   * held floor is released and a recording in progress is stopped, and deleting
   * the ones nobody else is in. Only then is the account itself emptied, by
   * which point nothing live points at it.
   *
   * No confirmation is asked for here. The app asks, naming what goes and what
   * stays, and a second gate on this side would only be one the app had to know
   * how to answer.
   */
  fastify.delete('/me', async (request, reply) => {
    const account = await requireAccount(request, reply);
    if (!account) return;

    const contacts = accounts.audienceFor(account.id);
    const left = channels.removeMember(account.id);
    devices.forgetAccount(account.id);
    // Named here beside the other three owners rather than folded into
    // `erase`, on the same reasoning that keeps devices out of it: this class
    // owns identity, that one owns addresses, the registry owns what the box
    // carried, and the route is what knows all of them.
    //
    // After `removeMember`, so the spans it closes on the way out are removed
    // too rather than written a moment later.
    channels.usage.forget(account.id);
    accounts.erase(account.id);
    // Contacts lose a contact and the rest lose somebody from a channel; both
    // are looking at a Home that now says something untrue.
    homeNotifier.notify([...new Set([...contacts, ...left])]);
    return reply.code(204).send();
  });

  /**
   * Somebody's profile.
   *
   * Readable by a contact, by anyone who shares a live channel with them, and
   * by yourself. Not by an arbitrary id: a profile is prose a person wrote for
   * people they have some relationship with, and leaving it open would also
   * turn account ids into a directory anyone could walk.
   */
  fastify.get('/profiles/:id', async (request, reply) => {
    const account = await requireAccount(request, reply);
    if (!account) return;
    const { id } = request.params as { id: string };

    const contact = accounts.areContacts(account.id, id);
    const allowed =
      id === account.id || contact || channels.shareAChannel(account.id, id);
    // Absent and not-allowed answer the same way, so this cannot be used to
    // discover which ids exist.
    const found = allowed ? accounts.profile(id, account.id) : null;
    if (!found) return reply.code(404).send({ error: 'No such profile.' });

    // The channels the two of you share, and where *they* have been in each.
    // Added here rather than in `accounts.profile` because it is a fact about
    // conversations rather than about the account, and the registry is what
    // holds them — the same seam that keeps `inApp` out of the query below.
    //
    // Given to everybody who may read the profile at all, unlike availability:
    // every entry is a channel the reader belongs to, so this says where
    // somebody has been in the reader's own rooms rather than where they are
    // in the world. Not special-cased for your own profile — asked about
    // yourself it answers with your own channels, truthfully and uselessly,
    // and the screen leaves the section out the same way it leaves out the
    // Contact card. A rule stated in one place beats a rule stated in two.
    const profile = {
      ...found,
      sharedChannels: channels.sharedChannelsFor(account.id, id),
    };

    // Where somebody is, for the people who could already see it. This is the
    // line Home's contact rows used to carry, and it moved here rather than
    // being deleted — but a profile has a wider audience than a contact list
    // ever did, so the audience is narrowed back to match. Somebody reading
    // this because an acquaintance brought them into a channel gets a name and
    // nothing about when that person was last about. The fields are simply
    // absent for them, which is the same shape an older server sends and gets
    // the same treatment from the client: no line at all, rather than an empty
    // one.
    //
    // Your own profile is not a contact of yours and so is not exempted here.
    // Nothing is lost: you are the one person whose whereabouts you know.
    //
    // The address is the exception, and it is not the same field it is
    // everywhere else on this route. Sent to a contact, `email` is a
    // disclosure — one person's standing decision about one reader, which is
    // why `emailShownTo` is asked rather than assumed. Sent to you about you
    // it is a reminder of what you sign in with, and there is no decision
    // involved: the question "has its owner aimed it at this reader" does not
    // arise when the reader is the owner. So it is read straight off the row
    // rather than through `emailShownTo`, which would answer null — you are
    // not showing your address to yourself and never will be.
    //
    // `myEmailShown` stays absent, because there is no button: showing your
    // address is per contact and is decided on that contact's screen.
    if (id === account.id) return { ...profile, email: account.identifier };
    if (!contact) return profile;
    // `inApp` is composed at this point rather than in the query, for the
    // reason `homeFor` gives: whether somebody holds a socket is a fact about
    // this process and not a column.
    //
    // The address is the odd one out among these and is meant to be. Everything
    // else here is released by the reader's standing — being a contact is the
    // whole of what earns it. An address is released by an act of the person it
    // belongs to, aimed at one reader, so `emailShownTo` is asked rather than
    // told, and being a contact only decides whether the question arises.
    // `myEmailShown` is the same question turned round: the state of the
    // reader's own button, which lives on this screen because the choice is per
    // person and there is nowhere else it would be true of.
    const email = accounts.emailShownTo(id, account.id);
    return {
      ...profile,
      inApp: reachability.inApp(id),
      lastSeenAt: accounts.lastSeenAt(id),
      ...(email ? { email } : {}),
      myEmailShown: accounts.showsEmail(account.id, id),
    };
  });

  /**
   * Shows your sign-in address to one contact, or stops showing it.
   *
   * Under `/contacts` rather than `/profiles`, because the path has to read as
   * what it does: `/profiles/:id` is somebody else's screen, and this writes a
   * decision of *yours* about the person named. The verb carries the rest —
   * POST gives, DELETE takes back.
   *
   * **Contacts only, and the server is where that is settled.** A profile is
   * also readable by anybody sharing a live channel, which is a wider audience
   * than an address should reach: meeting somebody in a room an acquaintance
   * opened is grounds to ask them to be a contact, and this is a step past
   * that. The app offers the button on the same test, so the two agree; this is
   * the one that is load-bearing.
   *
   * A 404 for anybody who is not, matching every other refusal on this pair of
   * screens: whether an id exists is not a thing to be learnt by being told
   * "not a contact" about some of them.
   *
   * Nothing is pushed to the other end. A profile is fetched when somebody
   * opens one — that is the argument the protocol makes for keeping a profile
   * off every roster — so the address appears on their screen the next time they
   * look, which is the only moment it is of any use to them.
   */
  async function setEmailShown(
    request: FastifyRequest,
    reply: Parameters<typeof requireAccount>[1] & {
      code: (n: number) => { send: (body: unknown) => unknown };
    },
    shown: boolean
  ) {
    const account = await requireAccount(request, reply);
    if (!account) return;
    const { id } = request.params as { id: string };
    if (!accounts.areContacts(account.id, id)) {
      return reply.code(404).send({ error: 'No such contact.' });
    }
    if (shown) accounts.showEmail(account.id, id, now());
    else accounts.hideEmail(account.id, id);
    return { ok: true, shown };
  }

  fastify.post('/contacts/:id/email', (request, reply) =>
    setEmailShown(request, reply, true)
  );
  fastify.delete('/contacts/:id/email', (request, reply) =>
    setEmailShown(request, reply, false)
  );

  /**
   * The invitation standings: who has brought the most people here.
   *
   * **Refused to anybody whose `leaderboard` column is not set**, which is
   * nobody by default and is granted by hand with `bin/db --write`. It is the
   * only view in this application that lists people who have not agreed to be
   * listed to you — everywhere else, a name reaches you because you and they
   * both said yes. `/privacy` and `/support` promise there is no directory
   * here, and an ungated version of this would be one.
   *
   * A 404 rather than a 403 for somebody without the flag, matching the
   * profile route: the answer to "may I see this" and "is there anything here"
   * are deliberately the same answer.
   *
   * Not on the Home snapshot, though `hello` carries the flag: that snapshot
   * is pushed to every client on every change, and this is read by one screen
   * when it opens. The same argument the protocol already makes for keeping
   * the profile fields off `PublicAccount`.
   */
  fastify.get('/leaderboard', async (request, reply) => {
    const account = await requireAccount(request, reply);
    if (!account) return;
    if (account.leaderboard !== 1) {
      return reply.code(404).send({ error: 'Not found.' });
    }
    return { entries: accounts.leaderboard() };
  });

  fastify.get('/home', async (request, reply) => {
    const account = await requireAccount(request, reply);
    if (!account) return;
    return homeFor(account.id);
  });

  // --- Channels -----------------------------------------------------------

  fastify.post('/channels', async (request, reply) => {
    const account = await requireAccount(request, reply);
    if (!account) return;
    const body = request.body as
      | { contactIds?: string[]; contactId?: string }
      | undefined;
    // The singular form is what pre-multi-user builds send; costs one line.
    // Absent means nobody, which is a channel of one — the ordinary way to
    // start one since builds stopped asking who first. An old client never
    // sends that, so nothing that used to be refused has changed meaning.
    const contactIds =
      body?.contactIds ?? (body?.contactId ? [body.contactId] : []);
    if (!Array.isArray(contactIds)) {
      return reply.code(400).send({ error: 'contactIds must be an array' });
    }
    if (contactIds.some((id) => typeof id !== 'string')) {
      return reply.code(400).send({ error: 'contactIds must be account ids' });
    }

    const result = channels.create(account.id, contactIds);
    if (!result.ok) return reply.code(400).send({ error: result.error });
    return { channelId: result.channel.id };
  });

  /**
   * Asks one absent participant to come to the channel.
   *
   * Over HTTP rather than the websocket, and it is worth saying why, since
   * every other thing done from inside a channel is an action on the socket.
   * Those are moves in the channel: they go through the reducer, change the
   * state, and are answered by the snapshot everybody receives. A ping changes
   * nothing — no participant list, no floor, no recording — so putting it
   * through `dispatch` would mean inventing an action the reducer must ignore.
   *
   * It also wants a reply addressed to the sender alone. Whether a ping was
   * accepted, refused as too soon, or refused because they have walked in since
   * the screen was drawn is the sender's business and nobody else's, and the
   * socket only knows how to tell everybody the same thing.
   */
  fastify.post('/channels/:id/ping', async (request, reply) => {
    const account = await requireAccount(request, reply);
    if (!account) return;
    const { id } = request.params as { id: string };
    const body = request.body as
      | { targetId?: unknown; text?: unknown }
      | undefined;

    if (typeof body?.targetId !== 'string' || !body.targetId) {
      return reply.code(400).send({ error: 'targetId is required' });
    }
    // Absent and null are the same thing — no words — while a non-string is a
    // client sending something it has not thought about.
    if (body.text !== undefined && body.text !== null && typeof body.text !== 'string') {
      return reply.code(400).send({ error: 'text must be a string' });
    }

    const result = channels.ping(
      id,
      account.id,
      body.targetId,
      typeof body.text === 'string' ? body.text : null
    );
    if (!result.ok) {
      return reply.code(statusFor(result.code)).send({ error: result.error });
    }
    return { ok: true };
  });

  /**
   * How loudly this channel may interrupt whoever is asking.
   *
   * Over HTTP and not the socket, for the reason `ping` is: it changes nothing
   * about the channel. No reducer knows about it, no other member is affected,
   * and the only person owed an answer is the one who asked — a snapshot
   * broadcast would be telling four people about a fifth's preference.
   *
   * **A participant may set it, and nobody else.** Not because a stranger's
   * preference about a channel they cannot see would do any harm, but because
   * accepting it would write a row keyed on a channel this person has no
   * relationship with, and a table that accumulates those is one that answers
   * "which channels does this account care about" wrongly forever.
   *
   * Membership is checked rather than presence: this is a setting about a
   * channel, and being in the room is not a prerequisite for deciding how
   * loudly it may shout at you. Somebody turns this down precisely when they
   * are *not* there.
   */
  fastify.put('/channels/:id/notifications', async (request, reply) => {
    const account = await requireAccount(request, reply);
    if (!account) return;
    const { id } = request.params as { id: string };
    const body = request.body as { level?: unknown } | undefined;

    if (
      typeof body?.level !== 'string' ||
      !NOTIFICATION_LEVELS.includes(body.level as NotificationLevel)
    ) {
      return reply
        .code(400)
        .send({ error: `level must be one of ${NOTIFICATION_LEVELS.join(', ')}` });
    }

    const channel = channels.viewableBy(id, account.id);
    if (!channel) {
      return reply.code(404).send({ error: 'No such channel.' });
    }
    if (!channel.participants.includes(account.id)) {
      return reply.code(403).send({ error: 'Not your channel.' });
    }

    preferences.set(account.id, id, body.level as NotificationLevel, now());
    // Echoed rather than assumed. The stored value and the requested one can
    // differ — the default is stored as absence — and a client that reads its
    // own state back from the reply cannot drift from the server by guessing
    // what the write did.
    return { level: preferences.levelFor(account.id, id) };
  });

  // --- Guest links ----------------------------------------------------------

  /**
   * Where this server is reachable, as the request that arrived says.
   *
   * Derived rather than configured, and that is the lesson from `INSTALL_URL`
   * written down: a second setting naming an address this server already knows
   * is the one nobody remembers to set, and the failure is silent — every link
   * minted for a day pointing somewhere wrong. The request came in over the
   * origin whoever is asking can reach, and behind Caddy the forwarded headers
   * say which scheme that was.
   *
   * `PUBLIC_URL` overrides it, for the case this cannot answer: a link minted
   * against a hostname that is not the one guests should be sent to.
   */
  function origin(request: FastifyRequest): string {
    if (process.env.PUBLIC_URL) return process.env.PUBLIC_URL.replace(/\/$/, '');
    const forwarded = request.headers['x-forwarded-proto'];
    const scheme =
      (Array.isArray(forwarded) ? forwarded[0] : forwarded)?.split(',')[0] ??
      request.protocol;
    return `${scheme}://${request.headers.host}`;
  }

  /**
   * Whether this box is serving a web app, as of the last invite page drawn.
   *
   * `availableTrains()` probes the filesystem and is therefore async, while
   * the page builder is a plain function of its inputs. The two routes above
   * refresh this immediately before rendering, so it is never older than the
   * request being answered; it is a variable rather than a parameter only
   * because both routes want the same one.
   */
  let availableTrainsCount = 0;

  const guestLinkUrl = (request: FastifyRequest, token: string): string =>
    `${origin(request)}/g/${token}`;

  /**
   * An invite link: a username, and the name to greet its reader with.
   *
   * Beside the guest link on purpose: they are the two addresses this server
   * mints for somebody to hand to a person, and they share `origin`. What they
   * do not share is what they open — a guest link opens one room to anybody
   * holding it until the room empties, and this opens one contact, standing.
   *
   * **No pin since 2026-09-25, and it is the same address every time.** It
   * used to be `/i/<username>/<pin>`, six digits minted per press and spent by
   * the first taker. What that bought was a seat; what it cost was that the
   * link could not simply be *somebody's link*. See
   * `decisions/2026-09-25-...`.
   *
   * **`name` is a convenience and is not evidence.** The page draws it so that
   * a reader is greeted by a person rather than by a handle, and it is put in
   * the address rather than looked up so that this server never answers
   * "who is @annak" for anybody who asks — which would be the directory
   * `core/username.ts` says there is not. Anybody may therefore write any name
   * into any link. What that buys them is one line of prose: the contact the
   * link makes is the account named by the *username*, and the app draws that
   * account's real display name from the moment it exists. Escaped and capped
   * where it is drawn, not here.
   */
  const inviteLinkUrl = (
    request: FastifyRequest,
    username: string,
    displayName?: string | null
  ): string => {
    const base = `${origin(request)}/i/${username}`;
    return displayName
      ? `${base}?name=${encodeURIComponent(displayName)}`
      : base;
  };

  /**
   * Mints a link to one channel, for a member to hand to anybody.
   *
   * The link is returned in full and stored in the clear, so this endpoint can
   * be asked again for the same one — see the schema, where the trade is
   * argued. What it buys is that "send it to somebody else too" is not a
   * second link to remember to revoke.
   */
  fastify.post('/channels/:id/guest-links', async (request, reply) => {
    const account = await requireAccount(request, reply);
    if (!account) return;
    const { id } = request.params as { id: string };
    const result = channels.mintGuestLink(id, account.id);
    if (!result.ok) {
      return reply.code(statusFor(result.code)).send({ error: result.error });
    }
    return {
      token: result.link.token,
      url: guestLinkUrl(request, result.link.token),
      createdAt: result.link.created_at,
    };
  });

  /** Every link this channel has, live or revoked, for channel settings. */
  fastify.get('/channels/:id/guest-links', async (request, reply) => {
    const account = await requireAccount(request, reply);
    if (!account) return;
    const { id } = request.params as { id: string };
    return {
      links: channels.guestLinksFor(id, account.id).map((link) => ({
        token: link.token,
        url: guestLinkUrl(request, link.token),
        createdAt: link.created_at,
        createdBy: link.created_by,
        revokedAt: link.revoked_at,
        // Null when the emptying rule revoked it rather than a person, which
        // is what stops settings attributing a rule to whoever left last.
        revokedBy: link.revoked_by,
      })),
    };
  });

  /**
   * Shuts one link. Anybody in the room may, not only whoever minted it: a
   * door onto a conversation is everybody's business. Which is also why it is
   * not any member's from anywhere — `hasTheRoom` answers 409 to somebody
   * outside an occupied channel, the conversation being the thing the door
   * opens onto.
   */
  fastify.delete('/channels/:id/guest-links/:token', async (request, reply) => {
    const account = await requireAccount(request, reply);
    if (!account) return;
    const { id, token } = request.params as { id: string; token: string };
    const result = channels.revokeGuestLink(id, account.id, token);
    if (!result.ok) {
      return reply.code(statusFor(result.code)).send({ error: result.error });
    }
    return reply.code(204).send();
  });

  /**
   * A join credential for the channel's audio room. Minted per participant and
   * short-lived, and refused to anyone who is not in the channel — the room
   * name is the channel id, so this is the only thing standing between knowing
   * an id and listening in.
   */
  fastify.post('/channels/:id/media-token', async (request, reply) => {
    const account = await requireAccount(request, reply);
    if (!account) return;
    const { id } = request.params as { id: string };

    const result = await channels.mediaToken(id, account.id);
    if (result.ok) {
      return { token: result.token, url: options.mediaUrl };
    }
    /*
      **A seat is the other standing this route serves**, since 2026-09-22 and
      the app holding seats of its own. The membership is asked first and the
      seat only when it refuses, which is the precedence every seat lookup
      makes: somebody who is both is here as a member, and their token must
      carry a member's identity rather than a guest id.

      The refusal that comes back is the seat's where there is no membership
      at all, because that is the one the caller is actually in a position to
      act on — *you have no seat here* names the standing they were asking
      about. A channel that does not exist refuses the same way either way.
    */
    const seat = await channels.seatMediaToken(id, account.id);
    if (!seat.ok) {
      return reply.code(statusFor(seat.code)).send({ error: seat.error });
    }
    return { token: seat.token, url: options.mediaUrl };
  });

  /**
   * Uploads a file for both parties to listen to.
   *
   * Over HTTP rather than the websocket because it is bytes, and because the
   * client cannot describe the result: only the server knows where the file
   * landed and — having asked ffprobe rather than the uploader — how long it
   * actually is. The channel is told about the track once both are known.
   */
  fastify.post(
    '/channels/:id/track',
    { bodyLimit: MAX_TRACK_BYTES },
    async (request, reply) => {
      const account = await requireAccount(request, reply);
      if (!account) return;
      const { id } = request.params as { id: string };
      const { name } = request.query as { name?: string };

      const body = request.body;
      if (!Buffer.isBuffer(body) || body.length === 0) {
        return reply.code(400).send({ error: 'No audio was uploaded.' });
      }

      // One directory per track under the server's track root, so removing it
      // when the track is replaced or the channel ends takes the file with it
      // and nothing else. The registry mints it because the registry is what
      // sweeps and restores the root — see `newTrackDir`.
      const dir = await channels.newTrackDir();
      const safe = basename(name ?? '').replace(/[^\w\-. ]/g, '');
      const file = join(dir, `track${extname(safe) || ''}`);

      try {
        await writeFile(file, body);
        const durationMs = await probeDurationMs(file);
        const title = safe.replace(/\.[^.]+$/, '').trim() || 'Shared audio';

        const result = await channels.loadTrack(id, account.id, {
          file,
          dir,
          title,
          durationMs,
        });
        if (!result.ok) {
          await rm(dir, { recursive: true, force: true });
          return reply
            .code(statusFor(result.code))
            .send({ error: result.error });
        }
        return { track: result.channel.playback.track };
      } catch (error) {
        await rm(dir, { recursive: true, force: true });
        request.log.error({ err: error, channel: id }, 'track upload failed');
        // A file that cannot be decoded is the user's to fix, and saying so
        // lets them pick another; anything else is ours and says nothing.
        const unreadable = error instanceof UnreadableAudioError;
        return reply.code(unreadable ? 415 : 500).send({
          error: unreadable
            ? 'That file could not be played as audio.'
            : 'The track could not be prepared.',
        });
      }
    }
  );

  /**
   * Hands a member a copy of what the channel is listening to.
   *
   * The counterpart of the upload directly above, and what makes a track
   * shareable at all: somebody put this on for everybody, so everybody it
   * played to may take it away. Membership alone governs it — the rule, and
   * why it is not the rule that governs *changing* the track, is in
   * `trackFileFor`.
   *
   * The bytes are served as they were uploaded, which is why the type is read
   * off the extension rather than fixed the way `RECORDING_CONTENT_TYPE` is:
   * this server produced the mix and knows what it is, and a track is whatever
   * file somebody picked on their phone. An unrecognised extension is served
   * as `application/octet-stream`, which saves correctly everywhere and plays
   * nowhere — the honest answer when we do not know what it is.
   */
  fastify.get('/channels/:id/track', async (request, reply) => {
    const account = await requireAccount(request, reply);
    if (!account) return;
    const { id } = request.params as { id: string };

    const track = channels.trackFileFor(id, account.id);
    if (!track) return reply.code(404).send({ error: 'Nothing is loaded.' });

    let data: Buffer;
    try {
      data = await readFile(track.file);
    } catch (error) {
      // The file has gone from under a track the state still names — a channel
      // whose track directory was swept, say. Not the caller's doing and not
      // something they can fix, but 404 is still the true answer: there is
      // nothing here to hand over.
      request.log.error({ err: error, channel: id }, 'track read failed');
      return reply.code(404).send({ error: 'Nothing is loaded.' });
    }

    channels.usage.recordBytes({
      kind: 'track-share',
      bytes: data.length,
      accountId: account.id,
    });

    const ext = extname(track.file).toLowerCase();
    return reply
      .header('content-type', TRACK_CONTENT_TYPES[ext] ?? 'application/octet-stream')
      .header('content-disposition', `attachment; filename="track${ext}"`)
      .send(data);
  });

  /**
   * Plays a recording into the channel it was made in.
   *
   * Deliberately the *same* mechanism as a shared track rather than a second
   * one: the mix is written to disk and loaded through `loadTrack`, so it
   * arrives as the channel's track and every control that already exists —
   * play, pause, seek, volume, and the floor-holder's exclusive say over all
   * of them — governs it without knowing where it came from.
   *
   * The channel is the recording's own, never one named by the caller. A
   * recording can only ever be played back into the room it was made in, which
   * is what stops one channel's conversation being piped into another.
   */
  fastify.post('/recordings/:id/play', async (request, reply) => {
    const account = await requireAccount(request, reply);
    if (!account) return;
    const { id } = request.params as { id: string };

    // Same rule as the export, read through the same function so that what may
    // be played and what may be downloaded cannot come apart.
    const row = channels
      .recordingsFor(account.id)
      .find((candidate) => candidate.id === id);
    if (!row) return reply.code(404).send({ error: 'No such recording.' });
    if (!options.store) {
      return reply
        .code(503)
        .send({ error: 'Recording storage is not configured.' });
    }

    // The same convention an uploaded track follows, because this becomes
    // one: a directory of its own under the track root, minted by the
    // registry that sweeps and restores it.
    const dir = await channels.newTrackDir();
    const file = join(dir, 'track.ogg');
    try {
      // Normally already mixed, and then this is one fetch. See
      // `recordingAudio` for what happens when it is not.
      const data = await channels.recordingAudio(id);
      channels.usage.recordBytes({
        kind: 'playback-fetch',
        bytes: data.length,
        accountId: account.id,
        recordingId: id,
      });
      await writeFile(file, data);

      // Probed rather than taken from `duration_ms`: that is what was
      // captured, and this is what the mix came out as. The scrubber runs on
      // this number, so it has to be the file's own.
      const durationMs = await probeDurationMs(file);
      const result = await channels.loadTrack(row.channel_id, account.id, {
        file,
        dir,
        title: toRecordingView(row, account.id).name,
        durationMs,
        // So a screen can tell that what is playing *is* this recording — the
        // track's own id is minted per load and says nothing about it. A
        // transcript line's offer to jump depends on the answer.
        recordingId: id,
      });
      if (!result.ok) {
        await rm(dir, { recursive: true, force: true });
        return reply.code(statusFor(result.code)).send({ error: result.error });
      }
      return { track: result.channel.playback.track };
    } catch (error) {
      await rm(dir, { recursive: true, force: true });
      request.log.error({ err: error, recording: id }, 'recording playback failed');
      return reply
        .code(500)
        .send({ error: 'That recording could not be prepared for playback.' });
    }
  });

  /**
   * Marks one recording for deletion. The audio and the row go in the sweep a
   * week later, exactly as a deleted channel's do — this only sets the mark,
   * which is what makes the week a recovery window rather than a formality.
   */
  fastify.delete('/recordings/:id', async (request, reply) => {
    const account = await requireAccount(request, reply);
    if (!account) return;
    const { id } = request.params as { id: string };

    const result = channels.deleteRecording(id, account.id);
    // 404 rather than `statusFor`, which answers 400 for not_found: the other
    // two recording routes say 404, and absent, deleted and not-yours are one
    // answer here for the reason spelled out under the export — that a
    // recording exists is itself something only its channel's members learn.
    //
    // A busy channel is the exception and gets its own answer. Nothing is
    // being concealed there — the caller is a member who can already see the
    // recording and can see who is in the channel — and 404 would tell them
    // their recording had vanished, which is the one thing it has not done.
    if (!result.ok) {
      return reply
        .code(result.code === 'conflict' ? 409 : 404)
        .send({ error: result.error });
    }
    return { ok: true };
  });

  /**
   * Renames one recording, for everybody in its channel — the name is shared,
   * so a rename is too. See `renameRecording` for why an empty one is refused
   * rather than clearing the name.
   */
  fastify.patch('/recordings/:id', async (request, reply) => {
    const account = await requireAccount(request, reply);
    if (!account) return;
    const { id } = request.params as { id: string };
    const body = (request.body ?? {}) as { name?: unknown };
    if (typeof body.name !== 'string') {
      return reply.code(400).send({ error: 'A name is required.' });
    }

    const result = channels.renameRecording(id, account.id, body.name);
    // Not found stays 404 for the reason the other three recording routes give
    // — that a recording exists is something only its channel's members
    // learn — but a name this server will not accept is an ordinary 400, and
    // says so, since the caller already knows the recording is there.
    if (!result.ok) {
      return reply
        .code(result.code === 'not_found' ? 404 : statusFor(result.code))
        .send({ error: result.error });
    }
    return { ok: true };
  });

  /**
   * The finished recording, with the floor applied.
   *
   * Stored rather than encoded per request, since 2026-08-16: the mix is made
   * when the run ends, so this is a fetch of bytes that already exist and a
   * recording exports the instant its card appears. The stems remain the
   * durable artefact and the mix is still derived from them — see
   * `recordingAudio`, which remakes it whenever it is missing.
   *
   * **The cost is that a change to how the floor is applied no longer reaches
   * a recording already mixed.** It used to, because there was nothing stored
   * to be stale. Anyone changing the gating in `buildFilterGraph` has to
   * invalidate what exists — `UPDATE recordings SET mix_state = 'unmixed'`,
   * which makes the next request re-encode and overwrite — or the fix applies
   * to conversations recorded after the deploy and to no others.
   */
  fastify.get('/recordings/:id/export', async (request, reply) => {
    const account = await requireAccount(request, reply);
    if (!account) return;
    const { id } = request.params as { id: string };

    const row = db
      .prepare('SELECT * FROM recordings WHERE id = ?')
      .get(id) as { channel_id: string; deleted_at: number | null } | undefined;

    // Absent, deleted and not-yours are one answer: knowing a recording exists
    // is itself something only the channel's members should learn.
    //
    // Membership of the *channel*, which is the rule everywhere now — not of
    // the run, as it was until recordings came to belong to the place they
    // were made in. A member who joined last week may export a conversation
    // from last year, and somebody who left may not export the one they were
    // in. Both follow from the same sentence and both are meant.
    const mine = row
      ? channels
          .recordingsFor(account.id)
          .some((candidate) => candidate.id === id)
      : false;
    if (!row || row.deleted_at !== null || !mine) {
      return reply.code(404).send({ error: 'No such recording.' });
    }
    if (!options.store) {
      return reply.code(503).send({ error: 'Recording storage is not configured.' });
    }

    try {
      const data = await channels.recordingAudio(id);
      channels.usage.recordBytes({
        kind: 'export',
        bytes: data.length,
        accountId: account.id,
        recordingId: id,
      });
      return reply
        .header('content-type', RECORDING_CONTENT_TYPE)
        .header('content-disposition', `attachment; filename="${id}.ogg"`)
        .send(data);
    } catch (error) {
      request.log.error({ err: error, recording: id }, 'export failed');
      return reply.code(500).send({ error: 'Could not prepare the recording.' });
    }
  });

  /**
   * Asks for one recording to be transcribed.
   *
   * **The `manageable` rule, not the export rule.** Exporting is a private
   * read of your own conversation; this sends everybody's audio to a third
   * party and puts a shared artefact on everybody's screen, which makes it a
   * change to the channel like renaming or deleting one. So it goes through
   * `mayManageRecording`, and `requestedBy` is carried on the wire so it is
   * never anonymous.
   *
   * Returns immediately. Nothing here holds the request open across a render,
   * an upload and however long the provider takes — the state arrives on the
   * channel snapshot the way a finished mix does.
   */
  fastify.post('/recordings/:id/transcript', async (request, reply) => {
    const account = await requireAccount(request, reply);
    if (!account) return;
    const { id } = request.params as { id: string };

    if (!transcripts.available()) {
      return reply
        .code(503)
        .send({ error: 'Transcription is not configured.' });
    }
    // Before the gate and before the reach test, because it is the broadest of
    // the three: a transcript is behind Labs, and somebody who has not turned
    // it on is not being told they have spent their free use or that the
    // recording is somebody else's. The app withholds the button, so reaching
    // here means a client that was built before this or has been asked
    // directly — and this is the refusal that actually stops the spending.
    // See `labs` in core/settings.ts.
    if (!accounts.settings(account.id).labs) {
      return reply
        .code(403)
        .send({ error: 'Transcripts are a Labs feature. Turn Labs on in Settings.' });
    }
    // Before the reach test, on purpose. A member who may see the recording
    // and may not spend on it should be told that, rather than told the
    // recording does not exist.
    const gate = transcribeGate(account.id, id);
    if (!gate.ok) return reply.code(403).send({ error: gate.message });
    const allowed = channels.mayManageRecording(id, account.id);
    if (!allowed.ok) {
      return reply
        .code(allowed.code === 'conflict' ? 409 : 404)
        .send({ error: allowed.error });
    }

    try {
      await transcripts.request(id, account.id);
      // After the request rather than before it: everything `request` refuses
      // — no speech, already transcribed, deleted underneath — spends nothing
      // and must not spend the free use either. A no-op for an unlimited
      // account, and for one whose credit is already gone, which cannot reach
      // here anyway.
      accounts.spendFreeTranscript(account.id, id, now());
    } catch (error) {
      // Everything this throws is an answer the caller should relay rather
      // than retry: already transcribed, nothing to transcribe, deleted
      // underneath. 409 rather than 500 — the request was understood and
      // refused, which is a different thing from this server breaking.
      return reply.code(409).send({
        error: error instanceof Error ? error.message : 'Could not transcribe.',
      });
    }
    return { ok: true };
  });

  /**
   * One recording's transcript: where it stands, and the text if there is any.
   *
   * A read, so the reach test is the export's rather than the manage rule —
   * anybody who may hear the conversation may read it. The lines come back in
   * the order they were said across every speaker, which is the conversation;
   * two people talking over each other are two lines at overlapping times,
   * which per-stem jobs can represent honestly and a transcript of a mix could
   * not represent at all.
   */
  fastify.get('/recordings/:id/transcript', async (request, reply) => {
    const found = await readableTranscript(request, reply);
    if (!found) return;

    const lines = transcripts.linesFor(found.row.id);
    const voices = transcripts.voicesFor(found.row.id);
    const nameOf = (identity: string) =>
      nameFrom(found.row, identity)?.displayName ?? null;

    return {
      ...found.view,
      requestedBy: nameFrom(found.row, found.view.requestedBy),
      // Named and filtered here rather than on the client, so that an export,
      // a search result and this screen cannot disagree about who said what.
      lines: readable(lines, nameOf, voices),
      // The roster travels with the transcript rather than behind a second
      // request: it is a handful of entries, the screen that edits it opens
      // from this one, and it has to list the removed voices that `lines` no
      // longer contains.
      voices: voiceRoster(lines, nameOf, voices),
    };
  });

  /** The transcript as a file: prose to read, subtitles to play, or the data. */
  fastify.get('/recordings/:id/transcript/export', async (request, reply) => {
    const found = await readableTranscript(request, reply);
    if (!found) return;

    const asked = (request.query as { format?: string } | undefined)?.format;
    if (asked && asked !== 'txt' && asked !== 'vtt' && asked !== 'json') {
      return reply.code(400).send({ error: 'Unknown format.' });
    }
    const format = (asked ?? 'txt') as 'txt' | 'vtt' | 'json';

    const names: Record<string, string> = found.row.participant_names
      ? JSON.parse(found.row.participant_names)
      : {};
    const file = formatTranscript(
      transcripts.linesFor(found.row.id),
      names,
      format,
      transcripts.voicesFor(found.row.id)
    );
    return reply
      .header('content-type', `${file.contentType}; charset=utf-8`)
      .header(
        'content-disposition',
        `attachment; filename="${found.row.id}.${file.extension}"`
      )
      .send(file.body);
  });

  /**
   * Says who the voices in a transcript actually were.
   *
   * The provider labels each stem's voices independently and is wrong about
   * them often, so the letters it produces are a starting point rather than an
   * answer. This is where somebody replaces them: rename a voice, give two of
   * them the same name to collapse a run the provider split, or drop one that
   * was never a person.
   *
   * **It is a view and nothing else.** No line is edited and no text is
   * rewritten, so this can be sent again with different answers, or with `{}`
   * to put the transcript back exactly as it arrived. Nothing is re-transcribed
   * and nothing is spent — which is why the whole declaration is replaced on
   * every call rather than patched: the screen holds all of it, and a full
   * replacement is what makes clearing one voice expressible without a second
   * route that deletes.
   *
   * The same two guards as deleting, in the same order and for the same
   * reasons: `mayRemoveTranscript` is about who may shape a thing only they
   * can make again, and `mayManageRecording` is about reach. Reading and
   * searching are never limited, so everybody in the channel sees the
   * result.
   */
  fastify.put('/recordings/:id/transcript/voices', async (request, reply) => {
    const account = await requireAccount(request, reply);
    if (!account) return;
    const { id } = request.params as { id: string };

    if (!mayRemoveTranscript(account.id, id)) {
      return reply.code(403).send({
        error:
          'Only whoever asked for this transcript may change or remove it.',
      });
    }
    const allowed = channels.mayManageRecording(id, account.id);
    if (!allowed.ok) {
      return reply
        .code(allowed.code === 'conflict' ? 409 : 404)
        .send({ error: allowed.error });
    }
    if (!transcripts.viewFor(id)) {
      return reply.code(404).send({ error: 'No such transcript.' });
    }

    const body = request.body as { voices?: unknown } | undefined;
    const sent = body?.voices;
    if (sent === undefined || sent === null || typeof sent !== 'object') {
      return reply.code(400).send({ error: 'voices must be an object.' });
    }

    const voices: VoiceDeclarations = {};
    for (const [key, value] of Object.entries(sent as Record<string, unknown>)) {
      if (!value || typeof value !== 'object') {
        return reply.code(400).send({ error: 'Each voice must be an object.' });
      }
      const { name, removed } = value as { name?: unknown; removed?: unknown };
      if (name !== undefined && typeof name !== 'string') {
        return reply.code(400).send({ error: 'A voice name must be text.' });
      }
      if (name !== undefined && name.trim().length > MAX_DISPLAY_NAME_LENGTH) {
        return reply.code(400).send({ error: 'That name is too long.' });
      }
      voices[key] = {
        ...(typeof name === 'string' && name.trim() ? { name: name.trim() } : {}),
        ...(removed ? { removed: true } : {}),
      };
    }

    transcripts.declareVoices(id, voices, account.id);
    // Everybody in the channel is reading the same transcript, so the change
    // is theirs too — the same reason a transcript landing announces one.
    const row = db
      .prepare('SELECT channel_id FROM recordings WHERE id = ?')
      .get(id) as unknown as { channel_id: string } | undefined;
    if (row) channels.announce(row.channel_id);
    return { ok: true };
  });

  /**
   * Removes a transcript, leaving the recording alone.
   *
   * Not in the original design, and worth having: a transcript is the only
   * artefact here that could not otherwise be removed without deleting the
   * conversation it came from — and it is the one somebody is most likely to
   * want gone, being searchable text of what was said rather than audio
   * nobody will scrub through. The same guard as asking for one, since
   * unmaking a shared thing is the same size of act as making it.
   *
   * It does not refund anything. Asking again costs again, which is the honest
   * arrangement and is why the app should say so before it deletes.
   */
  fastify.delete('/recordings/:id/transcript', async (request, reply) => {
    const account = await requireAccount(request, reply);
    if (!account) return;
    const { id } = request.params as { id: string };

    // Whoever asked for this one may unmake it, and so may an unlimited
    // account. Deleting spends nothing and destroys something that costs what
    // it cost to make again — and it does not return the free use, so this is
    // not a way round the limit.
    if (!mayRemoveTranscript(account.id, id)) {
      return reply.code(403).send({
        error:
          'Only whoever asked for this transcript may change or remove it.',
      });
    }
    const allowed = channels.mayManageRecording(id, account.id);
    if (!allowed.ok) {
      return reply
        .code(allowed.code === 'conflict' ? 409 : 404)
        .send({ error: allowed.error });
    }
    if (!transcripts.viewFor(id)) {
      return reply.code(404).send({ error: 'No such transcript.' });
    }
    transcripts.deleteFor(id);
    return { ok: true };
  });

  /**
   * Every line in this channel's transcripts matching a query.
   *
   * Membership of the channel, read the same way every other channel route
   * reads it. Results carry the recording each line came from and the name of
   * whoever said it, so the caller can group without a second request per hit.
   *
   * Deliberately not paginated. It is capped instead, and a cap is the honest
   * shape here: nobody pages through a common word across a year of
   * conversation, they type something more specific.
   */
  fastify.get('/channels/:id/transcripts/search', async (request, reply) => {
    const account = await requireAccount(request, reply);
    if (!account) return;
    const { id } = request.params as { id: string };
    const q = (request.query as { q?: string } | undefined)?.q ?? '';

    // The same answer an absent channel gets, for the same reason the
    // recording routes give: which channels exist is something only their
    // members learn.
    if (!channels.isMemberOf(id, account.id)) {
      return reply.code(404).send({ error: 'No such channel.' });
    }

    const hits = transcripts.search(id, q);
    // One lookup per recording rather than per line: a busy query returns
    // dozens of hits from a handful of conversations.
    const rows = new Map<string, RecordingRow | undefined>();
    const rowFor = (recordingId: string) => {
      if (!rows.has(recordingId)) {
        rows.set(
          recordingId,
          db.prepare('SELECT * FROM recordings WHERE id = ?').get(recordingId) as
            | unknown as RecordingRow
            | undefined
        );
      }
      return rows.get(recordingId);
    };

    // Counted from the database rather than from the hits: see
    // `stemsWithManyVoices`. A result set is not a transcript.
    const touched = [...new Set(hits.map((hit) => hit.recordingId))];
    const manyVoices = transcripts.stemsWithManyVoices(touched);
    // One read per recording a result touched, not per hit. The removed
    // voices are already gone — `search` excludes them in SQL, so that the
    // cap counts results somebody can actually see.
    const declared = new Map<string, VoiceDeclarations>(
      touched.map((id) => [id, transcripts.voicesFor(id)])
    );

    return {
      hits: hits.map((hit) => {
        const row = rowFor(hit.recordingId);
        const name = row ? (nameFrom(row, hit.identity)?.displayName ?? null) : null;
        const voice =
          declared.get(hit.recordingId)?.[voiceKey(hit.identity, hit.speaker)];
        return {
          ...hit,
          recordingName: row ? toRecordingView(row, account.id).name : null,
          displayName: voice?.name
            ? voice.name
            : name
              ? voiceName(
                  name,
                  hit.speaker,
                  manyVoices.has(`${hit.recordingId}\u0000${hit.identity}`)
                )
              : null,
        };
      }),
    };
  });

  /**
   * The reach test the two transcript reads share.
   *
   * Absent, deleted, not-yours and not-transcribed are one 404, for the reason
   * the export gives: that a recording exists is something only the channel's
   * members learn, and the same goes for whether it has been transcribed.
   */
  async function readableTranscript(
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<{ row: RecordingRow; view: TranscriptView } | null> {
    const account = await requireAccount(request, reply);
    if (!account) return null;
    const { id } = request.params as { id: string };

    const row = channels
      .recordingsFor(account.id)
      .find((candidate) => candidate.id === id);
    const view = row ? transcripts.viewFor(id) : undefined;
    if (!row || !view) {
      reply.code(404).send({ error: 'No such transcript.' });
      return null;
    }
    return { row, view };
  }

  // `commit` and `minBuild` are here rather than behind auth because the
  // question they answer — what is actually running on the box — is one you
  // want answerable by curl, from a machine that is not this one, at the
  // moment a deploy is being doubted. A short sha of a private repository
  // identifies a revision to somebody who already has the repository and is
  // an opaque seven characters to anybody else.
  /**
   * How far back `oldestBuild` and `silentBuilds` look. Thirty days is chosen
   * against TestFlight's ninety-day expiry: long enough that somebody who uses
   * the app occasionally still counts, short enough that a phone abandoned
   * two months ago stops holding the floor down forever.
   */
  const BUILD_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;


  // --- Publication ----------------------------------------------------------

  /**
   * Everything a public channel's page and feed are made of, or null.
   *
   * One function behind both so that the page and the feed cannot come to
   * disagree about what is published — which is the same argument
   * `recordingsFor` settles for the private side, and matters more here
   * because the two consumers are read by different audiences and a
   * divergence would be invisible until somebody compared them.
   *
   * **`public_at` is checked on every request rather than cached.** A channel
   * going private has to stop answering now, not at the end of a TTL.
   */
  function publicChannel(channelId: string): {
    channel: {
      id: string;
      name: string;
      description: string | null;
      language: string | null;
      explicit: boolean | null;
      category: string | null;
      /** Whether there is cover art to point at. */
      hasImage: boolean;
      /**
       * When it was last replaced, appended to the artwork address as a query
       * so that a new cover is a new URL.
       *
       * Directories and clients cache a cover hard and several never re-fetch
       * one whose address has not changed — which is the same argument
       * html.ts makes for renaming the social card image, arriving where it
       * can be solved rather than only warned about.
       */
      imageAt: number | null;
    };
    episodes: Array<{
      id: string;
      title: string;
      startedAt: number;
      durationMs: number;
      byteLength: number;
      ready: boolean;
      hasTranscript: boolean;
    }>;
  } | null {
    const row = db
      .prepare(
        `SELECT id, name, description, language, explicit, category,
                image_at, image_type
           FROM channels
          WHERE id = ? AND public_at IS NOT NULL AND deleted_at IS NULL`
      )
      .get(channelId) as
      | {
          id: string;
          name: string | null;
          description: string | null;
          language: string | null;
          explicit: number | null;
          category: string | null;
          image_at: number | null;
          image_type: string | null;
        }
      | undefined;
    if (!row) return null;

    // `deleted_at IS NULL` here as well as on the channel, and it is an
    // ordering constraint rather than belt and braces: the sweep removes a
    // marked recording's objects a week later, and a feed item whose
    // enclosure 404s is a broken episode in every subscriber's client. So a
    // recording leaves the feed the moment it is marked — a week before its
    // bytes go — which is the order that never shows anybody a dead link.
    const rows = db
      .prepare(
        `SELECT id, name, participant_names, started_at, duration_ms,
                aac_state, published_bytes
           FROM recordings
          WHERE channel_id = ? AND published_at IS NOT NULL
            AND deleted_at IS NULL
          ORDER BY started_at DESC`
      )
      .all(channelId) as unknown as Array<{
      id: string;
      name: string | null;
      participant_names: string | null;
      started_at: number;
      duration_ms: number;
      aac_state: string | null;
      published_bytes: number | null;
    }>;

    return {
      channel: {
        id: row.id,
        // **Only a channel made public before 2026-09-22 can reach this**,
        // which is why the fallback is still here and why it is not worth
        // anything better. A page needs a name, an unnamed channel's only
        // name is the people in it, and a public page never names a member —
        // so the name is now asked for at the switch and cannot be cleared
        // while the page is on. See `setPublic` in publication.ts, which is
        // where the rule is. `describeChannel` is not available and would be
        // wrong if it were: it names the *viewer's* others, and there is no
        // viewer here.
        name: row.name ?? 'A conversation',
        description: row.description,
        language: row.language,
        explicit: row.explicit === null ? null : row.explicit === 1,
        category: row.category,
        hasImage: row.image_at !== null && row.image_type !== null,
        imageAt: row.image_at,
      },
      episodes: rows.map((recording) => ({
        id: recording.id,
        title: publicTitle(recording),
        startedAt: recording.started_at,
        durationMs: recording.duration_ms,
        byteLength: recording.published_bytes ?? 0,
        ready:
          recording.aac_state === 'ready' &&
          (recording.published_bytes ?? 0) > 0,
        hasTranscript: transcripts.linesFor(recording.id).length > 0,
      })),
    };
  }

  /**
   * What one episode is called on a page where no member may be named.
   *
   * **This is a privacy guard and not a formatting choice.** A recording in
   * an unnamed channel is filed under `nameRecording(displayNames)` — "Alice
   * Appleby and Bob Barker" — which is the right label in the app, where
   * everybody reading it was in the room, and is a byline the moment the same
   * string reaches a public page. The task entry is explicit that members
   * remain private though they may be described in the description, so the
   * only words about who these people are must be words they wrote.
   *
   * The default is recognised by recomputing it rather than recorded by a
   * flag, which is what makes it exact: the row carries the display names it
   * was filed with, so the same function that produced the name reproduces
   * it, and a match means nobody has since chosen a title. Somebody who
   * renames a recording to precisely the auto-generated string loses it here,
   * which is the failure worth having — it is silent and safe, where the
   * other direction is silent and publishes a name.
   *
   * The fallback is the date. `toRecordingView` falls back to
   * `describeChannel(others)` instead, which is computed from the *viewer's*
   * others — and there is no viewer here.
   */
  function publicTitle(recording: {
    name: string | null;
    participant_names: string | null;
    started_at: number;
  }): string {
    if (!recording.name) return publicDate(recording.started_at);
    const names: Record<string, string> = recording.participant_names
      ? JSON.parse(recording.participant_names)
      : {};
    const derived = nameRecording(Object.values(names));
    if (recording.name === derived) return publicDate(recording.started_at);
    return recording.name;
  }

  /** The date a conversation happened, which is true for every reader. */
  function publicDate(ms: number): string {
    return new Date(ms).toLocaleDateString('en-GB', {
      timeZone: 'UTC',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  }

  /**
   * Every public channel, for the directory page.
   *
   * **One query rather than `publicChannel` in a loop**, which matters more
   * than it looks: that function reads a channel's whole recording list and
   * asks `transcripts.linesFor` about each row, and doing it per channel on
   * an unauthenticated page anybody can hit is a page whose cost grows with
   * the product. Here a channel costs one grouped row.
   *
   * The join is a `LEFT JOIN` because a public channel with nothing published
   * is still listed — see directory-page.ts, where that is argued — so the
   * predicates that select a listenable recording have to sit in the join
   * rather than in `WHERE`, or an empty channel would be filtered out by the
   * very conditions meant to count its episodes.
   *
   * `aac_state` and `published_bytes` are the same readiness test the page
   * and the feed apply, and `deleted_at IS NULL` is the same ordering
   * constraint: a recording leaves every public surface the moment it is
   * marked, a week before the sweep takes its bytes.
   */
  function publicChannels(): Array<{
    id: string;
    name: string;
    description: string | null;
    hasImage: boolean;
    imageAt: number | null;
    episodes: number;
    latest: number | null;
  }> {
    const rows = db
      .prepare(
        `SELECT c.id, c.name, c.description, c.image_at, c.image_type,
                COUNT(r.id) AS episodes, MAX(r.started_at) AS latest
           FROM channels c
           LEFT JOIN recordings r
             ON r.channel_id = c.id
            AND r.published_at IS NOT NULL
            AND r.deleted_at IS NULL
            AND r.aac_state = 'ready'
            AND r.published_bytes > 0
          WHERE c.public_at IS NOT NULL AND c.deleted_at IS NULL
          GROUP BY c.id
          -- Liveliest first, and a channel with nothing on it last rather
          -- than nowhere: latest is null there, and NULLS LAST is what puts
          -- it after every date instead of before them. Among those, the one
          -- that went public most recently is the one most likely to be
          -- about to have something on it.
          ORDER BY latest DESC NULLS LAST, c.public_at DESC`
      )
      .all() as unknown as Array<{
      id: string;
      name: string | null;
      description: string | null;
      image_at: number | null;
      image_type: string | null;
      episodes: number;
      latest: number | null;
    }>;

    return rows.map((row) => ({
      id: row.id,
      // The same fallback the channel's own page uses, and it has to be the
      // same string: a row here and the heading it leads to disagreeing about
      // what a channel is called reads as a bug in whichever one you saw
      // second. Reachable only by a channel made public before the rule that
      // a public channel is a named one — see `publicChannel` above, and note
      // that a list is where an unnamed row is worst: every one of them would
      // read the same.
      name: row.name ?? 'A conversation',
      description: row.description,
      hasImage: row.image_at !== null && row.image_type !== null,
      imageAt: row.image_at,
      episodes: row.episodes,
      latest: row.latest,
    }));
  }

  /**
   * The directory: every public channel, in one list.
   *
   * **Unauthenticated and uncached, like the channel pages it links to.** A
   * cache header here would outlive a channel going private, which is the one
   * thing on this page that has to take effect at once — the row is the whole
   * of what makes a channel findable.
   */
  fastify.get('/podcasts', async (request, reply) => {
    const base = origin(request);
    return reply.header('content-type', 'text/html; charset=utf-8').send(
      podcastDirectoryPage({
        channels: publicChannels().map((channel) => ({
          id: channel.id,
          name: channel.name,
          description: channel.description,
          imageUrl: artworkUrl(base, channel),
          episodes: channel.episodes,
          latest: channel.latest,
        })),
        contactEmail: options.contactEmail,
        origin: base,
      })
    );
  });

  /** The public page: what the task asks for, in one route. */
  fastify.get('/c/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const found = publicChannel(id);
    if (!found) return reply.code(404).send({ error: 'No such page.' });

    const base = origin(request);
    return reply.header('content-type', 'text/html; charset=utf-8').send(
      publicChannelPage({
        id: found.channel.id,
        name: found.channel.name,
        description: found.channel.description,
        imageUrl: artworkUrl(base, found.channel),
        episodes: found.episodes.map((episode) => ({
          id: episode.id,
          title: episode.title,
          startedAt: episode.startedAt,
          durationMs: episode.durationMs,
          audioUrl: `${base}/c/${id}/e/${episode.id}.m4a`,
          ready: episode.ready,
        })),
        feedUrl: `${base}/c/${id}/feed.xml`,
        contactEmail: options.contactEmail,
        origin: base,
      })
    );
  });

  /**
   * The feed a podcast client subscribes to.
   *
   * Only episodes whose transcode has landed are offered, which is the same
   * rule the page applies: a feed item whose enclosure is not there yet is a
   * broken episode, and a subscriber's client caches the failure.
   */
  fastify.get('/c/:id/feed.xml', async (request, reply) => {
    const { id } = request.params as { id: string };
    const found = publicChannel(id);
    if (!found) return reply.code(404).send({ error: 'No such feed.' });

    const base = origin(request);
    const episodes: FeedEpisode[] = found.episodes
      .filter((episode) => episode.ready)
      .map((episode) => ({
        id: episode.id,
        title: episode.title,
        startedAt: episode.startedAt,
        durationMs: episode.durationMs,
        enclosureUrl: `${base}/c/${id}/e/${episode.id}.m4a`,
        contentType: PUBLISHED_CONTENT_TYPE,
        byteLength: episode.byteLength,
        ...(episode.hasTranscript
          ? { transcriptUrl: `${base}/c/${id}/e/${episode.id}.vtt` }
          : {}),
      }));

    return reply
      .header('content-type', 'application/rss+xml; charset=utf-8')
      .send(
        renderFeed(
          {
            id: found.channel.id,
            title: found.channel.name,
            description:
              found.channel.description ??
              'Recorded conversations, published in full.',
            language: found.channel.language,
            explicit: found.channel.explicit,
            category: found.channel.category,
            imageUrl: artworkUrl(base, found.channel),
          },
          episodes,
          {
            selfUrl: `${base}/c/${id}/feed.xml`,
            pageUrl: `${base}/c/${id}`,
          }
        )
      );
  });

  /**
   * Where a channel's cover art is, or undefined when it has none.
   *
   * The timestamp is in the address on purpose: directories and clients cache
   * a cover hard and several never re-fetch one whose URL has not changed, so
   * a replaced cover that kept its address would go on being the old one for
   * as long as anybody's cache lived.
   */
  function artworkUrl(
    base: string,
    channel: { id: string; hasImage: boolean; imageAt: number | null }
  ): string | undefined {
    if (!channel.hasImage) return undefined;
    return `${base}/c/${channel.id}/artwork?v=${channel.imageAt}`;
  }

  /**
   * A public channel's cover art.
   *
   * Unauthenticated and cached for a day. Guarded on the channel being public
   * rather than on the image existing: a cover is part of the page, and a
   * channel that has gone private should stop serving every part of it.
   */
  fastify.get('/c/:id/artwork', async (request, reply) => {
    const { id } = request.params as { id: string };
    const found = publicChannel(id);
    if (!found?.channel.hasImage) {
      return reply.code(404).send({ error: 'No cover art.' });
    }
    if (!options.store) {
      return reply.code(503).send({ error: 'Storage is not configured.' });
    }
    const row = db
      .prepare('SELECT image_type FROM channels WHERE id = ?')
      .get(id) as { image_type: string | null } | undefined;
    try {
      const data = await options.store.get(artworkKeyFor(id));
      return reply
        .header('content-type', row?.image_type ?? 'image/jpeg')
        // The address carries the cover's own timestamp, so a given URL's
        // bytes never change and a long cache is free. See `artworkUrl`.
        .header('cache-control', 'public, max-age=86400')
        .send(data);
    } catch (error) {
      request.log.error({ err: error, channel: id }, 'artwork fetch failed');
      return reply.code(404).send({ error: 'No cover art.' });
    }
  });

  /**
   * Uploads a channel's cover art, raw, as the track route takes a track.
   *
   * **Refused on the spot rather than at submission.** A feed with no artwork
   * is not listed and one with the wrong shape is rejected by the directory,
   * by which point somebody has waited on a review to be told — so the rules
   * are enforced here, in the words of the rule. See artwork.ts.
   */
  fastify.post(
    '/channels/:id/image',
    { bodyLimit: MAX_ARTWORK_BYTES },
    async (request, reply) => {
      const account = await requireAccount(request, reply);
      if (!account) return;
      const { id } = request.params as { id: string };

      const body = request.body;
      if (!Buffer.isBuffer(body) || body.length === 0) {
        return reply.code(400).send({ error: 'No image was uploaded.' });
      }
      const read = readArtwork(body);
      if (!read.ok) return reply.code(400).send({ error: read.error });

      const stored = await publication.setArtwork(
        id,
        account.id,
        body,
        read.artwork.contentType
      );
      if (!stored.ok) {
        return reply.code(statusFor(stored.code)).send({ error: stored.error });
      }
      return { width: read.artwork.width, height: read.artwork.height };
    }
  );

  /**
   * One published episode's audio.
   *
   * **The only unauthenticated route in this server that serves a
   * conversation**, and every guard it has is on this path: the channel must
   * be public, the recording must be published and not deleted, and its
   * transcode must have landed. All four are read per request rather than
   * cached, so withdrawing consent stops the next byte.
   *
   * **Ranged, because a podcast client is not a browser.** Apple's crawler
   * and most players issue byte-range requests and expect a `206` with a
   * `Content-Range`; several will not let a listener seek without one, and
   * some will not download at all. `Accept-Ranges` is advertised on the full
   * response too, which is how a client learns it may ask.
   *
   * The bytes come off this box rather than out of S3 directly, which is the
   * trade planning/decisions/2026-09-21-nothing-is-published-until-everybody-in-it-has-agreed.md
   * argues: the accounting stays honest, the enclosure URL stays ours, and the
   * privacy story stays one sentence. Moving it later is a change of URL
   * rather than a change of design.
   */
  fastify.get('/c/:id/e/:file', async (request, reply) => {
    const params = request.params as { id: string; file: string };
    const match = /^(.+)\.(m4a|vtt)$/.exec(params.file);
    if (!match) return reply.code(404).send({ error: 'No such episode.' });
    const [, recordingId, extension] = match;

    const found = publicChannel(params.id);
    const episode = found?.episodes.find(
      (candidate) => candidate.id === recordingId
    );
    if (!episode?.ready) {
      return reply.code(404).send({ error: 'No such episode.' });
    }

    if (extension === 'vtt') {
      return sendTranscript(reply, recordingId, episode.hasTranscript);
    }
    if (!options.store) {
      return reply
        .code(503)
        .send({ error: 'Recording storage is not configured.' });
    }

    const key = publishedKeyFor(params.id, recordingId);
    const range = parseRange(request.headers.range, episode.byteLength);
    // **Decided here and counted below, once the bytes have actually gone
    // out.** A read the store then fails to serve is not somebody starting an
    // episode, and counting before the fetch would make an outage look like a
    // popular week. Both branches count, because both serve audio — see
    // `startsAnEpisode` for why only some reads are starts at all, and
    // `episode_listens` for what the number may honestly be read as.
    const start = startsAnEpisode(range, episode.byteLength);
    try {
      if (!range) {
        const data = await options.store.get(key);
        channels.usage.recordBytes({
          kind: 'episode-fetch',
          bytes: data.length,
          recordingId,
        });
        if (start) {
          channels.usage.recordListen({ channelId: params.id, recordingId });
        }
        return reply
          .header('content-type', PUBLISHED_CONTENT_TYPE)
          .header('accept-ranges', 'bytes')
          .header('content-length', String(data.length))
          .send(data);
      }
      const { data, totalBytes } = await options.store.getRange(
        key,
        range.start,
        range.end
      );
      channels.usage.recordBytes({
        kind: 'episode-fetch',
        bytes: data.length,
        recordingId,
      });
      if (start) {
        channels.usage.recordListen({ channelId: params.id, recordingId });
      }
      return reply
        .code(206)
        .header('content-type', PUBLISHED_CONTENT_TYPE)
        .header('accept-ranges', 'bytes')
        .header(
          'content-range',
          `bytes ${range.start}-${range.end}/${totalBytes}`
        )
        .header('content-length', String(data.length))
        .send(data);
    } catch (error) {
      request.log.error(
        { err: error, recording: recordingId },
        'episode fetch failed'
      );
      return reply.code(404).send({ error: 'No such episode.' });
    }
  });

  /**
   * A published episode's transcript, as the VTT the app already exports.
   *
   * **Per stem, and so it knows who spoke** — which is the one element of a
   * published episode that is better here than the same audio published
   * anywhere else. `<podcast:transcript>` in the feed points at this, and
   * Apple and Overcast both read it.
   */
  function sendTranscript(
    reply: FastifyReply,
    recordingId: string,
    hasTranscript: boolean
  ) {
    if (!hasTranscript) {
      return reply.code(404).send({ error: 'No such transcript.' });
    }
    const row = db
      .prepare('SELECT participant_names FROM recordings WHERE id = ?')
      .get(recordingId) as { participant_names: string | null } | undefined;
    const names: Record<string, string> = row?.participant_names
      ? JSON.parse(row.participant_names)
      : {};
    const file = formatTranscript(
      transcripts.linesFor(recordingId),
      names,
      'vtt',
      transcripts.voicesFor(recordingId)
    );
    return reply
      .header('content-type', `${file.contentType}; charset=utf-8`)
      .send(file.body);
  }

  /**
   * Reads a `Range` header, or null for a request that wants the whole file.
   *
   * Deliberately narrow: one range, `bytes=` only, and anything else is
   * treated as no range at all rather than as an error. A `416` is correct
   * for a multi-range or unsatisfiable request and is also a response some
   * clients handle by giving up entirely, where sending the whole file is
   * always right and merely less efficient. An open-ended `bytes=N-` — which
   * is what most players send to resume — is clamped to the end.
   */
  function parseRange(
    header: string | string[] | undefined,
    totalBytes: number
  ): { start: number; end: number } | null {
    const raw = Array.isArray(header) ? header[0] : header;
    const match = /^bytes=(\d*)-(\d*)$/.exec(raw?.trim() ?? '');
    if (!match || totalBytes <= 0) return null;
    const [, rawStart, rawEnd] = match;
    if (rawStart === '' && rawEnd === '') return null;

    // A suffix range — `bytes=-500`, the last 500 bytes — which ffprobe and
    // several players send to read the moov atom of a file they have not
    // downloaded.
    if (rawStart === '') {
      const length = Math.min(Number(rawEnd), totalBytes);
      if (length <= 0) return null;
      return { start: totalBytes - length, end: totalBytes - 1 };
    }
    const start = Number(rawStart);
    if (start >= totalBytes) return null;
    const end =
      rawEnd === '' ? totalBytes - 1 : Math.min(Number(rawEnd), totalBytes - 1);
    return end < start ? null : { start, end };
  }

  // --- Publication, from the inside -----------------------------------------

  /** Whether this channel has a page at all. Any member may decide. */
  fastify.post('/channels/:id/public', async (request, reply) => {
    const account = await requireAccount(request, reply);
    if (!account) return;
    const { id } = request.params as { id: string };
    const body = request.body as { public?: unknown } | undefined;
    if (typeof body?.public !== 'boolean') {
      return reply.code(400).send({ error: 'public must be true or false.' });
    }
    const result = publication.setPublic(id, account.id, body.public);
    if (!result.ok) {
      return reply.code(statusFor(result.code)).send({ error: result.error });
    }
    return {
      publicAt: result.publicAt,
      url: result.publicAt ? `${origin(request)}/c/${id}` : null,
      feedUrl: result.publicAt ? `${origin(request)}/c/${id}/feed.xml` : null,
    };
  });

  /**
   * That this member has read the card saying their channel has a public
   * page.
   *
   * A record rather than a decision: it takes nothing down, it lets nothing
   * up, and the only thing it changes is whether the card is drawn again on
   * this person's next snapshot. See `owesPublicNotice` in publication.ts for
   * why that is worth a row.
   */
  fastify.post('/channels/:id/public-notice', async (request, reply) => {
    const account = await requireAccount(request, reply);
    if (!account) return;
    const { id } = request.params as { id: string };
    const result = publication.acknowledgePublic(id, account.id);
    if (!result.ok) {
      return reply.code(statusFor(result.code)).send({ error: result.error });
    }
    return { ok: true };
  });

  /** The two things a feed requires and nothing can derive. */
  fastify.post('/channels/:id/declarations', async (request, reply) => {
    const account = await requireAccount(request, reply);
    if (!account) return;
    const { id } = request.params as { id: string };
    const body = request.body as
      | { language?: unknown; explicit?: unknown; category?: unknown }
      | undefined;
    if (
      body?.language !== undefined &&
      body.language !== null &&
      typeof body.language !== 'string'
    ) {
      return reply.code(400).send({ error: 'language must be a string.' });
    }
    if (
      body?.explicit !== undefined &&
      body.explicit !== null &&
      typeof body.explicit !== 'boolean'
    ) {
      return reply.code(400).send({ error: 'explicit must be true or false.' });
    }
    if (
      body?.category !== undefined &&
      body.category !== null &&
      typeof body.category !== 'string'
    ) {
      return reply.code(400).send({ error: 'category must be a string.' });
    }
    // Whether it is one of Apple's is `setDeclarations`' answer rather than
    // this route's: the list is the rule, and the rule lives with the thing
    // that stores it.
    const result = publication.setDeclarations(id, account.id, {
      language: body?.language as string | null | undefined,
      explicit: body?.explicit as boolean | null | undefined,
      category: body?.category as string | null | undefined,
    });
    if (!result.ok) {
      return reply.code(statusFor(result.code)).send({ error: result.error });
    }
    return { ok: true };
  });

  /**
   * Agrees that one recording may be published, and publishes it if that was
   * the last agreement outstanding.
   *
   * **Not `mayManageRecording`.** That is the bar for changing a shared
   * artefact for the people who can already reach it; this shows it to
   * everybody, and publication.ts argues at length why one member's
   * judgement is not standing for that.
   */
  fastify.post('/recordings/:id/consent', async (request, reply) => {
    const account = await requireAccount(request, reply);
    if (!account) return;
    const { id } = request.params as { id: string };
    const result = publication.consent(id, account.id);
    if (!result.ok) {
      return reply.code(statusFor(result.code)).send({ error: result.error });
    }
    return result.state;
  });

  /**
   * Withdraws this person's agreement, taking the recording down if it was up.
   *
   * Any one participant, with no appeal to the others — the mirror of
   * unanimity. What it cannot do is reach a file somebody already has, and
   * the app says so in those words before anybody publishes anything.
   */
  fastify.delete('/recordings/:id/consent', async (request, reply) => {
    const account = await requireAccount(request, reply);
    if (!account) return;
    const { id } = request.params as { id: string };
    const result = publication.withdraw(id, account.id);
    if (!result.ok) {
      return reply.code(statusFor(result.code)).send({ error: result.error });
    }
    return result.state;
  });

  fastify.get('/healthz', async () => {
    // The declaration and the measurement, side by side, which is the whole
    // point of putting it here. `minBuild` is what this server promises to
    // answer; the other two are what has actually called.
    //
    // **`silentBuilds` is not a footnote.** It counts *sessions* active in the
    // window whose build is unknown — every build up to 36 says nothing. While
    // it is above zero, `oldestBuild` is a floor on the *known* population and
    // not on the real one, and a shim must not be deleted on the strength of
    // it. It reaching zero is the event that makes this number mean what it
    // looks like it means.
    //
    // **Sessions rather than accounts since 2026-08-24**, when several
    // sign-ins per account became ordinary and one column per person stopped
    // being able to hold two devices' builds. Both numbers here changed grain
    // together; a figure recorded before that date counts people, so do not
    // read a rise across that day as a population that grew. See
    // `Accounts.buildsSeenSince`.
    //
    // Deleted accounts and the two demo accounts are not counted by either —
    // neither is a phone a raised floor could strand, and one of the demo
    // accounts reports no build at all, so leaving them in would hold
    // `silentBuilds` above zero for good.
    const builds = accounts.buildsSeenSince(now() - BUILD_WINDOW_MS);
    const connectivity = channels.connectivityCounts();
    return {
      ok: true,
      audio: options.media ? 'livekit' : 'none',
      commit: deployed()?.commit ?? 'unknown',
      minBuild: MIN_SUPPORTED_BUILD,
      oldestBuild: builds.oldest,
      silentBuilds: builds.silent,
      // How often a lost connection returns inside DISCONNECT_GRACE_MS against
      // how often it never does — the ratio that says whether that minute is
      // defending anything. Counts since this process started, aggregate and
      // per nobody. See Channels.connectivityCounts.
      //
      // **Spread flat rather than sent as an object**, which is a constraint
      // this endpoint carries rather than a style: `bin/health` reads it with
      // sed and says so, nesting being the one thing that would break it.
      drops: connectivity.dropped,
      dropsRecovered: connectivity.recovered,
      dropsExpired: connectivity.expired,
      // Only ever read by a client that has just discovered it is below the
      // floor, and null far more often than not. See BuildOptions.updateUrl.
      updateUrl: options.updateUrl ?? null,
    };
  });

  // --- Shared views -------------------------------------------------------

  /**
   * A recording row as its audience sees it: named once and for everybody,
   * with the other participants' names as they were when the run was filed.
   *
   * Shared by Home and the channel snapshot so one recording cannot be called
   * two different things depending on which screen you found it on.
   */
  function toRecordingView(row: RecordingRow, userId: string): RecordingView {
    const participants: string[] = row.participants
      ? JSON.parse(row.participants)
      : [row.initiator_id, row.invitee_id];
    // Names as they were when the run was filed. Rows written before that was
    // recorded resolve live, which is what they did all along.
    const frozen: Record<string, string> = row.participant_names
      ? JSON.parse(row.participant_names)
      : {};
    const others = participants
      .filter((id) => id !== userId)
      .map((id) =>
        frozen[id] ? { id, displayName: frozen[id] } : accounts.public(id)
      )
      .filter((account): account is PublicAccount => !!account);
    return {
      id: row.id,
      channelId: row.channel_id,
      // Rows written before the name was decided at stop time have none to
      // read; they fall back to the viewer-relative label they always had.
      name: row.name ?? describeChannel(others.map((o) => o.displayName)),
      others,
      startedAt: row.started_at,
      // Rows old enough to predate the column were backfilled this way by the
      // migration, so it is the same answer rather than a guess.
      endedAt: row.ended_at ?? row.started_at + row.duration_ms,
      durationMs: row.duration_ms,
      // Only 'pending' means the mix is being made. 'unmixed' is a settled
      // answer — a failed mix, or a run that predates mixing — and those play
      // and export by encoding on demand, exactly as everything used to.
      mixing: row.mix_state === 'pending',
      ...publicationViewOf(row, userId),
      ...transcriptViewOf(row, userId),
    };
  }

  /**
   * Where publishing this recording stands, for the card that offers it.
   *
   * **Offered only on a channel that has declared itself public.** Publishing
   * is two decisions — the page exists, and this conversation is on it — and
   * a consent control on a channel with no page would be asking people to
   * agree to something that cannot happen. It appears when somebody turns the
   * channel public, which is also when it starts to mean anything.
   */
  function publicationViewOf(
    row: RecordingRow,
    viewerId: string
  ): Pick<RecordingView, 'publication'> {
    const channel = db
      .prepare('SELECT public_at FROM channels WHERE id = ?')
      .get(row.channel_id) as { public_at: number | null } | undefined;
    if (!channel?.public_at) return {};

    const state = publication.stateOf(row);
    const named = (ids: string[]): PublicAccount[] =>
      ids
        .map((id) => accounts.public(id))
        .filter((account): account is PublicAccount => !!account);
    return {
      publication: {
        required: named(state.required),
        consented: named(state.consented),
        mine: state.consented.includes(viewerId),
        publishedAt: state.publishedAt,
        blockedByGuest: state.blockedByGuest,
        // 'failed' is not "preparing" and is not surfaced as its own state:
        // the recording is published and has no audio yet, which is what a
        // reader needs to know either way, and a retry is the next consent.
        preparing: !!state.publishedAt && state.audioState !== 'ready',
      },
    };
  }

  /**
   * A recording's transcript, as the wire carries it, or nothing at all.
   *
   * Nothing at all in two cases that mean different things and look the same
   * from the app's side, which is intended: this server cannot transcribe, or
   * this recording has not been transcribed. Either way there is nothing to
   * show and the app offers what it offers — the button's availability comes
   * from the same absence, so a server with no key never shows one.
   */
  function transcriptViewOf(
    row: RecordingRow,
    viewerId: string
  ): Pick<RecordingView, 'transcript'> {
    if (!transcripts.available()) return {};
    // Before the provider check would even matter: transcripts are behind
    // Labs, and this absence is the whole of what withholds them from the app
    // — the button, the search field above the list, and the way into a
    // transcript that already exists. It is viewer-relative like everything
    // else here, so one member of a channel having asked for the experimental
    // features does not put them on anybody else's screen; a guest, who has no
    // account to have asked, reads the default and sees none of it. See `labs`
    // in core/settings.ts.
    if (!accounts.settings(viewerId).labs) return {};
    const gate = transcribeGate(viewerId, row.id);
    const mayRequest = gate.ok;
    // The sentence travels with the refusal rather than being composed in the
    // app, because the app cannot know the cap or how much of it this
    // recording would take. Absent when the answer is yes, so nothing has to
    // remember to clear it.
    const requestLimit = gate.ok ? {} : { requestLimit: gate.message };
    // Only when the tap would actually cost this person their one use — an
    // unlimited account is not warned about spending something it does not
    // have, and neither is anybody being refused.
    const spendsFreeUse =
      gate.ok && !transcribesFreely(viewerId) ? { spendsFreeUse: true } : {};
    const view = transcripts.viewFor(row.id);
    // `'none'` rather than nothing: this server can transcribe this recording
    // and nobody has asked. Absent is reserved for a server that cannot, which
    // is what withdraws the button entirely.
    if (!view) {
      return {
        transcript: {
          state: 'none',
          provider: options.transcription?.name ?? '',
          requestedBy: null,
          mayRequest,
          ...requestLimit,
          ...spendsFreeUse,
        },
      };
    }
    return {
      transcript: {
        state: view.state,
        provider: options.transcription?.name ?? '',
        mayRequest,
        ...requestLimit,
        ...spendsFreeUse,
        mayRemove: mayRemoveTranscript(viewerId, row.id),
        // Frozen names first, exactly as `others` does: a transcript that
        // relabels itself when somebody renames themselves is worse than one
        // with an old name in it.
        requestedBy: nameFrom(row, view.requestedBy),
        ...(view.failure ? { failure: view.failure } : {}),
        ...(view.missing.length ? { missing: view.missing.length } : {}),
      },
    };
  }

  /**
   * Whether this account's transcribing is unmetered.
   *
   * Resolved on each call rather than at boot: the account named in the
   * environment may not exist when this server starts, and an address
   * configured before its owner has signed in should start working when they
   * do rather than after a restart. One indexed lookup, on a path that is
   * already a database read.
   */
  function transcribesFreely(userId: string): boolean {
    if (accounts.transcriptAllowance(userId).unlimited) return true;
    const only = options.transcribeUnlimitedIdentifier;
    if (!only) return false;
    const allowed = accounts.byIdentifier(only);
    return !!allowed && allowed.id === userId;
  }

  /**
   * Whether this account may start a transcript for this recording, and what
   * to say when it may not.
   *
   * Three rules, and they refuse for different reasons and at different
   * distances: this one is about the money, `mayManageRecording` is about
   * reach and about not changing a shared thing from outside a conversation
   * in progress. This is only the first.
   *
   * The refusals here are both *temporary and personal* — "you have had
   * yours", "this one is too long for a free use" — which is why they come
   * with a sentence. The rule they replaced was "not you, ever, on this
   * server", which was worth no words at all and is why the button used to be
   * withheld in silence.
   */
  function transcribeGate(
    userId: string,
    recordingId: string
  ): { ok: true } | { ok: false; message: string } {
    if (transcribesFreely(userId)) return { ok: true };
    const { spentOn } = accounts.transcriptAllowance(userId);
    if (spentOn) {
      return {
        ok: false,
        message:
          'You have used your one free transcript. Reading and searching ' +
          'the transcripts in your channels is not limited.',
      };
    }
    const cap = options.freeTranscriptMinutes;
    if (cap === undefined) return { ok: true };
    const estimate = transcripts.costEstimateMs(recordingId);
    // Nothing to transcribe, or no such recording. Not this rule's refusal to
    // make: `request` says so precisely, and saying "too long" about a
    // recording with no speech in it would be a wrong answer confidently
    // given.
    if (estimate === undefined) return { ok: true };
    const minutes = Math.ceil(estimate / 60_000);
    if (minutes <= cap) return { ok: true };
    return {
      ok: false,
      message:
        `A free transcript covers up to ${cap} transcription minutes — a ` +
        `recording's length times the number of people recorded in it. This ` +
        `one comes to ${minutes}.`,
    };
  }

  /**
   * Whether this account may remove a transcript, or say who its voices were.
   *
   * Deleting spends nothing and destroys something that costs what it cost to
   * make again — so it is not for anybody who happens to be in the channel.
   * It is for whoever asked for this one, who is unmaking their own act, and
   * for an unlimited account, who can always make it again. **A deletion does
   * not return the free use**, which is the whole reason this is not simply
   * `mayManageRecording`: if it did, delete-and-ask-again would be an
   * unlimited supply of free transcripts.
   */
  function mayRemoveTranscript(userId: string, recordingId: string): boolean {
    if (transcribesFreely(userId)) return true;
    const view = transcripts.viewFor(recordingId);
    // Nothing to protect, and the answer the caller is owed is the 404 that
    // comes later — being told "not yours" about a transcript that does not
    // exist is a refusal that invents the thing it is refusing.
    if (!view) return true;
    return view.requestedBy === userId;
  }

  function nameFrom(row: RecordingRow, id: string): PublicAccount | null {
    // The played-media stem has no owner and so no frozen name. Without this
    // it falls through to `accounts.public`, finds nothing, and renders as
    // "Someone" — a participant nobody can identify, which is the confusion
    // excluding the stem was once meant to avoid, reached from the other side.
    if (id === MEDIA_IDENTITY) return { id, displayName: MEDIA_LABEL };
    const frozen: Record<string, string> = row.participant_names
      ? JSON.parse(row.participant_names)
      : {};
    return frozen[id]
      ? { id, displayName: frozen[id] }
      : (accounts.public(id) ?? null);
  }

  /** A channel's own recordings, for whoever belongs to it. */
  function recordingsInChannel(
    channelId: string,
    userId: string
  ): RecordingView[] {
    return channels
      .recordingsInChannel(channelId, userId)
      .map((row) => toRecordingView(row, userId));
  }

  function homeFor(userId: string): HomeView {
    return {
      invites: channels.invitesFor(userId),
      rejoinable: channels.rejoinableFor(userId),
      // The introduction's four *try* rungs, which are on this snapshot
      // because every other rung already is — see core/tried.ts. Sent to
      // everybody rather than to the accounts still being introduced: which
      // those are is the client's judgement, made from this and three other
      // things, and a server deciding it would need to reproduce all of it.
      tried: accounts.tried(userId),
      // The newest answer to any help question of theirs, so the Support tab
      // can be marked without the help view being fetched — see
      // `HomeView.helpAnsweredAt`. Composed on every home push, which is one
      // indexed MAX over a table with a handful of rows per account.
      helpAnsweredAt: help.lastAnsweredAt(userId),
      // Whether a cohort is waiting on this account's notifications, which is
      // what lets the app ask about them at all for somebody who has nobody —
      // see `HomeView.cohortEligible`. A predicate over the open cohorts and
      // a bounded reach walk, both of which Home already pays for in other
      // forms, and false outright while the feature is off.
      cohortEligible: channels.wouldPlaceInCohort(userId),
      // contactsFor already returns the public shape, deliberately: an
      // outgoing request carries the address rather than a name, so a request
      // to a real account and one to an address without an account look the
      // same.
      contacts: accounts.contactsFor(userId).map((entry) => ({
        account: entry.account,
        status: entry.status as 'accepted' | 'outgoing' | 'incoming',
        lastSeenAt: entry.lastSeenAt,
        // Asked here rather than inside `contactsFor`, which is a database
        // query and has no business knowing about sockets. Whether somebody
        // holds one is a fact about this process, so it is composed in at the
        // point the two are put on the wire together.
        //
        // Withheld from an outgoing request for the same reason the name and
        // the time are: that row is an address, and `undefined` is what the
        // absence of an answer looks like on this wire.
        inApp:
          entry.status === 'outgoing'
            ? undefined
            : reachability.inApp(entry.account.id),
      })),
    };
  }

  // The websocket route must be registered *inside* the plugin's scope. Its
  // onRoute hook is encapsulated, so a route added to the root afterwards never
  // gets `websocket: true` applied and is served as an ordinary GET — which
  // fails at runtime with "socket.send is not a function", not at boot.
  fastify.register(async (instance) => {
    await instance.register(websocket);
    registerWebsocket({
      fastify: instance,
      accounts,
      channels,
      homeFor,
      recordingsInChannel,
      owesPublicNotice: (channelId, userId) =>
        publication.owesPublicNotice(channelId, userId),
      now,
      homeNotifier,
      settingsNotifier,
      reachability,
      preferences,
      mediaUrl: options.mediaUrl,
      heartbeatIntervalMs: options.heartbeatIntervalMs,
    });
  });

  return {
    fastify,
    db,
    accounts,
    channels,
    devices,
    donations,
    transcripts,
    help,
    recordingsInChannel,
    recordingView: toRecordingView,
    publication,
  };
}

/**
 * The HTTP status for a refusal from the channel registry.
 *
 * The registry says *why* and this decides what that is worth over HTTP. The
 * two used to be one thing — the routes compared the error message — so the
 * wording of a sentence silently decided whether a caller got 403 or 400.
 */
function statusFor(code: RefusalCode): number {
  switch (code) {
    case 'forbidden':
      return 403;
    case 'conflict':
      return 409;
    case 'not_found':
    case 'invalid':
      return 400;
  }
}

export function toPublic(row: AccountRow): PublicAccount {
  return { id: row.id, displayName: row.display_name };
}
