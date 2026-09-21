import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import WebSocket from 'ws';
import { buildApp, type App } from '../src/app';
import { MemoryMailer } from '../src/mail';
import { MemoryMediaServer } from '../src/media';
import { WATCH_TOKEN_TTL_MS } from '../src/accounts';
import { WATCH_DRIFT_MS } from '../../core/constants';
import type { ClientMessage, ServerMessage } from '../../core/protocol';

/**
 * The watch party where it meets the rest of the server: the credential the
 * follower page holds, what a page carrying it may and may not do, and the
 * things the reducer's own tests cannot see — the media plane and a restart.
 *
 * What is *not* here is the transport arithmetic, which is core's and is
 * tested there. Duplicating it against a listening server would be slower and
 * would say less.
 */

let app: App;
let media: MemoryMediaServer;
let baseUrl: string;
let clock = 1_700_000_000_000;
let scratch: string;

const URL = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
const VIDEO = 'dQw4w9WgXcQ';

beforeAll(async () => {
  scratch = await mkdtemp(join(tmpdir(), 'thefloor-watch-test-'));
});

afterAll(async () => {
  await rm(scratch, { recursive: true, force: true });
});

/**
 * On disk rather than `:memory:`, so that a restart can be what a restart is:
 * a second `buildApp` over the same file. The sockets need a listening server
 * besides, which `inject` never gives — see ws.test.ts.
 */
async function boot(): Promise<void> {
  media = new MemoryMediaServer();
  app = buildApp({
    dbPath: join(scratch, `${expect.getState().currentTestName}.db`.replace(/[^\w.-]/g, '_')),
    mailer: new MemoryMailer(),
    media,
    mediaUrl: 'wss://example.livekit.cloud',
    now: () => clock,
    roomCloseGraceMs: 0,
  });
  await app.fastify.listen({ port: 0, host: '127.0.0.1' });
  const address = app.fastify.server.address();
  if (typeof address === 'string' || address === null) throw new Error('no port');
  baseUrl = `127.0.0.1:${address.port}`;
}

async function shutdown(): Promise<void> {
  app.channels.stop();
  await app.fastify.close();
}

/** Everything in memory gone, the durable projection read back. */
async function restart(): Promise<void> {
  await shutdown();
  await boot();
}

beforeEach(async () => {
  clock = 1_700_000_000_000;
  await boot();
});

afterEach(shutdown);

const auth = (token: string) => ({ authorization: `Bearer ${token}` });

class Client {
  private socket: WebSocket;
  readonly received: ServerMessage[] = [];

  constructor(token: string, base: string) {
    this.socket = new WebSocket(`ws://${base}/ws?token=${token}`);
    this.socket.on('message', (raw) => {
      this.received.push(JSON.parse(String(raw)) as ServerMessage);
    });
  }

  open(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.socket.readyState === WebSocket.OPEN) return resolve();
      this.socket.once('open', () => resolve());
      this.socket.once('error', reject);
    });
  }

  send(message: ClientMessage): void {
    this.socket.send(JSON.stringify(message));
  }

  async next<T extends ServerMessage['type']>(
    type: T,
    predicate: (m: Extract<ServerMessage, { type: T }>) => boolean = () => true,
    timeoutMs = 3000
  ): Promise<Extract<ServerMessage, { type: T }>> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const found = this.received.find(
        (m): m is Extract<ServerMessage, { type: T }> =>
          m.type === type && predicate(m as Extract<ServerMessage, { type: T }>)
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

  close(): void {
    this.socket.close();
  }
}

/**
 * Signs somebody in, with settings left at their defaults — Labs off.
 *
 * The watch party was behind Labs until 2026-09-18 and this helper turned it
 * on for every test in the file. It does not any more, which is the assertion:
 * everything here is an ordinary account. See `labs` in core/settings.ts.
 */
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

async function channelOfTwo() {
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
    url: '/channels',
    headers: auth(alice.token),
    payload: { contactId: bob.account.id },
  });
  const { channelId } = created.json() as { channelId: string };
  app.channels.dispatch(channelId, bob.account.id, { type: 'ENTER' });
  return { alice, bob, channelId };
}

