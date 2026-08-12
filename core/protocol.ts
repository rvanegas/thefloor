import type { ChannelState, UserId } from './types';

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

/**
 * A person's profile: what they choose to say about themselves.
 *
 * Separate from `PublicAccount` rather than folded into it, because
 * PublicAccount is embedded in every roster, invitation and recording row that
 * crosses the wire, and a bio on each of those would be a paragraph repeated
 * per participant per snapshot to be shown in none of them. A profile is
 * fetched when somebody asks to see one.
 */
export interface ProfileView {
  account: PublicAccount;
  /** Markdown, as typed. Null when they have not written one. */
  bio: string | null;
}

export type ContactStatus = 'accepted' | 'outgoing' | 'incoming';

export interface ContactView {
  account: PublicAccount;
  status: ContactStatus;
}

export interface InviteView {
  channelId: string;
  from: PublicAccount;
  createdAt: number;
}

export interface RejoinableView {
  channelId: string;
  /** The channel's name, if anyone has given it one. */
  name: string | null;
  /** The other participants, in channel order. */
  others: PublicAccount[];
  /** How many participants are currently present. */
  presentCount: number;
  createdAt: number;
  /** When anybody was last in it, which is what Home orders on. */
  lastActiveAt: number;
}

export interface RecordingView {
  id: string;
  channelId: string;
  /**
   * What to call it. Fixed when the run stopped, identical for everybody who
   * was in it, and never recomputed — so two people can talk about the same
   * recording by the same name.
   */
  name: string;
  /** The other participants of the recorded channel, in channel order. */
  others: PublicAccount[];
  startedAt: number;
  /**
   * When capture stopped. Not `startedAt + durationMs`: a run that was paused
   * ran for longer than it recorded, and this is the wall-clock end.
   */
  endedAt: number;
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
 * A channel as the client sees it. `serverNow` accompanies every snapshot so
 * countdowns are computed against the server's clock rather than the device's,
 * which drifts and can be set by the user.
 */
export interface ChannelView {
  channel: ChannelState;
  /**
   * Everything recorded in this channel, newest first, visible to anyone who
   * belongs to it. Recordings live on the channel screen because they belong
   * to the channel: it is what names them, and deleting it deletes them.
   */
  recordings: RecordingView[];
  /**
   * Every participant, the viewer included — the name directory for the ids
   * in `channel.participants`, `present`, `floor.holder` and `selfMuted`.
   */
  participants: PublicAccount[];
  serverNow: number;
}

/** Channel mutations. The server supplies the actor. */
export type ClientAction =
  | { type: 'ENTER' }
  /** Give up presence, keep membership. */
  | { type: 'STEP_OUT' }
  /**
   * Destroy the channel and every recording made in it. Only its last member
   * may — everyone else leaves instead, and the last member cannot.
   */
  | { type: 'DELETE_CHANNEL' }
  /** Give up membership; ends the channel if you were the last member. */
  | { type: 'LEAVE_CHANNEL' }
  /**
   * Brings a contact of the sender into the channel. Carries a contact id
   * rather than the reducer's inviteeId because whether the two are contacts
   * is the server's check to make before the reducer ever sees it.
   */
  | { type: 'INVITE'; contactId: string }
  /** Names or renames the channel; an empty string clears the name. */
  | { type: 'SET_NAME'; name: string }
  /** Writes the channel's Markdown description; an empty string clears it. */
  | { type: 'SET_DESCRIPTION'; description: string }
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
  /** Start receiving snapshots for one channel. */
  | { type: 'watch.channel'; channelId: string }
  | { type: 'unwatch.channel'; channelId: string }
  | { type: 'channel.action'; channelId: string; action: ClientAction }
  /**
   * Heartbeat. Sent by the client because React Native's WebSocket cannot send
   * protocol-level pings, so a single application-level exchange is what lets
   * *both* ends notice a connection that has died quietly.
   */
  | { type: 'ping' };

export type ServerMessage =
  | { type: 'hello'; account: PublicAccount; serverNow: number }
  | { type: 'home'; home: HomeView }
  | { type: 'channel'; view: ChannelView }
  /** The channel ended or is no longer visible to this user. */
  | { type: 'channel.gone'; channelId: string }
  /**
   * The conversation you were in has moved, because somebody was asked into an
   * unnamed channel and arrived. `to` is where the people are now; `from` is
   * still there, still yours, and still holds whatever was recorded in it.
   *
   * Sent instead of `channel.gone` so the app can follow rather than fall back
   * to Home. The audio needs no attention: the destination inherits the room,
   * so a client that switches what it watches and re-renders has already done
   * everything the move requires of it.
   */
  | { type: 'channel.moved'; from: string; to: string }
  | { type: 'error'; message: string; code?: string }
  | { type: 'pong'; serverNow: number };
