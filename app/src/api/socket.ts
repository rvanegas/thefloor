import {
  DISCONNECT_GRACE_MS,
  HEARTBEAT_INTERVAL_MS,
  HEARTBEAT_TIMEOUT_MS,
} from '../../../core/constants';
import type {
  ClientAction,
  ClientMessage,
  HomeView,
  ServerMessage,
  ChannelView,
} from '../../../core/protocol';
import type { AccountSettings } from '../../../core/settings';
import { appBuild, CLIENT_KIND } from './build';
import { DEVICE_ID } from './device';
import { notificationPermission } from './notify';
import { WS_URL } from './config';
import { reportSignedOut } from './http';

export type ConnectionStatus = 'connecting' | 'open' | 'closed';

/**
 * The close code the server uses when it will not accept our token. Chosen
 * from the 4000–4999 range, which is reserved for the application.
 */
const UNAUTHORIZED_CLOSE = 4401;

export interface RealtimeHandlers {
  /**
   * Identifies who this connection belongs to, per the server.
   *
   * `debug` is the diagnostic panel's gate and `leaderboard` the standings',
   * and both are false against any server that has never heard of them — each
   * field is optional and sent only when true. Passed alongside the account
   * rather than folded into it, because neither is part of the identity every
   * roster carries: see `ServerMessage` in core/protocol.ts.
   */
  onHello?: (
    account: { id: string; displayName: string },
    debug: boolean,
    leaderboard: boolean,
    settings: AccountSettings | null
  ) => void;
  /**
   * This account's settings, as the server now holds them — sent on every
   * change, to every device signed in as this person.
   *
   * Null in `onHello` rather than absent-as-false, unlike the two flags beside
   * it: a server that predates the field has said nothing about the account's
   * preferences, which is not the same as saying it holds the defaults. The
   * caller keeps what it had.
   */
  onSettings?: (settings: AccountSettings) => void;
  onHome?: (home: HomeView) => void;
  onChannel?: (view: ChannelView) => void;
  onChannelGone?: (channelId: string) => void;
  /**
   * The conversation moved to another channel — somebody was asked into an
   * unnamed one and arrived. The audio does not need touching; the destination
   * inherited the room.
   */
  onChannelMoved?: (from: string, to: string) => void;
  /**
   * Another of this account's devices has stepped into a channel, so this one
   * is no longer the device standing anywhere.
   *
   * Nothing about the channel is said, because nothing about it has changed —
   * see `ServerMessage` in core/protocol.ts. What the app does with it is drop
   * the audio and stop drawing itself as being in a room; what the socket does
   * with it is forget what it would re-enter on a reconnect.
   */
  onDisplaced?: () => void;
  /**
   * Which channel *this device* is standing in, or null for none.
   *
   * **Not the same question as where the account is present**, and the whole
   * reason this exists. An account may be present in a channel while this
   * particular copy of the app holds nothing — another device entered, or this
   * process launched a moment ago into a channel it never entered. A snapshot
   * cannot tell the two apart: it reports the account, and the account is
   * present either way.
   *
   * So this is the app's own record of what it has asserted, and it is what
   * the audio and the Step In / Step Out button follow. `enteredChannel` is
   * the field, and every transition of it is reported here — which is why the
   * assignments all go through `setStanding` rather than writing it directly.
   */
  onStanding?: (channelId: string | null) => void;
  onStatus?: (status: ConnectionStatus) => void;
  /**
   * Whether being disconnected has lasted past `OFFLINE_AFTER_MS`, which is
   * the point at which it stops being a blip and becomes a state.
   *
   * Separate from `onStatus` rather than a fourth `ConnectionStatus`, because
   * it is sticky and the status is not: the retry loop cycles
   * `connecting`/`closed` several times a second inside the window, and an
   * offline that any of those overwrote would flicker. True until an open
   * succeeds, and reported once in each direction.
   */
  onOffline?: (offline: boolean) => void;
  onError?: (message: string) => void;
  /** Server time at the moment of the snapshot, for clock alignment. */
  onServerTime?: (serverNow: number) => void;
}

