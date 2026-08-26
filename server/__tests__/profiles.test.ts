import { buildApp, type App } from '../src/app';
import { MemoryMailer } from '../src/mail';

/**
 * A profile is the one place somebody says who they are, so the interesting
 * questions are not about storage. They are about who may read it, and about a
 * partial write not quietly erasing the half the client did not send.
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

const save = (user: User, payload: Record<string, unknown>) =>
  app.fastify.inject({
    method: 'POST',
    url: '/me',
    headers: auth(user.token),
    payload,
  });

const read = (viewer: User, id: string) =>
  app.fastify.inject({
    method: 'GET',
    url: `/profiles/${id}`,
    headers: auth(viewer.token),
  });

describe('writing your own profile', () => {
  it('takes a bio, keeping the markup exactly as typed', async () => {
    const alice = await signIn('alice@example.com', 'Alice');
    const markup = 'Cellist. **Bach** mostly — [notes](https://example.com).';
    const response = await save(alice, { bio: markup });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      account: { id: alice.account.id, displayName: 'Alice' },
      bio: markup,
      invited: 0,
    });
  });

  it('leaves out what was left out', async () => {
    // The point of a partial write: saving a bio must not blank the name, and
    // saving a name must not blank the bio. A client that sends one field is
    // editing one field.
    const alice = await signIn('alice@example.com', 'Alice');
    await save(alice, { bio: 'Cellist.' });
    await save(alice, { displayName: 'Alice Nkemdirim' });

    const profile = (await read(alice, alice.account.id)).json();
    expect(profile).toEqual({
      account: { id: alice.account.id, displayName: 'Alice Nkemdirim' },
      bio: 'Cellist.',
      invited: 0,
      // Nobody has any channels here. Empty rather than absent, and the
      // distinction is the client's to act on: an absent key is a server too
      // old to answer, where an empty array is the answer.
      sharedChannels: [],
    });
  });

  it('trims the ends of a bio but never its interior', async () => {
    // Interior whitespace is Markdown — a blank line is a paragraph break —
    // so collapsing it would rewrite what somebody wrote.
    const alice = await signIn('alice@example.com', 'Alice');
    const response = await save(alice, { bio: '  one\n\n  two  ' });
    expect((response.json() as { bio: string }).bio).toBe('one\n\n  two');
  });

  it('clears a bio when given nothing but whitespace', async () => {
    const alice = await signIn('alice@example.com', 'Alice');
    await save(alice, { bio: 'Cellist.' });
    const cleared = await save(alice, { bio: '   \n ' });
    expect((cleared.json() as { bio: string | null }).bio).toBeNull();
  });

  it('refuses an empty name rather than accepting one', async () => {
    // Somebody with no name is an empty space in every roster they appear in,
    // which is worse than the request failing.
    const alice = await signIn('alice@example.com', 'Alice');
    const response = await save(alice, { displayName: '   ' });
    expect(response.statusCode).toBe(400);
    expect(app.accounts.public(alice.account.id)?.displayName).toBe('Alice');
  });

  it('refuses fields that are not text', async () => {
    const alice = await signIn('alice@example.com', 'Alice');
    expect((await save(alice, { bio: { evil: true } })).statusCode).toBe(400);
    expect((await save(alice, { displayName: 42 })).statusCode).toBe(400);
  });

  it('refuses an unauthenticated caller', async () => {
    const response = await app.fastify.inject({
      method: 'POST',
      url: '/me',
      payload: { bio: 'hello' },
    });
    expect(response.statusCode).toBe(401);
  });
});

describe('reading somebody else’s profile', () => {
  it('is allowed for a contact', async () => {
    const alice = await signIn('alice@example.com', 'Alice');
    const bob = await signIn('bob@example.com', 'Bob');
    await befriend(alice, bob, 'bob@example.com');
    await save(bob, { bio: 'Trombone.' });

    const response = await read(alice, bob.account.id);
    expect(response.statusCode).toBe(200);
    expect((response.json() as { bio: string }).bio).toBe('Trombone.');
  });

  it('is allowed for someone sharing a channel, contact or not', async () => {
    // Alice knows bob and carol; they do not know each other. Putting both in
    // one channel is exactly the situation where you want to find out who the
    // other person is.
    const alice = await signIn('alice@example.com', 'Alice');
    const bob = await signIn('bob@example.com', 'Bob');
    const carol = await signIn('carol@example.com', 'Carol');
    await befriend(alice, bob, 'bob@example.com');
    await befriend(alice, carol, 'carol@example.com');
    await save(carol, { bio: 'Harpsichord.' });

    expect((await read(bob, carol.account.id)).statusCode).toBe(404);

    const created = app.channels.create(alice.account.id, [
      bob.account.id,
      carol.account.id,
    ]);
    expect(created.ok).toBe(true);

    const response = await read(bob, carol.account.id);
    expect(response.statusCode).toBe(200);
    expect((response.json() as { bio: string }).bio).toBe('Harpsichord.');
  });

  /**
   * Where somebody is, which used to be a line on Home's contact rows and
   * moved here when Home became a list of channels. A profile has a wider
   * audience than a contact list did, so the audience for this one fact is
   * narrowed back to the one it always had.
   */
  it('tells a contact when the person was last about', async () => {
    const alice = await signIn('alice@example.com', 'Alice');
    const bob = await signIn('bob@example.com', 'Bob');
    await befriend(alice, bob, 'bob@example.com');

    // Written by the socket rather than by signing in — see `markSeen`, which
    // this stands in for, there being no socket in an injected request.
    app.accounts.markSeen(bob.account.id, clock);

    const profile = (await read(alice, bob.account.id)).json() as {
      inApp?: boolean;
      lastSeenAt?: number | null;
    };
    // False rather than absent: nobody is holding a socket here, and that is
    // an answer where a non-contact gets no answer at all.
    expect(profile.inApp).toBe(false);
    expect(profile.lastSeenAt).toBe(clock);
  });

  it('says nothing about it to somebody who merely shares a channel', async () => {
    const alice = await signIn('alice@example.com', 'Alice');
    const bob = await signIn('bob@example.com', 'Bob');
    const carol = await signIn('carol@example.com', 'Carol');
    await befriend(alice, bob, 'bob@example.com');
    await befriend(alice, carol, 'carol@example.com');
    app.channels.create(alice.account.id, [bob.account.id, carol.account.id]);

    const profile = (await read(bob, carol.account.id)).json() as
      Record<string, unknown>;
    // Absent rather than null: an acquaintance brought into a conversation
    // gets the bio, and the question of where its author is does not arise.
    expect(profile).not.toHaveProperty('inApp');
    expect(profile).not.toHaveProperty('lastSeenAt');
  });

  it('says nothing about it on your own profile either', async () => {
    // You are the one person whose whereabouts you already know, and a line
    // saying so would be the screen talking to itself.
    const alice = await signIn('alice@example.com', 'Alice');
    const own = (await read(alice, alice.account.id)).json() as
      Record<string, unknown>;
    expect(own).not.toHaveProperty('lastSeenAt');
  });

  it('is refused for a stranger, the same way a missing one is', async () => {
    // Identical answers, so the endpoint cannot be used to discover which
    // account ids exist.
    const alice = await signIn('alice@example.com', 'Alice');
    const mallory = await signIn('mallory@example.com', 'Mallory');
    await save(alice, { bio: 'Cellist.' });

    const stranger = await read(mallory, alice.account.id);
    const missing = await read(mallory, 'acct_nobody');
    expect(stranger.statusCode).toBe(404);
    expect(missing.statusCode).toBe(404);
    expect(stranger.json()).toEqual(missing.json());
  });

  it('is always allowed for yourself', async () => {
    const alice = await signIn('alice@example.com', 'Alice');
    expect((await read(alice, alice.account.id)).statusCode).toBe(200);
  });
});

