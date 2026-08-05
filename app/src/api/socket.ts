import type {
  ClientAction,
  ClientMessage,
  HomeView,
  ServerMessage,
  SessionView,
} from '../../../core/protocol';
import { WS_URL } from './config';

export type ConnectionStatus = 'connecting' | 'open' | 'closed';

export interface RealtimeHandlers {
  onHome?: (home: HomeView) => void;
  onSession?: (view: SessionView) => void;
  onSessionGone?: (sessionId: string) => void;
  onStatus?: (status: ConnectionStatus) => void;
  onError?: (message: string) => void;
  /** Server time at the moment of the snapshot, for clock alignment. */
  onServerTime?: (serverNow: number) => void;
}

const RECONNECT_BASE_MS = 500;
const RECONNECT_MAX_MS = 10_000;

/**
 * The session channel. Everything the client shows is pushed from the server;
 * nothing here computes session state.
 *
 * Reconnection matters more than it looks. The server treats a dropped socket
 * as a leave, which force-releases the floor — correct per the spec, and it
 * means a phone that backgrounds for a moment has genuinely left. So on
 * reconnect this re-establishes what it was watching and re-enters the session
 * it was in, rather than silently showing a stale screen.
 */
export class Realtime {
  private socket: WebSocket | null = null;
  private token: string | null = null;
  private handlers: RealtimeHandlers = {};
  private watchingHome = false;
  private watchedSession: string | null = null;
  /** Sessions this client considers itself present in, to restore on reconnect. */
  private enteredSession: string | null = null;
  private reconnectAttempt = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
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
      this.handlers.onStatus?.('open');
      // Restore whatever this client was doing before the drop.
      if (this.watchingHome) this.send({ type: 'watch.home' });
      if (this.watchedSession) {
        this.send({ type: 'watch.session', sessionId: this.watchedSession });
      }
      if (this.enteredSession) {
        // The server removed us on disconnect, so this is a genuine re-entry.
        this.send({
          type: 'session.action',
          sessionId: this.enteredSession,
          action: { type: 'ENTER' },
        });
      }
    };

    socket.onmessage = (event) => {
      let message: ServerMessage;
      try {
        message = JSON.parse(String(event.data)) as ServerMessage;
      } catch {
        return;
      }

      switch (message.type) {
        case 'hello':
          this.handlers.onServerTime?.(message.serverNow);
          break;
        case 'home':
          this.handlers.onHome?.(message.home);
          break;
        case 'session':
          this.handlers.onServerTime?.(message.view.serverNow);
          this.handlers.onSession?.(message.view);
          break;
        case 'session.gone':
          if (this.enteredSession === message.sessionId) this.enteredSession = null;
          this.handlers.onSessionGone?.(message.sessionId);
          break;
        case 'error':
          this.handlers.onError?.(message.message);
          break;
      }
    };

    socket.onclose = () => {
      this.socket = null;
      this.handlers.onStatus?.('closed');
      if (!this.closedByUs) this.scheduleReconnect();
    };

    socket.onerror = () => {
      // onclose always follows, which is where reconnection is handled.
    };
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

  watchSession(sessionId: string): void {
    this.watchedSession = sessionId;
    this.send({ type: 'watch.session', sessionId });
  }

  unwatchSession(sessionId: string): void {
    if (this.watchedSession === sessionId) this.watchedSession = null;
    this.send({ type: 'unwatch.session', sessionId });
  }

  act(sessionId: string, action: ClientAction): void {
    // Track presence locally so a reconnect can restore it.
    if (action.type === 'ENTER') this.enteredSession = sessionId;
    if (action.type === 'LEAVE' || action.type === 'END') {
      if (this.enteredSession === sessionId) this.enteredSession = null;
    }
    this.watchedSession = sessionId;
    this.send({ type: 'session.action', sessionId, action });
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
    this.watchedSession = null;
    this.enteredSession = null;
    this.reconnectAttempt = 0;
  }
}