/**
 * A handshake still in flight, as `readyState` spells it.
 *
 * The literal rather than `WebSocket.CONNECTING`, which not every environment
 * this runs in carries on the constructor — and being wrong about it here
 * would mean tearing down a connection that was about to succeed.
 */
const CONNECTING = 0;

const RECONNECT_BASE_MS = 500;
const RECONNECT_MAX_MS = 10_000;

/**
 * The window in which a dropped socket is not yet *being offline*, and the
 * whole of this file's notion of either.
 *
 * It is one constant doing one job read two ways. An action is a thing
 * somebody did at a moment, not a standing instruction: tapping Record during
 * a handshake should survive the two hundred milliseconds it takes to finish,
 * and the same tap should not resurface after a minute in a lift and start
 * recording a conversation nobody is having. So there is a window in which a
 * queued action is still worth sending — and that same window is exactly how
 * long reconnecting is worth doing *hard*, because it is how long there is
 * anything left to save. Past it the queue is empty by definition and the
 * backoff below is right again.
 *
 * **It was two constants, and the second one's reasoning was wrong.** The
 * queue's old comment justified ten seconds as "longer than any reconnect
 * that is going to succeed soon — the backoff caps at `RECONNECT_MAX_MS`".
 * The cap is on the *interval*, not on elapsed time: doubling from 500ms puts
 * cumulative attempts at 0.5s, 1.5s, 3.5s, 7.5s and then 15.5s, so a server
 * that came back at eight seconds was met by a client that discarded the
 * action at ten and did not knock again until fifteen. The window did not
 * cover the backoff it cited. It does now, because the pace inside it is
 * fixed rather than doubling.
 *
 * Expiry is global rather than per-action, so crossing this is one event:
 * the queue is cleared, and the app is offline, and those are the same
 * sentence. See planning/decisions/2026-09-16-being-offline-is-one-state.md.
 */
export const OFFLINE_AFTER_MS = 10_000;

/**
 * The pace inside that window: fixed and short, because every attempt that
 * misses costs a queued action its life.
 *
 * Jittered, which matters more here than it did under the backoff. Doubling
 * spread clients out on its own; a flat second does not, and the case that
 * makes this real is a deploy — every phone sees the same close at the same
 * moment and would knock in lockstep on a server that has just finished
 * starting.
 */
const RETRY_FAST_MS = 1_000;
const RETRY_JITTER = 0.25;

/** `ms` give or take `RETRY_JITTER` of it, so that clients do not synchronise. */
function jitter(ms: number): number {
  return Math.round(ms * (1 + (Math.random() * 2 - 1) * RETRY_JITTER));
}

/** Enough for any plausible burst of taps; a cap so an offline hour cannot grow without bound. */
const QUEUE_LIMIT = 32;

/**
 * The channel channel. Everything the client shows is pushed from the server;
 * nothing here computes channel state.
 *
 * Reconnection matters more than it looks. The server treats a dropped socket
 * as a leave, which force-releases the floor — correct per the spec, and it
 * means a phone that backgrounds for a moment has genuinely left. So on
 * reconnect this re-establishes what it was watching and re-enters the channel
 * it was in, rather than silently showing a stale screen.
 */
