import { buildApp, type App } from '../src/app';
import { MemoryMailer } from '../src/mail';
import { MemoryMediaServer } from '../src/media';
import { ROOM_DEPARTURE_MS } from '../src/rooms';

/**
 * Guests are a Pro feature, since 2026-11-26: a seat is offered only in a
 * *Pro channel*, and a room that was Pro stays Pro until it ends. A guest
 * page has no voice of its own and hears Claude only through the room
 * reader, which speaks only in a Pro channel. See
 * planning/decision/2026-11-26-guests-are-a-pro-feature.md.
 */

let app: App;
let clock = 1_700_000_000_000;
let pro = new Set<string>();

beforeEach(() => {
  clock = 1_700_000_000_000;
  pro = new Set();
  app = buildApp({
    dbPath: ':memory:',
    mailer: new MemoryMailer(),
    media: new MemoryMediaServer(),
    mediaUrl: 'wss://example.livekit.cloud',
    now: () => clock,
    roomCloseGraceMs: 0,
  });
  // A subscription is account state; held here so a lapse is one line.
  app.channels.isPro = (id) => pro.has(id);
});

afterEach(async () => {
  app.channels.stop();
  await app.fastify.close();
});

const auth = (token: string) => ({ authorization: `Bearer ${token}` });

async function signIn(identifier: string, displayName: string) {
  const code = app.accounts.issueCode(identifier, clock)!;
  const verified = await app.fastify.inject({
    method: 'POST',
    url: '/auth/verify',
    payload: { identifier, code, displayName },
  });
  return verified.json() as { token: string; account: { id: string; displayName: string } };
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

/** Alice in a channel with Bob, and Carol a contact of Alice's outside it. */
async function setUp() {
  const alice = await signIn('alice@example.com', 'Alice');
  const bob = await signIn('bob@example.com', 'Bob');
  const carol = await signIn('carol@example.com', 'Carol');
  await befriend(alice, bob, 'bob@example.com');
  await befriend(alice, carol, 'carol@example.com');
  const created = await app.fastify.inject({
    method: 'POST',
    url: '/channels',
    headers: auth(alice.token),
    payload: { contactId: bob.account.id },
  });
  const { channelId } = created.json() as { channelId: string };
  return { alice, bob, carol, channelId };
}

const mintLink = (user: User, channelId: string) =>
  app.fastify.inject({
    method: 'POST',
    url: `/channels/${channelId}/guest-links`,
    headers: auth(user.token),
  });

const askIn = (user: User, channelId: string, contactId: string) =>
  app.fastify.inject({
    method: 'POST',
    url: `/channels/${channelId}/guest-invites`,
    headers: auth(user.token),
    payload: { contactId },
  });

describe('offering a seat', () => {
  it('is refused in a channel nobody in is Pro, by link and by invitation', async () => {
    const { alice, carol, channelId } = await setUp();

    const link = await mintLink(alice, channelId);
    expect(link.statusCode).toBe(403);
    expect(link.json()).toEqual({ error: 'Guests are part of Pro.' });

    const invited = await askIn(alice, channelId, carol.account.id);
    expect(invited.statusCode).toBe(403);
    expect(invited.json()).toEqual({ error: 'Guests are part of Pro.' });
  });

  it('is open to every member once any member is Pro', async () => {
    const { alice, bob, carol, channelId } = await setUp();
    pro.add(bob.account.id);

    expect((await mintLink(alice, channelId)).statusCode).toBe(200);
    expect((await askIn(alice, channelId, carol.account.id)).statusCode).toBe(200);
  });

  it('lets nobody in at the door outside Pro, though anybody may be turned away', async () => {
    const { alice, channelId } = await setUp();
    // A link that outlived the Pro it was made under, as one made in an empty
    // channel before a lapse can.
    const link = app.channels.guests.mintLink(channelId, alice.account.id, clock);
    const first = app.channels.knock(link.token, 'Dana');
    if (!first.ok) throw new Error(first.error);
    expect(
      app.channels.answerKnock(channelId, alice.account.id, first.knockId, true, link.token)
    ).toEqual({ ok: false, error: 'Guests are part of Pro.', code: 'forbidden' });
    expect(
      app.channels.answerKnock(channelId, alice.account.id, first.knockId, false, link.token)
    ).toEqual({ ok: true, admitted: null });
  });

  it('is not opened by a guest’s own Pro', async () => {
    const { alice, carol, channelId } = await setUp();
    pro.add(carol.account.id);
    expect((await mintLink(alice, channelId)).statusCode).toBe(403);
  });
});

/** Everybody out, and past the window in which coming back is the same room. */
function endTheRoom(user: User, channelId: string) {
  app.channels.dispatch(channelId, user.account.id, { type: 'STEP_OUT' });
  clock += ROOM_DEPARTURE_MS + 1;
  app.channels.tick();
}

describe('a room that was Pro', () => {
  // Alice is in the room from the moment she makes the channel.
  it('stays Pro until it ends, though the only Pro member lapses', async () => {
    const { alice, bob, channelId } = await setUp();
    pro.add(bob.account.id);
    expect(app.channels.isProChannel(channelId)).toBe(true);

    pro.delete(bob.account.id);
    expect(app.channels.isProChannel(channelId)).toBe(true);
    expect((await mintLink(alice, channelId)).statusCode).toBe(200);

    // Emptied, it is still the same room until the departure window closes.
    app.channels.dispatch(channelId, alice.account.id, { type: 'STEP_OUT' });
    expect(app.channels.isProChannel(channelId)).toBe(true);

    clock += ROOM_DEPARTURE_MS + 1;
    app.channels.tick();
    expect(app.channels.isProChannel(channelId)).toBe(false);
  });

  it('is latched as the room opens, whether or not anybody asked', async () => {
    const { alice, bob, channelId } = await setUp();
    endTheRoom(alice, channelId);
    pro.add(bob.account.id);
    app.channels.dispatch(channelId, alice.account.id, { type: 'ENTER' });
    pro.delete(bob.account.id);
    expect(app.channels.isProChannel(channelId)).toBe(true);
  });

  it('is not latched by Pro outside a room', async () => {
    const { alice, bob, channelId } = await setUp();
    endTheRoom(alice, channelId);
    pro.add(bob.account.id);
    expect(app.channels.isProChannel(channelId)).toBe(true);
    pro.delete(bob.account.id);
    expect(app.channels.isProChannel(channelId)).toBe(false);
  });
});
