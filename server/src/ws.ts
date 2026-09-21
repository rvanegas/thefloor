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
  ScreenDevice,
  ServerMessage,
} from '../../core/protocol';
import type { AccountSettings } from '../../core/settings';
import type { Accounts } from './accounts';
import type { NotificationPreferences } from './preferences';
import type { ChannelRegistry } from './channels';
import {
  ATTENTION_BUILD,
  claimedClient,
  claimedBuild,
  claimedNotifyState,
  type NotifyState,
  heartbeatTimeoutFor,
  type ClientKind,
} from './release';
import { isPresent } from '../../core/channel';
import { sha256 } from './db';
import { settingsForWire } from './settings-wire';

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
  /**
   * The only kind there is, since the player moved into the app.
   *
   * **Kept as a union of one on purpose.** There was a second — `watch`, a
   * follower page holding a six-hour link credential, allowed to watch one
   * channel and to send exactly one action — and it went when a screen became
   * an ordinary signed-in instance of the app. Every narrowing on `scope.kind`
   * went with it, which is most of what this type was for.
   *
   * A shape is what the next restriction will need, and turning this into a
   * bare interface would mean discovering that again. See
   * planning/decisions/2026-09-17-the-screen-is-the-app.md.
   */
  { kind: 'session' };

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
  /**
   * The same credential hashed, which is how it joins to anything stored.
   *
   * Computed once at connect rather than per use: it is the key of this
   * session's row in `tokens` and of every push address registered by it, and
   * both are consulted on paths that run per notification.
   */
  tokenHash: string;
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
  /**
   * Which kind of client this is, defaulting to native for everything that
   * does not say — which is every build that predates the field. Read only by
   * the census, which counts native installs alone.
   */
  client: ClientKind;
  /**
   * Whether the app may reach this person when it is not running, as it said
   * at connect, or null from a client that does not report it — every build
   * before the field, and the web client, which has nothing true to say.
   *
   * Held rather than re-read for `build`'s reason and one more: nothing on a
   * live socket can update it, so a second reading would be the same reading.
   */
  notify: NotifyState | null;
  /**
   * Which copy of the app this socket belongs to, as that copy names itself,
   * or null from a client too old to have an opinion.
   *
   * **The one thing a token cannot say.** A token is a sign-in, and until
   * 2026-08-31 it was the whole of what this server knew about "a device" —
   * which was survivable only because iOS will not run a second copy of the
   * app, so one token meant one running process by construction. The browser
   * breaks that: two tabs on one origin share `localStorage` and therefore
   * share a token, and they are two devices in every sense that matters here.
   *
   * Read only by `displaceOtherSessions`, and never stored. It is not a
   * credential and nothing is authorised by it — the token is still what
   * authenticates, and this only decides which *other* sockets that same
   * person is holding. So a client that lies about it can displace its own
   * other sessions and reach nothing else, which is a thing it may already do
   * by opening a channel.
   */
  device: string | null;
  /**
   * What this device calls itself, for its own account's screen picker.
   *
   * Held beside `device` because they answer different questions: that one is
   * an identity nobody reads, this one is a label nobody routes by. Neither is
   * a credential. See `claimedDeviceName` for why it never leaves the account
   * that sent it.
   */
  deviceName: string | null;
  /**
   * The channel this instance is showing a film for, or null.
   *
   * Connection state and no row — it dies with the socket, which is the
   * correct lifetime: a screen that has gone away has stopped showing
   * anything. See `ClientMessage.screens.showing`.
   *
   * **It reaches other accounts since 2026-09-20**, which it deliberately did
   * not before. `watchingIn` below gathers it per channel and the snapshot
   * carries it, so the roster can say who has the film up — see
   * `ChannelView.watching` for why that question cannot be answered from
   * `watchingHere`. What crosses is the channel and never the device: nobody
   * outside the account learns which instance is showing it.
   */
  screening: string | null;
  /**
   * The channel this instance is *standing in*, or null.
   *
   * **The account's presence is not this**, and the difference is the whole
   * reason it is here. A channel's `present` names accounts: it says somebody
   * is in the room and nothing about which of their devices is holding it.
   * This is that missing half, and it is what a television asks for when it
   * hands the film back — *the device the person is on*, which no list of
   * signed-in instances can name.
   *
   * Written where displacement is decided, and by the same actions: an
   * `ENTER` sets it here and clears it on every other device of the account,
   * because one voice means one place; a Step Out, an expiry, a nearby
   * declaration from inside the room and a departure all clear it. Connection
   * state like `screening`, dying with the socket — a device that has gone is
   * not holding a room, and a reconnection re-sends `ENTER` from the client's
   * own belief, which is what fills this in again.
   */
  standing: string | null;
  /**
   * When this socket was accepted, which is the start of the only clock that
   * says how long it lasted.
   *
   * Not derivable from anything else. A websocket upgrade is hijacked before
   * Fastify finishes the request, so no `request completed` line is ever
   * emitted for `/ws` and no `responseTime` exists — the journal records that
   * a socket opened and nothing whatsoever about how long it lived. Two
   * sockets, one that lasted nine seconds and one that never came up, are
   * indistinguishable without this.
   */
  openedAt: number;
  /**
   * Which server-side rule ended this socket, or null if this end did not.
   *
   * **Recorded rather than inferred, because the close code cannot carry it.**
   * `terminate` produces an abnormal 1006, which is exactly what a transport
   * that died on its own produces, so reading the code alone cannot tell a
   * sweep apart from a tunnel. The one moment the reason is known for certain
   * is the moment the rule fires, which is where this is set.
   *
   * A socket still holding null at close was ended by the client or by the
   * network between us — which is the question this whole field exists to
   * settle. See `logClose`.
   */
  endedBy: 'silence' | 'unauthorized' | null;
}

/**
 * The longest device name this server will keep, which is a bound rather than
 * a format.
 *
 * Nothing parses this value — it is only ever compared to another one — so
 * there is no shape to validate and no reason to insist on a UUID. What there
 * is reason to insist on is that a client cannot hand the process an
 * unbounded string to hold for the life of a socket.
 */
const MAX_DEVICE_LENGTH = 128;

