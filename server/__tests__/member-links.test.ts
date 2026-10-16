import { buildApp, type App } from '../src/app';
import { INVITE_MAX_GUESSES } from '../src/accounts';
import { MemoryMailer } from '../src/mail';
import { MEMBER_LINK_TTL_MS } from '../src/memberLinks';
import { MAX_CHANNEL_PARTICIPANTS } from '../../core/constants';

/**
 * Member links, `/m/<username>/<pin>`: *Invite as member*'s link on the People
 * tab since 2026-10-16. What is worth asserting is what it makes — a member,
 * and not a contact — that it holds a place among the six until it is used,
 * taken back or expired, that it survives a restart as the place it holds, and
 * that its pin is the invite pin's: good once, and guarded by the same budget.
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

async function signIn(identifier: string, displayName: string, username?: string) {
  const code = app.accounts.issueCode(identifier, clock)!;
  const verified = await app.fastify.inject({
    method: 'POST',
    url: '/auth/verify',
    payload: { identifier, code, displayName },
  });
  const user = verified.json() as { token: string; account: { id: string } };
  if (username !== undefined) {
    const set = await app.fastify.inject({
      method: 'POST',
      url: '/me',
      headers: auth(user.token),
      payload: { username },
    });
    expect(set.statusCode).toBe(200);
  }
  return user;
}

type User = Awaited<ReturnType<typeof signIn>>;

/** A channel of Alice's own, with nobody else in it. */
function channelOf(alice: User): string {
  const created = app.channels.create(alice.account.id, []);
  if (!created.ok) throw new Error(created.error);
  return created.channel.id;
}

const mint = (user: User, channelId: string) =>
  app.fastify.inject({
    method: 'POST',
    url: `/channels/${channelId}/member-links`,
    headers: auth(user.token),
  });

async function link(user: User, channelId: string): Promise<{ username: string; pin: string }> {
  const minted = await mint(user, channelId);
  expect(minted.statusCode).toBe(200);
  const { url } = minted.json() as { url: string };
  const match = /\/m\/([^/]+)\/(\d{6})$/.exec(url);
  expect(match).not.toBeNull();
  return { username: match![1], pin: match![2] };
}

const accept = (user: User, halves: { username: string; pin: string }) =>
  app.fastify.inject({
    method: 'POST',
    url: '/member-links/accept',
    headers: auth(user.token),
    payload: halves,
  });

