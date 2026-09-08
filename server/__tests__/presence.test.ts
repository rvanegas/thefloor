import { DISCONNECT_GRACE_MS } from '../../core/constants';
import { buildApp, type App } from '../src/app';
import { MEDIA_JOIN_GRACE_MS, playbackIdentity } from '../src/channels';
import { MemoryMailer } from '../src/mail';
import { MemoryMediaServer } from '../src/media';
import { MemoryRecordingStore } from '../src/storage';

/**
 * Presence is the media connection.
 *
 * **The definition did not change on 2026-09-08; the implementation caught up
 * with it.** planning/GLOSSARY.md § *Present* has always said *able to hear and
 * be heard, right now*, which is publishing or subscribing, which is being in
 * the room. What the server did instead was take an `ENTER` on trust and let a
 * live *control socket* sustain it for ever.
 *
 * The bug that forced it, and the first test below: step into a room alone,
 * force quit, reopen, and open the channel screen. The new process has no
 * presence to re-assert, so it sends `watch.channel` and nothing else — and
 * that reported CONNECTED, cancelled the grace period that was about to retire
 * the account, and did so again on every reconnection. The roster said the
 * person was there. Their own screen, correctly, offered *Step in*.
 *
 * **Nothing here removes anybody directly.** The room's answer feeds the same
 * `report` a socket's does, so an absence starts DISCONNECT_GRACE_MS and leaves
 * by `DISCONNECT_EXPIRED` — which is *Nearby*, the state that says *within
 * reach, one notification away*. There is deliberately no second way out of a
 * room, and these tests assert the ordinary one is the one taken.
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

/**
 * Alice and Bob, contacts, both present — and both in the room, because asking
 * this fake for a token is what puts an identity in its roster.
 */
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

async function poll() {
  app.channels.pollUsage();
  await settle();
}

const channel = (channelId: string) => app.channels.get(channelId)!;
const graceOn = (channelId: string, id: string) =>
  channel(channelId).disconnectedAt[id] !== undefined;

/** Long enough that an unanswered presence has stopped being a slow connect. */
const pastTheJoinWindow = () => {
  clock += MEDIA_JOIN_GRACE_MS + 1;
};

describe('a presence the room stops holding', () => {
  it('is retired to nearby', async () => {
    const { alice, bob, channelId } = await roomOfTwo();
    await poll();
    expect(graceOn(channelId, bob.id)).toBe(false);

    // The force quit. No socket closes here — that path has its own test, and
    // the point of this one is that the room alone is enough.
    media.leaveRoom(channelId, bob.id);
    pastTheJoinWindow();
    await poll();
    expect(graceOn(channelId, bob.id)).toBe(true);

    clock += DISCONNECT_GRACE_MS;
    app.channels.tick();
    expect(channel(channelId).present).not.toContain(bob.id);
    // Nearby, not gone: `exit: 'dropped'` is what the poll's report resolves
    // to, and it is the same arm a lost socket takes.
    expect(channel(channelId).waiting).toContain(bob.id);
    // And it is one person's departure, not the room's.
    expect(channel(channelId).present).toContain(alice.id);
  });

  it('is spared if it comes back before the grace runs out', async () => {
    const { bob, channelId } = await roomOfTwo();
    await poll();

    media.leaveRoom(channelId, bob.id);
    pastTheJoinWindow();
    await poll();
    expect(graceOn(channelId, bob.id)).toBe(true);

    // A blip: the same person, back in the room, inside the minute.
    media.joinRoom(channelId, bob.id);
    await poll();
    expect(graceOn(channelId, bob.id)).toBe(false);

    clock += DISCONNECT_GRACE_MS;
    app.channels.tick();
    expect(channel(channelId).present).toContain(bob.id);
  });
});

describe('a presence the room has not yet confirmed', () => {
  it('is left alone while it is still connecting', async () => {
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

    // Stepped in and not yet in the room, which is every step-in for as long as
    // it takes to fetch a token and connect. Reporting an absence here would
    // write `disconnectedAt`, which the roster renders as *reconnecting* — so
    // the cost of being early is a lie under the name of somebody who has just
    // walked in, on every arrival.
    app.channels.dispatch(channelId, bob.account.id, { type: 'ENTER' });
    await poll();
    expect(graceOn(channelId, bob.account.id)).toBe(false);

    clock += MEDIA_JOIN_GRACE_MS - 1;
    await poll();
    expect(graceOn(channelId, bob.account.id)).toBe(false);

    // And then they arrive, and the window stops mattering.
    await app.channels.mediaToken(channelId, bob.account.id);
    clock += MEDIA_JOIN_GRACE_MS * 4;
    await poll();
    expect(graceOn(channelId, bob.account.id)).toBe(false);
  });

  it('is retired if it never arrives at all', async () => {
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

    // The token fetch failed, or the connect did. Nothing bounded this before:
    // the account was present because it said so, and only a tap took it back.
    app.channels.dispatch(channelId, bob.account.id, { type: 'ENTER' });
    pastTheJoinWindow();
    await poll();
    expect(graceOn(channelId, bob.account.id)).toBe(true);

    clock += DISCONNECT_GRACE_MS;
    app.channels.tick();
    expect(channel(channelId).present).not.toContain(bob.account.id);
    expect(channel(channelId).waiting).toContain(bob.account.id);
  });
});

describe('the shared-track participant', () => {
  it('is not a person and holds nobody in the room', async () => {
    const { alice, bob, channelId } = await roomOfTwo();
    await poll();

    // It is in the roster and is not an account — `media:<channelId>` joins to
    // publish a shared track and costs the box what a person does, which is why
    // the meter counts it. Presence must not: a room emptied of people is empty
    // however many of this server's own participants are still in it.
    media.joinRoom(channelId, playbackIdentity(channelId));
    media.leaveRoom(channelId, alice.id);
    media.leaveRoom(channelId, bob.id);
    pastTheJoinWindow();
    await poll();

    clock += DISCONNECT_GRACE_MS;
    app.channels.tick();
    expect(channel(channelId).present).toHaveLength(0);
  });
});
