import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, extname, join } from 'node:path';
import Fastify, {
  type FastifyInstance,
  type FastifyReply,
  type FastifyRequest,
} from 'fastify';
import websocket from '@fastify/websocket';
import type {
  HomeView,
  PublicAccount,
  RecordingView,
} from '../../core/protocol';
import { MAX_DISPLAY_NAME_LENGTH } from '../../core/constants';
import { describeChannel } from '../../core/naming';
import {
  alertFor,
  DEFAULT_NOTIFICATION_LEVEL,
  NOTIFICATION_LEVELS,
  type NotificationAlert,
  type NotificationLevel,
} from '../../core/notifications';
import { Accounts } from './accounts';
import { openDb, sha256, type AccountRow, type Db, type RecordingRow } from './db';
import { Devices, type DevicePlatform } from './devices';
import { NotificationPreferences } from './preferences';
import { Donations } from './donations';
import { RECORDING_CONTENT_TYPE } from './export';
import { isEmailAddress, type Mailer } from './mail';
import type { MediaServer } from './media';
import { probeDurationMs, UnreadableAudioError } from './playback';
import { escapeHtml } from './html';
import { privacyPage } from './privacy';
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
  claimedBuild,
  deployed,
  MIN_SUPPORTED_BUILD,
} from './release';
import { supportPage } from './support';
import { watchPage } from './watch-page';
import { donationsVisibleFor } from './region';
import {
  ChannelRegistry,
  MEDIA_IDENTITY,
  type RefusalCode,
} from './channels';
import { ConsolePusher, createPushNotifier, type Pusher } from './push';
import type { RecordingStore } from './storage';
import {
  createHomeNotifier,
  createReachability,
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
   * Reaches a device whose app is not running. Without one, nothing is sent
   * and the in-app path is all there is — which is what it was before push.
   */
  pusher?: Pusher;
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
}

export interface App {
  fastify: FastifyInstance;
  db: Db;
  accounts: Accounts;
  channels: ChannelRegistry;
  devices: Devices;
  donations: Donations;
  transcripts: Transcripts;
}

/**
 * The largest track anyone may upload.
 *
 * It is held on the server's own disk for the length of one channel, so the
 * ceiling is about not filling the box rather than about bandwidth. An hour of
 * ordinary MP3 is comfortably inside it.
 */
export const MAX_TRACK_BYTES = 100 * 1024 * 1024;

