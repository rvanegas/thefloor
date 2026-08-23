import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import WebSocket from 'ws';
import { buildApp, type App } from '../src/app';
import { MemoryMailer } from '../src/mail';
import { MemoryMediaServer } from '../src/media';
import { WATCH_TOKEN_TTL_MS } from '../src/accounts';
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

async function watchLink(token: string, channelId: string): Promise<string> {
  const minted = await app.fastify.inject({
    method: 'POST',
    url: `/channels/${channelId}/watch-token`,
    headers: auth(token),
  });
  expect(minted.statusCode).toBe(200);
  return (minted.json() as { url: string }).url;
}

describe('the link', () => {
  it('carries the token in the fragment, never the path or the query', async () => {
    const { alice, channelId } = await channelOfTwo();
    const url = await watchLink(alice.token, channelId);
    expect(url).toContain(`/watch/${channelId}#`);
    // Everything before the hash is what a proxy, an access log and a Referer
    // header would see, and the token must not be in any of them.
    expect(url.slice(0, url.indexOf('#'))).not.toContain(tokenOf(url));
  });

  it('is refused to somebody who is not in the channel', async () => {
    const { channelId } = await channelOfTwo();
    const stranger = await signIn('carol@example.com', 'Carol');
    const refused = await app.fastify.inject({
      method: 'POST',
      url: `/channels/${channelId}/watch-token`,
      headers: auth(stranger.token),
    });
    expect(refused.statusCode).toBe(403);
  });

  it('does not sign the phone out, however many screens are opened', async () => {
    const { alice, channelId } = await channelOfTwo();
    await watchLink(alice.token, channelId);
    await watchLink(alice.token, channelId);
    // The session token still works, which is the whole reason this is not a
    // row in `tokens` — `issueToken` revokes every other session.
    const home = await app.fastify.inject({
      method: 'GET',
      url: '/home',
      headers: auth(alice.token),
    });
    expect(home.statusCode).toBe(200);
  });

  it('serves the page to anybody, since the credential never arrives', async () => {
    const { channelId } = await channelOfTwo();
    const page = await app.fastify.inject({ method: 'GET', url: `/watch/${channelId}` });
    expect(page.statusCode).toBe(200);
    expect(page.headers['content-type']).toContain('text/html');
    expect(page.body).toContain(channelId);
  });

  it('asks for headphones before it makes any sound', async () => {
    const { channelId } = await channelOfTwo();
    const page = await app.fastify.inject({ method: 'GET', url: `/watch/${channelId}` });

    // On the gate, which is the last moment before this screen makes a sound
    // and so the last moment the advice can be acted on. The mechanism it is
    // about is not fixable in code: a microphone near this screen sends the
    // video back into the channel, arriving late on top of everybody's own
    // copy, and the phone's echo canceller cancels only what the phone plays.
    expect(page.body).toContain('headphones');
    expect(page.body.indexOf('headphones')).toBeLessThan(
      page.body.indexOf('id="status"')
    );
  });

  it('cues a swapped-in video rather than loading it, so nothing plays itself', async () => {
    const { channelId } = await channelOfTwo();
    const page = await app.fastify.inject({ method: 'GET', url: `/watch/${channelId}` });

    // The link is bound to the channel, so a second video pasted an hour later
    // arrives on screens that are already open. It must arrive *stopped*: a
    // party always begins paused, and `loadVideoById` would play it anyway —
    // a burst of film on a laptop across the room, pulled back a moment later
    // by `follow()`. `cueVideoById` is the same call without the playing.
    //
    // Asserted against the *call* rather than the word, because the comment
    // beside it names `loadVideoById` in order to warn somebody off it — and a
    // test that made explaining the trap impossible would be a bad trade.
    expect(page.body).toContain('player.cueVideoById(');
    expect(page.body).not.toContain('player.loadVideoById(');
    // Which leaves exactly one thing able to start a video, and it acts on the
    // channel rather than on its own account.
    expect(page.body).toContain('playVideo');
  });

  it('names what is playing and where, and offers the link', async () => {
    const { channelId } = await channelOfTwo();
    const page = await app.fastify.inject({ method: 'GET', url: `/watch/${channelId}` });
    const footer = page.body.slice(
      page.body.indexOf('<div id="status">'),
      page.body.indexOf('</div>', page.body.indexOf('<div id="status">'))
    );

    // All four in the footer rather than merely somewhere on the page.
    for (const id of ['id="title"', 'id="channel"', 'id="copy"', 'id="fullscreen"']) {
      expect(footer).toContain(id);
    }
    // The title comes off the player, never from a request this server makes:
    // nothing here asks YouTube anything, which is the premise of the feature.
    expect(page.body).toContain('getVideoData');
    expect(page.body).not.toContain('googleapis');
    // And the copy button hands over the URL as it was pasted, which is why
    // the party keeps it rather than rebuilding one from the id.
    expect(page.body).toContain('watch.party.url');
  });

  it('offers full screen without giving the player its controls back', async () => {
    const { channelId } = await channelOfTwo();
    const page = await app.fastify.inject({ method: 'GET', url: `/watch/${channelId}` });

    expect(page.body).toContain('id="fullscreen"');
    // On the root element, never on the player: taking the iframe fullscreen
    // would mean handing YouTube's control bar back, and scrubbing with it.
    expect(page.body).toContain('requestFullscreen');
    // The guard that keeps this page a follower. If `controls: 0` ever goes,
    // the viewer gets a scrubber and becomes a second authority over a shared
    // transport — which is the one thing the whole design refuses.
    expect(page.body).toContain('controls: 0');
  });
});

