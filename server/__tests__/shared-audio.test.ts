import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildApp, type App } from '../src/app';
import { MemoryMailer } from '../src/mail';
import { MemoryMediaServer } from '../src/media';
import { MEDIA_IDENTITY, mediaRoomIdentity } from '../src/channels';

/**
 * Shared playback where it meets the rest of the channel: who may change it,
 * that it is never confused for a speaker, and that what was played reaches the
 * recording as its own stem.
 */

let app: App;
let media: MemoryMediaServer;
let clock = 1_700_000_000_000;
let scratch: string;

beforeAll(async () => {
  scratch = await mkdtemp(join(tmpdir(), 'thefloor-audio-test-'));
});

afterAll(async () => {
  await rm(scratch, { recursive: true, force: true });
});

beforeEach(() => {
  clock = 1_700_000_000_000;
  media = new MemoryMediaServer();
  app = buildApp({
    dbPath: ':memory:',
    mailer: new MemoryMailer(),
    media,
    mediaUrl: 'wss://example.livekit.cloud',
    now: () => clock,
    roomCloseGraceMs: 0,
  });
});

afterEach(async () => {
  app.channels.stop();
  await app.fastify.close();
});

const auth = (token: string) => ({ authorization: `Bearer ${token}` });

/**
 * The only way a channel ends now: every member gives up membership. Tests
 * that used to dispatch END are asserting what happens at the end of a
 * channel's life, and this is how a channel's life ends.
 */
function endChannel(channelId: string): void {
  const members = [...(app.channels.get(channelId)?.participants ?? [])];
  for (const id of members) {
    app.channels.dispatch(channelId, id, { type: 'LEAVE_CHANNEL' });
  }
}
const settle = () => new Promise((r) => setTimeout(r, 0));

/** A real audio file, since the server asks ffprobe how long it is. */
async function audioFile(seconds: number): Promise<Buffer> {
  const path = join(scratch, `tone-${seconds}.mp3`);
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
  return readFile(path);
}

