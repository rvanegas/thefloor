import { WAITING_WINDOW_MS } from '../../core/constants';
import { buildApp, type App } from '../src/app';
import { MemoryMailer } from '../src/mail';
import { MemoryMediaServer } from '../src/media';
import { MemoryRecordingStore } from '../src/storage';

/**
 * Rule A: a room nobody is attending is retired.
 *
 * **What it is really for is the notification.** `announceActive` notifies only
 * *absent* participants and fires only on the empty-to-occupied edge, so a
 * channel held occupied by pocketed phones swallows every arrival notification
 * anybody in it would have received — observed on 2026-09-06 in a channel that
 * had been "occupied" for twenty-four minutes. Emptying it restores the edge.
 * So the assertion that matters most in this file is that `present` empties;
 * everything else guards the predicate that decides when.
 *
 * The predicate only became expressible on 2026-09-05, when
 * `MediaPlane.audioTracks` began carrying `TrackInfo.muted`. Before that a held
 * microphone and an open one were the same fact to the server, and every ghost
 * room would have looked busy.
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
    store: new MemoryRecordingStore(),
    now: () => clock,
    roomCloseGraceMs: 0,
    mixWaitMs: 0,
  });
});

afterEach(async () => {
  app.channels.stop();
  await app.fastify.close();
});

const auth = (token: string) => ({ authorization: `Bearer ${token}` });
const settle = () => new Promise((r) => setTimeout(r, 0));

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

type User = Awaited<ReturnType<typeof signIn>>;

async function befriend(a: User, b: User, identifier: string) {
  await app.fastify.inject({
    method: 'POST',
    url: '/contacts/request',
    headers: auth(a.token),
    payload: { identifier },
  });
  await app.fastify.inject({
    method: 'POST',
    url: `/contacts/${a.account.id}/accept`,
    headers: auth(b.token),
  });
}

/** Alice and Bob, contacts, both present in a channel, both in the room. */
async function roomOfTwo() {
  const alice = await signIn('alice@example.com', 'Alice');
  const bob = await signIn('bob@example.com', 'Bob');
  await befriend(alice, bob, 'bob@example.com');
  const created = await app.fastify.inject({
    method: 'POST',
    url: '/channels',
    headers: auth(alice.token),
    payload: { contactId: bob.account.id },
  });
  const { channelId } = created.json() as { channelId: string };
  app.channels.dispatch(channelId, bob.account.id, { type: 'ENTER' });
  await app.channels.mediaToken(channelId, alice.account.id);
  await app.channels.mediaToken(channelId, bob.account.id);
  return { alice: alice.account, bob: bob.account, channelId };
}

/** Run the poll that carries the rule, and let its promises settle. */
async function poll() {
  app.channels.pollUsage();
  await settle();
}

/** Both of them holding a microphone rather than using one. */
function everybodyHeld(channelId: string, ids: string[]) {
  for (const id of ids) media.held.add(`${channelId}/${id}`);
}

const presentIn = (channelId: string) => app.channels.get(channelId)!.present;
const waitingIn = (channelId: string) => app.channels.get(channelId)!.waiting;

describe('a room nobody is attending', () => {
  it('is retired once the attention window passes', async () => {
    const { alice, bob, channelId } = await roomOfTwo();
    everybodyHeld(channelId, [alice.id, bob.id]);

    await poll();
    expect(presentIn(channelId)).toHaveLength(2);

    clock += WAITING_WINDOW_MS;
    await poll();

    expect(presentIn(channelId)).toHaveLength(0);
  });

  /**
   * The rung above this one is *Nearby*, so somebody retired for fifteen
   * minutes of inattention must not arrive there — it would restart the very
   * claim that expiring was meant to end.
   */
  it('leaves nobody reading as nearby', async () => {
    const { alice, bob, channelId } = await roomOfTwo();
    everybodyHeld(channelId, [alice.id, bob.id]);

    // The first poll starts the clock; nothing can be retired on first sight,
    // because how long a room has been quiet is not knowable from one look.
    await poll();
    clock += WAITING_WINDOW_MS;
    await poll();

    expect(presentIn(channelId)).toHaveLength(0);
    expect(waitingIn(channelId)).toHaveLength(0);
  });

  it('waits out the whole window before acting', async () => {
    const { alice, bob, channelId } = await roomOfTwo();
    everybodyHeld(channelId, [alice.id, bob.id]);

    await poll();
    clock += WAITING_WINDOW_MS - 1;
    await poll();
    expect(presentIn(channelId)).toHaveLength(2);

    clock += 1;
    await poll();
    expect(presentIn(channelId)).toHaveLength(0);
  });

  it('starts the clock again when somebody speaks', async () => {
    const { alice, bob, channelId } = await roomOfTwo();
    everybodyHeld(channelId, [alice.id, bob.id]);

    await poll();
    clock += WAITING_WINDOW_MS - 1;

    // Bob unmutes for one poll, which makes the room a room again.
    media.held.delete(`${channelId}/${bob.id}`);
    await poll();
    everybodyHeld(channelId, [bob.id]);

    clock += WAITING_WINDOW_MS - 1;
    await poll();
    expect(presentIn(channelId)).toHaveLength(2);
  });
});

describe('a room somebody is attending', () => {
  it('is left alone while anybody publishes unmuted', async () => {
    const { alice, channelId } = await roomOfTwo();
    // Alice's microphone is open; Bob is pocketed. The room is not defunct,
    // and a stuck member in a live room is deliberately left in it.
    everybodyHeld(channelId, [alice.id]);
    media.held.delete(`${channelId}/${alice.id}`);

    clock += WAITING_WINDOW_MS * 2;
    await poll();

    expect(presentIn(channelId)).toHaveLength(2);
  });

  /**
   * The pump publishes continuously, silence included, so *is anything
   * playing* has to be asked of `playback.status` rather than of the roster —
   * and a shared track playing to two silent listeners is not a defunct room.
   */
  it('is left alone while a track is playing to silent listeners', async () => {
    const { alice, bob, channelId } = await roomOfTwo();
    everybodyHeld(channelId, [alice.id, bob.id]);
    await app.channels.loadTrack(channelId, alice.id, {
      file: '/dev/null',
      dir: '/tmp',
      title: 'Something',
      durationMs: 60 * 60_000,
    });
    app.channels.dispatch(channelId, alice.id, { type: 'PLAY' });

    clock += WAITING_WINDOW_MS * 2;
    await poll();

    expect(presentIn(channelId)).toHaveLength(2);
  });

  /**
   * And a *paused* track is not a reason to stay: nothing is going in and
   * nothing is coming out, which is the whole of what the rule measures.
   */
  it('is retired when the track is only loaded, not playing', async () => {
    const { alice, bob, channelId } = await roomOfTwo();
    everybodyHeld(channelId, [alice.id, bob.id]);
    await app.channels.loadTrack(channelId, alice.id, {
      file: '/dev/null',
      dir: '/tmp',
      title: 'Something',
      durationMs: 60 * 60_000,
    });

    await poll();
    clock += WAITING_WINDOW_MS;
    await poll();

    expect(presentIn(channelId)).toHaveLength(0);
  });
});