describe('a watch token is not a session', () => {
  it('is refused on an authenticated route', async () => {
    const { alice, channelId } = await channelOfTwo();
    const watchToken = tokenOf(await watchLink(alice.token, channelId));
    for (const url of ['/home', '/leaderboard']) {
      const refused = await app.fastify.inject({
        method: 'GET',
        url,
        headers: auth(watchToken),
      });
      expect(refused.statusCode).toBe(401);
    }
  });

  it('cannot mint another one, or a media token', async () => {
    const { alice, channelId } = await channelOfTwo();
    const watchToken = tokenOf(await watchLink(alice.token, channelId));
    for (const route of ['watch-token', 'media-token']) {
      const refused = await app.fastify.inject({
        method: 'POST',
        url: `/channels/${channelId}/${route}`,
        headers: auth(watchToken),
      });
      expect(refused.statusCode).toBe(401);
    }
  });

  it('expires on its own, and its lifetime is the one that was chosen', async () => {
    const { alice, channelId } = await channelOfTwo();
    const watchToken = tokenOf(await watchLink(alice.token, channelId));
    expect(app.accounts.watchTokenFor(watchToken, clock)).toBeDefined();
    expect(
      app.accounts.watchTokenFor(watchToken, clock + WATCH_TOKEN_TTL_MS + 1)
    ).toBeUndefined();
  });
});

