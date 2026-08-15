import { buildApp, type App } from '../src/app';
import { MemoryMailer } from '../src/mail';
import { MemoryMediaServer } from '../src/media';

/**
 * The floor is specified as a hard cut at the transport level. These assert
 * that a claim actually reaches the media server as a mute, that it targets the
 * right party, and that it cannot be triggered by anyone but the authority.
 */

let app: App;
let media: MemoryMediaServer;
let clock = 1_700_000_000_000;

beforeEach(() => {
  clock = 1_700_000_000_000;
  media = new MemoryMediaServer();
  app = buildApp({
    dbPath: ':memory:',
    mailer: new MemoryMailer(),
    media,
    mediaUrl: 'wss://example.livekit.cloud',
    now: () => clock,
    // No grace period here: the delay exists to let real clients disconnect
    // first, and waiting it out would only slow the suite down.
    roomCloseGraceMs: 0,
  });
});

afterEach(async () => {
  app.channels.stop();
  await app.fastify.close();
});

const auth = (token: string) => ({ authorization: `Bearer ${token}` });

/**
 * The id of the run in progress, which prefixes every object it writes.
 *
 * Keys carry the run because the per-identity segment index restarts at 001
 * for each run: without it, a channel's second recording would overwrite its
 * first in the bucket while the first row went on pointing at those keys.
 *
 * It throws once the run is over, on purpose: `runId` is non-null exactly
 * while a run is in progress, so a test asserting keys after a stop must have
 * captured the id while it still existed rather than read a null out of the
 * channel and quietly build `.../null/...` into its expectation.
 */
function runIdOf(channelId: string): string {
  const runId = app.channels.get(channelId)?.recording.runId;
  if (!runId) throw new Error('no run in progress');
  return runId;
}

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

/** Media calls are fire-and-forget, so let the microtask queue drain. */
const settle = () => new Promise((r) => setTimeout(r, 0));

describe('the floor as an actual mute', () => {
  it('mutes the other party when a claim is made', async () => {
    const { alice, bob, channelId } = await sessionOfTwo();

    app.channels.dispatch(channelId, alice.account.id, { type: 'CLAIM_FLOOR' });
    await settle();

    expect(media.isMuted(channelId, bob.account.id)).toBe(true);
    expect(media.isMuted(channelId, alice.account.id)).toBe(false);
  });

  it('acts on the listener, never on the silenced party', async () => {
    // The property that makes this design survivable. Two earlier versions
    // acted on the speaker — muting their track, then revoking their publish
    // permission — and both broke them: unpublishing tears down iOS's audio
    // unit, so they lost their microphone and their playback and got neither
    // back. Withholding them from the listener leaves their pipeline alone.
    const { alice, bob, channelId } = await sessionOfTwo();
    media.subscriptions.length = 0;

    app.channels.dispatch(channelId, alice.account.id, { type: 'CLAIM_FLOOR' });
    await settle();

    // Alice holds the floor, so Alice stops receiving Bob.
    expect(media.subscriptions).toContainEqual({
      room: channelId,
      speaker: bob.account.id,
      listener: alice.account.id,
      silenced: true,
    });
    // Bob keeps hearing Alice throughout — silencing him is not deafening him.
    expect(media.subscriptions).toContainEqual({
      room: channelId,
      speaker: alice.account.id,
      listener: bob.account.id,
      silenced: false,
    });
    // And nothing was asked of Bob's own publishing.
    expect(
      media.subscriptions.filter((s) => s.listener === bob.account.id && s.silenced)
    ).toEqual([]);
  });

  it('restores the silenced party when the claim is released, not just on paper', async () => {
    // The bug this exists for: claims silenced correctly and releases restored
    // nobody, so the floor was a one-way door. Muting a track is something a
    // server may do; un-muting one is something LiveKit refuses, so
    // enforcement is publish permission — reversible in both directions.
    const { alice, bob, channelId } = await sessionOfTwo();

    app.channels.dispatch(channelId, alice.account.id, { type: 'CLAIM_FLOOR' });
    await settle();
    expect(media.isMuted(channelId, bob.account.id)).toBe(true);

    app.channels.dispatch(channelId, alice.account.id, { type: 'RELEASE_FLOOR' });
    await settle();
    expect(media.isMuted(channelId, bob.account.id)).toBe(false);

    // And it survives a second round: the other party claims, then releases.
    clock += 61_000;
    app.channels.dispatch(channelId, bob.account.id, { type: 'CLAIM_FLOOR' });
    await settle();
    expect(media.isMuted(channelId, alice.account.id)).toBe(true);
    expect(media.isMuted(channelId, bob.account.id)).toBe(false);

    app.channels.dispatch(channelId, bob.account.id, { type: 'RELEASE_FLOOR' });
    await settle();
    expect(media.isMuted(channelId, alice.account.id)).toBe(false);
    expect(media.isMuted(channelId, bob.account.id)).toBe(false);
  });

  it('restores both when the claim is released', async () => {
    const { alice, bob, channelId } = await sessionOfTwo();
    app.channels.dispatch(channelId, alice.account.id, { type: 'CLAIM_FLOOR' });
    await settle();

    app.channels.dispatch(channelId, alice.account.id, { type: 'RELEASE_FLOOR' });
    await settle();

    expect(media.isMuted(channelId, bob.account.id)).toBe(false);
    expect(media.isMuted(channelId, alice.account.id)).toBe(false);
  });

  it('unmutes when the three minutes expire, without anyone acting', async () => {
    const { alice, bob, channelId } = await sessionOfTwo();
    app.channels.dispatch(channelId, alice.account.id, { type: 'CLAIM_FLOOR' });
    await settle();
    expect(media.isMuted(channelId, bob.account.id)).toBe(true);

    clock += 3 * 60 * 1000;
    app.channels.tick();
    await settle();

    expect(media.isMuted(channelId, bob.account.id)).toBe(false);
  });

  it('unmutes when the holder leaves mid-claim', async () => {
    const { alice, bob, channelId } = await sessionOfTwo();
    app.channels.dispatch(channelId, alice.account.id, { type: 'CLAIM_FLOOR' });
    await settle();

    app.channels.dispatch(channelId, alice.account.id, { type: 'STEP_OUT' });
    await settle();

    expect(media.isMuted(channelId, bob.account.id)).toBe(false);
  });

  it('does not touch the media server when a refused claim changes nothing', async () => {
    const { alice, bob, channelId } = await sessionOfTwo();
    app.channels.dispatch(channelId, alice.account.id, { type: 'CLAIM_FLOOR' });
    await settle();
    media.muted.clear();

    // Bob is silenced and cannot claim; nothing should reach the media server.
    app.channels.dispatch(channelId, bob.account.id, { type: 'CLAIM_FLOOR' });
    await settle();

    expect(media.muted.size).toBe(0);
  });

  it('closes the room when the channel ends', async () => {
    const { alice, channelId } = await sessionOfTwo();
    endChannel(channelId);
    await settle();
    expect(media.closed).toContain(channelId);
  });

  it('keeps the rules working when the media server fails', async () => {
    const broken = buildApp({
      dbPath: ':memory:',
      mailer: new MemoryMailer(),
      now: () => clock,
      media: {
        async issueToken() {
          return 'irrelevant';
        },
        async setSilenced(): Promise<string[]> {
          throw new Error('livekit unreachable');
        },
        async audioTracks(): Promise<Map<string, string[]>> {
          throw new Error('livekit unreachable');
        },
        async closeRoom() {},
        async startRecording() {
          return 'egress_x';
        },
        async stopRecording() {},
        async openPlayback() {
          throw new Error('livekit unreachable');
        },
      },
    });

    const mk = async (identifier: string, displayName: string) => {
      const code = broken.accounts.issueCode(identifier, clock)!;
      const res = await broken.fastify.inject({
        method: 'POST',
        url: '/auth/verify',
        payload: { identifier, code, displayName },
      });
      return res.json() as { token: string; account: { id: string } };
    };
    const a = await mk('a@example.com', 'A');
    const b = await mk('b@example.com', 'B');
    await broken.fastify.inject({
      method: 'POST',
      url: '/contacts/request',
      headers: { authorization: `Bearer ${a.token}` },
      payload: { identifier: 'b@example.com' },
    });
    await broken.fastify.inject({
      method: 'POST',
      url: `/contacts/${a.account.id}/accept`,
      headers: { authorization: `Bearer ${b.token}` },
    });
    const created = await broken.fastify.inject({
      method: 'POST',
      url: '/channels',
      headers: { authorization: `Bearer ${a.token}` },
      payload: { contactId: b.account.id },
    });
    const { channelId } = created.json() as { channelId: string };
    broken.channels.dispatch(channelId, b.account.id, { type: 'ENTER' });

    // The mute throws, but the channel rules must still advance — the reducer
    // is the authority, and the media server is downstream of it.
    broken.channels.dispatch(channelId, a.account.id, { type: 'CLAIM_FLOOR' });
    await settle();

    expect(broken.channels.get(channelId)!.floor.holder).toBe(a.account.id);

    // And the failure must not have escaped as an unhandled rejection.
    clock += 3 * 60 * 1000;
    broken.channels.tick();
    await settle();
    expect(broken.channels.get(channelId)!.floor.holder).toBeNull();

    broken.channels.stop();
    await broken.fastify.close();
  });
});

