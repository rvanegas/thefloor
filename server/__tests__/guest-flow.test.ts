import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import WebSocket from 'ws';
import { DISCONNECT_GRACE_MS } from '../../core/constants';
import { guestsPromised } from '../../core/guests';
import type {
  ClientMessage,
  GuestClientMessage,
  GuestServerMessage,
  ServerMessage,
} from '../../core/protocol';
import { buildApp, type App } from '../src/app';
import { MemoryMailer } from '../src/mail';
import { MemoryMediaServer } from '../src/media';
import { MemoryPusher } from '../src/push';

/**
 * A stranger with a link, from the door to the microphone and out again.
 *
 * Driven over real sockets rather than through the registry, because the half
 * of this that has never existed before is the transport: two protocols, two
 * connection kinds, and an admission whose result has to reach a socket other
 * than the one that asked for it. `inject` never performs an upgrade, which is
 * the blind spot ws.test.ts exists for.
 *
 * What is not tested here is the page, and nothing in this repository can test
 * it — there is no browser in the suite. So everything the page could get
 * wrong that the server could decide instead is decided here.
 */

let app: App;
let media: MemoryMediaServer;
let pusher: MemoryPusher;
let baseUrl: string;
let trainRoot: string;
let clock = 1_700_000_000_000;

beforeEach(async () => {
  clock = 1_700_000_000_000;
  media = new MemoryMediaServer();
  pusher = new MemoryPusher();
  // This suite's own train directory rather than `server/web`, so that two
  // runs of the suite cannot delete each other's fixtures — see
  // `train-root.test.ts`, which carries the account.
  trainRoot = await mkdtemp(join(tmpdir(), 'thefloor-trains-'));
  app = buildApp({
    dbPath: ':memory:',
    mailer: new MemoryMailer(),
    media,
    mediaUrl: 'wss://example.livekit.cloud',
    now: () => clock,
    roomCloseGraceMs: 0,
    pusher,
    trainRoot,
  });
  await app.fastify.listen({ port: 0, host: '127.0.0.1' });
  const address = app.fastify.server.address();
  if (typeof address === 'string' || address === null) throw new Error('no port');
  baseUrl = `127.0.0.1:${address.port}`;
});

afterEach(async () => {
  app.channels.stop();
  await app.fastify.close();
  await rm(trainRoot, { recursive: true, force: true });
});

/** A socket that collects what it is sent and can wait for one message. */
class Socket<Received extends { type: string }, Sent> {
  protected socket: WebSocket;
  readonly received: Received[] = [];
  closed = false;

  constructor(url: string) {
    this.socket = new WebSocket(url);
    this.socket.on('message', (raw) => {
      this.received.push(JSON.parse(String(raw)) as Received);
    });
    this.socket.on('close', () => {
      this.closed = true;
    });
  }

  open(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.socket.readyState === WebSocket.OPEN) return resolve();
      this.socket.once('open', () => resolve());
      this.socket.once('error', reject);
    });
  }

  send(message: Sent): void {
    this.socket.send(JSON.stringify(message));
  }

  close(): void {
    this.socket.close();
  }

  async next<T extends Received['type']>(
    type: T,
    predicate: (m: Extract<Received, { type: T }>) => boolean = () => true,
    timeoutMs = 3000
  ): Promise<Extract<Received, { type: T }>> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const found = this.received.find(
        (m): m is Extract<Received, { type: T }> =>
          m.type === type && predicate(m as Extract<Received, { type: T }>)
      );
      if (found) return found;
      await new Promise((r) => setTimeout(r, 20));
    }
    throw new Error(
      `timed out waiting for ${type}; saw ${JSON.stringify(
        this.received.map((m) => m.type)
      )}`
    );
  }

  /** The most recent message of a type, for a stream of snapshots. */
  latest<T extends Received['type']>(type: T): Extract<Received, { type: T }> {
    const all = this.received.filter(
      (m): m is Extract<Received, { type: T }> => m.type === type
    );
    const last = all[all.length - 1];
    if (!last) throw new Error(`no ${type} received`);
    return last;
  }
}

type Member = Socket<ServerMessage, ClientMessage>;
type Guest = Socket<GuestServerMessage, GuestClientMessage>;

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

/** Alice, in a channel of her own, present, with a link in her hand. */
async function channelWithLink() {
  const alice = await signIn('alice@example.com', 'Alice');
  const bob = await signIn('bob@example.com', 'Bob');
  await app.fastify.inject({
    method: 'POST',
    url: '/contacts/request',
    headers: auth(alice.token),
    payload: { identifier: 'bob@example.com' },
  });
  await app.fastify.inject({
    method: 'POST',
    url: `/contacts/${alice.account.id}/accept`,
    headers: auth(bob.token),
  });
  const created = app.channels.create(alice.account.id, [bob.account.id]);
  if (!created.ok) throw new Error(created.error);
  const channelId = created.channel.id;

  const minted = await app.fastify.inject({
    method: 'POST',
    url: `/channels/${channelId}/guest-links`,
    headers: auth(alice.token),
  });
  const link = minted.json() as { token: string; url: string };

  const member: Member = new Socket(`ws://${baseUrl}/ws?token=${alice.token}`);
  await member.open();
  member.send({ type: 'watch.channel', channelId });
  await member.next('channel');
  return { alice, bob, channelId, link, member };
}

const guestSocket = (query: string): Guest =>
  new Socket(`ws://${baseUrl}/gws?${query}`);

/** Knocks, is let in, and hands back both sockets. */
async function admitted(name = 'Dana') {
  const room = await channelWithLink();
  const guest: Guest = guestSocket(`link=${room.link.token}`);
  await guest.open();
  await guest.next('door');
  guest.send({ type: 'knock', name });
  await guest.next('knocking');

  const knocked = await room.member.next(
    'channel',
    (m) => m.view.channel.knocks.length > 0
  );
  const knockId = knocked.view.channel.knocks[0].id;
  room.member.send({
    type: 'channel.action',
    channelId: room.channelId,
    action: { type: 'ANSWER_KNOCK', knockId, accept: true },
  });
  const admission = await guest.next('admitted');
  return { ...room, guest, admission };
}

