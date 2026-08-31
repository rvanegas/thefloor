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
import { appBuild, CLIENT_KIND } from './build';
import { DEVICE_ID } from './device';
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
    leaderboard: boolean
  ) => void;
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
 * How long a action taken while the socket was down is still worth sending.
 *
 * An action is a thing somebody did at a moment, not a standing instruction.
 * Tapping Record during a handshake should survive the two hundred
 * milliseconds it takes to finish; the same tap should not resurface after a
 * minute in a lift and start recording a conversation nobody is having. Ten
 * seconds is longer than any reconnect that is going to succeed soon — the
 * backoff caps at `RECONNECT_MAX_MS` — and short enough that the room has not
 * moved on.
 */
const QUEUE_TTL_MS = 10_000;

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
  private queued: Array<{ at: number; message: ClientMessage }> = [];

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
            message.leaderboard === true
          );
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

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return;
    const delay = Math.min(
      RECONNECT_BASE_MS * 2 ** this.reconnectAttempt,
      RECONNECT_MAX_MS
    );
    this.reconnectAttempt += 1;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.open();
    }, delay);
  }

  private send(message: ClientMessage): void {
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify(message));
      return;
    }

    // Only actions are worth keeping. `watch.home`, `watch.channel` and the
    // re-entry are re-sent by `onopen` from the state this class already holds,
    // so queueing them would send each twice; a `ping` for a socket that was
    // not there proves nothing about the one that replaces it.
    //
    // ENTER is excluded for the same reason: `act` records `enteredChannel`
    // before calling this, and `onopen` re-enters from that.
    if (message.type !== 'channel.action' || message.action.type === 'ENTER') {
      return;
    }

    this.queued.push({ at: Date.now(), message });
    if (this.queued.length > QUEUE_LIMIT) this.queued.shift();
  }

  /**
   * Sends what was taken while the socket was down, oldest first, dropping
   * anything that has waited past the point of being what the person meant.
   *
   * Called after the restore in `onopen`, so an action lands on a connection
   * that is already watching the right channel and standing in the right room.
   */
  private flushQueued(): void {
    const cutoff = Date.now() - QUEUE_TTL_MS;
    const live = this.queued.filter((entry) => entry.at >= cutoff);
    this.queued = [];
    for (const { message } of live) this.send(message);
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

  act(channelId: string, action: ClientAction): void {
    // Track presence locally so a reconnect can restore it.
    if (action.type === 'ENTER') {
      this.setStanding(channelId);
      this.enteredLostAt = 0;
    }
    // Both give up presence, so neither should be re-entered on a reconnect.
    if (action.type === 'STEP_OUT' || action.type === 'LEAVE_CHANNEL') {
      if (this.enteredChannel === channelId) this.setStanding(null);
    }
    this.watchedChannel = channelId;
    this.send({ type: 'channel.action', channelId, action });
    // After the send, which either wrote it or queued it. Either way somebody
    // is here and waiting on an answer, which is the one thing a backoff is
    // not allowed to sit on. See `reconnectNow`.
    this.reconnectNow();
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
  }
}
