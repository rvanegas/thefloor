import WebSocket from 'ws';
import { buildApp, type App } from '../src/app';
import { switchableSet, switchTargets } from '../src/switching';
import type { ServerMessage } from '../../core/protocol';

/**
 * Switching between the developer's own accounts from Floor Settings.
 *
 * What these cover is that it opens exactly the doors it means to: from one
 * account in the set to another one in it, never into or out of the set, never
 * to a review account however it is configured, and that the session left
 * behind is ended the way a sign-out ends it.
 */

let app: App;
let built = false;
let clock = 1_700_000_000_000;

const MINE = ['me@example.com', 'rtest1@example.co', 'rtest2@example.co'];
const REVIEW = { identifier: 'review@example.co', code: '246813' };

const auth = (token: string) => ({ authorization: `Bearer ${token}` });

function build(switchAccounts: string[] = MINE) {
  clock = 1_700_000_000_000;
  app = buildApp({
    dbPath: ':memory:',
    now: () => clock,
    review: REVIEW,
    switchAccounts,
  });
  built = true;
}

afterEach(async () => {
  // The pure-function tests below build no app.
  if (!built) return;
  built = false;
  app.channels.stop();
  await app.fastify.close();
});

async function signIn(identifier: string) {
  const code = app.accounts.issueCode(identifier, clock)!;
  const verified = await app.fastify.inject({
    method: 'POST',
    url: '/auth/verify',
    payload: { identifier, code, displayName: identifier.split('@')[0] },
  });
  return verified.json() as { token: string; account: { id: string } };
}

const switchTo = (token: string, identifier: string, deviceToken?: string) =>
  app.fastify.inject({
    method: 'POST',
    url: '/auth/switch',
    headers: auth(token),
    payload: { identifier, deviceToken },
  });

describe('switchableSet', () => {
  it('drops the review accounts, however they are written', () => {
    const { allowed, refused } = switchableSet(
      [...MINE, ' REVIEW@example.co ', 'contact@example.co'],
      { identifier: REVIEW.identifier, contact: 'contact@example.co' }
    );
    expect(allowed).toEqual(MINE);
    expect(refused).toEqual(['REVIEW@example.co', 'contact@example.co']);
  });

  it('is empty when fewer than two are left, there being nowhere to go', () => {
    expect(switchableSet(['me@example.com']).allowed).toEqual([]);
    expect(
      switchableSet(['me@example.com', REVIEW.identifier], REVIEW).allowed
    ).toEqual([]);
  });

  it('names everybody else in the set, and nobody to a stranger', () => {
    expect(switchTargets('ME@example.com', MINE)).toEqual(MINE.slice(1));
    expect(switchTargets('someone@example.com', MINE)).toEqual([]);
  });
});

describe('POST /auth/switch', () => {
  it('trades the session for one on the other account, and ends the old one', async () => {
    build();
    const me = await signIn(MINE[0]);
    const rtest1 = await signIn(MINE[1]);

    const switched = await switchTo(me.token, MINE[1].toUpperCase());
    expect(switched.statusCode).toBe(200);
    const body = switched.json() as { token: string; account: { id: string } };
    expect(body.account.id).toBe(rtest1.account.id);

    const meNow = await app.fastify.inject({
      method: 'GET',
      url: '/home',
      headers: auth(body.token),
    });
    expect(meNow.statusCode).toBe(200);
    // The token switched away from is a signed-out one.
    const old = await app.fastify.inject({
      method: 'GET',
      url: '/home',
      headers: auth(me.token),
    });
    expect(old.statusCode).toBe(401);
  });

  it('forgets this device for the account it leaves', async () => {
    build();
    const me = await signIn(MINE[0]);
    await signIn(MINE[1]);
    await app.fastify.inject({
      method: 'POST',
      url: '/devices',
      headers: auth(me.token),
      payload: { token: 'phone-1', platform: 'ios' },
    });
    expect(app.devices.hasToken(me.account.id)).toBe(true);

    await switchTo(me.token, MINE[1], 'phone-1');
    expect(app.devices.hasToken(me.account.id)).toBe(false);
  });

  it('refuses anybody outside the set, and keeps their session', async () => {
    build();
    await signIn(MINE[1]);
    const stranger = await signIn('someone@example.com');
    const refused = await switchTo(stranger.token, MINE[1]);
    expect(refused.statusCode).toBe(404);
    const still = await app.fastify.inject({
      method: 'GET',
      url: '/home',
      headers: auth(stranger.token),
    });
    expect(still.statusCode).toBe(200);
  });

  it('refuses a target outside the set', async () => {
    build();
    const me = await signIn(MINE[0]);
    await signIn('someone@example.com');
    expect((await switchTo(me.token, 'someone@example.com')).statusCode).toBe(
      404
    );
  });

  it('never reaches a review account, even one configured into the set', async () => {
    build([...MINE, REVIEW.identifier]);
    const me = await signIn(MINE[0]);
    await signIn(REVIEW.identifier);
    expect((await switchTo(me.token, REVIEW.identifier)).statusCode).toBe(404);
  });

  it('never creates an account that has not signed up', async () => {
    build();
    const me = await signIn(MINE[0]);
    expect((await switchTo(me.token, MINE[2])).statusCode).toBe(404);
    expect(app.accounts.byIdentifier(MINE[2])).toBeUndefined();
  });

  it('is off when unconfigured', async () => {
    build([]);
    const me = await signIn(MINE[0]);
    await signIn(MINE[1]);
    expect((await switchTo(me.token, MINE[1])).statusCode).toBe(404);
  });
});

describe('hello', () => {
  async function helloFor(token: string) {
    await app.fastify.listen({ port: 0, host: '127.0.0.1' });
    const address = app.fastify.server.address();
    if (typeof address === 'string' || address === null) throw new Error('no port');
    const socket = new WebSocket(`ws://127.0.0.1:${address.port}/ws?token=${token}`);
    const hello = await new Promise<Extract<ServerMessage, { type: 'hello' }>>(
      (resolve) =>
        socket.on('message', (raw) => {
          const message = JSON.parse(String(raw)) as ServerMessage;
          if (message.type === 'hello') resolve(message);
        })
    );
    socket.close();
    return hello;
  }

  it('names the other accounts to somebody in the set', async () => {
    build();
    const me = await signIn(MINE[0]);
    expect((await helloFor(me.token)).switchAccounts).toEqual(MINE.slice(1));
  });

  it('says nothing to anybody else', async () => {
    build();
    const stranger = await signIn('someone@example.com');
    expect((await helloFor(stranger.token)).switchAccounts).toBeUndefined();
  });
});
