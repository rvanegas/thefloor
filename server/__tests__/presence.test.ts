import { isWaiting, subscribeable } from '../../core/channel';
import {
  ATTENTION_REPORT_MS,
  ATTENTION_WINDOW_MS,
  DISCONNECT_GRACE_MS,
} from '../../core/constants';
import { buildApp, type App } from '../src/app';
import { MEDIA_JOIN_GRACE_MS, playbackIdentity } from '../src/channels';
import { MemoryMailer } from '../src/mail';
import { MemoryMediaServer } from '../src/media';
import { MemoryRecordingStore } from '../src/storage';

/**
 * Presence is the media connection.
 *
 * **The definition did not change on 2026-09-08; the implementation caught up
 * with it.** planning/GLOSSARY.md § *Present* has always said *able to hear and
 * be heard, right now*, which is publishing or subscribing, which is being in
 * the room. What the server did instead was take an `ENTER` on trust and let a
 * live *control socket* sustain it for ever.
 *
 * The bug that forced it, and the first test below: step into a room alone,
 * force quit, reopen, and open the channel screen. The new process has no
 * presence to re-assert, so it sends `watch.channel` and nothing else — and
 * that reported CONNECTED, cancelled the grace period that was about to retire
 * the account, and did so again on every reconnection. The roster said the
 * person was there. Their own screen, correctly, offered *Step in*.
 *
 * **Nothing here removes anybody directly.** The room's answer feeds the same
 * `report` a socket's does, so an absence starts DISCONNECT_GRACE_MS and leaves
 * by `DISCONNECT_EXPIRED` — which is *Nearby*, the state that says *within
 * reach, one notification away*. There is deliberately no second way out of a
 * room, and these tests assert the ordinary one is the one taken.
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
    store: new MemoryRecordingStore(),
    now: () => clock,
    roomCloseGraceMs: 0,
    mixWaitMs: 0,
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

/**
 * Alice and Bob, contacts, both present — and both in the room, because asking
 * this fake for a token is what puts an identity in its roster.
 */
async function roomOfTwo() {
  const alice = await signIn('alice@example.com', 'Alice');
  const bob = await signIn('bob@example.com', 'Bob');
  await befriend(alice, bob, 'bob@example.com');
  const created = await app.fastify.inject({
    method: 'POST',
    url: '/channels',
    headers: auth(alice.token),
    payload: { contactId: bob.account.id },
  });
  const { channelId } = created.json() as { channelId: string };
  app.channels.dispatch(channelId, bob.account.id, { type: 'ENTER' });
  await app.channels.mediaToken(channelId, alice.account.id);
  await app.channels.mediaToken(channelId, bob.account.id);
  return { alice: alice.account, bob: bob.account, channelId };
}

async function poll() {
  app.channels.pollUsage();
  await settle();
}

const channel = (channelId: string) => app.channels.get(channelId)!;
const graceOn = (channelId: string, id: string) =>
  channel(channelId).disconnectedAt[id] !== undefined;

/** Long enough that an unanswered presence has stopped being a slow connect. */
const pastTheJoinWindow = () => {
  clock += MEDIA_JOIN_GRACE_MS + 1;
};

describe('a presence the room stops holding', () => {
  it('is retired to nearby', async () => {
    const { alice, bob, channelId } = await roomOfTwo();
    await poll();
    expect(graceOn(channelId, bob.id)).toBe(false);

    // The force quit. No socket closes here — that path has its own test, and
    // the point of this one is that the room alone is enough.
    media.leaveRoom(channelId, bob.id);
    pastTheJoinWindow();
    await poll();
    expect(graceOn(channelId, bob.id)).toBe(true);

    clock += DISCONNECT_GRACE_MS;
    app.channels.tick();
    expect(channel(channelId).present).not.toContain(bob.id);
    // Nearby, not gone: `exit: 'dropped'` is what the poll's report resolves
    // to, and it is the same arm a lost socket takes.
    expect(channel(channelId).waiting).toContain(bob.id);
    // And it is one person's departure, not the room's.
    expect(channel(channelId).present).toContain(alice.id);
  });

  it('is spared if it comes back before the grace runs out', async () => {
    const { bob, channelId } = await roomOfTwo();
    await poll();

    media.leaveRoom(channelId, bob.id);
    pastTheJoinWindow();
    await poll();
    expect(graceOn(channelId, bob.id)).toBe(true);

    // A blip: the same person, back in the room, inside the minute.
    media.joinRoom(channelId, bob.id);
    await poll();
    expect(graceOn(channelId, bob.id)).toBe(false);

    clock += DISCONNECT_GRACE_MS;
    app.channels.tick();
    expect(channel(channelId).present).toContain(bob.id);
  });
});