describe('the door', () => {
  it('says what the link opens onto before anybody knocks', async () => {
    const { member, guest } = await (async () => {
      const room = await channelWithLink();
      const guest: Guest = guestSocket(`link=${room.link.token}`);
      await guest.open();
      return { ...room, guest };
    })();

    const door = await guest.next('door');
    // The roster description, resolved here rather than sent as a null: a
    // guest has no roster to fall back on. Whole rather than viewer-relative,
    // too — every member's screen says "Bob" because it leaves the reader out,
    // and a guest is not one of the people in it.
    expect(door.channelName).toBe('Alice and Bob');
    expect(door.occupied).toBe(true);
    guest.close();
    member.close();
  });

  it('refuses a revoked link outright', async () => {
    const { alice, channelId, link } = await channelWithLink();
    await app.fastify.inject({
      method: 'DELETE',
      url: `/channels/${channelId}/guest-links/${link.token}`,
      headers: auth(alice.token),
    });

    const guest: Guest = guestSocket(`link=${link.token}`);
    await guest.open();
    await guest.next('refused');
  });

  it('closes when the last member leaves, without anybody revoking it', async () => {
    // The emptying rule, from the outside. It turns out to be stronger than
    // "there is nobody to let you in": the link is *revoked* by the room
    // emptying, so a page arriving afterwards is refused at the door rather
    // than shown a channel it could knock at. The knock-at-an-empty-room path
    // is still guarded — see the reducer — but only a race can reach it now.
    const { channelId, link, member } = await channelWithLink();
    member.send({
      type: 'channel.action',
      channelId,
      action: { type: 'STEP_OUT' },
    });
    await member.next('channel', (m) => m.view.channel.present.length === 0);

    const guest: Guest = guestSocket(`link=${link.token}`);
    await guest.open();
    const refused = await guest.next('refused');
    expect(refused.reason).toMatch(/no longer open/i);
  });
});

describe('the page', () => {
  it('is served with the token in it, and asks nobody for anything', async () => {
    const { link } = await channelWithLink();
    const page = await app.fastify.inject({ method: 'GET', url: `/g/${link.token}` });
    expect(page.statusCode).toBe(200);
    expect(page.headers['content-type']).toMatch(/text\/html/);
    expect(page.body).toContain(`data-link="${link.token}"`);
  });

  it('stamps where the app is, and stamps nothing when it is nowhere', async () => {
    // The page's one link out. It pointed at `/app` unconditionally for a day,
    // which on a box serving only `/beta` is a link to a 503 — and the page
    // cannot know which trains exist, so the route tells it.
    const { link } = await channelWithLink();
    const nowhere = await app.fastify.inject({ method: 'GET', url: `/g/${link.token}` });
    expect(nowhere.body).toContain('data-app=""');

    const beta = join(trainRoot, 'beta');
    await mkdir(beta, { recursive: true });
    await writeFile(join(beta, 'index.html'), '<!doctype html>');
    try {
      const served = await app.fastify.inject({
        method: 'GET',
        url: `/g/${link.token}`,
      });
      expect(served.body).toContain('data-app="/beta"');
    } finally {
      await rm(beta, { recursive: true, force: true });
    }
  });

  it('answers the same page for a link that is already dead', async () => {
    // The token is checked when the socket opens, not here. A page that 404ed
    // on a revoked link would answer, to anybody who asked, which links exist.
    const { alice, channelId, link } = await channelWithLink();
    await app.fastify.inject({
      method: 'DELETE',
      url: `/channels/${channelId}/guest-links/${link.token}`,
      headers: auth(alice.token),
    });
    const page = await app.fastify.inject({ method: 'GET', url: `/g/${link.token}` });
    expect(page.statusCode).toBe(200);
  });

  it('serves two named files and no others', async () => {
    const bundle = await app.fastify.inject({ method: 'GET', url: '/g/assets/guest.js' });
    // 503 when nobody has run the build, which is a state a checkout can be
    // in; what must never happen is a path being joined from the URL.
    expect([200, 503]).toContain(bundle.statusCode);
    const traversal = await app.fastify.inject({
      method: 'GET',
      url: '/g/assets/..%2F..%2Fpackage.json',
    });
    expect(traversal.statusCode).toBe(404);
  });
});

describe('admission', () => {
  it('reaches every member as a knock, and the guest as a seat', async () => {
    const { guest, member, admission, channelId } = await admitted();

    expect(admission.guestId).toMatch(/^guest_/);
    expect(admission.secret).toBeTruthy();
    // The credential for the room, minted unable to publish. That is the whole
    // of what keeps a stranger silent until somebody says otherwise.
    expect(admission.media?.url).toBe('wss://example.livekit.cloud');
    expect(
      media.issued.find((i) => i.identity === admission.guestId)?.canPublish
    ).toBe(false);

    const view = await guest.next('guest');
    expect(view.view.you.name).toBe('Dana');
    expect(view.view.you.mic).toBe('listening');
    expect(view.view.others.map((o) => o.name)).toEqual(['Alice']);
    // And nothing else: no description, no recordings, no timeline.
    expect(Object.keys(view.view)).toEqual([
      'channelId',
      'channelName',
      'you',
      'others',
      'asks',
      'invites',
      'recording',
      'clip',
      'serverNow',
    ]);

    const seen = await member.next(
      'channel',
      (m) => Object.keys(m.view.channel.guests).length > 0
    );
    expect(seen.view.channel.knocks).toEqual([]);
    expect(Object.values(seen.view.channel.guests)[0].name).toBe('Dana');
    expect(seen.view.channel.participants).not.toContain(admission.guestId);
    expect(channelId).toBeTruthy();
  });

  it('tells a refused guest, and lets them nowhere near the channel', async () => {
    const room = await channelWithLink();
    const guest: Guest = guestSocket(`link=${room.link.token}`);
    await guest.open();
    await guest.next('door');
    guest.send({ type: 'knock', name: 'Eve' });

    const knocked = await room.member.next(
      'channel',
      (m) => m.view.channel.knocks.length > 0
    );
    room.member.send({
      type: 'channel.action',
      channelId: room.channelId,
      action: {
        type: 'ANSWER_KNOCK',
        knockId: knocked.view.channel.knocks[0].id,
        accept: false,
      },
    });

    const refused = await guest.next('refused');
    expect(refused.reason).toMatch(/said no/i);
    expect(app.channels.get(room.channelId)!.guests).toEqual({});
  });

  it('takes the knock back when the page gives up', async () => {
    const room = await channelWithLink();
    const guest: Guest = guestSocket(`link=${room.link.token}`);
    await guest.open();
    await guest.next('door');
    guest.send({ type: 'knock', name: 'Dana' });
    await room.member.next('channel', (m) => m.view.channel.knocks.length > 0);

    guest.close();
    await room.member.next('channel', (m) => m.view.channel.knocks.length === 0);
  });
});