export class Realtime {
  private socket: WebSocket | null = null;
  private token: string | null = null;
  private handlers: RealtimeHandlers = {};
  private watchingHome = false;
  private watchedChannel: string | null = null;
  /** Channels this client considers itself present in, to restore on reconnect. */
  private enteredChannel: string | null = null;
  /**
   * When the socket that was carrying that presence went away.
   *
   * The re-entry below is only honest inside `DISCONNECT_GRACE_MS`, which is
   * the window in which the server has not removed anybody: inside it nothing
   * happened, and re-entering restores a state that was never given up.
   * Outside it the server stepped this person out a while ago, everybody in
   * the room watched them go, and the account may since have entered somewhere
   * else from another device — so walking back in would be this client
   * asserting a stale belief over what has happened since.
   *
   * That is not hypothetical. A device that cannot hold a connection re-sends
   * ENTER on every attempt, and with several sessions per account since
   * 2026-08-24 it takes the room from the phone in somebody's hand, or undoes
   * a Step Out taken on another device, once per reconnect.
   */
  private enteredLostAt = 0;
  private reconnectAttempt = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  /** When anything was last heard from the server. */
  private lastSeen = 0;
  private closedByUs = false;
  /**
   * Actions taken while the socket was not open, waiting for one that is.
   *
   * `send` used to drop anything it could not write, silently and with no way
   * for the caller to know — so a tap that landed in the gap between arriving
   * in a channel and the handshake completing simply ceased to exist. No row,
   * no state change, no error, and a button that appeared to do nothing. That
   * is the worst shape a bug can take: the user is told they did something and
   * the system disagrees.
   */
  private queued: ClientMessage[] = [];
  /**
   * When the socket went away, or 0 while there is one.
   *
   * What it decides is the retry pace and the moment the app is offline —
   * both read from the same clock, which is the point. Distinct from
   * `enteredLostAt`, which is about presence and keeps its own 60-second
   * question.
   */
  private disconnectedSince = 0;
  private offline = false;
  private offlineTimer: ReturnType<typeof setTimeout> | null = null;

  connect(token: string, handlers: RealtimeHandlers): void {
    this.disconnect();
    this.token = token;
    this.handlers = handlers;
    this.closedByUs = false;
    this.open();
  }

