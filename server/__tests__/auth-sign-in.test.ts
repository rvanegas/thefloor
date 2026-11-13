import { buildApp, type App } from '../src/app';
import { MemoryMailer } from '../src/mail';

/**
 * Signing in to The Floor through dianoia-auth (`/auth/start`, the callback,
 * `/auth/ticket`), since 2026-11-09: one sign-in that also connects the
 * person's noesis library, and a ticket rather than a token in the URL.
 *
 * - It asks auth for who the person is and their library, and passes
 *   `prompt=login` through after a sign-out.
 * - The callback makes the account, or finds it by address, and hands the app
 *   a ticket good once; the token it trades for signs in like any other.
 * - A new account is said to be new, for the app to ask its name and consent.
 * - Declining, or a ticket used twice or too late, signs nobody in.
 * - The web app goes back to the train it came from.
 */

let app: App;
let clock = 1_700_000_000_000;
let who: { user: string; email: string; display_name?: string | null };
let calls: string[];
/** What The Floor offered auth as the person's display name, with their own token. */
let offered: Array<{ authorization: string; display_name: string }>;

const fakeAuthAndNoesis = (async (input: unknown, init?: { body?: unknown }) => {
  const url = new URL(String(input));
  calls.push(`${url.host}${url.pathname}`);
  if (url.pathname === '/token') {
    const fields = Object.fromEntries(new URLSearchParams(String(init?.body)));
    if (fields.code === 'bad') return new Response('{"error":"invalid_grant"}', { status: 400 });
    return Response.json({ access_token: 'access', refresh_token: 'refresh', expires_in: 900,
      scope: 'identity noesis:read noesis:import' });
  }
  if (url.pathname === '/me/display_name') {
    const headers = (init as { headers?: Record<string, string> }).headers ?? {};
    offered.push({ authorization: headers.Authorization, ...JSON.parse(String(init?.body)) });
    return Response.json({ display_name: 'taken' });
  }
  if (url.pathname === '/me') {
    // auth's /me says who; noesis's, whose libraries. Both answer here.
    return Response.json({ ...who, libraries: [`${who.user}/notes`] });
  }
  return new Response(null, { status: 200 });
}) as typeof fetch;

beforeEach(() => {
  clock = 1_700_000_000_000;
  calls = [];
  offered = [];
  who = { user: 'erta_example', email: 'erta@example.com' };
  app = buildApp({
    dbPath: ':memory:',
    mailer: new MemoryMailer(),
    now: () => clock,
    library: {
      url: 'https://noesis.example/mcp',
      authUrl: 'https://auth.example',
      clientId: 'thefloor',
      clientSecret: 'client-secret',
      callbackUrl: 'https://floor.example/noesis/callback',
      fetch: fakeAuthAndNoesis,
    },
  });
});

afterEach(async () => {
  app.channels.stop();
  await app.fastify.close();
});

async function start(payload: object = { returnTo: 'app' }) {
  const started = await app.fastify.inject({ method: 'POST', url: '/auth/start', payload });
  expect(started.statusCode).toBe(200);
  return new URL(started.json().url);
}

async function callback(state: string, extra: Record<string, string> = { code: 'good' }) {
  const back = await app.fastify.inject({
    method: 'GET',
    url: `/noesis/callback?${new URLSearchParams({ state, ...extra })}`,
  });
  expect(back.statusCode).toBe(302);
  return back.headers.location as string;
}