/**
 * What a caller claims its device is, from a query parameter.
 *
 * **Never refuses**, on the same contract as `claimedBuild` and `claimedClient`
 * and for the same reason: every build already installed omits it and can
 * never be taught otherwise, so absence has to be a legal answer describing
 * the population that exists rather than a bad request. Anything unusable is
 * read as no claim at all, which puts that socket back on the token — the
 * behaviour every client had before this field.
 */
function claimedDevice(raw: string | null | undefined): string | null {
  if (!raw) return null;
  return raw.length <= MAX_DEVICE_LENGTH ? raw : null;
}

/**
 * The most characters a device's own name may hold.
 *
 * Shorter than the id above because this one is shown to somebody. A model
 * name is a dozen characters and a browser label twice that; anything longer
 * is not a name, and a picker is not a place to render a paragraph.
 */
const MAX_DEVICE_NAME_LENGTH = 64;

/**
 * What a device calls itself, for this account's own picker and nowhere else.
 *
 * **Shown only to its owner.** It reaches no other member, no channel
 * snapshot and no row on disk — it lives on the connection and dies with it.
 * That is deliberate rather than incidental: a device name is frequently a
 * person's own name, and *Rodrigo's iPad* is not a thing the room is entitled
 * to.
 *
 * **Weaker than it looks, on purpose.** On iOS 16 and newer `UIDevice.name`
 * is a generic "iPhone" unless the app holds the user-assigned device name
 * entitlement, so the client sends a model name instead and this is often
 * "iPhone 15 Pro" rather than anything personal. On the web there is no
 * device-name API at all and the client derives a browser label. Two tabs on
 * one machine therefore carry the same name, which the picker disambiguates
 * by what each is doing rather than by what it is called.
 *
 * Never refuses, on `claimedDevice`'s contract: an absent or unusable name is
 * a device that will be described by its kind instead.
 */
function claimedDeviceName(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed || trimmed.length > MAX_DEVICE_NAME_LENGTH) return null;
  return trimmed;
}

/**
 * What counts as "the same device" when deciding who to displace.
 *
 * The device a socket names, and the token it authenticated on when it names
 * none. **The fallback is the whole compatibility story**: a build that sends
 * no device is compared to other such builds by token, which is exactly the
 * rule that shipped before this field existed, so nothing already installed
 * changes behaviour. A device-naming socket and a silent one sharing a token
 * come out different, which is also right — a token is not a device, and the
 * two are not the same copy of the app.
 *
 * The token is prefixed rather than used bare so that a client cannot claim
 * another of its own sessions' tokens as a device name and merge the two.
 * That would cost it only its own displacement, but a key space where one
 * side's values can be forged into the other's is not one to leave open.
 */