  private open(): void {
    if (!this.token) return;

    // Whatever was here is not ours any more. Its handlers are neutered below
    // by the identity check, so this is only about not leaving a live socket
    // open with nothing referencing it — the server would carry it until the
    // sweep, and the phone would carry it until the process ended.
    const previous = this.socket;
    this.socket = null;
    previous?.close();

    // Before the socket exists, because the clock is about not having one.
    // A reconnect attempt is inside the same outage as the close that
    // prompted it, and `beginOutage` is idempotent for exactly that reason.
    this.beginOutage();
    this.handlers.onStatus?.('connecting');

    // A query parameter rather than a header, because the token is already one
    // and for the same reason: React Native's WebSocket does not carry custom
    // headers portably. The build rides beside it so that somebody merely
    // *connected* — sitting in a channel, making no HTTP calls for an hour —
    // is still counted. See build.ts.
    const build = appBuild();
    const socket = new WebSocket(
      `${WS_URL}?token=${encodeURIComponent(this.token)}` +
        (build === null ? '' : `&build=${build}`) +
        // A query parameter for the same reason `build` is one: no WebSocket
        // implementation this app runs on carries custom headers. Omitted by
        // native, whose absence the server reads as native.
        (CLIENT_KIND === null ? '' : `&client=${CLIENT_KIND}`) +
        // Mirrored for the reason the build is, and it matters more here:
        // somebody sitting in a channel makes almost no HTTP calls, so the
        // header alone would go stale for exactly the people using the app.
        // Read at connect and not afterwards — see the server's Connection.
        (notificationPermission() === null
          ? ''
          : `&notify=${notificationPermission()}`) +
        // Which copy of the app this is, so the server can displace the
        // account's *other* devices without displacing this one when it
        // reconnects. It cannot use the token for that any more: two browser
        // tabs share one. See device.ts.
        `&device=${encodeURIComponent(DEVICE_ID)}`
    );
    this.socket = socket;

    /**
     * Whether the events arriving are from the socket this client is using.
     *
     * A WebSocket that has been replaced goes on delivering events — a close
     * in particular arrives whenever the network gets round to it, which can
     * be long after something else opened its successor. Every handler below
     * writes shared state, so without this an old socket's close nulls
     * `this.socket`, stops the live heartbeat, reports the connection down and
     * schedules a reconnect, all against a connection that is perfectly
     * healthy. What that leaves is the worst version of being connected: an
     * open socket nothing references, every `send` queueing instead of
     * writing, and a fresh connection opened on every backoff — which is what
     * a phone reconnecting on a ten-second cadence looks like from a server.
     *
     * Two ordinary things overlap sockets. `connect` closes the old one and
     * opens the new one in the same turn, and the close event lands after
     * `closedByUs` has been set false again; and `resume` opens one whenever
     * the current socket is not OPEN, which includes a handshake still in
     * flight after a spell in the background.
     */
    const current = () => this.socket === socket;

    socket.onopen = () => {
      if (!current()) return;
      this.reconnectAttempt = 0;
      // Before anything is restored, because the wall coming down is about
      // the connection rather than about what it manages to recover.
      this.clearOffline();
      this.lastSeen = Date.now();
      this.startHeartbeat();
      this.handlers.onStatus?.('open');
      // Restore whatever this client was doing before the drop.
      if (this.watchingHome) this.send({ type: 'watch.home' });
      if (this.watchedChannel) {
        this.send({ type: 'watch.channel', channelId: this.watchedChannel });
      }
      if (this.enteredChannel) {
        // The server removed us on disconnect, so this is a genuine re-entry —
        // but only while it is still true that nothing has happened. Past the
        // grace period this client is not restoring a state, it is asserting
        // an old one: see `enteredLostAt`.
        const gone = this.enteredLostAt === 0 ? 0 : Date.now() - this.enteredLostAt;
        if (gone <= DISCONNECT_GRACE_MS) {
          this.send({
            type: 'channel.action',
            channelId: this.enteredChannel,
            action: { type: 'ENTER' },
          });
        } else {
          // Stepped out by the server a while ago, and everybody in the room
          // watched it happen. The snapshot that arrives from the watch above
          // says so, and the screen offers Step In.
          this.setStanding(null);
        }
      }
      this.enteredLostAt = 0;
      this.flushQueued();
    };

    socket.onmessage = (event) => {
      if (!current()) return;
      // Anything at all is proof the connection is alive, not only a pong.
      this.lastSeen = Date.now();

      let message: ServerMessage;
      try {
        message = JSON.parse(String(event.data)) as ServerMessage;
      } catch {
        return;
      }

      switch (message.type) {
        case 'pong':
          this.handlers.onServerTime?.(message.serverNow);
          break;

        case 'hello':
          this.handlers.onServerTime?.(message.serverNow);
          this.handlers.onHello?.(
            message.account,
            message.debug === true,
            message.leaderboard === true,
            message.settings ?? null
          );
          break;
        case 'settings':
          this.handlers.onSettings?.(message.settings);
          break;
        case 'home':
          this.handlers.onHome?.(message.home);
          break;
        case 'channel':
          this.handlers.onServerTime?.(message.view.serverNow);
          this.handlers.onChannel?.(message.view);
          break;
        case 'channel.gone':
          if (this.enteredChannel === message.channelId) this.setStanding(null);
          this.handlers.onChannelGone?.(message.channelId);
          break;
        case 'channel.moved':
          // The conversation is in a different channel now. Follow it here as
          // well as upstairs: this is what a reconnect would re-enter, and
          // re-entering the channel everybody has left would walk back out of
          // the conversation on the first blip of signal.
          if (this.enteredChannel === message.from) this.setStanding(message.to);
          if (this.watchedChannel === message.from) {
            this.send({ type: 'unwatch.channel', channelId: message.from });
            this.watchChannel(message.to);
          }
          this.handlers.onChannelMoved?.(message.from, message.to);
          break;
        case 'displaced':
          // This session is not the one standing anywhere: another of this
          // account's devices has entered a channel, or has stepped out of the
          // one this account was in. Both are the same fact from here, and it
          // is the only one that matters — the account has one voice and this
          // is not where it is.
          //
          // Forgetting `enteredChannel` is the load-bearing half: without it
          // the next reconnect would re-send ENTER and take the room back from
          // the device somebody is holding, or undo a Step Out taken there.
          this.setStanding(null);
          this.handlers.onDisplaced?.();
          break;
        case 'error':
          this.handlers.onError?.(message.message);
          break;
      }
    };

    socket.onclose = (event?: { code?: number }) => {
      // Ahead of the identity check, alone among the work here, because it is
      // about the credential rather than about this socket: every connection
      // this client makes carries the same token, so one of them being refused
      // refuses all of them, whichever socket heard it.
      if (!this.closedByUs && event?.code === UNAUTHORIZED_CLOSE) {
        // 4401 is the server refusing the credential we connected with.
        // Reconnecting would loop against a token that can never work again,
        // so this is the one close worth treating as final.
        reportSignedOut();
        return;
      }

      // An orphan's close says nothing about the connection this client is
      // using. See `current`.
      if (!current()) return;

      this.socket = null;
      this.stopHeartbeat();
      this.handlers.onStatus?.('closed');
      // Presence has an age from here on, and the age is what decides whether
      // re-entering on the next connection is restoring something or making
      // something up. Stamped even for a close of our own, since `disconnect`
      // clears the channel anyway and a stamp costs nothing.
      if (this.enteredChannel && this.enteredLostAt === 0) {
        this.enteredLostAt = Date.now();
      }
      if (this.closedByUs) return;
      this.beginOutage();
      this.scheduleReconnect();
    };

    socket.onerror = () => {
      // onclose always follows, which is where reconnection is handled.
    };
  }