async function ticketFor(location: string) {
  const ticket = new URL(location.replace(/^\/(app|beta)\//, 'https://floor.example/$1/')).searchParams.get('ticket')!;
  return app.fastify.inject({ method: 'POST', url: '/auth/ticket', payload: { ticket } });
}

describe('signing in through dianoia-auth', () => {
  it('asks auth for who and their library, and after a sign-out asks whose session, not for a code', async () => {
    const url = await start();
    expect(url.origin + url.pathname).toBe('https://auth.example/authorize');
    expect(url.searchParams.get('scope')).toBe('identity noesis:read noesis:import');
    expect(url.searchParams.get('redirect_uri')).toBe('https://floor.example/noesis/callback');
    expect(url.searchParams.get('prompt')).toBeNull();
    // The app says somebody signed out here; auth is asked to name its session, never for the code.
    expect((await start({ returnTo: 'app', prompt: 'login' })).searchParams.get('prompt')).toBe('consent');
  });

  it('makes the account, connects its library, and trades a ticket for a token once', async () => {
    const url = await start();
    const location = await callback(url.searchParams.get('state')!);
    expect(location).toMatch(/^thefloor:\/\/auth\?ticket=/);
    expect(location).not.toContain('access');
    const traded = await ticketFor(location);
    expect(traded.statusCode).toBe(200);
    const { token, account, created } = traded.json();
    expect(created).toBe(true);
    // Named as the register named it, at the address auth says.
    const row = app.accounts.byId(account.id)!;
    expect(row.username).toBe('erta_example');
    expect(row.identifier).toBe('erta@example.com');
    // The token signs in like any other, and the library is connected.
    // As the app's first-run step would: the name it asks for, sent with the token.
    const named = await app.fastify.inject({
      method: 'POST', url: '/me', headers: { authorization: `Bearer ${token}` }, payload: { displayName: 'Erta Example' },
    });
    expect(named.statusCode).toBe(200);
    expect(app.accounts.byId(account.id)!.display_name).toBe('Erta Example');
    expect(app.noesis!.status(account.id)).toMatchObject({ connected: true, user: 'erta_example', canSend: true });
    // A new account's name is a placeholder until chosen, so nothing was offered to auth.
    expect(offered).toEqual([]);
    // Good once.
    expect((await ticketFor(location)).statusCode).toBe(401);
  });

  it('finds an account that signed up with its own code, by its address', async () => {
    const code = app.accounts.issueCode('erta@example.com', clock)!;
    const verified = await app.fastify.inject({
      method: 'POST', url: '/auth/verify', payload: { identifier: 'erta@example.com', code, displayName: 'Erta' },
    });
    const before = verified.json().account.id;
    const location = await callback((await start()).searchParams.get('state')!);
    const traded = (await ticketFor(location)).json();
    expect(traded.created).toBe(false);
    expect(traded.account.id).toBe(before);
    expect(traded.account.displayName).toBe('Erta');
    // auth had no name for her, so it is offered hers, with her own token.
    expect(offered).toEqual([{ authorization: 'Bearer access', display_name: 'Erta' }]);
  });

  it('takes the display name auth keeps, in place of the one here', async () => {
    const code = app.accounts.issueCode('erta@example.com', clock)!;
    const verified = await app.fastify.inject({
      method: 'POST', url: '/auth/verify', payload: { identifier: 'erta@example.com', code, displayName: 'Erta' },
    });
    who = { ...who, display_name: 'Erta Q. Example' };
    await ticketFor(await callback((await start()).searchParams.get('state')!));
    expect(app.accounts.byId(verified.json().account.id)!.display_name).toBe('Erta Q. Example');
    expect(offered).toEqual([]);
  });

  it('signs nobody in when the person declines, auth refuses, or the ticket is late', async () => {
    let state = (await start()).searchParams.get('state')!;
    expect(await callback(state, { error: 'access_denied' })).toBe('thefloor://auth?error=declined');
    state = (await start()).searchParams.get('state')!;
    expect(await callback(state, { code: 'bad' })).toBe('thefloor://auth?error=failed');
    // A state never started cannot be known for a sign-in: the plain page, and nobody signed in.
    const unknown = await app.fastify.inject({ method: 'GET', url: '/noesis/callback?state=never&code=good' });
    expect(unknown.statusCode).toBe(200);
    expect(unknown.body).not.toContain('ticket');
    state = (await start()).searchParams.get('state')!;
    const location = await callback(state);
    clock += 3 * 60 * 1000;
    expect((await ticketFor(location)).statusCode).toBe(401);
  });

  it('sends the web app back to the train it came from', async () => {
    const beta = await start({ returnTo: 'web', path: '/beta' });
    expect(await callback(beta.searchParams.get('state')!)).toMatch(/^\/beta\/\?ticket=/);
    const elsewhere = await start({ returnTo: 'web', path: 'https://evil.example' });
    expect(await callback(elsewhere.searchParams.get('state')!)).toMatch(/^\/app\/\?ticket=/);
  });
});
