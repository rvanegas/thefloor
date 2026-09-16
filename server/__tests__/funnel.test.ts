import { USAGE_RETENTION_MS } from '../../core/constants';
import { buildApp, type App } from '../src/app';
import { PING_INTERVAL_MS } from '../src/channels';
import { NOTIFY_HEADER } from '../src/release';
import type { PingRow } from '../src/db';
import { MemoryMailer } from '../src/mail';
import { MemoryMediaServer } from '../src/media';

/**
 * The funnel instrumentation, which is the two steps the box could not see.
 *
 * planning/MARKETING.md § *The funnel, level by level* numbers fourteen of
 * them and § *What is still not measured* named three gaps. Two are closed
 * here: level 9, somebody asking for company, and level 10, it working. The
 * third is guests, which stays open by construction.
 *
 * **These are measurements and not behaviour**, which is what the file is
 * guarding: nothing here may change whether a ping is sent, who hears it, or
 * what the room does — push.test.ts owns all of that. What it asserts is that
 * the row appears when the ping did, that it is closed by the arrival that
 * answered it and by no other, and that it leaves on the two schedules
 * /privacy promises.
 */

let app: App;
let clock = 1_700_000_000_000;

const T0 = 1_700_000_000_000;

beforeEach(() => {
  clock = T0;
  app = buildApp({
    dbPath: ':memory:',
    mailer: new MemoryMailer(),
    media: new MemoryMediaServer(),
    mediaUrl: 'wss://example.livekit.cloud',
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

const pings = (): PingRow[] =>
  app.db
    .prepare('SELECT * FROM pings ORDER BY sent_at, id')
    .all() as unknown as PingRow[];

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

/**
 * Alice present in a channel, Bob a member of it and not there.
 *
 * The shape every ping in this file is sent into, and the only one the
 * application permits: the sender has to be in the room or beside it and the
 * target has to be neither.
 */
async function aliceInRoomBobAway() {
  const alice = await signIn('alice@example.com', 'Alice');
  const bob = await signIn('bob@example.com', 'Bob');
  await befriend(alice, bob, 'bob@example.com');
  const created = await app.fastify.inject({
    method: 'POST',
    url: '/channels',
    headers: auth(alice.token),
    payload: { contactIds: [bob.account.id] },
  });
  const { channelId } = created.json() as { channelId: string };
  app.channels.dispatch(channelId, alice.account.id, { type: 'ENTER' });
  await settle();
  return { alice, bob, channelId };
}

const ping = (token: string, channelId: string, body: unknown) =>
  app.fastify.inject({
    method: 'POST',
    url: `/channels/${channelId}/ping`,
    headers: auth(token),
    payload: body as Record<string, unknown>,
  });

describe('level 9, the ping sent', () => {
  it('writes one row, naming both people and neither their words', async () => {
    const { alice, bob, channelId } = await aliceInRoomBobAway();

    const reply = await ping(alice.token, channelId, {
      targetId: bob.account.id,
      text: 'we are starting',
    });
    await settle();

    expect(reply.statusCode).toBe(200);
    expect(pings()).toEqual([
      {
        id: expect.stringMatching(/^png_/),
        channel_id: channelId,
        sender_id: alice.account.id,
        target_id: bob.account.id,
        sent_at: clock,
        with_text: 1,
        answered_at: null,
      },
    ]);
    // The sentence itself is nowhere in the row, which is the design rather
    // than an omission: /privacy describes this table.
    expect(JSON.stringify(pings())).not.toContain('we are starting');
  });

  it('records the plain form as a ping with no words', async () => {
    const { alice, bob, channelId } = await aliceInRoomBobAway();

    await ping(alice.token, channelId, { targetId: bob.account.id });
    await settle();

    expect(pings()).toHaveLength(1);
    expect(pings()[0].with_text).toBe(0);
  });

  /** Whitespace is not words here either — the same rule the body follows. */
  it('records a composer full of spaces as no words', async () => {
    const { alice, bob, channelId } = await aliceInRoomBobAway();

    await ping(alice.token, channelId, {
      targetId: bob.account.id,
      text: '   ',
    });
    await settle();

    expect(pings()[0].with_text).toBe(0);
  });

  /**
   * The reason the record is written below every guard rather than beside
   * the rate limiter: a refusal is not an ask, and counting one would inflate
   * the denominator of every rate read off this table.
   */
  it('records nothing for a ping the server refused', async () => {
    const { alice, bob, channelId } = await aliceInRoomBobAway();
    app.channels.dispatch(channelId, bob.account.id, { type: 'ENTER' });
    await settle();

    const reply = await ping(alice.token, channelId, {
      targetId: bob.account.id,
    });
    await settle();

    expect(reply.statusCode).toBe(409);
    expect(pings()).toEqual([]);
  });

  it('records nothing for the second ping inside the window', async () => {
    const { alice, bob, channelId } = await aliceInRoomBobAway();

    await ping(alice.token, channelId, { targetId: bob.account.id });
    clock += 1000;
    await ping(alice.token, channelId, { targetId: bob.account.id });
    await settle();

    expect(pings()).toHaveLength(1);
  });
});

describe('level 10, the ping answered', () => {
  it('is closed by the arrival that answered it', async () => {
    const { alice, bob, channelId } = await aliceInRoomBobAway();
    await ping(alice.token, channelId, { targetId: bob.account.id });
    await settle();

    clock += 30_000;
    app.channels.dispatch(channelId, bob.account.id, { type: 'ENTER' });
    await settle();

    expect(pings()[0].answered_at).toBe(clock);
  });

  /**
   * Tapping *Be nearby* is going, exactly as `consume` reads it: the ping got
   * somebody onto the rung beside the room, and a measurement that only
   * counted the door would call that a failure.
   */
  it('is closed by a declaration of being nearby', async () => {
    const { alice, bob, channelId } = await aliceInRoomBobAway();
    await ping(alice.token, channelId, { targetId: bob.account.id });
    await settle();

    clock += 30_000;
    app.channels.dispatch(channelId, bob.account.id, {
      type: 'DECLARE_NEARBY',
    });
    await settle();

    expect(pings()[0].answered_at).toBe(clock);
  });

  /**
   * Somebody who wanders in the next day has not answered anything, and
   * counting them would turn level 10 into a slow restatement of level 8.
   */
  it('stays open for an arrival after the window has passed', async () => {
    const { alice, bob, channelId } = await aliceInRoomBobAway();
    await ping(alice.token, channelId, { targetId: bob.account.id });
    await settle();

    clock += PING_INTERVAL_MS + 1;
    app.channels.dispatch(channelId, bob.account.id, { type: 'ENTER' });
    await settle();

    expect(pings()[0].answered_at).toBeNull();
  });

  /**
   * Two people asking is one person arriving. Crediting both would make the
   * answer rate climb with the number of people doing the asking, which is
   * the one way this number could be made to flatter itself.
   */
  it('closes the newest open ping and no other', async () => {
    const alice = await signIn('alice@example.com', 'Alice');
    const bob = await signIn('bob@example.com', 'Bob');
    const carol = await signIn('carol@example.com', 'Carol');
    await befriend(alice, bob, 'bob@example.com');
    await befriend(carol, bob, 'bob@example.com');
    await befriend(alice, carol, 'carol@example.com');
    const created = await app.fastify.inject({
      method: 'POST',
      url: '/channels',
      headers: auth(alice.token),
      payload: { contactIds: [bob.account.id, carol.account.id] },
    });
    const { channelId } = created.json() as { channelId: string };
    app.channels.dispatch(channelId, alice.account.id, { type: 'ENTER' });
    app.channels.dispatch(channelId, carol.account.id, { type: 'ENTER' });
    await settle();

    await ping(alice.token, channelId, { targetId: bob.account.id });
    clock += PING_INTERVAL_MS + 1;
    await ping(carol.token, channelId, { targetId: bob.account.id });
    await settle();

    clock += 1000;
    app.channels.dispatch(channelId, bob.account.id, { type: 'ENTER' });
    await settle();

    const [first, second] = pings();
    expect(first.sender_id).toBe(alice.account.id);
    expect(first.answered_at).toBeNull();
    expect(second.sender_id).toBe(carol.account.id);
    expect(second.answered_at).toBe(clock);
  });

  /** The ordinary case: an arrival nobody asked for closes nothing. */
  it('leaves the table alone when nobody was pinged', async () => {
    const { bob, channelId } = await aliceInRoomBobAway();

    app.channels.dispatch(channelId, bob.account.id, { type: 'ENTER' });
    await settle();

    expect(pings()).toEqual([]);
  });
});

describe('what happens to a ping afterwards', () => {
  /**
   * On `sent_at`, so the unanswered ones are not kept longer than the
   * answered — they are the half this table exists to count.
   */
  it('is swept a month after it was sent, answered or not', async () => {
    const { alice, bob, channelId } = await aliceInRoomBobAway();
    await ping(alice.token, channelId, { targetId: bob.account.id });
    await settle();

    clock += USAGE_RETENTION_MS - 1;
    expect(app.channels.usage.sweep(clock).pings).toBe(0);

    clock += 2;
    expect(app.channels.usage.sweep(clock).pings).toBe(1);
    expect(pings()).toEqual([]);
  });

  it('goes with an erased account named at either end', async () => {
    const { alice, bob, channelId } = await aliceInRoomBobAway();
    await ping(alice.token, channelId, { targetId: bob.account.id });
    await settle();
    expect(pings()).toHaveLength(1);

    // The target, who is the end easily forgotten: the row names them and
    // nothing else in it would.
    app.channels.usage.forget(bob.account.id);
    expect(pings()).toEqual([]);
  });
});

describe('level 3, whether notifications are allowed', () => {
  const homeWith = (token: string, headers: Record<string, string>) =>
    app.fastify.inject({
      method: 'GET',
      url: '/home',
      headers: { ...auth(token), ...headers },
    });

  const stateOf = (id: string) =>
    app.db
      .prepare('SELECT notifications, notifications_at FROM accounts WHERE id = ?')
      .get(id) as { notifications: string | null; notifications_at: number | null };

  it('records what the client reports, and when', async () => {
    const alice = await signIn('alice@example.com', 'Alice');

    await homeWith(alice.token, { [NOTIFY_HEADER]: 'denied' });

    expect(stateOf(alice.account.id)).toEqual({
      notifications: 'denied',
      notifications_at: clock,
    });
  });

  /**
   * The column this instrumentation exists for. A device token proves
   * `granted` and its absence proves nothing, so before this the two answers
   * that matter were indistinguishable from each other and from silence.
   */
  it('tells a refusal from a dialog nobody has been shown', async () => {
    const alice = await signIn('alice@example.com', 'Alice');
    const bob = await signIn('bob@example.com', 'Bob');

    await homeWith(alice.token, { [NOTIFY_HEADER]: 'denied' });
    await homeWith(bob.token, { [NOTIFY_HEADER]: 'undetermined' });

    expect(stateOf(alice.account.id).notifications).toBe('denied');
    expect(stateOf(bob.account.id).notifications).toBe('undetermined');
  });

  /**
   * The stamp says when the answer changed, not when somebody last made a
   * request — `last_seen_at` beside it already answers that one, and a write
   * per request would be a write per request for a value that moves twice in
   * an install's life.
   */
  it('leaves the stamp alone while the answer stands', async () => {
    const alice = await signIn('alice@example.com', 'Alice');
    await homeWith(alice.token, { [NOTIFY_HEADER]: 'denied' });
    const first = stateOf(alice.account.id).notifications_at;

    clock += 60_000;
    await homeWith(alice.token, { [NOTIFY_HEADER]: 'denied' });

    expect(stateOf(alice.account.id).notifications_at).toBe(first);
  });

  it('moves the stamp when somebody changes their mind in Settings', async () => {
    const alice = await signIn('alice@example.com', 'Alice');
    await homeWith(alice.token, { [NOTIFY_HEADER]: 'denied' });

    clock += 60_000;
    await homeWith(alice.token, { [NOTIFY_HEADER]: 'granted' });

    expect(stateOf(alice.account.id)).toEqual({
      notifications: 'granted',
      notifications_at: clock,
    });
  });

  /**
   * Every build shipped before this field omits it, so silence has to keep
   * meaning unknown — and must never overwrite an answer a phone gave.
   */
  it('keeps the answer when a later request says nothing', async () => {
    const alice = await signIn('alice@example.com', 'Alice');
    await homeWith(alice.token, { [NOTIFY_HEADER]: 'granted' });

    clock += 60_000;
    await homeWith(alice.token, {});

    expect(stateOf(alice.account.id).notifications).toBe('granted');
  });

  /**
   * A browser has no such permission to grant. Filing its answer would put a
   * population that was never eligible into the row for one that refused —
   * and here it would also overwrite the phone's real answer.
   */
  it('ignores a web client, whatever it claims', async () => {
    const alice = await signIn('alice@example.com', 'Alice');
    await homeWith(alice.token, { [NOTIFY_HEADER]: 'granted' });

    clock += 60_000;
    await homeWith(alice.token, {
      [NOTIFY_HEADER]: 'denied',
      'x-thefloor-client': 'web',
    });

    expect(stateOf(alice.account.id).notifications).toBe('granted');
  });

  /**
   * `claimedBuild` reads a garbled value as *old*, safely, because every
   * silent client genuinely is. There is no such safe default here: any of
   * the three would be an invented claim about somebody's phone.
   */
  it('records nothing for a value it does not recognise', async () => {
    const alice = await signIn('alice@example.com', 'Alice');

    await homeWith(alice.token, { [NOTIFY_HEADER]: 'probably' });

    expect(stateOf(alice.account.id).notifications).toBeNull();
  });
});