  /**
   * Proves the connection is alive in both directions.
   *
   * The server needs to hear from us or it starts our grace period; we need to
   * hear from it or we sit on a dead socket believing all is well. A socket
   * can die without either end being told, and waiting for the OS to notice
   * takes hours — so silence past the timeout is treated as death and the
   * connection is replaced.
   *
   * Being wrong is cheap: an unnecessary reconnect costs a round trip, where a
   * missed disconnect costs every timer that depends on knowing someone left.
   */
  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      if (Date.now() - this.lastSeen > HEARTBEAT_TIMEOUT_MS) {
        // onclose runs next, which reconnects.
        this.socket?.close();
        return;
      }
      this.send({ type: 'ping' });
    }, HEARTBEAT_INTERVAL_MS);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = null;
  }

  /**
   * The app has come back to the foreground, where the socket is very likely
   * dead and nothing has noticed.
   *
   * iOS suspends the process rather than telling anyone: timers stop, the
   * socket is torn down underneath us, and `onclose` may not arrive until the
   * process is scheduled again. Waiting for the heartbeat to work that out
   * costs up to HEARTBEAT_TIMEOUT_MS of showing stale state as though it were
   * live — and the timers that would notice were themselves suspended, so the
   * clock only starts on resume.
   *
   * An open-looking socket is therefore probed rather than trusted. A dead one
   * is replaced now, without waiting out a backoff that may have grown to ten
   * seconds while the phone was asleep — the delay was earned by failures that
   * happened in a different network condition, and possibly on a different
   * network.
   */
  resume(): void {
    if (!this.token || this.closedByUs) return;

    if (this.socket?.readyState === WebSocket.OPEN) {
      this.lastSeen = Date.now();
      // Restarted because the interval did not run while suspended.
      this.startHeartbeat();
      this.send({ type: 'ping' });
      return;
    }

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.reconnectAttempt = 0;
    this.open();
  }

  /**
   * Stops waiting out a backoff, because somebody has just done something.
   *
   * The backoff is right for a client failing on its own: doubling to ten
   * seconds is what keeps a phone with no signal from hammering a server it
   * cannot reach. It is wrong the moment a person taps a button. The delay
   * still to run was earned by failures nobody was waiting on, and what it
   * costs now is the whole of the symptom — an action is held until the timer
   * happens to fire, up to ten seconds later, with nothing on screen to say
   * so, and dropped entirely if the reconnect takes longer than the queue's
   * ten-second life. A button that does nothing for ten seconds and then
   * either works or does not is indistinguishable from a button that is
   * broken.
   *
   * The same argument `resume` makes, from the other end: there it is the app
   * coming back, here it is somebody using it.
   *
   * A handshake already in flight is left alone, which is where this differs
   * from `resume`. A tap is not evidence that the network has changed, so
   * restarting a connection that may be about to succeed would push the thing
   * being asked for further away — and a run of taps would restart it once
   * each.
   */
  private reconnectNow(): void {
    if (!this.token || this.closedByUs) return;
    const state = this.socket?.readyState;
    if (state === WebSocket.OPEN || state === CONNECTING) return;

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.reconnectAttempt = 0;
    this.open();
  }

  /**
   * When to knock again, which is two different questions either side of
   * `OFFLINE_AFTER_MS`.
   *
   * Inside the window there is a queued action whose life is running out, so
   * the pace is fixed and short and the only thing that matters is not
   * missing the moment the server comes back. Past it the queue is empty,
   * nothing is waiting on this, and the original reasoning returns intact:
   * doubling to ten seconds is what keeps a phone with no signal from
   * hammering a server it cannot reach.
   *
   * The backoff is not restarted at the handover — `reconnectAttempt` has
   * been counting throughout, so a phone with no route reaches the cap
   * promptly rather than walking up from half a second again.
   */
  private scheduleReconnect(): void {
    if (this.reconnectTimer) return;

    const down = this.disconnectedSince === 0 ? 0 : Date.now() - this.disconnectedSince;
    const delay =
      down < OFFLINE_AFTER_MS
        ? jitter(RETRY_FAST_MS)
        : Math.min(RECONNECT_BASE_MS * 2 ** this.reconnectAttempt, RECONNECT_MAX_MS);

    this.reconnectAttempt += 1;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.open();
    }, delay);
  }

  /**
   * Starts the clock that the retry pace and the wall are both read from.
   *
   * **Called from `open` as well as from `onclose`**, because not having a
   * socket is the condition rather than losing one. A handshake that never
   * completes fires no close — the first connection of a launch with no
   * network is exactly that — so a clock started only on close would leave
   * the app retrying behind a spinner indefinitely, with the queue never
   * expiring and nothing ever saying why.
   *
   * Stamped once per gap. A close arriving while we are already down, or an
   * attempt opening while we are, must not push the deadline out in front of
   * itself: whichever of the two gets here first owns the clock.
   */
  private beginOutage(): void {
    if (this.disconnectedSince === 0) this.disconnectedSince = Date.now();
    if (this.offline || this.offlineTimer) return;
    this.offlineTimer = setTimeout(
      () => this.goOffline(),
      Math.max(0, this.disconnectedSince + OFFLINE_AFTER_MS - Date.now())
    );
  }

  /**
   * The window has run out with nothing to show for it.
   *
   * Two things happen and they are one statement: everything queued is
   * discarded, and the app is told it is offline. The screen that goes up on
   * the back of this is the only notice those actions ever get, which is why
   * the discard belongs here rather than in `flushQueued` — a queue that
   * expired quietly somewhere else would leave the wall announcing a loss it
   * did not cause and could not describe.
   */
  private goOffline(): void {
    this.offlineTimer = null;
    if (this.offline) return;
    this.offline = true;
    this.queued = [];
    this.handlers.onOffline?.(true);
  }

  /** Back, whatever it was. Called from `onopen` and from `disconnect`. */
  private clearOffline(): void {
    if (this.offlineTimer) {
      clearTimeout(this.offlineTimer);
      this.offlineTimer = null;
    }
    this.disconnectedSince = 0;
    if (!this.offline) return;
    this.offline = false;
    this.handlers.onOffline?.(false);
  }

  /**
   * Writes a message, or keeps it for the next socket.
   *
   * **Returns whether it actually went**, which is the whole of what callers
   * were missing. A screen that dispatches an action and records it as done
   * on the next line is saying something it has no evidence for — and when
   * the send was queued and the queue is later discarded, the screen's own
   * record is what stops it ever trying again. `false` does not mean the
   * action is lost; it means nothing may yet be concluded from it.
   */
  private send(message: ClientMessage): boolean {
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify(message));
      return true;
    }

    // Only actions are worth keeping. `watch.home`, `watch.channel` and the
    // re-entry are re-sent by `onopen` from the state this class already holds,
    // so queueing them would send each twice; a `ping` for a socket that was
    // not there proves nothing about the one that replaces it.
    //
    // ENTER is excluded for the same reason: `act` records `enteredChannel`
    // before calling this, and `onopen` re-enters from that.
    if (message.type !== 'channel.action' || message.action.type === 'ENTER') {
      return false;
    }

    this.queued.push(message);
    if (this.queued.length > QUEUE_LIMIT) this.queued.shift();
    return false;
  }

  /**
   * Sends what was taken while the socket was down, oldest first.
   *
   * Called after the restore in `onopen`, so an action lands on a connection
   * that is already watching the right channel and standing in the right room.
   *
   * **No per-message expiry here any more.** It used to filter on each entry's
   * own age, which meant the queue and the app disagreed about when an action
   * had stopped being what the person meant — one dropping them individually,
   * nothing announcing it. Expiry is now global and happens in `goOffline`, so
   * anything still here is inside the window by construction and every message
   * in it either lands or was already declared lost.
   */
  private flushQueued(): void {
    const pending = this.queued;
    this.queued = [];
    for (const message of pending) this.send(message);
  }

  watchHome(): void {
    this.watchingHome = true;
    this.send({ type: 'watch.home' });
  }

  watchChannel(channelId: string): void {
    this.watchedChannel = channelId;
    this.send({ type: 'watch.channel', channelId });
  }

  /**
   * Records which channel this device is standing in, and says so.
   *
   * **The only writer of `enteredChannel`**, so that nothing can move without
   * the app hearing about it. The field had been assigned from seven places
   * and read only here, which was fine while its whole job was deciding
   * whether to re-send ENTER on a reconnect; it is now also what the screen
   * and the audio follow, and a state the UI mirrors cannot be kept in a
   * private field that changes silently.
   *
   * Idempotent, because several of those seven set it to what it already was
   * and a redundant notification would re-render for nothing.
   */
  private setStanding(channelId: string | null): void {
    if (this.enteredChannel === channelId) return;
    this.enteredChannel = channelId;
    this.handlers.onStanding?.(channelId);
  }

  /**
   * Stand in a channel this device is already in without asserting it again.
   *
   * **Creating a channel is entering it** — `createChannel` in core puts the
   * initiator in `present` the moment it exists — so the one route into a
   * channel that never sends ENTER is the one that starts it. Without this the
   * creator would watch their own new channel from outside: the roster would
   * say they were in it, this device would know it had entered nothing, and
   * the screen would offer them a way in to where they already were.
   *
   * It also buys the thing the create path quietly lacked. `enteredChannel` is
   * what a reconnect re-enters from, so a channel created and then dropped by
   * a blip was one nothing re-asserted, and its creator was stepped out when
   * the grace ran out.
   */
  standIn(channelId: string): void {
    this.setStanding(channelId);
    this.enteredLostAt = 0;
  }

  unwatchChannel(channelId: string): void {
    if (this.watchedChannel === channelId) this.watchedChannel = null;
    this.send({ type: 'unwatch.channel', channelId });
  }

  /**
   * Dispatches an action, and says whether it actually went out.
   *
   * `false` is not "it failed" — a queued action still lands if the socket
   * comes back inside `OFFLINE_AFTER_MS`. It is "nothing may be concluded
   * from this yet", which is precisely what a caller that records the action
   * as done on the next line is getting wrong.
   */
  act(channelId: string, action: ClientAction): boolean {
    // Track presence locally so a reconnect can restore it.
    if (action.type === 'ENTER') {
      this.setStanding(channelId);
      this.enteredLostAt = 0;
    }
    // All four give up presence, so none should be re-entered on a reconnect.
    //
    // **`DECLARE_NEARBY` is here whether or not it moved anything**, and that
    // is the safe direction: sent from inside a channel it is a step-out, and
    // sent from outside one this device was not standing there to begin with,
    // so clearing is a no-op. Left out, a phone that declared nearby and then
    // blipped would re-enter the room it had just chosen to be outside — with a
    // microphone, since stepping in is the claim.
    if (
      action.type === 'STEP_OUT' ||
      action.type === 'ATTENTION_EXPIRED' ||
      action.type === 'DECLARE_NEARBY' ||
      action.type === 'LEAVE_CHANNEL'
    ) {
      if (this.enteredChannel === channelId) this.setStanding(null);
    }
    this.watchedChannel = channelId;
    const sent = this.send({ type: 'channel.action', channelId, action });
    // After the send, which either wrote it or queued it. Either way somebody
    // is here and waiting on an answer, which is the one thing a backoff is
    // not allowed to sit on. See `reconnectNow`.
    this.reconnectNow();
    return sent;
  }

  /**
   * Says somebody is attending the application, if there is a socket to say it
   * on.
   *
   * **Named rooms rather than a bare "I am here"** — see
   * `ClientMessage.attentive`. The caller passes what this device is
   * attending: the channel on screen, and the one it is standing in.
   *
   * **Dropped rather than queued when there is no socket**, unlike an action.
   * An action is something a person asked for and expects to have happened;
   * this is evidence about a moment, and a moment that has passed is not worth
   * replaying — the reconnection will produce fresh evidence of its own within
   * the report interval, and `hello` seeds the rooms this device is standing
   * in besides.
   *
   * Reports whether it went, so the caller's rate-limit gate only advances on
   * a message that was actually sent.
   */
  attentive(channelIds: string[]): boolean {
    if (this.socket?.readyState !== WebSocket.OPEN) return false;
    // Nothing to attribute it to is nothing to say. Somebody on Home with no
    // channel open and standing nowhere is attending the application and no
    // room in it, and there is no clock that fact belongs to.
    if (channelIds.length === 0) return false;
    this.send({ type: 'attentive', channelIds });
    return true;
  }

  /**
   * Says this device is speaking into a channel that is withholding it, or
   * has stopped — see `ClientMessage.channel.speaking`.
   *
   * **Dropped rather than queued when there is no socket**, on `attentive`'s
   * reasoning and with a second one of its own: the server clears every one of
   * these when a connection closes, so a `false` that could not be sent has
   * already been applied by the time it could have arrived. A `true` that
   * could not be sent is a moment that has passed, and the next edge is two
   * seconds away.
   */
  speaking(channelId: string, speaking: boolean): boolean {
    if (this.socket?.readyState !== WebSocket.OPEN) return false;
    this.send({ type: 'channel.speaking', channelId, speaking });
    return true;
  }

  disconnect(): void {
    this.closedByUs = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.socket?.close();
    this.socket = null;
    this.watchingHome = false;
    this.watchedChannel = null;
    this.setStanding(null);
    this.enteredLostAt = 0;
    // Signing out is not a gap to be bridged. Anything still waiting belongs to
    // the session being ended, and replaying it into the next one would act as
    // whoever signs in next.
    this.queued = [];
    this.reconnectAttempt = 0;
    // Signing out is not being offline, and leaving the wall up over an auth
    // screen would be the app refusing the one thing still available.
    this.clearOffline();
  }
}