describe('recording capture', () => {
  it('captures one isolated stem per participant, not a room mix', async () => {
    // A mix cannot be un-mixed, so the floor could never be applied to it.
    const { alice, bob, channelId } = await sessionOfTwo();
    app.channels.dispatch(channelId, alice.account.id, { type: 'START_RECORDING' });
    await settle();

    expect(media.recordings).toHaveLength(2);
    expect(media.recordings.map((r) => r.identity).sort()).toEqual(
      [alice.account.id, bob.account.id].sort()
    );
    const run = runIdOf(channelId);
    for (const r of media.recordings) {
      expect(r.room).toBe(channelId);
      expect(r.key).toBe(`${channelId}/${run}/${r.identity}-001.ogg`);
      expect(r.stopped).toBe(false);
    }
  });

  it('stops every stem on pause and starts new segments on resume', async () => {
    const { alice, channelId } = await sessionOfTwo();
    app.channels.dispatch(channelId, alice.account.id, { type: 'START_RECORDING' });
    await settle();
    app.channels.dispatch(channelId, alice.account.id, { type: 'PAUSE_RECORDING' });
    await settle();

    // Pausing must genuinely halt capture, not merely mark a boundary to trim
    // later — nothing said while paused should ever reach storage.
    expect(media.recordings.every((r) => r.stopped)).toBe(true);

    app.channels.dispatch(channelId, alice.account.id, { type: 'RESUME_RECORDING' });
    await settle();

    expect(media.recordings).toHaveLength(4);
    // Pause and resume are one run, so both segments sit under the same run
    // prefix — it is the index that distinguishes them, not the run.
    const run = runIdOf(channelId);
    const second = media.recordings.slice(2);
    expect(second.map((r) => r.key).sort()).toEqual(
      [
        `${channelId}/${run}/${alice.account.id}-002.ogg`,
        `${channelId}/${run}/${second.find((r) => r.identity !== alice.account.id)!.identity}-002.ogg`,
      ].sort()
    );
    expect(second.every((r) => !r.stopped)).toBe(true);
  });

  it('stops capture when the recording is stopped', async () => {
    const { alice, channelId } = await sessionOfTwo();
    app.channels.dispatch(channelId, alice.account.id, { type: 'START_RECORDING' });
    await settle();
    app.channels.dispatch(channelId, alice.account.id, { type: 'STOP_RECORDING' });
    await settle();
    expect(media.recordings[0].stopped).toBe(true);
  });

  it('stops capture when the channel ends mid-recording', async () => {
    const { alice, channelId } = await sessionOfTwo();
    app.channels.dispatch(channelId, alice.account.id, { type: 'START_RECORDING' });
    await settle();
    endChannel(channelId);
    await settle();
    expect(media.recordings[0].stopped).toBe(true);
  });

  it('files the recording when the channel ends while paused', async () => {
    // Ending while paused is the path with nothing left to stop: capture was
    // already halted at the pause. The recording must still be finalised and
    // filed, and no egress may be left running.
    const { alice, bob, channelId } = await sessionOfTwo();
    app.channels.dispatch(channelId, alice.account.id, { type: 'START_RECORDING' });
    await settle();
    // Captured while the run still exists: `runId` is null once it ends, and
    // the keys are what stop one run overwriting another's audio, so they are
    // asserted exactly rather than loosely.
    const run = runIdOf(channelId);
    clock += 8_000;
    app.channels.dispatch(channelId, alice.account.id, { type: 'PAUSE_RECORDING' });
    await settle();
    clock += 30_000; // A long pause that must not count towards the duration.
    endChannel(channelId);
    await settle();

    // Idle, not stopped: there is no 'stopped' status any more. A stopped run
    // is simply over, and the channel is ready for the next one.
    expect(app.channels.get(channelId)!.recording.status).toBe('idle');
    expect(media.recordings.every((r) => r.stopped)).toBe(true);

    const row = app.db
      .prepare('SELECT duration_ms, stems FROM recordings WHERE id = ?')
      .get(run) as { duration_ms: number; stems: string };
    const stems = JSON.parse(row.stems) as Record<
      string,
      Array<{ key: string; startMs: number }>
    >;
    expect(Object.keys(stems).sort()).toEqual(
      [alice.account.id, bob.account.id].sort()
    );
    expect(stems[alice.account.id]).toEqual([
      { key: `${channelId}/${run}/${alice.account.id}-001.ogg`, startMs: 0 },
    ]);
    expect(row.duration_ms).toBe(8_000);
  });

  it('stops capture the moment the channel empties', async () => {
    // Nobody is present to press stop. This used to be handled by the channel
    // ending a minute later; now emptying is itself what stops the run, and
    // the channel carries on existing with nothing being captured in it.
    const { alice, bob, channelId } = await sessionOfTwo();
    app.channels.dispatch(channelId, alice.account.id, { type: 'START_RECORDING' });
    await settle();
    app.channels.dispatch(channelId, alice.account.id, { type: 'STEP_OUT' });
    app.channels.dispatch(channelId, bob.account.id, { type: 'STEP_OUT' });
    await settle();

    expect(media.recordings[0].stopped).toBe(true);
    const channel = app.channels.get(channelId)!;
    expect(channel.status).toBe('active');
    // Back to idle rather than to a terminal 'stopped', so whoever comes back
    // into the channel can start a second recording in it.
    expect(channel.recording.status).toBe('idle');
    expect(channel.recording.runId).toBeNull();
  });

  it('records every segment against the finished recording', async () => {
    const { alice, bob, channelId } = await sessionOfTwo();
    app.channels.dispatch(channelId, alice.account.id, { type: 'START_RECORDING' });
    await settle();
    const run = runIdOf(channelId);
    clock += 10_000;
    app.channels.dispatch(channelId, alice.account.id, { type: 'PAUSE_RECORDING' });
    await settle();
    app.channels.dispatch(channelId, alice.account.id, { type: 'RESUME_RECORDING' });
    await settle();
    clock += 5_000;
    endChannel(channelId);
    await settle();

    const row = app.db
      .prepare('SELECT * FROM recordings WHERE id = ?')
      .get(run) as { stems: string; duration_ms: number };
    const stems = JSON.parse(row.stems) as Record<
      string,
      Array<{ key: string; startMs: number }>
    >;
    // Each participant's stem is split by the pause, and only by the pause —
    // and the second segment knows it starts where the first run ended.
    for (const identity of [alice.account.id, bob.account.id]) {
      expect(stems[identity]).toEqual([
        { key: `${channelId}/${run}/${identity}-001.ogg`, startMs: 0 },
        { key: `${channelId}/${run}/${identity}-002.ogg`, startMs: 10_000 },
      ]);
    }
    // Paused time is excluded, so the duration is the two run segments only.
    expect(row.duration_ms).toBe(15_000);
  });

  it('captures nothing when recording was never started', async () => {
    const { alice, channelId } = await sessionOfTwo();
    endChannel(channelId);
    await settle();
    expect(media.recordings).toHaveLength(0);
    const row = app.db
      .prepare('SELECT COUNT(*) c FROM recordings WHERE channel_id = ?')
      .get(channelId) as { c: number };
    expect(row.c).toBe(0);
  });
});

