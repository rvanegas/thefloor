import { buildApp, type App } from '../src/app';
import { MemoryMailer } from '../src/mail';
import { MemoryMediaServer } from '../src/media';
import type { Move } from '../src/channels';

/**
 * What an unnamed channel's invitation means.
 *
 * An unnamed channel is its people — there is one per set, and it is described
 * on screen by who is in it rather than named. So it cannot be widened: asking
 * somebody in moves the conversation to the unnamed channel for the wider set,
 * which either already exists or is created on the spot.
 *
 * The audio does not move with it. The destination takes over the room the
 * people are already talking in, which is the whole reason a channel has a
 * `mediaRoom` distinct from its id, and is asserted here more than once
 * because a regression would be inaudible in tests and very audible on a
 * phone: everybody's call would drop and rebuild to say something that is pure
 * bookkeeping.
 */

let app: App;
let media: MemoryMediaServer;
let clock = 1_700_000_000_000;

beforeEach(() => {
  clock = 1_700_000_000_000;
  media = new MemoryMediaServer();
  app = buildApp({
    dbPath: ':memory:',
    mailer: new MemoryMailer(),
    media,
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

/** Alice knows everyone; the others only know Alice. */
async function circle() {
  const alice = await signIn('alice@example.com', 'Alice');
  const bob = await signIn('bob@example.com', 'Bob');
  const carol = await signIn('carol@example.com', 'Carol');
  await befriend(alice, bob, 'bob@example.com');
  await befriend(alice, carol, 'carol@example.com');
  return { alice, bob, carol };
}

async function createChannel(initiator: User, contactIds: string[]) {
  const created = await app.fastify.inject({
    method: 'POST',
    url: '/channels',
    headers: auth(initiator.token),
    payload: { contactIds },
  });
  return (created.json() as { channelId: string }).channelId;
}

/** Alice and Bob talking in an unnamed channel, with Carol to be asked in. */
async function pair() {
  const { alice, bob, carol } = await circle();
  const channelId = await createChannel(alice, [bob.account.id]);
  app.channels.dispatch(channelId, bob.account.id, { type: 'ENTER' });
  return { alice, bob, carol, channelId };
}

/** How many live channels exist, to prove a move created none. */
const countChannels = () =>
  (
    app.channels as unknown as { channels: Map<string, unknown> }
  ).channels.size;

const invite = (channelId: string, by: User, contact: User) =>
  app.channels.dispatch(channelId, by.account.id, {
    type: 'INVITE',
    contactId: contact.account.id,
  } as never);

describe('inviting into an unnamed channel', () => {
  it('records the invitation without widening the channel', async () => {
    const { alice, bob, carol, channelId } = await pair();

    expect(invite(channelId, alice, carol).ok).toBe(true);

    const channel = app.channels.get(channelId)!;
    expect(channel.participants).toEqual([alice.account.id, bob.account.id]);
    expect(channel.invited).toEqual({ [carol.account.id]: alice.account.id });

    // Carol is asked, and told who asked — the same shape as any invitation,
    // because to her it is one.
    const invites = app.channels.invitesFor(carol.account.id);
    expect(invites).toHaveLength(1);
    expect(invites[0].channelId).toBe(channelId);
    expect(invites[0].from.id).toBe(alice.account.id);
  });

  it('refuses the same people an invitation into a named channel refuses', async () => {
    const { alice, bob, carol, channelId } = await pair();
    // Carol is Alice's contact, not Bob's.
    expect(invite(channelId, bob, carol)).toEqual({
      ok: false,
      error: 'Not a contact.',
      code: 'forbidden',
    });
    expect(invite(channelId, alice, bob)).toEqual({
      ok: false,
      error: 'Already in this channel.',
      code: 'conflict',
    });
  });

  it('gives the invitee no other way to act on the channel', async () => {
    const { alice, carol, channelId } = await pair();
    invite(channelId, alice, carol);

    // Being asked in is not being in. Everything except answering is refused,
    // and answering is `ENTER` alone.
    expect(
      app.channels.dispatch(channelId, carol.account.id, { type: 'CLAIM_FLOOR' })
    ).toEqual({ ok: false, error: 'Not your channel.', code: 'forbidden' });
    expect(app.channels.viewableBy(channelId, carol.account.id)).toBeUndefined();
  });
});

describe('the invitee arriving', () => {
  it('moves everybody to the unnamed channel for the wider set', async () => {
    const { alice, bob, carol, channelId } = await pair();
    invite(channelId, alice, carol);

    const entered = app.channels.dispatch(channelId, carol.account.id, {
      type: 'ENTER',
    });
    expect(entered.ok).toBe(true);

    const moved = (entered as { ok: true; channel: { id: string } }).channel;
    expect(moved.id).not.toBe(channelId);

    const target = app.channels.get(moved.id)!;
    expect(target.name).toBeNull();
    expect(target.participants.sort()).toEqual(
      [alice.account.id, bob.account.id, carol.account.id].sort()
    );
    expect(target.present.sort()).toEqual(
      [alice.account.id, bob.account.id, carol.account.id].sort()
    );

    // The channel they left is empty, still theirs, and still unnamed — which
    // is what keeps it the one channel for that pair.
    const source = app.channels.get(channelId)!;
    expect(source.present).toEqual([]);
    expect(source.participants).toEqual([alice.account.id, bob.account.id]);
    expect(source.status).toBe('active');
    expect(source.invited).toEqual({});
  });

  it('carries the audio across, so nobody reconnects', async () => {
    const { alice, bob, carol, channelId } = await pair();
    const room = app.channels.get(channelId)!.mediaRoom;
    expect(room).toBe(channelId);

    invite(channelId, alice, carol);
    const entered = app.channels.dispatch(channelId, carol.account.id, {
      type: 'ENTER',
    });
    const targetId = (entered as { ok: true; channel: { id: string } }).channel.id;

    // The destination is holding the room those two were already talking in.
    expect(app.channels.get(targetId)!.mediaRoom).toBe(room);

    // And the token the app would fetch for the new channel names that same
    // room, which is the whole claim: an unchanged room is an unchanged
    // connection.
    const token = await app.fastify.inject({
      method: 'POST',
      url: `/channels/${targetId}/media-token`,
      headers: auth(alice.token),
    });
    expect(token.statusCode).toBe(200);
    expect(media.issued.at(-1)!.room).toBe(room);

    // The channel left behind takes a fresh one. Sharing would put whoever
    // walked back into it inside the conversation that moved on.
    expect(app.channels.get(channelId)!.mediaRoom).not.toBe(room);
    expect(app.channels.get(channelId)!.mediaRoom).not.toBe(
      app.channels.get(targetId)!.mediaRoom
    );
  });

  it('changes channel rather than creating one when the wider set already has an unnamed channel', async () => {
    const { alice, bob, carol, channelId } = await pair();
    // The three of them already have one, from some earlier conversation.
    const existing = await createChannel(alice, [bob.account.id, carol.account.id]);
    app.channels.dispatch(existing, alice.account.id, { type: 'STEP_OUT' });
    // Alice is back with Bob in the pair channel.
    app.channels.dispatch(channelId, alice.account.id, { type: 'ENTER' });
    const before = countChannels();

    invite(channelId, alice, carol);
    const entered = app.channels.dispatch(channelId, carol.account.id, {
      type: 'ENTER',
    });

    expect((entered as { ok: true; channel: { id: string } }).channel.id).toBe(
      existing
    );
    expect(countChannels()).toBe(before);
    expect(app.channels.get(existing)!.present.sort()).toEqual(
      [alice.account.id, bob.account.id, carol.account.id].sort()
    );
  });

  it('leaves the recordings with the channel they were made in', async () => {
    const { alice, bob, carol, channelId } = await pair();
    app.channels.dispatch(channelId, alice.account.id, { type: 'START_RECORDING' });
    await settle();
    clock += 5_000;
    app.channels.dispatch(channelId, alice.account.id, { type: 'STOP_RECORDING' });
    await settle();
    expect(app.channels.recordingsInChannel(channelId, alice.account.id)).toHaveLength(1);

    invite(channelId, alice, carol);
    const entered = app.channels.dispatch(channelId, carol.account.id, {
      type: 'ENTER',
    });
    const targetId = (entered as { ok: true; channel: { id: string } }).channel.id;

    // What was said stays where it was said. Carol was not there and does not
    // acquire it by joining the conversation that followed.
    expect(app.channels.recordingsInChannel(channelId, alice.account.id)).toHaveLength(1);
    expect(app.channels.recordingsInChannel(targetId, alice.account.id)).toEqual([]);
    expect(app.channels.recordingsFor(carol.account.id)).toEqual([]);
  });

  it('announces where everybody went, to exactly the people it moved', async () => {
    const { alice, bob, carol, channelId } = await pair();
    const moves: Move[] = [];
    app.channels.onMove((move) => moves.push(move));

    invite(channelId, alice, carol);
    const entered = app.channels.dispatch(channelId, carol.account.id, {
      type: 'ENTER',
    });
    const targetId = (entered as { ok: true; channel: { id: string } }).channel.id;

    expect(moves).toHaveLength(1);
    expect(moves[0].from).toBe(channelId);
    expect(moves[0].to).toBe(targetId);
    expect(moves[0].userIds.sort()).toEqual(
      [alice.account.id, bob.account.id, carol.account.id].sort()
    );
  });

  it('moves nobody when there was nobody there, and hands over no audio', async () => {
    const { alice, bob, carol, channelId } = await pair();
    invite(channelId, alice, carol);
    const room = app.channels.get(channelId)!.mediaRoom;
    // Both walk away before Carol answers.
    app.channels.dispatch(channelId, alice.account.id, { type: 'STEP_OUT' });
    app.channels.dispatch(channelId, bob.account.id, { type: 'STEP_OUT' });

    const entered = app.channels.dispatch(channelId, carol.account.id, {
      type: 'ENTER',
    });
    const targetId = (entered as { ok: true; channel: { id: string } }).channel.id;

    expect(app.channels.get(targetId)!.present).toEqual([carol.account.id]);
    // Nothing was being said, so nothing was carried: the pair channel keeps
    // the room it never left.
    expect(app.channels.get(channelId)!.mediaRoom).toBe(room);
    expect(app.channels.get(targetId)!.mediaRoom).toBe(targetId);
  });

  it('joins in place when the channel has been named since the invitation', async () => {
    const { alice, bob, carol, channelId } = await pair();
    invite(channelId, alice, carol);
    app.channels.dispatch(channelId, alice.account.id, {
      type: 'SET_NAME',
      name: 'Product Meeting',
    } as never);

    const entered = app.channels.dispatch(channelId, carol.account.id, {
      type: 'ENTER',
    });
    // A named channel is a place, and a place takes people in. Nothing moves.
    expect((entered as { ok: true; channel: { id: string } }).channel.id).toBe(
      channelId
    );
    const channel = app.channels.get(channelId)!;
    expect(channel.participants).toContain(carol.account.id);
    expect(channel.present.sort()).toEqual(
      [alice.account.id, bob.account.id, carol.account.id].sort()
    );
    expect(channel.invited).toEqual({});
  });
});

describe('one unnamed channel per set of people', () => {
  it('reuses the unnamed one and ignores a named one with the same people', async () => {
    const { alice, bob } = await circle();
    const unnamed = await createChannel(alice, [bob.account.id]);
    app.channels.dispatch(unnamed, alice.account.id, {
      type: 'SET_NAME',
      name: 'Product Meeting',
    } as never);

    // Named, so it no longer answers for "a channel with Bob": starting one
    // now opens a second channel rather than reopening that one.
    const second = await createChannel(alice, [bob.account.id]);
    expect(second).not.toBe(unnamed);
    expect(app.channels.get(second)!.name).toBeNull();

    // And that second, unnamed one is what a further tap finds.
    const third = await createChannel(alice, [bob.account.id]);
    expect(third).toBe(second);
  });

  it('refuses to clear a name that would make a second unnamed channel', async () => {
    const { alice, bob } = await circle();
    const named = await createChannel(alice, [bob.account.id]);
    app.channels.dispatch(named, alice.account.id, {
      type: 'SET_NAME',
      name: 'Product Meeting',
    } as never);
    await createChannel(alice, [bob.account.id]);

    const cleared = app.channels.dispatch(named, alice.account.id, {
      type: 'SET_NAME',
      name: '',
    } as never);
    expect(cleared).toEqual({
      ok: false,
      error:
        'You already have a channel with these people and no name. Rename this one instead of clearing it.',
      code: 'conflict',
    });
    expect(app.channels.get(named)!.name).toBe('Product Meeting');

    // Renaming is always free — a name is what tells two channels of the same
    // people apart, so there is no limit on having one.
    const renamed = app.channels.dispatch(named, alice.account.id, {
      type: 'SET_NAME',
      name: 'Retro',
    } as never);
    expect(renamed.ok).toBe(true);
  });

  it('allows clearing a name when nothing else answers for those people', async () => {
    const { alice, bob } = await circle();
    const only = await createChannel(alice, [bob.account.id]);
    app.channels.dispatch(only, alice.account.id, {
      type: 'SET_NAME',
      name: 'Product Meeting',
    } as never);

    const cleared = app.channels.dispatch(only, alice.account.id, {
      type: 'SET_NAME',
      name: '',
    } as never);
    expect(cleared.ok).toBe(true);
    expect(app.channels.get(only)!.name).toBeNull();
  });
});