/** The token out of the link, which is where the whole design puts it. */
function tokenOf(url: string): string {
  return url.slice(url.indexOf('#') + 1);
}

/*
  **The follower page's tests went with the page on 2026-09-17.**

  Three describes stood here — *the link*, *a watch token is not a session* and
  *a watch-scoped socket* — covering a browser that followed a channel on a
  six-hour link credential: that the token rode in the fragment, that it bought
  nothing but watching, and that a page could not hold its owner in a room.

  All three are about a surface that no longer exists. A screen is an ordinary
  signed-in instance of the app now, so what used to be the scope's business is
  the account's: see *choosing which device shows a film* in ws.test.ts, and
  planning/decisions/2026-09-17-the-screen-is-the-app.md for why the credential
  went rather than being narrowed.
*/

describe('starting and stopping', () => {
  /**
   * What the Labs gate used to guard. Starting a party was refused to an
   * account that had not asked for the experimental features; it left Labs on
   * 2026-09-18, so an ordinary account starts one — and everybody in the
   * channel can still stop it, which is the half that was never gated. See
   * `dispatch` in src/channels.ts and `labs` in core/settings.ts.
   */
  it('lets an account with Labs off start a party', async () => {
    const { alice, channelId } = await channelOfTwo();

    const started = app.channels.dispatch(channelId, alice.account.id, {
      type: 'START_WATCH',
      url: URL,
    } as never);
    expect(started.ok).toBe(true);
    expect(app.channels.get(channelId)!.watch.party).not.toBeNull();
  });

  it('lets the rest of the channel stop one that is already running', async () => {
    const { alice, bob, channelId } = await channelOfTwo();
    app.channels.dispatch(channelId, alice.account.id, {
      type: 'START_WATCH',
      url: URL,
    } as never);
    // Bob never started any of this, and is now in a channel driving his own
    // player. Stopping it is the one thing he must be able to do.
    const stopped = app.channels.dispatch(channelId, bob.account.id, {
      type: 'STOP_WATCH',
    } as never);
    expect(stopped.ok).toBe(true);
    expect(app.channels.get(channelId)!.watch.party).toBeNull();
  });
});

describe('a party and the rest of the channel', () => {
  it('stops the shared audio when it replaces a track', async () => {
    const { alice, channelId } = await channelOfTwo();
    const path = join(scratch, 'tone.mp3');
    await new Promise<void>((resolve, reject) => {
      const child = spawn('ffmpeg', [
        '-v', 'error', '-f', 'lavfi',
        '-i', 'sine=frequency=440:duration=2:sample_rate=48000',
        '-y', path,
      ]);
      child.on('error', reject);
      child.on('close', (code) =>
        code === 0 ? resolve() : reject(new Error(`ffmpeg exited ${code}`))
      );
    });
    const uploaded = await app.fastify.inject({
      method: 'POST',
      url: `/channels/${channelId}/track?name=${encodeURIComponent('Tone.mp3')}`,
      headers: { ...auth(alice.token), 'content-type': 'audio/mpeg' },
      payload: await readFile(path),
    });
    expect(uploaded.statusCode).toBe(200);
    await new Promise((r) => setTimeout(r, 0));
    expect(media.playbacks.length).toBe(1);
    app.channels.dispatch(channelId, alice.account.id, { type: 'PLAY' });
    await new Promise((r) => setTimeout(r, 0));

    app.channels.dispatch(channelId, alice.account.id, {
      type: 'START_WATCH',
      url: URL,
    } as never);
    await new Promise((r) => setTimeout(r, 0));

    // No `applyWatchToMedia` exists, and none is needed. Clearing the track in
    // the reducer is the whole of it: the media plane follows committed state,
    // so the pause is issued by the path that was already watching.
    //
    // The participant itself stays, which is not this feature's doing —
    // `applyPlaybackToMedia` keeps it for the channel's life, publishing
    // silence between tracks so a recording's stem keeps its place. Only the
    // channel ending closes it.
    expect(media.playbacks[0].commands).toContainEqual({ type: 'pause' });
    expect(media.playbacks[0].closed).toBe(false);
    expect(app.channels.get(channelId)?.playback.track).toBeNull();
  });

  it('refuses a link that is not YouTube, before the reducer sees it', async () => {
    const { alice, channelId } = await channelOfTwo();
    const refused = app.channels.dispatch(channelId, alice.account.id, {
      type: 'START_WATCH',
      url: 'https://example.com/cats.mp4',
    } as never);
    expect(refused.ok).toBe(false);
    expect(app.channels.get(channelId)?.watch.party).toBeNull();
  });
});

