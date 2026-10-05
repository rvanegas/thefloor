import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join as joinPath } from 'node:path';
import { buildApp, type App } from '../src/app';
import { mintJoinCode } from '../src/channels';
import { MemoryMailer } from '../src/mail';
import { MemoryPusher } from '../src/push';

/**
 * A *community*: a channel with an owner that anyone with its link can join.
 *
 * What is asserted, in the order it runs:
 *
 * - Only a channel of one becomes one, named, and never one that is also a
 *   podcast.
 * - The page names nobody, owner included, with the real display names in the
 *   database — the directory page's boundary, which is the one that matters
 *   for a link meant to be pasted somewhere public.
 * - A code that opens nothing gets one page, whatever the reason.
 * - Joining makes a member and nothing else: no contact, no invitation on
 *   Home, the owner told.
 * - The owner's powers are refused to everybody else out loud, and the owner
 *   cannot leave.
 * - Resetting the link revokes the old one; turning it off stops it.
 * - The owner survives a restart, which is the one place a field of the state
 *   can be lost without any test of the rules noticing.
 */

let app: App;
let pusher: MemoryPusher;
let clock = 1_700_000_000_000;
let dbPath = ':memory:';

function boot() {
  pusher = new MemoryPusher();
  app = buildApp({
    dbPath,
    mailer: new MemoryMailer(),
    now: () => clock,
    pusher,
    roomCloseGraceMs: 0,
    updateUrl: 'https://apps.apple.com/app/id0000000000',
  });
}

