import { buildApp, type App } from '../src/app';
import { MemoryMailer } from '../src/mail';

/**
 * noesis decides every username (names.ts): a signup is named there, a rename
 * here is made there first, and while a library is connected neither the
 * username nor the address changes at all. noesis is
 * answered by a register kept in this file — a name per address, and the
 * four-to-thirty lowercase rule — which is all of its behaviour The Floor sees.
 */

let app: App;
let clock = 1_700_000_000_000;
const SECRET = 'client-secret';

/** noesis's register: address → name, and which addresses are noesis accounts. */
let register: Map<string, string>;
let noesisAccounts: Set<string>;
let noesisDown: boolean;
let asked: Array<{ method: string; path: string; body: Record<string, unknown> }>;
/** Who noesis's `/me` says signed in at a Connect. */
let signedIn: { user: string; email: string };

const fakeNoesis = (async (input: unknown, init?: { body?: unknown; method?: string; headers?: unknown }) => {
  const url = new URL(String(input));
  if (noesisDown) throw new Error('connect ECONNREFUSED');
  if (url.pathname.startsWith('/names')) {
    const body = JSON.parse(String(init?.body)) as Record<string, string>;
    asked.push({ method: init?.method ?? 'GET', path: url.pathname, body });
    const headers = init?.headers as Record<string, string>;
    if (headers.authorization !== 'Basic ' + Buffer.from(`thefloor:${SECRET}`).toString('base64')) {
      return Response.json({ detail: 'not an application that keeps names' }, { status: 401 });
    }
    const taken = (name: string) => [...register.values()].includes(name);
    if (url.pathname === '/names/address') {
      if (noesisAccounts.has(body.email)) {
        return Response.json({ detail: 'Your address is also how you sign in to noesis.' }, { status: 409 });
      }
      const name = register.get(body.email);
      if (name) {
        register.delete(body.email);
        register.set(body.new_email, name);
      }
      return Response.json({ moved: true });
    }
    if (init?.method === 'POST') {
      const existing = register.get(body.email);
      if (existing) return Response.json({ user: existing, account: noesisAccounts.has(body.email) });
      const stem = (body.suggest as unknown as string[])[0] ?? body.email.split('@')[0];
      let name = stem.toLowerCase();
      for (let n = 2; taken(name) || name.length < 4; n++) name = `${stem.toLowerCase()}${n}`;
      register.set(body.email, name);
      return Response.json({ user: name, account: false });
    }
    const name = body.user.toLowerCase();
    if (!/^[a-z0-9_]{4,30}$/.test(name)) return Response.json({ detail: 'Not a user name.' }, { status: 400 });
    if (taken(name) && register.get(body.email) !== name) {
      return Response.json({ detail: 'That user name is taken.' }, { status: 409 });
    }
    register.set(body.email, name);
    return Response.json({ user: name });
  }
  if (url.pathname === '/token') {
    return Response.json({ access_token: 'a', refresh_token: 'r', expires_in: 3600 });
  }
  if (url.pathname === '/me') return Response.json({ ...signedIn, libraries: [`${signedIn.user}/notes`] });
  return new Response(null, { status: 200 });
}) as typeof fetch;

function start(enforced: boolean) {
  app = buildApp({
    dbPath: ':memory:',
    mailer: new MemoryMailer(),
    now: () => clock,
    library: {
      url: 'https://noesis.example/mcp',
      clientId: 'thefloor',
      clientSecret: SECRET,
      callbackUrl: 'https://floor.example/noesis/callback',
      fetch: fakeNoesis,
    },
    names: { origin: 'https://noesis.example', clientId: 'thefloor', clientSecret: SECRET, fetch: fakeNoesis, enforced },
  });
}

beforeEach(() => {
  clock = 1_700_000_000_000;
  register = new Map();
  noesisAccounts = new Set();
  noesisDown = false;
  asked = [];
  signedIn = { user: 'alice', email: 'alice@example.com' };
  start(true);
});

afterEach(async () => {
  app.channels.stop();
  await app.fastify.close();
});

