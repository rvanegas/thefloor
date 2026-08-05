import { buildApp, type App } from '../src/app';
import { MemoryMailer } from '../src/mail';
import { MemoryMediaServer } from '../src/media';

/**
 * The floor is specified as a hard cut at the transport level. These assert
 * that a claim actually reaches the media server as a mute, that it targets the
 * right party, and that it cannot be triggered by anyone but the authority.
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
  });
});

afterEach(async () => {
  app.sessions.stop();
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

async function sessionOfTwo() {
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
  const created = await app.fastify.inject({
    method: 'POST',
    url: '/sessions',
    headers: auth(alice.token),
    payload: { contactId: bob.account.id },
  });
  const { sessionId } = created.json() as { sessionId: string };
  app.sessions.dispatch(sessionId, bob.account.id, { type: 'ENTER' });
  return { alice, bob, sessionId };
}

/** Media calls are fire-and-forget, so let the microtask queue drain. */
const settle = () => new Promise((r) => setTimeout(r, 0));

describe('the floor as an actual mute', () => {
  it('mutes the other party when a claim is made', async () => {
    const { alice, bob, sessionId } = await sessionOfTwo();

    app.sessions.dispatch(sessionId, alice.account.id, { type: 'CLAIM_FLOOR' });
    await settle();

    expect(media.isMuted(sessionId, bob.account.id)).toBe(true);
    expect(media.isMuted(sessionId, alice.account.id)).toBe(false);
  });

  it('restores both when the claim is released', async () => {
    const { alice, bob, sessionId } = await sessionOfTwo();
    app.sessions.dispatch(sessionId, alice.account.id, { type: 'CLAIM_FLOOR' });
    await settle();

    app.sessions.dispatch(sessionId, alice.account.id, { type: 'RELEASE_FLOOR' });
    await settle();

    expect(media.isMuted(sessionId, bob.account.id)).toBe(false);
    expect(media.isMuted(sessionId, alice.account.id)).toBe(false);
  });

  it('unmutes when the three minutes expire, without anyone acting', async () => {
    const { alice, bob, sessionId } = await sessionOfTwo();
    app.sessions.dispatch(sessionId, alice.account.id, { type: 'CLAIM_FLOOR' });
    await settle();
    expect(media.isMuted(sessionId, bob.account.id)).toBe(true);

    clock += 3 * 60 * 1000;
    app.sessions.tick();
    await settle();

    expect(media.isMuted(sessionId, bob.account.id)).toBe(false);
  });

  it('unmutes when the holder leaves mid-claim', async () => {
    const { alice, bob, sessionId } = await sessionOfTwo();
    app.sessions.dispatch(sessionId, alice.account.id, { type: 'CLAIM_FLOOR' });
    await settle();

    app.sessions.dispatch(sessionId, alice.account.id, { type: 'LEAVE' });
    await settle();

    expect(media.isMuted(sessionId, bob.account.id)).toBe(false);
  });

  it('does not touch the media server when a refused claim changes nothing', async () => {
    const { alice, bob, sessionId } = await sessionOfTwo();
    app.sessions.dispatch(sessionId, alice.account.id, { type: 'CLAIM_FLOOR' });
    await settle();
    media.muted.clear();

    // Bob is silenced and cannot claim; nothing should reach the media server.
    app.sessions.dispatch(sessionId, bob.account.id, { type: 'CLAIM_FLOOR' });
    await settle();

    expect(media.muted.size).toBe(0);
  });

  it('closes the room when the session ends', async () => {
    const { alice, sessionId } = await sessionOfTwo();
    app.sessions.dispatch(sessionId, alice.account.id, { type: 'END' });
    await settle();
    expect(media.closed).toContain(sessionId);
  });

  it('keeps the rules working when the media server fails', async () => {
    const broken = buildApp({
      dbPath: ':memory:',
      mailer: new MemoryMailer(),
      now: () => clock,
      media: {
        async issueToken() {
          return 'irrelevant';
        },
        async setMuted() {
          throw new Error('livekit unreachable');
        },
        async closeRoom() {},
      },
    });

    const mk = async (identifier: string, displayName: string) => {
      const code = broken.accounts.issueCode(identifier, clock)!;
      const res = await broken.fastify.inject({
        method: 'POST',
        url: '/auth/verify',
        payload: { identifier, code, displayName },
      });
      return res.json() as { token: string; account: { id: string } };
    };
    const a = await mk('a@example.com', 'A');
    const b = await mk('b@example.com', 'B');
    await broken.fastify.inject({
      method: 'POST',
      url: '/contacts/request',
      headers: { authorization: `Bearer ${a.token}` },
      payload: { identifier: 'b@example.com' },
    });
    await broken.fastify.inject({
      method: 'POST',
      url: `/contacts/${a.account.id}/accept`,
      headers: { authorization: `Bearer ${b.token}` },
    });
    const created = await broken.fastify.inject({
      method: 'POST',
      url: '/sessions',
      headers: { authorization: `Bearer ${a.token}` },
      payload: { contactId: b.account.id },
    });
    const { sessionId } = created.json() as { sessionId: string };
    broken.sessions.dispatch(sessionId, b.account.id, { type: 'ENTER' });

    // The mute throws, but the session rules must still advance — the reducer
    // is the authority, and the media server is downstream of it.
    broken.sessions.dispatch(sessionId, a.account.id, { type: 'CLAIM_FLOOR' });
    await settle();

    expect(broken.sessions.get(sessionId)!.floor.holder).toBe(a.account.id);

    // And the failure must not have escaped as an unhandled rejection.
    clock += 3 * 60 * 1000;
    broken.sessions.tick();
    await settle();
    expect(broken.sessions.get(sessionId)!.floor.holder).toBeNull();

    broken.sessions.stop();
    await broken.fastify.close();
  });
});

describe('join credentials', () => {
  it('issues a token scoped to the session room', async () => {
    const { alice, sessionId } = await sessionOfTwo();
    const response = await app.fastify.inject({
      method: 'POST',
      url: `/sessions/${sessionId}/media-token`,
      headers: auth(alice.token),
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      token: `token:${sessionId}:${alice.account.id}`,
      url: 'wss://example.livekit.cloud',
    });
  });

  it('refuses anyone outside the session', async () => {
    const { sessionId } = await sessionOfTwo();
    const mallory = await signIn('mallory@example.com', 'Mallory');
    const response = await app.fastify.inject({
      method: 'POST',
      url: `/sessions/${sessionId}/media-token`,
      headers: auth(mallory.token),
    });
    expect(response.statusCode).toBe(403);
    expect(media.issued).not.toContainEqual({
      room: sessionId,
      identity: mallory.account.id,
    });
  });

  it('refuses an unauthenticated caller', async () => {
    const { sessionId } = await sessionOfTwo();
    const response = await app.fastify.inject({
      method: 'POST',
      url: `/sessions/${sessionId}/media-token`,
    });
    expect(response.statusCode).toBe(401);
  });

  it('reports audio as unconfigured when no media server is present', async () => {
    const noAudio = buildApp({ dbPath: ':memory:', now: () => clock });
    const health = await noAudio.fastify.inject({ method: 'GET', url: '/healthz' });
    expect(health.json().audio).toBe('none');
    noAudio.sessions.stop();
    await noAudio.fastify.close();
  });
});