/**
 * A channel holds as many recordings as people start in it.
 *
 * It used to hold at most one, filed when the channel ended, and a start after
 * a stop was a no-op. Now a run is a thing of its own with its own id, its own
 * row, and its own prefix in the bucket — and every piece of state a run
 * accumulates is drained when it is filed. That draining is the whole risk
 * here: anything left behind attributes one run's audio or one run's silences
 * to the next, which makes an export *wrong* rather than missing, and nothing
 * downstream would report a problem.
 */
describe('several recordings in one channel', () => {
  /**
   * Every run this channel has filed, oldest first.
   *
   * `.all` with an explicit order rather than `.get`: a `.get` on channel_id
   * silently answers with an arbitrary one of the rows once there are two,
   * which would let a test about two runs pass while only ever looking at one.
   */
  const runsOf = (channelId: string) =>
    app.db
      .prepare(
        `SELECT id, started_at, duration_ms, stems, floor_timeline
         FROM recordings WHERE channel_id = ? ORDER BY started_at`
      )
      .all(channelId) as Array<{
      id: string;
      started_at: number;
      duration_ms: number;
      stems: string;
      floor_timeline: string;
    }>;

  const keysOf = (row: { stems: string }) =>
    Object.values(
      JSON.parse(row.stems) as Record<string, Array<{ key: string }>>
    )
      .flat()
      .map((segment) => segment.key)
      .sort();

  const stemsOf = (row: { stems: string }) =>
    JSON.parse(row.stems) as Record<
      string,
      Array<{ key: string; startMs: number }>
    >;

  it('files two rows for two runs, with nothing shared between them', async () => {
    const { alice, bob, channelId } = await sessionOfTwo();
    const startedFirst = clock;

    app.channels.dispatch(channelId, alice.account.id, { type: 'START_RECORDING' });
    await settle();
    const first = runIdOf(channelId);
    clock += 6_000;
    app.channels.dispatch(channelId, alice.account.id, { type: 'STOP_RECORDING' });
    await settle();

    clock += 60_000; // A minute of talking that nobody is recording.
    const startedSecond = clock;
    app.channels.dispatch(channelId, alice.account.id, { type: 'START_RECORDING' });
    await settle();
    const second = runIdOf(channelId);
    clock += 9_000;
    app.channels.dispatch(channelId, alice.account.id, { type: 'STOP_RECORDING' });
    await settle();

    expect(second).not.toBe(first);
    const runs = runsOf(channelId);
    expect(runs.map((r) => r.id)).toEqual([first, second]);
    // Each run is timed on its own: the second does not inherit the first's
    // start, and the minute between them belongs to neither.
    expect(runs.map((r) => r.started_at)).toEqual([startedFirst, startedSecond]);
    expect(runs.map((r) => r.duration_ms)).toEqual([6_000, 9_000]);

    // The point of putting the run in the key. Both runs number their stems
    // from 001, so without the prefix these two sets would be identical and
    // the second upload would overwrite the first while row one went on
    // pointing at the keys.
    const [firstKeys, secondKeys] = runs.map(keysOf);
    expect(firstKeys).toEqual(
      [
        `${channelId}/${first}/${alice.account.id}-001.ogg`,
        `${channelId}/${first}/${bob.account.id}-001.ogg`,
      ].sort()
    );
    expect(secondKeys).toEqual(
      [
        `${channelId}/${second}/${alice.account.id}-001.ogg`,
        `${channelId}/${second}/${bob.account.id}-001.ogg`,
      ].sort()
    );
    expect(firstKeys.filter((key) => secondKeys.includes(key))).toEqual([]);
  });

  it('files a run when it is stopped, not when the channel ends', async () => {
    // This is what makes several recordings possible at all. While filing
    // happened at the end of a channel's life there could only ever be one,
    // and a permanent channel might never reach that moment.
    const { alice, channelId } = await sessionOfTwo();
    app.channels.dispatch(channelId, alice.account.id, { type: 'START_RECORDING' });
    await settle();
    const run = runIdOf(channelId);
    clock += 5_000;
    app.channels.dispatch(channelId, alice.account.id, { type: 'STOP_RECORDING' });
    await settle();

    // The channel is still going, and its recording is already reachable.
    const channel = app.channels.get(channelId)!;
    expect(channel.status).toBe('active');
    expect(channel.endedAt).toBeNull();
    expect(runsOf(channelId).map((r) => r.id)).toEqual([run]);
    expect(channel.lastRecording).toMatchObject({ runId: run, durationMs: 5_000 });
  });

  it('numbers the second run’s segments from one, under its own prefix', async () => {
    // The index restarting is exactly why the run has to be in the path. A
    // pause inside run two writes -001 and -002 again, and those names mean a
    // different pair of objects than run one's did.
    const { alice, bob, channelId } = await sessionOfTwo();

    app.channels.dispatch(channelId, alice.account.id, { type: 'START_RECORDING' });
    await settle();
    const first = runIdOf(channelId);
    clock += 4_000;
    app.channels.dispatch(channelId, alice.account.id, { type: 'STOP_RECORDING' });
    await settle();

    app.channels.dispatch(channelId, alice.account.id, { type: 'START_RECORDING' });
    await settle();
    const second = runIdOf(channelId);
    clock += 3_000;
    app.channels.dispatch(channelId, alice.account.id, { type: 'PAUSE_RECORDING' });
    await settle();
    clock += 20_000; // Paused, so absent from the audio and from the offsets.
    app.channels.dispatch(channelId, alice.account.id, { type: 'RESUME_RECORDING' });
    await settle();
    clock += 2_000;
    app.channels.dispatch(channelId, alice.account.id, { type: 'STOP_RECORDING' });
    await settle();

    const [runOne, runTwo] = runsOf(channelId);
    for (const identity of [alice.account.id, bob.account.id]) {
      expect(stemsOf(runOne)[identity]).toEqual([
        { key: `${channelId}/${first}/${identity}-001.ogg`, startMs: 0 },
      ]);
      expect(stemsOf(runTwo)[identity]).toEqual([
        { key: `${channelId}/${second}/${identity}-001.ogg`, startMs: 0 },
        { key: `${channelId}/${second}/${identity}-002.ogg`, startMs: 3_000 },
      ]);
    }
    // Nothing from run two was filed against run one, and nothing under run
    // one's prefix appears in run two — the segments are drained at filing.
    expect(keysOf(runOne)).toHaveLength(2);
    expect(
      keysOf(runTwo).filter((key) => key.startsWith(`${channelId}/${first}/`))
    ).toEqual([]);
    expect(runTwo.duration_ms).toBe(5_000);
  });

  it('keeps a floor window on the run it happened in', async () => {
    // The one that matters most. Floor windows are what gate a silenced
    // speaker out of an export, so a window leaking into the next run would
    // make a remark audible that the floor was invoked to suppress — and it
    // would be silently wrong, not missing.
    const { alice, bob, channelId } = await sessionOfTwo();

    app.channels.dispatch(channelId, alice.account.id, { type: 'START_RECORDING' });
    await settle();
    clock += 5_000;
    app.channels.dispatch(channelId, alice.account.id, { type: 'CLAIM_FLOOR' });
    clock += 3_000;
    app.channels.dispatch(channelId, alice.account.id, { type: 'RELEASE_FLOOR' });
    clock += 1_000;
    app.channels.dispatch(channelId, alice.account.id, { type: 'STOP_RECORDING' });
    await settle();

    // A second run, with nobody claiming anything in it.
    clock += 1_000;
    app.channels.dispatch(channelId, alice.account.id, { type: 'START_RECORDING' });
    await settle();
    clock += 7_000;
    app.channels.dispatch(channelId, alice.account.id, { type: 'STOP_RECORDING' });
    await settle();

    const [runOne, runTwo] = runsOf(channelId);
    expect(JSON.parse(runOne.floor_timeline)).toEqual([
      { identity: bob.account.id, fromMs: 5_000, toMs: 8_000 },
    ]);
    expect(JSON.parse(runTwo.floor_timeline)).toEqual([]);
  });
});

