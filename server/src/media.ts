import { TrackType } from '@livekit/protocol';
import { AccessToken, RoomServiceClient } from 'livekit-server-sdk';

/**
 * The media plane. The floor is described in the spec as "a hard cut at the
 * transport/mic level — the silenced user's audio does not reach the other
 * party at all", which cannot be honoured by a client muting itself: a modified
 * client would simply keep publishing. So muting is done here, server-side, by
 * the same authority that decides who holds the floor.
 *
 * Behind an interface for the same reason delivery is: it keeps the session
 * rules testable without a media server, and it keeps the choice of provider
 * from spreading through the codebase.
 */
export interface MediaServer {
  /** A join credential for one participant in one session's room. */
  issueToken(params: {
    room: string;
    identity: string;
    displayName: string;
  }): Promise<string>;

  /** Silences or restores a participant's published audio. */
  setMuted(params: {
    room: string;
    identity: string;
    muted: boolean;
  }): Promise<void>;

  /** Tears the room down when the session ends. */
  closeRoom(room: string): Promise<void>;
}

export interface LiveKitOptions {
  /** wss://<project>.livekit.cloud */
  url: string;
  apiKey: string;
  apiSecret: string;
  /** How long a join credential stays valid. */
  tokenTtlSeconds?: number;
}

export class LiveKitMediaServer implements MediaServer {
  private rooms: RoomServiceClient;

  constructor(private options: LiveKitOptions) {
    // RoomServiceClient speaks HTTPS to the same host the clients reach over
    // WSS, so the scheme is swapped rather than configured separately.
    const httpUrl = options.url.replace(/^ws/, 'http');
    this.rooms = new RoomServiceClient(httpUrl, options.apiKey, options.apiSecret);
  }

  async issueToken({
    room,
    identity,
    displayName,
  }: {
    room: string;
    identity: string;
    displayName: string;
  }): Promise<string> {
    const token = new AccessToken(this.options.apiKey, this.options.apiSecret, {
      identity,
      name: displayName,
      ttl: this.options.tokenTtlSeconds ?? 60 * 60,
    });
    token.addGrant({
      room,
      roomJoin: true,
      canPublish: true,
      canSubscribe: true,
      // Participants must not be able to republish their way out of a mute, nor
      // mute each other directly — the floor decides, and only the server
      // applies it.
      canPublishData: false,
      canUpdateOwnMetadata: false,
    });
    return token.toJwt();
  }

  async setMuted({
    room,
    identity,
    muted,
  }: {
    room: string;
    identity: string;
    muted: boolean;
  }): Promise<void> {
    const participant = await this.rooms.getParticipant(room, identity);
    const audioTracks = participant.tracks.filter(
      (track) => track.type === TrackType.AUDIO
    );
    await Promise.all(
      audioTracks.map((track) =>
        this.rooms.mutePublishedTrack(room, identity, track.sid, muted)
      )
    );
  }

  async closeRoom(room: string): Promise<void> {
    await this.rooms.deleteRoom(room);
  }
}

/** Records what would have been asked of a media server. For tests. */
export class MemoryMediaServer implements MediaServer {
  readonly muted = new Map<string, boolean>();
  readonly issued: Array<{ room: string; identity: string }> = [];
  readonly closed: string[] = [];

  async issueToken({ room, identity }: { room: string; identity: string }) {
    this.issued.push({ room, identity });
    return `token:${room}:${identity}`;
  }

  async setMuted({
    room,
    identity,
    muted,
  }: {
    room: string;
    identity: string;
    muted: boolean;
  }) {
    this.muted.set(`${room}/${identity}`, muted);
  }

  async closeRoom(room: string) {
    this.closed.push(room);
  }

  isMuted(room: string, identity: string): boolean | undefined {
    return this.muted.get(`${room}/${identity}`);
  }
}
