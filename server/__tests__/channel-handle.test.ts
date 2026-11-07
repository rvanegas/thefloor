import { buildApp, type App } from '../src/app';
import { mintHandle } from '../src/channels';
import { MemoryMailer } from '../src/mail';

/**
 * A channel's *handle*: what names it to noesis, minted only when asked for.
 *
 * - None until something asks, and the same one every time after.
 * - A slug of the name and a suffix, which is a noesis library name; an
 *   unnamed channel is `channel-…`.
 * - Two channels of one name have two handles.
 * - A rename leaves it alone.
 */

let app: App;
const clock = 1_700_000_000_000;

beforeEach(() => {
  app = buildApp({ dbPath: ':memory:', mailer: new MemoryMailer(), now: () => clock });
});

afterEach(async () => {
  app.channels.stop();
  await app.fastify.close();
});

async function signIn(identifier: string, displayName: string) {
  const code = app.accounts.issueCode(identifier, clock)!;
  const verified = await app.fastify.inject({
    method: 'POST',
    url: '/auth/verify',
    payload: { identifier, code, displayName },
  });
  return verified.json() as { token: string; account: { id: string } };
}

async function channel(name: string | null) {
  const erta = await signIn('erta@example.com', 'Erta Example');
  const created = await app.fastify.inject({
    method: 'POST',
    url: '/channels',
    headers: { authorization: `Bearer ${erta.token}` },
    payload: { contactIds: [] },
  });
  const channelId = (created.json() as { channelId: string }).channelId;
  if (name !== null) rename(channelId, erta.account.id, name);
  return { channelId, ertaId: erta.account.id };
}

function rename(channelId: string, userId: string, name: string) {
  const renamed = app.channels.dispatch(channelId, userId, { type: 'SET_NAME', name } as never);
  expect(renamed.ok).toBe(true);
}

// The rule noesis holds a library's name to (`noesis/service.py`, NAME_RE).
const NOESIS_NAME = /^[a-z0-9][a-z0-9_-]*$/;

describe('a channel handle', () => {
  it('is minted on first asking and the same ever after', async () => {
    const { channelId } = await channel('Book Club');
    expect(app.channels.handleOf(channelId)).toBeNull();
    const handle = app.channels.handleFor(channelId)!;
    expect(handle).toMatch(/^book-club-[a-z2-9]{4}$/);
    expect(app.channels.handleFor(channelId)).toBe(handle);
    expect(app.channels.handleOf(channelId)).toBe(handle);
  });

  it('is channel-… for an unnamed channel, and null for none', async () => {
    const { channelId } = await channel(null);
    expect(app.channels.handleFor(channelId)).toMatch(/^channel-[a-z2-9]{4}$/);
    expect(app.channels.handleFor('chan_nothing')).toBeNull();
  });

  it('is a noesis library name, whatever the channel is called', () => {
    for (const name of ['Café Olé', '¡¡!!', '  Book   Club  ', 'x'.repeat(80), '日本語']) {
      expect(mintHandle(name)).toMatch(NOESIS_NAME);
    }
  });

  it('differs between two channels of one name', async () => {
    const one = await channel('Book Club');
    const two = await channel('Book Club');
    expect(app.channels.handleFor(one.channelId)).not.toBe(app.channels.handleFor(two.channelId));
  });

  it('is refused to a second channel by the database', async () => {
    const one = await channel('Book Club');
    const two = await channel('Book Club');
    const handle = app.channels.handleFor(one.channelId);
    expect(() =>
      app.db.prepare('UPDATE channels SET handle = ? WHERE id = ?').run(handle, two.channelId)
    ).toThrow(/UNIQUE/);
  });

  it('survives a rename', async () => {
    const { channelId, ertaId } = await channel('Book Club');
    const handle = app.channels.handleFor(channelId);
    rename(channelId, ertaId, 'Reading Group');
    expect(app.channels.handleFor(channelId)).toBe(handle);
  });
});
