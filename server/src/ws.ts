import type { FastifyInstance } from 'fastify';
import type { WebSocket } from 'ws';
import {
  HEARTBEAT_INTERVAL_MS,
  HEARTBEAT_TIMEOUT_MS,
} from '../../core/constants';
import { otherParty } from '../../core/session';
import type {
  ClientMessage,
  HomeView,
  ServerMessage,
} from '../../core/protocol';
import type { Accounts } from './accounts';
import type { SessionRegistry } from './sessions';

interface Connection {
  socket: WebSocket;
  userId: string;
  /**
   * The credential this socket was accepted on, kept so it can be re-checked.
   *
   * Authenticating once at connect was enough while a token only died by
   * expiring after ninety days. Now that signing in elsewhere revokes it, a
   * socket can outlive its own authorisation — and this one holds a live
   * conversation with an open microphone, so it is not something to leave
   * running until the client happens to reconnect.
   */
  token: string;
  watchingHome: boolean;
  watchingSessions: Set<string>;
  /** When anything was last heard from this client. */
  lastSeen: number;
}

/** Close code for a credential the server will not accept. */
const UNAUTHORIZED_CLOSE = 4401;

/**
 * Lets non-session code (contact changes, which arrive over HTTP) push Home to
 * the people affected. Created before the websocket plugin has loaded, so it
 * starts as a no-op and is filled in when the socket layer registers.
 */
export interface HomeNotifier {
  notify: (userIds: string[]) => void;
}

export function createHomeNotifier(): HomeNotifier {
  return { notify: () => {} };
}

/**
 * Realtime fan-out. Clients never compute session state — they watch it. Every
 * snapshot carries the server's clock, so countdowns run against one authority
 * rather than each device's own idea of the time.
 */
