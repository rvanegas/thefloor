import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildApp, type App } from '../src/app';
import { MemoryMailer } from '../src/mail';
import { MemoryMediaServer } from '../src/media';
import { MemoryRecordingStore } from '../src/storage';
import { MEDIA_IDENTITY, playbackIdentity } from '../src/channels';

/**
 * Shared playback where it meets the rest of the channel: who may change it,
 * that it is never confused for a speaker, and that what was played reaches the
 * recording as its own stem.
 */

let app: App;
let media: MemoryMediaServer;
let store: MemoryRecordingStore;
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
  store = new MemoryRecordingStore();
  app = buildApp({
    dbPath: ':memory:',
    mailer: new MemoryMailer(),
    media,
    mediaUrl: 'wss://example.livekit.cloud',
    store,
    now: () => clock,
    roomCloseGraceMs: 0,
    // Nothing here uploads a stem, because the media server is a double — so
    // the mix that starts when a channel ends waits for objects that will
    // never appear. Left at its default that wait is ten minutes of polling
    // every two seconds (`OBJECT_WAIT_MS` in storage.ts), by a timer that
    // outlives the test that caused it and keeps the whole worker alive: the
    // suite passed in a second and the process then had to be killed. Every
    // other suite that ends a recording sets this, and this one did not.
    mixWaitMs: 0,
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
  // Everyone leaves but the last, who cannot: for them the same tap is
  // DELETE_CHANNEL, because it destroys the channel and its recordings.
  for (const id of members.slice(0, -1)) {
    app.channels.dispatch(channelId, id, { type: 'LEAVE_CHANNEL' });
  }
  const last = members[members.length - 1];
  if (last) app.channels.dispatch(channelId, last, { type: 'DELETE_CHANNEL' });
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

/** An ogg/opus tone, which is the shape a recording's stems are in. */
async function stemFile(seconds: number): Promise<Buffer> {
  const path = join(scratch, `stem-${seconds}.ogg`);
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
  return readFile(path);
}

/**
 * A finished recording of `channelId`, with real audio behind it.
 *
 * Written straight to the table rather than captured: what is under test is
 * playback, and the capture path has its own tests.
 */
async function fileRecording(
  channelId: string,
  speaker: string,
  name = 'Tuesday'
): Promise<string> {
  const key = `${channelId}/run/${speaker}-001.ogg`;
  store.put(key, await stemFile(2));
  const id = `rec_${Math.abs(hash(key))}`;
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

/** Stable ids without a clock or a random source, both of which tests fix. */
function hash(text: string): number {
  let value = 0;
  for (const character of text) value = (value * 31 + character.charCodeAt(0)) | 0;
  return value;
}

describe('playing a recording back', () => {
  it('becomes the channel’s track, under the controls that already exist', async () => {
    // The whole design of this feature: there is no second playback mechanism.
    // A recording is mixed, loaded as the shared track, and from then on it is
    // played, paused, sought and levelled by what was already on the screen.
    const { alice, channelId } = await sessionOfTwo();
    const recordingId = await fileRecording(channelId, alice.account.id);

    const response = await app.fastify.inject({
      method: 'POST',
      url: `/recordings/${recordingId}/play`,
      headers: auth(alice.token),
    });
    expect(response.statusCode).toBe(200);

    const channel = app.channels.get(channelId)!;
    // Named as the recording is named, so what is playing is recognisable as
    // the row that was tapped.
    expect(channel.playback.track?.title).toBe('Tuesday');
    // Probed from the mix rather than copied from duration_ms: the scrubber
    // runs on this number, so it has to be the file's own.
    expect(channel.playback.track!.durationMs).toBeGreaterThan(1_500);
    // Loaded and waiting, exactly as an uploaded track arrives: playing it is
    // a separate tap, and it is the same tap.
    expect(channel.playback.status).toBe('paused');
    expect(channel.playback.positionMs).toBe(0);

    // And the ordinary control starts it, into the room, as a track.
    app.channels.dispatch(channelId, alice.account.id, { type: 'PLAY' });
    await settle();
    expect(app.channels.get(channelId)!.playback.status).toBe('playing');
    expect(media.playbacks[0].identity).toBe(playbackIdentity(channelId));
  }, 30_000);

  it('is refused to somebody who is not in the channel', async () => {
    const { alice, channelId } = await sessionOfTwo();
    const mallory = await signIn('mallory@example.com', 'Mallory');
    const recordingId = await fileRecording(channelId, alice.account.id);

    const response = await app.fastify.inject({
      method: 'POST',
      url: `/recordings/${recordingId}/play`,
      headers: auth(mallory.token),
    });
    // Not 403: that a recording exists is only for the channel to know.
    expect(response.statusCode).toBe(404);
    expect(app.channels.get(channelId)!.playback.track).toBeNull();
  }, 30_000);

  it('is refused while somebody else holds the floor', async () => {
    // The same rule an uploaded track obeys, because it goes through the same
    // door: whoever has the floor decides what plays.
    const { alice, bob, channelId } = await sessionOfTwo();
    const recordingId = await fileRecording(channelId, alice.account.id);
    app.channels.dispatch(channelId, bob.account.id, { type: 'CLAIM_FLOOR' });

    const response = await app.fastify.inject({
      method: 'POST',
      url: `/recordings/${recordingId}/play`,
      headers: auth(alice.token),
    });
    expect(response.statusCode).toBe(409);
    expect((response.json() as { error: string }).error).toContain('floor');
  }, 30_000);
});

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

  it('refuses a member who has stepped out of an occupied channel', async () => {
    const { alice, channelId } = await sessionOfTwo();
    app.channels.dispatch(channelId, alice.account.id, { type: 'STEP_OUT' });
    const response = await upload(alice.token, channelId);
    // 400 rather than 403, which is the distinction this route has always
    // drawn: they are entitled to the channel, they are simply not in it.
    expect(response.statusCode).toBe(400);
    expect((response.json() as { error: string }).error).toContain('not in');
  });

  it('refuses a member outside an empty channel too, since 2026-08-24', async () => {
    // `canLoadTrack` rather than `canControlPlayback`. Putting something on
    // leaves it there for whoever steps in next, so it asks presence where
    // driving what is already loaded asks only `hasTheRoom` — the same split
    // `canStartWatch` makes for a party.
    const { alice, bob, channelId } = await sessionOfTwo();
    app.channels.dispatch(channelId, alice.account.id, { type: 'STEP_OUT' });
    app.channels.dispatch(channelId, bob.account.id, { type: 'STEP_OUT' });
    const response = await upload(alice.token, channelId);
    expect(response.statusCode).toBe(400);
  });

  it('still lets somebody outside an empty channel drive what is loaded', async () => {
    const { alice, bob, channelId } = await sessionOfTwo();
    await upload(alice.token, channelId);
    await settle();
    app.channels.dispatch(channelId, alice.account.id, { type: 'STEP_OUT' });
    app.channels.dispatch(channelId, bob.account.id, { type: 'STEP_OUT' });

    // The other half of the rule: an empty channel is nobody's conversation,
    // so tidying up after it does not need stepping in.
    const cleared = app.channels.dispatch(channelId, alice.account.id, {
      type: 'CLEAR_TRACK',
    });
    expect(cleared.ok).toBe(true);
    expect(app.channels.get(channelId)!.playback.track).toBeNull();
  }, 30_000);

  it('opens the media participant, once, on the first track', async () => {
    const { alice, channelId } = await sessionOfTwo();
    await upload(alice.token, channelId);
    await settle();

    expect(media.playbacks).toHaveLength(1);
    expect(media.playbacks[0].identity).toBe(playbackIdentity(channelId));

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
      expect(change.speaker).not.toBe(playbackIdentity(channelId));
      expect(change.listener).not.toBe(playbackIdentity(channelId));
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

/**
 * TASKS § *Stepping Back In*: a channel that stopped being audible while every
 * screen went on saying it was playing.
 *
 * The reason it could last for the life of the channel is that nothing in this
 * server measured the thing that had failed. The transport is a clock, the
 * position is arithmetic on it, and pause and play both went on working — all
 * of them correct, all of them about committed state, and none of them about
 * whether a frame reached the room. Stepping out and back in did not help
 * because the participant is kept for the channel's life on purpose, and
 * force-quitting did not because the fault was never on the phone. Only a new
 * channel helped, because only a new channel built a new pump.
 */
describe('playback that has stopped being heard', () => {
  it('is rebuilt, and resumes where the transport says it is', async () => {
    const { alice, channelId } = await sessionOfTwo();
    await upload(alice.token, channelId);
    app.channels.dispatch(channelId, alice.account.id, { type: 'PLAY' });
    await settle();

    const first = media.playbackFor(channelId)!;
    expect(media.playbacks).toHaveLength(1);

    // Half a second in, the pump stops producing frames — a capture the media
    // library never answers, or a media participant whose connection has gone.
    // Nothing the reducer knows changes, which is the point.
    clock += 500;
    first.producing = false;
    app.channels.tick();
    await settle();

    expect(first.closed).toBe(true);
    expect(media.playbacks).toHaveLength(2);
    const second = media.playbacks[1];
    expect(second.identity).toBe(playbackIdentity(channelId));
    expect(second.file).toBe(first.file);
    // Not from the top: the transport ran on through the silence, and the
    // rebuild has to arrive where everybody's screen already is.
    expect(second.commands).toContainEqual({ type: 'play', fromMs: 500 });
    expect(app.channels.get(channelId)!.playback.status).toBe('playing');
  }, 30_000);

  it('is left alone while it is still producing, playing or not', async () => {
    const { alice, channelId } = await sessionOfTwo();
    await upload(alice.token, channelId);
    await settle();

    // Paused, and still pumping silence — which is what keeps a recording's
    // stem aligned, and is exactly the state a naive "is it playing" check
    // would mistake for a fault.
    clock += 60_000;
    app.channels.tick();
    await settle();

    expect(media.playbacks).toHaveLength(1);
    expect(media.playbackFor(channelId)!.closed).toBe(false);
  }, 30_000);
});

describe('an empty channel stops making noise', () => {
  it('closes the media participant when the last person steps out', async () => {
    // The reducer pauses; this is the half that matters to anyone standing
    // outside. Pausing is not enough and was what shipped: a paused pump goes
    // on publishing silence to the room, so the channel kept a connection to
    // the SFU and a frame every ten milliseconds with nobody in it, for as
    // long as the channel existed — which for a place is indefinitely.
    const { alice, bob, channelId } = await sessionOfTwo();
    await upload(alice.token, channelId);
    app.channels.dispatch(channelId, alice.account.id, { type: 'PLAY' });
    await settle();

    const playback = media.playbackFor(channelId)!;
    app.channels.dispatch(channelId, alice.account.id, { type: 'STEP_OUT' });
    await settle();
    // One of two leaving is not an empty room, and the participant is what
    // keeps the other one's recording stem in step.
    expect(playback.closed).toBe(false);

    clock += 5_000;
    app.channels.dispatch(channelId, bob.account.id, { type: 'STEP_OUT' });
    await settle();

    expect(app.channels.get(channelId)!.playback.status).toBe('paused');
    expect(playback.closed).toBe(true);
  });

  it('comes back with the same track when somebody returns', async () => {
    // The risk in closing it: `closePlayback` deletes the uploaded file as
    // well as the participant, which is right for a channel that has ended and
    // would be a channel silently losing its track for one that merely
    // emptied. Emptying releases the participant and keeps the file.
    const { alice, bob, channelId } = await sessionOfTwo();
    await upload(alice.token, channelId);
    await settle();
    const first = media.playbackFor(channelId)!;

    app.channels.dispatch(channelId, alice.account.id, { type: 'STEP_OUT' });
    app.channels.dispatch(channelId, bob.account.id, { type: 'STEP_OUT' });
    await settle();
    expect(first.closed).toBe(true);

    clock += 5_000;
    app.channels.dispatch(channelId, bob.account.id, { type: 'ENTER' });
    await settle();

    expect(media.playbacks).toHaveLength(2);
    // `playbackFor` is the first ever opened for the room, which is the one
    // that just closed — the same reason the rebuild test reaches past it.
    const second = media.playbacks[1];
    expect(second.closed).toBe(false);
    expect(second.file).toBe(first.file);
    // Paused, because that is what the empty room left the transport at, and
    // the participant catches up with the state rather than restarting it.
    expect(app.channels.get(channelId)!.playback.status).toBe('paused');
  });
});