describe('when capture cannot start', () => {
  it('ends the recording and says why, rather than counting up in silence', async () => {
    // The failure that hid a completely broken capture path for hours: every
    // egress refused, the log said so, and the channel went on showing
    // "Recording" while nothing was kept.
    const { alice, channelId } = await sessionOfTwo();
    media.failStart = {
      reason: 'no supported codec is compatible with all outputs',
    };

    app.channels.dispatch(channelId, alice.account.id, { type: 'START_RECORDING' });
    await settle();

    const recording = app.channels.get(channelId)!.recording;
    // Idle, not stopped: nothing was captured, so the recording did not happen
    // and must not consume the channel's one attempt.
    expect(recording.status).toBe('idle');
    expect(recording.failure).toBe(
      'no supported codec is compatible with all outputs'
    );
  });

  it('claims no stem it did not write', async () => {
    // A recording that lists an object nobody wrote is worse than one that
    // lists none: export fetches it and fails on audio that never existed.
    const { alice, channelId } = await sessionOfTwo();
    media.failStart = { reason: 'egress refused' };

    app.channels.dispatch(channelId, alice.account.id, { type: 'START_RECORDING' });
    await settle();
    clock += 1_000;
    endChannel(channelId);
    await settle();

    const row = app.db
      .prepare('SELECT stems FROM recordings WHERE channel_id = ?')
      .get(channelId) as { stems: string } | undefined;
    const stems = row ? JSON.parse(row.stems) : {};
    expect(Object.values(stems).flat()).toEqual([]);
  });

  it('fails the whole recording when only one speaker cannot be captured', async () => {
    // A channel recorded with one voice missing is worse than none, because it
    // looks complete. Whichever stem did start is stopped with it.
    const { alice, bob, channelId } = await sessionOfTwo();
    media.failStart = { reason: 'that track went away', identity: bob.account.id };

    app.channels.dispatch(channelId, alice.account.id, { type: 'START_RECORDING' });
    await settle();

    expect(app.channels.get(channelId)!.recording.status).toBe('idle');
    expect(app.channels.get(channelId)!.recording.failure).toBe(
      'that track went away'
    );
    // Alice's capture did start, and must not be left running.
    expect(media.recordings.every((r) => r.stopped)).toBe(true);
  });

  it('records everybody else when one participant has no track', async () => {
    // Not a failure, and this is the difference: `failStart` above is the
    // recorder refusing, which is fatal. Somebody publishing nothing is an
    // ordinary state this application creates on purpose — the microphone
    // stays closed while you are alone in a channel — and it must not cost
    // everyone else the conversation.
    const { alice, bob, channelId } = await sessionOfTwo();
    media.unpublished.add(`${channelId}/${bob.account.id}`);

    app.channels.dispatch(channelId, alice.account.id, { type: 'START_RECORDING' });
    await settle();

    const recording = app.channels.get(channelId)!.recording;
    expect(recording.status).toBe('recording');
    expect(recording.failure).toBeNull();
    // Alice is being captured; bob has nothing to capture and no stem.
    expect(media.recordings.map((r) => r.identity)).toEqual([alice.account.id]);
  });

  it('picks somebody up when their microphone opens mid-run', async () => {
    // The same path a late arrival takes, which is what makes this cheap: a
    // track appearing ten seconds in yields a stem from ten seconds in.
    const { alice, bob, channelId } = await sessionOfTwo();
    media.unpublished.add(`${channelId}/${bob.account.id}`);
    app.channels.dispatch(channelId, alice.account.id, { type: 'START_RECORDING' });
    await settle();
    expect(media.recordings.map((r) => r.identity)).toEqual([alice.account.id]);

    // Their microphone opens, and the retry window passes.
    media.unpublished.clear();
    clock += 6_000;
    app.channels.tick();
    await settle();

    expect(media.recordings.map((r) => r.identity)).toEqual([
      alice.account.id,
      bob.account.id,
    ]);
  });

  it('files a recording without somebody who never published', async () => {
    const { alice, bob, channelId } = await sessionOfTwo();
    media.unpublished.add(`${channelId}/${bob.account.id}`);
    app.channels.dispatch(channelId, alice.account.id, { type: 'START_RECORDING' });
    await settle();
    clock += 10_000;
    app.channels.dispatch(channelId, alice.account.id, { type: 'STOP_RECORDING' });
    await settle();

    const row = app.db
      .prepare('SELECT stems, duration_ms, failure FROM recordings WHERE channel_id = ?')
      .get(channelId) as {
      stems: string;
      duration_ms: number;
      failure: string | null;
    };
    // A recording exists, it is not marked failed, and it honestly holds one
    // voice rather than claiming a stem nobody wrote.
    expect(row.failure).toBeNull();
    expect(row.duration_ms).toBeGreaterThan(0);
    expect(Object.keys(JSON.parse(row.stems))).toEqual([alice.account.id]);
  });

  it('lets the recording be started again afterwards', async () => {
    const { alice, channelId } = await sessionOfTwo();
    media.failStart = { reason: 'transient' };
    app.channels.dispatch(channelId, alice.account.id, { type: 'START_RECORDING' });
    await settle();
    expect(app.channels.get(channelId)!.recording.failure).toBe('transient');

    media.failStart = null;
    app.channels.dispatch(channelId, alice.account.id, { type: 'START_RECORDING' });
    await settle();
    const recording = app.channels.get(channelId)!.recording;
    expect(recording.status).toBe('recording');
    // The old reason must not outlive the recording it belonged to.
    expect(recording.failure).toBeNull();
  });
});