export function registerWebsocket(deps: {
  fastify: FastifyInstance;
  accounts: Accounts;
  sessions: SessionRegistry;
  homeFor: (userId: string) => HomeView;
  now: () => number;
  homeNotifier: HomeNotifier;
}): void {
  const { fastify, accounts, sessions, homeFor, now, homeNotifier } = deps;
  const connections = new Set<Connection>();

  /** Whether this user still has any live socket. */
  const hasConnection = (userId: string): boolean =>
    [...connections].some((c) => c.userId === userId);

  /**
   * Closes connections that have gone quiet.
   *
   * A TCP connection can die without either end being told — no close arrives,
   * and the socket sits half-open until the OS gives up, which is hours by
   * default. Left to that, nothing downstream works: the grace period never
   * starts, so nobody is removed, so a session never empties, never auto-ends,
   * and a recording bills indefinitely against two egresses.
   *
   * Closing the socket is enough; its close handler does the reporting, which
   * keeps one path for every kind of departure.
   */
  const sweep = setInterval(() => {
    const cutoff = now() - HEARTBEAT_TIMEOUT_MS;
    for (const connection of connections) {
      if (connection.lastSeen < cutoff) {
        connection.socket.close();
        continue;
      }
      // Re-checked here rather than pushed from the revocation, so there is
      // one place that decides a socket is no longer authorised and no wiring
      // between accounts and transport. The client is told before the close:
      // 4401 alone is enough for it to stop reconnecting, but the message is
      // what it can put on screen.
      if (!accounts.accountForToken(connection.token, now())) {
        send(connection, {
          type: 'error',
          message: 'Signed in on another device.',
          code: 'unauthorized',
        });
        connection.socket.close(UNAUTHORIZED_CLOSE, 'Unauthorized');
      }
    }
  }, HEARTBEAT_INTERVAL_MS);
  sweep.unref?.();
  fastify.addHook('onClose', async () => clearInterval(sweep));

  function send(connection: Connection, message: ServerMessage): void {
    if (connection.socket.readyState === 1) {
      connection.socket.send(JSON.stringify(message));
    }
  }

  function pushSession(connection: Connection, sessionId: string): void {
    const session = sessions.viewableBy(sessionId, connection.userId);
    if (!session) {
      send(connection, { type: 'session.gone', sessionId });
      connection.watchingSessions.delete(sessionId);
      return;
    }
    const other = accounts.public(otherParty(session, connection.userId));
    if (!other) return;
    send(connection, {
      type: 'session',
      view: { session, other, serverNow: now() },
    });
  }

  function pushHome(connection: Connection): void {
    send(connection, { type: 'home', home: homeFor(connection.userId) });
  }

  // Contact changes arrive over HTTP and touch two people's Home lists: the
  // requester's and the recipient's. Without this the recipient learns nothing
  // until they happen to reload — a request simply never appears.
  homeNotifier.notify = (userIds) => {
    for (const connection of connections) {
      if (connection.watchingHome && userIds.includes(connection.userId)) {
        pushHome(connection);
      }
    }
  };

  // Any session change can alter both parties' Home (an invite appears, a
  // rejoinable session shows up), so both views refresh together.
  sessions.onChange((changedIds) => {
    for (const connection of connections) {
      for (const sessionId of changedIds) {
        if (connection.watchingSessions.has(sessionId)) {
          pushSession(connection, sessionId);
        }
      }
      if (connection.watchingHome) pushHome(connection);
    }
  });

  fastify.get('/ws', { websocket: true }, (socket, request) => {
    const url = new URL(request.url, 'http://localhost');
    const token =
      url.searchParams.get('token') ??
      (request.headers.authorization?.startsWith('Bearer ')
        ? request.headers.authorization.slice(7)
        : undefined);

    const account = token ? accounts.accountForToken(token, now()) : undefined;
    // `!token` is redundant — no token means no account — but it is what lets
    // the connection below keep the credential as a plain string.
    if (!token || !account) {
      socket.send(
        JSON.stringify({
          type: 'error',
          message: 'Unauthorized',
          code: 'unauthorized',
        } satisfies ServerMessage)
      );
      socket.close(UNAUTHORIZED_CLOSE, 'Unauthorized');
      return;
    }

    const connection: Connection = {
      socket,
      userId: account.id,
      token,
      watchingHome: false,
      watchingSessions: new Set(),
      lastSeen: now(),
    };
    connections.add(connection);

    // Any session this user is already in now has a live connection again,
    // cancelling a grace period they may be part-way through.
    for (const session of sessions.sessionsFor(account.id)) {
      sessions.report(session, account.id, 'CONNECTED');
    }

    send(connection, {
      type: 'hello',
      account: { id: account.id, displayName: account.display_name },
      serverNow: now(),
    });

    socket.on('message', (raw: Buffer | string) => {
      // Any message is proof of life, not only a heartbeat.
      connection.lastSeen = now();

      let message: ClientMessage;
      try {
        message = JSON.parse(String(raw)) as ClientMessage;
      } catch {
        send(connection, { type: 'error', message: 'Malformed message.' });
        return;
      }

      switch (message.type) {
        case 'ping':
          send(connection, { type: 'pong', serverNow: now() });
          return;

        case 'watch.home':
          connection.watchingHome = true;
          pushHome(connection);
          return;

        case 'watch.session':
          connection.watchingSessions.add(message.sessionId);
          // Watching is itself proof of a connection to this session, which
          // matters on a reconnect: the socket is new, so nothing has told the
          // session its owner is reachable again.
          sessions.report(message.sessionId, connection.userId, 'CONNECTED');
          pushSession(connection, message.sessionId);
          return;

        case 'unwatch.session':
          connection.watchingSessions.delete(message.sessionId);
          return;

        case 'session.action': {
          // The actor comes from the authenticated connection, never the
          // payload — a client cannot act as the other party.
          const result = sessions.dispatch(
            message.sessionId,
            connection.userId,
            message.action
          );
          if (!result.ok) {
            send(connection, { type: 'error', message: result.error });
            return;
          }
          connection.watchingSessions.add(message.sessionId);
          pushSession(connection, message.sessionId);
          return;
        }

        default:
          send(connection, { type: 'error', message: 'Unknown message type.' });
      }
    });

    socket.on('close', () => {
      connections.delete(connection);
      // Losing a socket is not leaving a session. It starts the grace period,
      // and reconnecting inside that minute cancels it — so a tunnel, a lift
      // or a backgrounded app costs nobody their place.
      //
      // Deleting the connection first matters: `hasConnection` must not count
      // the one that is closing. And a socket that dies *after* its
      // replacement has connected reports nothing at all, which is what stops
      // a dead connection evicting a user who is demonstrably back.
      for (const sessionId of connection.watchingSessions) {
        if (!hasConnection(connection.userId)) {
          sessions.report(sessionId, connection.userId, 'DISCONNECTED');
        }
      }
    });
  });
}