describe('a bio outlives the process', () => {
  it('is still there after the account is read back', async () => {
    const alice = await signIn('alice@example.com', 'Alice');
    await save(alice, { bio: 'Cellist.' });
    // Straight from the row rather than through the cache the route just used.
    const row = app.db
      .prepare('SELECT bio FROM accounts WHERE id = ?')
      .get(alice.account.id) as { bio: string };
    expect(row.bio).toBe('Cellist.');
  });
});

describe('asking somebody in your channel to be a contact', () => {
  /** Alice knows bob and carol; bob and carol are strangers to each other. */
  async function strangersInAChannel() {
    const alice = await signIn('alice@example.com', 'Alice');
    const bob = await signIn('bob@example.com', 'Bob');
    const carol = await signIn('carol@example.com', 'Carol');
    await befriend(alice, bob, 'bob@example.com');
    await befriend(alice, carol, 'carol@example.com');
    const created = app.channels.create(alice.account.id, [
      bob.account.id,
      carol.account.id,
    ]);
    if (!created.ok) throw new Error(created.error);
    return { alice, bob, carol };
  }

  const ask = (from: User, targetId: string) =>
    app.fastify.inject({
      method: 'POST',
      url: `/contacts/${targetId}/request`,
      headers: auth(from.token),
    });

  it('lets two strangers in one channel connect', async () => {
    // The case the feature exists for: you are talking to somebody a mutual
    // acquaintance brought in, and you have their id but not their address.
    const { bob, carol } = await strangersInAChannel();

    const response = await ask(bob, carol.account.id);
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ ok: true, accepted: false });

    // Pending, not accepted: being in a channel together is not consent to
    // be someone's contact, it is only permission to ask.
    const forCarol = app.accounts
      .contactsFor(carol.account.id)
      .find((entry) => entry.account.id === bob.account.id);
    expect(forCarol?.status).toBe('incoming');
  });

  it('treats a request from someone who already asked you as accepting', async () => {
    const { bob, carol } = await strangersInAChannel();
    await ask(bob, carol.account.id);

    const response = await ask(carol, bob.account.id);
    expect(response.json()).toEqual({ ok: true, accepted: true });
    expect(app.accounts.areContacts(bob.account.id, carol.account.id)).toBe(
      true
    );
  });

  it('refuses somebody you share no channel with, as a 404', async () => {
    // Ids travel in every roster, so an id must not be a way to pester
    // anybody who happens to hold one. Same answer as a nonexistent id, so
    // this cannot be used to find out which are real.
    const alice = await signIn('alice@example.com', 'Alice');
    const mallory = await signIn('mallory@example.com', 'Mallory');

    const stranger = await ask(mallory, alice.account.id);
    const missing = await ask(mallory, 'acct_nobody');
    expect(stranger.statusCode).toBe(404);
    expect(missing.statusCode).toBe(404);
    expect(stranger.json()).toEqual(missing.json());
    expect(app.accounts.contactsFor(alice.account.id)).toHaveLength(0);
  });

  it('refuses a second request, and yourself', async () => {
    const { alice, bob, carol } = await strangersInAChannel();
    await ask(bob, carol.account.id);

    const again = await ask(bob, carol.account.id);
    expect(again.statusCode).toBe(400);
    expect((again.json() as { error: string }).error).toBe(
      'Request already sent.'
    );

    const self = await ask(bob, bob.account.id);
    expect(self.statusCode).toBe(400);
    expect((self.json() as { error: string }).error).toBe('That’s you.');

    // And asking someone who already is one says so rather than duplicating.
    const known = await ask(bob, alice.account.id);
    expect((known.json() as { error: string }).error).toBe('Already a contact.');
  });

  it('refuses an unauthenticated caller', async () => {
    const { carol } = await strangersInAChannel();
    const response = await app.fastify.inject({
      method: 'POST',
      url: `/contacts/${carol.account.id}/request`,
    });
    expect(response.statusCode).toBe(401);
  });
});

