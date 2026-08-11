import {
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
import { WS_URL } from './config';
import { reportSignedOut } from './http';

export type ConnectionStatus = 'connecting' | 'open' | 'closed';

/**
 * The close code the server uses when it will not accept our token. Chosen
 * from the 4000–4999 range, which is reserved for the application.
 */
const UNAUTHORIZED_CLOSE = 4401;

export interface RealtimeHandlers {
  /** Identifies who this connection belongs to, per the server. */
  onHello?: (account: { id: string; displayName: string }) => void;
  onHome?: (home: HomeView) => void;
  onChannel?: (view: ChannelView) => void;
  onChannelGone?: (channelId: string) => void;
  onStatus?: (status: ConnectionStatus) => void;
  onError?: (message: string) => void;
  /** Server time at the moment of the snapshot, for clock alignment. */
  onServerTime?: (serverNow: number) => void;
}

const RECONNECT_BASE_MS = 500;
const RECONNECT_MAX_MS = 10_000;

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
  private reconnectAttempt = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  /** When anything was last heard from the server. */
  private lastSeen = 0;
  private closedByUs = false;

  connect(token: string, handlers: RealtimeHandlers): void {
    this.disconnect();
    this.token = token;
    this.handlers = handlers;
    this.closedByUs = false;
    this.open();
  }

  private open(): void {
    if (!this.token) return;
    this.handlers.onStatus?.('connecting');

    const socket = new WebSocket(`${WS_URL}?token=${encodeURIComponent(this.token)}`);
    this.socket = socket;

    socket.onopen = () => {
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
        // The server removed us on disconnect, so this is a genuine re-entry.
        this.send({
          type: 'channel.action',
          channelId: this.enteredChannel,
          action: { type: 'ENTER' },
        });
      }
    };

    socket.onmessage = (event) => {
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
          this.handlers.onHello?.(message.account);
          break;
        case 'home':
          this.handlers.onHome?.(message.home);
          break;
        case 'channel':
          this.handlers.onServerTime?.(message.view.serverNow);
          this.handlers.onChannel?.(message.view);
          break;
        case 'channel.gone':
          if (this.enteredChannel === message.channelId) this.enteredChannel = null;
          this.handlers.onChannelGone?.(message.channelId);
          break;
        case 'error':
          this.handlers.onError?.(message.message);
          break;
      }
    };

    socket.onclose = (event?: { code?: number }) => {
      this.socket = null;
      this.stopHeartbeat();
      this.handlers.onStatus?.('closed');
      if (this.closedByUs) return;

      // 4401 is the server refusing the credential we connected with, which
      // now happens whenever this account signs in somewhere else. Reconnecting
      // would loop against a token that can never work again, so this is the
      // one close worth treating as final.
      if (event?.code === UNAUTHORIZED_CLOSE) {
        reportSignedOut();
        return;
      }
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
    }
  }

  watchHome(): void {
    this.watchingHome = true;
    this.send({ type: 'watch.home' });
  }

  watchChannel(channelId: string): void {
    this.watchedChannel = channelId;
    this.send({ type: 'watch.channel', channelId });
  }

  unwatchChannel(channelId: string): void {
    if (this.watchedChannel === channelId) this.watchedChannel = null;
    this.send({ type: 'unwatch.channel', channelId });
  }

  act(channelId: string, action: ClientAction): void {
    // Track presence locally so a reconnect can restore it.
    if (action.type === 'ENTER') this.enteredChannel = channelId;
    // Both give up presence, so neither should be re-entered on a reconnect.
    if (action.type === 'STEP_OUT' || action.type === 'LEAVE_CHANNEL') {
      if (this.enteredChannel === channelId) this.enteredChannel = null;
    }
    this.watchedChannel = channelId;
    this.send({ type: 'channel.action', channelId, action });
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
    this.enteredChannel = null;
    this.reconnectAttempt = 0;
  }
}