describe('the floor timeline', () => {
  /** The windows persisted for a finished channel's recording. */
  const timelineFor = (channelId: string) => {
    const row = app.db
      .prepare('SELECT floor_timeline FROM recordings WHERE channel_id = ?')
      .get(channelId) as { floor_timeline: string } | undefined;
    return row ? (JSON.parse(row.floor_timeline) as Array<{
      identity: string;
      fromMs: number;
      toMs: number;
    }>) : [];
  };

  it('records when each party was silenced, as offsets into the audio', async () => {
    const { alice, bob, channelId } = await sessionOfTwo();
    app.channels.dispatch(channelId, alice.account.id, { type: 'START_RECORDING' });
    await settle();

    clock += 10_000;
    app.channels.dispatch(channelId, alice.account.id, { type: 'CLAIM_FLOOR' });
    clock += 8_000;
    app.channels.dispatch(channelId, alice.account.id, { type: 'RELEASE_FLOOR' });
    clock += 5_000;
    endChannel(channelId);
    await settle();

    // Alice claimed, so Bob is the one to be dropped from the encode.
    expect(timelineFor(channelId)).toEqual([
      { identity: bob.account.id, fromMs: 10_000, toMs: 18_000 },
    ]);
  });

  it('excludes paused time, so offsets match the recorded audio', async () => {
    // The encoder gates concatenated segments, which contain no paused time.
    // An offset measured against the wall clock would drift past every pause.
    const { alice, bob, channelId } = await sessionOfTwo();
    app.channels.dispatch(channelId, alice.account.id, { type: 'START_RECORDING' });
    await settle();

    clock += 5_000;
    app.channels.dispatch(channelId, alice.account.id, { type: 'PAUSE_RECORDING' });
    clock += 30_000; // A long pause, absent from the audio entirely.
    app.channels.dispatch(channelId, alice.account.id, { type: 'RESUME_RECORDING' });
    await settle();

    clock += 4_000;
    app.channels.dispatch(channelId, alice.account.id, { type: 'CLAIM_FLOOR' });
    clock += 3_000;
    endChannel(channelId);
    await settle();

    // 5s recorded, then 4s more: the claim begins 9s into the audio, not 39s.
    expect(timelineFor(channelId)).toEqual([
      { identity: bob.account.id, fromMs: 9_000, toMs: 12_000 },
    ]);
  });

  it('closes a claim that was still open when the recording ended', async () => {
    const { alice, bob, channelId } = await sessionOfTwo();
    app.channels.dispatch(channelId, alice.account.id, { type: 'START_RECORDING' });
    await settle();
    clock += 6_000;
    app.channels.dispatch(channelId, alice.account.id, { type: 'CLAIM_FLOOR' });
    clock += 4_000;
    endChannel(channelId);
    await settle();

    expect(timelineFor(channelId)).toEqual([
      { identity: bob.account.id, fromMs: 6_000, toMs: 10_000 },
    ]);
  });

  it('opens a window at zero when recording starts mid-claim', async () => {
    // The claim predates the recording, so the silenced party is inaudible from
    // the first sample rather than from whenever the next transition happens.
    const { alice, bob, channelId } = await sessionOfTwo();
    app.channels.dispatch(channelId, alice.account.id, { type: 'CLAIM_FLOOR' });
    clock += 2_000;
    app.channels.dispatch(channelId, alice.account.id, { type: 'START_RECORDING' });
    await settle();
    clock += 7_000;
    endChannel(channelId);
    await settle();

    expect(timelineFor(channelId)).toEqual([
      { identity: bob.account.id, fromMs: 0, toMs: 7_000 },
    ]);
  });

  it('records both turns when the floor alternates', async () => {
    const { alice, bob, channelId } = await sessionOfTwo();
    app.channels.dispatch(channelId, alice.account.id, { type: 'START_RECORDING' });
    await settle();

    clock += 3_000;
    app.channels.dispatch(channelId, alice.account.id, { type: 'CLAIM_FLOOR' });
    clock += 4_000;
    app.channels.dispatch(channelId, alice.account.id, { type: 'RELEASE_FLOOR' });
    clock += 1_000;
    // Bob may claim immediately: the other party claimed last.
    app.channels.dispatch(channelId, bob.account.id, { type: 'CLAIM_FLOOR' });
    clock += 5_000;
    endChannel(channelId);
    await settle();

    expect(timelineFor(channelId)).toEqual([
      { identity: bob.account.id, fromMs: 3_000, toMs: 7_000 },
      { identity: alice.account.id, fromMs: 8_000, toMs: 13_000 },
    ]);
  });

  it('leaves the timeline empty when nobody claimed', async () => {
    const { alice, channelId } = await sessionOfTwo();
    app.channels.dispatch(channelId, alice.account.id, { type: 'START_RECORDING' });
    await settle();
    clock += 9_000;
    endChannel(channelId);
    await settle();

    expect(timelineFor(channelId)).toEqual([]);
  });
});