describe('a place the socket stopped holding', () => {
  /**
   * **A backgrounded phone keeps its claim for as long as it holds the audio,
   * and the socket is what says whether it still does.**
   *
   * Observed on 2026-09-08: backgrounding stopped the engine, the session was
   * released, iOS suspended the process — and the roster went on saying
   * *Present* while nothing was heard, because the SFU still listed the
   * suspended process and the poll reported it `CONNECTED` on every pass,
   * cancelling the grace the closing socket had started. The person was
   * present, deaf, and unpingable, which is the one combination no state in
   * this app is supposed to have.
   */
  it('is not held open by a room that still lists the process', async () => {
    const { alice, bob, channelId } = await roomOfTwo();
    await poll();

    // The socket goes; the room does not, which is exactly the suspended case.
    app.channels.report(channelId, bob.id, 'DISCONNECTED', 'socket');
    expect(graceOn(channelId, bob.id)).toBe(true);

    // Polls all the way through the minute, each one seeing bob in the room.
    await poll();
    await poll();
    expect(graceOn(channelId, bob.id)).toBe(true);

    clock += DISCONNECT_GRACE_MS;
    app.channels.tick();
    expect(channel(channelId).present).not.toContain(bob.id);
    // Nearby, by the one route out: within reach, and a ping reaches a phone
    // whose process is gone where nothing else does.
    expect(channel(channelId).waiting).toContain(bob.id);
    expect(channel(channelId).present).toContain(alice.id);
  });

  it('is restored by the client re-entering inside the minute', async () => {
    // The other half, and what makes the rule above safe: a reconnecting
    // client re-sends `ENTER` from `enteredChannel`, and that arm clears the
    // grace. The socket takes back its own report; nothing else has to.
    const { bob, channelId } = await roomOfTwo();
    await poll();

    app.channels.report(channelId, bob.id, 'DISCONNECTED', 'socket');
    expect(graceOn(channelId, bob.id)).toBe(true);

    app.channels.dispatch(channelId, bob.id, { type: 'ENTER' });
    expect(graceOn(channelId, bob.id)).toBe(false);

    clock += DISCONNECT_GRACE_MS;
    app.channels.tick();
    expect(channel(channelId).present).toContain(bob.id);
  });
});

