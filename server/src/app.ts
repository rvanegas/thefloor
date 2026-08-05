import Fastify, { type FastifyInstance, type FastifyRequest } from 'fastify';
import websocket from '@fastify/websocket';
import type { HomeView, PublicAccount } from '../../core/protocol';
import { Accounts } from './accounts';
import { openDb, type AccountRow, type Db } from './db';
import { SessionRegistry } from './sessions';
import { registerWebsocket } from './ws';

export interface BuildOptions {
  dbPath?: string;
  /** Returns OTP codes in the response instead of delivering them. Dev only. */
  exposeCodes?: boolean;
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
  const sessions = new SessionRegistry(db, accounts, now);

  const fastify = Fastify({ logger: options.logger ?? false });

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

    const code = accounts.issueCode(identifier, now());
    // No transport yet. Logging it is what makes development possible, and is
    // exactly what must be replaced before this is reachable by real users.
    fastify.log.info({ identifier, code }, 'issued one-time code');
    if (options.exposeCodes) {
      return { sent: true, devCode: code };
    }
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
    return { ok: true, accepted: result.accepted };
  });

  fastify.post('/contacts/:id/accept', async (request, reply) => {
    const account = await requireAccount(request, reply);
    if (!account) return;
    const { id } = request.params as { id: string };
    if (!accounts.acceptContact(account.id, id)) {
      return reply.code(400).send({ error: 'No pending request from that user.' });
    }
    return { ok: true };
  });

  fastify.post('/contacts/:id/decline', async (request, reply) => {
    const account = await requireAccount(request, reply);
    if (!account) return;
    const { id } = request.params as { id: string };
    if (!accounts.declineContact(account.id, id)) {
      return reply.code(400).send({ error: 'No pending request.' });
    }
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

  fastify.get('/healthz', async () => ({ ok: true }));

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
    registerWebsocket({ fastify: instance, accounts, sessions, homeFor, now });
  });

  return { fastify, db, accounts, sessions };
}

export function toPublic(row: AccountRow): PublicAccount {
  return { id: row.id, displayName: row.display_name };
}
