import { DISCONNECT_GRACE_MS } from '../../core/constants';
import { buildApp, type App } from '../src/app';
import { MEDIA_JOIN_GRACE_MS } from '../src/channels';
import { LiveActivities } from '../src/live-activities';
import { MemoryMailer } from '../src/mail';
import { MemoryMediaServer } from '../src/media';
import { MemoryLiveActivityEnder } from '../src/push';
import { MemoryRecordingStore } from '../src/storage';

/**
 * The lock screen card comes down when the server steps its device out.
 *
 * **The phone cannot be relied on to do it.** A card is up while somebody is
 * stepped in, and the commonest way to stop being stepped in without asking is
 * a phone iOS has suspended or killed — which runs no JavaScript, so the hook
 * that hides the card never hears the snapshot that should hide it. These
 * tests are the server's half: whatever steps a device out sends the end, in
 * the same change, and nothing that leaves it in the room does.
 */

let app: App;
let media: MemoryMediaServer;
let ender: MemoryLiveActivityEnder;
let clock = 1_700_000_000_000;

beforeEach(() => {
  clock = 1_700_000_000_000;
  media = new MemoryMediaServer();
  ender = new MemoryLiveActivityEnder();
  app = buildApp({
    dbPath: ':memory:',
    mailer: new MemoryMailer(),
    media,
    mediaUrl: 'wss://example.livekit.cloud',
    store: new MemoryRecordingStore(),
    liveActivityEnder: ender,
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

async function roomOfTwo() {
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
  await app.channels.mediaToken(channelId, alice.account.id);
  await app.channels.mediaToken(channelId, bob.account.id);
  return { alice, bob, channelId };
}

async function registerCard(
  user: User,
  channelId: string,
  token: string,
  device = 'phone'
) {
  return app.fastify.inject({
    method: 'POST',
    url: '/live-activities',
    headers: auth(user.token),
    payload: { token, channelId, device },
  });
}

async function poll() {
  app.channels.pollUsage();
  await settle();
}

describe('a card on a phone the server steps out', () => {
  it('is ended when the grace runs out, and not before', async () => {
    const { bob, channelId } = await roomOfTwo();
    expect((await registerCard(bob, channelId, 'bob-card')).statusCode).toBe(200);
    await poll();

    // The phone is suspended in a pocket: out of the room, saying nothing.
    media.leaveRoom(channelId, bob.account.id);
    clock += MEDIA_JOIN_GRACE_MS + 1;
    await poll();
    app.channels.tick();
    expect(ender.ended).toEqual([]);

    clock += DISCONNECT_GRACE_MS;
    app.channels.tick();
    expect(app.channels.get(channelId)!.present).not.toContain(bob.account.id);
    expect(ender.ended).toEqual(['bob-card']);
  });

  it('is not ended by a blip that comes back inside the grace', async () => {
    const { bob, channelId } = await roomOfTwo();
    await registerCard(bob, channelId, 'bob-card');
    await poll();

    media.leaveRoom(channelId, bob.account.id);
    clock += MEDIA_JOIN_GRACE_MS + 1;
    await poll();
    media.joinRoom(channelId, bob.account.id);
    await poll();
    clock += DISCONNECT_GRACE_MS;
    app.channels.tick();

    expect(ender.ended).toEqual([]);
  });

  it('is ended once, and only the card of whoever left', async () => {
    const { alice, bob, channelId } = await roomOfTwo();
    await registerCard(alice, channelId, 'alice-card');
    await registerCard(bob, channelId, 'bob-card');

    app.channels.dispatch(channelId, bob.account.id, { type: 'STEP_OUT' });
    // A later change to the same room, with Alice still in it.
    clock += 1_000;
    app.channels.tick();
    app.channels.dispatch(channelId, bob.account.id, { type: 'ENTER' });

    expect(ender.ended).toEqual(['bob-card']);
    expect(app.channels.get(channelId)!.present).toContain(alice.account.id);
  });

  it('is ended on arrival when the account has already left the room', async () => {
    const { bob, channelId } = await roomOfTwo();
    app.channels.dispatch(channelId, bob.account.id, { type: 'STEP_OUT' });

    await registerCard(bob, channelId, 'late-card');

    expect(ender.ended).toEqual(['late-card']);
  });

  it('refuses a registration without a token or a channel', async () => {
    const { bob, channelId } = await roomOfTwo();
    const response = await app.fastify.inject({
      method: 'POST',
      url: '/live-activities',
      headers: auth(bob.token),
      payload: { channelId },
    });
    expect(response.statusCode).toBe(400);
  });
});

describe('a card on a device another device displaced', () => {
  it('is ended, and the card of the device that stepped in is not', async () => {
    const { bob, channelId } = await roomOfTwo();
    const cards = new LiveActivities(app.db, ender);
    cards.register('phone-card', bob.account.id, channelId, 'device:phone', clock);
    cards.register('tablet-card', bob.account.id, channelId, 'device:tablet', clock);

    cards.endOtherDevices(bob.account.id, 'device:tablet');

    expect(ender.ended).toEqual(['phone-card']);
    expect(cards.count()).toBe(1);
  });
});