describe('the microphone', () => {
  it('is granted live, without the guest reconnecting', async () => {
    const { guest, member, admission, channelId } = await admitted();
    await guest.next('guest');

    member.send({
      type: 'channel.action',
      channelId,
      action: {
        type: 'SET_GUEST_SPEECH',
        guestId: admission.guestId,
        maySpeak: true,
      },
    });

    // The page is told separately from the view, because opening a microphone
    // is a device operation rather than a re-render.
    const speech = await guest.next('speech', (m) => m.maySpeak);
    expect(speech.maySpeak).toBe(true);
    expect(
      media.publishGrants.find((g) => g.identity === admission.guestId)?.allowed
    ).toBe(true);
    const view = await guest.next('guest', (m) => m.view.you.mic === 'open');
    expect(view.view.you.mic).toBe('open');
  });

  it('is asked for, and the asking is on the members’ screens', async () => {
    const { guest, member, admission } = await admitted();
    guest.send({ type: 'action', action: { type: 'REQUEST_SPEECH' } });

    const seen = await member.next(
      'channel',
      (m) => m.view.channel.guests[admission.guestId]?.request === 'asking'
    );
    expect(seen.view.channel.guests[admission.guestId].request).toBe('asking');
    const view = await guest.next('guest', (m) => m.view.you.mic === 'asking');
    expect(view.view.you.mic).toBe('asking');
  });

  it('cannot be granted by the guest themselves', async () => {
    const { guest, admission, channelId } = await admitted();
    // Not merely refused: the action is not one a guest may send at all, and
    // it is the allowlist rather than a check on this action that says so.
    guest.send({
      type: 'action',
      action: {
        type: 'SET_GUEST_SPEECH',
        guestId: admission.guestId,
        maySpeak: true,
      },
    } as unknown as GuestClientMessage);
    await guest.next('error');
    expect(
      app.channels.get(channelId)!.guests[admission.guestId].maySpeak
    ).toBe(false);
  });
});

describe('a recording with a guest in it', () => {
  it('keeps their voice and their name, and gives them nothing', async () => {
    // The decision this implements: a recording is of the conversation, and a
    // guest who was speaking was in the conversation. Leaving them out would
    // leave a hole where half of an exchange was.
    const { guest, member, admission, channelId, alice } = await admitted();
    member.send({
      type: 'channel.action',
      channelId,
      action: {
        type: 'SET_GUEST_SPEECH',
        guestId: admission.guestId,
        maySpeak: true,
      },
    });
    await guest.next('speech', (m) => m.maySpeak);

    member.send({
      type: 'channel.action',
      channelId,
      action: { type: 'START_RECORDING' },
    });
    await member.next('channel', (m) => m.view.channel.recording.status === 'recording');
    // Their stem is not started by the cohort that begins a run — a guest may
    // be in the room publishing nothing — so it comes from the tick's retry.
    await new Promise((r) => setTimeout(r, 10));
    app.channels.tick();
    clock += 30_000;
    member.send({
      type: 'channel.action',
      channelId,
      action: { type: 'STOP_RECORDING' },
    });
    // For the run being over rather than for `idle`, which is also what the
    // channel looked like before any of this started — `next` searches
    // everything received, so the weaker predicate matches the first snapshot
    // of the day and reads the row before it has been written.
    await member.next(
      'channel',
      (m) => (m.view.channel.lastRecording?.durationMs ?? 0) > 0
    );
    await app.channels.mixesSettled();

    const row = app.db
      .prepare('SELECT * FROM recordings WHERE channel_id = ?')
      .get(channelId) as unknown as {
      stems: string;
      participants: string;
      participant_names: string;
    };
    expect(Object.keys(JSON.parse(row.stems))).toContain(admission.guestId);
    // Named, and the name is frozen: a guest id resolves to nothing anywhere
    // else, so a recording that looked it up later would silently drop them
    // and read as though nobody else had been there.
    expect(JSON.parse(row.participant_names)[admission.guestId]).toBe('Dana');
    expect(JSON.parse(row.participants)).toContain(admission.guestId);

    // And none of that is entitlement. Reach is membership of the channel,
    // which a guest does not have and cannot acquire.
    expect(app.channels.recordingsFor(admission.guestId)).toEqual([]);
    expect(app.channels.recordingsFor(alice.account.id)).toHaveLength(1);
  });
});

describe('coming back', () => {
  it('resumes the same seat with the secret, after the socket drops', async () => {
    const { guest, admission, channelId, member } = await admitted();
    member.send({
      type: 'channel.action',
      channelId,
      action: {
        type: 'SET_GUEST_SPEECH',
        guestId: admission.guestId,
        maySpeak: true,
      },
    });
    await guest.next('speech', (m) => m.maySpeak);
    guest.close();

    const back: Guest = guestSocket(
      `guest=${admission.guestId}&secret=${encodeURIComponent(admission.secret)}`
    );
    await back.open();
    const resumed = await back.next('admitted');
    expect(resumed.guestId).toBe(admission.guestId);
    // The same name, and the same grant: the row remembers what the process
    // does not, which is the whole reason the grant is durable.
    const view = await back.next('guest');
    expect(view.view.you.name).toBe('Dana');
    expect(view.view.you.mic).toBe('open');
    // And the token they come back with can publish, unlike the first one.
    const issued = media.issued.filter((i) => i.identity === admission.guestId);
    expect(issued[issued.length - 1].canPublish).toBe(true);
  });

  it('refuses a wrong secret', async () => {
    const { admission } = await admitted();
    const back: Guest = guestSocket(
      `guest=${admission.guestId}&secret=not-the-secret`
    );
    await back.open();
    await back.next('refused');
  });

  it('is what a revoked link does not stop', async () => {
    // The reason a seat is a separate thing from a link: tidying up a link in
    // another screen must not drop somebody out of a conversation.
    const { alice, channelId, link, admission, guest } = await admitted();
    guest.close();
    await app.fastify.inject({
      method: 'DELETE',
      url: `/channels/${channelId}/guest-links/${link.token}`,
      headers: auth(alice.token),
    });

    const back: Guest = guestSocket(
      `guest=${admission.guestId}&secret=${encodeURIComponent(admission.secret)}`
    );
    await back.open();
    await back.next('admitted');
  });
});

