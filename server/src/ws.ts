import type { FastifyInstance } from 'fastify';
import type { WebSocket } from 'ws';
import {
  HEARTBEAT_INTERVAL_MS,
  HEARTBEAT_TIMEOUT_MS,
} from '../../core/constants';
import type {
  ClientMessage,
  HomeView,
  PublicAccount,
  RecordingView,
  ServerMessage,
} from '../../core/protocol';
import type { Accounts } from './accounts';
import type { ChannelRegistry } from './channels';
import { claimedBuild } from './release';

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
  watchingChannels: Set<string>;
  /** When anything was last heard from this client. */
  lastSeen: number;
  /**
   * The build this socket announced at connect, or null if it announced none.
   *
   * Held on the connection rather than re-read per message because it cannot
   * change without a reconnect — a new build is a new process — and because
   * every `markSeen` this socket causes should agree about it. See
   * `Accounts.buildsSeenSince`.
   */
  build: number | null;
}

/** Close code for a credential the server will not accept. */
const UNAUTHORIZED_CLOSE = 4401;

/**
 * Lets non-channel code (contact changes, which arrive over HTTP) push Home to
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
 * Whether this person is reachable inside the app right now.
 *
 * The one thing push delivery needs from the socket layer: somebody holding a
 * live connection is already being told everything as it happens, so sending
 * them a notification as well is a second copy of what is on their screen.
 * Shaped like `HomeNotifier` and for the same reason — the code that asks
 * exists before the socket plugin does, so it starts answering "no", which is
 * the safe default: it means a push is sent rather than swallowed.
 */
export interface Reachability {
  inApp: (userId: string) => boolean;
}

export function createReachability(): Reachability {
  return { inApp: () => false };
}

/**
 * Realtime fan-out. Clients never compute channel state — they watch it. Every
 * snapshot carries the server's clock, so countdowns run against one authority
 * rather than each device's own idea of the time.
 */
