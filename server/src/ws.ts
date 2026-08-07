import type { FastifyInstance } from 'fastify';
import type { WebSocket } from 'ws';
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
  watchingHome: boolean;
  watchingSessions: Set<string>;
}

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
    if (!account) {
      socket.send(
        JSON.stringify({
          type: 'error',
          message: 'Unauthorized',
          code: 'unauthorized',
        } satisfies ServerMessage)
      );
      socket.close(4401, 'Unauthorized');
      return;
    }

    const connection: Connection = {
      socket,
      userId: account.id,
      watchingHome: false,
      watchingSessions: new Set(),
    };
    connections.add(connection);

    send(connection, {
      type: 'hello',
      account: { id: account.id, displayName: account.display_name },
      serverNow: now(),
    });

    socket.on('message', (raw: Buffer | string) => {
      let message: ClientMessage;
      try {
        message = JSON.parse(String(raw)) as ClientMessage;
      } catch {
        send(connection, { type: 'error', message: 'Malformed message.' });
        return;
      }

      switch (message.type) {
        case 'watch.home':
          connection.watchingHome = true;
          pushHome(connection);
          return;

        case 'watch.session':
          connection.watchingSessions.add(message.sessionId);
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
      // A dropped connection is a leave: the spec treats the two identically,
      // so a holder's floor claim is force-released either way.
      for (const sessionId of connection.watchingSessions) {
        sessions.dispatch(sessionId, connection.userId, { type: 'LEAVE' });
      }
    });
  });
}
