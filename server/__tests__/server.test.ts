import { buildApp, type App } from '../src/app';
import { MemoryMailer } from '../src/mail';

/**
 * These cover what the server adds over the mock: authentication, the
 * authorization boundary, and enforcement that no client can act as the other
 * party. The floor rules themselves are core's tests, not these.
 */

let app: App;
let mailer: MemoryMailer;
let clock = 1_700_000_000_000;

beforeEach(() => {
  clock = 1_700_000_000_000;
  // A mailer is not optional here the way it once was: since 2026-08-15 a
  // request to an address with no account is refused unless the invitation can
  // actually be sent, so a mailer-less app cannot reach half of these tests.
  mailer = new MemoryMailer();
  app = buildApp({ dbPath: ':memory:', mailer, now: () => clock });
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
  const alice = await signIn('user1@example.com', 'Alice');
  const bob = await signIn('user2@example.com', 'Bob');

  await app.fastify.inject({
    method: 'POST',
    url: '/contacts/request',
    headers: auth(alice.token),
    payload: { identifier: 'user2@example.com' },
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
    const first = await signIn('user9@example.com', 'New Person');
    expect(first.token).toBeTruthy();
    expect(first.account.displayName).toBe('New Person');

    const second = await signIn('user9@example.com');
    expect(second.account.id).toBe(first.account.id);
    expect(second.token).not.toBe(first.token);
  });

  it('renames an existing account when a name is given', async () => {
    // Signing out and back in is the only way to fix a name, so a name given
    // at sign-in has to apply to an account that already exists.
    const first = await signIn('user7@example.com', 'B');
    expect(first.account.displayName).toBe('B');

    const second = await signIn('user7@example.com', 'Bob');
    expect(second.account.id).toBe(first.account.id);
    expect(second.account.displayName).toBe('Bob');
  });

  it('keeps the current name when none is given', async () => {
    const first = await signIn('user8@example.com', 'Priya');
    const second = await signIn('user8@example.com');
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
      {
        account: { id: alice.account.id, displayName: 'Alice' },
        status: 'incoming',
        // Null because being in the app is holding a socket, and Alice has
        // only ever signed in over HTTP here.
        lastSeenAt: null,
      },
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
    const code = app.accounts.issueCode('user1@example.com', clock)!;
    // Derived from the real code so it is guaranteed to differ.
    const wrong = code === '000000' ? '000001' : '000000';

    const response = await app.fastify.inject({
      method: 'POST',
      url: '/auth/verify',
      payload: { identifier: 'user1@example.com', code: wrong },
    });
    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({ error: 'Invalid or expired code.' });
  });

  it('expires a code after ten minutes', async () => {
    const code = app.accounts.issueCode('user3@example.com', clock)!;
    clock += 10 * 60 * 1000 + 1;
    const response = await app.fastify.inject({
      method: 'POST',
      url: '/auth/verify',
      payload: { identifier: 'user3@example.com', code },
    });
    expect(response.statusCode).toBe(401);
  });

  it('stops accepting attempts after five failures', async () => {
    const code = app.accounts.issueCode('user4@example.com', clock)!;
    const wrong = code === '111111' ? '222222' : '111111';

    for (let i = 0; i < 5; i++) {
      await app.fastify.inject({
        method: 'POST',
        url: '/auth/verify',
        payload: { identifier: 'user4@example.com', code: wrong },
      });
    }
    // Even the correct code is refused now.
    const response = await app.fastify.inject({
      method: 'POST',
      url: '/auth/verify',
      payload: { identifier: 'user4@example.com', code },
    });
    expect(response.statusCode).toBe(401);
  });

  it('stores neither codes nor tokens in the clear', async () => {
    const { token, code } = await signIn('user5@example.com');
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
    const { token } = await signIn('user6@example.com');
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
    const alice = await signIn('user1@example.com', 'Alice');
    const bob = await signIn('user2@example.com', 'Bob');

    await app.fastify.inject({
      method: 'POST',
      url: '/contacts/request',
      headers: auth(alice.token),
      payload: { identifier: 'user2@example.com' },
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
    const alice = await signIn('user1@example.com', 'Alice');
    const bob = await signIn('user2@example.com', 'Bob');
    await app.fastify.inject({
      method: 'POST',
      url: '/contacts/request',
      headers: auth(alice.token),
      payload: { identifier: 'user2@example.com' },
    });

    const response = await app.fastify.inject({
      method: 'POST',
      url: `/contacts/${bob.account.id}/accept`,
      headers: auth(alice.token),
    });
    expect(response.statusCode).toBe(400);
  });

  it('shows the two pending directions from each side', async () => {
    const alice = await signIn('user1@example.com', 'Alice');
    await signIn('user2@example.com', 'Bob');
    await app.fastify.inject({
      method: 'POST',
      url: '/contacts/request',
      headers: auth(alice.token),
      payload: { identifier: 'user2@example.com' },
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
    const alice = await signIn('user1@example.com', 'Alice');

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

  /**
   * A request to an address with no account is stored under that address as a
   * primary key and nothing ever sweeps the table, so an identifier that could
   * not name a person is a row that is both permanent and unreachable.
   */
  it('refuses a request to something that is not an address', async () => {
    const alice = await signIn('user1@example.com', 'Alice');

    for (const identifier of ['bob', '   ', 'not an address', 'x'.repeat(300)]) {
      const refused = await app.fastify.inject({
        method: 'POST',
        url: '/contacts/request',
        headers: auth(alice.token),
        payload: { identifier },
      });
      expect(refused.statusCode).toBe(400);
    }

    expect(app.accounts.contactsFor(alice.account.id)).toHaveLength(0);
  });

  /**
   * A phone number used to be accepted here, on the reasoning that sign-in
   * being email-only should not decide against SMS from the one place with no
   * stake in it. Narrowed on 2026-08-15: an invitation is now an email rather
   * than a row, so an address this server cannot send to is a request its
   * recipient never hears about. `isPhoneNumber` survives, unreachable, for the
   * day there is an SMS transport — see mail.ts.
   */
  it('refuses a request to a phone number', async () => {
    const alice = await signIn('user1@example.com', 'Alice');

    const refused = await app.fastify.inject({
      method: 'POST',
      url: '/contacts/request',
      headers: auth(alice.token),
      payload: { identifier: '+15550000009' },
    });
    expect(refused.statusCode).toBe(400);
    expect(app.accounts.contactsFor(alice.account.id)).toHaveLength(0);
  });

  /**
   * Withdrawal is deliberately not validated the same way. Rows predating the
   * check hold identifiers that would not pass it, and withdrawing is the only
   * thing that can remove one — so validating here would make exactly those
   * rows permanent, which is the problem rather than the fix.
   */
  it('still withdraws an invite whose identifier would now be refused', async () => {
    const alice = await signIn('user1@example.com', 'Alice');

    app.db
      .prepare(
        'INSERT INTO pending_invites (requester_id, identifier, created_at) VALUES (?, ?, ?)'
      )
      .run(alice.account.id, 'bob', 0);
    expect(app.accounts.contactsFor(alice.account.id)).toHaveLength(1);

    const withdrawn = await app.fastify.inject({
      method: 'POST',
      url: '/contacts/withdraw',
      headers: auth(alice.token),
      payload: { identifier: 'bob' },
    });
    expect(withdrawn.statusCode).toBe(200);
    expect(app.accounts.contactsFor(alice.account.id)).toHaveLength(0);
  });

  it('withdraws a pending request to a real account, and only its own', async () => {
    const alice = await signIn('user1@example.com', 'Alice');
    const bob = await signIn('user2@example.com', 'Bob');

    await app.fastify.inject({
      method: 'POST',
      url: '/contacts/request',
      headers: auth(alice.token),
      payload: { identifier: 'user2@example.com' },
    });

    // The recipient cannot withdraw what they did not send — declining is
    // their move, and it is a different endpoint.
    const notYours = await app.fastify.inject({
      method: 'POST',
      url: '/contacts/withdraw',
      headers: auth(bob.token),
      payload: { identifier: 'user1@example.com' },
    });
    expect(notYours.statusCode).toBe(400);
    expect(app.accounts.contactState(alice.account.id, bob.account.id)).not.toBeNull();

    const withdrawn = await app.fastify.inject({
      method: 'POST',
      url: '/contacts/withdraw',
      headers: auth(alice.token),
      payload: { identifier: 'user2@example.com' },
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
      payload: { identifier: 'user2@example.com' },
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
    const { token } = await signIn('user1@example.com', 'Alice');
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
    const alice = await signIn('user1@example.com', 'Alice');
    const bob = await signIn('user2@example.com', 'Bob');
    await app.fastify.inject({
      method: 'POST',
      url: '/contacts/request',
      headers: auth(alice.token),
      payload: { identifier: 'user2@example.com' },
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
    const outsider = await signIn('user99@example.com', 'Outsider');
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

    // Only membership ends it, and only by its last member deleting it —
    // leaving is refused to them, that tap being the one that destroys the
    // channel and everything recorded in it.
    app.channels.dispatch(channelId, alice.account.id, { type: 'LEAVE_CHANNEL' });
    expect(app.channels.get(channelId)!.status).toBe('active');
    app.channels.dispatch(channelId, bob.account.id, { type: 'LEAVE_CHANNEL' });
    expect(app.channels.get(channelId)!.status).toBe('active');
    app.channels.dispatch(channelId, bob.account.id, { type: 'DELETE_CHANNEL' });
    expect(app.channels.get(channelId)!.status).toBe('ended');

    const row = app.db
      .prepare('SELECT ended_at FROM channels WHERE id = ?')
      .get(channelId) as { ended_at: number };
    expect(row.ended_at).toBe(clock);
  });
});