describe('a presence the room has not yet confirmed', () => {
  it('is left alone while it is still connecting', async () => {
    const alice = await signIn('alice@example.com', 'Alice');
    const bob = await signIn('bob@example.com', 'Bob');
    await befriend(alice, bob, 'bob@example.com');
    const created = await app.fastify.inject({
      method: 'POST',
      url: '/channels',
      headers: auth(alice.token),
      payload: { contactId: bob.account.id },
    });
    const { channelId } = created.json() as { channelId: string };

    // Stepped in and not yet in the room, which is every step-in for as long as
    // it takes to fetch a token and connect. Reporting an absence here would
    // write `disconnectedAt`, which the roster renders as *reconnecting* — so
    // the cost of being early is a lie under the name of somebody who has just
    // walked in, on every arrival.
    app.channels.dispatch(channelId, bob.account.id, { type: 'ENTER' });
    await poll();
    expect(graceOn(channelId, bob.account.id)).toBe(false);

    clock += MEDIA_JOIN_GRACE_MS - 1;
    await poll();
    expect(graceOn(channelId, bob.account.id)).toBe(false);

    // And then they arrive, and the window stops mattering.
    await app.channels.mediaToken(channelId, bob.account.id);
    clock += MEDIA_JOIN_GRACE_MS * 4;
    await poll();
    expect(graceOn(channelId, bob.account.id)).toBe(false);
  });

  it('is retired if it never arrives at all', async () => {
    const alice = await signIn('alice@example.com', 'Alice');
    const bob = await signIn('bob@example.com', 'Bob');
    await befriend(alice, bob, 'bob@example.com');
    const created = await app.fastify.inject({
      method: 'POST',
      url: '/channels',
      headers: auth(alice.token),
      payload: { contactId: bob.account.id },
    });
    const { channelId } = created.json() as { channelId: string };

    // The token fetch failed, or the connect did. Nothing bounded this before:
    // the account was present because it said so, and only a tap took it back.
    app.channels.dispatch(channelId, bob.account.id, { type: 'ENTER' });
    pastTheJoinWindow();
    await poll();
    expect(graceOn(channelId, bob.account.id)).toBe(true);

    clock += DISCONNECT_GRACE_MS;
    app.channels.tick();
    expect(channel(channelId).present).not.toContain(bob.account.id);
    expect(channel(channelId).waiting).toContain(bob.account.id);
  });
});

describe('the shared-track participant', () => {
  it('is not a person and holds nobody in the room', async () => {
    const { alice, bob, channelId } = await roomOfTwo();
    await poll();

    // It is in the roster and is not an account — `media:<channelId>` joins to
    // publish a shared track and costs the box what a person does, which is why
    // the meter counts it. Presence must not: a room emptied of people is empty
    // however many of this server's own participants are still in it.
    media.joinRoom(channelId, playbackIdentity(channelId));
    media.leaveRoom(channelId, alice.id);
    media.leaveRoom(channelId, bob.id);
    pastTheJoinWindow();
    await poll();

    clock += DISCONNECT_GRACE_MS;
    app.channels.tick();
    expect(channel(channelId).present).toHaveLength(0);
  });
});

/**
 * The heartbeat, on the rung below presence.
 *
 * `stillHere` runs on every message a watching socket sends, and until
 * 2026-09-09 it was refused for anybody not in the room — so somebody nearby
 * with the channel open watched their own card count towards fifteen minutes
 * with no way to stop it but stepping in or out. The evidence was already
 * arriving; the rule was discarding it.
 *
 * What is tested here is the half that only exists in the server: a present
 * member's heartbeat stays free, and a nearby member's is pushed to the
 * channel on a cadence of its own rather than at the heartbeat's. The clock
 * rules themselves are `core/__tests__/nearby.test.ts`.
 */
describe('a heartbeat from somebody nearby', () => {
  const beats = (channelId: string, userId: string, seconds: number) => {
    for (let i = 0; i < seconds / 2; i += 1) {
      clock += 2_000;
      app.channels.stillHere(channelId, userId);
    }
  };

  it('keeps the declaration alive without pushing at the heartbeat rate', async () => {
    const { bob, channelId } = await roomOfTwo();
    app.channels.dispatch(channelId, bob.id, { type: 'DECLARE_NEARBY' });

    let pushes = 0;
    const stop = app.channels.onChange(() => {
      pushes += 1;
    });
    // Ten minutes of heartbeats, two seconds apart: three hundred of them.
    beats(channelId, bob.id, 10 * 60);
    stop();

    // Still nearby well past the window it would have lapsed in, because every
    // heartbeat moved the declaration's own clock.
    expect(isWaiting(channel(channelId), bob.id)).toBe(true);
    // And the channel heard about it roughly once a minute rather than three
    // hundred times. Bounded rather than exact: what matters is the order.
    expect(pushes).toBeGreaterThan(0);
    expect(pushes).toBeLessThanOrEqual(11);
  });

  it('costs a present member nothing, as it always did', async () => {
    const { bob, channelId } = await roomOfTwo();
    let pushes = 0;
    const stop = app.channels.onChange(() => {
      pushes += 1;
    });
    beats(channelId, bob.id, 10 * 60);
    stop();

    // Nothing readable changes while somebody is present — `idleMs` answers
    // null for them whatever the stamp says — so there is no screen to redraw
    // and no snapshot to spend.
    expect(channel(channelId).present).toContain(bob.id);
    expect(pushes).toBe(0);
  });
});