describe('join credentials', () => {
  it('issues a token scoped to the channel room', async () => {
    const { alice, channelId } = await sessionOfTwo();
    const response = await app.fastify.inject({
      method: 'POST',
      url: `/channels/${channelId}/media-token`,
      headers: auth(alice.token),
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      token: `token:${channelId}:${alice.account.id}`,
      url: 'wss://example.livekit.cloud',
    });
  });

  it('refuses anyone outside the channel', async () => {
    const { channelId } = await sessionOfTwo();
    const mallory = await signIn('mallory@example.com', 'Mallory');
    const response = await app.fastify.inject({
      method: 'POST',
      url: `/channels/${channelId}/media-token`,
      headers: auth(mallory.token),
    });
    expect(response.statusCode).toBe(403);
    expect(media.issued).not.toContainEqual({
      room: channelId,
      identity: mallory.account.id,
    });
  });

  it('refuses an unauthenticated caller', async () => {
    const { channelId } = await sessionOfTwo();
    const response = await app.fastify.inject({
      method: 'POST',
      url: `/channels/${channelId}/media-token`,
    });
    expect(response.statusCode).toBe(401);
  });

  it('reports audio as unconfigured when no media server is present', async () => {
    const noAudio = buildApp({ dbPath: ':memory:', now: () => clock });
    const health = await noAudio.fastify.inject({ method: 'GET', url: '/healthz' });
    expect(health.json().audio).toBe('none');
    noAudio.channels.stop();
    await noAudio.fastify.close();
  });
});

