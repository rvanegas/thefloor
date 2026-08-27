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

/**
 * The other half of what a channel row carries, and the half that is not a
 * measure at all.
 *
 * `lastPresenceByOthers` above leaves the reader out on purpose, so nothing in
 * it can ever report the reader's own visit — which is right for ordering and
 * useless for the question "have I already been in here?". Presence is
 * exclusive (`stepOutOfOthers`), so somebody knocking on three doors in turn is
 * removed from the first two by the act of trying the third, and without this
 * there is nothing left on any of those rows that remembers they came.
 */
describe('whether you have just stepped into a channel', () => {
  it('marks the channel for whoever stepped in, and nobody else', async () => {
    const alice = await signIn('alice@example.com', 'Alice');
    const bob = await signIn('bob@example.com', 'Bob');
    await befriend(alice, bob, 'bob@example.com');
    const id = pairChannel(alice, bob)!;

    // Bob goes first and leaves, which is only to put him in `everPresent` —
    // a channel he has never entered is an *invitation* to him rather than a
    // row, and `invitesFor` sends neither of these fields.
    clock += 60_000;
    app.channels.dispatch(id, bob.account.id, { type: 'ENTER' });
    clock += 60_000;
    app.channels.dispatch(id, bob.account.id, { type: 'STEP_OUT' });

    clock += 10 * 60_000;
    app.channels.dispatch(id, alice.account.id, { type: 'ENTER' });
    const arrived = clock;

    const mine = app.channels
      .rejoinableFor(alice.account.id)
      .find((entry) => entry.channelId === id)!;
    expect(mine.steppedInAt).toBe(arrived);

    // Bob did not step in. He needs no mark, and Alice's arrival is already in
    // the number his row reads.
    const theirs = app.channels
      .rejoinableFor(bob.account.id)
      .find((entry) => entry.channelId === id)!;
    expect(theirs.steppedInAt).toBeNull();
    expect(theirs.lastPresenceByOthers).toBe(arrived);
  });

  it('marks a step-in that rang nobody at all', async () => {
    // **The act, not the notification**, which an earlier draft got wrong by
    // recording the announcement instead. Here Bob is already in the room, so
    // `announceActive` never fires — the transition is not empty-to-occupied —
    // and there is nobody absent to tell in any case. Alice still stepped in,
    // and her row still has to remember it once the room empties out again.
    const alice = await signIn('alice@example.com', 'Alice');
    const bob = await signIn('bob@example.com', 'Bob');
    await befriend(alice, bob, 'bob@example.com');
    const id = pairChannel(alice, bob)!;

    clock += 60_000;
    app.channels.dispatch(id, bob.account.id, { type: 'ENTER' });
    clock += 60_000;
    app.channels.dispatch(id, alice.account.id, { type: 'ENTER' });
    const arrived = clock;
    clock += 60_000;
    app.channels.dispatch(id, bob.account.id, { type: 'STEP_OUT' });
    app.channels.dispatch(id, alice.account.id, { type: 'STEP_OUT' });

    const mine = app.channels
      .rejoinableFor(alice.account.id)
      .find((entry) => entry.channelId === id)!;
    expect(mine.steppedInAt).toBe(arrived);
  });

  it('outlives the visit it reports', async () => {
    // The whole of its use. Stepping out — or, in the flow this is for,
    // stepping into the next channel — leaves the room with no trace of the
    // reader in any measure, this one included.
    const alice = await signIn('alice@example.com', 'Alice');
    const bob = await signIn('bob@example.com', 'Bob');
    await befriend(alice, bob, 'bob@example.com');
    const id = pairChannel(alice, bob)!;

    clock += 60_000;
    app.channels.dispatch(id, alice.account.id, { type: 'ENTER' });
    const arrived = clock;
    clock += 30_000;
    app.channels.dispatch(id, alice.account.id, { type: 'STEP_OUT' });

    const view = app.channels
      .rejoinableFor(alice.account.id)
      .find((entry) => entry.channelId === id)!;
    expect(view.presentCount).toBe(0);
    // Nobody else has been here, so the row's own number has nothing to say.
    expect(view.lastPresenceByOthers).toBeNull();
    // And this is the only thing that remembers she came. Not her own
    // `lastPresentAt` either, which the way out has just re-stamped: that says
    // when she was last here, and this says when she arrived.
    expect(view.steppedInAt).toBe(arrived);
    expect(view.steppedInAt).toBeLessThan(clock);
  });

  it('is superseded when somebody else steps in', async () => {
    // How a mark is cleared, with no machinery for clearing it: the next
    // arrival overwrites the last. It goes at exactly the moment their entry
    // puts their own presence into the number beside it, so a mark saying you
    // stepped in can never sit next to an interval saying somebody answered.
    const alice = await signIn('alice@example.com', 'Alice');
    const bob = await signIn('bob@example.com', 'Bob');
    await befriend(alice, bob, 'bob@example.com');
    const id = pairChannel(alice, bob)!;

    clock += 60_000;
    app.channels.dispatch(id, alice.account.id, { type: 'ENTER' });
    clock += 30_000;
    app.channels.dispatch(id, alice.account.id, { type: 'STEP_OUT' });

    clock += 10 * 60_000;
    app.channels.dispatch(id, bob.account.id, { type: 'ENTER' });
    const answered = clock;

    const view = app.channels
      .rejoinableFor(alice.account.id)
      .find((entry) => entry.channelId === id)!;
    expect(view.steppedInAt).toBeNull();
    expect(view.lastPresenceByOthers).toBe(answered);
  });

  it('marks a first-ever entry too', async () => {
    // The standing channel a pair get for becoming contacts, opened for the
    // first time. The other person gets `invited` rather than `arrived` here —
    // a different push with a different lifetime — which is exactly the sort of
    // distinction this stopped depending on. Stepping in is stepping in.
    const alice = await signIn('alice@example.com', 'Alice');
    const bob = await signIn('bob@example.com', 'Bob');
    await befriend(alice, bob, 'bob@example.com');
    const id = pairChannel(alice, bob)!;

    const before = app.channels
      .rejoinableFor(alice.account.id)
      .find((entry) => entry.channelId === id)!;
    expect(before.everUsed).toBe(false);
    expect(before.steppedInAt).toBeNull();

    clock += 60_000;
    app.channels.dispatch(id, alice.account.id, { type: 'ENTER' });

    const after = app.channels
      .rejoinableFor(alice.account.id)
      .find((entry) => entry.channelId === id)!;
    expect(after.steppedInAt).toBe(clock);
  });
});