/**
 * Handing one contact your sign-in address.
 *
 * The one thing on a profile that is not released by the reader's standing.
 * Everything else here follows from who is asking — a contact gets
 * availability, somebody sharing a channel gets the bio — and this follows
 * from an act of the person it belongs to, aimed at one named reader.
 */
describe('showing your email to a contact', () => {
  const setShown = (user: User, id: string, shown: boolean) =>
    app.fastify.inject({
      method: shown ? 'POST' : 'DELETE',
      url: `/contacts/${id}/email`,
      headers: auth(user.token),
    });

  const emailOn = async (viewer: User, id: string) =>
    ((await read(viewer, id)).json() as { email?: string }).email;

  const pair = async () => {
    const alice = await signIn('alice@example.com', 'Alice');
    const bob = await signIn('bob@example.com', 'Bob');
    await befriend(alice, bob, 'bob@example.com');
    return { alice, bob };
  };

  it('is withheld until the owner says otherwise', async () => {
    const { alice, bob } = await pair();
    // Being a contact is agreement to talk, not to be written to outside this
    // application. Absent rather than null: there is nothing to draw.
    expect(await emailOn(alice, bob.account.id)).toBeUndefined();
  });

  it('reaches the one person it was shown to, and nobody else', async () => {
    const { alice, bob } = await pair();
    const carol = await signIn('carol@example.com', 'Carol');
    await befriend(bob, carol, 'carol@example.com');

    expect((await setShown(bob, alice.account.id, true)).statusCode).toBe(200);

    expect(await emailOn(alice, bob.account.id)).toBe('bob@example.com');
    // Carol is bob's contact too and was told nothing. The decision is per
    // person, which is why it lives on a profile rather than in settings.
    expect(await emailOn(carol, bob.account.id)).toBeUndefined();
  });

  it('is one-directional, so showing is not a trade', async () => {
    const { alice, bob } = await pair();
    await setShown(bob, alice.account.id, true);

    const onAlice = (await read(bob, alice.account.id)).json() as {
      email?: string;
      myEmailShown?: boolean;
    };
    // Alice's address is not disclosed by bob showing his, and bob's own
    // screen says which way round it is.
    expect(onAlice.email).toBeUndefined();
    expect(onAlice.myEmailShown).toBe(true);
  });

  it('stops on request, and can be shown again', async () => {
    const { alice, bob } = await pair();
    await setShown(bob, alice.account.id, true);
    await setShown(bob, alice.account.id, false);
    expect(await emailOn(alice, bob.account.id)).toBeUndefined();

    await setShown(bob, alice.account.id, true);
    expect(await emailOn(alice, bob.account.id)).toBe('bob@example.com');
  });

  it('records the decision once, however many times it is made', async () => {
    const { alice, bob } = await pair();
    await setShown(bob, alice.account.id, true);
    clock += 60_000;
    // A second call is not a second decision, and must not fail on the
    // primary key either.
    expect((await setShown(bob, alice.account.id, true)).statusCode).toBe(200);
    expect(await emailOn(alice, bob.account.id)).toBe('bob@example.com');
  });

  it('is refused to anybody who is not a contact, as a 404', async () => {
    // A profile is readable by anyone sharing a live channel, which is a wider
    // audience than an address should reach. The refusal is a 404 like every
    // other on these screens, so it answers nothing about which ids exist.
    const alice = await signIn('alice@example.com', 'Alice');
    const bob = await signIn('bob@example.com', 'Bob');
    const carol = await signIn('carol@example.com', 'Carol');
    await befriend(alice, bob, 'bob@example.com');
    await befriend(alice, carol, 'carol@example.com');
    app.channels.create(alice.account.id, [bob.account.id, carol.account.id]);

    expect((await setShown(bob, carol.account.id, true)).statusCode).toBe(404);
    expect((await setShown(bob, 'acct_nobody', true)).statusCode).toBe(404);
    expect(await emailOn(carol, bob.account.id)).toBeUndefined();
  });

  it('refuses an unauthenticated caller', async () => {
    const { alice } = await pair();
    const response = await app.fastify.inject({
      method: 'POST',
      url: `/contacts/${alice.account.id}/email`,
    });
    expect(response.statusCode).toBe(401);
  });

  it('goes when the contact does', async () => {
    // It was shown to a contact; ending the contact ends the audience. Both
    // ways, without asking, since the row is the pair either way.
    const { alice, bob } = await pair();
    await setShown(bob, alice.account.id, true);
    await setShown(alice, bob.account.id, true);

    await app.fastify.inject({
      method: 'DELETE',
      url: `/contacts/${bob.account.id}`,
      headers: auth(alice.token),
    });

    // Not readable at all now, the profile itself being refused — so the
    // check that matters is the row: befriending again must not silently
    // restore a disclosure neither of them made twice.
    await befriend(alice, bob, 'bob@example.com');
    expect(await emailOn(alice, bob.account.id)).toBeUndefined();
    expect(await emailOn(bob, alice.account.id)).toBeUndefined();
  });

  it('goes when the account does', async () => {
    const { alice, bob } = await pair();
    await setShown(alice, bob.account.id, true);
    await app.fastify.inject({
      method: 'DELETE',
      url: '/me',
      headers: auth(alice.token),
    });
    // A disclosure must not outlive the person who made it, and a tombstone's
    // identifier is not an address in any case.
    expect(
      app.accounts.emailShownTo(alice.account.id, bob.account.id)
    ).toBe(null);
  });
});

