import {
  EncodedFileOutput,
  EncodedFileType,
  S3Upload,
} from '@livekit/protocol';
import { AccessToken, EgressClient, RoomServiceClient } from 'livekit-server-sdk';

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

  /**
   * Silences or restores a participant.
   *
   * Implemented by revoking publish permission rather than muting their track.
   * A server may mute someone — that is moderation — but LiveKit deliberately
   * refuses to un-mute them, because switching a stranger's microphone back on
   * is a privacy hazard. That asymmetry made the floor a one-way door: claims
   * silenced correctly and releases never restored anyone. Permissions are
   * server-owned in both directions, so they can express a temporary silence.
   */
  setSilenced(params: {
    room: string;
    identity: string;
    silenced: boolean;
  }): Promise<void>;

  /** Tears the room down when the session ends. */
  closeRoom(room: string): Promise<void>;

  /**
   * Begins capturing the room's mixed audio to `key`. Returns a handle for
   * stopping it.
   *
   * There is no pause in the underlying API, and pausing must genuinely stop
   * capture rather than record-then-trim: people pause precisely so something
   * is not recorded. So a paused recording stops its capture and a resumed one
   * starts a fresh segment, which is why a session yields one object per run
   * rather than one per recording.
   */
  startRecording(params: { room: string; key: string }): Promise<string>;

  stopRecording(handle: string): Promise<void>;
}

export interface RecordingStorage {
  bucket: string;
  region: string;
  accessKey: string;
  secret: string;
  /** Key prefix inside the bucket, e.g. "sessions". */
  prefix?: string;
}

export interface LiveKitOptions {
  /** wss://<project>.livekit.cloud */
  url: string;
  apiKey: string;
  apiSecret: string;
  /** How long a join credential stays valid. */
  tokenTtlSeconds?: number;
  /** Where recordings are written. Without it, recording cannot start. */
  storage?: RecordingStorage;
}

export class LiveKitMediaServer implements MediaServer {
  private rooms: RoomServiceClient;
  private egress: EgressClient;

  constructor(private options: LiveKitOptions) {
    // RoomServiceClient speaks HTTPS to the same host the clients reach over
    // WSS, so the scheme is swapped rather than configured separately.
    const httpUrl = options.url.replace(/^ws/, 'http');
    this.rooms = new RoomServiceClient(httpUrl, options.apiKey, options.apiSecret);
    this.egress = new EgressClient(httpUrl, options.apiKey, options.apiSecret);
  }

  async startRecording({
    room,
    key,
  }: {
    room: string;
    key: string;
  }): Promise<string> {
    const storage = this.options.storage;
    if (!storage) throw new Error('No recording storage configured.');

    // Audio only: this app has no video, and mixing to one file is what makes
    // a session's recording a single artefact rather than a per-speaker pile.
    const info = await this.egress.startRoomCompositeEgress(
      room,
      new EncodedFileOutput({
        fileType: EncodedFileType.OGG,
        filepath: key,
        output: {
          case: 's3',
          value: new S3Upload({
            bucket: storage.bucket,
            region: storage.region,
            accessKey: storage.accessKey,
            secret: storage.secret,
          }),
        },
      }),
      { audioOnly: true }
    );
    return info.egressId;
  }

  async stopRecording(handle: string): Promise<void> {
    await this.egress.stopEgress(handle);
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

  async setSilenced({
    room,
    identity,
    silenced,
  }: {
    room: string;
    identity: string;
    silenced: boolean;
  }): Promise<void> {
    // The full permission set is sent every time: a partial update would reset
    // whatever it omits, which is how a "silence" turns into a participant who
    // can no longer hear either.
    await this.rooms.updateParticipant(room, identity, {
      permission: {
        canSubscribe: true,
        canPublish: !silenced,
        canPublishData: false,
        hidden: false,
        canUpdateMetadata: false,
        canPublishSources: [],
        agent: false,
        canSubscribeMetrics: false,
      },
    });
  }

  async closeRoom(room: string): Promise<void> {
    await this.rooms.deleteRoom(room);
  }
}

/** Records what would have been asked of a media server. For tests. */
export class MemoryMediaServer implements MediaServer {
  readonly muted = new Map<string, boolean>();
  readonly recordings: Array<{
    room: string;
    key: string;
    handle: string;
    stopped: boolean;
  }> = [];
  readonly issued: Array<{ room: string; identity: string }> = [];
  readonly closed: string[] = [];

  async issueToken({ room, identity }: { room: string; identity: string }) {
    this.issued.push({ room, identity });
    return `token:${room}:${identity}`;
  }

  async setSilenced({
    room,
    identity,
    silenced,
  }: {
    room: string;
    identity: string;
    silenced: boolean;
  }) {
    this.muted.set(`${room}/${identity}`, silenced);
  }

  async closeRoom(room: string) {
    this.closed.push(room);
  }

  async startRecording({ room, key }: { room: string; key: string }) {
    const handle = `egress_${this.recordings.length + 1}`;
    this.recordings.push({ room, key, handle, stopped: false });
    return handle;
  }

  async stopRecording(handle: string) {
    const found = this.recordings.find((r) => r.handle === handle);
    if (found) found.stopped = true;
  }

  isMuted(room: string, identity: string): boolean | undefined {
    return this.muted.get(`${room}/${identity}`);
  }
}