describe('muting the room reaches the media plane', () => {
  /** Every pair the plane was told about, newest last. */
  const silencedFor = (speaker: string) =>
    media.subscriptions.filter((s) => s.speaker === speaker);

  /**
   * A party, playing, optionally muted.
   *
   * **Playing matters**: the mute holds only while the video does, so a muted
   * party that was never started withholds nothing — which is the rule, not an
   * oversight in the fixture.
   */
  async function partyOf(muted: boolean) {
    const { alice, bob, channelId } = await channelOfTwo();
    app.channels.dispatch(channelId, alice.account.id, {
      type: 'START_WATCH',
      url: URL,
    } as never);
    // Stated either way rather than leaning on the default, so these tests go
    // on meaning what they say if the default ever moves again — it already
    // has once, from unmuted to muted on 2026-08-23.
    app.channels.dispatch(channelId, alice.account.id, {
      type: 'SET_WATCH_MUTE',
      muted,
    } as never);
    app.channels.dispatch(channelId, alice.account.id, { type: 'WATCH_PLAY' });
    await new Promise((r) => setTimeout(r, 0));
    return { alice, bob, channelId };
  }

  it('starts muted, and the default is what a fresh party gets', async () => {
    const { alice, channelId } = await channelOfTwo();
    app.channels.dispatch(channelId, alice.account.id, {
      type: 'START_WATCH',
      url: URL,
    } as never);
    const fresh = app.channels.get(channelId)!;
    expect(fresh.watch.mutedAll).toBe(true);
    // And paused, so the default withholds nothing until somebody presses
    // Play — which is what makes muting-by-default safe rather than abrupt.
    expect(fresh.watch.status).toBe('paused');
    expect(media.subscriptions.filter((s) => s.silenced)).toHaveLength(0);
  });

  it('withholds everybody, not everybody-but-one', async () => {
    const { alice, bob } = await partyOf(true);
    // The distinction from a floor claim, stated against the plane rather than
    // against the reducer: a claim leaves its holder audible and this does not.
    expect(silencedFor(alice.account.id).at(-1)?.silenced).toBe(true);
    expect(silencedFor(bob.account.id).at(-1)?.silenced).toBe(true);
  });

  it('gives everybody back when it is cleared', async () => {
    const { alice, bob, channelId } = await partyOf(true);
    app.channels.dispatch(channelId, alice.account.id, {
      type: 'SET_WATCH_MUTE',
      muted: false,
    } as never);
    await new Promise((r) => setTimeout(r, 0));

    expect(silencedFor(alice.account.id).at(-1)?.silenced).toBe(false);
    expect(silencedFor(bob.account.id).at(-1)?.silenced).toBe(false);
  });

  it('returns everybody to audible, no claim being possible underneath', async () => {
    /*
      **This used to return to the floor's answer.** A claim could be made
      during a party and outlived the room's mute, so clearing the mute left
      whoever was not holding the floor still silenced.

      A film refuses the floor outright since 2026-09-18 — see
      `watchPartyIsOn` — so the room's mute is the only rule left in here and
      clearing it clears everything. That is the simplification the
      exclusivity bought, asserted against the media plane rather than the
      reducer.
    */
    const { alice, bob, channelId } = await partyOf(false);
    app.channels.dispatch(channelId, alice.account.id, { type: 'CLAIM_FLOOR' });
    app.channels.dispatch(channelId, alice.account.id, {
      type: 'SET_WATCH_MUTE',
      muted: true,
    } as never);
    await new Promise((r) => setTimeout(r, 0));
    app.channels.dispatch(channelId, alice.account.id, {
      type: 'SET_WATCH_MUTE',
      muted: false,
    } as never);
    await new Promise((r) => setTimeout(r, 0));

    expect(silencedFor(alice.account.id).at(-1)?.silenced).toBe(false);
    expect(silencedFor(bob.account.id).at(-1)?.silenced).toBe(false);
  });

  it('gives everybody back on pause, and takes them away again on resume', async () => {
    const { alice, bob, channelId } = await partyOf(true);
    expect(silencedFor(bob.account.id).at(-1)?.silenced).toBe(true);

    app.channels.dispatch(channelId, alice.account.id, { type: 'WATCH_PAUSE' });
    await new Promise((r) => setTimeout(r, 0));
    // Nothing wrote a mute here: the media plane is told because the derived
    // answer changed, which is what `applySilenceToMedia` compares.
    expect(silencedFor(alice.account.id).at(-1)?.silenced).toBe(false);
    expect(silencedFor(bob.account.id).at(-1)?.silenced).toBe(false);

    app.channels.dispatch(channelId, alice.account.id, { type: 'WATCH_PLAY' });
    await new Promise((r) => setTimeout(r, 0));
    expect(silencedFor(bob.account.id).at(-1)?.silenced).toBe(true);
    // And the intent was never touched by either.
    expect(app.channels.get(channelId)?.watch.mutedAll).toBe(true);
  });

  it('is refused to somebody who is not in the room', async () => {
    const { alice, bob, channelId } = await partyOf(false);
    app.channels.dispatch(channelId, bob.account.id, { type: 'STEP_OUT' });
    const refused = app.channels.dispatch(channelId, bob.account.id, {
      type: 'SET_WATCH_MUTE',
      muted: true,
    } as never);
    expect(refused.ok).toBe(true);
    // Accepted as an action and refused by the guard, which is how every
    // reducer-level refusal reads from here. Asserted against a party that was
    // explicitly unmuted, so the mute staying off is evidence the guard ran
    // rather than an accident of what the default happens to be.
    expect(app.channels.get(channelId)?.watch.mutedAll).toBe(false);
    expect(alice).toBeDefined();
  });
});