/**
 * The channels two people share, on the profile of one of them.
 *
 * A profile carries where *they* have been in each — not where the room has,
 * which the client already has from Home and which is the maximum across
 * everybody in it. The two answers differ in exactly the case the section
 * exists for: a busy channel one member has never opened.
 */
describe('the channels on somebody’s profile', () => {
  type Shared = {
    sharedChannels?: {
      channelId: string;
      present: boolean;
      lastPresentAt: number | null;
    }[];
  };

  const sharedOf = async (viewer: User, id: string) =>
    ((await read(viewer, id)).json() as Shared).sharedChannels!;

  it('lists the ones you both belong to, and no others', async () => {
    const alice = await signIn('alice@example.com', 'Alice');
    const bob = await signIn('bob@example.com', 'Bob');
    const carol = await signIn('carol@example.com', 'Carol');
    await befriend(alice, bob, 'bob@example.com');
    await befriend(alice, carol, 'carol@example.com');

    const shared = app.channels.create(alice.account.id, [bob.account.id]);
    const other = app.channels.create(alice.account.id, [carol.account.id]);
    if (!shared.ok || !other.ok) throw new Error('channel not created');

    const ids = (await sharedOf(alice, bob.account.id)).map(
      (entry) => entry.channelId
    );
    // The one with carol in it is alice's own and is on her Home; it is not a
    // channel she shares with bob, so it says nothing on his profile.
    expect(ids).toContain(shared.channel.id);
    expect(ids).not.toContain(other.channel.id);
  });

  it('answers about them rather than about the room', async () => {
    // The case the section is for. Alice sits in the channel and bob never
    // has: the room reads as occupied, and the fact on bob's card is that he
    // has never been in it.
    const alice = await signIn('alice@example.com', 'Alice');
    const bob = await signIn('bob@example.com', 'Bob');
    await befriend(alice, bob, 'bob@example.com');

    const created = app.channels.create(alice.account.id, [bob.account.id]);
    if (!created.ok) throw new Error('channel not created');
    app.channels.dispatch(created.channel.id, alice.account.id, {
      type: 'ENTER',
    });

    const [about] = await sharedOf(alice, bob.account.id);
    expect(about.present).toBe(false);
    // Null rather than a number: nothing has ever been heard from him here,
    // and an invented stamp is the failure `lastPresentAt` exists to avoid.
    expect(about.lastPresentAt).toBe(null);

    // Read the other way round it is alice who is there, which is what makes
    // the pair asymmetric: the viewer decides which channels appear, the
    // subject decides what is said about each.
    const [aboutAlice] = await sharedOf(bob, alice.account.id);
    expect(aboutAlice.present).toBe(true);
    expect(aboutAlice.lastPresentAt).toBe(clock);
  });

  it('remembers when somebody who has stepped out was last in', async () => {
    const alice = await signIn('alice@example.com', 'Alice');
    const bob = await signIn('bob@example.com', 'Bob');
    await befriend(alice, bob, 'bob@example.com');

    const created = app.channels.create(alice.account.id, [bob.account.id]);
    if (!created.ok) throw new Error('channel not created');
    app.channels.dispatch(created.channel.id, bob.account.id, {
      type: 'ENTER',
    });
    const entered = clock;
    clock += 3_600_000;
    app.channels.dispatch(created.channel.id, bob.account.id, {
      type: 'STEP_OUT',
    });

    const [about] = await sharedOf(alice, bob.account.id);
    expect(about.present).toBe(false);
    // The last moment he was heard from, which is his departure an hour after
    // he arrived — not the arrival, and not now.
    expect(about.lastPresentAt).toBe(entered + 3_600_000);
  });

  it('tells somebody who merely shares a channel, unlike availability', async () => {
    // The rule that narrows `lastSeenAt` to contacts does not reach here, and
    // the difference is scope rather than sensitivity: every entry is a
    // channel the reader is themselves a member of.
    const alice = await signIn('alice@example.com', 'Alice');
    const bob = await signIn('bob@example.com', 'Bob');
    const carol = await signIn('carol@example.com', 'Carol');
    await befriend(alice, bob, 'bob@example.com');
    await befriend(alice, carol, 'carol@example.com');
    app.channels.create(alice.account.id, [bob.account.id, carol.account.id]);

    const profile = (await read(bob, carol.account.id)).json() as Record<
      string,
      unknown
    > &
      Shared;
    expect(profile).not.toHaveProperty('lastSeenAt');
    expect(profile.sharedChannels).toHaveLength(1);
  });

  it('does not carry the collapsed answer a contact row gets', async () => {
    // `ContactView.lastInChannelAt` is the maximum of these entries, and Home
    // needs it because a row is one line about one person. A profile has room
    // for the array and the array says strictly more — which room, and whether
    // they are in it now. Two statements of one fact that can disagree is
    // worse than one, so this asserts the absence rather than leaving a later
    // session to add it "for symmetry".
    const alice = await signIn('alice@example.com', 'Alice');
    const bob = await signIn('bob@example.com', 'Bob');
    await befriend(alice, bob, 'bob@example.com');
    const made = app.channels.create(alice.account.id, [bob.account.id]);
    expect(made.ok).toBe(true);
    if (made.ok) {
      app.channels.dispatch(made.channel.id, bob.account.id, { type: 'ENTER' });
    }

    const profile = (await read(alice, bob.account.id)).json() as Record<
      string,
      unknown
    > &
      Shared;
    expect(profile).not.toHaveProperty('lastInChannelAt');
    // And the array that answers instead is there and is populated, so this
    // is a statement about where the fact lives rather than about it missing.
    expect(profile.sharedChannels).toHaveLength(1);
    expect(profile.sharedChannels![0].lastPresentAt).not.toBeNull();
  });
});