describe('leaving', () => {
  it('holds a guest through a flap and drops them when the grace runs out', async () => {
    const { guest, admission, channelId, member } = await admitted();
    guest.close();

    // Still in the room: a dropped socket is not a departure, for a guest as
    // for anybody else.
    expect(app.channels.get(channelId)!.guests[admission.guestId]).toBeDefined();

    clock += DISCONNECT_GRACE_MS + 1;
    app.channels.tick();
    await member.next(
      'channel',
      (m) => Object.keys(m.view.channel.guests).length === 0
    );
  });

  it('ejects, and closes the door the guest came through', async () => {
    const { guest, member, admission, channelId, link } = await admitted();
    member.send({
      type: 'channel.action',
      channelId,
      action: { type: 'EJECT_GUEST', guestId: admission.guestId },
    });

    await guest.next('refused');
    expect(app.channels.get(channelId)!.guests).toEqual({});
    expect(
      media.removed.some((r) => r.identity === admission.guestId)
    ).toBe(true);
    // Their seat is gone, so the secret is no longer one.
    expect(
      app.channels.guests.reconnect(admission.guestId, admission.secret, clock)
    ).toBeUndefined();
    // And the door they came through is shut, or removing them would remove
    // them for as long as it takes to reload the page.
    expect(app.channels.guests.liveLink(link.token)).toBeUndefined();
  });

  it('takes the guests with the last member out', async () => {
    const { guest, member, channelId, admission } = await admitted();
    member.send({
      type: 'channel.action',
      channelId,
      action: { type: 'STEP_OUT' },
    });

    await guest.next('refused');
    expect(app.channels.get(channelId)!.guests).toEqual({});
    // And the seat is over, so the page cannot let itself back in.
    expect(
      app.channels.guests.reconnect(admission.guestId, admission.secret, clock)
    ).toBeUndefined();
  });
});

describe('being asked to be a contact', () => {
  /** Alice asks the guest to keep in touch. */
  async function asked(name = 'Dana') {
    const room = await admitted(name);
    room.member.send({
      type: 'channel.action',
      channelId: room.channelId,
      action: { type: 'ASK_GUEST_CONTACT', guestId: room.admission.guestId },
    });
    const view = await room.guest.next('guest', (m) => m.view.asks.length > 0);
    return { ...room, view: view.view };
  }

  const accept = (
    token: string,
    payload: { guestId: string; secret: string; askerId: string }
  ) =>
    app.fastify.inject({
      method: 'POST',
      url: '/contacts/guest-ask/accept',
      headers: auth(token),
      payload,
    });

  it('reaches the guest by name, and carries the id an answer needs', async () => {
    const { view, alice } = await asked();
    expect(view.asks).toEqual([{ askerId: alice.account.id, from: 'Alice' }]);
  });

  it('makes a contact of somebody signing in from the room, and no more', async () => {
    // **The whole of the 2026-09-16 change is this test.** It used to be
    // called *makes a contact and a member*, and asserted that the seat was
    // finished and the account was in `participants` — accepting wrote both in
    // one breath. Being in somebody's contacts and belonging to their channel
    // are two facts now, and this is the first of them on its own.
    const { alice, guest, member, channelId, admission } = await asked();
    const dana = await signIn('dana@example.com', 'Dana');

    const answer = await accept(dana.token, {
      guestId: admission.guestId,
      secret: admission.secret,
      askerId: alice.account.id,
    });
    expect(answer.statusCode).toBe(200);
    // **Nothing to go to, which is the change.** This answered with a channel
    // and `/open` while acceptance carried a membership; now nothing about
    // where this person is has changed, so there is nowhere to hand them.
    expect(answer.json()).toEqual({ ok: true });

    // Contacts, both ways, and the pair's own standing channel with them.
    expect(app.accounts.areContacts(alice.account.id, dana.account.id)).toBe(true);

    // And still a guest of the channel they met in: in the room, out of the
    // roster, holding the seat they arrived on.
    const state = app.channels.get(channelId)!;
    expect(state.participants).not.toContain(dana.account.id);
    expect(state.guests[admission.guestId]?.asks).toEqual({
      [alice.account.id]: 'accepted',
    });
    // The seat gained the account in the live channel rather than only in the
    // row, which did not matter while it closed in the same breath.
    expect(state.guests[admission.guestId]?.accountId).toBe(dana.account.id);
    expect(
      app.channels.guests.reconnect(admission.guestId, admission.secret, clock)
    ).toBeDefined();
    guest.close();
    member.close();
  });

  it('is followed by a second act, which is what makes them a member', async () => {
    // The third rung. An ordinary `INVITE`, made by the member, against the
    // account behind the seat — and the seat ends here rather than at the
    // acceptance above.
    const { alice, guest, member, channelId, admission } = await asked();
    const dana = await signIn('dana@example.com', 'Dana');
    await accept(dana.token, {
      guestId: admission.guestId,
      secret: admission.secret,
      askerId: alice.account.id,
    });

    member.send({
      type: 'channel.action',
      channelId,
      action: { type: 'INVITE', contactId: dana.account.id },
    });
    // The page is told, and told the one thing that is true: not that it has
    // been turned out, but that the room is now somewhere it belongs.
    await guest.next('joined');

    const state = app.channels.get(channelId)!;
    expect(state.participants).toContain(dana.account.id);
    expect(state.guests).toEqual({});
    // One person cannot hold a seat and a membership in one channel.
    expect(
      app.channels.guests.reconnect(admission.guestId, admission.secret, clock)
    ).toBeUndefined();
    guest.close();
    member.close();
  });

  it('credits the asker with an arrival they made an account to answer', async () => {
    // The second way credit is earned, and the only one an email address has
    // nothing to do with: nobody wrote to Dana, so `pending_invites` has never
    // heard of her, and without this the one arrival that is plainly Alice's
    // doing would count for nothing.
    const { alice, guest, member, admission } = await asked();
    clock += 60_000;
    const dana = await signIn('dana@example.com', 'Dana');

    await accept(dana.token, {
      guestId: admission.guestId,
      secret: admission.secret,
      askerId: alice.account.id,
    });

    expect(app.accounts.byId(dana.account.id)!.invited_by).toBe(alice.account.id);
    expect(app.accounts.invitedCount(alice.account.id)).toBe(1);
    guest.close();
    member.close();
  });

  it('credits nobody for somebody who was already here', async () => {
    // An account that existed before the seat did is not an arrival, whoever
    // asks them — the standings would otherwise say Alice brought somebody
    // who has been signing in for a year, on the strength of a tap.
    const dana = await signIn('dana@example.com', 'Dana');
    clock += 60_000;
    const { alice, guest, member, admission } = await asked();

    await accept(dana.token, {
      guestId: admission.guestId,
      secret: admission.secret,
      askerId: alice.account.id,
    });

    expect(app.accounts.byId(dana.account.id)!.invited_by).toBeNull();
    expect(app.accounts.invitedCount(alice.account.id)).toBe(0);
    guest.close();
    member.close();
  });

  it('answers one member without answering another, and refusal is not silence', async () => {
    const { alice, guest, admission, channelId, member } = await asked();
    guest.send({
      type: 'action',
      action: { type: 'REFUSE_CONTACT', askerId: alice.account.id },
    });
    const seen = await member.next(
      'channel',
      (m) => m.view.channel.guests[admission.guestId]?.asks?.[alice.account.id] === 'refused'
    );
    expect(seen.view.channel.guests[admission.guestId].asks).toEqual({
      [alice.account.id]: 'refused',
    });
    // And a refused ask is no longer put in front of the guest, having been
    // answered — asking again on the asker's behalf is what that would be.
    const view = await guest.next('guest', (m) => m.view.asks.length === 0);
    expect(view.view.asks).toEqual([]);
    expect(app.channels.get(channelId)!.participants).not.toContain('dana');
    guest.close();
    member.close();
  });

  it('does not ring the phone of somebody walking through the door', async () => {
    // `INVITE` wakes the invitee, which is right for every other way of being
    // asked into a channel and wrong for this one: they are holding the page
    // that sent the acceptance and are about to be shown the room. A push
    // saying they were invited somewhere they are already walking into is the
    // app inventing an event.
    const { alice, admission, guest, member } = await asked();
    const dana = await signIn('dana@example.com', 'Dana');
    await app.fastify.inject({
      method: 'POST',
      url: '/devices',
      headers: auth(dana.token),
      payload: { token: 'dana-phone', platform: 'ios' },
    });

    await accept(dana.token, {
      guestId: admission.guestId,
      secret: admission.secret,
      askerId: alice.account.id,
    });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(pusher.messagesFor('dana-phone')).toEqual([]);
    guest.close();
    member.close();
  });

  it('refuses a seat that does not match the account, and one nobody asked about', async () => {
    const { alice, bob, admission, guest, member } = await asked();
    const dana = await signIn('dana@example.com', 'Dana');

    // Somebody else's token against this seat: the seat is claimed by the
    // first account to present it, so Bob taking it would be Bob walking in on
    // an ask that was not made of him.
    const wrongSecret = await accept(dana.token, {
      guestId: admission.guestId,
      secret: 'not-the-secret',
      askerId: alice.account.id,
    });
    expect(wrongSecret.statusCode).toBe(403);

    // Nobody asked *for Bob*, and holding the seat does not invent an ask.
    // 400 rather than 404 because that is this server's mapping for both
    // not-found and invalid — see `statusFor`.
    const unasked = await accept(bob.token, {
      guestId: admission.guestId,
      secret: admission.secret,
      askerId: bob.account.id,
    });
    expect(unasked.statusCode).toBe(400);
    expect(unasked.json()).toEqual({ error: 'Nobody asked.' });
    guest.close();
    member.close();
  });

  it('keeps the contact when the channel has moved on, and says so', async () => {
    // Somebody reads their email, and by the time they answer the room has
    // emptied. The invitation is refused by the guards that already exist; the
    // acceptance is not, because it was never about the room.
    const { alice, admission, member, channelId, guest } = await asked();
    const dana = await signIn('dana@example.com', 'Dana');
    member.send({
      type: 'channel.action',
      channelId,
      action: { type: 'STEP_OUT' },
    });
    await member.next('channel', (m) => m.view.channel.present.length === 0);

    const answer = await accept(dana.token, {
      guestId: admission.guestId,
      secret: admission.secret,
      askerId: alice.account.id,
    });
    // The seat went with the last member, so there is nothing left to accept
    // from — the ask is answered by a page that no longer has a room.
    expect(answer.statusCode).toBe(403);
    expect(app.accounts.areContacts(alice.account.id, dana.account.id)).toBe(false);
    guest.close();
    member.close();
  });
});

