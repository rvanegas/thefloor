import Fastify, { type FastifyInstance, type FastifyRequest } from 'fastify';
import websocket from '@fastify/websocket';
import type { HomeView, PublicAccount } from '../../core/protocol';
import { Accounts } from './accounts';
import { openDb, type AccountRow, type Db } from './db';
import { encodeRecording } from './export';
import { isEmailAddress, type Mailer } from './mail';
import type { MediaServer } from './media';
import { SessionRegistry } from './sessions';
import type { RecordingStore } from './storage';
import { createHomeNotifier, registerWebsocket } from './ws';

export interface BuildOptions {
  dbPath?: string;
  /**
   * Accepts ANY code as valid, signing in whoever is asked for. This exists
   * because there is no SMS or email transport yet, so no real user could
   * otherwise receive a code. It is a complete authentication bypass — anyone
   * can become anyone — and is refused outright in production (see index.ts).
   */
  authBypass?: boolean;
  /** Delivers one-time codes. Without one, only the bypass can sign anyone in. */
  mailer?: Mailer;
  /** Carries audio and enforces the floor as an actual mute. */
  media?: MediaServer;
  /** The wss:// URL clients should connect to. Sent alongside a join token. */
  mediaUrl?: string;
  /** Read access to the recordings bucket, for encoding an export. */
  store?: RecordingStore;
  /** Grace period before an ended session's audio room is torn down. */
  roomCloseGraceMs?: number;
  now?: () => number;
  logger?: boolean;
}

export interface App {
  fastify: FastifyInstance;
  db: Db;
  accounts: Accounts;
  sessions: SessionRegistry;
}

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

  // Filled in once the websocket plugin loads; a no-op until then.
  const homeNotifier = createHomeNotifier();
  const sessions = new SessionRegistry(
    db,
    accounts,
    now,
    options.media,
    (error, context) =>
      fastify.log.error({ err: error, context }, 'media operation failed'),
    options.roomCloseGraceMs
  );

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

    if (options.authBypass) {
      // Nothing is sent and nothing is checked; any code will be accepted.
      return { sent: true, bypass: true };
    }

    if (!isEmailAddress(identifier)) {
      // Phone numbers are a real identifier for this app, but nothing can
      // deliver to one yet. Saying so plainly beats accepting the request and
      // silently never sending.
      return reply.code(400).send({
        error: 'Text messages are not available yet — use an email address.',
        code: 'sms_unavailable',
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

    const result = options.authBypass
      ? accounts.establish(body.identifier, body.displayName, now())
      : accounts.verifyCode(body.identifier, body.code, body.displayName, now());
    // One message for every failure mode, so this cannot be used to discover
    // which identifiers have accounts.
    if (!result) return reply.code(401).send({ error: 'Invalid or expired code.' });

    return {
      token: result.token,
      account: toPublic(result.account),
    };
  });

  fastify.post('/auth/sign-out', async (request, reply) => {
    const header = request.headers.authorization;
    if (header?.startsWith('Bearer ')) accounts.revokeToken(header.slice(7));
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
    homeNotifier.notify([account.id, result.targetId]);
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

  fastify.get('/home', async (request, reply) => {
    const account = await requireAccount(request, reply);
    if (!account) return;
    return homeFor(account.id);
  });

  // --- Sessions -----------------------------------------------------------

  fastify.post('/sessions', async (request, reply) => {
    const account = await requireAccount(request, reply);
    if (!account) return;
    const body = request.body as { contactId?: string } | undefined;
    if (!body?.contactId) {
      return reply.code(400).send({ error: 'contactId is required' });
    }

    const result = sessions.create(account.id, body.contactId);
    if (!result.ok) return reply.code(400).send({ error: result.error });
    return { sessionId: result.session.id };
  });

  /**
   * A join credential for the session's audio room. Minted per participant and
   * short-lived, and refused to anyone who is not in the session — the room
   * name is the session id, so this is the only thing standing between knowing
   * an id and listening in.
   */
  fastify.post('/sessions/:id/media-token', async (request, reply) => {
    const account = await requireAccount(request, reply);
    if (!account) return;
    const { id } = request.params as { id: string };

    const result = await sessions.mediaToken(id, account.id);
    if (!result.ok) {
      return reply.code(result.error === 'Not your session.' ? 403 : 400).send({
        error: result.error,
      });
    }
    return { token: result.token, url: options.mediaUrl };
  });

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
          initiator_id: string;
          invitee_id: string;
          stems: string | null;
          floor_timeline: string | null;
        }
      | undefined;

    // Absent and not-yours are the same answer: knowing a recording exists is
    // itself something only its participants should learn.
    if (
      !row ||
      (row.initiator_id !== account.id && row.invitee_id !== account.id)
    ) {
      return reply.code(404).send({ error: 'No such recording.' });
    }
    if (!options.store) {
      return reply.code(503).send({ error: 'Recording storage is not configured.' });
    }

    const stems = row.stems ? JSON.parse(row.stems) : {};
    const timeline = row.floor_timeline ? JSON.parse(row.floor_timeline) : [];
    if (Object.keys(stems).length === 0) {
      // Recorded before per-participant capture existed, so the floor cannot be
      // applied to it. Refusing beats handing over audio that may contain
      // remarks the other party was not permitted to hear.
      return reply.code(409).send({
        error: 'This recording predates per-speaker capture and cannot be exported.',
        code: 'legacy_recording',
      });
    }

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
    authBypass: options.authBypass === true,
    audio: options.media ? 'livekit' : 'none',
  }));

  // --- Shared views -------------------------------------------------------

  function homeFor(userId: string): HomeView {
    return {
      invites: sessions.invitesFor(userId),
      rejoinable: sessions.rejoinableFor(userId),
      contacts: accounts.contactsFor(userId).map((entry) => ({
        account: toPublic(entry.account),
        status: entry.status as 'accepted' | 'outgoing' | 'incoming',
      })),
      recordings: sessions.recordingsFor(userId).map((row) => {
        const otherId =
          row.initiator_id === userId ? row.invitee_id : row.initiator_id;
        return {
          id: row.id,
          sessionId: row.session_id,
          other: accounts.public(otherId),
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
      sessions,
      homeFor,
      now,
      homeNotifier,
    });
  });

  return { fastify, db, accounts, sessions };
}

export function toPublic(row: AccountRow): PublicAccount {
  return { id: row.id, displayName: row.display_name };
}
