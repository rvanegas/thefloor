import { buildApp, type App } from '../src/app';
import { MemoryMailer } from '../src/mail';
import { AUTH_ORIGIN, authToken, fakeAuth, strangerToken } from '../__stubs__/fakeAuth';

/**
 * Deleting an account at auth deletes The Floor's too (2026-11-09).
 *
 * auth.rvanegas.co/account deletes a person's account there and tells each
 * project, `DELETE /users/<user>`, with a token auth signed as itself under
 * `thefloor:erase`. The Floor deletes the account by that username exactly
 * as its own Settings would (account-deletion.test.ts holds what that takes).
 * Nobody but auth can ask it, and asking about somebody unknown, or twice, is
 * answered the same.
 */

let app: App;
const clock = 1_700_000_000_000;

/** auth's register, as far as a signup sees it: the suggested stem, numbered when taken. */
let names: Set<string>;
const fakeRegister = (async (_input: unknown, init?: { body?: unknown }) => {
  const body = JSON.parse(String(init?.body)) as { suggest: string[] };
  let name = body.suggest[0];
  for (let n = 2; names.has(name); n++) name = `${body.suggest[0]}${n}`;
  names.add(name);
  return Response.json({ user: name, account: false });
}) as typeof fetch;

beforeEach(() => {
  names = new Set();
  app = buildApp({
    dbPath: ':memory:',
    mailer: new MemoryMailer(),
    now: () => clock,
    names: { origin: AUTH_ORIGIN, clientId: 'thefloor', clientSecret: 'client-secret', fetch: fakeRegister },
    auth: fakeAuth(),
  });
});

afterEach(async () => {
  app.channels.stop();
  await app.fastify.close();
});

async function signIn(identifier: string, displayName: string) {
  const code = app.accounts.issueCode(identifier, clock)!;
  const verified = await app.fastify.inject({
    method: 'POST',
    url: '/auth/verify',
    payload: { identifier, code, displayName },
  });
  const { token, account } = verified.json() as { token: string; account: { id: string } };
  return { token, id: account.id, username: app.accounts.byId(account.id)!.username! };
}

const AUTH_ITSELF = { sub: 'dianoia-auth', client_id: 'dianoia-auth', scope: 'thefloor:erase' };
const erase = (user: string, token = authToken(AUTH_ITSELF)) =>
  app.fastify.inject({ method: 'DELETE', url: `/users/${user}`, headers: { authorization: `Bearer ${token}` } });

it('deletes the account auth names, as Settings would', async () => {
  const erta = await signIn('erta@example.com', 'Erta Example');
  expect((await erase(erta.username.toUpperCase())).statusCode).toBe(204);
  expect(app.accounts.byCurrentUsername(erta.username)).toBeUndefined();
  const home = await app.fastify.inject({ method: 'GET', url: '/home', headers: { authorization: `Bearer ${erta.token}` } });
  expect(home.statusCode).toBe(401);
});

it('answers the same for somebody unknown, and for somebody already gone', async () => {
  const erta = await signIn('erta@example.com', 'Erta Example');
  expect((await erase(erta.username)).statusCode).toBe(204);
  expect((await erase(erta.username)).statusCode).toBe(204);
  expect((await erase('nobody_here')).statusCode).toBe(204);
});

it('is auth’s alone to ask', async () => {
  const erta = await signIn('erta@example.com', 'Erta Example');
  for (const token of [
    authToken(), // noesis's own, asking who belongs
    authToken({ ...AUTH_ITSELF, client_id: 'noesis' }),
    authToken({ ...AUTH_ITSELF, scope: 'thefloor:members' }),
    strangerToken(),
    erta.token,
  ]) {
    expect((await erase(erta.username, token)).statusCode).toBe(401);
  }
  expect(app.accounts.byCurrentUsername(erta.username)).toBeDefined();
});
