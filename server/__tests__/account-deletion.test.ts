import { buildApp, type App } from '../src/app';
import { ERASED_DISPLAY_NAME } from '../src/accounts';
import { MemoryMailer } from '../src/mail';
import { MemoryMediaServer } from '../src/media';
import { MemoryRecordingStore } from '../src/storage';

/**
 * Deleting your own account, from inside the application.
 *
 * Required by App Store Guideline 5.1.1(v), and the requirement is exactly the
 * shape of these tests: it has to happen here rather than by writing to a
 * support address, it has to take the personal data with it, and it must not be
 * survivable — the same address signing up again is a new person.
 *
 * The part worth testing hardest is what it does *not* take. A channel is not
 * owned by anybody, so leaving is all a departing member can do to one other
 * people are still in, and the recordings made there belong to the channel
 * rather than to whoever was in the room. Only a channel nobody else is left in
 * goes with them.
 */

let app: App;
let media: MemoryMediaServer;
let store: MemoryRecordingStore;
let clock = 1_700_000_000_000;

beforeEach(() => {
  clock = 1_700_000_000_000;
  media = new MemoryMediaServer();
  store = new MemoryRecordingStore();
  app = buildApp({
    dbPath: ':memory:',
    mailer: new MemoryMailer(),
    media,
    mediaUrl: 'wss://example.livekit.cloud',
    store,
    // Nothing uploads a stem here, so a mix has nothing to wait for: it fails
    // at once and the recording is filed unmixed, which is visible.
    mixWaitMs: 0,
    now: () => clock,
    roomCloseGraceMs: 0,
  });
});

afterEach(async () => {
  app.channels.stop();
  await app.fastify.close();
});

const auth = (token: string) => ({ authorization: `Bearer ${token}` });
const settle = () => new Promise((r) => setTimeout(r, 0));

async function signIn(identifier: string, displayName: string) {
  const code = app.accounts.issueCode(identifier, clock)!;
  const verified = await app.fastify.inject({
    method: 'POST',
    url: '/auth/verify',
    payload: { identifier, code, displayName },
  });
  return verified.json() as {
    token: string;
    account: { id: string; displayName: string };
  };
}

type User = Awaited<ReturnType<typeof signIn>>;

async function befriend(a: User, b: User, identifier: string) {
  await app.fastify.inject({
    method: 'POST',
    url: '/contacts/request',
    headers: auth(a.token),
    payload: { identifier },
  });
  await app.fastify.inject({
    method: 'POST',
    url: `/contacts/${a.account.id}/accept`,
    headers: auth(b.token),
  });
}

const remove = (user: User) =>
  app.fastify.inject({ method: 'DELETE', url: '/me', headers: auth(user.token) });

async function channelOf(owner: User, others: User[]) {
  const created = await app.fastify.inject({
    method: 'POST',
    url: '/channels',
    headers: auth(owner.token),
    payload: { contactIds: others.map((o) => o.account.id) },
  });
  const { channelId } = created.json() as { channelId: string };
  for (const other of others) {
    app.channels.dispatch(channelId, other.account.id, { type: 'ENTER' });
  }
  return channelId;
}

describe('the route', () => {
  it('refuses anyone who is not signed in', async () => {
    const response = await app.fastify.inject({ method: 'DELETE', url: '/me' });
    expect(response.statusCode).toBe(401);
  });

  it('answers 204 and leaves the token dead', async () => {
    const alice = await signIn('alice@example.com', 'Alice');
    expect((await remove(alice)).statusCode).toBe(204);

    const after = await app.fastify.inject({
      method: 'GET',
      url: '/home',
      headers: auth(alice.token),
    });
    expect(after.statusCode).toBe(401);
  });

  it('leaves no token behind', async () => {
    // Signing out is per device on purpose — a phone must not silence a tablet
    // — so it revokes one token. This is the opposite end: there is no account
    // left for any device to be signed in to. (Only one session exists at a
    // time in practice, since signing in elsewhere replaces it; the sweep for
    // all of them is what makes that an implementation detail rather than
    // something this depends on.)
    const alice = await signIn('alice@example.com', 'Alice');
    await remove(alice);

    const tokens = app.db
      .prepare('SELECT * FROM tokens WHERE account_id = ?')
      .all(alice.account.id);
    expect(tokens).toEqual([]);
  });
});