describe('being asked onto The Floor, which asks for nothing else', () => {
  /**
   * The first rung, added 2026-09-16. Until then the only door into an account
   * from inside a room was the contact ask, which priced an arrival at a
   * relationship — so a member who simply wanted somebody here had to ask to
   * be their contact to offer it.
   */
  async function invited(name = 'Dana') {
    const room = await admitted(name);
    room.member.send({
      type: 'channel.action',
      channelId: room.channelId,
      action: { type: 'ASK_GUEST_JOIN', guestId: room.admission.guestId },
    });
    const view = await room.guest.next('guest', (m) => m.view.invites.length > 0);
    return { ...room, view: view.view };
  }

  const acceptJoin = (
    token: string,
    payload: { guestId: string; secret: string; askerId: string }
  ) =>
    app.fastify.inject({
      method: 'POST',
      url: '/contacts/guest-invite/accept',
      headers: auth(token),
      payload,
    });

  it('reaches the guest as its own question, not the other one', async () => {
    const { view, alice } = await invited();
    expect(view.invites).toEqual([{ askerId: alice.account.id, from: 'Alice' }]);
    expect(view.asks).toEqual([]);
  });

  it('binds the account to the seat and writes nothing else', async () => {
    const { alice, guest, member, channelId, admission } = await invited();
    const dana = await signIn('dana@example.com', 'Dana');

    const answer = await acceptJoin(dana.token, {
      guestId: admission.guestId,
      secret: admission.secret,
      askerId: alice.account.id,
    });
    expect(answer.statusCode).toBe(200);
    expect(answer.json()).toEqual({ ok: true });

    // An account behind the seat, and the room calling them by it.
    const state = app.channels.get(channelId)!;
    expect(state.guests[admission.guestId]?.accountId).toBe(dana.account.id);
    // **And nothing else, which is the point of this ask.** Not a contact,
    // not a member, not a seat that has ended.
    expect(app.accounts.areContacts(alice.account.id, dana.account.id)).toBe(false);
    expect(state.participants).not.toContain(dana.account.id);
    expect(
      app.channels.guests.reconnect(admission.guestId, admission.secret, clock)
    ).toBeDefined();
    guest.close();
    member.close();
  });

  it('credits the asker with an arrival made to answer it', async () => {
    // The rule in one line: the credit goes to whoever asked the question that
    // was being answered when the account was made. It used to be the contact
    // ask or nothing, that having been the only door.
    const { alice, guest, member, admission } = await invited();
    clock += 60_000;
    const dana = await signIn('dana@example.com', 'Dana');
    await acceptJoin(dana.token, {
      guestId: admission.guestId,
      secret: admission.secret,
      askerId: alice.account.id,
    });
    expect(app.accounts.byId(dana.account.id)?.invited_by).toBe(alice.account.id);
    guest.close();
    member.close();
  });

  it('credits nobody for somebody who was already here', async () => {
    // Read off the clock rather than trusted to the flow: an account made
    // before the knock cannot have been made to answer it.
    const dana = await signIn('dana@example.com', 'Dana');
    clock += 60_000;
    const { alice, guest, member, admission } = await invited();
    await acceptJoin(dana.token, {
      guestId: admission.guestId,
      secret: admission.secret,
      askerId: alice.account.id,
    });
    expect(app.accounts.byId(dana.account.id)?.invited_by).toBeNull();
    guest.close();
    member.close();
  });

  it('refuses an ask nobody made, and a seat that is not the caller\u2019s', async () => {
    const { alice, guest, member, admission } = await invited();
    const dana = await signIn('dana@example.com', 'Dana');
    const eve = await signIn('eve@example.com', 'Eve');

    // A seat that already names somebody else is a different person's, and no
    // amount of holding the secret makes the two the same.
    await acceptJoin(dana.token, {
      guestId: admission.guestId,
      secret: admission.secret,
      askerId: alice.account.id,
    });
    const stolen = await acceptJoin(eve.token, {
      guestId: admission.guestId,
      secret: admission.secret,
      askerId: alice.account.id,
    });
    expect(stolen.statusCode).toBe(403);

    // And an ask that was never put is not answerable. 400 rather than 404:
    // `statusFor` folds `not_found` in with `invalid`, this server declining
    // to tell an unauthenticated-ish caller which of the two it was.
    const nobody = await acceptJoin(dana.token, {
      guestId: admission.guestId,
      secret: admission.secret,
      askerId: eve.account.id,
    });
    expect(nobody.statusCode).toBe(400);
    guest.close();
    member.close();
  });
});

