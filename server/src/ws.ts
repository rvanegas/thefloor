import type { FastifyInstance } from 'fastify';
import type { WebSocket } from 'ws';
import {
  HEARTBEAT_INTERVAL_MS,
  HEARTBEAT_TIMEOUT_MS,
} from '../../core/constants';
import type {
  ClientMessage,
  GuestClientMessage,
  GuestServerMessage,
  HomeView,
  PublicAccount,
  RecordingView,
  ServerMessage,
} from '../../core/protocol';
import type { Accounts } from './accounts';
import type { NotificationPreferences } from './preferences';
import type { ChannelRegistry } from './channels';
import { claimedBuild } from './release';

/**
 * What a socket is allowed to be.
 *
 * `session` is a person's app: Home, every channel they belong to, and every
 * action the reducer will take from them. `watch` is a follower page on some
 * other screen — one channel, one action, and no Home.
 *
 * A discriminated union rather than a set of booleans, so that adding a
 * restriction means changing one shape rather than remembering every place
 * that has to ask. Everything below that treats the two differently narrows on
 * `scope.kind` and says why.
 */
type Scope =
  | { kind: 'session' }
  /** The one channel this page may follow, from the credential it arrived on. */
  | { kind: 'watch'; channelId: string };

interface Connection {
  socket: WebSocket;
  userId: string;
  scope: Scope;
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
 * One guest's page, which is a much smaller thing than a member's connection.
 *
 * It watches exactly one channel, has no Home, and holds no token — what it
 * holds is a seat, and the credential for that seat is checked once when the
 * socket opens and then never again, because revoking a *link* deliberately
 * does not end a session already inside. What does end one is ejection or the
 * room emptying, and both of those reach this connection as a change to the
 * channel rather than as a change to a credential.
 */
interface GuestConnection {
  socket: WebSocket;
  /** The link this page arrived with, while it is still at the door. */
  linkToken: string | null;
  /** Their knock, from when they ask until somebody answers. */
  knockId: string | null;
  /** Set on admission. Null while they are still outside. */
  guestId: string | null;
  channelId: string | null;
  lastSeen: number;
  /** What they were last told about their microphone, to notice a change. */
  maySpeak: boolean;
}

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
  preferences: NotificationPreferences;
  /** Where a guest's page should connect for audio. Absent without a media plane. */
  mediaUrl?: string;
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
    preferences,
    mediaUrl,
  } = deps;
  const connections = new Set<Connection>();
  const guestConnections = new Set<GuestConnection>();

  /**
   * Whether this user still has any live socket — meaning the app.
   *
   * Watch-scoped sockets are deliberately not counted. A browser tab left open
   * on a follower page is not somebody having the app open: it would keep
   * `inApp` true on every contact's Home for six hours, and — worse — it would
   * hold the phone's place in a channel, since this is the test the close
   * handler uses before reporting a disconnect. A second screen must not be
   * able to assert that its owner is in the room.
   */
  const hasConnection = (userId: string): boolean =>
    [...connections].some(
      (c) => c.userId === userId && c.scope.kind === 'session'
    );

  /**
   * Tells this account's other devices that they are no longer standing
   * anywhere, because this one has just entered a channel.
   *
   * An account may hold several sessions and is still in at most one channel.
   * The channel half of that is `stepOutOfOthers` in channels.ts, which is
   * about rooms and reaches every channel but the one being entered. This is
   * the device half, and it exists because the room half cannot express it:
   * when the other device is in the *same* channel, the account is present
   * either way, nothing about the channel changes, and no snapshot anybody
   * could push says what has happened. One account has one voice — the media
   * room admits one participant per identity — so the newest session to enter
   * is the one holding it.
   *
   * **Keyed on the token rather than on the socket**, which is the part that
   * is easy to get wrong. A device that is reconnecting has two connections
   * for a moment, the old one not yet closed; displacing by socket would let
   * a flap take the room away from the device somebody is actually holding,
   * and the client clears what it would re-enter when it hears this. A token
   * is a sign-in, which is as close to "a device" as this server knows.
   *
   * Watch-scoped sockets are left alone. A follower page holds a watch token,
   * never a session token, and is a second screen rather than a second place
   * to be — it was never standing anywhere to be displaced from.
   */
  const displaceOtherSessions = (connection: Connection): void => {
    for (const other of connections) {
      if (other.scope.kind !== 'session') continue;
      if (other.userId !== connection.userId) continue;
      if (other.token === connection.token) continue;
      send(other, { type: 'displaced' });
    }
  };

  /**
   * Tells this user's contacts that they have arrived in the app or left it.
   *
   * Called on the two transitions only — the first socket opening and the last
   * one closing — which is the whole delivery cost of the Home indicator.
   * `ContactView.inApp` is a fact rather than a timestamp, so a snapshot
   * carrying it stays true until the fact changes; there is nothing to refresh
   * in between, and no heartbeat and no timer push anything.
   *
   * Accepted contacts only. An incoming request is somebody who can already
   * see the row, and an outgoing one is an address whose `inApp` is withheld
   * anyway — pushing to the latter would spend a snapshot to deliver a field
   * that is deliberately absent.
   */
  const announcePresence = (userId: string): void => {
    homeNotifier.notify(
      accounts
        .contactsFor(userId)
        .filter((contact) => contact.status === 'accepted')
        .map((contact) => contact.account.id)
    );
  };

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
    // Guests first, and for the same reason members are swept: a half-open
    // socket that nobody closes holds somebody in a room they have left, and a
    // guest in a room is somebody the members can be heard by.
    for (const guest of guestConnections) {
      if (guest.lastSeen < cutoff) guest.socket.close();
    }
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
      //
      // Each kind of socket is re-checked against the table it was accepted
      // from. A watch link is not a session and is not reached by signing out
      // of one, so it dies only of its own expiry, which is what the six-hour
      // TTL is sized for.
      const live =
        connection.scope.kind === 'watch'
          ? !!accounts.watchTokenFor(connection.token, now())
          : !!accounts.accountForToken(connection.token, now());
      if (!live) {
        send(connection, {
          type: 'error',
          message:
            connection.scope.kind === 'watch'
              ? 'This watch link has expired.'
              // Not "signed in on another device" any more: since 2026-08-24
              // signing in elsewhere revokes nothing, so the ways to arrive
              // here are a deliberate sign-out of this device from another
              // one, an account deleted, and a token ninety days old. The
              // wording covers all three rather than naming the one that used
              // to produce it almost every time.
              : 'This device was signed out.',
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
        pingableAt: channels.pingWindows(channelId),
        // This connection's own setting and nobody else's. It rides the
        // channel snapshot because that is where it is read and changed, and
        // because a snapshot is already per connection — the same fact that
        // makes `recordings` and `pingableAt` viewer-relative here.
        notificationLevel: preferences.levelFor(connection.userId, channelId),
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

  // `channel.moved` is no longer sent. Conversations do not change channels
  // any more — inviting somebody into an unnamed channel widens it in place —
  // so nothing can produce one. The message stays in `ServerMessage` and the
  // client keeps its handler; removing an inert path from installed builds is
  // worth nothing and costs a release. See planning/DECISIONS.md.

  // Any channel change can alter its participants' Home (an invite appears, a
  // rejoinable channel changes its order or its count), so both views refresh
  // together.
  //
  // The Home half is aimed rather than broadcast, and it did not used to be:
  // this call sat outside the loop over `changedIds`, so every change to any
  // channel pushed a fresh Home to every watcher on the server. Nothing was
  // visibly wrong with that — it was, accidentally, most of what kept the
  // contact rows current — but it made one person's Home accurate in
  // proportion to how busy strangers were, which is not a property anybody
  // chose and not one that survives having users. Presence now arrives on its
  // own transitions, so the broadcast has nothing left to carry.
  //
  // Participants, not the people present: somebody invited is a participant
  // and has yet to enter, and the invitation appearing on their Home is
  // exactly what this delivers.
  //
  // **Plus whoever just left, which the roster no longer names.** Aiming the
  // push is right and the audience was wrong: the survivors of a change are
  // not the people it affected, and a departure is the case where the two come
  // apart completely. Somebody who leaves is removed from `participants`
  // before this runs, and deleting empties it altogether — so the person
  // whose Home certainly changed was the one person guaranteed not to be told,
  // and their card sat there until something unrelated happened to push Home.
  // The broadcast this replaced was hiding it. See planning/DECISIONS.md.
  channels.onChange((changedIds, departed) => {
    for (const channelId of changedIds) {
      for (const connection of connections) {
        if (connection.watchingChannels.has(channelId)) {
          pushChannel(connection, channelId);
        }
      }
      for (const guest of guestConnections) {
        if (guest.channelId === channelId) pushGuest(guest);
      }
      const channel = channels.get(channelId);
      if (channel) {
        homeNotifier.notify([
          ...new Set([...channel.participants, ...departed]),
        ]);
        continue;
      }
      // A change to a channel this registry can no longer describe. Nothing
      // emits one today — an ended channel is kept for thirty seconds and its
      // deletion is silent — so this is a backstop for a future emitter, and
      // it deliberately errs the old way: tell everybody, rather than work out
      // an audience from a channel that is gone and get it wrong.
      for (const connection of connections) {
        if (connection.watchingHome) pushHome(connection);
      }
    }
  });

  function sendGuest(
    connection: GuestConnection,
    message: GuestServerMessage
  ): void {
    if (connection.socket.readyState === 1) {
      connection.socket.send(JSON.stringify(message));
    }
  }

  /**
   * Sends this guest their view, and notices the two things a view cannot say.
   *
   * A guest who is no longer in the channel — ejected, or gone with the last
   * member — has no view to send, and is told and disconnected rather than
   * left holding a page that has quietly stopped updating. And a change in
   * their publish grant is announced separately, because acting on it is a
   * device operation: the page has to open or close a microphone, which no
   * amount of re-rendering does.
   */
  function pushGuest(connection: GuestConnection): void {
    if (!connection.channelId || !connection.guestId) return;
    const view = channels.guestView(connection.channelId, connection.guestId);
    if (!view) {
      sendGuest(connection, {
        type: 'refused',
        reason: 'You are no longer in this channel.',
      });
      connection.socket.close();
      return;
    }
    const maySpeak = view.you.mic === 'open' || view.you.mic === 'muted';
    if (maySpeak !== connection.maySpeak) {
      connection.maySpeak = maySpeak;
      sendGuest(connection, { type: 'speech', maySpeak });
    }
    sendGuest(connection, { type: 'guest', view });
  }

  /**
   * Completes an admission: the seat exists, so hand the page its secret and
   * the credential for the room.
   *
   * The secret is sent exactly once and is never stored in the clear, so a
   * page that loses this message has to knock again — which is why it goes
   * before anything else and is not batched with the view.
   */
  async function admit(
    connection: GuestConnection,
    channelId: string,
    guestId: string,
    secret: string
  ): Promise<void> {
    connection.channelId = channelId;
    connection.guestId = guestId;
    connection.knockId = null;
    const token = await channels.guestMediaToken(channelId, guestId);
    sendGuest(connection, {
      type: 'admitted',
      guestId,
      secret,
      media: token.ok && mediaUrl ? { url: mediaUrl, token: token.token } : null,
    });
    pushGuest(connection);
  }

  /** The page a link opens. One channel, no Home, and no account anywhere. */
  fastify.get('/gws', { websocket: true }, (socket, request) => {
    const url = new URL(request.url, 'http://localhost');
    const linkToken = url.searchParams.get('link');
    const guestId = url.searchParams.get('guest');
    const secret = url.searchParams.get('secret');

    const connection: GuestConnection = {
      socket,
      linkToken,
      knockId: null,
      guestId: null,
      channelId: null,
      lastSeen: now(),
      maySpeak: false,
    };

    const refuse = (reason: string): void => {
      sendGuest(connection, { type: 'refused', reason });
      socket.close(UNAUTHORIZED_CLOSE, 'Unauthorized');
    };

    if (guestId && secret) {
      // A page coming back: after a dropped connection, after a deploy, or
      // after somebody closed the tab and reopened the link. The secret is the
      // whole credential, and it is checked here and nowhere else.
      const resumed = channels.resumeGuest(guestId, secret);
      if (!resumed.ok) {
        refuse(resumed.error);
        return;
      }
      guestConnections.add(connection);
      channels.reportGuest(resumed.channelId, guestId, 'CONNECTED');
      void admit(connection, resumed.channelId, guestId, secret);
    } else if (linkToken) {
      const door = channels.doorFor(linkToken);
      if (!door.ok) {
        refuse(door.error);
        return;
      }
      guestConnections.add(connection);
      sendGuest(connection, {
        type: 'door',
        channelName: door.channelName,
        occupied: door.occupied,
      });
    } else {
      refuse('This link is not valid.');
      return;
    }

    socket.on('message', (raw: Buffer | string) => {
      connection.lastSeen = now();
      let message: GuestClientMessage;
      try {
        message = JSON.parse(String(raw)) as GuestClientMessage;
      } catch {
        sendGuest(connection, { type: 'error', message: 'Malformed message.' });
        return;
      }

      switch (message.type) {
        case 'ping':
          sendGuest(connection, { type: 'pong', serverNow: now() });
          return;

        case 'knock': {
          if (!connection.linkToken || connection.guestId) return;
          const knocked = channels.knock(
            connection.linkToken,
            typeof message.name === 'string' ? message.name : ''
          );
          if (!knocked.ok) {
            sendGuest(connection, { type: 'refused', reason: knocked.error });
            return;
          }
          connection.knockId = knocked.knockId;
          connection.channelId = knocked.channelId;
          sendGuest(connection, { type: 'knocking' });
          return;
        }

        case 'action': {
          if (!connection.guestId || !connection.channelId) {
            sendGuest(connection, {
              type: 'error',
              message: 'You are not in this channel.',
            });
            return;
          }
          const result = channels.dispatchGuest(
            connection.channelId,
            connection.guestId,
            message.action as { type: string; [key: string]: unknown }
          );
          if (!result.ok) {
            sendGuest(connection, { type: 'error', message: result.error });
            return;
          }
          pushGuest(connection);
          return;
        }

        default:
          sendGuest(connection, { type: 'error', message: 'Unknown message type.' });
      }
    });

    socket.on('close', () => {
      guestConnections.delete(connection);
      // A page that gave up at the door takes its knock with it, so nobody is
      // left answering for somebody who is no longer there.
      if (connection.knockId && connection.channelId) {
        channels.withdrawKnock(connection.channelId, connection.knockId);
      }
      // Losing a socket is not leaving, exactly as for a member: the grace
      // period runs, and a page that reconnects inside it keeps its place in
      // the conversation. What removes them is `DISCONNECT_EXPIRED`.
      if (connection.guestId && connection.channelId) {
        channels.reportGuest(
          connection.channelId,
          connection.guestId,
          'DISCONNECTED'
        );
      }
    });
  });

  fastify.get('/ws', { websocket: true }, (socket, request) => {
    const url = new URL(request.url, 'http://localhost');
    const token =
      url.searchParams.get('token') ??
      (request.headers.authorization?.startsWith('Bearer ')
        ? request.headers.authorization.slice(7)
        : undefined);

    // Two tables, tried in that order, and never both for one socket: a watch
    // link is looked up only when the token is not a session, so a credential
    // cannot pick up the other's privileges by being presented at the other's
    // door. Session first because it is the overwhelmingly common case and
    // because it is the wider scope — a token good for both would be a bug,
    // and this order makes it visible rather than silently narrowing.
    const session = token ? accounts.accountForToken(token, now()) : undefined;
    const follower =
      !session && token ? accounts.watchTokenFor(token, now()) : undefined;
    const account = session ?? follower?.account;
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
      scope: follower
        ? { kind: 'watch', channelId: follower.channelId }
        : { kind: 'session' },
      token,
      watchingHome: false,
      watchingChannels: new Set(),
      lastSeen: now(),
      build: claimedBuild(url.searchParams.get('build')),
    };
    // Asked before the add, so it answers about the sockets that were already
    // here: a second device connecting is not an arrival, and announcing one
    // would spend a fan-out saying what every contact already believes.
    const arriving = !hasConnection(account.id);
    connections.add(connection);
    if (connection.scope.kind === 'session') {
      // Having the app open is exactly this: a live socket. Stamped as it opens
      // so somebody who connects and says nothing still counts as here.
      accounts.markSeen(account.id, now(), connection.build);
      // The arrival itself, to whoever has this account as a contact. Without
      // it their Home learns nothing until something unrelated happens to push
      // one, which is how "in the app now" used to mean "as of whenever your
      // last snapshot was".
      if (arriving) announcePresence(account.id);
    }
    // A follower page is neither of those things. It says nothing about
    // whether its owner has the app open — they may be watching from a laptop
    // with the phone face down — so it stamps no clock and announces nothing.
    // Everything below narrows on the scope for the same reason: this socket
    // watches, and every assertion about a person belongs to the one that
    // does not.

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
      // Present only when true, so the field is absent from every hello but
      // one — see the note on ServerMessage. `account` is read fresh here on
      // each connection, so turning the flag on in the database takes effect
      // at the next reconnect rather than needing a restart.
      ...(account.debug === 1 ? { debug: true } : {}),
      // Same shape and the same reasoning: absent unless granted, read fresh
      // per connection, so setting the column by hand takes effect at the next
      // reconnect rather than needing a restart.
      ...(account.leaderboard === 1 ? { leaderboard: true } : {}),
    });

    socket.on('message', (raw: Buffer | string) => {
      // Any message is proof of life, not only a heartbeat.
      connection.lastSeen = now();
      // The same proof, written down. This is what keeps "last seen" true for
      // a socket that has been open for hours: without it the stored time
      // would be when they connected, and somebody talking right now would
      // read as having been away since this morning.
      //
      // Proof of a *page*, though, not of a person, when the scope is watch —
      // so a follower's heartbeat writes nothing. A tab left open on a
      // finished film would otherwise report its owner as in the app all
      // evening, and hold their place in a channel they walked away from.
      if (connection.scope.kind === 'session') {
        accounts.markSeen(
          connection.userId,
          connection.lastSeen,
          connection.build
        );
      }
      // And again per channel, which is a different question with a different
      // answer. `markSeen` says whether this person is in the app at all;
      // this says whether they are still in *that room*, and somebody can be
      // demonstrably in the app and gone from a channel they stepped out of an
      // hour ago. Sent for everything this socket watches and filtered by
      // presence inside the reducer, since watching is not being there.
      //
      // Every message counts, not only `ping`. A client that is claiming the
      // floor or naming the channel is as present as one that is heartbeating,
      // and making this the ping's job would have meant a second thing to
      // remember whenever a message type was added.
      //
      // Not from a follower page, for the reason above and one more: presence
      // is about the room, and this socket is on a different screen in a
      // different room. Somebody who steps out and leaves the laptop running
      // has stepped out.
      if (connection.scope.kind === 'session') {
        for (const channelId of connection.watchingChannels) {
          channels.stillHere(channelId, connection.userId);
        }
      }

      let message: ClientMessage;
      try {
        message = JSON.parse(String(raw)) as ClientMessage;
      } catch {
        send(connection, { type: 'error', message: 'Malformed message.' });
        return;
      }

      // What a follower page may say, in one place rather than as a clause on
      // each case below. It watches its own channel, heartbeats, and reports a
      // duration; everything else is refused, including watching a second
      // channel and every action but one.
      //
      // The page is a *follower*: control lives on the phone, which is what
      // the product says, and stating it here is what makes a leaked link
      // expose what is being watched rather than the ability to change it.
      if (connection.scope.kind === 'watch') {
        const scope = connection.scope;
        const allowed =
          message.type === 'ping' ||
          ((message.type === 'watch.channel' ||
            message.type === 'unwatch.channel') &&
            message.channelId === scope.channelId) ||
          (message.type === 'channel.action' &&
            message.channelId === scope.channelId &&
            message.action.type === 'WATCH_READY');
        if (!allowed) {
          send(connection, {
            type: 'error',
            message: 'This page can only watch.',
            code: 'forbidden',
          });
          return;
        }
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
          //
          // From the app alone. A follower page opening is proof that a
          // browser exists, and cancelling a grace period on the strength of
          // it would let a laptop hold somebody in a room their phone has
          // left — the same failure this call was narrowed to avoid when it
          // was moved off the connect path.
          if (connection.scope.kind === 'session') {
            channels.report(message.channelId, connection.userId, 'CONNECTED');
          }
          pushChannel(connection, message.channelId);
          return;

        case 'unwatch.channel':
          connection.watchingChannels.delete(message.channelId);
          return;

        case 'channel.action': {
          // Answering the door is the one action whose result goes to somebody
          // else's socket: accepting mints an id and a secret, and the page
          // waiting at the door is the only thing that can use them. So it is
          // routed here rather than through `dispatch`, which has no way to
          // reach another connection.
          if (message.action.type === 'ANSWER_KNOCK') {
            const answer = message.action;
            // Found before the answer, because what the connection is holding
            // is the link this knock arrived on — which the seat has to
            // record, or ejecting the guest later closes no door.
            const waiting = [...guestConnections].find(
              (guest) => guest.knockId === answer.knockId
            );
            const answered = channels.answerKnock(
              message.channelId,
              connection.userId,
              answer.knockId,
              answer.accept,
              waiting?.linkToken ?? null
            );
            if (!answered.ok) {
              send(connection, { type: 'error', message: answered.error });
              return;
            }
            for (const guest of guestConnections) {
              if (guest.knockId !== answer.knockId) continue;
              if (answered.admitted) {
                void admit(
                  guest,
                  message.channelId,
                  answered.admitted.session.id,
                  answered.admitted.secret
                );
              } else {
                sendGuest(guest, {
                  type: 'refused',
                  reason: 'Somebody in the channel said no.',
                });
                guest.knockId = null;
                guest.socket.close();
              }
            }
            pushChannel(connection, message.channelId);
            return;
          }
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
          // After the dispatch, so nothing is displaced by an action the
          // registry refused — and on the action rather than on a change of
          // state, because entering a channel this account is already present
          // in changes nothing and is exactly the case that needs saying. See
          // `displaceOtherSessions`.
          if (message.action.type === 'ENTER') {
            displaceOtherSessions(connection);
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
      // A follower page closing is a tab closing. It asserted nothing about
      // presence while it was open — see the connect path — so there is
      // nothing to withdraw, and reporting a disconnect here would step
      // somebody out of a channel they are sitting in with the phone in their
      // hand.
      if (connection.scope.kind === 'watch') return;
      // The last moment this socket proved somebody was there — not the moment
      // it ended, which is a different number and, for the departure that
      // matters most, a wrong one.
      //
      // A phone that freezes in a pocket goes on holding an open socket:
      // `sweep` takes up to HEARTBEAT_TIMEOUT_MS to notice, then
      // `socket.close()` spends `ws`'s 30-second `closeTimeout` waiting for a
      // close frame from a process that is never going to send one. So this
      // handler runs some forty seconds after the last thing the person
      // actually did, and `now()` here would write those forty seconds down as
      // evidence of presence. With `agoOrNull`'s sixty-second floor on top,
      // Home read "In the app now" for about a hundred seconds after the last
      // ping. Sixty is the number that was wanted, and this is the whole of
      // what was making it a hundred.
      //
      // `connection.lastSeen` is never later than the truth. It is at worst one
      // HEARTBEAT_INTERVAL_MS early, which the same floor absorbs — the error
      // this leaves is in the direction of saying less than is known rather
      // than more.
      //
      // Written before the presence reporting below, so a snapshot pushed as a
      // result of it already carries the right time.
      accounts.markSeen(connection.userId, connection.lastSeen, connection.build);
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
      // The departure, on the same test the loop above uses and for the same
      // reason: a socket dying after its replacement has connected is not
      // somebody leaving. Sent after `markSeen` above, so the snapshot it
      // produces carries the moment they went rather than the one before it.
      //
      // No grace period here, deliberately, though a channel gives one. A
      // flap pushes `inApp: false` with `lastSeenAt` a moment ago, and the
      // sixty-second floor in `agoOrNull` still reads that as being in the
      // app — so the display is already steady across a tunnel or a lift
      // without a timer existing to make it so.
      if (!hasConnection(connection.userId)) {
        announcePresence(connection.userId);
      }
    });
  });
}