/**
 * What a recording is labelled by, once the channel that made it is gone or
 * the people in it have renamed themselves.
 *
 * The participant ids on a recording row never change. What they *resolve to*
 * does, and that is what the label is made of — so the names are frozen with
 * the roster rather than looked up when the list is read.
 */
describe('who a recording says was there', () => {
  const rowFor = (channelId: string) =>
    app.db
      .prepare(
        `SELECT participants, participant_names, name FROM recordings
         WHERE channel_id = ?`
      )
      .get(channelId) as {
      participants: string;
      participant_names: string | null;
      name: string | null;
    };

  const recordingsFor = async (token: string) => {
    const reply = await app.fastify.inject({
      method: 'GET',
      url: '/home',
      headers: auth(token),
    });
    return (
      reply.json() as {
        recordings: Array<{
          name: string;
          others: Array<{ displayName: string }>;
        }>;
      }
    ).recordings;
  };

  async function recorded() {
    const { alice, bob, channelId } = await sessionOfTwo();
    app.channels.dispatch(channelId, alice.account.id, { type: 'START_RECORDING' });
    await settle();
    clock += 5_000;
    app.channels.dispatch(channelId, alice.account.id, { type: 'STOP_RECORDING' });
    await settle();
    return { alice, bob, channelId };
  }

  it('writes the names down when the run is filed', async () => {
    const { alice, bob, channelId } = await recorded();
    const row = rowFor(channelId);
    expect(JSON.parse(row.participants).sort()).toEqual(
      [alice.account.id, bob.account.id].sort()
    );
    expect(JSON.parse(row.participant_names!)).toEqual({
      [alice.account.id]: 'Alice',
      [bob.account.id]: 'Bob',
    });
  });

  it('keeps the name somebody had, when they change it afterwards', async () => {
    // A recording is a record of something that happened. Relabelling it
    // because somebody has since renamed themselves rewrites that record.
    const { alice, bob } = await recorded();
    await app.fastify.inject({
      method: 'POST',
      url: '/me',
      headers: auth(bob.token),
      payload: { displayName: 'Robert' },
    });

    const [recording] = await recordingsFor(alice.token);
    expect(recording.others.map((o) => o.displayName)).toEqual(['Bob']);
  });

  it('names a participant with no account row at all', async () => {
    // Guarding the read path rather than a live failure: accounts cannot
    // currently be deleted — foreign keys refuse it — so no id in a recording
    // is unresolvable today. What is being pinned is that the label comes
    // from the snapshot and not from a lookup, because a lookup that finds
    // nothing *drops* the participant rather than reporting it, and a
    // recording of two people would read as though nobody else was there.
    const { alice, channelId } = await recorded();
    const row = rowFor(channelId);
    app.db
      .prepare(
        'UPDATE recordings SET participants = ?, participant_names = ? WHERE channel_id = ?'
      )
      .run(
        JSON.stringify([...JSON.parse(row.participants), 'acct_vanished']),
        JSON.stringify({
          ...JSON.parse(row.participant_names!),
          acct_vanished: 'Someone Who Left',
        }),
        channelId
      );

    const [recording] = await recordingsFor(alice.token);
    expect(recording.others.map((o) => o.displayName)).toContain(
      'Someone Who Left'
    );
  });

  it('resolves live for a row written before names were recorded', async () => {
    const { alice, bob, channelId } = await recorded();
    app.db
      .prepare('UPDATE recordings SET participant_names = NULL WHERE channel_id = ?')
      .run(channelId);

    const [recording] = await recordingsFor(alice.token);
    expect(recording.others.map((o) => o.displayName)).toEqual([
      bob.account.displayName,
    ]);
  });
});