beforeEach(() => {
  clock = 1_700_000_000_000;
  dbPath = ':memory:';
  boot();
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
  return verified.json() as { token: string; account: { id: string } };
}

type User = Awaited<ReturnType<typeof signIn>>;

async function registerDevice(user: User, deviceToken: string) {
  await app.fastify.inject({
    method: 'POST',
    url: '/devices',
    headers: auth(user.token),
    payload: { token: deviceToken, platform: 'ios' },
  });
}

async function channelOfOne(owner: User) {
  const created = await app.fastify.inject({
    method: 'POST',
    url: '/channels',
    headers: auth(owner.token),
    payload: { contactIds: [] },
  });
  return (created.json() as { channelId: string }).channelId;
}

const makeCommunity = (owner: User, channelId: string, name?: string) =>
  app.fastify.inject({
    method: 'POST',
    url: `/channels/${channelId}/community`,
    headers: auth(owner.token),
    payload: name === undefined ? {} : { name },
  });

async function start(owner: User, name = 'Cafe Products') {
  const reply = await makeCommunity(owner, await channelOfOne(owner), name);
  expect(reply.statusCode).toBe(200);
  return reply.json() as { channelId: string; joinCode: string; url: string };
}

const join = (user: User, code: string) =>
  app.fastify.inject({
    method: 'POST',
    url: '/channels/join',
    headers: auth(user.token),
    payload: { code },
  });

const page = (code: string) => app.fastify.inject({ method: 'GET', url: `/j/${code}` });

const home = async (user: User) =>
  (
    await app.fastify.inject({ method: 'GET', url: '/home', headers: auth(user.token) })
  ).json() as {
    invites: Array<{ channelId: string }>;
    rejoinable: Array<{ channelId: string }>;
  };

describe('making one', () => {
  it('wants a name, and mints a link read from it', async () => {
    const erta = await signIn('erta@example.com', 'Erta Example');
    const channelId = await channelOfOne(erta);
    const nameless = await makeCommunity(erta, channelId, '  ');
    expect(nameless.statusCode).toBe(400);
    expect(app.channels.get(channelId)?.owner).toBeUndefined();

    const reply = await makeCommunity(erta, channelId, 'Cafe Products');
    expect(reply.statusCode).toBe(200);
    const { joinCode, url } = reply.json() as { joinCode: string; url: string };
    expect(joinCode).toMatch(/^cafe-products-[a-z2-9]{8}$/);
    expect(url).toMatch(new RegExp(`/j/${joinCode}$`));
    expect(app.channels.get(channelId)?.owner).toBe(erta.account.id);
    expect(app.channels.get(channelId)?.name).toBe('Cafe Products');
  });

  it('keeps the name a channel already has', async () => {
    const erta = await signIn('erta@example.com', 'Erta Example');
    const channelId = await channelOfOne(erta);
    app.channels.dispatch(channelId, erta.account.id, { type: 'SET_NAME', name: 'Mine' } as never);
    expect((await makeCommunity(erta, channelId)).statusCode).toBe(200);
    expect(app.channels.get(channelId)?.name).toBe('Mine');
  });

  it('is refused with anybody else in the channel, and to a non-member', async () => {
    const erta = await signIn('erta@example.com', 'Erta Example');
    const zed = await signIn('zed@example.com', 'Zed Zebedee');
    const { channelId: theirs } = await start(erta);
    expect((await makeCommunity(zed, theirs, 'Taken')).statusCode).toBe(400);
    expect((await makeCommunity(erta, theirs, 'Again')).statusCode).toBe(409);

    const { channelId: pair } = app.channels.ensurePairChannel(erta.account.id, zed.account.id)!;
    expect((await makeCommunity(erta, pair, 'Ours')).statusCode).toBe(409);
  });

  it('is never a podcast too, in either order', async () => {
    const erta = await signIn('erta@example.com', 'Erta Example');
    const podcast = await channelOfOne(erta);
    app.channels.dispatch(podcast, erta.account.id, { type: 'SET_NAME', name: 'On air' } as never);
    const on = await app.fastify.inject({
      method: 'POST',
      url: `/channels/${podcast}/public`,
      headers: auth(erta.token),
      payload: { public: true },
    });
    expect(on.statusCode).toBe(200);
    expect((await makeCommunity(erta, podcast)).statusCode).toBe(409);

    const { channelId } = await start(erta);
    const refused = await app.fastify.inject({
      method: 'POST',
      url: `/channels/${channelId}/public`,
      headers: auth(erta.token),
      payload: { public: true },
    });
    expect(refused.statusCode).toBe(409);
    expect(app.channels.publicAtOf(channelId)).toBeNull();
  });

  it('still starts one from nothing for build 335 — SHIMS.md, gate 336', async () => {
    const erta = await signIn('erta@example.com', 'Erta Example');
    const mine = await channelOfOne(erta);
    const nameless = await app.fastify.inject({
      method: 'POST',
      url: '/channels/community',
      headers: auth(erta.token),
      payload: { name: '  ' },
    });
    expect(nameless.statusCode).toBe(400);
    const reply = await app.fastify.inject({
      method: 'POST',
      url: '/channels/community',
      headers: auth(erta.token),
      payload: { name: 'Cafe Products' },
    });
    expect(reply.statusCode).toBe(200);
    const { channelId } = reply.json() as { channelId: string };
    // A new channel, never the channel of one the caller already had.
    expect(channelId).not.toBe(mine);
    expect(app.channels.get(channelId)?.owner).toBe(erta.account.id);
    expect(app.channels.get(mine)?.owner).toBeUndefined();
  });

  it('slugs a name that has nothing to slug as community', () => {
    expect(mintJoinCode('¡¡!!')).toMatch(/^community-/);
    expect(mintJoinCode('Café Olé')).toMatch(/^cafe-ole-/);
  });
});

describe('the community page', () => {
  it('describes the community and names nobody', async () => {
    const erta = await signIn('erta@example.com', 'Erta Example');
    const zed = await signIn('zed@example.com', 'Zed Zebedee');
    const { joinCode } = await start(erta);
    await join(zed, joinCode);

    const reply = await page(joinCode);
    expect(reply.statusCode).toBe(200);
    expect(reply.headers['cache-control']).toBe('no-store');
    expect(reply.body).toContain('Cafe Products');
    expect(reply.body).toContain('2 members so far');
    expect(reply.body).toContain(`thefloor://j/${joinCode}`);
    for (const name of ['Erta', 'Example', 'Zed', 'Zebedee']) {
      expect(reply.body).not.toContain(name);
    }
  });

  it('is one page for a code that opens nothing, whatever the reason', async () => {
    const erta = await signIn('erta@example.com', 'Erta Example');
    const { channelId, joinCode } = await start(erta);
    const unknown = (await page('cafe-products-zzzzzzzz')).body;
    await app.fastify.inject({
      method: 'DELETE',
      url: `/channels/${channelId}/join-code`,
      headers: auth(erta.token),
    });
    const revoked = (await page(joinCode)).body;
    expect(revoked).toBe(unknown);
    expect(revoked).not.toContain('Cafe Products');
  });
});

describe('joining by the link', () => {
  it('makes a member, no contact and no invitation, and tells the owner', async () => {
    const erta = await signIn('erta@example.com', 'Erta Example');
    const zed = await signIn('zed@example.com', 'Zed Zebedee');
    await registerDevice(erta, 'erta-phone');
    const { channelId, joinCode } = await start(erta);
    // Somebody has to have been in it for `invitesFor` to consider it at all.
    app.channels.dispatch(channelId, erta.account.id, { type: 'ENTER' });

    const reply = await join(zed, joinCode);
    expect(reply.statusCode).toBe(200);
    expect(reply.json()).toMatchObject({ channelId, already: false });
    expect(app.channels.get(channelId)?.participants).toContain(zed.account.id);
    expect(app.accounts.areContacts(erta.account.id, zed.account.id)).toBe(false);

    const zeds = await home(zed);
    expect(zeds.invites.map((i) => i.channelId)).not.toContain(channelId);
    expect(zeds.rejoinable.map((c) => c.channelId)).toContain(channelId);

    await new Promise((r) => setTimeout(r, 0));
    const told = pusher.sent.filter((s) => s.tokens.includes('erta-phone'));
    expect(told.map((s) => s.message.body)).toContain('Joined Cafe Products.');
  });

  it('opens the channel again rather than failing on a second tap', async () => {
    const erta = await signIn('erta@example.com', 'Erta');
    const zed = await signIn('zed@example.com', 'Zed');
    const { joinCode } = await start(erta);
    await join(zed, joinCode);
    const again = await join(zed, joinCode);
    expect(again.statusCode).toBe(200);
    expect(again.json()).toMatchObject({ already: true });
  });

  it('is refused for an unknown code, and cannot be sent over the socket', async () => {
    const erta = await signIn('erta@example.com', 'Erta');
    const zed = await signIn('zed@example.com', 'Zed');
    const { channelId } = await start(erta);
    // 400, which is what this server answers every `not_found` refusal with.
    expect((await join(zed, 'nope-aaaaaaaa')).statusCode).toBe(400);
    // A client naming JOIN directly would skip the code check entirely.
    app.channels.dispatch(channelId, zed.account.id, { type: 'JOIN' } as never);
    expect(app.channels.get(channelId)?.participants).not.toContain(zed.account.id);
  });
});

describe('the owner', () => {
  async function three() {
    const erta = await signIn('erta@example.com', 'Erta');
    const zed = await signIn('zed@example.com', 'Zed');
    const yan = await signIn('yan@example.com', 'Yan');
    const started = await start(erta);
    await join(zed, started.joinCode);
    await join(yan, started.joinCode);
    return { erta, zed, yan, ...started };
  }

  it('removes in one move, and cannot be moved against', async () => {
    const { erta, zed, yan, channelId } = await three();
    const against = app.channels.dispatch(channelId, zed.account.id, {
      type: 'MOVE_TO_REMOVE',
      targetId: erta.account.id,
    } as never);
    expect(against.ok).toBe(false);

    const removed = app.channels.dispatch(channelId, erta.account.id, {
      type: 'MOVE_TO_REMOVE',
      targetId: yan.account.id,
    } as never);
    expect(removed.ok).toBe(true);
    expect(app.channels.get(channelId)?.participants).not.toContain(yan.account.id);
  });

  it('cannot leave, and deletes for everybody', async () => {
    const { erta, zed, channelId } = await three();
    const left = app.channels.dispatch(channelId, erta.account.id, { type: 'LEAVE_CHANNEL' });
    expect(left.ok).toBe(false);
    const byMember = app.channels.dispatch(channelId, zed.account.id, {
      type: 'DELETE_CHANNEL',
    });
    expect(byMember.ok).toBe(false);
    const deleted = app.channels.dispatch(channelId, erta.account.id, {
      type: 'DELETE_CHANNEL',
    });
    expect(deleted.ok).toBe(true);
    expect((await home(zed)).rejoinable.map((c) => c.channelId)).not.toContain(channelId);
  });

  it('alone resets the link, which revokes the old one', async () => {
    const { erta, zed, channelId, joinCode } = await three();
    const byMember = await app.fastify.inject({
      method: 'POST',
      url: `/channels/${channelId}/join-code`,
      headers: auth(zed.token),
    });
    expect(byMember.statusCode).toBe(403);

    const reset = await app.fastify.inject({
      method: 'POST',
      url: `/channels/${channelId}/join-code`,
      headers: auth(erta.token),
    });
    const fresh = (reset.json() as { joinCode: string }).joinCode;
    expect(fresh).not.toBe(joinCode);
    const late = await signIn('late@example.com', 'Late');
    expect((await join(late, joinCode)).statusCode).toBe(400);
    expect((await join(late, fresh)).statusCode).toBe(200);
  });

  it('takes the community with their account', async () => {
    const { erta, zed, channelId } = await three();
    const gone = await app.fastify.inject({
      method: 'DELETE',
      url: '/me',
      headers: auth(erta.token),
    });
    expect(gone.statusCode).toBe(204);
    expect(app.channels.get(channelId)?.status ?? 'ended').toBe('ended');
    expect((await home(zed)).rejoinable.map((c) => c.channelId)).not.toContain(channelId);
  });
});

describe('across a restart', () => {
  it('keeps its owner and its link', async () => {
    const dir = await mkdtemp(joinPath(tmpdir(), 'thefloor-community-'));
    app.channels.stop();
    await app.fastify.close();
    dbPath = joinPath(dir, 'db.sqlite');
    boot();

    const erta = await signIn('erta@example.com', 'Erta');
    const { channelId, joinCode } = await start(erta);
    app.channels.stop();
    await app.fastify.close();
    boot();

    expect(app.channels.get(channelId)?.owner).toBe(erta.account.id);
    const zed = await signIn('zed@example.com', 'Zed');
    expect((await join(zed, joinCode)).statusCode).toBe(200);    await rm(dir, { recursive: true, force: true });
  });
});