/**
 * The attention clock, which the server holds and the tick reads.
 *
 * **It was two client-side clocks until 2026-09-09** — one per platform, each
 * scoped to the channel that client was standing in, each deciding for itself
 * when fifteen minutes had passed and saying so with `ATTENTION_EXPIRED`.
 * Nobody else could see either of them, so nothing could be shown about
 * anybody, and the rung below presence had no such clock at all.
 *
 * What is only knowable here is the arbitration: whose clock decides what, in
 * which channel, and what happens to the builds that do not report one.
 */
describe('the attention clock', () => {
  /**
   * Reports on the beat a client would: the rooms this device is attending,
   * which is what is on its screen and what it is standing in.
   */
  const attends = (userId: string, ...channelIds: string[]) => {
    app.channels.attentive(userId, channelIds);
  };

  const lapse = () => {
    clock += ATTENTION_WINDOW_MS;
    app.channels.tick();
  };

  it('retires a phone holding a room open with nobody near it', async () => {
    // The ghost, and the only bound on it: stepping in opens the microphone,
    // capturing keeps a backgrounded process alive, and nothing else stops it.
    const { alice, bob, channelId } = await roomOfTwo();
    attends(alice.id, channelId);
    attends(bob.id, channelId);
    // Bob leaves, so Alice is alone with nothing playing.
    app.channels.dispatch(channelId, bob.id, { type: 'STEP_OUT' });
    attends(alice.id, channelId);

    lapse();
    expect(channel(channelId).present).not.toContain(alice.id);
  });

  it('retires the lone phone and not the one with company, in one pass', async () => {
    // The guard, exercised in the only way the server can be made to show it:
    // two channels, one clock, and the same fifteen minutes passing over both.
    // Attention stopped watching the audio on 2026-09-09, so what keeps
    // somebody in a room is `subscribeable` and nothing else.
    const { alice, bob, channelId } = await roomOfTwo();
    // A second token for the same account, `roomOfTwo` handing back accounts
    // rather than sessions. A channel of one is created by asking for nobody,
    // which is the ordinary way in.
    const aliceAgain = await signIn('alice@example.com', 'Alice');
    const created = await app.fastify.inject({
      method: 'POST',
      url: '/channels',
      headers: auth(aliceAgain.token),
      payload: {},
    });
    const solo = (created.json() as { channelId: string }).channelId;

    // Standing in both, which is what a device reports about the rooms it
    // holds whether or not either is the screen in front of it.
    attends(alice.id, channelId, solo);
    attends(bob.id, channelId);
    // Alice is in two rooms: one with Bob in it, one with nobody.
    expect(channel(channelId).present).toContain(alice.id);
    expect(channel(solo).present).toContain(alice.id);
    expect(subscribeable(channel(channelId), alice.id)).toBe(true);
    expect(subscribeable(channel(solo), alice.id)).toBe(false);

    lapse();
    // One account, one clock, two answers — because the question the clock
    // decides is asked once per room.
    expect(channel(channelId).present).toContain(alice.id);
    expect(channel(solo).present).not.toContain(alice.id);
  });

  it('keeps two people in a room neither of them is touching', async () => {
    // The ambiguity no measure taken from the audio can resolve — two people
    // deliberately quiet, or a room somebody walked away from. Presence is
    // kept, and Rule A is what retires the room if neither is publishing.
    const { alice, bob, channelId } = await roomOfTwo();
    attends(alice.id, channelId);
    attends(bob.id, channelId);

    lapse();
    expect(channel(channelId).present).toContain(alice.id);
    expect(channel(channelId).present).toContain(bob.id);
  });

  it('ends a declaration nobody is attending, which nothing else did', async () => {
    // The rung below presence, which had no way out at all before this: a
    // fifteen-minute window applied on each reader's screen, and a set the
    // server never pruned.
    const { alice, bob, channelId } = await roomOfTwo();
    attends(bob.id, channelId);
    app.channels.dispatch(channelId, bob.id, { type: 'DECLARE_NEARBY' });
    expect(channel(channelId).waiting).toContain(bob.id);

    // Alice goes on attending, so only Bob's clock runs out.
    lapse();
    attends(alice.id, channelId);
    expect(channel(channelId).waiting).not.toContain(bob.id);
    expect(isWaiting(channel(channelId), bob.id)).toBe(false);
  });

  it('keeps a declaration alive while its owner is looking at that channel', async () => {
    // The question that started all of this: nearby, the channel open, the
    // card reading fourteen minutes, and no way to reach the fifteenth minute
    // but stepping in or out. Looking at the room is attending it.
    const { bob, channelId } = await roomOfTwo();
    app.channels.dispatch(channelId, bob.id, { type: 'DECLARE_NEARBY' });

    for (let i = 0; i < 3; i += 1) {
      attends(bob.id, channelId);
      clock += ATTENTION_WINDOW_MS - 1_000;
      app.channels.tick();
    }
    expect(channel(channelId).waiting).toContain(bob.id);
  });

  it('does not keep one alive from a different channel', async () => {
    // **The clock is per room, decided 2026-09-09 after being taken the other
    // way for an hour.** A person can be freshly attending one channel and
    // hours gone from another, and that difference is most of what a roster
    // carries; a single stamp per person would report only that they are
    // holding their phone, identically in every room they belong to.
    const { alice, bob, channelId } = await roomOfTwo();
    const aliceAgain = await signIn('alice@example.com', 'Alice');
    const created = await app.fastify.inject({
      method: 'POST',
      url: '/channels',
      headers: auth(aliceAgain.token),
      payload: {},
    });
    const elsewhere = (created.json() as { channelId: string }).channelId;

    app.channels.dispatch(channelId, bob.id, { type: 'DECLARE_NEARBY' });
    attends(bob.id, channelId);

    // Bob spends the next quarter of an hour in a different room entirely.
    // Not a member of it, which is deliberate: `attentive` refuses a room the
    // sender does not belong to, so this is also the check that a client
    // cannot stamp a clock anywhere it likes.
    for (let i = 0; i < 3; i += 1) {
      attends(bob.id, elsewhere);
      clock += ATTENTION_WINDOW_MS / 2;
      app.channels.tick();
    }
    expect(channel(channelId).waiting).not.toContain(bob.id);
  });

  it('never retires a build the server has no clock for', async () => {
    // The shim, and the reason it is a gate rather than a floor. An install
    // that predates the report says nothing, decides for itself and sends
    // `ATTENTION_EXPIRED` — and a server that treated silence as inattention
    // would retire every one of them fifteen minutes after a deploy, whatever
    // their owners were doing.
    const { alice, bob, channelId } = await roomOfTwo();
    app.channels.dispatch(channelId, bob.id, { type: 'STEP_OUT' });
    // Nobody has reported at all: this is a box that has just restarted.
    lapse();
    expect(channel(channelId).present).toContain(alice.id);
  });

  it('pushes a moved stamp about once a minute, not once a report', async () => {
    const { bob, channelId } = await roomOfTwo();
    let pushes = 0;
    const stop = app.channels.onChange(() => {
      pushes += 1;
    });
    // Ten minutes of reports at the client's cadence: twenty of them.
    for (let i = 0; i < 20; i += 1) {
      clock += ATTENTION_REPORT_MS;
      attends(bob.id, channelId);
    }
    stop();
    // Bounded rather than exact; what matters is the order. Every roster in
    // every channel this person belongs to reads the stamp, so the rate it is
    // pushed at is the rate the fan-out costs.
    expect(pushes).toBeGreaterThan(0);
    expect(pushes).toBeLessThanOrEqual(11);
  });
});
