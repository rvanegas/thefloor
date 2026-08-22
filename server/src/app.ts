import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, extname, join } from 'node:path';
import Fastify, { type FastifyInstance, type FastifyRequest } from 'fastify';
import websocket from '@fastify/websocket';
import type {
  HomeView,
  PublicAccount,
  RecordingView,
} from '../../core/protocol';
import { describeChannel } from '../../core/naming';
import { Accounts } from './accounts';
import { openDb, type AccountRow, type Db, type RecordingRow } from './db';
import { Devices, type DevicePlatform } from './devices';
import { Donations } from './donations';
import { RECORDING_CONTENT_TYPE } from './export';
import { isEmailAddress, type Mailer } from './mail';
import type { MediaServer } from './media';
import { probeDurationMs, UnreadableAudioError } from './playback';
import { privacyPage } from './privacy';
import {
  BUILD_HEADER,
  claimedBuild,
  deployed,
  MIN_SUPPORTED_BUILD,
} from './release';
import { supportPage } from './support';
import { donationsVisibleFor } from './region';
import { ChannelRegistry, type RefusalCode } from './channels';
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
   */
  review?: { identifier: string; code: string };
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
}

export interface App {
  fastify: FastifyInstance;
  db: Db;
  accounts: Accounts;
  channels: ChannelRegistry;
  devices: Devices;
  donations: Donations;
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
  const pusher = options.pusher ?? new ConsolePusher(() => {});
  const pushNotifier = createPushNotifier();

  /**
   * Turns "these people should know" into notifications actually sent.
   *
   * Three filters, in this order, and the order is the point: drop anyone
   * already looking at the app, look up where the rest can be reached, and
   * forget every address Apple says is dead. The registry supplies none of
   * this — it knows only that something happened.
   *
   * Deliberately not awaited. A notification is a courtesy, and a channel
   * transition must not wait on Apple or fail because of it.
   */
  pushNotifier.notify = (userIds, message) => {
    const away = userIds.filter((id) => !reachability.inApp(id));
    const tokens = devices.tokensFor(away);
    // Logged even when nothing is sent, and with the reason it was not. The
    // two ways of sending nothing — everybody is already looking, and nobody
    // has registered a device — are indistinguishable from a delivery failure
    // otherwise, which is exactly the confusion this feature shipped with.
    if (tokens.length === 0) {
      fastify.log.info(
        {
          channelId: message.channelId,
          asked: userIds.length,
          away: away.length,
          why: away.length === 0 ? 'all reachable in-app' : 'no registered devices',
        },
        'push skipped'
      );
      return;
    }
    void pusher
      .send(tokens, message)
      .then((results) => {
        for (const result of results) {
          if (result.dead) devices.forget(result.token);
        }
        const failed = results.filter((r) => r.status !== 200);
        fastify.log.info(
          {
            channelId: message.channelId,
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

    // Signing in has just ended every other session this account had —
    // `issueToken` revokes them, one session per account being deliberate. The
    // addresses those sessions were reachable at have to go with them, or the
    // phone that was signed out keeps receiving this account's notifications
    // for the life of the database.
    //
    // It cannot be done by the device being signed out. That device learns it
    // is finished when a request comes back 401, at which point it holds no
    // credential it could deregister with — so the moment it most needs to say
    // "stop sending to me" is the one moment it cannot. Which leaves here.
    //
    // Every row rather than every row but one, because the device signing in
    // registers its own address moments later, from the client. The account is
    // briefly reachable nowhere, which is the right way to be wrong: silence
    // for a second beats notifications to a phone somebody was signed out of.
    devices.forgetAccount(result.account.id);

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
    // Only the device signing out. That used to be justified by not silencing
    // a tablet, which was reasoning about a state `issueToken` forbids — one
    // session per account means the tablet cannot be signed in at the same
    // time. It stands for a plainer reason: this is the address that asked to
    // be forgotten, and it is the only one the account should have.
    if (account && body?.deviceToken) devices.forget(body.deviceToken);

    const header = request.headers.authorization;
    if (header?.startsWith('Bearer ')) accounts.revokeToken(header.slice(7));
    return reply.code(204).send();
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

    devices.register(token, account.id, platform as DevicePlatform, now());
    return { ok: true };
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

  /**
   * The privacy policy, which App Store Connect will not accept a submission
   * without.
   *
   * Unauthenticated and served as HTML, because the people who need to read it
   * are a reviewer with a browser and anybody deciding whether to sign up.
   */
  fastify.get('/privacy', async (_request, reply) => {
    reply.type('text/html; charset=utf-8');
    return privacyPage(options.contactEmail);
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
    const profile = allowed ? accounts.profile(id, account.id) : null;
    if (!profile) return reply.code(404).send({ error: 'No such profile.' });

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
    return {
      ...profile,
      inApp: reachability.inApp(id),
      lastSeenAt: accounts.lastSeenAt(id),
    };
  });

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
   * Shuts one link. Anybody in the channel may, not only whoever minted it: a
   * door onto a conversation is everybody's business.
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
    if (!result.ok) return reply.code(404).send({ error: result.error });
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
    // **`silentBuilds` is not a footnote.** It counts accounts active in the
    // window whose build is unknown, which for now is everybody — every build
    // up to 36 says nothing. While it is above zero, `oldestBuild` is a floor
    // on the *known* population and not on the real one, and a shim must not
    // be deleted on the strength of it. It reaching zero is the event that
    // makes this number mean what it looks like it means.
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
    };
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
      mediaUrl: options.mediaUrl,
    });
  });

  return { fastify, db, accounts, channels, devices, donations };
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