/**
 * The name of a recording, which is settled rather than derived.
 *
 * Decided when the run stops, the same for everybody who was in it, and never
 * changed after. A channel is labelled from the viewer's side — it is a place
 * you are in — but a recording is one artefact that exists once, and two
 * people discussing it must be discussing it by the same name.
 */
describe('naming a recording', () => {
  const nameFor = (channelId: string) =>
    (
      app.db
        .prepare('SELECT name FROM recordings WHERE channel_id = ?')
        .get(channelId) as { name: string | null }
    ).name;

  const homeRecordings = async (token: string) => {
    const reply = await app.fastify.inject({
      method: 'GET',
      url: '/home',
      headers: auth(token),
    });
    return (reply.json() as { recordings: Array<{ name: string }> }).recordings;
  };

  async function recorded() {
    const { alice, bob, channelId } = await sessionOfTwo();
    app.channels.dispatch(channelId, alice.account.id, { type: 'START_RECORDING' });
    await settle();
    clock += 5_000;
    app.channels.dispatch(channelId, alice.account.id, { type: 'STOP_RECORDING' });
    await settle();
    return { alice, bob, channelId };
  }

  it('names everyone who took part, the reader included', async () => {
    const { channelId } = await recorded();
    expect(nameFor(channelId)).toBe('Alice and Bob');
  });

  it('reads the same to both of them', async () => {
    // The property the whole design is for. A viewer-relative label would
    // give Alice "Bob" and Bob "Alice" for one and the same recording.
    const { alice, bob } = await recorded();
    const [forAlice] = await homeRecordings(alice.token);
    const [forBob] = await homeRecordings(bob.token);
    expect(forAlice.name).toBe(forBob.name);
    expect(forAlice.name).toBe('Alice and Bob');
  });

  it('is fixed at the stop, so a later rename does not reach it', async () => {
    const { alice, bob, channelId } = await recorded();
    await app.fastify.inject({
      method: 'POST',
      url: '/me',
      headers: auth(bob.token),
      payload: { displayName: 'Robert' },
    });

    expect(nameFor(channelId)).toBe('Alice and Bob');
    const [recording] = await homeRecordings(alice.token);
    expect(recording.name).toBe('Alice and Bob');
  });

  it('takes the channel name when the channel has one', async () => {
    const { alice, bob, channelId } = await sessionOfTwo();
    app.channels.dispatch(channelId, alice.account.id, {
      type: 'SET_NAME',
      name: 'Thursday rehearsal',
    } as never);
    app.channels.dispatch(channelId, alice.account.id, { type: 'START_RECORDING' });
    await settle();
    clock += 5_000;
    app.channels.dispatch(channelId, alice.account.id, { type: 'STOP_RECORDING' });
    await settle();

    expect(nameFor(channelId)).toBe('Thursday rehearsal');
    const [forBob] = await homeRecordings(bob.token);
    expect(forBob.name).toBe('Thursday rehearsal');
  });

  it('gives every run in a named channel the same name', async () => {
    // Deliberate. A name says where a recording came from; when it happened
    // is what tells two of them apart.
    const { alice, channelId } = await sessionOfTwo();
    app.channels.dispatch(channelId, alice.account.id, {
      type: 'SET_NAME',
      name: 'Thursday rehearsal',
    } as never);
    for (const _ of [1, 2]) {
      app.channels.dispatch(channelId, alice.account.id, {
        type: 'START_RECORDING',
      });
      await settle();
      clock += 5_000;
      app.channels.dispatch(channelId, alice.account.id, {
        type: 'STOP_RECORDING',
      });
      await settle();
      clock += 1_000;
    }

    const names = app.db
      .prepare('SELECT name, ended_at FROM recordings WHERE channel_id = ?')
      .all(channelId) as Array<{ name: string; ended_at: number }>;
    expect(names).toHaveLength(2);
    expect(names.map((r) => r.name)).toEqual([
      'Thursday rehearsal',
      'Thursday rehearsal',
    ]);
    // Distinguished by when they ended, which is what the export filename uses.
    expect(names[0].ended_at).not.toBe(names[1].ended_at);
  });

  it('keeps the name the channel had, not the one it has now', async () => {
    const { alice, channelId } = await sessionOfTwo();
    app.channels.dispatch(channelId, alice.account.id, {
      type: 'SET_NAME',
      name: 'Thursday rehearsal',
    } as never);
    app.channels.dispatch(channelId, alice.account.id, { type: 'START_RECORDING' });
    await settle();
    clock += 5_000;
    app.channels.dispatch(channelId, alice.account.id, { type: 'STOP_RECORDING' });
    await settle();

    app.channels.dispatch(channelId, alice.account.id, {
      type: 'SET_NAME',
      name: 'Something else',
    } as never);
    expect(nameFor(channelId)).toBe('Thursday rehearsal');
  });

  it('is not disturbed by what the channel does afterwards', async () => {
    // Naming the channel, or leaving it, or another run starting — none of it
    // touches a name that was settled when this run stopped.
    const { alice, bob, channelId } = await recorded();
    app.channels.dispatch(channelId, alice.account.id, {
      type: 'SET_NAME',
      name: 'Thursday rehearsal',
    } as never);
    app.channels.dispatch(channelId, bob.account.id, { type: 'LEAVE_CHANNEL' });
    await settle();

    expect(nameFor(channelId)).toBe('Alice and Bob');
  });

  it('falls back for a row that predates the decision', async () => {
    const { alice, channelId } = await recorded();
    app.db
      .prepare('UPDATE recordings SET name = NULL WHERE channel_id = ?')
      .run(channelId);

    // Nothing was written down, so the old viewer-relative label is the only
    // honest answer: Alice sees who else was there.
    const [recording] = await homeRecordings(alice.token);
    expect(recording.name).toBe('Bob');
  });
});
