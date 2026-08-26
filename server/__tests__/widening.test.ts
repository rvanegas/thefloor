import { buildApp, type App } from '../src/app';
import { MemoryMailer } from '../src/mail';
import { MemoryMediaServer } from '../src/media';

/**
 * What an unnamed channel's invitation means.
 *
 * It widens the channel, exactly as an invitation into a named one does. That
 * is the whole of it, and it is worth a file because it did not use to be: an
 * unnamed channel was its people and could not be widened, so asking somebody
 * in moved the conversation to the unnamed channel for the wider set, creating
 * it if it did not exist.
 *
 * The move worked and was invisible, which was the problem. Recordings stayed
 * with the channel they were made in — correctly, they being a record of what
 * was said there — but the conversation was now somewhere else, so people
 * reported that their recordings had disappeared. See planning/decisions/DECISIONS.md.
 *
 * What the move bought was one unnamed channel per set of people. That is now
 * given up: widening can leave two with the same roster, indistinguishable on
 * Home. `create` still refuses to make a second, which is what keeps the
 * Start-a-channel button idempotent, and is asserted at the foot of this file.
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
  it('adds a participant to the channel, creating nothing', async () => {
    const { alice, bob, carol, channelId } = await pair();
    const before = countChannels();

    expect(invite(channelId, alice, carol).ok).toBe(true);

    const channel = app.channels.get(channelId)!;
    expect(channel.participants).toEqual([
      alice.account.id,
      bob.account.id,
      carol.account.id,
    ]);
    expect(channel.invitedBy[carol.account.id]).toBe(alice.account.id);
    expect(countChannels()).toBe(before);
    // Membership without presence: she has been asked, not moved.
    expect(channel.present).not.toContain(carol.account.id);

    // Carol is asked, and told who asked — the same shape as any invitation,
    // because to her it is one.
    const invites = app.channels.invitesFor(carol.account.id);
    expect(invites).toHaveLength(1);
    expect(invites[0].channelId).toBe(channelId);
    expect(invites[0].from.id).toBe(alice.account.id);
  });

  /**
   * An invitation has to be identifiable and honest about the room.
   *
   * It used to carry only who sent it, so two invitations from one person were
   * indistinguishable — the App Review account met exactly that on
   * 2026-08-17, two banners reading "Johnny Tahoe is waiting in a channel" for
   * two different channels — and the banner claimed somebody was waiting even
   * after they had stepped out.
   */
  it('says which channel it is for, and whether anyone is in it', async () => {
    const { alice, bob, carol, channelId } = await pair();
    expect(invite(channelId, alice, carol).ok).toBe(true);

    const [unnamed] = app.channels.invitesFor(carol.account.id);
    // Unnamed, so it is describable rather than nameable — by its roster, the
    // way every other list describes one.
    expect(unnamed.name).toBeNull();
    expect(unnamed.others?.map((o) => o.id).sort()).toEqual(
      [alice.account.id, bob.account.id].sort()
    );

    // Alice and Bob are both in it, having been paired into it.
    expect(unnamed.presentCount).toBeGreaterThan(0);

    // Everyone steps out: the invitation stands, and stops saying otherwise.
    app.channels.dispatch(channelId, alice.account.id, { type: 'STEP_OUT' });
    app.channels.dispatch(channelId, bob.account.id, { type: 'STEP_OUT' });
    const [empty] = app.channels.invitesFor(carol.account.id);
    expect(empty.channelId).toBe(channelId);
    expect(empty.presentCount).toBe(0);
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

  it('lets the invitee see the channel, being a member of it now', async () => {
    const { alice, carol, channelId } = await pair();
    invite(channelId, alice, carol);

    // She could not see it at all before: an unnamed channel's invitation was
    // not membership, so `viewableBy` refused her the snapshot.
    expect(app.channels.viewableBy(channelId, carol.account.id)).toBeDefined();
  });

  it('refuses somebody who was never asked, there being no exception left', async () => {
    const { alice, bob, channelId } = await pair();
    const dave = await signIn('dave@example.com', 'Dave');
    await befriend(alice, dave, 'dave@example.com');

    // `dispatch` used to let a non-participant ENTER when the channel held an
    // invitation for them. Nothing is parked anywhere now, so the ordinary
    // refusal is the only answer.
    expect(
      app.channels.dispatch(channelId, dave.account.id, { type: 'ENTER' })
    ).toEqual({ ok: false, error: 'Not your channel.', code: 'forbidden' });
    expect(app.channels.get(channelId)!.participants).toEqual([
      alice.account.id,
      bob.account.id,
    ]);
  });
});