export function buildApp(options: BuildOptions = {}): App {
  const now = options.now ?? Date.now;
  const db = openDb(options.dbPath ?? ':memory:');
  const accounts = new Accounts(db, options.review);
  const donations = new Donations(
    db,
    accounts,
    options.kofi?.verificationToken
  );
  const fastify = Fastify({ logger: options.logger ?? false });

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

  // Uploaded tracks arrive as raw bytes rather than multipart: there is exactly
  // one file and no fields, so a multipart parser would be a dependency earning
  // nothing. The body is kept as a Buffer for the one route that wants it.
  const rawAudio = (
    _request: FastifyRequest,
    body: Buffer,
    done: (error: Error | null, body?: unknown) => void
  ) => done(null, body);
  fastify.addContentTypeParser(/^audio\//, { parseAs: 'buffer' }, rawAudio);
  fastify.addContentTypeParser(
    'application/octet-stream',
    { parseAs: 'buffer' },
    rawAudio
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
  const reachability = createReachability();
  const devices = new Devices(db);
  const preferences = new NotificationPreferences(db);
  const pusher = options.pusher ?? new ConsolePusher(() => {});
  const pushNotifier = createPushNotifier();

  /** Nothing is suppressed for a ping; see the notifier below. */
  const EMPTY_SESSIONS: ReadonlySet<string> = new Set();

  /**
   * Turns "these people should know" into notifications actually sent.
   *
   * Three filters, in this order, and the order is the point: drop anyone
   * already looking at the app, look up where the rest can be reached, and
   * forget every address Apple says is dead. The registry supplies none of
   * this — it knows only that something happened.
   *
   * **The first filter is the message's to skip, not this code's to decide.**
   * `reachesInApp` says whether a notification is a duplicate of what a live
   * socket has already drawn, and only a ping is not — see `notifications` in
   * push.ts, which owns that judgement the same way it owns the lifetimes. The
   * test here is on the flag rather than on the name of the notification, so a
   * fifth kind arrives with the question already answered instead of reaching
   * a filter that has never heard of it.
   *
   * Deliberately not awaited. A notification is a courtesy, and a channel
   * transition must not wait on Apple or fail because of it.
   */
  pushNotifier.notify = (userIds, message) => {
    // Grouped by how loudly it should land rather than sent per person: two
    // recipients who chose the same thing share one request, and the common
    // case — nobody has touched the setting — is a single group again, which
    // is what this path did before levels existed.
    const levels = preferences.levelsFor(userIds, message.channelId);
    const byAlert = new Map<NotificationAlert, string[]>();
    let suppressed = 0;
    for (const [id, addresses] of devices.addressesByAccount(userIds)) {
      // Which of this person's devices are looking at a screen right now.
      // Asked once per person rather than once per address, and not asked at
      // all for a ping, which reaches an open app deliberately.
      const live = message.reachesInApp
        ? EMPTY_SESSIONS
        : reachability.liveSessions(id);
      const alert = alertFor(message.kind, levels.get(id) ?? DEFAULT_NOTIFICATION_LEVEL);
      for (const address of addresses) {
        // **Per address, not per person, since 2026-08-24.** The rule is
        // unchanged — a notification to somebody already reading it on screen
        // is a second copy of what they are looking at — but its premise was
        // that a live socket meant *the* screen, which held while one session
        // per account was enforced. With a tablet signed in, dropping the
        // person silences the phone in their pocket on the strength of a
        // screen in another room.
        //
        // An address whose session cannot be identified falls back to the
        // person-level test, which is what every address got before this. That
        // covers rows written before the column existed and rows whose session
        // has since been revoked, and it means the behaviour changes only as
        // devices re-register — each at its next launch — rather than all at
        // once on deploy, in the direction of a duplicate rather than silence.
        const quiet = address.sessionHash
          ? live.has(address.sessionHash)
          : !message.reachesInApp && reachability.inApp(id);
        if (quiet) {
          suppressed += 1;
          continue;
        }
        byAlert.set(alert, [...(byAlert.get(alert) ?? []), address.token]);
      }
    }
    // Logged even when nothing is sent, and with the reason it was not. The
    // two ways of sending nothing — everybody is already looking, and nobody
    // has registered a device — are indistinguishable from a delivery failure
    // otherwise, which is exactly the confusion this feature shipped with.
    if (byAlert.size === 0) {
      fastify.log.info(
        {
          channelId: message.channelId,
          asked: userIds.length,
          suppressed,
          why: suppressed > 0 ? 'every device is looking' : 'no registered devices',
        },
        'push skipped'
      );
      return;
    }
    for (const [alert, tokens] of byAlert) {
      void pusher
        .send(tokens, message, alert)
        .then((results) => {
          for (const result of results) {
            if (result.dead) devices.forget(result.token);
          }
          const failed = results.filter((r) => r.status !== 200);
          fastify.log.info(
            {
              channelId: message.channelId,
              kind: message.kind,
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
    options.mixWaitMs
  );

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
    if (claimed !== null && claimed !== account.last_build) {
      accounts.markSeen(account.id, now(), claimed);
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
      claimed
    );
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
      | { identifier?: string; code?: string; displayName?: string }
      | undefined;
    if (!body?.identifier || !body?.code) {
      return reply.code(400).send({ error: 'identifier and code are required' });
    }

    const result = accounts.verifyCode(
      body.identifier,
      body.code,
      body.displayName,
      now()
    );
    // One message for every failure mode, so this cannot be used to discover
    // which identifiers have accounts.
    if (!result) return reply.code(401).send({ error: 'Invalid or expired code.' });

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
    devices.register(
      token,
      account.id,
      platform as DevicePlatform,
      now(),
      session ? sha256(session) : undefined
    );
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
   * the audio has stopped and they want it back. See TASKS § *Stepping Back
   * In* and BACKLOG § *The engine stops under a healthy room*.
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
      try {
        await options.mailer.sendInvite(body.identifier, account.display_name);
      } catch (error) {
        accounts.withdrawRequest(account.id, body.identifier);
        request.log.error({ err: error }, 'failed to send an invitation');
        return reply.code(502).send({ error: 'Could not send the invitation.' });
      }
    }

    // The same crossed-requests case as the by-id route below: they had asked
    // first, so this accepted theirs, and the pair are owed their channel.
    if (result.accepted && result.targetId) {
      channels.ensurePairChannel(result.targetId, account.id);
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
    if (result.accepted) channels.ensurePairChannel(id, account.id);
    homeNotifier.notify([account.id, id]);
    return { ok: true, accepted: result.accepted };
  });

  fastify.post('/contacts/:id/accept', async (request, reply) => {
    const account = await requireAccount(request, reply);
    if (!account) return;
    const { id } = request.params as { id: string };
    if (!accounts.acceptContact(account.id, id)) {
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
    channels.ensurePairChannel(id, account.id);
    homeNotifier.notify([account.id, id]);
    return { ok: true };
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

  fastify.get('/g/:token', async (request, reply) => {
    const { token } = request.params as { token: string };
    let shell: string;
    try {
      shell = await readFile(join(__dirname, '..', 'web', 'guest.html'), 'utf8');
    } catch {
      return reply.code(503).send({ error: 'The guest page is not available.' });
    }
    reply.type('text/html; charset=utf-8');
    // The one interpolation on the page, into an attribute, escaped — the
    // token is 24 bytes of base64url and cannot contain a quote, and that is
    // an argument for why this is cheap rather than for skipping it.
    return shell.replace('data-link=""', `data-link="${escapeHtml(token)}"`);
  });

  /**
   * The privacy policy, which App Store Connect will not accept a submission
   * without.
   *
   * Unauthenticated and served as HTML, because the people who need to read it
   * are a reviewer with a browser and anybody deciding whether to sign up.
   */
  fastify.get('/privacy', async (_request, reply) => {
    reply.type('text/html; charset=utf-8');
    return privacyPage({
      contactEmail: options.contactEmail,
      // Named on the page only where the server can actually reach it. See
      // PolicyOptions.transcription.
      transcription: options.transcription?.name,
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
  fastify.get('/support', async (_request, reply) => {
    reply.type('text/html; charset=utf-8');
    return supportPage(options.contactEmail);
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
   * when it opens. The same argument the protocol already makes for keeping a
   * bio off PublicAccount.
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
   * Your own profile, and the only way to change it.
   *
   * A partial write: a field left out is left alone, so saving a bio cannot
   * blank a name the client did not happen to send.
   */
  fastify.post('/me', async (request, reply) => {
    const account = await requireAccount(request, reply);
    if (!account) return;

    const body = request.body as
      | { displayName?: unknown; bio?: unknown }
      | undefined;
    const changes: { displayName?: string; bio?: string } = {};
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
    if (body?.bio !== undefined) {
      if (typeof body.bio !== 'string') {
        return reply.code(400).send({ error: 'bio must be text.' });
      }
      changes.bio = body.bio;
    }

    const updated = accounts.updateProfile(account.id, changes);
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
    // this because an acquaintance brought them into a channel gets the bio and
    // nothing about when its author was last about. The fields are simply
    // absent for them, which is the same shape an older server sends and gets
    // the same treatment from the client: no line at all, rather than an empty
    // one.
    //
    // Your own profile is not a contact of yours and so is not exempted here.
    // Nothing is lost: you are the one person whose whereabouts you know.
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
   * opens one — that is the argument the protocol makes for keeping a bio off
   * every roster — so the address appears on their screen the next time they
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
   * when it opens. The same argument the protocol already makes for keeping a
   * bio off `PublicAccount`.
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

  const guestLinkUrl = (request: FastifyRequest, token: string): string =>
    `${origin(request)}/g/${token}`;

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
    if (!result.ok) {
      return reply.code(statusFor(result.code)).send({ error: result.error });
    }
    return { token: result.token, url: options.mediaUrl };
  });

  /**
   * A link to open the watch party on another screen.
   *
   * **The token is in the fragment**, which is the whole of why this returns a
   * URL rather than a token: a fragment is never sent to a server, so it
   * reaches no access log, no `Referer` header and no proxy. The page reads it
   * in JavaScript and sends it exactly once, to the websocket. A caller
   * assembling its own URL is a caller who might put it in the query string.
   */
  fastify.post('/channels/:id/watch-token', async (request, reply) => {
    const account = await requireAccount(request, reply);
    if (!account) return;
    const { id } = request.params as { id: string };

    const result = channels.watchToken(id, account.id);
    if (!result.ok) {
      return reply.code(statusFor(result.code)).send({ error: result.error });
    }
    return { url: `${origin(request)}/watch/${id}#${result.token}` };
  });

  /**
   * The follower page.
   *
   * Unauthenticated, necessarily and harmlessly — the credential is in the
   * fragment, which by construction never arrives here. This route answers the
   * same page for a live link and a dead one, exactly as `/g/:token` does, and
   * the refusal arrives a moment later over the socket with a reason. Nothing
   * is handed out: the page is a static document that knows a channel id,
   * which is not a secret and never was.
   */
  fastify.get('/watch/:channelId', async (request, reply) => {
    const { channelId } = request.params as { channelId: string };
    reply.type('text/html; charset=utf-8');
    return watchPage({ channelId });
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

      // Under the server's own temp directory, one per track, so removing it
      // when the channel ends takes the file with it and nothing else.
      // The pid is in the name so that a later boot can tell which of these
      // directories are orphans and which belong to a process that is still
      // using them — see ChannelRegistry.restore, which sweeps the dead ones.
      const dir = await mkdtemp(join(tmpdir(), `thefloor-track-${process.pid}-`));
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

    // Under the server's own temp directory, one per track, named with the pid
    // so a later boot can tell an orphan from a directory still in use — the
    // same convention an uploaded track follows, because this becomes one.
    const dir = await mkdtemp(join(tmpdir(), `thefloor-track-${process.pid}-`));
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
    return {
      ok: true,
      audio: options.media ? 'livekit' : 'none',
      commit: deployed()?.commit ?? 'unknown',
      minBuild: MIN_SUPPORTED_BUILD,
      oldestBuild: builds.oldest,
      silentBuilds: builds.silent,
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
      ...transcriptViewOf(row, userId),
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
      // Still sent, though the app now shows recordings on the channel they
      // were made in. Build 20 and earlier render this list on Home and would
      // otherwise lose them at a server deploy, a release ahead of the build
      // that stops reading it. See planning/BACKLOG.md.
      recordings: channels.recordingsFor(userId).map((row) =>
        toRecordingView(row, userId)
      ),
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
      now,
      homeNotifier,
      reachability,
      preferences,
      mediaUrl: options.mediaUrl,
    });
  });

  return { fastify, db, accounts, channels, devices, donations, transcripts };
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
