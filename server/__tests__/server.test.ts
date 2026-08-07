import { buildApp, type App } from '../src/app';

/**
 * These cover what the server adds over the mock: authentication, the
 * authorization boundary, and enforcement that no client can act as the other
 * party. The floor rules themselves are core's tests, not these.
 */

let app: App;
let clock = 1_700_000_000_000;

beforeEach(() => {
  clock = 1_700_000_000_000;
  app = buildApp({ dbPath: ':memory:', now: () => clock });
});

afterEach(async () => {
  app.sessions.stop();
  await app.fastify.close();
});

/**
 * Issues the code through Accounts rather than reading it off a response. The
 * server never returns a code to a caller, so the real verification path can be
 * exercised without a dev affordance existing in the server at all.
 */
async function signIn(identifier: string, displayName?: string) {
  const code = app.accounts.issueCode(identifier, clock)!;
  const verified = await app.fastify.inject({
    method: 'POST',
    url: '/auth/verify',
    payload: { identifier, code, displayName },
  });
  const body = verified.json() as {
    token: string;
    account: { id: string; displayName: string };
  };
  return { ...body, code };
}

const auth = (token: string) => ({ authorization: `Bearer ${token}` });

/** Two accounts who have accepted each other — the normal starting point. */
async function twoContacts() {
  const alice = await signIn('+15550000001', 'Alice');
  const bob = await signIn('+15550000002', 'Bob');

  await app.fastify.inject({
    method: 'POST',
    url: '/contacts/request',
    headers: auth(alice.token),
    payload: { identifier: '+15550000002' },
  });
  await app.fastify.inject({
    method: 'POST',
    url: `/contacts/${alice.account.id}/accept`,
    headers: auth(bob.token),
  });
  return { alice, bob };
}

describe('one-time codes', () => {
  it('creates an account on first verification and signs in after', async () => {
    const first = await signIn('+15550000009', 'New Person');
    expect(first.token).toBeTruthy();
    expect(first.account.displayName).toBe('New Person');

    const second = await signIn('+15550000009');
    expect(second.account.id).toBe(first.account.id);
    expect(second.token).not.toBe(first.token);
  });

  it('rejects a wrong code', async () => {
    const code = app.accounts.issueCode('+15550000001', clock)!;
    // Derived from the real code so it is guaranteed to differ.
    const wrong = code === '000000' ? '000001' : '000000';

    const response = await app.fastify.inject({
      method: 'POST',
      url: '/auth/verify',
      payload: { identifier: '+15550000001', code: wrong },
    });
    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({ error: 'Invalid or expired code.' });
  });

  it('expires a code after ten minutes', async () => {
    const code = app.accounts.issueCode('+15550000003', clock)!;
    clock += 10 * 60 * 1000 + 1;
    const response = await app.fastify.inject({
      method: 'POST',
      url: '/auth/verify',
      payload: { identifier: '+15550000003', code },
    });
    expect(response.statusCode).toBe(401);
  });

  it('stops accepting attempts after five failures', async () => {
    const code = app.accounts.issueCode('+15550000004', clock)!;
    const wrong = code === '111111' ? '222222' : '111111';

    for (let i = 0; i < 5; i++) {
      await app.fastify.inject({
        method: 'POST',
        url: '/auth/verify',
        payload: { identifier: '+15550000004', code: wrong },
      });
    }
    // Even the correct code is refused now.
    const response = await app.fastify.inject({
      method: 'POST',
      url: '/auth/verify',
      payload: { identifier: '+15550000004', code },
    });
    expect(response.statusCode).toBe(401);
  });

  it('stores neither codes nor tokens in the clear', async () => {
    const { token, code } = await signIn('+15550000005');
    const tokens = app.db.prepare('SELECT * FROM tokens').all();
    expect(JSON.stringify(tokens)).not.toContain(token);
    const codes = app.db.prepare('SELECT * FROM otp_codes').all();
    expect(JSON.stringify(codes)).not.toContain(code);
  });
});

