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
  RoomEvent,
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
    /**
     * Whether this identity may publish audio at all. Defaults to true, which
     * is every member.
     *
     * A guest's token is minted `false`, and that is the whole of what stops a
     * stranger being audible before anybody has said they may be: the grant
     * lives in the token rather than in the interface, so a client that
     * ignores every rule in this application still cannot make a sound. It is
     * lifted live by `setPublishAllowed` when a member grants it, without a
     * reconnection.
     */
    canPublish?: boolean;
  }): Promise<string>;

  /**
   * Grants or withdraws one participant's ability to publish, live.
   *
   * The counterpart of `canPublish` above, for the moment somebody says yes.
   * Withdrawing it unpublishes them — which is exactly what is wanted for a
   * guest whose microphone is taken back, and exactly what made it the wrong
   * tool for silencing a member; see `setSilenced` for that story.
   */
  setPublishAllowed(params: {
    room: string;
    identity: string;
    allowed: boolean;
  }): Promise<void>;

  /** Removes one participant from the room, disconnecting them. */
  removeParticipant(params: { room: string; identity: string }): Promise<void>;

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
   * Returns the speaker's tracks it was stated against, empty meaning they had
   * nothing published yet. The caller keeps those ids: a statement is about a
   * *track*, so it stops being true the moment the speaker republishes, and
   * whoever publishes next is subscribed to by default.
   */
  setSilenced(params: {
    room: string;
    /** Whose audio is being withheld. */
    speaker: string;
    /** Who stops receiving it. */
    listener: string;
    silenced: boolean;
  }): Promise<string[]>;

  /**
   * Who is in the room right now and what each of them is publishing, by
   * identity. A participant present but publishing nothing has an empty list;
   * one who is not in the room at all is absent from the map.
   *
   * This is what makes the floor hold against a flapping connection. A mute is
   * a statement about a track id, and a client that drops and reconnects — an
   * ordinary event on a phone — comes back publishing a *new* track, which the
   * old statement does not cover and which is subscribed to by default. So the
   * server compares what it last stated against what the room is actually
   * carrying, once a tick, rather than trusting a call that succeeded once.
   */
  audioTracks(room: string): Promise<Map<string, string[]>>;

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
  /**
   * Returns a handle, or **null when this participant has no audio track to
   * record**. Null is not a failure and is not exceptional: a participant who
   * has joined the room but whose microphone has not opened is the ordinary
   * state this application creates on purpose — `useSessionAudio` keeps the
   * microphone closed while somebody is alone in a channel — and it is also
   * what a re-establishing connection and an ungranted permission look like.
   *
   * Modelling it as an error is what once cost an entire conversation to one
   * silent participant. The caller retries, so a microphone that opens ten
   * seconds in yields a stem from ten seconds in, exactly as somebody who
   * walked in at that moment does.
   */
  startRecording(params: {
    room: string;
    identity: string;
    key: string;
  }): Promise<string | null>;

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
  /**
   * When this session last put a frame into the room, in the server's clock.
   *
   * The one thing about shared playback that is a measurement rather than a
   * statement of intent. Everything else anybody can look at — the transport,
   * the position, the recording's red dot — is computed from committed state
   * and goes on being cheerful about a publication that stopped being audible
   * an hour ago. Frames are produced whether or not anything is playing, so
   * this advancing is what "the room can hear this channel" means.
   *
   * A session whose connection is gone answers 0, which is stale by
   * construction: it will never produce another frame, and the caller's
   * staleness test should not need a second question to find that out.
   */
  producedAt(): number;
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
  }): Promise<string | null> {
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
    // Nothing to point an egress at yet. Not an error: see the interface.
    if (!audio) return null;

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
    canPublish = true,
  }: {
    room: string;
    identity: string;
    displayName: string;
    canPublish?: boolean;
  }): Promise<string> {
    const token = new AccessToken(this.options.apiKey, this.options.apiSecret, {
      identity,
      name: displayName,
      ttl: this.options.tokenTtlSeconds ?? 60 * 60,
    });
    token.addGrant({
      room,
      roomJoin: true,
      canPublish,
      canSubscribe: true,
      // Participants must not be able to republish their way out of a mute, nor
      // mute each other directly — the floor decides, and only the server
      // applies it.
      canPublishData: false,
      canUpdateOwnMetadata: false,
    });
    return token.toJwt();
  }

  async setPublishAllowed({
    room,
    identity,
    allowed,
  }: {
    room: string;
    identity: string;
    allowed: boolean;
  }): Promise<void> {
    // `undefined` for the metadata argument leaves it alone; the permission
    // object replaces the whole set, so the other three are restated rather
    // than defaulted — omitting them grants nothing and would silently take
    // away a guest's ability to hear the room at the moment they were given
    // the ability to speak to it.
    await this.rooms.updateParticipant(room, identity, undefined, {
      canPublish: allowed,
      canSubscribe: true,
      canPublishData: false,
      canUpdateMetadata: false,
    });
  }

  async removeParticipant({
    room,
    identity,
  }: {
    room: string;
    identity: string;
  }): Promise<void> {
    await this.rooms.removeParticipant(room, identity);
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
  }): Promise<string[]> {
    const publisher = await this.rooms.getParticipant(room, speaker);
    const audio = publisher.tracks
      .filter((track) => track.type === TrackType.AUDIO)
      .map((track) => track.sid);
    // Nothing published yet: whoever publishes next is subscribed to by
    // default, so the caller re-states this against a real track later.
    if (audio.length === 0) return audio;
    await this.rooms.updateSubscriptions(room, listener, audio, !silenced);
    return audio;
  }

  async audioTracks(room: string): Promise<Map<string, string[]>> {
    const roster = new Map<string, string[]>();
    for (const participant of await this.rooms.listParticipants(room)) {
      roster.set(
        participant.identity,
        participant.tracks
          .filter((track) => track.type === TrackType.AUDIO)
          .map((track) => track.sid)
      );
    }
    return roster;
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
  /**
   * Set when the room says this participant is no longer in it.
   *
   * The media participant is a client like any other and can lose its
   * connection like any other — and unlike a phone, nobody is holding it to
   * notice. The pump goes on producing frames into a source that reaches
   * nowhere, so its heartbeat keeps advancing and would report a healthy
   * session that no one in the room can hear.
   */
  private lost = false;

  constructor(
    private pump: PlaybackPump,
    private rtc: RtcRoom,
    private ffmpegPath: string,
    private storage?: RecordingStorage
  ) {
    this.rtc.on(RoomEvent.Disconnected, () => {
      this.lost = true;
    });
  }

  /**
   * The pump's own stamp, which is `Date.now` — the same clock the registry
   * measures staleness against in production. Nothing injects a clock into
   * this class, and a second one here would be a second thing to keep in step.
   */
  producedAt(): number {
    return this.lost ? 0 : this.pump.producedAt();
  }

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
  /**
   * Every pair `setSilenced` was *called* about, in order, including the ones
   * that acted on nothing.
   *
   * Kept apart from `subscriptions` because the two answer different
   * questions, and only this one can answer what a claim costs. A pair whose
   * speaker publishes nothing returns early here exactly as it does against
   * the real thing — after the round trip that discovered it — so it leaves no
   * subscription behind and is invisible in that log. Which is precisely the
   * work worth not doing: see `statedSpeakers`.
   */
  readonly silenceAttempts: Array<{
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
  readonly issued: Array<{
    room: string;
    identity: string;
    canPublish: boolean;
  }> = [];
  /** Every publish grant asked for, in order. */
  readonly publishGrants: Array<{
    room: string;
    identity: string;
    allowed: boolean;
  }> = [];
  /** Everyone thrown out of a room, in order. */
  readonly removed: Array<{ room: string; identity: string }> = [];
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
   * setSilenced against them acts on nothing, as it does against a participant
   * who has joined the channel but not the room yet.
   */
  readonly unpublished = new Set<string>();
  /** The current track id per `room/identity`, minted on first sight. */
  private trackIds = new Map<string, string>();
  private nextTrackId = 1;
  /**
   * Every `room/identity` this server has been told about, which is what it
   * has instead of connections. Kept apart from `subscriptions` because that
   * is a log tests clear between assertions, and emptying the log must not
   * empty the room.
   */
  private known = new Set<string>();

  async issueToken({
    room,
    identity,
    canPublish = true,
  }: {
    room: string;
    identity: string;
    canPublish?: boolean;
  }) {
    this.issued.push({ room, identity, canPublish });
    this.known.add(`${room}/${identity}`);
    // A participant who may not publish has nothing published, which is what
    // the rest of this class already models — and it is what makes a guest's
    // silence testable end to end rather than asserted about a token string.
    if (canPublish) this.unpublished.delete(`${room}/${identity}`);
    else this.unpublished.add(`${room}/${identity}`);
    return `token:${room}:${identity}`;
  }

  async setPublishAllowed({
    room,
    identity,
    allowed,
  }: {
    room: string;
    identity: string;
    allowed: boolean;
  }) {
    this.publishGrants.push({ room, identity, allowed });
    this.known.add(`${room}/${identity}`);
    if (allowed) this.unpublished.delete(`${room}/${identity}`);
    else this.unpublished.add(`${room}/${identity}`);
  }

  async removeParticipant({
    room,
    identity,
  }: {
    room: string;
    identity: string;
  }) {
    this.removed.push({ room, identity });
    this.known.delete(`${room}/${identity}`);
    this.unpublished.delete(`${room}/${identity}`);
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
    this.silenceAttempts.push({ room, speaker, listener, silenced });
    this.known.add(`${room}/${speaker}`);
    this.known.add(`${room}/${listener}`);
    // Subscriptions are changed on the listener, so a listener who is not in
    // the room is the failure the real thing answers with `participant does
    // not exist` — the loudest line in the log for as long as it was retried.
    if (this.unpublished.has(`${room}/${listener}`)) {
      throw new Error('participant does not exist');
    }
    if (this.unpublished.has(`${room}/${speaker}`)) return [];
    // Keyed by who is being withheld, which is what callers ask about.
    this.muted.set(`${room}/${speaker}`, silenced);
    this.subscriptions.push({ room, speaker, listener, silenced });
    return [this.trackId(room, speaker)];
  }

  /**
   * The roster: everyone this server has ever been told about for the room.
   * There is no connection here to hold, so having been named is what standing
   * in the room amounts to.
   *
   * **Whoever is `unpublished` is in it with no tracks, not absent from it.**
   * The two are different facts and the real server distinguishes them —
   * `listParticipants` returns a guest with no publish grant, carrying an empty
   * track list. This used to drop them, which made the fake unable to produce
   * the one state `meterRoom`'s `publishing` filter exists for, and made the
   * `participant` kind untestable: being connected while silent is the
   * ordinary state this application creates on purpose.
   */
  async audioTracks(room: string) {
    const roster = new Map<string, string[]>();
    for (const key of this.known) {
      if (!key.startsWith(`${room}/`)) continue;
      const identity = key.slice(room.length + 1);
      roster.set(
        identity,
        this.unpublished.has(key) ? [] : [this.trackId(room, identity)]
      );
    }
    return roster;
  }

  /**
   * A client dropping and reconnecting: the same person, a brand-new track,
   * which is the case any statement made against the old one no longer covers.
   */
  republish(room: string, identity: string): void {
    this.trackIds.delete(`${room}/${identity}`);
  }

  private trackId(room: string, identity: string): string {
    const key = `${room}/${identity}`;
    const existing = this.trackIds.get(key);
    if (existing) return existing;
    const id = `TR_${this.nextTrackId++}`;
    this.trackIds.set(key, id);
    return id;
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
    // Somebody with no track behaves as the real one does: there is nothing to
    // point an egress at, and that is a fact about them rather than a fault.
    if (this.unpublished.has(`${room}/${identity}`)) return null;
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
    // The shared track joins the room, which is what the real one does and
    // what makes it a connection the meter can see. Without this the fake had
    // a playback nobody was standing next to, and `participant` spans could
    // not be tested against the case they exist for.
    this.known.add(`${room}/${identity}`);
    const channel = new MemoryPlaybackSession(room, identity, file, () => {
      this.known.delete(`${room}/${identity}`);
    });
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
  /**
   * Whether this pump is still putting frames in the room. Set false to make a
   * test's playback look wedged, which is what the registry's stall check acts
   * on.
   */
  producing = true;

  constructor(
    readonly room: string,
    readonly identity: string,
    public file: string,
    /** Takes it back out of the room, the way closing the connection would. */
    private onClose: () => void = () => {}
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
    this.onClose();
  }

  /**
   * Now while it is producing, and the beginning of time when it is not.
   *
   * A fake has no clock of its own, and the two answers the registry can act on
   * are "recently" and "not for ages" — so they are stated as the extremes
   * rather than by handing this a second clock to keep in step with the first.
   */
  producedAt(): number {
    return this.producing ? Number.MAX_SAFE_INTEGER : 0;
  }
}