const auth = (token: string) => ({ authorization: `Bearer ${token}` });

async function signUp(identifier: string, displayName: string) {
  const code = app.accounts.issueCode(identifier, clock)!;
  return app.fastify.inject({ method: 'POST', url: '/auth/verify', payload: { identifier, code, displayName } });
}

async function signIn(identifier: string, displayName: string) {
  return (await signUp(identifier, displayName)).json() as { token: string; account: { id: string } };
}

const rename = (token: string, username: string) =>
  app.fastify.inject({ method: 'POST', url: '/me', headers: auth(token), payload: { username } });

describe('signing up', () => {
  it('takes the username noesis gives, suggesting the display name’s', async () => {
    const alice = await signIn('Alice@example.com', 'Alice');
    expect(asked).toEqual([
      { method: 'POST', path: '/names', body: { email: 'alice@example.com', suggest: ['alice'] } },
    ]);
    expect(app.accounts.byId(alice.account.id)!.username).toBe('alice');
    // The address already named at noesis keeps its name, whatever the display name.
    register.set('bob@example.com', 'robert_b');
    const bob = await signIn('bob@example.com', 'Bobby');
    expect(app.accounts.byId(bob.account.id)!.username).toBe('robert_b');
  });

  it('asks only for a new account, and makes none while noesis cannot be asked', async () => {
    await signIn('alice@example.com', 'Alice');
    asked = [];
    await signIn('alice@example.com', 'Alice');
    expect(asked).toEqual([]);

    noesisDown = true;
    const refused = await signUp('carol@example.com', 'Carol');
    expect(refused.statusCode).toBe(503);
    expect(app.accounts.byIdentifier('carol@example.com')).toBeUndefined();
    // The code is spent: the next attempt needs another.
    noesisDown = false;
    expect(
      (
        await app.fastify.inject({
          method: 'POST',
          url: '/auth/verify',
          payload: { identifier: 'carol@example.com', code: '000000', displayName: 'Carol' },
        })
      ).statusCode
    ).toBe(401);
  });

  it('derives the name here, as before, until the register is turned on', async () => {
    await app.fastify.close();
    start(false);
    const alice = await signIn('alice@example.com', 'Alice');
    expect(asked).toEqual([]);
    expect(app.accounts.byId(alice.account.id)!.username).toBe('alice');
  });
});

describe('renaming here', () => {
  it('renames at noesis first, keeping the case typed here', async () => {
    const alice = await signIn('alice@example.com', 'Alice');
    const renamed = await rename(alice.token, '@AnnaK');
    expect(renamed.statusCode).toBe(200);
    expect(renamed.json().username).toBe('AnnaK');
    expect(register.get('alice@example.com')).toBe('annak');
  });

  it('says noesis’s no, and changes nothing', async () => {
    const alice = await signIn('alice@example.com', 'Alice');
    register.set('someone@elsewhere.example', 'taken_one');
    const taken = await rename(alice.token, 'taken_one');
    expect(taken.statusCode).toBe(409);
    expect(taken.json().error).toBe('That user name is taken.');
    expect(app.accounts.byId(alice.account.id)!.username).toBe('alice');

    const removed = await rename(alice.token, '');
    expect(removed.statusCode).toBe(400);
    expect(removed.json().error).toMatch(/changed but not removed/);

    noesisDown = true;
    expect((await rename(alice.token, 'alice_two')).statusCode).toBe(503);
    expect(app.accounts.byId(alice.account.id)!.username).toBe('alice');
  });

  it('keeps the old name answering for the renamed person until somebody takes it', async () => {
    const alice = await signIn('alice@example.com', 'Alice');
    await rename(alice.token, 'alice_two');
    expect(app.accounts.byUsername('alice')!.id).toBe(alice.account.id);
    expect(app.accounts.byUsername('ALICE_TWO')!.id).toBe(alice.account.id);
    // Somebody else may have it now, and then it is theirs.
    const bob = await signIn('bob@example.com', 'Bob');
    expect((await rename(bob.token, 'alice')).statusCode).toBe(200);
    expect(app.accounts.byUsername('alice')!.id).toBe(bob.account.id);
  });
});

