import { buildApp, type App } from '../src/app';
import { MemoryMailer } from '../src/mail';
import { MemoryMediaServer } from '../src/media';
import type { HomeView } from '../../core/protocol';
import type { ChannelAction } from '../../core/types';

/**
 * `dispatch` takes `Omit<ChannelAction, 'userId'>` intersected with a bare
 * `type`, which erases the union's payloads — so every caller that carries one
 * casts, as the registry's own internal calls do. Named here rather than
 * repeated at each call site.
 */
type Dispatched = Omit<ChannelAction, 'userId'> & {
  type: ChannelAction['type'];
};

/**
 * Removing a member, which takes two of them agreeing.
 *
 * The rule itself is `core/__tests__/removal.test.ts`. What is left for this
 * file is the three things the server owns and core cannot: that the action is
 * reachable from a client at all and refused out loud where it is impossible,
 * that a carried removal leaves the person a card, and that an open motion is
 * withheld from the person it is about — which is the one piece of withholding
 * done to `ChannelState` itself rather than composed per connection, and so the
 * one that a future field could quietly undo.
 */

let app: App;
let clock = 1_700_000_000_000;

beforeEach(() => {
  clock = 1_700_000_000_000;
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

/** Alice knows Bob and Carol; they know only her, which is the ordinary shape. */
async function circle() {
  const alice = await signIn('alice@example.com', 'Alice');
  const bob = await signIn('bob@example.com', 'Bob');
  const carol = await signIn('carol@example.com', 'Carol');
  await befriend(alice, bob, 'bob@example.com');
  await befriend(alice, carol, 'carol@example.com');
  return { alice, bob, carol };
}

async function channelOf(initiator: User, contactIds: string[]) {
  const created = await app.fastify.inject({
    method: 'POST',
    url: '/channels',
    headers: auth(initiator.token),
    payload: { contactIds },
  });
  return (created.json() as { channelId: string }).channelId;
}

async function homeFor(user: User): Promise<HomeView> {
  const response = await app.fastify.inject({
    method: 'GET',
    url: '/home',
    headers: auth(user.token),
  });
  return response.json() as HomeView;
}

const move = (channelId: string, actor: User, target: User) =>
  app.channels.dispatch(channelId, actor.account.id, {
    type: 'MOVE_TO_REMOVE',
    targetId: target.account.id,
  } as Dispatched);

describe('a client may move, and is answered', () => {
  it('removes nobody on the first move and removes on the second', async () => {
    const { alice, bob, carol } = await circle();
    const id = await channelOf(alice, [bob.account.id, carol.account.id]);

    expect(move(id, alice, carol).ok).toBe(true);
    expect(app.channels.get(id)!.participants).toContain(carol.account.id);

    expect(move(id, bob, carol).ok).toBe(true);
    expect(app.channels.get(id)!.participants).not.toContain(carol.account.id);
    // Never by ending the channel, which is the reason a removal needs three.
    expect(app.channels.get(id)!.status).toBe('active');
  });

  it('refuses a channel of two out loud rather than silently', async () => {
    // The control is a confirmation somebody has just answered, so a move that
    // did nothing and said nothing reads as a dead button. The sentence names
    // the rule, because the rule is the whole answer.
    const { alice, bob } = await circle();
    const id = await channelOf(alice, [bob.account.id]);
    const refused = move(id, alice, bob);
    expect(refused.ok).toBe(false);
    if (refused.ok) throw new Error('unreachable');
    expect(refused.code).toBe('conflict');
    expect(refused.error).toContain('two members agreeing');
    expect(app.channels.get(id)!.participants).toContain(bob.account.id);
  });

  it('refuses a target that is not a string', async () => {
    const { alice, bob, carol } = await circle();
    const id = await channelOf(alice, [bob.account.id, carol.account.id]);
    const refused = app.channels.dispatch(id, alice.account.id, {
      type: 'MOVE_TO_REMOVE',
    } as never);
    expect(refused.ok).toBe(false);
  });

  it('will not let one member be both agreements', async () => {
    const { alice, bob, carol } = await circle();
    const id = await channelOf(alice, [bob.account.id, carol.account.id]);
    move(id, alice, carol);
    move(id, alice, carol);
    expect(app.channels.get(id)!.participants).toContain(carol.account.id);
  });
});

describe('the card the removed member is left with', () => {
  it('is on their Home, naming the channel and nobody else', async () => {
    const { alice, bob, carol } = await circle();
    const id = await channelOf(alice, [bob.account.id, carol.account.id]);
    app.channels.dispatch(id, alice.account.id, {
      type: 'SET_NAME',
      name: 'Standup',
    } as Dispatched);
    move(id, alice, carol);
    clock += 1_000;
    move(id, bob, carol);

    const home = await homeFor(carol);
    expect(home.removals).toEqual([
      { channelId: id, name: 'Standup', at: clock },
    ]);
    // The channel is gone from everything else of theirs, which is what makes
    // the card the only account they have of it.
    expect(home.rejoinable.map((r) => r.channelId)).not.toContain(id);
    expect(home.invites.map((i) => i.channelId)).not.toContain(id);

    // And nobody else is told anything.
    for (const user of [alice, bob]) {
      expect((await homeFor(user)).removals).toEqual([]);
    }
  });

  it('carries no name for a channel nobody had named', async () => {
    // Which is what stops the card describing it by a roster the reader is no
    // longer entitled to read.
    const { alice, bob, carol } = await circle();
    const id = await channelOf(alice, [bob.account.id, carol.account.id]);
    move(id, alice, carol);
    move(id, bob, carol);
    expect((await homeFor(carol)).removals?.[0]?.name).toBeNull();
  });

  it('goes when they say they have read it, and stays gone', async () => {
    const { alice, bob, carol } = await circle();
    const id = await channelOf(alice, [bob.account.id, carol.account.id]);
    move(id, alice, carol);
    move(id, bob, carol);

    const read = await app.fastify.inject({
      method: 'POST',
      url: `/removals/${id}/read`,
      headers: auth(carol.token),
    });
    expect(read.statusCode).toBe(200);
    expect((await homeFor(carol)).removals).toEqual([]);

    // Idempotent: the button is pressable twice on a slow connection.
    const again = await app.fastify.inject({
      method: 'POST',
      url: `/removals/${id}/read`,
      headers: auth(carol.token),
    });
    expect(again.statusCode).toBe(200);
  });

  it('is not written for an ordinary departure', async () => {
    const { alice, bob, carol } = await circle();
    const id = await channelOf(alice, [bob.account.id, carol.account.id]);
    app.channels.dispatch(id, carol.account.id, { type: 'LEAVE_CHANNEL' });
    expect((await homeFor(carol)).removals).toEqual([]);
  });

  it('is not written when the move did not carry', async () => {
    const { alice, bob, carol } = await circle();
    const id = await channelOf(alice, [bob.account.id, carol.account.id]);
    move(id, alice, carol);
    expect((await homeFor(carol)).removals).toEqual([]);
  });

  it('is replaced rather than kept when somebody is removed twice', async () => {
    // Removed, invited back, removed again. The card must be about the newer
    // removal; `OR IGNORE` would date it to a channel they have since been in.
    const { alice, bob, carol } = await circle();
    const id = await channelOf(alice, [bob.account.id, carol.account.id]);
    move(id, alice, carol);
    move(id, bob, carol);
    const first = (await homeFor(carol)).removals![0].at;

    app.channels.dispatch(id, alice.account.id, {
      type: 'INVITE',
      contactId: carol.account.id,
    } as unknown as Dispatched);
    clock += 60_000;
    move(id, alice, carol);
    move(id, bob, carol);

    const removals = (await homeFor(carol)).removals!;
    expect(removals).toHaveLength(1);
    expect(removals[0].at).toBe(clock);
    expect(removals[0].at).not.toBe(first);
  });
});

describe('an open motion is withheld from the person it is about', () => {
  it('so their own snapshot carries nothing about them', async () => {
    const { alice, bob, carol } = await circle();
    const id = await channelOf(alice, [bob.account.id, carol.account.id]);
    move(id, alice, carol);
    // Everybody else sees it, which is what makes the withholding a choice
    // rather than the field being unused.
    const state = app.channels.get(id)!;
    expect(state.removals?.[carol.account.id]?.movedBy).toEqual([
      alice.account.id,
    ]);
    // The redaction itself is `withoutRemovalsAgainst`, applied on the way out
    // of `pushChannel`; asserted through it rather than through a socket, a
    // snapshot being a push rather than a route.
    const {
      withoutRemovalsAgainst,
    } = require('../../core/channel') as typeof import('../../core/channel');
    expect(withoutRemovalsAgainst(state, carol.account.id).removals).toEqual({});
    expect(withoutRemovalsAgainst(state, bob.account.id)).toBe(state);
  });
});

describe('a motion outlives the process', () => {
  it('because it is in the durable projection', async () => {
    // A motion stands for a day so that the two who agree need not be in the
    // room together, and a day is far longer than this process lives.
    const { alice, bob, carol } = await circle();
    const id = await channelOf(alice, [bob.account.id, carol.account.id]);
    move(id, alice, carol);

    const row = app.db
      .prepare('SELECT state FROM channels WHERE id = ?')
      .get(id) as { state: string };
    const durable = JSON.parse(row.state) as {
      removals?: Record<string, { movedBy: string[]; at: number }>;
    };
    expect(durable.removals?.[carol.account.id]?.movedBy).toEqual([
      alice.account.id,
    ]);
  });
});
