import { spawn } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
} from 'node:fs';
import { readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildApp, type App } from '../src/app';
import { MemoryMailer } from '../src/mail';
import { MemoryMediaServer } from '../src/media';
import { MemoryRecordingStore } from '../src/storage';

/**
 * A track loaded for playback outlives the process, and is deleted when
 * somebody decides it should be — never merely because the server restarted.
 *
 * Until 2026-09-08 it was the other way round: the file went to the system
 * temp directory and was swept at the next boot, and the durable projection
 * left playback out on the reasoning that it pointed at something the dead
 * process owned. So every deploy silently emptied the player of every channel
 * on the box, which is what `planning/TASKS.md` § *Media Transience* was.
 *
 * The shape here is `persistence.test.ts`'s: build an app against a file on
 * disk, do things, close it, build a second app against the same file. That
 * second `buildApp` is the deploy. What is new is `trackRoot` — the durable
 * directory tracks live in, which has to be the same one across the restart
 * for the same reason the database path does.
 */

let dir: string;
let scratch: string;
let clock = 1_700_000_000_000;

beforeAll(() => {
  scratch = mkdtempSync(join(tmpdir(), 'thefloor-track-audio-'));
});

afterAll(() => {
  rmSync(scratch, { recursive: true, force: true });
});

beforeEach(() => {
  clock = 1_700_000_000_000;
  dir = mkdtempSync(join(tmpdir(), 'thefloor-tracks-test-'));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

const dbPath = () => join(dir, 'thefloor.db');
const trackRoot = () => join(dir, 'tracks');

function boot(media?: MemoryMediaServer, store?: MemoryRecordingStore): App {
  return buildApp({
    dbPath: dbPath(),
    trackRoot: trackRoot(),
    mailer: new MemoryMailer(),
    media,
    mediaUrl: media ? 'wss://example.livekit.cloud' : undefined,
    store,
    // Nothing here uploads a stem through the media double, so a mix that
    // waits for one waits its full ten minutes on a timer that outlives the
    // test — see the same note in `shared-audio.test.ts`.
    mixWaitMs: 0,
    now: () => clock,
    roomCloseGraceMs: 0,
  });
}

async function shutdown(app: App): Promise<void> {
  app.channels.stop();
  await app.fastify.close();
}

const auth = (token: string) => ({ authorization: `Bearer ${token}` });
const settle = () => new Promise((r) => setTimeout(r, 0));

/**
 * Waits for a condition, because removing a file is real I/O.
 *
 * The registry schedules its removals through `run` and does not wait for
 * them — a channel is not held up by a deletion — so a test that drained the
 * microtask queue would be asking about a syscall that has not been made yet.
 * Polling states what is actually being asserted: that this becomes true, not
 * that it is true within one tick.
 */
async function until(condition: () => boolean, what: string): Promise<void> {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    if (condition()) return;
    await new Promise((r) => setTimeout(r, 5));
  }
  throw new Error(`timed out waiting for ${what}`);
}

/** A real audio file, since the server asks ffprobe how long it is. */
async function audioFile(seconds: number): Promise<Buffer> {
  const path = join(scratch, `tone-${seconds}.mp3`);
  if (!existsSync(path)) {
    await new Promise<void>((resolve, reject) => {
      const child = spawn('ffmpeg', [
        '-v', 'error', '-f', 'lavfi',
        '-i', `sine=frequency=440:duration=${seconds}:sample_rate=48000`,
        '-y', path,
      ]);
      child.on('error', reject);
      child.on('close', (code) =>
        code === 0 ? resolve() : reject(new Error(`ffmpeg exited ${code}`))
      );
    });
  }
  return readFile(path);
}

async function signIn(app: App, identifier: string, displayName: string) {
  const code = app.accounts.issueCode(identifier, clock)!;
  const verified = await app.fastify.inject({
    method: 'POST',
    url: '/auth/verify',
    payload: { identifier, code, displayName },
  });
  return verified.json() as {
    token: string;
    account: { id: string; displayName: string };
  };
}

/** Two contacts with a channel, both present, so a track may be loaded. */
async function channelOfTwo(app: App) {
  const alice = await signIn(app, 'alice@example.com', 'Alice');
  const bob = await signIn(app, 'bob@example.com', 'Bob');
  await app.fastify.inject({
    method: 'POST',
    url: '/contacts/request',
    headers: auth(alice.token),
    payload: { identifier: 'bob@example.com' },
  });
  await app.fastify.inject({
    method: 'POST',
    url: `/contacts/${alice.account.id}/accept`,
    headers: auth(bob.token),
  });
  const created = await app.fastify.inject({
    method: 'POST',
    url: '/channels',
    headers: auth(alice.token),
    payload: { contactId: bob.account.id },
  });
  const { channelId } = created.json() as { channelId: string };
  app.channels.dispatch(channelId, bob.account.id, { type: 'ENTER' });
  return { alice, bob, channelId };
}

async function upload(
  app: App,
  token: string,
  channelId: string,
  name = 'A Nice Track.mp3',
  seconds = 2
) {
  return app.fastify.inject({
    method: 'POST',
    url: `/channels/${channelId}/track?name=${encodeURIComponent(name)}`,
    headers: { ...auth(token), 'content-type': 'audio/mpeg' },
    payload: await audioFile(seconds),
  });
}

/** An ogg/opus tone, which is the shape a recording's stems are in. */
async function stemFile(seconds: number): Promise<Buffer> {
  const path = join(scratch, `stem-${seconds}.ogg`);
  if (!existsSync(path)) {
    await new Promise<void>((resolve, reject) => {
      const child = spawn('ffmpeg', [
        '-v', 'error', '-f', 'lavfi',
        '-i', `sine=frequency=440:duration=${seconds}:sample_rate=48000`,
        '-c:a', 'libopus', '-y', path,
      ]);
      child.on('error', reject);
      child.on('close', (code) =>
        code === 0 ? resolve() : reject(new Error(`ffmpeg exited ${code}`))
      );
    });
  }
  return readFile(path);
}

/**
 * A finished recording of `channelId`, with real audio behind it. Written
 * straight to the table rather than captured, as `shared-audio.test.ts` does
 * it: what is under test here is what survives a restart, not the capture.
 */
async function fileRecording(
  app: App,
  store: MemoryRecordingStore,
  channelId: string,
  speaker: string,
  name = 'Tuesday'
): Promise<string> {
  const key = `${channelId}/run/${speaker}-001.ogg`;
  store.put(key, await stemFile(2));
  const id = `rec_${channelId}`;
  app.db
    .prepare(
      `INSERT INTO recordings (id, channel_id, initiator_id, invitee_id,
         participants, started_at, duration_ms, s3_key, segment_keys, stems,
         floor_timeline, ended_at, name)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`
    )
    .run(
      id, channelId, speaker, speaker, JSON.stringify([speaker]), clock, 2_000,
      key, JSON.stringify([key]), JSON.stringify({ [speaker]: [key] }),
      '[]', clock + 2_000, name
    );
  return id;
}

/** The directories under the track root, which is where every track lives. */
const trackDirs = () =>
  existsSync(trackRoot())
    ? readdirSync(trackRoot()).sort()
    : [];

describe('a track loaded before a restart', () => {
  it('is still loaded after it, paused where it was left', async () => {
    const first = boot();
    const { alice, channelId } = await channelOfTwo(first);
    const loaded = await upload(first, alice.token, channelId);
    expect(loaded.statusCode).toBe(200);
    const track = (loaded.json() as { track: { id: string; title: string } })
      .track;
    expect(track.title).toBe('A Nice Track');

    // Playing, then moved: the position that has to come back is the banked
    // one, which a seek is what sets.
    first.channels.dispatch(channelId, alice.account.id, { type: 'PLAY' });
    first.channels.dispatch(channelId, alice.account.id, {
      type: 'SEEK',
      positionMs: 900,
    } as never);
    first.channels.dispatch(channelId, alice.account.id, {
      type: 'SET_VOLUME',
      volume: 0.25,
    } as never);
    expect(first.channels.get(channelId)!.playback.status).toBe('playing');
    await shutdown(first);

    const second = boot();
    const after = second.channels.get(channelId)!.playback;

    // The track itself, identically — the same id, so a client that had it on
    // screen is looking at the same thing rather than at a reload of it.
    expect(after.track).not.toBeNull();
    expect(after.track!.id).toBe(track.id);
    expect(after.track!.title).toBe('A Nice Track');
    expect(after.positionMs).toBe(900);
    expect(after.volume).toBe(0.25);

    // Paused, not playing: nobody was driving the pump while the process was
    // down, so a position derived from the clock is one no listener is at.
    expect(after.status).toBe('paused');
    expect(after.startedAt).toBeNull();

    // And the file is still there, which is the half the state depends on.
    expect(trackDirs()).toHaveLength(1);
    await shutdown(second);
  });

  it('survives a second restart, so the projection round-trips', async () => {
    const first = boot();
    const { alice, channelId } = await channelOfTwo(first);
    await upload(first, alice.token, channelId);
    await shutdown(first);

    const second = boot();
    expect(second.channels.get(channelId)!.playback.track).not.toBeNull();
    await shutdown(second);

    const third = boot();
    expect(third.channels.get(channelId)!.playback.track).not.toBeNull();
    expect(trackDirs()).toHaveLength(1);
    await shutdown(third);
  });

  it('can be played again without reloading it', async () => {
    const media = new MemoryMediaServer();
    const first = boot(new MemoryMediaServer());
    const { alice, bob, channelId } = await channelOfTwo(first);
    await upload(first, alice.token, channelId);
    await shutdown(first);

    const second = boot(media);
    // Somebody walks back in, which is what opens the media participant.
    second.channels.dispatch(channelId, alice.account.id, { type: 'ENTER' });
    second.channels.dispatch(channelId, bob.account.id, { type: 'ENTER' });
    await settle();
    second.channels.dispatch(channelId, alice.account.id, { type: 'PLAY' });
    await settle();

    const playback = second.channels.get(channelId)!.playback;
    expect(playback.status).toBe('playing');
    // Nothing failed on the way: a track whose file had gone would come back
    // through PLAYBACK_FAILED rather than play.
    expect(playback.failure).toBeNull();
    await shutdown(second);
  });
});

describe('a recording played back into its channel', () => {
  /**
   * The case *Media Transience* was actually about, and the one the old
   * reasoning was most wrong about: a recording is durable in the bucket, so
   * a track made from one was never really "a file the dead process owned".
   *
   * It goes through `loadTrack` like an uploaded file — that is the whole
   * design of the feature, there being no second playback mechanism — so what
   * this adds over the uploads above is the one field that distinguishes it:
   * `recordingId`, which is what lets a transcript line know that what is
   * playing is the recording its times refer to. A restart that brought the
   * track back without it would leave those offers pointing at nothing.
   */
  it('comes back as the same recording, transcript offers included', async () => {
    const store = new MemoryRecordingStore();
    const first = boot(undefined, store);
    const { alice, channelId } = await channelOfTwo(first);
    const recordingId = await fileRecording(
      first,
      store,
      channelId,
      alice.account.id
    );

    const played = await first.fastify.inject({
      method: 'POST',
      url: `/recordings/${recordingId}/play`,
      headers: auth(alice.token),
    });
    expect(played.statusCode).toBe(200);
    expect(first.channels.get(channelId)!.playback.track!.title).toBe(
      'Tuesday'
    );
    await shutdown(first);

    const second = boot(undefined, store);
    const track = second.channels.get(channelId)!.playback.track;
    expect(track).not.toBeNull();
    expect(track!.title).toBe('Tuesday');
    expect(track!.recordingId).toBe(recordingId);
    // Probed from the mix when it was loaded, and carried rather than
    // re-probed: the file it was measured from is the file that is still here.
    expect(track!.durationMs).toBeGreaterThan(1_500);
    await shutdown(second);
  }, 30_000);
});

describe('what still deletes a track file', () => {
  it('clearing it — and it does not come back at the next boot', async () => {
    const first = boot();
    const { alice, channelId } = await channelOfTwo(first);
    await upload(first, alice.token, channelId);
    expect(trackDirs()).toHaveLength(1);

    first.channels.dispatch(channelId, alice.account.id, {
      type: 'CLEAR_TRACK',
    });
    expect(first.channels.get(channelId)!.playback.track).toBeNull();
    await until(() => trackDirs().length === 0, 'the cleared file to go');
    await shutdown(first);

    const second = boot();
    expect(second.channels.get(channelId)!.playback.track).toBeNull();
    await shutdown(second);
  });

  it('replacing it, which leaves exactly one behind', async () => {
    const first = boot();
    const { alice, channelId } = await channelOfTwo(first);
    await upload(first, alice.token, channelId, 'First.mp3');
    const before = trackDirs();
    expect(before).toHaveLength(1);

    await upload(first, alice.token, channelId, 'Second.mp3');
    await until(() => trackDirs().length === 1, 'the replaced file to go');
    expect(trackDirs()).not.toEqual(before);

    await shutdown(first);
    const second = boot();
    expect(second.channels.get(channelId)!.playback.track!.title).toBe(
      'Second'
    );
    await shutdown(second);
  });

  it('deleting the channel, the track going with it', async () => {
    const first = boot();
    const { alice, bob, channelId } = await channelOfTwo(first);
    await upload(first, alice.token, channelId);
    expect(trackDirs()).toHaveLength(1);

    // Only the last member may delete a channel — `canDeleteChannel`.
    first.channels.dispatch(channelId, bob.account.id, { type: 'LEAVE_CHANNEL' });
    first.channels.dispatch(channelId, alice.account.id, {
      type: 'DELETE_CHANNEL',
    });
    expect(first.channels.get(channelId)!.status).toBe('ended');
    await until(() => trackDirs().length === 0, 'the ended channel to let go');
    await shutdown(first);
  });
});

describe('the boot sweep', () => {
  it('removes a directory no channel refers to, and keeps the one that is', async () => {
    const first = boot();
    const { alice, channelId } = await channelOfTwo(first);
    await upload(first, alice.token, channelId);
    const kept = trackDirs();
    expect(kept).toHaveLength(1);
    await shutdown(first);

    // What a crash between deciding to remove a file and removing it leaves:
    // a directory under the root that no channel's blob names.
    mkdirSync(join(trackRoot(), 'track-orphaned'));
    expect(trackDirs()).toHaveLength(2);

    const second = boot();
    await until(() => trackDirs().length === 1, 'the orphan to be swept');
    expect(trackDirs()).toEqual(kept);
    expect(second.channels.get(channelId)!.playback.track).not.toBeNull();
    await shutdown(second);
  });

  it('leaves a channel with an empty player when its file has gone', async () => {
    const first = boot();
    const { alice, channelId } = await channelOfTwo(first);
    await upload(first, alice.token, channelId);
    first.channels.dispatch(channelId, alice.account.id, {
      type: 'SET_VOLUME',
      volume: 0.4,
    } as never);
    await shutdown(first);

    // The one case the disk and the blob can disagree: the audio is gone and
    // the row still names it. Showing a track nobody can play would be worse
    // than showing none.
    rmSync(trackRoot(), { recursive: true, force: true });

    const second = boot();
    const playback = second.channels.get(channelId)!.playback;
    expect(playback.track).toBeNull();
    expect(playback.status).toBe('idle');
    // The volume is not the file's: it is how the pair were listening, and it
    // survives a track it outlived.
    expect(playback.volume).toBe(0.4);

    // And the channel is otherwise entirely intact.
    expect(second.channels.get(channelId)!.status).toBe('active');
    await shutdown(second);
  });
});
