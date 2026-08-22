import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DELETED_RETENTION_MS, MAX_DISPLAY_NAME_LENGTH } from '../../core/constants';
import { buildApp, type App } from '../src/app';
import { GUEST_SESSION_TTL_MS } from '../src/guests';
import { MemoryMailer } from '../src/mail';

/**
 * The two tables a person with no account leaves behind.
 *
 * Storage only: nothing here admits anybody to a room, because nothing above
 * this layer exists yet — the reducer has not been taught what a guest is and
 * there is no page to open a link with. What is being pinned down is the part
 * that would be expensive to change afterwards, which is the lifetime of a
 * link and of a seat.
 *
 * Built against a file rather than `:memory:` so that a restart can be a real
 * one: two `buildApp` calls over the same database, as persistence.test.ts
 * does. Two of the rules below are only about what a restart must *not* do.
 */

let dir: string;
let clock = 1_700_000_000_000;

beforeEach(() => {
  clock = 1_700_000_000_000;
  dir = mkdtempSync(join(tmpdir(), 'thefloor-guests-'));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

function boot(): App {
  return buildApp({
    dbPath: join(dir, 'thefloor.db'),
    mailer: new MemoryMailer(),
    now: () => clock,
    roomCloseGraceMs: 0,
  });
}

async function shutdown(app: App): Promise<void> {
  app.channels.stop();
  await app.fastify.close();
}

const auth = (token: string) => ({ authorization: `Bearer ${token}` });

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

/** Alice and Bob as contacts, with a channel between them. */
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
  return { alice, bob, channelId: created.channel.id };
}

/** Everyone present walks out, which is what a link's lifetime turns on. */
function emptyIt(app: App, channelId: string): void {
  for (const id of [...app.channels.get(channelId)!.present]) {
    app.channels.dispatch(channelId, id, { type: 'STEP_OUT' });
  }
}

describe('a link', () => {
  it('opens until somebody revokes it, and says who did', async () => {
    const app = boot();
    const { alice, channelId } = await pair(app);
    const link = app.channels.guests.mintLink(channelId, alice.account.id, clock);

    expect(app.channels.guests.liveLink(link.token)).toBeDefined();

    clock += 60_000;
    expect(
      app.channels.guests.revokeLink(link.token, alice.account.id, clock)
    ).toBe(true);
    expect(app.channels.guests.liveLink(link.token)).toBeUndefined();

    // The row stays, so channel settings can say a link existed and stopped
    // working rather than silently having one fewer than somebody remembers.
    const [row] = app.channels.guests.linksFor(channelId);
    expect(row.revoked_at).toBe(clock);
    expect(row.revoked_by).toBe(alice.account.id);

    // Idempotent, and the second revocation does not rewrite the first one's
    // timestamp — two members tapping it is not an event worth recording twice.
    clock += 60_000;
    expect(
      app.channels.guests.revokeLink(link.token, alice.account.id, clock)
    ).toBe(false);
    expect(app.channels.guests.linksFor(channelId)[0].revoked_at).toBe(
      row.revoked_at
    );
    await shutdown(app);
  });

  it('stops working when the channel empties of present members', async () => {
    const app = boot();
    const { alice, bob, channelId } = await pair(app);
    app.channels.dispatch(channelId, bob.account.id, { type: 'ENTER' });
    const link = app.channels.guests.mintLink(channelId, alice.account.id, clock);

    emptyIt(app, channelId);

    expect(app.channels.guests.liveLink(link.token)).toBeUndefined();
    // Nobody revoked it — the rule did. Attributing it to whoever happened to
    // leave last would read, in settings, as that person having closed the door
    // on purpose.
    expect(app.channels.guests.linksFor(channelId)[0].revoked_by).toBeNull();
    await shutdown(app);
  });

  it('survives a restart, which empties presence without emptying the channel', async () => {
    // The rule this file exists to protect. Presence does not outlive the
    // process, so a boot that asked "is anybody present" as a question would
    // find every channel empty and revoke every outstanding link at every
    // deploy. Nobody chose to leave.
    const first = boot();
    const { alice, bob, channelId } = await pair(first);
    first.channels.dispatch(channelId, bob.account.id, { type: 'ENTER' });
    const link = first.channels.guests.mintLink(
      channelId,
      alice.account.id,
      clock
    );
    await shutdown(first);

    const second = boot();
    expect(second.channels.get(channelId)!.present).toEqual([]);
    expect(second.channels.guests.liveLink(link.token)).toBeDefined();
    await shutdown(second);
  });

  it('stops working the moment the channel is deleted, not a week later', async () => {
    const app = boot();
    const { alice, bob, channelId } = await pair(app);
    const link = app.channels.guests.mintLink(channelId, alice.account.id, clock);

    app.channels.dispatch(channelId, bob.account.id, { type: 'LEAVE_CHANNEL' });
    app.channels.dispatch(channelId, alice.account.id, {
      type: 'DELETE_CHANNEL',
    });

    expect(app.channels.guests.liveLink(link.token)).toBeUndefined();
    await shutdown(app);
  });
});

describe('a seat', () => {
  async function admitted(app: App) {
    const { alice, bob, channelId } = await pair(app);
    app.channels.dispatch(channelId, bob.account.id, { type: 'ENTER' });
    const link = app.channels.guests.mintLink(channelId, alice.account.id, clock);
    const guest = app.channels.guests.admit(
      channelId,
      link.token,
      'Dana',
      alice.account.id,
      clock
    );
    return { alice, bob, channelId, link, guest };
  }

  it('is written on admission, silent, and named', async () => {
    const app = boot();
    const { channelId, guest } = await admitted(app);

    expect(guest.session.id).toMatch(/^guest_/);
    expect(guest.session.display_name).toBe('Dana');
    expect(guest.session.may_speak).toBe(0);
    expect(app.channels.guests.liveIn(channelId, clock)).toHaveLength(1);
    await shutdown(app);
  });

  it('keeps the secret out of the database', async () => {
    const app = boot();
    const { guest } = await admitted(app);

    const rows = app.db
      .prepare('SELECT * FROM guest_sessions')
      .all() as unknown as Array<Record<string, unknown>>;
    expect(JSON.stringify(rows)).not.toContain(guest.secret);
    expect(app.channels.guests.reconnect(guest.session.id, guest.secret, clock))
      .toBeDefined();
    expect(
      app.channels.guests.reconnect(guest.session.id, 'not-it', clock)
    ).toBeUndefined();
    await shutdown(app);
  });

  it('outlives the link that produced it', async () => {
    // The whole reason a seat is a separate thing from a link. Revoking a link
    // stops new people knocking; if it also ended the seats of everyone already
    // inside, every reconnection would be one tidy-up away from failing.
    const app = boot();
    const { alice, link, guest } = await admitted(app);
    app.channels.guests.revokeLink(link.token, alice.account.id, clock);

    expect(
      app.channels.guests.reconnect(guest.session.id, guest.secret, clock)
    ).toBeDefined();
    await shutdown(app);
  });

  it('expires after a silence, and each reconnection pushes that out', async () => {
    const app = boot();
    const { guest } = await admitted(app);

    clock += GUEST_SESSION_TTL_MS - 1_000;
    const back = app.channels.guests.reconnect(
      guest.session.id,
      guest.secret,
      clock
    );
    expect(back).toBeDefined();
    expect(back!.expires_at).toBe(clock + GUEST_SESSION_TTL_MS);

    clock += GUEST_SESSION_TTL_MS + 1_000;
    expect(
      app.channels.guests.reconnect(guest.session.id, guest.secret, clock)
    ).toBeUndefined();
    // Unusable, and still there: a recording of this conversation may yet be
    // filed, and it needs the name.
    expect(app.channels.guests.displayName(guest.session.id)).toBe('Dana');
    await shutdown(app);
  });

  it('ends when the channel empties, without the row going', async () => {
    const app = boot();
    const { channelId, guest } = await admitted(app);

    emptyIt(app, channelId);

    expect(
      app.channels.guests.reconnect(guest.session.id, guest.secret, clock)
    ).toBeUndefined();
    expect(app.channels.guests.liveIn(channelId, clock)).toEqual([]);
    expect(app.channels.guests.byId(guest.session.id)).toBeDefined();
    await shutdown(app);
  });

  it('closes the door behind an ejected guest, and only that door', async () => {
    const app = boot();
    const { alice, channelId, link, guest } = await admitted(app);
    const other = app.channels.guests.admit(
      channelId,
      link.token,
      'Eve',
      alice.account.id,
      clock
    );

    expect(app.channels.guests.eject(guest.session.id, alice.account.id, clock))
      .toBe(true);

    // They cannot come back, and they cannot let themselves back in either —
    // an ejection that left the link open would remove somebody for as long as
    // it takes them to reload the page.
    expect(
      app.channels.guests.reconnect(guest.session.id, guest.secret, clock)
    ).toBeUndefined();
    expect(app.channels.guests.liveLink(link.token)).toBeUndefined();

    // Eve was let in individually, and throwing Dana out says nothing about
    // her.
    expect(
      app.channels.guests.reconnect(other.session.id, other.secret, clock)
    ).toBeDefined();
    await shutdown(app);
  });

  it('remembers a granted microphone across a restart', async () => {
    // LiveKit is its own process on the box, so restarting this one does not
    // take a publish grant back. A permission held in memory would come back
    // saying "silent" about somebody the room is still carrying.
    const first = boot();
    const { channelId, guest } = await admitted(first);
    expect(
      first.channels.guests.setMaySpeak(guest.session.id, true, clock)
    ).toBe(true);
    await shutdown(first);

    const second = boot();
    const [row] = second.channels.guests.liveIn(channelId, clock);
    expect(row.id).toBe(guest.session.id);
    expect(row.may_speak).toBe(1);
    await shutdown(second);
  });
});

describe('what a guest is called', () => {
  it('takes what they typed, trimmed and bounded like anybody else', async () => {
    const app = boot();
    const { alice, channelId } = await pair(app);
    const typed = 'D'.repeat(MAX_DISPLAY_NAME_LENGTH + 10);
    const guest = app.channels.guests.admit(
      channelId,
      null,
      `   ${typed}   `,
      alice.account.id,
      clock
    );
    expect(guest.session.display_name).toHaveLength(MAX_DISPLAY_NAME_LENGTH);
    await shutdown(app);
  });

  it('numbers the anonymous by the channel, and never twice', async () => {
    // The second reason a row outlives a disconnect. A guest who leaves and a
    // guest who is thrown out both stop being present, and neither should hand
    // their number to whoever arrives next: two people called Anon 2, one of
    // them in a recording, is a conversation nobody can read afterwards.
    const app = boot();
    const { alice, channelId } = await pair(app);
    const guests = app.channels.guests;

    const first = guests.admit(channelId, null, null, alice.account.id, clock);
    const second = guests.admit(channelId, null, '  ', alice.account.id, clock);
    expect(first.session.display_name).toBe('Anon 1');
    expect(second.session.display_name).toBe('Anon 2');

    guests.eject(second.session.id, alice.account.id, clock);
    const third = guests.admit(channelId, null, null, alice.account.id, clock);
    expect(third.session.display_name).toBe('Anon 3');
    await shutdown(app);
  });
});

describe('the sweep', () => {
  it('takes the guests with the channel, in the order the keys require', async () => {
    // The failure this ordering prevents is not a skipped channel: the DELETE
    // is guarded by a NOT EXISTS against recordings and by nothing else, so a
    // guest row left pointing at the channel throws — on a timer, an hour after
    // anybody did anything.
    const app = boot();
    const { alice, bob, channelId } = await pair(app);
    const link = app.channels.guests.mintLink(channelId, alice.account.id, clock);
    app.channels.guests.admit(
      channelId,
      link.token,
      'Dana',
      alice.account.id,
      clock
    );

    app.channels.dispatch(channelId, bob.account.id, { type: 'LEAVE_CHANNEL' });
    app.channels.dispatch(channelId, alice.account.id, {
      type: 'DELETE_CHANNEL',
    });

    clock += DELETED_RETENTION_MS + 1;
    expect(() => app.channels.sweepDeleted(clock)).not.toThrow();

    expect(
      app.db.prepare('SELECT count(*) AS n FROM channels').get()
    ).toEqual({ n: 0 });
    expect(
      app.db.prepare('SELECT count(*) AS n FROM guest_sessions').get()
    ).toEqual({ n: 0 });
    expect(
      app.db.prepare('SELECT count(*) AS n FROM guest_links').get()
    ).toEqual({ n: 0 });
    await shutdown(app);
  });
});