describe('a watch-scoped socket', () => {
  it('sees its channel', async () => {
    const { alice, channelId } = await channelOfTwo();
    app.channels.dispatch(channelId, alice.account.id, {
      type: 'START_WATCH',
      url: URL,
    } as never);

    const page = new Client(tokenOf(await watchLink(alice.token, channelId)), baseUrl);
    await page.open();
    page.send({ type: 'watch.channel', channelId });
    const snapshot = await page.next('channel');
    expect(snapshot.view.channel.watch.party?.videoId).toBe(VIDEO);
    page.close();
  });

  it('may report a duration, which the channel keeps', async () => {
    const { alice, channelId } = await channelOfTwo();
    app.channels.dispatch(channelId, alice.account.id, {
      type: 'START_WATCH',
      url: URL,
    } as never);

    const page = new Client(tokenOf(await watchLink(alice.token, channelId)), baseUrl);
    await page.open();
    page.send({ type: 'watch.channel', channelId });
    await page.next('channel');
    page.send({
      type: 'channel.action',
      channelId,
      action: { type: 'WATCH_READY', durationMs: 600_000 },
    });
    await page.next(
      'channel',
      (m) => m.view.channel.watch.party?.durationMs === 600_000
    );
    page.close();
  });

  it('may not drive the transport — control lives on the phone', async () => {
    const { alice, channelId } = await channelOfTwo();
    app.channels.dispatch(channelId, alice.account.id, {
      type: 'START_WATCH',
      url: URL,
    } as never);

    const page = new Client(tokenOf(await watchLink(alice.token, channelId)), baseUrl);
    await page.open();
    page.send({
      type: 'channel.action',
      channelId,
      action: { type: 'WATCH_PLAY' },
    });
    await page.next('error', (m) => m.code === 'forbidden');
    expect(app.channels.get(channelId)?.watch.status).toBe('paused');
    page.close();
  });

  it('may not act on the channel in any other way either', async () => {
    const { alice, bob, channelId } = await channelOfTwo();
    const page = new Client(tokenOf(await watchLink(alice.token, channelId)), baseUrl);
    await page.open();
    for (const action of [
      { type: 'CLAIM_FLOOR' },
      { type: 'STEP_OUT' },
      { type: 'DELETE_CHANNEL' },
      { type: 'PASTE_CLIP', text: 'hello' },
    ] as const) {
      page.send({ type: 'channel.action', channelId, action } as ClientMessage);
    }
    await page.next('error', (m) => m.code === 'forbidden');
    const channel = app.channels.get(channelId)!;
    expect(channel.floor.holder).toBeNull();
    expect(channel.present).toContain(bob.account.id);
    expect(channel.clip).toBeNull();
    page.close();
  });

  it('may not watch a second channel, nor Home', async () => {
    const { alice, channelId } = await channelOfTwo();
    // A third person, so the second channel is genuinely a different one — a
    // pair already holding a channel is handed the one they have.
    const carol = await signIn('carol@example.com', 'Carol');
    await app.fastify.inject({
      method: 'POST',
      url: '/contacts/request',
      headers: auth(alice.token),
      payload: { identifier: 'carol@example.com' },
    });
    await app.fastify.inject({
      method: 'POST',
      url: `/contacts/${alice.account.id}/accept`,
      headers: auth(carol.token),
    });
    const other = await app.fastify.inject({
      method: 'POST',
      url: '/channels',
      headers: auth(alice.token),
      payload: { contactId: carol.account.id },
    });
    const second = (other.json() as { channelId: string }).channelId;
    expect(second).not.toBe(channelId);

    const page = new Client(tokenOf(await watchLink(alice.token, channelId)), baseUrl);
    await page.open();
    page.send({ type: 'watch.channel', channelId: second });
    page.send({ type: 'watch.home' });
    await page.next('error', (m) => m.code === 'forbidden');
    expect(page.received.some((m) => m.type === 'home')).toBe(false);
    expect(
      page.received.some((m) => m.type === 'channel' && m.view.channel.id === second)
    ).toBe(false);
    page.close();
  });

  it('does not hold its owner in the room', async () => {
    const { alice, channelId } = await channelOfTwo();
    const page = new Client(tokenOf(await watchLink(alice.token, channelId)), baseUrl);
    await page.open();
    page.send({ type: 'watch.channel', channelId });
    await page.next('channel');

    // A laptop is not a presence. Stepping out from the phone must leave, and
    // must stay left however long the tab is open behind it.
    app.channels.dispatch(channelId, alice.account.id, { type: 'STEP_OUT' });
    page.send({ type: 'ping' });
    await page.next('pong');
    expect(app.channels.get(channelId)?.present).not.toContain(alice.account.id);
    page.close();
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
    if (muted) {
      app.channels.dispatch(channelId, alice.account.id, {
        type: 'SET_WATCH_MUTE',
        muted: true,
      } as never);
    }
    app.channels.dispatch(channelId, alice.account.id, { type: 'WATCH_PLAY' });
    await new Promise((r) => setTimeout(r, 0));
    return { alice, bob, channelId };
  }

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

  it('returns to the floors answer rather than to everybody audible', async () => {
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

    // The claim outlived the mute and is still in force underneath it.
    expect(silencedFor(alice.account.id).at(-1)?.silenced).toBe(false);
    expect(silencedFor(bob.account.id).at(-1)?.silenced).toBe(true);
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
    // reducer-level refusal reads from here.
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