describe('a connected library', () => {
  async function connected(identifier: string, user: string) {
    const signedUp = await signIn(identifier, 'Somebody');
    signedIn = { user, email: identifier };
    const state = new URL(app.noesis!.start(signedUp.account.id, 'app')).searchParams.get('state')!;
    expect((await app.noesis!.finish(state, 'code', undefined)).ok).toBe(true);
    return signedUp;
  }

  it('fixes the username, saying why, whether or not the register is on', async () => {
    for (const enforced of [true, false]) {
      await app.fastify.close();
      start(enforced);
      const alice = await connected('alice@example.com', 'somebody');
      const before = app.accounts.byId(alice.account.id)!.username!;
      asked = [];
      const refused = await rename(alice.token, 'alice_two');
      expect(refused.statusCode).toBe(409);
      expect(refused.json().error).toMatch(/can’t be changed while your noesis library is connected/);
      expect((await rename(alice.token, '')).statusCode).toBe(409);
      expect(app.accounts.byId(alice.account.id)!.username).toBe(before);
      expect(asked).toEqual([]);
      // The same name, in another case, is no change.
      expect((await rename(alice.token, before.toUpperCase())).statusCode).toBe(200);
    }
  });

  it('fixes the address before a code is sent, and again when one comes back', async () => {
    const alice = await connected('alice@example.com', 'somebody');
    const asking = await app.fastify.inject({
      method: 'POST',
      url: '/me/email',
      headers: auth(alice.token),
      payload: { identifier: 'alice@new.example' },
    });
    expect(asking.statusCode).toBe(409);
    const code = app.accounts.issueCode('alice@new.example', clock)!;
    const confirming = await app.fastify.inject({
      method: 'POST',
      url: '/me/email/confirm',
      headers: auth(alice.token),
      payload: { identifier: 'alice@new.example', code },
    });
    expect(confirming.statusCode).toBe(409);
    expect(app.accounts.byId(alice.account.id)!.identifier).toBe('alice@example.com');
  });

  it('frees both once it is disconnected, for a name noesis still holds as a reservation', async () => {
    const alice = await connected('alice@example.com', 'somebody');
    await app.noesis!.disconnect(alice.account.id);
    expect((await rename(alice.token, 'alice_two')).statusCode).toBe(200);
    expect(register.get('alice@example.com')).toBe('alice_two');
  });
});

describe('the address, which is the other half of the pair', () => {
  const changeTo = async (token: string, identifier: string) => {
    const code = app.accounts.issueCode(identifier, clock)!;
    return app.fastify.inject({
      method: 'POST',
      url: '/me/email/confirm',
      headers: auth(token),
      payload: { identifier, code },
    });
  };

  it('moves the reservation with it', async () => {
    const alice = await signIn('alice@example.com', 'Alice');
    expect((await changeTo(alice.token, 'alice@new.example')).statusCode).toBe(200);
    expect(register.get('alice@new.example')).toBe('alice');
    expect(register.has('alice@example.com')).toBe(false);
  });

  it('stays where it is when it is a noesis account’s', async () => {
    const alice = await signIn('alice@example.com', 'Alice');
    noesisAccounts.add('alice@example.com');
    const refused = await changeTo(alice.token, 'alice@new.example');
    expect(refused.statusCode).toBe(409);
    expect(refused.json().error).toMatch(/sign in to noesis/);
    expect(app.accounts.byId(alice.account.id)!.identifier).toBe('alice@example.com');
  });
});

describe('connecting a library', () => {
  it('refuses a noesis account under another address', async () => {
    const alice = await signIn('alice@example.com', 'Alice');
    signedIn = { user: 'alice', email: 'someone-else@example.com' };
    const state = new URL(app.noesis!.start(alice.account.id, 'app')).searchParams.get('state')!;
    expect(await app.noesis!.finish(state, 'code', undefined)).toMatchObject({ ok: false, reason: 'address' });
    expect(app.noesis!.connected(alice.account.id)).toBe(false);
  });
});