function deviceKey(connection: Connection): string {
  return connection.device === null
    ? `token:${connection.tokenHash}`
    : `device:${connection.device}`;
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
  /**
   * Who is knocking, when the page offered a session and it resolved.
   *
   * Held here rather than on the `Knock` for the reason `linkToken` is: what
   * the members watching the queue need is a name, and an account id in a
   * snapshot every screen is watching is a fact about somebody who is not in
   * the room yet. Handed to `answerKnock` at the last moment, as the link is.
   */
  account: { id: string; display_name: string } | null;
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
 * Lets the route that writes an account's settings tell every device holding
 * one of its sessions.
 *
 * Separate from `HomeNotifier` rather than a second method on it, because the
 * audiences are different in kind: Home goes to whoever is *watching* Home,
 * and this goes to every session an account holds whatever screen it is on.
 * Somebody sitting in a channel when their other phone switches to dark is
 * exactly the case, and it is the one a Home push would miss.
 *
 * A no-op until the socket layer registers, for the reason the other two are:
 * it is created before the websocket plugin has loaded, and a settings change
 * that reaches nobody costs a device one stale value until its next hello.
 */
export interface SettingsNotifier {
  notify: (userId: string, settings: AccountSettings) => void;
}

export function createSettingsNotifier(): SettingsNotifier {
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
  settingsNotifier: SettingsNotifier;
  reachability: Reachability;
  preferences: NotificationPreferences;
  /** Where a guest's page should connect for audio. Absent without a media plane. */
  mediaUrl?: string;
  /**
   * How often the sweep below runs, in milliseconds.
   *
   * A real interval rather than anything derived from `now`, and so the one
   * clock in this server that a test cannot step. Injected for exactly that:
   * `now` decides *whether* a socket has been silent too long, this decides
   * *how soon anyone asks*, and a test that steps the first still has to wait
   * out the second in wall-clock seconds. The suite sets it small; nothing in
   * production passes it.
   *
   * Do not read it as the silence budget — that is `heartbeatTimeoutFor`, and
   * making them the same number would couple detection latency to the budget
   * itself.
   */
  heartbeatIntervalMs?: number;
}): void {
  const {
    fastify,
    accounts,
    channels,
    homeFor,
    recordingsInChannel,
    now,
    homeNotifier,
    settingsNotifier,
    reachability,
    preferences,
    mediaUrl,
    heartbeatIntervalMs = HEARTBEAT_INTERVAL_MS,
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
   * Writes down that this session was heard from, in both places that care.
   *
   * Two rows, because they answer two questions. The account's `last_seen_at`
   * is the maximum across every device somebody holds and is what a contact
   * list renders — one person, about or not. The session's is per device, and
   * is what bounds the build census to sign-ins that are actually calling; its
   * `last_build` is the one that cannot be masked by a second device, which is
   * the whole reason it exists. See `Accounts.buildsSeenSince`.
   *
   * Paired here rather than folded into `markSeen` so that the account-level
   * write keeps working for callers that hold no token — and so the three
   * places a socket proves life do not each have to remember both.
   */
  const heard = (connection: Connection, at: number): void => {
    // The account's build is only ever a native one — see the same guard in
    // app.ts, which carries the reasoning. A browser still stamps
    // `last_seen_at`, because a person with the web app open is about, and
    // that is what the account-level column is for.
    accounts.markSeen(
      connection.userId,
      at,
      connection.client === 'web' ? null : connection.build
    );
    accounts.markSession(connection.token, at, connection.build, connection.client);
  };

  /**
   * Tells this account's other devices that they are no longer standing
   * anywhere, because this one has just entered a channel — or has just left
   * the one the account was in.
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
   * **Keyed on the device rather than on the socket**, which is the part that
   * is easy to get wrong. A device that is reconnecting has two connections
   * for a moment, the old one not yet closed; displacing by socket would let
   * a flap take the room away from the device somebody is actually holding,
   * and the client clears what it would re-enter when it hears this. So the
   * skip has to name something that survives a reconnection, and `deviceKey`
   * is that thing.
   *
   * **It was the token until 2026-08-31, and a token is not a device.** That
   * held only because iOS will not run a second copy of the app, so one
   * sign-in meant one running process and the two readings could not come
   * apart. Two browser tabs on one origin share `localStorage`, share a token,
   * and were therefore the one pair of sessions this loop could never separate
   * — each invisible to the other, both live in the same room, competing for
   * the one voice the account has. See planning/TWO-DEVICES-WALK.md
   * and planning/decisions/DECISIONS.md § *The web app is a
   * secondary interface*.
   *
   * Watch-scoped sockets are left alone. A follower page holds a watch token,
   * never a session token, and is a second screen rather than a second place
   * to be — it was never standing anywhere to be displaced from.
   */
  /**
   * This account's live instances, newest-known first, for the screen picker.
   *
   * **Keyed by `deviceKey` rather than by socket**, for `displaceOtherSessions`'
   * reason: a device reconnecting holds two sockets for a moment, and offering
   * it twice would be offering one television as two.
   *
   * Session-scoped connections only. Nothing else is a place a film could be
   * shown, and a watch-scoped socket — while any still exist — is a page
   * rather than an instance of the app.
   */
  const screensFor = (connection: Connection): ScreenDevice[] => {
    const mine = new Map<string, ScreenDevice>();
    const self = deviceKey(connection);
    for (const other of connections) {
      if (other.scope.kind !== 'session') continue;
      if (other.userId !== connection.userId) continue;
      const key = deviceKey(other);
      if (mine.has(key)) continue;
      mine.set(key, {
        device: other.device ?? key,
        name: other.deviceName,
        client: other.client === 'web' ? 'web' : 'native',
        self: key === self,
        // What a screen is actually doing, rather than merely that it is
        // connected — a device signed in and face-down on a table is not
        // something to offer beside the laptop somebody is looking at.
        watching: other.screening !== null,
      });
    }
    return [...mine.values()];
  };

  /**
   * Tells each of this account's instances what its *others* are showing.
   *
   * **Pushed, where `screensFor` is asked for**, and the difference is the
   * point: that one is a picker's list, frozen at the moment of choosing
   * because a list that reorders under a finger is worse than one a second
   * old. This is one live fact per device — *is the film on somewhere else of
   * mine* — and it is what the *Watch on* switch shows as chosen on the
   * device that handed the film away. Without it that device shows no
   * selection and the choice it just made looks as though it never landed.
   *
   * Each connection is told about the others and never about itself, which is
   * what makes the answer mean *other device* on every device at once.
   * Keyed by `deviceKey` for `screensFor`'s reason: a device reconnecting
   * holds two sockets for a moment, and the one on its way out must not go on
   * answering for it.
   */
  const pushScreening = (userId: string): void => {
    const sessions = [...connections].filter(
      (c) => c.scope.kind === 'session' && c.userId === userId
    );
    for (const connection of sessions) {
      const self = deviceKey(connection);
      const channelIds = new Set<string>();
      for (const other of sessions) {
        if (deviceKey(other) === self) continue;
        if (other.screening !== null) channelIds.add(other.screening);
      }
      send(connection, { type: 'screening', channelIds: [...channelIds] });
    }
  };

  /**
   * Who has any instance showing this channel's film.
   *
   * **The account, never the device**, which is the whole difference between
   * this and `screensFor` above: that one is somebody's own list of their own
   * hardware, and this is one fact about a person told to the room they are
   * in. Deduplicated for the same reason it is keyed that way — a device
   * reconnecting holds two sockets for a moment, and one person must not
   * appear as two watchers.
   *
   * Session scope only, so a guest is absent however plainly they are
   * watching: `screens.showing` is a session message and a guest socket never
   * sends one. See `ChannelView.watching`.
   */
  const watchingIn = (channelId: string): string[] => {
    const ids = new Set<string>();
    for (const other of connections) {
      if (other.scope.kind !== 'session') continue;
      if (other.screening !== channelId) continue;
      ids.add(other.userId);
    }
    return [...ids];
  };

  /**
   * Tells the rooms themselves that somebody has started or stopped watching.
   *
   * **The channel's watchers, where `pushScreening` tells the account its own
   * devices**, and both are needed by one declaration: the switch on the
   * device that handed a film away reads the first, and every roster in the
   * room reads this. Neither is `channels.onChange`, which fires on the
   * reducer — this is connection state and the reducer never hears about it,
   * so the fanout has to be made by hand at each of the three places
   * `screening` moves: a declaration, the instances it displaces, and a
   * socket closing.
   *
   * Nulls are dropped rather than rejected, so a caller can hand over an old
   * value and a new one without sorting out which of them was a channel.
   */
  const pushWatching = (channelIds: Iterable<string | null>): void => {
    for (const channelId of new Set(channelIds)) {
      if (channelId === null) continue;
      for (const connection of connections) {
        if (connection.watchingChannels.has(channelId)) {
          pushChannel(connection, channelId);
        }
      }
    }
  };

  /**
   * The connection to hand a film to, given a device this account named.
   *
   * Matched on the claimed id or on the fallback key, so that a device which
   * announced none — an older build — can still be addressed by the token key
   * the picker was given for it.
   */
  const screenConnectionFor = (
    connection: Connection,
    device: string
  ): Connection | undefined => {
    for (const other of connections) {
      if (other.scope.kind !== 'session') continue;
      if (other.userId !== connection.userId) continue;
      if (other.device === device || deviceKey(other) === device) return other;
    }
    return undefined;
  };

  /**
   * The connection standing in this channel, which is where a film handed
   * back goes.
   *
   * **Described rather than named**, and that is the point: the television
   * asking has a list of the account's instances and no way to tell which of
   * them the person is holding. The room is held by one device at a time —
   * `displaceOtherSessions` is what makes that true — so this is a lookup and
   * not a choice.
   *
   * Itself included, deliberately: a device that is both the screen and the
   * room is the single-device case, where the answer to *hand it back* is
   * that it is already there. Nothing asks in that state — the television
   * only exists while the room is elsewhere — and an exclusion here would be
   * a rule about a case that cannot arise, written where a reader would take
   * it for one that can.
   */
  const standingConnectionFor = (
    connection: Connection,
    channelId: string
  ): Connection | undefined => {
    for (const other of connections) {
      if (other.scope.kind !== 'session') continue;
      if (other.userId !== connection.userId) continue;
      if (other.standing === channelId) return other;
    }
    return undefined;
  };

  const displaceOtherSessions = (connection: Connection): void => {
    const key = deviceKey(connection);
    for (const other of connections) {
      if (other.scope.kind !== 'session') continue;
      if (other.userId !== connection.userId) continue;
      if (deviceKey(other) === key) continue;
      // **The fact as well as the message**, since 2026-09-20. `standing` is
      // what a television hands the film back to, so a device that has just
      // been told it is no longer standing anywhere must stop answering that
      // question — otherwise the picture goes to the phone somebody left in
      // another room rather than to the one in their hand.
      // **The fact as well as the message**, since 2026-09-20. `standing` is
      // what a television hands the film back to, so a device that has just
      // been told it is no longer standing anywhere must stop answering that
      // question — otherwise the picture goes to the phone somebody left in
      // another room rather than to the one in their hand.
      other.standing = null;
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
   * Ends connections that have gone quiet.
   *
   * A TCP connection can die without either end being told — no close arrives,
   * and the socket sits half-open until the OS gives up, which is hours by
   * default. Left to that, nothing downstream works: the grace period never
   * starts, so nobody is removed, so a channel never empties, never auto-ends,
   * and a recording bills indefinitely against two egresses.
   *
   * Ending the socket is enough; its close handler does the reporting, which
   * keeps one path for every kind of departure.
   *
   * **`terminate` rather than `close`, and the difference is thirty seconds
   * somebody spends looking at a lie.** `close` sends a close frame and then
   * waits out `ws`'s 30-second `closeTimeout` for one back — from a peer that
   * has, by the only test this branch applies, already stopped answering. The
   * close handler is where `disconnectedAt` is written, so those thirty
   * seconds land on top of the twelve this sweep already spends noticing: a
   * phone that goes quiet rather than closing left the roster saying somebody
   * was present and well for up to forty-seven seconds before it would admit
   * to "Present · reconnecting…". `terminate` destroys the socket and fires
   * `close` at once, which bounds that wait by the heartbeat alone.
   *
   * It is not rude to a live connection, because this branch never meets one:
   * a socket reaching it has failed HEARTBEAT_TIMEOUT_MS of silence, and a
   * close frame it was never going to acknowledge is a courtesy to nobody.
   * **The refusal below still closes cleanly**, and must — 4401 is a code the
   * client reads to stop reconnecting, and a code has to arrive to be read.
   */
  const sweep = setInterval(() => {
    const at = now();
    // Guests first, and for the same reason members are swept: a half-open
    // socket that nobody closes holds somebody in a room they have left, and a
    // guest in a room is somebody the members can be heard by.
    //
    // Judged against the current budget rather than the legacy one, alone among
    // the connections here: the guest page ships with this deploy and reads the
    // same interval constant, so it cannot be a version behind the way an
    // installed app can.
    for (const guest of guestConnections) {
      if (guest.lastSeen < at - HEARTBEAT_TIMEOUT_MS) guest.socket.terminate();
    }
    for (const connection of connections) {
      // Per connection, because the budget depends on how often that client
      // promised to speak. See `heartbeatTimeoutFor`.
      if (connection.lastSeen < at - heartbeatTimeoutFor(connection.build)) {
        // Before the terminate rather than after, so there is no turn on which
        // a socket is ending for a reason nobody has written down. `ws` emits
        // `close` on a later tick today, so the other order happens to work —
        // but that is its implementation detail and not a contract, and this
        // costs nothing to get right.
        connection.endedBy = 'silence';
        connection.socket.terminate();
        continue;
      }
      // Re-checked here rather than pushed from the revocation, so there is
      // one place that decides a socket is no longer authorised and no wiring
      // between accounts and transport. The client is told before the close:
      // 4401 alone is enough for it to stop reconnecting, but the message is
      // what it can put on screen.
      //
      // Re-checked against the table it was accepted from, every heartbeat.
      // There was a second table to check — the follower page's watch links —
      // until screens became ordinary sessions of the app.
      const live = !!accounts.accountForToken(connection.token, now());
      if (!live) {
        send(connection, {
          type: 'error',
          // Not "signed in on another device" any more: since 2026-08-24
          // signing in elsewhere revokes nothing, so the ways to arrive here
          // are a deliberate sign-out of this device from another one, an
          // account deleted, and a token ninety days old. The wording covers
          // all three rather than naming the one that used to produce it
          // almost every time.
          message: 'This device was signed out.',
          code: 'unauthorized',
        });
        connection.endedBy = 'unauthorized';
        connection.socket.close(UNAUTHORIZED_CLOSE, 'Unauthorized');
      }
    }
  }, heartbeatIntervalMs);
  sweep.unref?.();
  fastify.addHook('onClose', async () => clearInterval(sweep));

  function send(connection: Connection, message: ServerMessage): void {
    if (connection.socket.readyState === 1) {
      connection.socket.send(JSON.stringify(message));
    }
  }

  /**
   * One line per socket that ends, which is the only record of a socket's life.
   *
   * **What this exists to answer is which end hung up, and it is not a question
   * the box could answer before.** A client reconnecting on a fixed cadence is
   * the symptom of several unrelated faults — a stale socket the client has
   * disowned, a silence budget the client cannot meet, a proxy cutting an idle
   * stream — and the journal held the same evidence for all of them: a row of
   * `incoming request` lines and nothing else. See
   * decisions/2026-09-15-twenty-seconds-is-chrome-parking-a-timer-not-a-socket-dying.md.
   * The entry that asked for this line —
   * backlog/why-one-phone-could-not-hold-a-socket-is-diagnosed-not-observed.md,
   * where a mechanism that fit had to stand in for one that was seen — was
   * settled by it and deleted the day after it landed; that decision is where
   * its argument went.
   *
   * The two numbers are what separate those faults.
   *
   * `ageMs` is how long the socket lasted. Near zero across a run means the
   * connection is not surviving its own handshake; a stable figure well short
   * of anything configured here means something between the two ends is
   * cutting it, and the figure itself is the timeout to go and find.
   *
   * `sinceLastSeenMs` is how long the client had been quiet when it ended.
   * Past the budget with `endedBy: 'silence'` is this server having done it,
   * and the pair says so plainly rather than by arithmetic on a close code.
   * Well inside the budget with `endedBy: null` is the other end hanging up on
   * a connection that was answering perfectly — a client watchdog firing, or
   * the transport dying.
   *
   * `build` and `client` ride along because the answer has differed by client
   * before and the census is the only other place they are recorded.
   *
   * **No token and no account.** Neither is needed to tell one socket's life
   * from another's — `device` already distinguishes them, and is by
   * construction not a credential — and a line written per close is exactly
   * the kind of line that accumulates in a journal nobody is guarding.
   */
  function logClose(connection: Connection, code: number, reason: string): void {
    fastify.log.info(
      {
        device: connection.device,
        scope: connection.scope.kind,
        build: connection.build,
        client: connection.client,
        ageMs: now() - connection.openedAt,
        sinceLastSeenMs: now() - connection.lastSeen,
        // Null is the informative value here: nothing on this side ended it.
        endedBy: connection.endedBy,
        code,
        // Empty from every abnormal close, which is most of them.
        reason: reason === '' ? undefined : reason,
      },
      'socket closed'
    );
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
        // Which *getting-started cohort* this is, or null for every ordinary
        // channel. Here rather than on `ChannelState` for `pingableAt`'s
        // reason exactly: no reducer knows about it and `core/` has never
        // heard of it. The screen is the only thing that asks.
        cohort: channels.cohortNumberOf(channelId),
        // Whether this channel has a public page, on the same terms and for
        // the same reason: it is a fact the server holds about the channel
        // rather than a rule of the conversation, and settings is the only
        // thing that asks. Null for every channel that has not declared
        // itself public, which is nearly all of them.
        publicAt: channels.publicAtOf(channelId),
        // What a directory requires and nothing can derive, plus whether
        // there is a cover yet. Same terms as the line above.
        publication: channels.publicationSettingsOf(channelId),
        // The words that opened those windows, where there were any. The same
        // answer for everybody, like the windows themselves — see
        // `Channels.pingTexts` for why a sender's name travels with them.
        pingedWith: channels.pingTexts(channelId),
        // What ends both absent states, and what the roster's *nearby* line
        // counts — *stepped out* counts presence instead. Per channel
        // because that is where it is read, but the value is per account —
        // see `ChannelView.attentiveAt`, and note that somebody whose build
        // does not report is simply absent from this map rather than being
        // reported as inattentive.
        attentiveAt: Object.fromEntries(
          channel.participants.flatMap((id) => {
            const at = channels.attentionOf(channelId, id);
            return at === null ? [] : [[id, at] as const];
          })
        ),
        // This connection's own setting and nobody else's. It rides the
        // channel snapshot because that is where it is read and changed, and
        // because a snapshot is already per connection — the same fact that
        // makes `recordings` and `pingableAt` viewer-relative here.
        notificationLevel: preferences.levelFor(connection.userId, channelId),
        // Who is talking while the room is withholding them — the one thing
        // about audio that no listener's media plane can see, and so the one
        // thing that has to travel this way. See
        // `ChannelView.speakingWhileWithheld`.
        speakingWhileWithheld: channels.speakingWithheldIn(channelId),
        // Who has the film up, which is what the roster's *watching* suffix
        // draws. Gathered from live connections rather than from the channel
        // because no reducer is told about a screen — see
        // `ChannelView.watching`, and `watchingIn` for why it is the account
        // and not the device.
        watching: watchingIn(channelId),
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
  // **`liveSessions` was here and went on 2026-09-09**, with the rule that
  // read it: which of somebody's devices held a socket was being used to
  // decide which of them to withhold a notification from, and a socket stopped
  // meaning anybody was looking at the screen when stepping in became an open
  // microphone. `inApp` stays — it answers a different question, whether a
  // person is about, which is what a contact list renders.

  // Session-scoped only. A follower page is a second screen rather than one of
  // this person's devices, holds a watch token rather than a session, and has
  // no settings screen to be out of date with.
  settingsNotifier.notify = (userId, settings) => {
    for (const connection of connections) {
      if (connection.scope.kind !== 'session') continue;
      if (connection.userId !== userId) continue;
      send(connection, {
        type: 'settings',
        settings: settingsForWire(settings),
      });
    }
  };

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
  // worth nothing and costs a release. See planning/decisions/DECISIONS.md.

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
  // The broadcast this replaced was hiding it. See planning/decisions/DECISIONS.md.
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
      // **One of the ways a seat ends is upwards**, since 2026-09-16: a member
      // asks the account behind it into the channel, and the seat closes
      // because the person is now a member of the room they were sitting in.
      // Telling them they are *no longer in this channel* is the one reading
      // of that sentence which is exactly backwards, so the promotion is asked
      // about first and answered with what actually happened.
      if (channels.seatPromoted(connection.channelId, connection.guestId)) {
        sendGuest(connection, { type: 'joined' });
      } else {
        sendGuest(connection, {
          type: 'refused',
          reason: 'You are no longer in this channel.',
        });
      }
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
      channelId,
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
      account: null,
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
      // No `CONNECTED` report, since 2026-09-08, for the reason `watch.channel`
      // no longer makes one: a page holding a socket is reachable, and being in
      // the room is what presence is. `admit` asks for a media token next, and
      // the room confirms them within a poll — inside the grace their close
      // started. A guest is an occupant on the same terms as anybody else.
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
          // **Presence, not validity**, the same reading `landing.ts` makes of
          // this key: whatever the browser was holding is offered, and a stale
          // or revoked one simply resolves to nobody. There is nothing to tell
          // anybody about that — the seat is named the way any unnamed one is,
          // and the rename on the room screen is what makes it a shrug.
          connection.account =
            typeof message.token === 'string' && message.token
              ? (accounts.accountForToken(message.token, now()) ?? null)
              : null;
          const knocked = channels.knock(
            connection.linkToken,
            typeof message.name === 'string' ? message.name : '',
            connection.account ?? undefined
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
      scope: { kind: 'session' },
      token,
      tokenHash: sha256(token),
      watchingHome: false,
      watchingChannels: new Set(),
      lastSeen: now(),
      build: claimedBuild(url.searchParams.get('build')),
      // Mirrored as a query parameter for the same reason `build` is: neither
      // React Native's WebSocket nor the browser's carries custom headers.
      client: claimedClient(url.searchParams.get('client')),
      // And the fourth, for the third time the same reason. Read once at
      // connect and never again on this socket: a permission granted in
      // Settings while the process was suspended is re-read by the app on
      // foreground, but it has no way to tell a live socket about it, so a
      // write per message would restate the value this one carries. The next
      // HTTP request picks the change up, which is `requireAccount`'s half of
      // the same instrumentation. Level 3; see NOTIFY_HEADER.
      notify: claimedNotifyState(url.searchParams.get('notify')),
      // A query parameter for the fifth time and the same reason. Unlike the
      // other two this one is never mirrored as a header, because nothing but
      // this socket has a use for it: displacement is about live connections,
      // and an HTTP call is not one.
      device: claimedDevice(url.searchParams.get('device')),
      // The sixth, and the only one of them that is ever rendered. See
      // `claimedDeviceName` for who may see it, which is one person.
      deviceName: claimedDeviceName(url.searchParams.get('deviceName')),
      screening: null,
      standing: null,
      openedAt: now(),
      endedBy: null,
    };
    // Asked before the add, so it answers about the sockets that were already
    // here: a second device connecting is not an arrival, and announcing one
    // would spend a fan-out saying what every contact already believes.
    const arriving = !hasConnection(account.id);
    connections.add(connection);
    if (connection.scope.kind === 'session') {
      // Having the app open is exactly this: a live socket. Stamped as it opens
      // so somebody who connects and says nothing still counts as here.
      heard(connection, now());
      // Level 3, written where the socket is the only thing that speaks:
      // somebody sitting in a channel for an hour makes almost no HTTP calls,
      // which is the gap `BUILD_HEADER` was mirrored here to close and the
      // same gap this falls into. Native only, for `markSeen`'s reason above.
      if (connection.notify !== null && connection.client !== 'web') {
        accounts.markNotifications(connection.userId, connection.notify, now());
      }
      // The arrival itself, to whoever has this account as a contact. Without
      // it their Home learns nothing until something unrelated happens to push
      // one, which is how "in the app now" used to mean "as of whenever your
      // last snapshot was".
      if (arriving) announcePresence(account.id);
      // A device that has just come up knows nothing about what the account's
      // other instances are showing, and they know nothing about it. Both
      // halves are settled here, which is also what makes a reconnection
      // recover the switch's selection without anybody asking.
      pushScreening(account.id);
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
    // **Connecting is attending, for a build that says so.** A process only
    // reaches this line by being launched or foregrounded, and the reports
    // that follow keep the stamp fresh while somebody is there.
    //
    // It matters most in the case that has no report to wait for: a phone in
    // a pocket whose socket comes back after a deploy or a network blip. The
    // server has no clock for it — the map is volatile — and without one it
    // would never be retired, which is the ghost this whole window exists to
    // remove. Seeding here bounds it at fifteen minutes from the reconnection
    // rather than for ever.
    //
    // Gated on the build, because a clock nobody will ever refresh is worse
    // than no clock at all. See `ATTENTION_BUILD`.
    if (connection.build !== null && connection.build >= ATTENTION_BUILD) {
      // Every room this account is standing in, which is what a reconnecting
      // process is holding whether or not it says so. The report that follows
      // names what is on screen; this covers the case that has no report to
      // wait for — a phone in a pocket whose socket came back.
      channels.attentive(connection.userId, channels.standingIn(connection.userId));
    }
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
      // Read fresh per connection like the two above, and unlike them it is
      // always present: these are settings rather than grants, so there is no
      // "absent means no" to lean on — a client that reads this has to be able
      // to tell "the account says light" from "this server has not been asked".
      settings: settingsForWire(accounts.settings(account.id)),
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
        heard(connection, connection.lastSeen);
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

      switch (message.type) {
        /**
         * A person is attending the application. Not a channel event and not
         * scoped to one — see `ClientMessage.attentive`.
         *
         * **Account-scoped, deliberately**, and since 2026-09-17 that is
         * load-bearing rather than incidental. `Channels.attentive` keys on
         * `(channel, user)` and checks membership rather than presence, so
         * evidence gathered on one of an account's devices refreshes the
         * clock for the room another of them is standing in. That is what
         * keeps somebody present through a two-hour film: the laptop showing
         * it reports, and the phone holding the voice is what the report
         * saves.
         *
         * **This used to say the opposite** — that somebody watching on a
         * laptop while their phone sat in a drawer was not attending the room
         * the phone was holding, and that attention lived on the phone with
         * control. That was true of a *follower page*, which held a link
         * credential, could not send this message, and said nothing about
         * where anybody was. A screen is an ordinary session of the app now,
         * and a person watching the thing the room is attending to is
         * attending it. See
         * planning/decisions/2026-09-17-the-screen-is-the-app.md.
         */
        case 'attentive': {
          // A client naming rooms, so the shape is checked before it is
          // believed. `attentive` itself refuses any the sender does not
          // belong to; this refuses anything that is not a list of ids.
          const named = Array.isArray(message.channelIds)
            ? message.channelIds.filter((id) => typeof id === 'string')
            : [];
          // A phone attends what is on its screen and what it is standing in,
          // which is two. The cap is not a policy about that, only a bound on
          // what one message can cost to process.
          channels.attentive(connection.userId, named.slice(0, 8));
          return;
        }

        /**
         * Somebody is talking into a room that is withholding them.
         *
         * **Session sockets only**, settled by the `watch` guard above for the
         * same reason `attentive` is: a follower page has no microphone in the
         * room and nothing to report about one.
         *
         * The registry refuses anything that is not true of the room — not a
         * member, not withheld, not a channel — so nothing is checked here but
         * the shape.
         */
        case 'channel.speaking':
          if (typeof message.channelId !== 'string') return;
          channels.speaking(
            connection.userId,
            message.channelId,
            message.speaking === true
          );
          return;

        case 'ping':
          send(connection, { type: 'pong', serverNow: now() });
          return;

        case 'watch.home':
          connection.watchingHome = true;
          pushHome(connection);
          return;

        case 'watch.channel':
          connection.watchingChannels.add(message.channelId);
          // **Watching says nothing about presence, and used to cancel the
          // grace period.** It reported `CONNECTED` here until 2026-09-08, on
          // the reasoning that a new socket asking for a channel was proof its
          // owner was reachable again — true, and not the question. Reachable
          // is *Nearby*; present is being in the room.
          //
          // What it cost: step in, force quit, reopen, open the channel. The
          // new process has no `enteredChannel` to re-assert, so it sends this
          // and nothing else — and this cancelled the grace that was about to
          // retire them, on every reconnection, for ever. An account pinned
          // present with no device in the room, while its own screen correctly
          // offered *Step in*.
          //
          // The socket keeps the other half. A close still reports
          // `DISCONNECTED` below, which only *starts* a grace and makes the
          // ordinary departure resolve without waiting for a poll. What a
          // socket may no longer do is assert that somebody is here.
          // `Channels.reconcilePresence` is what answers that now.
          pushChannel(connection, message.channelId);
          return;

        case 'unwatch.channel':
          connection.watchingChannels.delete(message.channelId);
          return;

        case 'screens.showing': {
          // Nothing to say when a device repeats itself, which it does: the
          // app reconciles this rather than firing it on a tap, so the
          // steady state is the same value arriving again.
          if (connection.screening === message.channelId) return;
          // The room it is leaving as well as the one it is joining: both
          // rosters change, and by the time `pushWatching` runs the field
          // holds only the second of them.
          const wasScreening = connection.screening;
          connection.screening = message.channelId;
          /*
            **A film shows on one device at a time, and this is where that is
            true.** Handing a film over moves the video and not merely the
            controls, so an instance declaring itself the screen is every
            other instance of this account ceasing to be one.

            Enforced here rather than by the app that asked, for two reasons.
            The server is the only thing that can see all of somebody's
            devices at once — a phone taking the film back knows nothing
            about the tablet that was also showing it — and the declaration
            arrives by this one path however it was provoked, whether
            somebody pressed *this device* or another instance handed it
            over with `screens.use`.

            The account and never a channel: two films of one person's on two
            devices is the same room with two soundtracks in it, and which
            channel each belongs to does not make it less so.

            **Told to every instance, and not only to the ones this server
            believes are showing something.** `Connection.screening` is a
            record of what a device last managed to say, which is not the same
            fact as what it is playing: the declaration dies with its socket,
            so a deploy, a tunnel or a lift leaves a device showing a film that
            this server has no record of — and every client below build 263
            never restates it at all, having nothing that survives the socket
            to say it again. Filtering the eviction on that record is
            therefore enforcing the invariant against the devices that are
            already obeying it while skipping exactly the ones that are not.

            What it cost: a film playing on a second device, the app updated
            on the first — a fresh process, no `defaulted` mark, a `screening`
            push saying nobody else has the picture — which defaults itself to
            the screen, declares, displaces nothing, and plays. Two soundtracks
            in one room, and stable, because nothing afterwards says otherwise.

            A null to an instance showing nothing is ignored by it; a null to
            one that is showing something is the whole point. See
            planning/decisions/2026-09-21-a-declaration-displaces-every-instance.md.
          */
          const displacedFrom: (string | null)[] = [];
          if (message.channelId !== null) {
            for (const other of connections) {
              if (other === connection) continue;
              if (other.scope.kind !== 'session') continue;
              if (other.userId !== connection.userId) continue;
              // The room is told about the ones that were on the record, that
              // being the only half of this the roster can have been wrong
              // about.
              if (other.screening !== null) displacedFrom.push(other.screening);
              other.screening = null;
              send(other, { type: 'screen', channelId: null });
            }
          }
          pushScreening(connection.userId);
          // **After the account's own devices, and to a different audience.**
          // A declaration moves one name on and, where it displaced an
          // instance of the same account, another name off — and in the
          // common case the two are the same person in the same room, which
          // the set collapses to one push.
          pushWatching([wasScreening, message.channelId, ...displacedFrom]);
          return;
        }

        case 'screens.list':
          send(connection, { type: 'screens', screens: screensFor(connection) });
          return;

        case 'screens.use': {
          // **The account's own devices and nothing else.** A forged id could
          // not reach another account in any case — the loop only ever looks
          // at sockets sharing this `userId` — but a message that silently did
          // nothing would be indistinguishable from a device that had just
          // gone away, and those want different answers.
          //
          // **A null device names the one standing in the channel**, which is
          // the television's way of handing the picture back: it wants the
          // device the person is on, and a list of signed-in instances cannot
          // say which that is. Resolved here because this is the only place
          // that can see every one of somebody's sockets at once. See
          // `Connection.standing`.
          const target =
            message.device === null
              ? standingConnectionFor(connection, message.channelId)
              : screenConnectionFor(connection, message.device);
          if (!target) {
            send(connection, {
              type: 'error',
              message:
                message.device === null
                  ? 'The device holding this channel is not signed in any more.'
                  : 'That device is not signed in any more.',
              code: 'no-such-device',
            });
            return;
          }
          // Nothing about the channel changes, so nothing is dispatched and no
          // snapshot is emitted. Whether that device ends up counting as a
          // screen *in the room* is its own business and its own `WATCH_HERE`
          // — which it will not send, not being in the room. See `screen` in
          // core/protocol.ts.
          send(target, { type: 'screen', channelId: message.channelId });
          return;
        }

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
              waiting?.linkToken ?? null,
              waiting?.account ?? undefined
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
          /**
           * Whether this account was standing in this room *before* the
           * action, which is the whole of what a sibling session can be
           * wrong about. Asked here because after the dispatch it is gone.
           *
           * Two of the actions below give up presence only sometimes. Since
           * 2026-09-09 *nearby* is an ordinary state rather than a Labs one,
           * so a phone can send `DECLARE_NEARBY` from outside a channel and
           * `STEP_OUT` from *Nearby* — neither of which withdraws any
           * presence, because there was none. Displacing on those told every
           * other device of the account that it had lost the room, and a
           * laptop standing in a different channel would go quiet because a
           * phone made itself reachable in this one.
           */
          const before = channels.get(message.channelId);
          const wasPresent = !!before && isPresent(before, connection.userId);
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
          //
          // Leaving is told the same way as arriving, and for a reason that is
          // not symmetry. An account has one voice; every other session is
          // holding a belief about where it is, and both of these actions make
          // that belief wrong. A session that is not told goes on believing it
          // is present, and `onopen` in the app's socket re-sends ENTER from
          // exactly that belief — so a Step Out taken on the phone in somebody's
          // hand is undone by another device reconnecting.
          // Where this device is standing, which is the same set of actions
          // read for what they say about *this* socket rather than about the
          // others. See `Connection.standing`.
          if (message.action.type === 'ENTER') {
            connection.standing = message.channelId;
          } else if (
            message.action.type === 'STEP_OUT' ||
            message.action.type === 'ATTENTION_EXPIRED' ||
            message.action.type === 'DECLARE_NEARBY' ||
            message.action.type === 'LEAVE_CHANNEL'
          ) {
            if (connection.standing === message.channelId) {
              connection.standing = null;
            }
          }
          if (
            message.action.type === 'ENTER' ||
            (message.action.type === 'STEP_OUT' && wasPresent) ||
            // Gives up presence exactly as a Step Out does, so it needs the
            // same treatment: an untold sibling session goes on believing it
            // is present and re-sends ENTER from that belief on reconnect,
            // undoing the expiry a moment after it lands.
            message.action.type === 'ATTENTION_EXPIRED' ||
            // Declaring nearby from inside a channel gives up presence too,
            // and an untold sibling would re-send ENTER on its next reconnect
            // and undo it. Declaring it from outside withdraws nothing, which
            // is what `wasPresent` says here rather than in prose.
            (message.action.type === 'DECLARE_NEARBY' && wasPresent) ||
            message.action.type === 'LEAVE_CHANNEL'
          ) {
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

    socket.on('close', (code: number, reason: Buffer) => {
      connections.delete(connection);
      logClose(connection, code, reason.toString());
      // **A screen that has gone away has stopped showing anything**, which
      // is the lifetime `Connection.screening` was given deliberately. Said
      // to the rest of the account here, after the delete, so the loop does
      // not count the socket that is leaving — otherwise a laptop that was
      // closed goes on being the answer to *is it on somewhere else* until
      // something unrelated happens to push the fact again.
      if (connection.scope.kind === 'session' && connection.screening !== null) {
        pushScreening(connection.userId);
        // And the room, which is watching a different fact: a screen that has
        // gone is somebody who has stopped watching, and nothing else is
        // going to say so. The delete above is what makes the recount right.
        pushWatching([connection.screening]);
      }
      // The last moment this socket proved somebody was there — not the moment
      // it ended, which is a different number and, for the departure that
      // matters most, a wrong one.
      //
      // A phone that freezes in a pocket goes on holding an open socket, and
      // this handler therefore runs a silence budget and a sweep phase after
      // the last thing the person actually did — `now()` here would write that
      // gap down as evidence of presence. It used to be far worse and the
      // arithmetic is worth keeping, since it is what this line was written
      // for: `socket.close()` spent `ws`'s 30-second `closeTimeout` waiting for
      // a close frame from a process that was never going to send one, on top
      // of a 12-second budget, so the handler ran some forty seconds late and
      // `agoOrNull`'s sixty-second floor took Home to about a hundred seconds
      // of "In the app now" after the last ping. The close became a
      // `terminate` and the budget came down to HEARTBEAT_TIMEOUT_MS, so the
      // gap is now a few seconds rather than forty — but it is still a gap,
      // still in the same direction, and this is still the line that refuses
      // to count it.
      //
      // `connection.lastSeen` is never later than the truth. It is at worst one
      // HEARTBEAT_INTERVAL_MS early, which the same floor absorbs — the error
      // this leaves is in the direction of saying less than is known rather
      // than more.
      //
      // Written before the presence reporting below, so a snapshot pushed as a
      // result of it already carries the right time.
      heard(connection, connection.lastSeen);
      // Losing a socket is not leaving a channel. It starts the grace period,
      // and reconnecting inside that minute cancels it — so a tunnel, a lift
      // or a backgrounded app costs nobody their place.
      //
      // Deleting the connection first matters: `hasConnection` must not count
      // the one that is closing. And a socket that dies *after* its
      // replacement has connected reports nothing at all, which is what stops
      // a dead connection evicting a user who is demonstrably back.
      for (const channelId of connection.watchingChannels) {
        // **The one ending a speaking report cannot announce for itself.**
        // Every other way of ceasing to be a withheld speaker — the floor
        // released, the party unmuted, stepping out — is read off the channel
        // and needs no message. A process that dies mid-word sends nothing,
        // and this is the socket saying so on its behalf. Unconditional,
        // unlike the presence report below: another device of this account is
        // not this microphone, and leaving the dot lit because somebody's
        // laptop is also connected would be a claim about a phone that has
        // gone.
        channels.speaking(connection.userId, channelId, false);
        if (!hasConnection(connection.userId)) {
          // Stamped from the last thing actually heard rather than from now,
          // which is the same correction `heard` above makes and for the same
          // reason — and here it decides a timer rather than a caption. The
          // grace period runs from this stamp, so using `now()` added the whole
          // of the detection latency to it: somebody was stepped out a timeout
          // later than the minute they were given. Sixty seconds now means
          // sixty seconds since the last ping, whenever it was noticed.
          channels.report(
            channelId,
            connection.userId,
            'DISCONNECTED',
            // **The socket's own report**, which only the socket may take
            // back. A phone holds its place for as long as it holds the
            // audio, and this closing is the evidence that it no longer
            // does — so the media roster must not cancel this grace on the
            // next poll, however long the SFU goes on listing a suspended
            // process. See `Channels.socketDropped`.
            'socket',
            connection.lastSeen
          );
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