describe('what goes', () => {
  it('removes everything that described a person', async () => {
    const alice = await signIn('alice@example.com', 'Alice');
    await app.fastify.inject({
      method: 'POST',
      url: '/me',
      headers: auth(alice.token),
      payload: { im: { telegram: '@alice_here' } },
    });
    await app.fastify.inject({
      method: 'POST',
      url: '/devices',
      headers: auth(alice.token),
      payload: { token: 'device-token', platform: 'ios' },
    });

    await remove(alice);

    // The row survives — old channels hold it as a foreign key — but nothing
    // on it says who this was.
    const row = app.accounts.byId(alice.account.id);
    expect(row).toBeDefined();
    expect(row!.display_name).toBe(ERASED_DISPLAY_NAME);
    expect(row!.im_telegram).toBeNull();
    expect(row!.identifier).not.toContain('alice@example.com');
    expect(app.accounts.byIdentifier('alice@example.com')).toBeUndefined();

    const devices = app.db
      .prepare('SELECT * FROM device_tokens WHERE account_id = ?')
      .all(alice.account.id);
    expect(devices).toEqual([]);
  });

  it('takes the contacts with it, in both directions', async () => {
    const alice = await signIn('alice@example.com', 'Alice');
    const bob = await signIn('bob@example.com', 'Bob');
    await befriend(alice, bob, 'bob@example.com');
    expect(app.accounts.areContacts(alice.account.id, bob.account.id)).toBe(true);

    await remove(alice);

    expect(app.accounts.areContacts(alice.account.id, bob.account.id)).toBe(false);
    expect(app.accounts.contactsFor(bob.account.id)).toEqual([]);
  });

  it('takes invitations sent to an address that never signed up', async () => {
    const alice = await signIn('alice@example.com', 'Alice');
    await app.fastify.inject({
      method: 'POST',
      url: '/contacts/request',
      headers: auth(alice.token),
      payload: { identifier: 'nobody@example.com' },
    });

    await remove(alice);

    // Otherwise the address signing up months later meets a request from
    // somebody who no longer exists.
    const invites = app.db.prepare('SELECT * FROM pending_invites').all();
    expect(invites).toEqual([]);
  });

  it('takes invitations somebody else sent to *its* address', async () => {
    const bob = await signIn('bob@example.com', 'Bob');
    const alice = await signIn('alice@example.com', 'Alice');
    // Withdrawn to a pending invite by alice going: bob's request was resolved
    // into a contacts row at her sign-in, so this is the other half — a fresh
    // request to the address she is about to give up.
    await remove(alice);
    await app.fastify.inject({
      method: 'POST',
      url: '/contacts/request',
      headers: auth(bob.token),
      payload: { identifier: 'alice@example.com' },
    });

    // She signs up again, and finds bob waiting — because this is a new person
    // at that address, which is what the invite was for.
    const again = await signIn('alice@example.com', 'Alice');
    expect(again.account.id).not.toBe(alice.account.id);
    expect(app.accounts.contactsFor(again.account.id)).toHaveLength(1);
  });

  it('unlinks a donation rather than deleting it', async () => {
    const alice = await signIn('alice@example.com', 'Alice');
    app.db
      .prepare(
        `INSERT INTO donations (kofi_transaction_id, account_id, matched_by,
           email, amount_cents, currency, kind, is_recurring, is_public,
           received_at)
         VALUES ('txn_0001', ?, 'email', 'alice@example.com', 500, 'USD',
           'Donation', 0, 1, ?)`
      )
      .run(alice.account.id, clock);

    await remove(alice);

    // Money that changed hands, and Ko-fi holds the authoritative record
    // either way. What goes is the link to a person, and the claim to have
    // matched one.
    const row = app.db
      .prepare('SELECT account_id, matched_by, amount_cents FROM donations')
      .get() as {
      account_id: string | null;
      matched_by: string | null;
      amount_cents: number;
    };
    expect(row.amount_cents).toBe(500);
    expect(row.account_id).toBeNull();
    expect(row.matched_by).toBeNull();
  });
});

