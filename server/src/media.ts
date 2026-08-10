import { mkdtemp, rm } from 'node:fs/promises';
import { readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { DirectFileOutput, S3Upload, TrackType } from '@livekit/protocol';
import {
  AudioFrame,
  AudioSource,
  LocalAudioTrack,
  Room as RtcRoom,
  TrackPublishOptions,
  TrackSource,
} from '@livekit/rtc-node';
import { AccessToken, EgressClient, RoomServiceClient } from 'livekit-server-sdk';
import {
  CHANNELS,
  FfmpegDecoder,
  FfmpegStemEncoder,
  PlaybackPump,
  SAMPLE_RATE,
  type FrameSink,
} from './playback';

/**
 * The media plane. The spec calls the floor "a hard cut at the transport/mic
 * level — the silenced user's audio does not reach the other party at all",
 * which a client cannot be trusted to honour about itself: a modified one would
 * simply keep sending, or keep playing. So the cut is made here, by the same
 * authority that decides who holds the floor.
 *
 * Behind an interface for the same reason delivery is: it keeps the channel
 * rules testable without a media server, and it keeps the choice of provider
 * from spreading through the codebase.
 */
export interface MediaServer {
  /** A join credential for one participant in one channel's room. */
  issueToken(params: {
    room: string;
    identity: string;
    displayName: string;
  }): Promise<string>;

  /**
   * Stops `listener` from receiving `speaker`, or restores it.
   *
   * Acts on the receiving end rather than the sending one. Two earlier attempts
   * acted on the speaker and both failed against the platform: muting their
   * track cannot be undone by a server, and revoking their publish permission
   * unpublishes them, which tears down iOS's audio unit — so the silenced
   * person lost their microphone *and* their playback, and got neither back.
   *
   * Unsubscribing the listener is still a transport-level cut — the audio never
   * reaches their device — but it leaves the silenced person's audio pipeline
   * completely undisturbed, which is what makes it survivable and reversible.
   *
   * Returns whether anything was acted on: false means the speaker had no
   * published track yet, so the caller must re-state this once they do —
   * whoever publishes next is subscribed to by default.
   */
  setSilenced(params: {
    room: string;
    /** Whose audio is being withheld. */
    speaker: string;
    /** Who stops receiving it. */
    listener: string;
    silenced: boolean;
  }): Promise<boolean>;

  /** Tears the room down when the channel ends. */
  closeRoom(room: string): Promise<void>;

  /**
   * Begins capturing one participant's audio to `key`. Returns a handle for
   * stopping it.
   *
   * Per participant rather than a room mix, because the floor has to be applied
   * when the recording is encoded and a mix cannot be un-mixed. Isolated stems
   * let the server drop a silenced speaker across the windows where they were
   * silenced; a blended file could not.
   *
   * There is no pause in the underlying API, so a paused recording stops its
   * captures and a resumed one starts fresh ones — which is why a participant
   * yields one object per run rather than one per recording.
   */
  startRecording(params: {
    room: string;
    identity: string;
    key: string;
  }): Promise<string>;

  stopRecording(handle: string): Promise<void>;

  /**
   * Joins the room as the media participant and holds the shared track.
   *
   * Returns a handle rather than taking one command at a time because playback
   * is a running thing, not a series of requests: there is a live connection, a
   * published track and a decoder behind it, and they outlive any one action.
   */
  openPlayback(params: {
    room: string;
    identity: string;
    displayName: string;
    /** The uploaded file, on the server's own disk. */
    file: string;
    onFailure?: (error: unknown) => void;
  }): Promise<PlaybackSession>;
}

/** One channel's shared playback, for as long as a track is loaded. */
export interface PlaybackSession {
  /**
   * Swaps in a different file. Loading another track does not re-open the
   * channel, so the recording stem stays continuous across the change.
   */
  setFile(file: string): Promise<void>;
  /** Plays from `fromMs`. Resuming and seeking are the same call. */
  play(fromMs: number): Promise<void>;
  pause(): Promise<void>;
  setVolume(volume: number): void;
  /**
   * Starts recording what is being played to `key`, `offsetMs` into the
   * recording. The offset is padded with silence so the stem lines up with the
   * speakers' without the export having to know when the track arrived.
   */
  startCapture(key: string, offsetMs: number): Promise<void>;
  /** Finishes the current stem and stores it. */
  stopCapture(): Promise<void>;
  close(): Promise<void>;
}

export interface RecordingStorage {
  bucket: string;
  region: string;
  accessKey: string;
  secret: string;
  /** Key prefix inside the bucket, e.g. "channels". */
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
  /** Decodes and encodes shared playback. Defaults to FFMPEG_PATH, then PATH. */
  ffmpegPath?: string;
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
    identity,
    key,
  }: {
    room: string;
    identity: string;
    key: string;
  }): Promise<string> {
    const storage = this.options.storage;
    if (!storage) throw new Error('No recording storage configured.');

    // Track egress, not participant egress. Participant egress captures a
    // participant's audio *and* video, and rejects an audio-only container
    // with "no supported codec is compatible with all outputs" — there being
    // no codec that satisfies both. This app has no video, so the right
    // primitive is the single track: it writes the Opus already being
    // published, with no transcode.
    const participant = await this.rooms.getParticipant(room, identity);
    const audio = participant.tracks.find(
      (track) => track.type === TrackType.AUDIO
    );
    if (!audio) {
      throw new Error(`${identity} is not publishing audio; nothing to record.`);
    }

    const info = await this.egress.startTrackEgress(
      room,
      new DirectFileOutput({
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
      audio.sid
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
    speaker,
    listener,
    silenced,
  }: {
    room: string;
    speaker: string;
    listener: string;
    silenced: boolean;
  }): Promise<boolean> {
    const publisher = await this.rooms.getParticipant(room, speaker);
    const audio = publisher.tracks
      .filter((track) => track.type === TrackType.AUDIO)
      .map((track) => track.sid);
    // Nothing published yet: whoever publishes next is subscribed to by
    // default, so the caller re-states this against a real track later.
    if (audio.length === 0) return false;
    await this.rooms.updateSubscriptions(room, listener, audio, !silenced);
    return true;
  }

  async closeRoom(room: string): Promise<void> {
    await this.rooms.deleteRoom(room);
  }

  async openPlayback({
    room,
    identity,
    displayName,
    file,
    onFailure,
  }: {
    room: string;
    identity: string;
    displayName: string;
    file: string;
    onFailure?: (error: unknown) => void;
  }): Promise<PlaybackSession> {
    const ffmpegPath =
      this.options.ffmpegPath ?? process.env.FFMPEG_PATH ?? 'ffmpeg';
    const token = await this.issueToken({ room, identity, displayName });

    const rtc = new RtcRoom();
    // Nothing is subscribed: the media participant publishes and never
    // listens, and subscribing it to two people would pull both conversations
    // down to the server for nobody to hear.
    await rtc.connect(this.options.url, token, {
      autoSubscribe: false,
      dynacast: false,
    });

    const local = rtc.localParticipant;
    if (!local) {
      await rtc.disconnect();
      throw new Error('Joined the room but could not publish the track.');
    }

    const source = new AudioSource(SAMPLE_RATE, CHANNELS);
    const track = LocalAudioTrack.createAudioTrack('playback', source);
    await local.publishTrack(
      track,
      new TrackPublishOptions({ source: TrackSource.SOURCE_MICROPHONE })
    );

    const pump = new PlaybackPump({
      sink: new AudioSourceSink(source),
      openDecoder: (path, fromMs) => new FfmpegDecoder(path, fromMs, ffmpegPath),
      onFailure,
    });
    await pump.setFile(file);
    pump.start();

    return new LiveKitPlaybackSession(
      pump,
      rtc,
      ffmpegPath,
      this.options.storage
    );
  }
}

/** Publishes the pump's frames into the room. */
class AudioSourceSink implements FrameSink {
  constructor(private source: AudioSource) {}

  async capture(samples: Int16Array): Promise<void> {
    await this.source.captureFrame(
      new AudioFrame(samples, SAMPLE_RATE, CHANNELS, samples.length)
    );
  }

  async close(): Promise<void> {
    await this.source.close();
  }
}

class LiveKitPlaybackSession implements PlaybackSession {
  private encoder: FfmpegStemEncoder | null = null;
  private capture: { key: string; dir: string; path: string } | null = null;

  constructor(
    private pump: PlaybackPump,
    private rtc: RtcRoom,
    private ffmpegPath: string,
    private storage?: RecordingStorage
  ) {}

  setFile(file: string): Promise<void> {
    return this.pump.setFile(file);
  }

  play(fromMs: number): Promise<void> {
    return this.pump.play(fromMs);
  }

  pause(): Promise<void> {
    return this.pump.pause();
  }

  setVolume(volume: number): void {
    this.pump.setVolume(volume);
  }

  async startCapture(key: string, offsetMs: number): Promise<void> {
    if (!this.storage) throw new Error('No recording storage configured.');
    if (this.encoder) await this.stopCapture();

    const dir = await mkdtemp(join(tmpdir(), 'thefloor-playback-'));
    const path = join(dir, 'stem.ogg');
    this.encoder = new FfmpegStemEncoder(path, this.ffmpegPath);
    this.capture = { key, dir, path };
    this.pump.startCapture(this.encoder, offsetMs);
  }

  /**
   * Finishes the stem and puts it in the bucket.
   *
   * Uses the same PutObject-only credentials LiveKit is given, which is exactly
   * the permission this needs. Reading the bucket stays the server's own
   * privilege, as storage.ts intends — nothing here gains the ability to read
   * anyone's conversation back.
   */
  async stopCapture(): Promise<void> {
    const capture = this.capture;
    this.capture = null;
    this.encoder = null;
    if (!capture) return;

    try {
      await this.pump.stopCapture();
      if (this.storage) {
        const client = new S3Client({
          region: this.storage.region,
          credentials: {
            accessKeyId: this.storage.accessKey,
            secretAccessKey: this.storage.secret,
          },
        });
        await client.send(
          new PutObjectCommand({
            Bucket: this.storage.bucket,
            Key: capture.key,
            Body: await readFile(capture.path),
            ContentType: 'audio/ogg',
          })
        );
      }
    } finally {
      // The conversation must not be left lying on the disk after it has been
      // stored, for the reason encodeRecording gives about its own temp files.
      await rm(capture.dir, { recursive: true, force: true });
    }
  }

  async close(): Promise<void> {
    await this.stopCapture().catch(() => {});
    await this.pump.close();
    await this.rtc.disconnect();
  }
}

/** Records what would have been asked of a media server. For tests. */
export class MemoryMediaServer implements MediaServer {
  readonly muted = new Map<string, boolean>();
  /** Every subscription change asked for, in order. */
  readonly subscriptions: Array<{
    room: string;
    speaker: string;
    listener: string;
    silenced: boolean;
  }> = [];
  readonly recordings: Array<{
    room: string;
    identity: string;
    key: string;
    handle: string;
    stopped: boolean;
  }> = [];
  readonly issued: Array<{ room: string; identity: string }> = [];
  readonly closed: string[] = [];
  /** Playback channels opened, in order, live or closed. */
  readonly playbacks: MemoryPlaybackSession[] = [];
  /**
   * While set, startRecording rejects — for every participant, or just one when
   * an identity is given, which is how a partial failure is exercised.
   */
  failStart: { reason: string; identity?: string } | null = null;
  /**
   * Identities (`room/identity`) treated as having no published track:
   * setSilenced against them is a no-op returning false, as it is against a
   * participant who has joined the channel but not the room yet.
   */
  readonly unpublished = new Set<string>();

  async issueToken({ room, identity }: { room: string; identity: string }) {
    this.issued.push({ room, identity });
    return `token:${room}:${identity}`;
  }

  async setSilenced({
    room,
    speaker,
    listener,
    silenced,
  }: {
    room: string;
    speaker: string;
    listener: string;
    silenced: boolean;
  }) {
    if (this.unpublished.has(`${room}/${speaker}`)) return false;
    // Keyed by who is being withheld, which is what callers ask about.
    this.muted.set(`${room}/${speaker}`, silenced);
    this.subscriptions.push({ room, speaker, listener, silenced });
    return true;
  }

  async closeRoom(room: string) {
    this.closed.push(room);
  }

  async startRecording({
    room,
    identity,
    key,
  }: {
    room: string;
    identity: string;
    key: string;
  }) {
    if (
      this.failStart &&
      (!this.failStart.identity || this.failStart.identity === identity)
    ) {
      throw new Error(this.failStart.reason);
    }
    const handle = `egress_${this.recordings.length + 1}`;
    this.recordings.push({ room, identity, key, handle, stopped: false });
    return handle;
  }

  async stopRecording(handle: string) {
    const found = this.recordings.find((r) => r.handle === handle);
    if (found) found.stopped = true;
  }

  async openPlayback({
    room,
    identity,
    file,
  }: {
    room: string;
    identity: string;
    file: string;
  }) {
    const channel = new MemoryPlaybackSession(room, identity, file);
    this.playbacks.push(channel);
    return channel;
  }

  isMuted(room: string, identity: string): boolean | undefined {
    return this.muted.get(`${room}/${identity}`);
  }

  /** The playback channel for a room, if one was ever opened. */
  playbackFor(room: string): MemoryPlaybackSession | undefined {
    return this.playbacks.find((p) => p.room === room);
  }
}

/** Records what would have been asked of the pump. For tests. */
export class MemoryPlaybackSession implements PlaybackSession {
  readonly commands: Array<
    | { type: 'file'; file: string }
    | { type: 'play'; fromMs: number }
    | { type: 'pause' }
    | { type: 'volume'; volume: number }
  > = [];
  readonly captures: Array<{ key: string; offsetMs: number; stopped: boolean }> =
    [];
  closed = false;

  constructor(
    readonly room: string,
    readonly identity: string,
    public file: string
  ) {}

  async setFile(file: string) {
    this.file = file;
    this.commands.push({ type: 'file', file });
  }

  async play(fromMs: number) {
    this.commands.push({ type: 'play', fromMs });
  }

  async pause() {
    this.commands.push({ type: 'pause' });
  }

  setVolume(volume: number) {
    this.commands.push({ type: 'volume', volume });
  }

  async startCapture(key: string, offsetMs: number) {
    this.captures.push({ key, offsetMs, stopped: false });
  }

  async stopCapture() {
    const open = this.captures.find((c) => !c.stopped);
    if (open) open.stopped = true;
  }

  async close() {
    this.closed = true;
  }
}