describe('authorization', () => {
  it('refuses unauthenticated requests', async () => {
    const response = await app.fastify.inject({ method: 'GET', url: '/home' });
    expect(response.statusCode).toBe(401);
  });

  it('refuses a revoked token', async () => {
    const { token } = await signIn('+15550000006');
    await app.fastify.inject({
      method: 'POST',
      url: '/auth/sign-out',
      headers: auth(token),
    });
    const response = await app.fastify.inject({
      method: 'GET',
      url: '/home',
      headers: auth(token),
    });
    expect(response.statusCode).toBe(401);
  });
});

describe('contacts', () => {
  it('requires mutual acceptance before a session is possible', async () => {
    const alice = await signIn('+15550000001', 'Alice');
    const bob = await signIn('+15550000002', 'Bob');

    await app.fastify.inject({
      method: 'POST',
      url: '/contacts/request',
      headers: auth(alice.token),
      payload: { identifier: '+15550000002' },
    });

    // Pending, so no session yet.
    const tooSoon = await app.fastify.inject({
      method: 'POST',
      url: '/sessions',
      headers: auth(alice.token),
      payload: { contactId: bob.account.id },
    });
    expect(tooSoon.statusCode).toBe(400);
    expect(tooSoon.json()).toEqual({ error: 'Not a contact.' });

    await app.fastify.inject({
      method: 'POST',
      url: `/contacts/${alice.account.id}/accept`,
      headers: auth(bob.token),
    });

    const now = await app.fastify.inject({
      method: 'POST',
      url: '/sessions',
      headers: auth(alice.token),
      payload: { contactId: bob.account.id },
    });
    expect(now.statusCode).toBe(200);
  });

  it('will not let the requester accept their own request', async () => {
    const alice = await signIn('+15550000001', 'Alice');
    const bob = await signIn('+15550000002', 'Bob');
    await app.fastify.inject({
      method: 'POST',
      url: '/contacts/request',
      headers: auth(alice.token),
      payload: { identifier: '+15550000002' },
    });

    const response = await app.fastify.inject({
      method: 'POST',
      url: `/contacts/${bob.account.id}/accept`,
      headers: auth(alice.token),
    });
    expect(response.statusCode).toBe(400);
  });

  it('shows the two pending directions from each side', async () => {
    const alice = await signIn('+15550000001', 'Alice');
    await signIn('+15550000002', 'Bob');
    await app.fastify.inject({
      method: 'POST',
      url: '/contacts/request',
      headers: auth(alice.token),
      payload: { identifier: '+15550000002' },
    });

    const home = await app.fastify.inject({
      method: 'GET',
      url: '/home',
      headers: auth(alice.token),
    });
    expect(home.json().contacts[0].status).toBe('outgoing');
  });
});

describe('bodyless POSTs', () => {
  // Every endpoint without a payload was rejected before reaching its handler,
  // because a real fetch sets content-type: application/json even with no body
  // and Fastify refuses that. inject() omits the header unless a payload is
  // given, so the whole test suite sailed past it — accept, decline, sign out
  // and the audio token were all broken from the app.
  it.each([
    ['/auth/sign-out', 204],
    ['/contacts/acct_nobody/accept', 400],
  ])('accepts %s with content-type and an empty body', async (url, expected) => {
    const { token } = await signIn('+15550000001', 'Alice');
    const response = await app.fastify.inject({
      method: 'POST',
      url,
      headers: { ...auth(token), 'content-type': 'application/json' },
      payload: '',
    });
    // The point is that it reaches the handler at all. A 204 carries no body,
    // so check the raw payload rather than parsing it.
    expect(response.payload).not.toContain('FST_ERR_CTP_EMPTY_JSON_BODY');
    expect(response.statusCode).toBe(expected);
  });

  it('lets one contact accept another with no request body', async () => {
    const alice = await signIn('+15550000001', 'Alice');
    const bob = await signIn('+15550000002', 'Bob');
    await app.fastify.inject({
      method: 'POST',
      url: '/contacts/request',
      headers: auth(alice.token),
      payload: { identifier: '+15550000002' },
    });

    const accepted = await app.fastify.inject({
      method: 'POST',
      url: `/contacts/${alice.account.id}/accept`,
      headers: { ...auth(bob.token), 'content-type': 'application/json' },
      payload: '',
    });
    expect(accepted.statusCode).toBe(200);

    const home = await app.fastify.inject({
      method: 'GET',
      url: '/home',
      headers: auth(alice.token),
    });
    expect(home.json().contacts[0].status).toBe('accepted');
  });
});