describe('a guest who is signed in already', () => {
  it('is known at the door, and named by their account', async () => {
    const room = await channelWithLink();
    const dana = await signIn('dana@example.com', 'Dana Q');

    const guest: Guest = guestSocket(`link=${room.link.token}`);
    await guest.open();
    await guest.next('door');
    // No name is typed: the page does not ask for one it already has.
    guest.send({ type: 'knock', name: '', token: dana.token });
    await guest.next('knocking');

    const knocked = await room.member.next(
      'channel',
      (m) => m.view.channel.knocks.length > 0
    );
    // The knock says who is at it, rather than offering a number to somebody
    // deciding whether to open a door.
    expect(knocked.view.channel.knocks[0].name).toBe('Dana Q');
    room.member.send({
      type: 'channel.action',
      channelId: room.channelId,
      action: {
        type: 'ANSWER_KNOCK',
        knockId: knocked.view.channel.knocks[0].id,
        accept: true,
      },
    });
    await guest.next('admitted');

    const view = await guest.next('guest');
    expect(view.view.you.name).toBe('Dana Q');
    expect(view.view.you.accountId).toBe(dana.account.id);
    // A guest to the channel and not to the app: knowing them confers nothing.
    expect(app.channels.get(room.channelId)!.participants).not.toContain(
      dana.account.id
    );

    // And the channel is a place they can go back to while the seat lasts.
    const home = await app.fastify.inject({
      method: 'GET',
      url: '/home',
      headers: auth(dana.token),
    });
    const seat = (home.json() as { rejoinable: Array<Record<string, unknown>> })
      .rejoinable.find((entry) => entry.channelId === room.channelId);
    expect(seat).toMatchObject({ seat: true, name: 'Alice and Bob', others: [] });
    guest.close();
    room.member.close();
  });

  it('takes a stale token as no token at all', async () => {
    // Presence, not validity — the same reading the landing page makes. What
    // it costs is a number instead of a name, and the rename is the answer.
    const room = await channelWithLink();
    const guest: Guest = guestSocket(`link=${room.link.token}`);
    await guest.open();
    await guest.next('door');
    guest.send({ type: 'knock', name: '', token: 'not-a-token' });
    const knocked = await room.member.next(
      'channel',
      (m) => m.view.channel.knocks.length > 0
    );
    expect(knocked.view.channel.knocks[0].name).toBe('Someone');
    guest.close();
    room.member.close();
  });
});

describe('a guest’s name', () => {
  it('is theirs to change, and the seat remembers it', async () => {
    const { guest, member, channelId, admission } = await admitted();
    guest.send({ type: 'action', action: { type: 'SET_GUEST_NAME', name: 'Robert' } });

    const seen = await member.next(
      'channel',
      (m) => m.view.channel.guests[admission.guestId]?.name === 'Robert'
    );
    expect(seen.view.channel.guests[admission.guestId].name).toBe('Robert');
    // Written through to the row, or the next reconnection undoes it.
    expect(app.channels.guests.byId(admission.guestId)?.display_name).toBe(
      'Robert'
    );
    expect(app.channels.get(channelId)!.participants).toHaveLength(2);
    guest.close();
    member.close();
  });
});

