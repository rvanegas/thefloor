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
  app.channels.stop();
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

  it('renames an existing account when a name is given', async () => {
    // Signing out and back in is the only way to fix a name, so a name given
    // at sign-in has to apply to an account that already exists.
    const first = await signIn('+15550000007', 'B');
    expect(first.account.displayName).toBe('B');

    const second = await signIn('+15550000007', 'Bob');
    expect(second.account.id).toBe(first.account.id);
    expect(second.account.displayName).toBe('Bob');
  });

  it('keeps the current name when none is given', async () => {
    const first = await signIn('+15550000008', 'Priya');
    const second = await signIn('+15550000008');
    expect(second.account.displayName).toBe('Priya');
  });

  it('answers identically whether or not the address has an account', async () => {
    // The property this exists for. If a request to a stranger were refused
    // and a request to a user accepted, the endpoint would answer whether an
    // address has an account here, one guess at a time.
    const alice = await signIn('alice@example.com', 'Alice');
    await signIn('real@example.com', 'Real');

    const toReal = await app.fastify.inject({
      method: 'POST',
      url: '/contacts/request',
      headers: { authorization: `Bearer ${alice.token}` },
      payload: { identifier: 'real@example.com' },
    });
    const toNobody = await app.fastify.inject({
      method: 'POST',
      url: '/contacts/request',
      headers: { authorization: `Bearer ${alice.token}` },
      payload: { identifier: 'nobody@example.com' },
    });

    expect(toReal.statusCode).toBe(toNobody.statusCode);
    expect(toReal.json()).toEqual(toNobody.json());
  });

  it('shows both kinds of outgoing request identically', async () => {
    // Including in the contact list: a display name for one and an address for
    // the other would answer the same question a step later.
    const alice = await signIn('alice@example.com', 'Alice');
    await signIn('real@example.com', 'Real');

    for (const identifier of ['real@example.com', 'nobody@example.com']) {
      await app.fastify.inject({
        method: 'POST',
        url: '/contacts/request',
        headers: { authorization: `Bearer ${alice.token}` },
        payload: { identifier },
      });
    }

    const contacts = app.accounts.contactsFor(alice.account.id);
    expect(contacts).toHaveLength(2);
    for (const entry of contacts) {
      expect(entry.status).toBe('outgoing');
      expect(entry.account.id).toBe('');
    }
    expect(contacts.map((c) => c.account.displayName).sort()).toEqual([
      'nobody@example.com',
      'real@example.com',
    ]);
  });

  it('turns an invite into a real request when that address signs up', async () => {
    const alice = await signIn('alice@example.com', 'Alice');
    await app.fastify.inject({
      method: 'POST',
      url: '/contacts/request',
      headers: { authorization: `Bearer ${alice.token}` },
      payload: { identifier: 'later@example.com' },
    });

    // They sign up, and find Alice already waiting.
    const later = await signIn('later@example.com', 'Later');
    const theirs = app.accounts.contactsFor(later.account.id);
    expect(theirs).toEqual([
      { account: { id: alice.account.id, displayName: 'Alice' }, status: 'incoming' },
    ]);

    // And Alice's side is now a real pending request rather than an invite.
    const hers = app.accounts.contactsFor(alice.account.id);
    expect(hers).toHaveLength(1);
    expect(hers[0].status).toBe('outgoing');

    // Which they can accept, exactly as if it had always been one.
    expect(
      app.accounts.acceptContact(later.account.id, alice.account.id)
    ).toBe(true);
    expect(app.accounts.areContacts(alice.account.id, later.account.id)).toBe(true);
  });

  it('refuses a second invite to the same address, as it would a real one', async () => {
    const alice = await signIn('alice@example.com', 'Alice');
    const send = () =>
      app.fastify.inject({
        method: 'POST',
        url: '/contacts/request',
        headers: { authorization: `Bearer ${alice.token}` },
        payload: { identifier: 'nobody@example.com' },
      });
    expect((await send()).statusCode).toBe(200);
    const second = await send();
    expect(second.statusCode).toBe(400);
    expect(second.json().error).toBe('Request already sent.');
  });

  it('will not let someone invite their own address', async () => {
    const alice = await signIn('alice@example.com', 'Alice');
    const response = await app.fastify.inject({
      method: 'POST',
      url: '/contacts/request',
      headers: { authorization: `Bearer ${alice.token}` },
      payload: { identifier: 'ALICE@example.com' },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json().error).toBe('That’s you.');
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
  it('requires mutual acceptance before a channel is possible', async () => {
    const alice = await signIn('+15550000001', 'Alice');
    const bob = await signIn('+15550000002', 'Bob');

    await app.fastify.inject({
      method: 'POST',
      url: '/contacts/request',
      headers: auth(alice.token),
      payload: { identifier: '+15550000002' },
    });

    // Pending, so no channel yet.
    const tooSoon = await app.fastify.inject({
      method: 'POST',
      url: '/channels',
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
      url: '/channels',
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

  /**
   * Withdrawal goes by address on purpose: outgoing rows carry an empty
   * account id so a request to a stranger and one to a real user look the
   * same, and the address is the one handle that keeps them that way.
   */
  it('withdraws a request to an address with no account', async () => {
    const alice = await signIn('+15550000001', 'Alice');

    await app.fastify.inject({
      method: 'POST',
      url: '/contacts/request',
      headers: auth(alice.token),
      payload: { identifier: 'nobody@example.com' },
    });
    expect(app.accounts.contactsFor(alice.account.id)).toHaveLength(1);

    const withdrawn = await app.fastify.inject({
      method: 'POST',
      url: '/contacts/withdraw',
      headers: auth(alice.token),
      payload: { identifier: 'nobody@example.com' },
    });
    expect(withdrawn.statusCode).toBe(200);
    expect(app.accounts.contactsFor(alice.account.id)).toHaveLength(0);

    // Gone means gone: a second withdrawal has nothing to act on.
    const again = await app.fastify.inject({
      method: 'POST',
      url: '/contacts/withdraw',
      headers: auth(alice.token),
      payload: { identifier: 'nobody@example.com' },
    });
    expect(again.statusCode).toBe(400);
  });

  it('withdraws a pending request to a real account, and only its own', async () => {
    const alice = await signIn('+15550000001', 'Alice');
    const bob = await signIn('+15550000002', 'Bob');

    await app.fastify.inject({
      method: 'POST',
      url: '/contacts/request',
      headers: auth(alice.token),
      payload: { identifier: '+15550000002' },
    });

    // The recipient cannot withdraw what they did not send — declining is
    // their move, and it is a different endpoint.
    const notYours = await app.fastify.inject({
      method: 'POST',
      url: '/contacts/withdraw',
      headers: auth(bob.token),
      payload: { identifier: '+15550000001' },
    });
    expect(notYours.statusCode).toBe(400);
    expect(app.accounts.contactState(alice.account.id, bob.account.id)).not.toBeNull();

    const withdrawn = await app.fastify.inject({
      method: 'POST',
      url: '/contacts/withdraw',
      headers: auth(alice.token),
      payload: { identifier: '+15550000002' },
    });
    expect(withdrawn.statusCode).toBe(200);
    expect(app.accounts.contactState(alice.account.id, bob.account.id)).toBeNull();
    // And Bob no longer sees an incoming request.
    expect(app.accounts.contactsFor(bob.account.id)).toHaveLength(0);
  });

  it('cannot withdraw an accepted contact', async () => {
    const { alice } = await twoContacts();

    const refused = await app.fastify.inject({
      method: 'POST',
      url: '/contacts/withdraw',
      headers: auth(alice.token),
      payload: { identifier: '+15550000002' },
    });
    expect(refused.statusCode).toBe(400);
    expect(app.accounts.contactsFor(alice.account.id)[0].status).toBe('accepted');
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

describe('channels', () => {
  it('will not create a duplicate channel for the same pair', async () => {
    const { alice, bob } = await twoContacts();
    const first = await app.fastify.inject({
      method: 'POST',
      url: '/channels',
      headers: auth(alice.token),
      payload: { contactId: bob.account.id },
    });
    const second = await app.fastify.inject({
      method: 'POST',
      url: '/channels',
      headers: auth(alice.token),
      payload: { contactId: bob.account.id },
    });
    // The gap the mock had: tapping twice stacked channels and piled up
    // banners on the other side.
    expect(second.json().channelId).toBe(first.json().channelId);
  });

  it('refuses to act on a channel you are not part of', async () => {
    const { alice, bob } = await twoContacts();
    const outsider = await signIn('+15550000099', 'Outsider');
    const created = await app.fastify.inject({
      method: 'POST',
      url: '/channels',
      headers: auth(alice.token),
      payload: { contactId: bob.account.id },
    });
    const { channelId } = created.json() as { channelId: string };

    const result = app.channels.dispatch(channelId, outsider.account.id, {
      type: 'CLAIM_FLOOR',
    });
    expect(result).toEqual({
      ok: false,
      error: 'Not your channel.',
      code: 'forbidden',
    });
    expect(app.channels.get(channelId)!.floor.holder).toBeNull();
  });

  it('enforces the floor rules from core, server-side', async () => {
    const { alice, bob } = await twoContacts();
    const created = await app.fastify.inject({
      method: 'POST',
      url: '/channels',
      headers: auth(alice.token),
      payload: { contactId: bob.account.id },
    });
    const { channelId } = created.json() as { channelId: string };

    // Alone, so no claim is possible.
    expect(
      app.channels.dispatch(channelId, alice.account.id, { type: 'CLAIM_FLOOR' })
    ).toEqual({ ok: true, channel: expect.anything() });
    expect(app.channels.get(channelId)!.floor.holder).toBeNull();

    app.channels.dispatch(channelId, bob.account.id, { type: 'ENTER' });
    app.channels.dispatch(channelId, alice.account.id, { type: 'CLAIM_FLOOR' });
    expect(app.channels.get(channelId)!.floor.holder).toBe(alice.account.id);

    // Bob is silenced and cannot claim his way out of it.
    app.channels.dispatch(channelId, bob.account.id, { type: 'CLAIM_FLOOR' });
    expect(app.channels.get(channelId)!.floor.holder).toBe(alice.account.id);

    // Three minutes pass; the server releases it on tick, not the client.
    clock += 3 * 60 * 1000;
    app.channels.tick();
    expect(app.channels.get(channelId)!.floor.holder).toBeNull();

    // Alice owes the cooldown; Bob does not.
    app.channels.dispatch(channelId, alice.account.id, { type: 'CLAIM_FLOOR' });
    expect(app.channels.get(channelId)!.floor.holder).toBeNull();
    app.channels.dispatch(channelId, bob.account.id, { type: 'CLAIM_FLOOR' });
    expect(app.channels.get(channelId)!.floor.holder).toBe(bob.account.id);
  });

  it('outlives an empty channel, and records its end when the last member leaves', async () => {
    const { alice, bob } = await twoContacts();
    const created = await app.fastify.inject({
      method: 'POST',
      url: '/channels',
      headers: auth(alice.token),
      payload: { contactId: bob.account.id },
    });
    const { channelId } = created.json() as { channelId: string };

    // Empty, and no amount of ticking ends it. This used to end here.
    app.channels.dispatch(channelId, alice.account.id, { type: 'STEP_OUT' });
    clock += 60 * 60 * 1000;
    app.channels.tick();
    expect(app.channels.get(channelId)!.status).toBe('active');

    // Only membership ends it, and only the last member's.
    app.channels.dispatch(channelId, alice.account.id, { type: 'LEAVE_CHANNEL' });
    expect(app.channels.get(channelId)!.status).toBe('active');
    app.channels.dispatch(channelId, bob.account.id, { type: 'LEAVE_CHANNEL' });
    expect(app.channels.get(channelId)!.status).toBe('ended');

    const row = app.db
      .prepare('SELECT ended_at FROM channels WHERE id = ?')
      .get(channelId) as { ended_at: number };
    expect(row.ended_at).toBe(clock);
  });
});