describe('a member link', () => {
  it('makes whoever follows it a member of the channel, and nobody’s contact', async () => {
    const alice = await signIn('alice@example.com', 'Alice', 'alice');
    const bob = await signIn('bob@example.com', 'Bob');
    const channelId = channelOf(alice);
    const halves = await link(alice, channelId);

    const taken = await accept(bob, halves);
    expect(taken.statusCode).toBe(200);
    expect(taken.json()).toMatchObject({ ok: true, channelId, already: false });
    expect(app.channels.get(channelId)!.participants).toContain(bob.account.id);
    expect(app.accounts.areContacts(alice.account.id, bob.account.id)).toBe(false);
    expect(app.channels.get(channelId)!.memberLinks).toBeUndefined();
  });

  it('holds a place from the moment it is made, and refuses a seventh', async () => {
    const alice = await signIn('alice@example.com', 'Alice', 'alice');
    const channelId = channelOf(alice);
    for (let i = 1; i < MAX_CHANNEL_PARTICIPANTS; i++) await link(alice, channelId);
    expect(Object.keys(app.channels.get(channelId)!.memberLinks ?? {})).toHaveLength(
      MAX_CHANNEL_PARTICIPANTS - 1
    );
    const seventh = await mint(alice, channelId);
    expect(seventh.statusCode).toBe(409);
  });

  it('works once, and answers the person who used it with the channel again', async () => {
    const alice = await signIn('alice@example.com', 'Alice', 'alice');
    const bob = await signIn('bob@example.com', 'Bob');
    const cara = await signIn('cara@example.com', 'Cara');
    const channelId = channelOf(alice);
    const halves = await link(alice, channelId);
    await accept(bob, halves);

    const again = await accept(bob, halves);
    expect(again.json()).toMatchObject({ ok: true, channelId, already: true });
    const late = await accept(cara, halves);
    expect(late.statusCode).toBe(400);
    expect(late.json()).toMatchObject({ code: 'used' });
  });

  it('gives its place back when it is taken back, and opens nothing after', async () => {
    const alice = await signIn('alice@example.com', 'Alice', 'alice');
    const bob = await signIn('bob@example.com', 'Bob');
    const channelId = channelOf(alice);
    const halves = await link(alice, channelId);
    const [linkId] = Object.keys(app.channels.get(channelId)!.memberLinks!);

    const back = await app.fastify.inject({
      method: 'DELETE',
      url: `/channels/${channelId}/member-links/${linkId}`,
      headers: auth(alice.token),
    });
    expect(back.statusCode).toBe(200);
    expect(app.channels.get(channelId)!.memberLinks).toBeUndefined();
    expect((await accept(bob, halves)).json()).toMatchObject({ code: 'unknown' });
  });

  it('expires after thirty days', async () => {
    const alice = await signIn('alice@example.com', 'Alice', 'alice');
    const bob = await signIn('bob@example.com', 'Bob');
    const halves = await link(alice, channelOf(alice));
    clock += MEMBER_LINK_TTL_MS + 1;
    expect((await accept(bob, halves)).json()).toMatchObject({ code: 'expired' });
  });

  it('stops answering after as many wrong guesses as an invite link allows', async () => {
    const alice = await signIn('alice@example.com', 'Alice', 'alice');
    const bob = await signIn('bob@example.com', 'Bob');
    const halves = await link(alice, channelOf(alice));
    for (let i = 0; i < INVITE_MAX_GUESSES; i++) {
      await accept(bob, { username: 'alice', pin: String(i).padStart(6, '9') });
    }
    expect((await accept(bob, halves)).json()).toMatchObject({ code: 'unknown' });
  });

  it('is not made for a community, whose own link is the way in', async () => {
    const alice = await signIn('alice@example.com', 'Alice', 'alice');
    const channelId = channelOf(alice);
    const made = app.channels.makeCommunity(channelId, alice.account.id, 'Book club');
    expect(made.ok).toBe(true);
    expect((await mint(alice, channelId)).statusCode).toBe(409);
  });

  it('has no link to write for an account with no username', async () => {
    // Signing up derives one, so having none is a username given up.
    const alice = await signIn('alice@example.com', 'Alice', '');
    const minted = await mint(alice, channelOf(alice));
    expect(minted.json()).toEqual({ url: null });
  });

  it('names the inviter on its page only beside a live pin, and never the channel', async () => {
    const alice = await signIn('alice@example.com', 'Alice Example', 'alice');
    const channelId = channelOf(alice);
    app.channels.dispatch(channelId, alice.account.id, { type: 'SET_NAME', name: 'Secret plans' } as never);
    const halves = await link(alice, channelId);

    const live = await app.fastify.inject({ method: 'GET', url: `/m/alice/${halves.pin}` });
    expect(live.statusCode).toBe(200);
    expect(live.body).toContain('Alice Example asked you into a channel');
    expect(live.body).toContain('Accept invite');
    expect(live.body).toContain(`thefloor://m/alice/${halves.pin}`);
    expect(live.body).not.toContain('Secret plans');

    const wrong = await app.fastify.inject({ method: 'GET', url: '/m/alice/000000' });
    expect(wrong.body).not.toContain('Alice Example');
    expect(wrong.body).toContain('cannot be opened');
  });
});

describe('a member link across a restart', () => {
  it('comes back holding its place', async () => {
    app.channels.stop();
    await app.fastify.close();
    dbPath = `${require('node:os').tmpdir()}/thefloor-member-links-${process.pid}-${Date.now()}.db`;
    app = boot();
    const alice = await signIn('alice@example.com', 'Alice', 'alice');
    const channelId = channelOf(alice);
    await link(alice, channelId);

    app.channels.stop();
    await app.fastify.close();
    app = boot();
    expect(Object.keys(app.channels.get(channelId)!.memberLinks ?? {})).toHaveLength(1);
  });
});