describe('signing up again', () => {
  it('is a new person at the same address', async () => {
    const alice = await signIn('alice@example.com', 'Alice');
    const bob = await signIn('bob@example.com', 'Bob');
    await befriend(alice, bob, 'bob@example.com');

    await remove(alice);
    const again = await signIn('alice@example.com', 'Alice');

    expect(again.account.id).not.toBe(alice.account.id);
    // And walks back into nothing: no contacts, and no way to the old id.
    expect(app.accounts.contactsFor(again.account.id)).toEqual([]);
  });
});

describe('what happens to channels', () => {
  it('leaves the ones other people are in, and they carry on', async () => {
    const alice = await signIn('alice@example.com', 'Alice');
    const bob = await signIn('bob@example.com', 'Bob');
    await befriend(alice, bob, 'bob@example.com');
    const channelId = await channelOf(alice, [bob]);

    await remove(alice);

    const channel = app.channels.get(channelId)!;
    expect(channel.status).toBe('active');
    expect(channel.participants).toEqual([bob.account.id]);
    expect(channel.present).not.toContain(alice.account.id);
    expect(
      app.channels.rejoinableFor(bob.account.id).map((c) => c.channelId)
    ).toContain(channelId);
  });

  it('deletes the ones nobody else is left in, with their recordings', async () => {
    const alice = await signIn('alice@example.com', 'Alice');
    const bob = await signIn('bob@example.com', 'Bob');
    await befriend(alice, bob, 'bob@example.com');
    // A channel is never created alone — it becomes one when everybody else
    // walks out, which is the only way to be its last member.
    const channelId = await channelOf(alice, [bob]);
    app.channels.dispatch(channelId, bob.account.id, { type: 'LEAVE_CHANNEL' });
    app.channels.dispatch(channelId, alice.account.id, { type: 'ENTER' });
    app.channels.dispatch(channelId, alice.account.id, {
      type: 'START_RECORDING',
    });
    await settle();
    clock += 30_000;
    app.channels.dispatch(channelId, alice.account.id, {
      type: 'STOP_RECORDING',
    });
    await settle();
    // A recording is shown to nobody until its mix has resolved one way or
    // the other.
    await app.channels.mixesSettled();
    expect(app.channels.recordingsFor(alice.account.id)).toHaveLength(1);

    await remove(alice);
    await settle();

    expect(app.channels.get(channelId)!.status).toBe('ended');
    // Marked rather than gone: the sweep takes both a week later, which is what
    // keeps the foreign key pointing at something for the whole of it.
    const recordings = app.db
      .prepare('SELECT deleted_at FROM recordings WHERE channel_id = ?')
      .all(channelId) as unknown as Array<{ deleted_at: number | null }>;
    expect(recordings).toHaveLength(1);
    expect(recordings[0].deleted_at).toBe(clock);
  });

  it('leaves a shared channel’s recordings with the people still in it', async () => {
    const alice = await signIn('alice@example.com', 'Alice');
    const bob = await signIn('bob@example.com', 'Bob');
    await befriend(alice, bob, 'bob@example.com');
    const channelId = await channelOf(alice, [bob]);
    app.channels.dispatch(channelId, alice.account.id, {
      type: 'START_RECORDING',
    });
    await settle();
    clock += 30_000;
    app.channels.dispatch(channelId, alice.account.id, {
      type: 'STOP_RECORDING',
    });
    await settle();
    // A recording is shown to nobody until its mix has resolved one way or
    // the other.
    await app.channels.mixesSettled();

    await remove(alice);

    // Bob's copy of a conversation bob was in. It is not alice's to withdraw,
    // any more than the channel was.
    const [recording] = app.channels.recordingsFor(bob.account.id);
    expect(recording).toBeDefined();
    expect(recording.deleted_at).toBeNull();
  });

  it('does not stop a recording the people left behind are still in', async () => {
    // A run belongs to the channel, like everything else here, and the person
    // who started it leaving is not the room emptying. Bob is still there and
    // still being recorded; it is presence that ends a run, which is the rule
    // the next test relies on from the other side.
    const alice = await signIn('alice@example.com', 'Alice');
    const bob = await signIn('bob@example.com', 'Bob');
    await befriend(alice, bob, 'bob@example.com');
    const channelId = await channelOf(alice, [bob]);
    app.channels.dispatch(channelId, alice.account.id, {
      type: 'START_RECORDING',
    });
    await settle();
    clock += 10_000;

    await remove(alice);
    await settle();

    expect(app.channels.get(channelId)!.recording.status).toBe('recording');
  });

  it('ends a run in a channel it is deleting', async () => {
    const alice = await signIn('alice@example.com', 'Alice');
    const bob = await signIn('bob@example.com', 'Bob');
    await befriend(alice, bob, 'bob@example.com');
    const channelId = await channelOf(alice, [bob]);
    app.channels.dispatch(channelId, bob.account.id, { type: 'LEAVE_CHANNEL' });
    app.channels.dispatch(channelId, alice.account.id, { type: 'ENTER' });
    app.channels.dispatch(channelId, alice.account.id, {
      type: 'START_RECORDING',
    });
    await settle();
    clock += 10_000;

    await remove(alice);
    await settle();

    // Leaving goes through the same path a tap takes, which is what settles the
    // ordering: the run ends before the channel does, rather than being
    // stranded mid-capture in a room that no longer exists.
    const channel = app.channels.get(channelId)!;
    expect(channel.recording.status).toBe('idle');
    expect(channel.status).toBe('ended');
  });

  it('releases the floor on the way out', async () => {
    const alice = await signIn('alice@example.com', 'Alice');
    const bob = await signIn('bob@example.com', 'Bob');
    await befriend(alice, bob, 'bob@example.com');
    const channelId = await channelOf(alice, [bob]);
    app.channels.dispatch(channelId, alice.account.id, { type: 'CLAIM_FLOOR' });
    expect(app.channels.get(channelId)!.floor.holder).toBe(alice.account.id);

    await remove(alice);

    expect(app.channels.get(channelId)!.floor.holder).toBeNull();
  });

  it('takes somebody out of a channel they were asked into and never entered', async () => {
    // An invitation is membership now, whatever the channel is called, so it is
    // reached by the ordinary departure rather than needing a withdrawal of its
    // own. It used to need one: an unnamed channel's invitation was not
    // membership, and an unanswered one to somebody who no longer existed sat
    // on the channel for ever.
    const alice = await signIn('alice@example.com', 'Alice');
    const bob = await signIn('bob@example.com', 'Bob');
    const carol = await signIn('carol@example.com', 'Carol');
    await befriend(alice, bob, 'bob@example.com');
    await befriend(bob, carol, 'carol@example.com');
    const channelId = await channelOf(bob, [carol]);
    app.channels.dispatch(channelId, bob.account.id, {
      type: 'INVITE',
      contactId: alice.account.id,
    } as never);
    const channel = app.channels.get(channelId)!;
    expect(channel.participants).toContain(alice.account.id);
    expect(channel.everPresent).not.toContain(alice.account.id);

    await remove(alice);

    const after = app.channels.get(channelId)!;
    expect(after.participants).not.toContain(alice.account.id);
    expect(after.status).toBe('active');
  });
});
