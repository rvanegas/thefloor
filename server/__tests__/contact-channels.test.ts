import { buildApp, type App } from '../src/app';
import { MemoryMailer } from '../src/mail';

/**
 * A contact *is* a channel now.
 *
 * Home lists channels and nothing else, so the pair have to have one from the
 * moment they become contacts — otherwise accepting a request adds a person to
 * a screen with nowhere to put them. And when the contact ends, the channels
 * that existed only because of it end with it, which is the harder half: which
 * channels those are, and what the other person is left holding.
 */

let app: App;
let clock = 1_700_000_000_000;

beforeEach(() => {
  clock = 1_700_000_000_000;
  app = buildApp({
    dbPath: ':memory:',
    mailer: new MemoryMailer(),
    now: () => clock,
  });
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
  return verified.json() as {
    token: string;
    account: { id: string; displayName: string };
  };
}

type User = Awaited<ReturnType<typeof signIn>>;

/** `a` asks, `b` accepts — the ordinary direction. */
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

const rejoinable = (user: User) =>
  app.channels.rejoinableFor(user.account.id).map((entry) => entry.channelId);

const invites = (user: User) =>
  app.channels.invitesFor(user.account.id).map((entry) => entry.channelId);

/** The channel holding exactly these two, read from `a`'s own home list. */
function pairChannel(a: User, b: User): string | undefined {
  return app.channels
    .rejoinableFor(a.account.id)
    .find(
      (entry) =>
        entry.others.length === 1 && entry.others[0].id === b.account.id
    )?.channelId;
}

describe('becoming contacts', () => {
  it('opens the one channel the pair will talk in', async () => {
    const alice = await signIn('alice@example.com', 'Alice');
    const bob = await signIn('bob@example.com', 'Bob');
    await befriend(alice, bob, 'bob@example.com');

    const id = pairChannel(alice, bob);
    expect(id).toBeDefined();
    const channel = app.channels.get(id!)!;
    // Unnamed, so it is the channel `create` would have found, and nobody in
    // it: this is a place, not a summons.
    expect(channel.name).toBeNull();
    expect(channel.present).toEqual([]);
    expect(channel.everPresent).toEqual([]);
  });

  /**
   * The two lists read one rule from opposite ends. A standing channel is not
   * an invitation — nobody asked anybody anywhere — so it must be in the other
   * list, for both of them, or it is on nobody's screen at all.
   */
  it('is on both their home screens, and is nobody’s invitation', async () => {
    const alice = await signIn('alice@example.com', 'Alice');
    const bob = await signIn('bob@example.com', 'Bob');
    await befriend(alice, bob, 'bob@example.com');
    const id = pairChannel(alice, bob)!;

    expect(rejoinable(alice)).toContain(id);
    expect(rejoinable(bob)).toContain(id);
    expect(invites(alice)).toEqual([]);
    expect(invites(bob)).toEqual([]);
  });

  it('says nobody has used it, so Home need not invent a last visit', async () => {
    const alice = await signIn('alice@example.com', 'Alice');
    const bob = await signIn('bob@example.com', 'Bob');
    await befriend(alice, bob, 'bob@example.com');

    const [view] = app.channels.rejoinableFor(alice.account.id);
    expect(view.everUsed).toBe(false);
    // The stamp is there and is the moment it was made — which is exactly why
    // `everUsed` has to be, or the card would report that as a visit.
    expect(view.lastPresenceAt).toBe(clock);
  });

  it('makes no second channel when one of them starts one', async () => {
    const alice = await signIn('alice@example.com', 'Alice');
    const bob = await signIn('bob@example.com', 'Bob');
    await befriend(alice, bob, 'bob@example.com');
    const standing = pairChannel(alice, bob)!;

    const created = app.channels.create(alice.account.id, [bob.account.id]);
    expect(created.ok).toBe(true);
    expect(created.ok && created.channel.id).toBe(standing);
  });

  it('opens one when the requests crossed instead', async () => {
    // Bob asks after Alice has, which accepts hers rather than making a second
    // request — the same pair of contacts by a different route, and it owes
    // them the same channel.
    const alice = await signIn('alice@example.com', 'Alice');
    const bob = await signIn('bob@example.com', 'Bob');
    await app.fastify.inject({
      method: 'POST',
      url: '/contacts/request',
      headers: auth(alice.token),
      payload: { identifier: 'bob@example.com' },
    });
    const crossed = await app.fastify.inject({
      method: 'POST',
      url: '/contacts/request',
      headers: auth(bob.token),
      payload: { identifier: 'alice@example.com' },
    });
    expect((crossed.json() as { accepted: boolean }).accepted).toBe(true);
    expect(pairChannel(alice, bob)).toBeDefined();
  });

  it('leaves the pair already holding one alone', async () => {
    const alice = await signIn('alice@example.com', 'Alice');
    const bob = await signIn('bob@example.com', 'Bob');
    await befriend(alice, bob, 'bob@example.com');
    const before = pairChannel(alice, bob);

    // The pass every boot runs. A second one must create nothing, which is the
    // only honest check that the first was idempotent.
    expect(app.channels.backfillPairChannels(app.accounts.acceptedPairs())).toBe(0);
    expect(pairChannel(alice, bob)).toBe(before);
  });
});

describe('removing a contact', () => {
  const remove = (user: User, otherId: string) =>
    app.fastify.inject({
      method: 'DELETE',
      url: `/contacts/${otherId}`,
      headers: auth(user.token),
    });

  it('ends it for both of them, the row being the pair', async () => {
    const alice = await signIn('alice@example.com', 'Alice');
    const bob = await signIn('bob@example.com', 'Bob');
    await befriend(alice, bob, 'bob@example.com');

    expect((await remove(alice, bob.account.id)).statusCode).toBe(200);
    expect(app.accounts.areContacts(alice.account.id, bob.account.id)).toBe(false);
    expect(app.accounts.contactsFor(bob.account.id)).toEqual([]);
  });

  it('takes the channel that held only the two of them', async () => {
    const alice = await signIn('alice@example.com', 'Alice');
    const bob = await signIn('bob@example.com', 'Bob');
    await befriend(alice, bob, 'bob@example.com');
    const id = pairChannel(alice, bob)!;

    await remove(alice, bob.account.id);

    // Nothing was ever recorded in it, so it goes for both rather than leaving
    // Bob a member-of-one channel named after nobody.
    expect(app.channels.get(id)?.status ?? 'gone').not.toBe('active');
    expect(rejoinable(bob)).not.toContain(id);
  });

  it('takes a named two-person channel as well', async () => {
    // A name distinguishes two channels holding the same people. It does not
    // make one of them about somebody else.
    const alice = await signIn('alice@example.com', 'Alice');
    const bob = await signIn('bob@example.com', 'Bob');
    await befriend(alice, bob, 'bob@example.com');
    const standing = pairChannel(alice, bob)!;
    app.channels.dispatch(standing, alice.account.id, {
      type: 'SET_NAME',
      name: 'Weekly Convo',
    } as never);
    expect(app.channels.get(standing)!.name).toBe('Weekly Convo');

    await remove(alice, bob.account.id);
    expect(app.channels.get(standing)?.status ?? 'gone').not.toBe('active');
  });

  it('leaves a channel with somebody else in it exactly as it was', async () => {
    const alice = await signIn('alice@example.com', 'Alice');
    const bob = await signIn('bob@example.com', 'Bob');
    const carol = await signIn('carol@example.com', 'Carol');
    await befriend(alice, bob, 'bob@example.com');
    await befriend(alice, carol, 'carol@example.com');
    const created = app.channels.create(alice.account.id, [
      bob.account.id,
      carol.account.id,
    ]);
    const trio = created.ok ? created.channel.id : '';

    await remove(alice, bob.account.id);

    const channel = app.channels.get(trio)!;
    expect(channel.status).toBe('active');
    expect(channel.participants).toContain(alice.account.id);
    expect(channel.participants).toContain(bob.account.id);
  });

  it('leaves the other person a channel that holds a recording', async () => {
    // Their audio as much as yours, and a channel is what names a recording
    // and holds it. Ending this one would delete somebody else's tape as a
    // side effect of a tap about a contact.
    const alice = await signIn('alice@example.com', 'Alice');
    const bob = await signIn('bob@example.com', 'Bob');
    await befriend(alice, bob, 'bob@example.com');
    const id = pairChannel(alice, bob)!;
    app.db
      .prepare(
        `INSERT INTO recordings
           (id, channel_id, initiator_id, invitee_id, participants,
            started_at, duration_ms, s3_key, ended_at, mix_state)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'ready')`
      )
      .run(
        'rec_kept',
        id,
        alice.account.id,
        bob.account.id,
        JSON.stringify([alice.account.id, bob.account.id]),
        clock,
        1_000,
        'recordings/rec_kept',
        clock + 1_000
      );

    await remove(alice, bob.account.id);

    const channel = app.channels.get(id)!;
    expect(channel.status).toBe('active');
    expect(channel.participants).toEqual([bob.account.id]);
    expect(rejoinable(alice)).not.toContain(id);
  });

  it('refuses somebody who is not a contact', async () => {
    const alice = await signIn('alice@example.com', 'Alice');
    const mallory = await signIn('mallory@example.com', 'Mallory');
    expect((await remove(alice, mallory.account.id)).statusCode).toBe(400);
  });
});

/**
 * What a contact row measures, which used to be app-open and is now also
 * where they have been.
 *
 * `lastSeenAt` moves on every socket message, so somebody who launched the app
 * and read nothing looked exactly like somebody who had spent an hour talking.
 * `lastInChannelAt` is the other question, and it is scoped: only channels the
 * reader themselves belongs to are looked in, which is what makes it something
 * the reader is entitled to know.
 */
describe('when a contact was last in one of your channels', () => {
  const contactsOf = async (user: User) => {
    const home = await app.fastify.inject({
      method: 'GET',
      url: '/home',
      headers: auth(user.token),
    });
    return (home.json() as {
      contacts: Array<{
        account: { id: string; displayName: string };
        status: string;
        lastInChannelAt?: number | null;
      }>;
    }).contacts;
  };

  it('carries the moment they were last in a channel you share', async () => {
    const alice = await signIn('alice@example.com', 'Alice');
    const bob = await signIn('bob@example.com', 'Bob');
    await befriend(alice, bob, 'bob@example.com');
    const id = pairChannel(alice, bob)!;

    clock += 60_000;
    app.channels.dispatch(id, bob.account.id, { type: 'ENTER' });
    const entered = clock;
    clock += 60_000;
    app.channels.dispatch(id, bob.account.id, { type: 'STEP_OUT' });

    const [contact] = await contactsOf(alice);
    expect(contact.account.id).toBe(bob.account.id);
    // The exit, not the entry: `stepOut` re-stamps because a departure they
    // chose is a moment they were still there.
    expect(contact.lastInChannelAt).toBe(clock);
    expect(contact.lastInChannelAt).toBeGreaterThan(entered);
  });

  it('is null when the channel you share has been entered by nobody', async () => {
    const alice = await signIn('alice@example.com', 'Alice');
    const bob = await signIn('bob@example.com', 'Bob');
    await befriend(alice, bob, 'bob@example.com');

    const [contact] = await contactsOf(alice);
    // Null rather than absent, and rather than the moment the standing channel
    // was made — which is not a visit, and is exactly the lie `everUsed` exists
    // to stop the channel row telling.
    expect(contact.lastInChannelAt).toBeNull();
  });

  it('does not report presence in a channel you are not in', async () => {
    // The scoping rule, which is the privacy claim. Bob and Cara talk; Alice
    // is Bob's contact and is not in that room, and must learn nothing from it.
    const alice = await signIn('alice@example.com', 'Alice');
    const bob = await signIn('bob@example.com', 'Bob');
    const cara = await signIn('cara@example.com', 'Cara');
    await befriend(alice, bob, 'bob@example.com');
    await befriend(bob, cara, 'cara@example.com');

    const theirs = app.channels.create(bob.account.id, [cara.account.id]);
    expect(theirs.ok).toBe(true);
    const theirId = theirs.ok ? theirs.channel.id : '';
    clock += 60_000;
    app.channels.dispatch(theirId, bob.account.id, { type: 'ENTER' });
    // Bob really is somewhere, which is what stops this passing for the wrong
    // reason: the assertion below is about scoping, not about an empty app.
    // `create` already put him in it, so the stamp is the moment it was made
    // rather than the moment of the redundant ENTER above.
    expect(
      app.channels.get(theirId)!.lastPresentAt[bob.account.id]
    ).toBeGreaterThan(0);
    expect(app.channels.get(theirId)!.present).toContain(bob.account.id);

    const [contact] = await contactsOf(alice);
    expect(contact.account.id).toBe(bob.account.id);
    expect(contact.lastInChannelAt).toBeNull();
  });

  it('does not report the reader’s own presence back to them', async () => {
    // Alice sits in the shared channel alone. That is her own visit, and it
    // says nothing whatever about Bob.
    const alice = await signIn('alice@example.com', 'Alice');
    const bob = await signIn('bob@example.com', 'Bob');
    await befriend(alice, bob, 'bob@example.com');
    const id = pairChannel(alice, bob)!;

    clock += 60_000;
    app.channels.dispatch(id, alice.account.id, { type: 'ENTER' });

    const [contact] = await contactsOf(alice);
    expect(contact.lastInChannelAt).toBeNull();
  });

  it('is withheld from an outgoing request, as the name and the time are', async () => {
    // That row is an address rather than a person, and whether anybody has
    // been anywhere behind it is precisely what must not be revealed. Absent,
    // not null: the same shape `inApp` takes.
    const alice = await signIn('alice@example.com', 'Alice');
    await signIn('bob@example.com', 'Bob');
    await app.fastify.inject({
      method: 'POST',
      url: '/contacts/request',
      headers: auth(alice.token),
      payload: { identifier: 'bob@example.com' },
    });

    const [contact] = await contactsOf(alice);
    expect(contact.status).toBe('outgoing');
    expect(contact.lastInChannelAt).toBeUndefined();
  });
});

/**
 * The other half of the same complaint, on the channel rather than the person.
 */
describe('when anybody else was last in a channel', () => {
  it('a channel row carries it and an invitation does not', async () => {
    const alice = await signIn('alice@example.com', 'Alice');
    const bob = await signIn('bob@example.com', 'Bob');
    await befriend(alice, bob, 'bob@example.com');
    const id = pairChannel(alice, bob)!;

    clock += 60_000;
    app.channels.dispatch(id, bob.account.id, { type: 'ENTER' });
    clock += 60_000;
    app.channels.dispatch(id, bob.account.id, { type: 'STEP_OUT' });
    const left = clock;
    // And Alice sits in it alone afterwards, which must not move the number.
    clock += 3_600_000;
    app.channels.dispatch(id, alice.account.id, { type: 'ENTER' });

    const [view] = app.channels
      .rejoinableFor(alice.account.id)
      .filter((entry) => entry.channelId === id);
    expect(view.lastPresenceAt).toBe(clock);
    expect(view.lastPresenceByOthers).toBe(left);

    // An invitation is a channel you have never been in, so its own
    // `lastPresenceAt` is already about other people and there is no second
    // number to send.
    const cara = await signIn('cara@example.com', 'Cara');
    await befriend(alice, cara, 'cara@example.com');
    const made = app.channels.create(alice.account.id, [cara.account.id]);
    expect(made.ok).toBe(true);
    const madeId = made.ok ? made.channel.id : '';
    app.channels.dispatch(madeId, alice.account.id, { type: 'ENTER' });
    const [invite] = app.channels
      .invitesFor(cara.account.id)
      .filter((entry) => entry.channelId === madeId);
    expect(invite).toBeDefined();
    expect(
      (invite as unknown as Record<string, unknown>).lastPresenceByOthers
    ).toBeUndefined();
  });

  it('is null for a channel only you have ever been in', async () => {
    const alice = await signIn('alice@example.com', 'Alice');
    const bob = await signIn('bob@example.com', 'Bob');
    await befriend(alice, bob, 'bob@example.com');
    const id = pairChannel(alice, bob)!;

    clock += 60_000;
    app.channels.dispatch(id, alice.account.id, { type: 'ENTER' });

    const [view] = app.channels
      .rejoinableFor(alice.account.id)
      .filter((entry) => entry.channelId === id);
    // The room has a number and nobody else does — the asymmetry the client
    // draws as "nobody else yet" beside the room's own interval.
    expect(view.lastPresenceAt).toBe(clock);
    expect(view.lastPresenceByOthers).toBeNull();
  });
});