describe('the invitee arriving', () => {
  it('lands in the channel they were asked into, moving nobody', async () => {
    const { alice, bob, carol, channelId } = await pair();
    invite(channelId, alice, carol);
    const before = countChannels();

    const entered = app.channels.dispatch(channelId, carol.account.id, {
      type: 'ENTER',
    });
    expect(entered.ok).toBe(true);
    expect((entered as { ok: true; channel: { id: string } }).channel.id).toBe(
      channelId
    );
    expect(countChannels()).toBe(before);

    const channel = app.channels.get(channelId)!;
    expect(channel.present.sort()).toEqual(
      [alice.account.id, bob.account.id, carol.account.id].sort()
    );
    // Still unnamed, and now described by three names instead of two — which is
    // the whole of what "its display name is recalculated" means.
    expect(channel.name).toBeNull();
  });

  it('leaves the audio room alone, nothing having gone anywhere', async () => {
    const { alice, carol, channelId } = await pair();
    const room = app.channels.get(channelId)!.mediaRoom;
    expect(room).toBe(channelId);

    invite(channelId, alice, carol);
    app.channels.dispatch(channelId, carol.account.id, { type: 'ENTER' });

    // No hand-over, so no chance of a reconnection: it is the same room it was.
    expect(app.channels.get(channelId)!.mediaRoom).toBe(room);
    const token = await app.fastify.inject({
      method: 'POST',
      url: `/channels/${channelId}/media-token`,
      headers: auth(carol.token),
    });
    expect(token.statusCode).toBe(200);
    expect(media.issued.at(-1)!.room).toBe(room);
  });

  it('keeps the recordings on the channel, which is the point of all this', async () => {
    const { alice, carol, channelId } = await pair();
    app.channels.dispatch(channelId, alice.account.id, { type: 'START_RECORDING' });
    await settle();
    clock += 5_000;
    app.channels.dispatch(channelId, alice.account.id, { type: 'STOP_RECORDING' });
    await settle();
    expect(
      app.channels.recordingsInChannel(channelId, alice.account.id)
    ).toHaveLength(1);

    invite(channelId, alice, carol);
    app.channels.dispatch(channelId, carol.account.id, { type: 'ENTER' });

    // Alice's recording is where she made it and where she is still standing.
    // It used to be on a channel she had been walked out of, which is what
    // people reported as their recordings having disappeared.
    expect(
      app.channels.recordingsInChannel(channelId, alice.account.id)
    ).toHaveLength(1);
    expect(app.channels.recordingsFor(alice.account.id)).toHaveLength(1);
  });

  /**
   * A consequence of widening rather than moving, and the one worth stating
   * out loud: recordings are reachable by membership, so somebody asked into a
   * channel can hear what was recorded in it before they arrived.
   *
   * The move used to prevent this for unnamed channels by leaving the
   * recordings behind. Naming a channel never prevented it, so this is not a
   * new rule so much as the same rule now applying everywhere — which is the
   * price of there being one kind of channel again.
   */
  it('gives the newcomer the channel’s existing recordings', async () => {
    const { alice, carol, channelId } = await pair();
    app.channels.dispatch(channelId, alice.account.id, { type: 'START_RECORDING' });
    await settle();
    clock += 5_000;
    app.channels.dispatch(channelId, alice.account.id, { type: 'STOP_RECORDING' });
    await settle();

    expect(app.channels.recordingsFor(carol.account.id)).toEqual([]);
    invite(channelId, alice, carol);
    expect(app.channels.recordingsFor(carol.account.id)).toHaveLength(1);
  });

  it('joins in place whether or not the channel has a name', async () => {
    const { alice, bob, carol, channelId } = await pair();
    app.channels.dispatch(channelId, alice.account.id, {
      type: 'SET_NAME',
      name: 'Product Meeting',
    } as never);
    invite(channelId, alice, carol);

    const entered = app.channels.dispatch(channelId, carol.account.id, {
      type: 'ENTER',
    });
    expect((entered as { ok: true; channel: { id: string } }).channel.id).toBe(
      channelId
    );
    expect(app.channels.get(channelId)!.present.sort()).toEqual(
      [alice.account.id, bob.account.id, carol.account.id].sort()
    );
  });
});

describe('two unnamed channels with the same people', () => {
  it('can exist, one made by widening and one by starting a channel', async () => {
    const { alice, bob, carol, channelId } = await pair();
    // Alice and Bob widen theirs to include Carol.
    invite(channelId, alice, carol);
    expect(app.channels.get(channelId)!.participants).toHaveLength(3);

    // The trio now has an unnamed channel. Alice starts one with the same three
    // and finds it rather than making a second.
    const found = await createChannel(alice, [bob.account.id, carol.account.id]);
    expect(found).toBe(channelId);

    // But a second pair channel, widened again, is a genuine duplicate — two
    // unnamed channels of the same three people, indistinguishable on Home.
    // Accepted deliberately; the alternative was moving conversations.
    const second = await createChannel(alice, [bob.account.id]);
    expect(second).not.toBe(channelId);
    invite(second, alice, carol);

    const trios = [channelId, second].map(
      (id) => app.channels.get(id)!.participants.length
    );
    expect(trios).toEqual([3, 3]);
    expect(app.channels.get(second)!.name).toBeNull();
    expect(app.channels.get(channelId)!.name).toBeNull();
  });
});

describe('one unnamed channel per set of people, in create only', () => {
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

  it('allows clearing a name even when that makes a second unnamed channel', async () => {
    const { alice, bob } = await circle();
    const named = await createChannel(alice, [bob.account.id]);
    app.channels.dispatch(named, alice.account.id, {
      type: 'SET_NAME',
      name: 'Product Meeting',
    } as never);
    const other = await createChannel(alice, [bob.account.id]);

    // Refused once, on the grounds that it would leave two unnamed channels of
    // the same people. Widening can do that anyway, so the guard was buying a
    // dead button rather than an invariant.
    const cleared = app.channels.dispatch(named, alice.account.id, {
      type: 'SET_NAME',
      name: '',
    } as never);
    expect(cleared.ok).toBe(true);
    expect(app.channels.get(named)!.name).toBeNull();
    expect(app.channels.get(other)!.name).toBeNull();
  });
});
