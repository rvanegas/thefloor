import { buildApp, type App } from '../src/app';
import { buildFilterGraph } from '../src/export';
import { MemoryMailer } from '../src/mail';
import { MemoryMediaServer } from '../src/media';

/**
 * Channels holding more than two people: creation with several invitees,
 * mid-channel invites, the N-way silencing matrix, and stems for people who
 * join a recording partway through.
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

/**
 * The only way a channel ends now: every member gives up membership. Tests
 * that used to dispatch END are asserting what happens at the end of a
 * channel's life, and this is how a channel's life ends.
 */
function endChannel(channelId: string): void {
  const members = [...(app.channels.get(channelId)?.participants ?? [])];
  for (const id of members) {
    app.channels.dispatch(channelId, id, { type: 'LEAVE_CHANNEL' });
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

/** Alice knows everyone; bob, carol and dave only know alice. */
async function circle() {
  const alice = await signIn('alice@example.com', 'Alice');
  const bob = await signIn('bob@example.com', 'Bob');
  const carol = await signIn('carol@example.com', 'Carol');
  const dave = await signIn('dave@example.com', 'Dave');
  await befriend(alice, bob, 'bob@example.com');
  await befriend(alice, carol, 'carol@example.com');
  await befriend(alice, dave, 'dave@example.com');
  return { alice, bob, carol, dave };
}

async function createSessionWith(initiator: User, contactIds: string[]) {
  const created = await app.fastify.inject({
    method: 'POST',
    url: '/channels',
    headers: auth(initiator.token),
    payload: { contactIds },
  });
  return created;
}

/** Media calls are fire-and-forget, so let the microtask queue drain. */
const settle = () => new Promise((r) => setTimeout(r, 0));

describe('creating a channel with several people', () => {
  it('creates one channel whose roster is everyone named', async () => {
    const { alice, bob, carol } = await circle();
    const response = await createSessionWith(alice, [
      bob.account.id,
      carol.account.id,
    ]);
    expect(response.statusCode).toBe(200);
    const { channelId } = response.json() as { channelId: string };
    const channel = app.channels.get(channelId)!;
    expect(channel.participants).toEqual([
      alice.account.id,
      bob.account.id,
      carol.account.id,
    ]);
    // Both invitees see an invitation from the initiator.
    for (const user of [bob, carol]) {
      const invites = app.channels.invitesFor(user.account.id);
      expect(invites).toHaveLength(1);
      expect(invites[0].from.id).toBe(alice.account.id);
    }
  });

  it('still accepts the singular body an old build sends', async () => {
    const { alice, bob } = await circle();
    const response = await app.fastify.inject({
      method: 'POST',
      url: '/channels',
      headers: auth(alice.token),
      payload: { contactId: bob.account.id },
    });
    expect(response.statusCode).toBe(200);
  });

  it('refuses a non-contact invitee, the cap, and an empty roster', async () => {
    const { alice, bob, carol } = await circle();
    // Bob and carol are not contacts, so bob cannot bring carol.
    const nonContact = await createSessionWith(bob, [carol.account.id]);
    expect(nonContact.statusCode).toBe(400);
    expect((nonContact.json() as { error: string }).error).toBe('Not a contact.');

    const overCap = await createSessionWith(alice, [
      'u1', 'u2', 'u3', 'u4', 'u5', 'u6',
    ]);
    expect(overCap.statusCode).toBe(400);
    expect((overCap.json() as { error: string }).error).toContain('up to 6');

    const empty = await createSessionWith(alice, []);
    expect(empty.statusCode).toBe(400);
  });

  it('rejoins the existing channel for the same set, not for a subset', async () => {
    const { alice, bob, carol } = await circle();
    const trio = (await createSessionWith(alice, [
      bob.account.id,
      carol.account.id,
    ]).then((r) => r.json())) as { channelId: string };
    const trioAgain = (await createSessionWith(alice, [
      carol.account.id,
      bob.account.id,
    ]).then((r) => r.json())) as { channelId: string };
    expect(trioAgain.channelId).toBe(trio.channelId);

    // The same people minus one is a different conversation.
    const pair = (await createSessionWith(alice, [bob.account.id]).then((r) =>
      r.json()
    )) as { channelId: string };
    expect(pair.channelId).not.toBe(trio.channelId);
  });
});

describe('mid-channel invites', () => {
  it('adds a contact of the inviter, who then joins like any invitee', async () => {
    const { alice, bob, carol } = await circle();
    const { channelId } = (await createSessionWith(alice, [bob.account.id]).then(
      (r) => r.json()
    )) as { channelId: string };
    app.channels.dispatch(channelId, bob.account.id, { type: 'ENTER' });

    const result = app.channels.dispatch(channelId, alice.account.id, {
      type: 'INVITE',
      contactId: carol.account.id,
    } as never);
    expect(result.ok).toBe(true);

    const channel = app.channels.get(channelId)!;
    expect(channel.participants).toContain(carol.account.id);
    // The invitation names whoever asked.
    const invites = app.channels.invitesFor(carol.account.id);
    expect(invites).toHaveLength(1);
    expect(invites[0].from.id).toBe(alice.account.id);

    // The invited person may enter and may fetch a media token.
    const entered = app.channels.dispatch(channelId, carol.account.id, {
      type: 'ENTER',
    });
    expect(entered.ok).toBe(true);
    const token = await app.fastify.inject({
      method: 'POST',
      url: `/channels/${channelId}/media-token`,
      headers: auth(carol.token),
    });
    expect(token.statusCode).toBe(200);
  });

  it('refuses an invitee who is not the inviter’s contact', async () => {
    const { alice, bob, carol } = await circle();
    const { channelId } = (await createSessionWith(alice, [bob.account.id]).then(
      (r) => r.json()
    )) as { channelId: string };
    app.channels.dispatch(channelId, bob.account.id, { type: 'ENTER' });

    // Carol is alice's contact, not bob's — bob cannot bring her in.
    const result = app.channels.dispatch(channelId, bob.account.id, {
      type: 'INVITE',
      contactId: carol.account.id,
    } as never);
    expect(result).toEqual({
      ok: false,
      error: 'Not a contact.',
      code: 'forbidden',
    });
  });

  it('refuses a duplicate and enforces the cap', async () => {
    const { alice, bob, carol } = await circle();
    const { channelId } = (await createSessionWith(alice, [bob.account.id]).then(
      (r) => r.json()
    )) as { channelId: string };

    const dup = app.channels.dispatch(channelId, alice.account.id, {
      type: 'INVITE',
      contactId: bob.account.id,
    } as never);
    expect(dup).toEqual({
      ok: false,
      error: 'Already in this channel.',
      code: 'conflict',
    });

    // Fill the roster to six, then one more must be refused. The extras only
    // need to exist as contacts of alice.
    const extras = [] as User[];
    for (let i = 0; i < 5; i++) {
      const extra = await signIn(`extra${i}@example.com`, `Extra ${i}`);
      await befriend(alice, extra, `extra${i}@example.com`);
      extras.push(extra);
    }
    for (const extra of extras.slice(0, 4)) {
      const added = app.channels.dispatch(channelId, alice.account.id, {
        type: 'INVITE',
        contactId: extra.account.id,
      } as never);
      expect(added.ok).toBe(true);
    }
    expect(app.channels.get(channelId)!.participants).toHaveLength(6);
    const overCap = app.channels.dispatch(channelId, alice.account.id, {
      type: 'INVITE',
      contactId: extras[4].account.id,
    } as never);
    expect(overCap).toEqual({
      ok: false,
      error: 'Channels hold up to 6 people.',
      code: 'conflict',
    });
    void carol;
  });
});

describe('the silencing matrix with three people', () => {
  async function trioAllPresent() {
    const { alice, bob, carol } = await circle();
    const { channelId } = (await createSessionWith(alice, [
      bob.account.id,
      carol.account.id,
    ]).then((r) => r.json())) as { channelId: string };
    app.channels.dispatch(channelId, bob.account.id, { type: 'ENTER' });
    app.channels.dispatch(channelId, carol.account.id, { type: 'ENTER' });
    return { alice, bob, carol, channelId };
  }

  it('withholds every non-holder from every listener on a claim', async () => {
    const { alice, bob, carol, channelId } = await trioAllPresent();
    media.subscriptions.length = 0;

    app.channels.dispatch(channelId, alice.account.id, { type: 'CLAIM_FLOOR' });
    await settle();

    const ids = [alice.account.id, bob.account.id, carol.account.id];
    // The whole truth: every ordered pair is stated, 6 statements for 3 people.
    expect(media.subscriptions).toHaveLength(6);
    for (const listener of ids) {
      for (const speaker of ids) {
        if (speaker === listener) continue;
        expect(media.subscriptions).toContainEqual({
          room: channelId,
          speaker,
          listener,
          silenced: speaker !== alice.account.id,
        });
      }
    }
    // In particular the two silenced people cannot hear each other.
    expect(media.subscriptions).toContainEqual({
      room: channelId,
      speaker: bob.account.id,
      listener: carol.account.id,
      silenced: true,
    });
  });

  it('opens everyone when the claim is released', async () => {
    const { alice, channelId } = await trioAllPresent();
    app.channels.dispatch(channelId, alice.account.id, { type: 'CLAIM_FLOOR' });
    await settle();
    media.subscriptions.length = 0;

    app.channels.dispatch(channelId, alice.account.id, { type: 'RELEASE_FLOOR' });
    await settle();
    expect(media.subscriptions).toHaveLength(6);
    expect(media.subscriptions.every((s) => !s.silenced)).toBe(true);
  });

  it('silences a mid-claim joiner once their track exists', async () => {
    const { alice, bob, carol, channelId } = await trioAllPresent();
    void bob;
    app.channels.dispatch(channelId, carol.account.id, { type: 'STEP_OUT' });
    app.channels.dispatch(channelId, alice.account.id, { type: 'CLAIM_FLOOR' });
    await settle();

    // Carol re-enters during the claim, before publishing anything: the
    // silence cannot land yet, and must not be forgotten.
    media.unpublished.add(`${channelId}/${carol.account.id}`);
    media.subscriptions.length = 0;
    app.channels.dispatch(channelId, carol.account.id, { type: 'ENTER' });
    await settle();
    expect(
      media.subscriptions.filter((s) => s.speaker === carol.account.id)
    ).toHaveLength(0);

    // She publishes; the next tick re-states her silencing.
    media.unpublished.clear();
    clock += 500;
    app.channels.tick();
    await settle();
    expect(media.subscriptions).toContainEqual({
      room: channelId,
      speaker: carol.account.id,
      listener: alice.account.id,
      silenced: true,
    });
    expect(media.subscriptions).toContainEqual({
      room: channelId,
      speaker: carol.account.id,
      listener: bob.account.id,
      silenced: true,
    });
  });
});

describe('recording with people joining mid-run', () => {
  async function pairRecording() {
    const { alice, bob, carol } = await circle();
    const { channelId } = (await createSessionWith(alice, [bob.account.id]).then(
      (r) => r.json()
    )) as { channelId: string };
    app.channels.dispatch(channelId, bob.account.id, { type: 'ENTER' });
    app.channels.dispatch(channelId, alice.account.id, {
      type: 'START_RECORDING',
    });
    await settle();
    return { alice, bob, carol, channelId };
  }

  it('starts egress only for the present, then adds a joiner’s stem at its offset', async () => {
    const { alice, bob, carol, channelId } = await pairRecording();
    expect(media.recordings.map((r) => r.identity).sort()).toEqual(
      [alice.account.id, bob.account.id].sort()
    );

    clock += 20_000;
    app.channels.dispatch(channelId, alice.account.id, {
      type: 'INVITE',
      contactId: carol.account.id,
    } as never);
    app.channels.dispatch(channelId, carol.account.id, { type: 'ENTER' });
    await settle();

    const hers = media.recordings.filter(
      (r) => r.identity === carol.account.id
    );
    expect(hers).toHaveLength(1);

    clock += 10_000;
    endChannel(channelId);
    await settle();

    const row = app.db
      .prepare('SELECT stems, participants FROM recordings WHERE channel_id = ?')
      .get(channelId) as { stems: string; participants: string };
    const stems = JSON.parse(row.stems) as Record<
      string,
      Array<{ key: string; startMs: number }>
    >;
    expect(stems[alice.account.id][0].startMs).toBe(0);
    // Carol's capture begins 20s into the recorded audio.
    expect(stems[carol.account.id]).toEqual([
      {
        key: `${channelId}/${carol.account.id}-001.ogg`,
        startMs: 20_000,
      },
    ]);
    expect(JSON.parse(row.participants)).toEqual([
      alice.account.id,
      bob.account.id,
      carol.account.id,
    ]);
  });

  it('does not end the recording when a late joiner’s egress cannot start', async () => {
    const { alice, carol, channelId } = await pairRecording();
    app.channels.dispatch(channelId, alice.account.id, {
      type: 'INVITE',
      contactId: carol.account.id,
    } as never);

    // Her egress fails — she has not published yet.
    media.failStart = { reason: 'not publishing', identity: carol.account.id };
    app.channels.dispatch(channelId, carol.account.id, { type: 'ENTER' });
    await settle();
    expect(app.channels.get(channelId)!.recording.status).toBe('recording');
    expect(app.channels.get(channelId)!.recording.failure).toBeNull();

    // Once she publishes, a later tick starts her stem.
    media.failStart = null;
    clock += 6_000;
    app.channels.tick();
    await settle();
    expect(
      media.recordings.filter((r) => r.identity === carol.account.id)
    ).toHaveLength(1);
  });

  it('records a silenced window per non-holder in the floor timeline', async () => {
    const { alice, bob, carol, channelId } = await pairRecording();
    app.channels.dispatch(channelId, alice.account.id, {
      type: 'INVITE',
      contactId: carol.account.id,
    } as never);
    app.channels.dispatch(channelId, carol.account.id, { type: 'ENTER' });
    await settle();

    clock += 5_000;
    app.channels.dispatch(channelId, alice.account.id, { type: 'CLAIM_FLOOR' });
    clock += 10_000;
    app.channels.dispatch(channelId, alice.account.id, { type: 'RELEASE_FLOOR' });
    clock += 5_000;
    endChannel(channelId);
    await settle();

    const row = app.db
      .prepare('SELECT floor_timeline FROM recordings WHERE channel_id = ?')
      .get(channelId) as { floor_timeline: string };
    const windows = JSON.parse(row.floor_timeline) as Array<{
      identity: string;
      fromMs: number;
      toMs: number;
    }>;
    // One window each for the two people who did not hold the floor.
    expect(windows).toContainEqual({
      identity: bob.account.id,
      fromMs: 5_000,
      toMs: 15_000,
    });
    expect(windows).toContainEqual({
      identity: carol.account.id,
      fromMs: 5_000,
      toMs: 15_000,
    });
    expect(windows.filter((w) => w.identity === alice.account.id)).toEqual([]);
  });
});

describe('the export graph with offset segments', () => {
  it('delays a late joiner’s stem to where it happened', () => {
    const graph = buildFilterGraph(
      {
        stems: {
          a: [{ key: 'a-001', startMs: 0 }],
          c: [{ key: 'c-001', startMs: 20_000 }],
        },
        timeline: [],
      },
      new Map([
        ['a-001', 0],
        ['c-001', 1],
      ])
    );
    expect(graph!.filter).toContain('adelay=0:all=1');
    expect(graph!.filter).toContain('adelay=20000:all=1');
  });

  it('mixes one identity’s non-adjacent segments instead of concatenating', () => {
    const graph = buildFilterGraph(
      {
        stems: {
          a: [
            { key: 'a-001', startMs: 0 },
            { key: 'a-002', startMs: 30_000 },
          ],
        },
        timeline: [],
      },
      new Map([
        ['a-001', 0],
        ['a-002', 1],
      ])
    );
    expect(graph!.filter).toContain('adelay=30000:all=1');
    expect(graph!.filter).toContain('amix=inputs=2:normalize=0');
    expect(graph!.filter).not.toContain('concat');
  });

  it('still concatenates a legacy recording’s plain key lists', () => {
    const graph = buildFilterGraph(
      {
        stems: { a: ['a-001', 'a-002'] },
        timeline: [],
      },
      new Map([
        ['a-001', 0],
        ['a-002', 1],
      ])
    );
    expect(graph!.filter).toContain('concat=n=2');
    expect(graph!.filter).not.toContain('adelay');
  });
});
