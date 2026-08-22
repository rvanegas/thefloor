import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildApp, type App } from '../src/app';
import { MemoryMailer } from '../src/mail';
import { MAX_CLIP_LENGTH } from '../../core/constants';

/**
 * The server's half of the channel clipboard, which is small on purpose: there
 * is no route and no table, only an action whose identifying facts the server
 * refuses to take from the client.
 *
 * Two properties are worth stating. The id, the author and the moment are
 * minted here — a client that sent its own would be naming something nobody
 * else agreed to. And what is pasted survives a restart, unlike the track it
 * sits beside, because it is the content itself rather than a handle on a file
 * the dead process owned.
 */

let dir: string;
let clock = 1_700_000_000_000;

beforeEach(() => {
  clock = 1_700_000_000_000;
  dir = mkdtempSync(join(tmpdir(), 'thefloor-clip-'));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

const dbPath = () => join(dir, 'thefloor.db');
const auth = (token: string) => ({ authorization: `Bearer ${token}` });

function boot(): App {
  return buildApp({
    dbPath: dbPath(),
    mailer: new MemoryMailer(),
    now: () => clock,
    roomCloseGraceMs: 0,
  });
}

async function shutdown(app: App): Promise<void> {
  app.channels.stop();
  await app.fastify.close();
}

async function signIn(app: App, identifier: string, displayName: string) {
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

/** Alice and Bob as contacts, in a channel, both present. */
async function pair(app: App) {
  const alice = await signIn(app, 'alice@example.com', 'Alice');
  const bob = await signIn(app, 'bob@example.com', 'Bob');
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
  app.channels.dispatch(created.channel.id, bob.account.id, { type: 'ENTER' });
  return { alice, bob, channelId: created.channel.id };
}

const paste = (app: App, channelId: string, userId: string, text: unknown) =>
  app.channels.dispatch(channelId, userId, {
    type: 'PASTE_CLIP',
    text,
  } as never);

describe('pasting into a channel', () => {
  let app: App;
  afterEach(() => shutdown(app));

  it('mints the id, the author and the moment rather than taking them', async () => {
    app = boot();
    const { alice, channelId } = await pair(app);
    clock += 30_000;

    const result = paste(app, channelId, alice.account.id, 'https://example.com');
    expect(result.ok).toBe(true);

    const clip = app.channels.get(channelId)!.clip!;
    expect(clip.text).toBe('https://example.com');
    expect(clip.authorId).toBe(alice.account.id);
    expect(clip.pastedAt).toBe(clock);
    expect(clip.kind).toBe('text');
    expect(clip.id).toMatch(/^clip/);
  });

  it('gives a replacement a different id from what it replaced', async () => {
    app = boot();
    const { alice, bob, channelId } = await pair(app);
    paste(app, channelId, alice.account.id, 'first');
    const first = app.channels.get(channelId)!.clip!.id;
    clock += 1_000;
    paste(app, channelId, bob.account.id, 'second');
    const second = app.channels.get(channelId)!.clip!;
    expect(second.id).not.toBe(first);
    expect(second.authorId).toBe(bob.account.id);
  });

  it('refuses a payload that is not a string', async () => {
    app = boot();
    const { alice, channelId } = await pair(app);
    const result = paste(app, channelId, alice.account.id, { text: 'nope' });
    expect(result).toMatchObject({ ok: false, error: 'Not an action.' });
    expect(app.channels.get(channelId)!.clip).toBeNull();
  });

  it('refuses somebody who is not in the channel', async () => {
    app = boot();
    const { channelId } = await pair(app);
    const carol = await signIn(app, 'carol@example.com', 'Carol');
    const result = paste(app, channelId, carol.account.id, 'hello');
    expect(result).toMatchObject({ ok: false, code: 'forbidden' });
  });

  it('leaves the clipboard alone when the reducer refuses', async () => {
    // Over-cap text is a no-op in the reducer, and `dispatch` reports the
    // no-op as success — there is nothing here that turns a silent refusal
    // into a loud one, deliberately, since the client refuses first.
    app = boot();
    const { alice, channelId } = await pair(app);
    paste(app, channelId, alice.account.id, 'keep me');
    paste(app, channelId, alice.account.id, 'x'.repeat(MAX_CLIP_LENGTH + 1));
    expect(app.channels.get(channelId)!.clip!.text).toBe('keep me');
  });

  it('is emptied by CLEAR_CLIP', async () => {
    app = boot();
    const { alice, bob, channelId } = await pair(app);
    paste(app, channelId, alice.account.id, 'something');
    app.channels.dispatch(channelId, bob.account.id, { type: 'CLEAR_CLIP' });
    expect(app.channels.get(channelId)!.clip).toBeNull();
  });
});

describe('a clipboard across a restart', () => {
  it('comes back holding what was pasted', async () => {
    const first = boot();
    const { alice, channelId } = await pair(first);
    paste(first, channelId, alice.account.id, 'https://example.com/keep-this');
    const before = first.channels.get(channelId)!.clip!;
    await shutdown(first);

    const second = boot();
    try {
      const after = second.channels.get(channelId)!.clip;
      // Whole, not merely present: the id is what a screen mid-render is
      // holding, and coming back with a new one would look like a paste
      // nobody made.
      expect(after).toEqual(before);
    } finally {
      await shutdown(second);
    }
  });

  it('comes back empty for a channel written before the field existed', async () => {
    // Which is every channel on the box at the moment of the deploy. The blob
    // has no version, so an absent field has to read as a sensible value
    // rather than as a crash.
    const first = boot();
    const { channelId } = await pair(first);
    await shutdown(first);

    const second = boot();
    try {
      expect(second.channels.get(channelId)!.clip).toBeNull();
    } finally {
      await shutdown(second);
    }
  });
});