describe('taking up a seat from the app', () => {
  /**
   * The walk the guest page cannot make, and the reason this route exists.
   *
   * A seat's secret lives in the browser tab that knocked. The app has no way
   * to present one and never will — so for a seat with an account behind it,
   * the account token is the credential, and these are the tests that say the
   * narrowing is safe: a seat without an account is not reachable this way,
   * and neither is somebody else's.
   */
  const enter = (token: string, channelId: string) =>
    app.fastify.inject({
      method: 'POST',
      url: `/channels/${channelId}/seat/enter`,
      headers: auth(token),
    });

  /** Dana, signed in, admitted as a guest of Alice's channel. */
  async function seated() {
    const room = await channelWithLink();
    const dana = await signIn('dana@example.com', 'Dana');
    const guest: Guest = guestSocket(`link=${room.link.token}`);
    await guest.open();
    await guest.next('door');
    // The token at the door is what puts the account on the seat.
    guest.send({ type: 'knock', name: 'Dana', token: dana.token });
    await guest.next('knocking');
    const knocked = await room.member.next(
      'channel',
      (m) => m.view.channel.knocks.length > 0
    );
    room.member.send({
      type: 'channel.action',
      channelId: room.channelId,
      action: {
        type: 'ANSWER_KNOCK',
        knockId: knocked.view.channel.knocks[0].id,
        accept: true,
      },
    });
    const admission = await guest.next('admitted');
    return { ...room, dana, guest, admission };
  }

  it('answers with what a guest is shown, and not with the channel', async () => {
    // The boundary this route is built around. A member's snapshot carries
    // every participant's account id, their profiles and the recordings; a
    // guest gets names. Handing back a channel here would widen that silently.
    const { dana, channelId, guest, member } = await seated();

    const entered = await enter(dana.token, channelId);
    expect(entered.statusCode).toBe(200);
    const body = entered.json() as {
      guestId: string;
      view: {
        channelId: string;
        you: { name: string; accountId: string | null };
      };
    };
    expect(body.view.channelId).toBe(channelId);
    expect(body.view.you.name).toBe('Dana');
    expect(body.view.you.accountId).toBe(dana.account.id);
    expect(body).not.toHaveProperty('view.participants');
    expect(body).not.toHaveProperty('view.recordings');

    guest.close();
    member.close();
  });

  it('refuses an account with no seat here', async () => {
    const { bob, channelId, member } = await channelWithLink();
    // Bob is a *member* of this channel and holds no seat in it. Both are
    // reasons to refuse, and the seat lookup is the one that fires first.
    // 400 rather than 404: `statusFor` answers `not_found` with 400, which is
    // this server's convention and not this route's choice.
    const refused = await enter(bob.token, channelId);
    expect(refused.statusCode).toBe(400);
    member.close();
  });

  it('will not take over a seat that has no account on it', async () => {
    // An anonymous seat is reachable by its secret and by nothing else.
    // Signing in afterwards must not be a way to walk into one.
    const room = await admitted();
    const dana = await signIn('dana@example.com', 'Dana');
    const refused = await enter(dana.token, room.channelId);
    expect(refused.statusCode).toBe(400);
    room.guest.close();
    room.member.close();
  });

  it('refuses once the room is empty of members', async () => {
    // A seat is a place to come back to while the room is there. The guest
    // link stops working when the channel empties and a seat is on the same
    // clock, so this cannot be the way back into an empty one.
    //
    // **And the seat is gone before the presence check runs.**
    // `channelEmptied` pulls every seat's `expires_at` back to the moment the
    // last member left, so `liveForAccount` no longer finds it and the refusal
    // is the seat lookup's rather than the room's. `enterSeat`'s presence test
    // is the belt to that braces, and this asserts the order they fire in.
    const { dana, channelId, guest, member } = await seated();
    member.send({
      type: 'channel.action',
      channelId,
      action: { type: 'STEP_OUT' },
    });
    await member.next('channel', (m) => m.view.channel.present.length === 0);

    const refused = await enter(dana.token, channelId);
    expect(refused.statusCode).toBe(400);
    expect(refused.json()).toEqual({ error: 'You have no seat here.' });
    guest.close();
    member.close();
  });
});