describe('across a restart', () => {
  it('comes back paused where it was', async () => {
    const { alice, channelId } = await channelOfTwo();
    app.channels.dispatch(channelId, alice.account.id, {
      type: 'START_WATCH',
      url: URL,
    } as never);
    app.channels.dispatch(channelId, alice.account.id, {
      type: 'WATCH_READY',
      durationMs: 600_000,
      // Both facts a player reports, so the restart carries both. The name is
      // the only part of a party that comes from outside and is kept.
      title: 'A Film',
    } as never);
    app.channels.dispatch(channelId, alice.account.id, { type: 'WATCH_PLAY' });
    clock += 30_000;
    app.channels.dispatch(channelId, alice.account.id, { type: 'WATCH_PAUSE' });

    clock += 5 * 60 * 1000;
    await restart();

    const revived = app.channels.get(channelId)!;
    expect(revived.watch.party).toEqual({
      videoId: VIDEO,
      url: URL,
      durationMs: 600_000,
      title: 'A Film',
    });
    expect(revived.watch.status).toBe('paused');
    expect(revived.watch.positionMs).toBe(30_000);
  });

  it('does not run a party on through the outage it was playing across', async () => {
    const { alice, channelId } = await channelOfTwo();
    app.channels.dispatch(channelId, alice.account.id, {
      type: 'START_WATCH',
      url: URL,
    } as never);
    app.channels.dispatch(channelId, alice.account.id, { type: 'WATCH_PLAY' });
    clock += 10_000;

    clock += 60 * 60 * 1000;
    await restart();

    // The banked position, not the derived one: nobody watched the hour the
    // box was down, and understating is the safe direction.
    const revived = app.channels.get(channelId)!;
    expect(revived.watch.status).toBe('paused');
    expect(revived.watch.positionMs).toBe(0);
  });
});