export function registerWebsocket(deps: {
  fastify: FastifyInstance;
  accounts: Accounts;
  channels: ChannelRegistry;
  homeFor: (userId: string) => HomeView;
  recordingsInChannel: (channelId: string, userId: string) => RecordingView[];
  now: () => number;
  homeNotifier: HomeNotifier;
  reachability: Reachability;
}): void {
  const {
    fastify,
    accounts,
    channels,
    homeFor,
    recordingsInChannel,
    now,
    homeNotifier,
    reachability,
  } = deps;
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
   * starts, so nobody is removed, so a channel never empties, never auto-ends,
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

  function pushChannel(connection: Connection, channelId: string): void {
    const channel = channels.viewableBy(channelId, connection.userId);
    if (!channel) {
      send(connection, { type: 'channel.gone', channelId });
      connection.watchingChannels.delete(channelId);
      return;
    }
    // Per id rather than all-or-nothing: one unresolvable account must not
    // cost everyone else their snapshot.
    const participants = channel.participants
      .map((id) => accounts.public(id))
      .filter((account): account is PublicAccount => !!account);
    send(connection, {
      type: 'channel',
      view: {
        channel,
        participants,
        recordings: recordingsInChannel(channelId, connection.userId),
        serverNow: now(),
      },
    });
  }

  function pushHome(connection: Connection): void {
    send(connection, { type: 'home', home: homeFor(connection.userId) });
  }

  // Contact changes arrive over HTTP and touch two people's Home lists: the
  // requester's and the recipient's. Without this the recipient learns nothing
  // until they happen to reload — a request simply never appears.
  reachability.inApp = hasConnection;

  homeNotifier.notify = (userIds) => {
    for (const connection of connections) {
      if (connection.watchingHome && userIds.includes(connection.userId)) {
        pushHome(connection);
      }
    }
  };

  /**
   * A conversation that has changed channels, told only to the people it took
   * with it, and only where they were watching the channel it left.
   *
   * The watch is deliberately *not* switched here. Which channel a client is
   * looking at is the client's to decide — it is the end that knows whether
   * this person is standing in the conversation or merely has the screen open
   * — and a server that moved the subscription would also be telling clients
   * built before this message existed to render a channel they never asked
   * for, while their taps went on naming the old one.
   */
  channels.onMove(({ from, to, userIds }) => {
    for (const connection of connections) {
      if (!userIds.includes(connection.userId)) continue;
      if (!connection.watchingChannels.has(from)) continue;
      send(connection, { type: 'channel.moved', from, to });
    }
  });

  // Any channel change can alter both parties' Home (an invite appears, a
  // rejoinable channel shows up), so both views refresh together.
  channels.onChange((changedIds) => {
    for (const connection of connections) {
      for (const channelId of changedIds) {
        if (connection.watchingChannels.has(channelId)) {
          pushChannel(connection, channelId);
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
      watchingChannels: new Set(),
      lastSeen: now(),
      build: claimedBuild(url.searchParams.get('build')),
    };
    connections.add(connection);
    // Having the app open is exactly this: a live socket. Stamped as it opens
    // so somebody who connects and says nothing still counts as here.
    accounts.markSeen(account.id, now(), connection.build);

    // Deliberately nothing about presence here.
    //
    // This used to report CONNECTED for every channel the account was present
    // in, cancelling any grace period in progress. It meant that *opening a
    // socket* — by any process, for any reason — asserted that the user was
    // still in the room. A reinstalled app connecting within the grace minute
    // therefore inherited a presence it knew nothing about, could not act on,
    // and would never give up, because every reconnection renewed it.
    //
    // A client that really is in a channel says so: `watch.channel` reports
    // CONNECTED, and the reconnect path re-sends ENTER besides. Both are
    // assertions from a process that knows where it is, which is the only
    // thing that should be able to hold somebody in a room. A process that
    // asserts neither lets the grace run out and is stepped out, which is the
    // truth about it.
    send(connection, {
      type: 'hello',
      account: { id: account.id, displayName: account.display_name },
      serverNow: now(),
    });

    socket.on('message', (raw: Buffer | string) => {
      // Any message is proof of life, not only a heartbeat.
      connection.lastSeen = now();
      // The same proof, written down. This is what keeps "last seen" true for
      // a socket that has been open for hours: without it the stored time
      // would be when they connected, and somebody talking right now would
      // read as having been away since this morning.
      accounts.markSeen(connection.userId, connection.lastSeen, connection.build);

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

        case 'watch.channel':
          connection.watchingChannels.add(message.channelId);
          // Watching is itself proof of a connection to this channel, which
          // matters on a reconnect: the socket is new, so nothing has told the
          // channel its owner is reachable again.
          channels.report(message.channelId, connection.userId, 'CONNECTED');
          pushChannel(connection, message.channelId);
          return;

        case 'unwatch.channel':
          connection.watchingChannels.delete(message.channelId);
          return;

        case 'channel.action': {
          // The actor comes from the authenticated connection, never the
          // payload — a client cannot act as the other party.
          const result = channels.dispatch(
            message.channelId,
            connection.userId,
            message.action
          );
          if (!result.ok) {
            send(connection, { type: 'error', message: result.error });
            return;
          }
          connection.watchingChannels.add(message.channelId);
          pushChannel(connection, message.channelId);
          return;
        }

        default:
          send(connection, { type: 'error', message: 'Unknown message type.' });
      }
    });

    socket.on('close', () => {
      connections.delete(connection);
      // The moment they stopped being in the app, which is the one this is
      // read for. Written before the presence reporting below, so a snapshot
      // pushed as a result of it already carries the right time.
      accounts.markSeen(connection.userId, now(), connection.build);
      // Losing a socket is not leaving a channel. It starts the grace period,
      // and reconnecting inside that minute cancels it — so a tunnel, a lift
      // or a backgrounded app costs nobody their place.
      //
      // Deleting the connection first matters: `hasConnection` must not count
      // the one that is closing. And a socket that dies *after* its
      // replacement has connected reports nothing at all, which is what stops
      // a dead connection evicting a user who is demonstrably back.
      for (const channelId of connection.watchingChannels) {
        if (!hasConnection(connection.userId)) {
          channels.report(channelId, connection.userId, 'DISCONNECTED');
        }
      }
    });
  });
}