describe('being asked in as a guest', () => {
  /**
   * The offer that did not exist: a seat, addressed to somebody by name.
   *
   * A guest link reaches anybody and rings nobody; `INVITE` rings somebody and
   * makes them a member. Neither is a way to ask one particular person to come
   * and listen, which is what these cover — including the two things that most
   * want to go wrong, that it must not write a membership, and that it must
   * not be offered to a stranger.
   */
  const invite = (token: string, channelId: string, contactId: string) =>
    app.fastify.inject({
      method: 'POST',
      url: `/channels/${channelId}/guest-invites`,
      headers: auth(token),
      payload: { contactId },
    });

  const home = async (token: string) => {
    const got = await app.fastify.inject({
      method: 'GET',
      url: '/home',
      headers: auth(token),
    });
    return got.json() as {
      invites: Array<{ channelId: string; guest?: boolean; from: { displayName: string } }>;
      rejoinable: Array<{ channelId: string; seat?: boolean }>;
    };
  };

  /** Alice in her channel, present, with Dana a contact of hers. */
  async function withContact() {
    const room = await channelWithLink();
    const dana = await signIn('dana@example.com', 'Dana');
    await app.fastify.inject({
      method: 'POST',
      url: '/contacts/request',
      headers: auth(room.alice.token),
      payload: { identifier: 'dana@example.com' },
    });
    await app.fastify.inject({
      method: 'POST',
      url: `/contacts/${room.alice.account.id}/accept`,
      headers: auth(dana.token),
    });
    return { ...room, dana };
  }

  it('offers a seat without spending one of the six', async () => {
    // The whole point of the feature in one assertion. INVITE writes into
    // participants; this must not, or the offer is a membership wearing
    // different words.
    const { alice, channelId, dana, member } = await withContact();

    const offered = await invite(alice.token, channelId, dana.account.id);
    expect(offered.statusCode).toBe(200);

    const state = app.channels.get(channelId)!;
    expect(state.participants).not.toContain(dana.account.id);
    // And nobody is in the room yet: an invitation is not an arrival.
    expect(Object.keys(state.guests)).toHaveLength(0);

    member.close();
  });

  it('reaches them as a push that says which offer it is', async () => {
    const { alice, channelId, dana, member } = await withContact();
    // A push reaches a device rather than an account, so there has to be one.
    await app.fastify.inject({
      method: 'POST',
      url: '/devices',
      headers: auth(dana.token),
      payload: { token: 'dana-phone', platform: 'ios' },
    });

    await invite(alice.token, channelId, dana.account.id);
    // The send is not awaited by the route — notifying is deliberately not
    // something a reply waits on — so this is the same beat the suite's other
    // push assertions take.
    await new Promise((resolve) => setTimeout(resolve, 20));

    const sent = pusher.messagesFor('dana-phone');
    expect(sent).toHaveLength(1);
    // The kind it shares with an ordinary invitation, because no rule
    // separates the two — and the sentence that is the whole difference.
    expect(sent[0].kind).toBe('invited');
    expect(sent[0].body).toContain('as a guest');
    expect(sent[0].title).toBe('Alice');

    member.close();
  });

  it('hands back a secret, which is the credential a browser needs', async () => {
    /*
      **The app ignores this and the guest page cannot work without it.** A
      seat's socket authenticates with `guestId` and a secret and has no
      session to fall back on, and the secret `invite` minted was never kept —
      only its hash. So one is minted here, against an account that has just
      proved it holds the seat, and it has to actually open the door.
    */
    const { alice, channelId, dana, member } = await withContact();
    await invite(alice.token, channelId, dana.account.id);

    const entered = await app.fastify.inject({
      method: 'POST',
      url: `/channels/${channelId}/seat/enter`,
      headers: auth(dana.token),
    });
    expect(entered.statusCode).toBe(200);
    const { guestId, secret } = entered.json() as {
      guestId: string;
      secret: string;
    };
    expect(typeof secret).toBe('string');
    expect(secret.length).toBeGreaterThan(20);

    // The pair opens the seat, which is the whole claim. `clock` rather than
    // `Date.now()`: this suite runs on a fixed 2023 clock, and a real
    // timestamp is years past every seat's expiry.
    expect(app.channels.guests.reconnect(guestId, secret, clock)).toBeDefined();
    // And nothing else does.
    expect(
      app.channels.guests.reconnect(guestId, 'not-the-secret', clock)
    ).toBeUndefined();

    member.close();
  });

  it('holds a seat in the room, so the door counts it', async () => {
    /*
      **The hole this closes, end to end.** The ceiling was counted when an
      invitation was made — rows plus guests — and nowhere else, so the
      reducer's own check at `GUEST_ENTERED` saw only the room. A room could
      promise forty seats and then admit forty more people through the door.

      One invitation is enough to show it: the offer is in the channel's
      state, and `guestsPromised` is what every ceiling now reads.
    */
    const { alice, channelId, dana, member } = await withContact();
    await invite(alice.token, channelId, dana.account.id);

    const state = app.channels.get(channelId)!;
    // In the room's picture of itself, and not in the room.
    expect(Object.keys(state.guestInvites ?? {})).toHaveLength(1);
    expect(Object.keys(state.guests)).toHaveLength(0);
    expect(guestsPromised(state, clock)).toBe(1);

    // And taking it back gives the seat straight back.
    const guestId = Object.keys(state.guestInvites ?? {})[0]!;
    await app.fastify.inject({
      method: 'DELETE',
      url: `/channels/${channelId}/guest-invites/${guestId}`,
      headers: auth(alice.token),
    });
    expect(guestsPromised(app.channels.get(channelId)!, clock)).toBe(0);

    member.close();
  });

  it('shows on their Home as an invitation, not as a seat', async () => {
    // Before accepting there is nowhere to go back to, so it must not be in
    // `rejoinable` — which is what `liveForAccount` withholding pending rows
    // is for.
    const { alice, channelId, dana, member } = await withContact();
    await invite(alice.token, channelId, dana.account.id);

    const view = await home(dana.token);
    expect(view.rejoinable.map((r) => r.channelId)).not.toContain(channelId);
    const asked = view.invites.find((i) => i.channelId === channelId);
    expect(asked).toBeDefined();
    expect(asked!.guest).toBe(true);
    expect(asked!.from.displayName).toBe('Alice');

    member.close();
  });

  it('becomes a seat when they walk in, and only then', async () => {
    const { alice, channelId, dana, member } = await withContact();
    await invite(alice.token, channelId, dana.account.id);

    const entered = await app.fastify.inject({
      method: 'POST',
      url: `/channels/${channelId}/seat/enter`,
      headers: auth(dana.token),
    });
    expect(entered.statusCode).toBe(200);

    // In the room as a guest, still not a member of it.
    const state = app.channels.get(channelId)!;
    expect(state.participants).not.toContain(dana.account.id);
    expect(Object.values(state.guests)[0]?.accountId).toBe(dana.account.id);

    // And it has changed sides on Home: somewhere to go back to rather than
    // something being offered.
    const view = await home(dana.token);
    expect(view.invites.map((i) => i.channelId)).not.toContain(channelId);
    expect(view.rejoinable.find((r) => r.channelId === channelId)?.seat).toBe(true);

    member.close();
  });

  it('will not ask a stranger', async () => {
    // The no-strangers rule, which is why this is contacts-only where a link
    // is not: a link cannot ring anybody and this can.
    const room = await channelWithLink();
    const stranger = await signIn('eve@example.com', 'Eve');
    const refused = await invite(
      room.alice.token,
      room.channelId,
      stranger.account.id
    );
    expect(refused.statusCode).toBe(403);
    expect(refused.json()).toEqual({ error: 'Not a contact.' });
    room.member.close();
  });

  it('will not ask somebody who is already a member', async () => {
    const { alice, bob, channelId, member } = await channelWithLink();
    const refused = await invite(alice.token, channelId, bob.account.id);
    expect(refused.statusCode).toBe(409);
    member.close();
  });

  it('will not offer two seats to one person', async () => {
    const { alice, channelId, dana, member } = await withContact();
    expect((await invite(alice.token, channelId, dana.account.id)).statusCode).toBe(200);
    const again = await invite(alice.token, channelId, dana.account.id);
    expect(again.statusCode).toBe(409);
    member.close();
  });

  it('is taken back by a member, and leaves their Home when it is', async () => {
    const { alice, channelId, dana, member } = await withContact();
    const offered = await invite(alice.token, channelId, dana.account.id);
    const { guestId } = offered.json() as { guestId: string };

    const listed = await app.fastify.inject({
      method: 'GET',
      url: `/channels/${channelId}/guest-invites`,
      headers: auth(alice.token),
    });
    expect((listed.json() as { invites: unknown[] }).invites).toHaveLength(1);

    const revoked = await app.fastify.inject({
      method: 'DELETE',
      url: `/channels/${channelId}/guest-invites/${guestId}`,
      headers: auth(alice.token),
    });
    expect(revoked.statusCode).toBe(200);

    const view = await home(dana.token);
    expect(view.invites.map((i) => i.channelId)).not.toContain(channelId);
    // And it is no longer a way in.
    const entered = await app.fastify.inject({
      method: 'POST',
      url: `/channels/${channelId}/seat/enter`,
      headers: auth(dana.token),
    });
    expect(entered.statusCode).toBe(400);

    member.close();
  });

  it('stops meaning anything once the room empties', async () => {
    // The lifetime the seat row already had, which is why this needed no new
    // clock: channelEmptied pulls every seat's expiry back to the moment the
    // last member left, and a pending invitation is a seat row.
    const { alice, channelId, dana, member } = await withContact();
    await invite(alice.token, channelId, dana.account.id);
    expect(alice).toBeDefined();

    member.send({ type: 'channel.action', channelId, action: { type: 'STEP_OUT' } });
    await member.next('channel', (m) => m.view.channel.present.length === 0);

    const view = await home(dana.token);
    expect(view.invites.map((i) => i.channelId)).not.toContain(channelId);

    member.close();
  });
});
