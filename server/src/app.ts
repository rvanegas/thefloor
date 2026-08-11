import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, extname, join } from 'node:path';
import Fastify, { type FastifyInstance, type FastifyRequest } from 'fastify';
import websocket from '@fastify/websocket';
import type { HomeView, PublicAccount } from '../../core/protocol';
import { Accounts } from './accounts';
import { openDb, type AccountRow, type Db } from './db';
import { Devices, type DevicePlatform } from './devices';
import { encodeRecording } from './export';
import { isEmailAddress, type Mailer } from './mail';
import type { MediaServer } from './media';
import { probeDurationMs, UnreadableAudioError } from './playback';
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
  /** Read access to the recordings bucket, for encoding an export. */
  store?: RecordingStore;
  /** Grace period before an ended channel's audio room is torn down. */
  roomCloseGraceMs?: number;
  /**
   * Reaches a device whose app is not running. Without one, nothing is sent
   * and the in-app path is all there is — which is what it was before push.
   */
  pusher?: Pusher;
  now?: () => number;
  logger?: boolean;
}

export interface App {
  fastify: FastifyInstance;
  db: Db;
  accounts: Accounts;
  channels: ChannelRegistry;
  devices: Devices;
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
  const accounts = new Accounts(db);
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
    if (tokens.length === 0) return;
    void pusher
      .send(tokens, message)
      .then((dead) => {
        for (const token of dead) devices.forget(token);
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
    pushNotifier
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
    // Only the device signing out, not every device on the account: signing
    // out on a phone should not silence a tablet. A device that stops
    // receiving pushes without being told is the failure mode this avoids —
    // and the one that keeps receiving them after sign-out is worse still.
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

    const result = accounts.requestContact(account.id, body.identifier, now());
    if (!result.ok) return reply.code(400).send({ error: result.error });
    // The recipient is the whole point: without telling them, a request simply
    // never appears on their side.
    // No target to notify when the address has no account yet.
    homeNotifier.notify(
      result.targetId ? [account.id, result.targetId] : [account.id]
    );
    return { ok: true, accepted: result.accepted };
  });

  // Withdrawal goes by address, not row id — see Accounts.withdrawRequest for
  // why an id would give away what the empty outgoing id exists to hide.
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
    return accounts.profile(account.id);
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

    const allowed =
      id === account.id ||
      accounts.areContacts(account.id, id) ||
      channels.shareAChannel(account.id, id);
    // Absent and not-allowed answer the same way, so this cannot be used to
    // discover which ids exist.
    const profile = allowed ? accounts.profile(id) : null;
    if (!profile) return reply.code(404).send({ error: 'No such profile.' });
    return profile;
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
    const contactIds =
      body?.contactIds ?? (body?.contactId ? [body.contactId] : undefined);
    if (!contactIds || !Array.isArray(contactIds) || contactIds.length === 0) {
      return reply.code(400).send({ error: 'contactIds is required' });
    }
    if (contactIds.some((id) => typeof id !== 'string')) {
      return reply.code(400).send({ error: 'contactIds is required' });
    }

    const result = channels.create(account.id, contactIds);
    if (!result.ok) return reply.code(400).send({ error: result.error });
    return { channelId: result.channel.id };
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
   * The finished recording, with the floor applied.
   *
   * Encoded per request rather than stored: the stems are the durable artefact
   * and the mix is derived from them, so a change to how the floor is applied
   * takes effect for past recordings too rather than leaving a stale file that
   * lets a silenced remark through.
   */
  fastify.get('/recordings/:id/export', async (request, reply) => {
    const account = await requireAccount(request, reply);
    if (!account) return;
    const { id } = request.params as { id: string };

    const row = db
      .prepare('SELECT * FROM recordings WHERE id = ?')
      .get(id) as
      | {
          participants: string | null;
          stems: string | null;
          floor_timeline: string | null;
        }
      | undefined;

    // Absent and not-yours are the same answer: knowing a recording exists is
    // itself something only its participants should learn. The migration
    // backfills participants for every old row, so membership reads it alone.
    const participants: string[] = row?.participants
      ? JSON.parse(row.participants)
      : [];
    if (!row || !participants.includes(account.id)) {
      return reply.code(404).send({ error: 'No such recording.' });
    }
    if (!options.store) {
      return reply.code(503).send({ error: 'Recording storage is not configured.' });
    }

    const stems = row.stems ? JSON.parse(row.stems) : {};
    const timeline = row.floor_timeline ? JSON.parse(row.floor_timeline) : [];

    try {
      const { data, contentType } = await encodeRecording(
        { stems, timeline },
        (key) => options.store!.get(key)
      );
      return reply
        .header('content-type', contentType)
        .header('content-disposition', `attachment; filename="${id}.ogg"`)
        .send(data);
    } catch (error) {
      request.log.error({ err: error, recording: id }, 'export failed');
      return reply.code(500).send({ error: 'Could not prepare the recording.' });
    }
  });

  fastify.get('/healthz', async () => ({
    ok: true,
    audio: options.media ? 'livekit' : 'none',
  }));

  // --- Shared views -------------------------------------------------------

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
      })),
      recordings: channels.recordingsFor(userId).map((row) => {
        const participants: string[] = row.participants
          ? JSON.parse(row.participants)
          : [row.initiator_id, row.invitee_id];
        return {
          id: row.id,
          channelId: row.channel_id,
          others: participants
            .filter((id) => id !== userId)
            .map((id) => accounts.public(id))
            .filter((account): account is PublicAccount => !!account),
          startedAt: row.started_at,
          durationMs: row.duration_ms,
        };
      }),
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
      now,
      homeNotifier,
      reachability,
    });
  });

  return { fastify, db, accounts, channels, devices };
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
