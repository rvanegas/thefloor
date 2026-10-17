import { buildApp, type App } from '../src/app';
import { MemoryMailer } from '../src/mail';

/**
 * Locking a channel, `POST /channels/:id/lock`: for good, and taking back the
 * durable half of every offer as the reducer takes back the room's picture of
 * it — so that a restart does not project an offer back into a locked room,
 * and a link handed out before the lock opens nothing after it.
 */

let app: App;
let clock = 1_700_000_000_000;
let dbPath = ':memory:';

const boot = () =>
  buildApp({
    dbPath,
    mailer: new MemoryMailer(),
    now: () => clock,
    updateUrl: 'https://apps.apple.com/app/id0000000000',
  });

beforeEach(() => {
  clock = 1_700_000_000_000;
  dbPath = ':memory:';
  app = boot();
});

afterEach(async () => {
  app.channels.stop();
  await app.fastify.close();
});

const auth = (token: string) => ({ authorization: `Bearer ${token}` });

async function signIn(identifier: string, displayName: string, username: string) {
  const code = app.accounts.issueCode(identifier, clock)!;
  const verified = await app.fastify.inject({
    method: 'POST',
    url: '/auth/verify',
    payload: { identifier, code, displayName },
  });
  const user = verified.json() as { token: string; account: { id: string } };
  await app.fastify.inject({
    method: 'POST',
    url: '/me',
    headers: auth(user.token),
    payload: { username },
  });
  return user;
}

type User = Awaited<ReturnType<typeof signIn>>;

function channelOf(alice: User): string {
  const created = app.channels.create(alice.account.id, []);
  if (!created.ok) throw new Error(created.error);
  return created.channel.id;
}

const post = (user: User, url: string, payload: object = {}) =>
  app.fastify.inject({ method: 'POST', url, headers: auth(user.token), payload });

describe('locking a channel', () => {
  it('takes back the links handed out before it, and refuses new ones', async () => {
    const alice = await signIn('alice@example.com', 'Alice', 'alice');
    const bob = await signIn('bob@example.com', 'Bob', 'bob');
    const channelId = channelOf(alice);

    const member = await post(alice, `/channels/${channelId}/member-links`);
    expect(member.statusCode).toBe(200);
    const [, username, pin] = /\/m\/([^/]+)\/(\d{6})$/.exec(
      (member.json() as { url: string }).url
    )!;
    const guest = app.channels.mintGuestLink(channelId, alice.account.id);
    if (!guest.ok) throw new Error(guest.error);

    const locked = await post(alice, `/channels/${channelId}/lock`);
    expect(locked.statusCode).toBe(200);
    expect(app.channels.get(channelId)!.locked).toBe(true);

    // The member link opens nothing, and nobody became a member by it.
    const accepted = await post(bob, '/member-links/accept', { username, pin });
    expect(accepted.statusCode).not.toBe(200);
    expect(app.channels.get(channelId)!.participants).toEqual([alice.account.id]);
    // The guest link's door is shut.
    expect(app.channels.doorFor(guest.link.token).ok).toBe(false);

    // And nothing new is offered.
    expect((await post(alice, `/channels/${channelId}/member-links`)).statusCode).toBe(409);
    expect((await post(alice, `/channels/${channelId}/guest-links`)).statusCode).toBe(409);
  });

  it('cannot be undone by a restart', async () => {
    app.channels.stop();
    await app.fastify.close();
    dbPath = `${require('node:os').tmpdir()}/thefloor-lock-${process.pid}-${Date.now()}.db`;
    app = boot();
    const alice = await signIn('alice@example.com', 'Alice', 'alice');
    const channelId = channelOf(alice);
    await post(alice, `/channels/${channelId}/member-links`);
    expect((await post(alice, `/channels/${channelId}/lock`)).statusCode).toBe(200);

    app.channels.stop();
    await app.fastify.close();
    app = boot();
    const revived = app.channels.get(channelId)!;
    expect(revived.locked).toBe(true);
    expect(revived.memberLinks ?? {}).toEqual({});
  });
});
