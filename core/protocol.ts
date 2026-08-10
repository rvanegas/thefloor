import type { SessionState, UserId } from './types';

/**
 * The wire contract between the app and the server. It lives in core for the
 * same reason the rules do: two copies would drift, and a drifting protocol
 * fails at runtime rather than at compile time.
 *
 * Note what is absent from every client message: a userId. The server takes
 * the actor from the authenticated connection, never from the payload — the
 * mock let the UI dispatch as either party, and the server must not.
 */

export interface PublicAccount {
  id: UserId;
  displayName: string;
}

export type ContactStatus = 'accepted' | 'outgoing' | 'incoming';

export interface ContactView {
  account: PublicAccount;
  status: ContactStatus;
}

export interface InviteView {
  sessionId: string;
  from: PublicAccount;
  createdAt: number;
}

export interface RejoinableView {
  sessionId: string;
  other: PublicAccount;
  otherPresent: boolean;
  createdAt: number;
}

export interface RecordingView {
  id: string;
  sessionId: string;
  other: PublicAccount | null;
  startedAt: number;
  durationMs: number;
}

/** Everything Home renders, pushed as one snapshot. */
export interface HomeView {
  invites: InviteView[];
  rejoinable: RejoinableView[];
  contacts: ContactView[];
  recordings: RecordingView[];
}

/**
 * A session as the client sees it. `serverNow` accompanies every snapshot so
 * countdowns are computed against the server's clock rather than the device's,
 * which drifts and can be set by the user.
 */
export interface SessionView {
  session: SessionState;
  other: PublicAccount;
  serverNow: number;
}

/** Session mutations. The server supplies the actor. */
export type ClientAction =
  | { type: 'ENTER' }
  | { type: 'LEAVE' }
  | { type: 'END' }
  | { type: 'CLAIM_FLOOR' }
  | { type: 'RELEASE_FLOOR' }
  | { type: 'SET_SELF_MUTE'; muted: boolean }
  | { type: 'START_RECORDING' }
  | { type: 'PAUSE_RECORDING' }
  | { type: 'RESUME_RECORDING' }
  | { type: 'STOP_RECORDING' }
  /**
   * Shared playback. Loading a track is absent by design — it arrives as an
   * upload over HTTP, and the server dispatches SET_TRACK itself once the file
   * is on disk and its duration is known. A client naming its own track would
   * be naming a file the server has never seen.
   */
  | { type: 'CLEAR_TRACK' }
  | { type: 'PLAY' }
  | { type: 'PAUSE' }
  | { type: 'SEEK'; positionMs: number }
  | { type: 'SET_VOLUME'; volume: number };

export type ClientMessage =
  /** Start receiving Home snapshots. */
  | { type: 'watch.home' }
  /** Start receiving snapshots for one session. */
  | { type: 'watch.session'; sessionId: string }
  | { type: 'unwatch.session'; sessionId: string }
  | { type: 'session.action'; sessionId: string; action: ClientAction }
  /**
   * Heartbeat. Sent by the client because React Native's WebSocket cannot send
   * protocol-level pings, so a single application-level exchange is what lets
   * *both* ends notice a connection that has died quietly.
   */
  | { type: 'ping' };

export type ServerMessage =
  | { type: 'hello'; account: PublicAccount; serverNow: number }
  | { type: 'home'; home: HomeView }
  | { type: 'session'; view: SessionView }
  /** The session ended or is no longer visible to this user. */
  | { type: 'session.gone'; sessionId: string }
  | { type: 'error'; message: string; code?: string }
  | { type: 'pong'; serverNow: number };