async function signIn(identifier: string, displayName: string) {
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

async function sessionOfTwo() {
  const alice = await signIn('alice@example.com', 'Alice');
  const bob = await signIn('bob@example.com', 'Bob');
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

describe('loading a track', () => {
  it('takes the title from the file and the duration from the file itself', async () => {
    const { alice, channelId } = await sessionOfTwo();
    const response = await upload(alice.token, channelId, 'A Nice Track.mp3', 2);

    expect(response.statusCode).toBe(200);
    const { track } = response.json() as {
      track: { title: string; durationMs: number };
    };
    expect(track.title).toBe('A Nice Track');
    // Asked of ffprobe, not of the uploader, so it is near enough exactly right.
    expect(track.durationMs).toBeGreaterThan(1_900);
    expect(track.durationMs).toBeLessThan(2_200);
  });

  it('refuses something that is not audio', async () => {
    const { alice, channelId } = await sessionOfTwo();
    const response = await app.fastify.inject({
      method: 'POST',
      url: `/channels/${channelId}/track?name=notes.txt`,
      headers: { ...auth(alice.token), 'content-type': 'application/octet-stream' },
      payload: Buffer.from('this is not a song'),
    });
    expect(response.statusCode).toBe(415);
  });

  it('refuses someone who is not in the channel', async () => {
    const { alice, channelId } = await sessionOfTwo();
    const mallory = await signIn('mallory@example.com', 'Mallory');
    const response = await upload(mallory.token, channelId);
    expect(response.statusCode).toBe(403);
  });

  it('opens the media participant, once, on the first track', async () => {
    const { alice, channelId } = await sessionOfTwo();
    await upload(alice.token, channelId);
    await settle();

    expect(media.playbacks).toHaveLength(1);
    expect(media.playbacks[0].identity).toBe(mediaRoomIdentity(channelId));

    await upload(alice.token, channelId, 'Another.mp3');
    await settle();
    // Still one: swapping the file must not disturb the publication, because
    // the recording stem depends on it staying up.
    expect(media.playbacks).toHaveLength(1);
    expect(media.playbacks[0].commands).toContainEqual(
      expect.objectContaining({ type: 'file' })
    );
  });
});

describe('the floor confers control of the track', () => {
  it('lets the holder change what is playing and refuses the other party', async () => {
    const { alice, bob, channelId } = await sessionOfTwo();
    await upload(alice.token, channelId);
    app.channels.dispatch(channelId, alice.account.id, { type: 'CLAIM_FLOOR' });

    expect(
      app.channels.dispatch(channelId, alice.account.id, { type: 'PLAY' }).ok
    ).toBe(true);
    const refused = app.channels.dispatch(channelId, bob.account.id, {
      type: 'PAUSE',
    });
    expect(refused.ok).toBe(true);
    // Accepted as a message, ignored as an act: the reducer is the authority.
    expect(app.channels.get(channelId)!.playback.status).toBe('playing');

    const upload2 = await upload(bob.token, channelId, 'Mine.mp3');
    expect(upload2.statusCode).toBe(409);
  });

  it('does not pause playback when a claim is made', async () => {
    const { alice, channelId } = await sessionOfTwo();
    await upload(alice.token, channelId);
    app.channels.dispatch(channelId, alice.account.id, { type: 'PLAY' });
    await settle();

    app.channels.dispatch(channelId, alice.account.id, { type: 'CLAIM_FLOOR' });
    await settle();

    expect(app.channels.get(channelId)!.playback.status).toBe('playing');
    expect(media.playbackFor(channelId)!.commands).not.toContainEqual({
      type: 'pause',
    });
  });
});

describe('the media participant is not a speaker', () => {
  it('is never silenced by a claim', async () => {
    const { alice, bob, channelId } = await sessionOfTwo();
    await upload(alice.token, channelId);
    await settle();

    app.channels.dispatch(channelId, alice.account.id, { type: 'CLAIM_FLOOR' });
    app.channels.dispatch(channelId, alice.account.id, { type: 'RELEASE_FLOOR' });
    app.channels.dispatch(channelId, bob.account.id, { type: 'CLAIM_FLOOR' });
    await settle();

    expect(media.subscriptions.length).toBeGreaterThan(0);
    for (const change of media.subscriptions) {
      expect(change.speaker).not.toBe(mediaRoomIdentity(channelId));
      expect(change.listener).not.toBe(mediaRoomIdentity(channelId));
    }
  });
});

describe('what was played reaches the recording', () => {
  it('captures a stem alongside the speakers, with no offset when it was already loaded', async () => {
    const { alice, bob, channelId } = await sessionOfTwo();
    await upload(alice.token, channelId);
    await settle();

    app.channels.dispatch(channelId, alice.account.id, { type: 'START_RECORDING' });
    await settle();

    const playback = media.playbackFor(channelId)!;
    expect(playback.captures).toHaveLength(1);
    expect(playback.captures[0].offsetMs).toBe(0);
    expect(playback.captures[0].key).toContain(`${MEDIA_IDENTITY}-001`);

    clock += 5_000;
    app.channels.dispatch(channelId, bob.account.id, { type: 'STOP_RECORDING' });
    await settle();
    expect(playback.captures[0].stopped).toBe(true);
  });

  it('starts the stem partway in when the track arrives mid-recording', async () => {
    const { alice, channelId } = await sessionOfTwo();
    app.channels.dispatch(channelId, alice.account.id, { type: 'START_RECORDING' });
    await settle();

    clock += 7_000;
    await upload(alice.token, channelId);
    await settle();

    const playback = media.playbackFor(channelId)!;
    expect(playback.captures).toHaveLength(1);
    // Seven seconds of silence pad it into line with the speakers' stems.
    expect(playback.captures[0].offsetMs).toBe(7_000);
  });

  it('stores the media stem with the speakers and gates none of it', async () => {
    const { alice, bob, channelId } = await sessionOfTwo();
    await upload(alice.token, channelId);
    await settle();

    app.channels.dispatch(channelId, alice.account.id, { type: 'START_RECORDING' });
    await settle();
    clock += 1_000;
    app.channels.dispatch(channelId, alice.account.id, { type: 'CLAIM_FLOOR' });
    clock += 2_000;
    app.channels.dispatch(channelId, alice.account.id, { type: 'RELEASE_FLOOR' });
    clock += 1_000;
    endChannel(channelId);
    await settle();

    const row = app.db
      .prepare('SELECT * FROM recordings WHERE channel_id = ?')
      .get(channelId) as { stems: string; floor_timeline: string };

    const stems = JSON.parse(row.stems) as Record<string, string[]>;
    expect(Object.keys(stems)).toContain(MEDIA_IDENTITY);
    expect(stems[MEDIA_IDENTITY]).toHaveLength(1);
    expect(Object.keys(stems)).toContain(alice.account.id);
    expect(Object.keys(stems)).toContain(bob.account.id);

    // Bob was silenced by Alice's claim; the track never was, so it carries no
    // window and is mixed whole.
    const timeline = JSON.parse(row.floor_timeline) as Array<{
      identity: string;
    }>;
    expect(timeline.some((w) => w.identity === bob.account.id)).toBe(true);
    expect(timeline.some((w) => w.identity === MEDIA_IDENTITY)).toBe(false);
  });

  it('closes the media participant when the channel ends', async () => {
    const { alice, channelId } = await sessionOfTwo();
    await upload(alice.token, channelId);
    await settle();

    endChannel(channelId);
    await settle();

    expect(media.playbackFor(channelId)!.closed).toBe(true);
  });
});