describe('sessions', () => {
  it('will not create a duplicate session for the same pair', async () => {
    const { alice, bob } = await twoContacts();
    const first = await app.fastify.inject({
      method: 'POST',
      url: '/sessions',
      headers: auth(alice.token),
      payload: { contactId: bob.account.id },
    });
    const second = await app.fastify.inject({
      method: 'POST',
      url: '/sessions',
      headers: auth(alice.token),
      payload: { contactId: bob.account.id },
    });
    // The gap the mock had: tapping twice stacked sessions and piled up
    // banners on the other side.
    expect(second.json().sessionId).toBe(first.json().sessionId);
  });

  it('refuses to act on a session you are not part of', async () => {
    const { alice, bob } = await twoContacts();
    const outsider = await signIn('+15550000099', 'Outsider');
    const created = await app.fastify.inject({
      method: 'POST',
      url: '/sessions',
      headers: auth(alice.token),
      payload: { contactId: bob.account.id },
    });
    const { sessionId } = created.json() as { sessionId: string };

    const result = app.sessions.dispatch(sessionId, outsider.account.id, {
      type: 'CLAIM_FLOOR',
    });
    expect(result).toEqual({ ok: false, error: 'Not your session.' });
    expect(app.sessions.get(sessionId)!.floor.holder).toBeNull();
  });

  it('enforces the floor rules from core, server-side', async () => {
    const { alice, bob } = await twoContacts();
    const created = await app.fastify.inject({
      method: 'POST',
      url: '/sessions',
      headers: auth(alice.token),
      payload: { contactId: bob.account.id },
    });
    const { sessionId } = created.json() as { sessionId: string };

    // Alone, so no claim is possible.
    expect(
      app.sessions.dispatch(sessionId, alice.account.id, { type: 'CLAIM_FLOOR' })
    ).toEqual({ ok: true, session: expect.anything() });
    expect(app.sessions.get(sessionId)!.floor.holder).toBeNull();

    app.sessions.dispatch(sessionId, bob.account.id, { type: 'ENTER' });
    app.sessions.dispatch(sessionId, alice.account.id, { type: 'CLAIM_FLOOR' });
    expect(app.sessions.get(sessionId)!.floor.holder).toBe(alice.account.id);

    // Bob is silenced and cannot claim his way out of it.
    app.sessions.dispatch(sessionId, bob.account.id, { type: 'CLAIM_FLOOR' });
    expect(app.sessions.get(sessionId)!.floor.holder).toBe(alice.account.id);

    // Three minutes pass; the server releases it on tick, not the client.
    clock += 3 * 60 * 1000;
    app.sessions.tick();
    expect(app.sessions.get(sessionId)!.floor.holder).toBeNull();

    // Alice owes the cooldown; Bob does not.
    app.sessions.dispatch(sessionId, alice.account.id, { type: 'CLAIM_FLOOR' });
    expect(app.sessions.get(sessionId)!.floor.holder).toBeNull();
    app.sessions.dispatch(sessionId, bob.account.id, { type: 'CLAIM_FLOOR' });
    expect(app.sessions.get(sessionId)!.floor.holder).toBe(bob.account.id);
  });

  it('auto-ends an empty session and records it', async () => {
    const { alice, bob } = await twoContacts();
    const created = await app.fastify.inject({
      method: 'POST',
      url: '/sessions',
      headers: auth(alice.token),
      payload: { contactId: bob.account.id },
    });
    const { sessionId } = created.json() as { sessionId: string };

    app.sessions.dispatch(sessionId, alice.account.id, { type: 'LEAVE' });
    clock += 60 * 1000;
    app.sessions.tick();

    expect(app.sessions.get(sessionId)!.status).toBe('ended');
    const row = app.db
      .prepare('SELECT ended_reason FROM sessions WHERE id = ?')
      .get(sessionId) as { ended_reason: string };
    expect(row.ended_reason).toBe('empty-timeout');
  });
});
