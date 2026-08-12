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
  // Everyone leaves but the last, who cannot: for them the same tap is
  // DELETE_CHANNEL, because it destroys the channel and its recordings.
  for (const id of members.slice(0, -1)) {
    app.channels.dispatch(channelId, id, { type: 'LEAVE_CHANNEL' });
  }
  const last = members[members.length - 1];
  if (last) app.channels.dispatch(channelId, last, { type: 'DELETE_CHANNEL' });
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
    // Every object a run writes is prefixed with the run, because the
    // per-identity index restarts at 001 each time. Read while the run is in
    // progress: `runId` is null the moment it ends.
    const run = app.channels.get(channelId)!.recording.runId!;

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
      .prepare('SELECT stems, participants FROM recordings WHERE id = ?')
      .get(run) as { stems: string; participants: string };
    const stems = JSON.parse(row.stems) as Record<
      string,
      Array<{ key: string; startMs: number }>
    >;
    expect(stems[alice.account.id][0].startMs).toBe(0);
    // Carol's capture begins 20s into the recorded audio.
    expect(stems[carol.account.id]).toEqual([
      {
        key: `${channelId}/${run}/${carol.account.id}-001.ogg`,
        startMs: 20_000,
      },
    ]);
    expect(JSON.parse(row.participants)).toEqual([
      alice.account.id,
      bob.account.id,
      carol.account.id,
    ]);
  });

  it('belongs to whoever took part, not to whoever was merely invited', async () => {
    // The recording is the conversation, so it is the conversation's. Carol is
    // invited during the run and never comes: no stem, and no claim on it.
    const { alice, bob, carol, channelId } = await pairRecording();
    // `as never` as everywhere else INVITE is dispatched here: the wire form
    // names a contact, and `dispatch`'s parameter is the reducer's action type,
    // which knows only about invitees.
    app.channels.dispatch(channelId, alice.account.id, {
      type: 'INVITE',
      contactId: carol.account.id,
    } as never);
    clock += 10_000;
    endChannel(channelId);
    await settle();

    const row = app.db
      .prepare('SELECT participants FROM recordings WHERE channel_id = ?')
      .get(channelId) as { participants: string };
    const audience = JSON.parse(row.participants) as string[];
    expect(audience.sort()).toEqual([alice.account.id, bob.account.id].sort());
    expect(audience).not.toContain(carol.account.id);
  });

  it('records who took part, even as the roster empties under it', async () => {
    // The row's audience is who was in the *run*, and it is written from the
    // run rather than from the roster — which is the case that broke, since at
    // the moment the last member goes the roster is empty and filing against
    // it wrote a recording naming nobody. It is a record of the conversation;
    // who may open it is a separate question, answered by channel membership.
    const { alice, bob, channelId } = await pairRecording();
    clock += 10_000;
    app.channels.dispatch(channelId, bob.account.id, { type: 'LEAVE_CHANNEL' });
    app.channels.dispatch(channelId, alice.account.id, { type: 'DELETE_CHANNEL' });
    await settle();

    expect(app.channels.get(channelId)!.status).toBe('ended');
    const row = app.db
      .prepare('SELECT participants FROM recordings WHERE channel_id = ?')
      .get(channelId) as { participants: string };
    expect((JSON.parse(row.participants) as string[]).sort()).toEqual(
      [alice.account.id, bob.account.id].sort()
    );

    // And neither of them can reach it any more, the channel it belonged to
    // having been deleted. The row survives its week for the sweep, not for
    // them: deleting a channel is what deleting its recordings means.
    expect(row).toBeDefined();
    for (const user of [alice, bob]) {
      expect(app.channels.recordingsFor(user.account.id)).toEqual([]);
    }
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

describe('presence is exclusive', () => {
  /** Alice, in two channels of her own, with bob and carol respectively. */
  async function twoChannels() {
    const { alice, bob, carol } = await circle();
    const first = (await createSessionWith(alice, [bob.account.id]).then((r) =>
      r.json()
    )) as { channelId: string };
    const second = (await createSessionWith(alice, [carol.account.id]).then(
      (r) => r.json()
    )) as { channelId: string };
    return { alice, bob, carol, first: first.channelId, second: second.channelId };
  }

  it('steps you out of the first channel when you enter a second', async () => {
    // A person has one microphone and one pair of ears. Being present in two
    // channels is not a state that can be honoured, and it used to be
    // reachable simply by going Home and tapping another channel.
    const { alice, first, second } = await twoChannels();
    expect(app.channels.get(first)!.present).toContain(alice.account.id);

    app.channels.dispatch(second, alice.account.id, { type: 'ENTER' });

    expect(app.channels.get(first)!.present).not.toContain(alice.account.id);
    expect(app.channels.get(second)!.present).toContain(alice.account.id);
    expect(app.channels.channelsFor(alice.account.id)).toEqual([second]);
  });

  it('lists a channel you are present in, so none is ever invisible', async () => {
    // Membership is the whole test. Presence used to hide a channel from your
    // own home screen on the reasoning that you were looking at it already,
    // which fails the moment the server believes you are somewhere the app
    // does not: reinstalling was enough, and the channel appeared nowhere —
    // not here, and not in invitesFor, which passes over anyone ever present.
    const { alice, first } = await twoChannels();
    expect(app.channels.get(first)!.present).toContain(alice.account.id);

    const listed = app.channels
      .rejoinableFor(alice.account.id)
      .map((entry) => entry.channelId);
    expect(listed).toContain(first);
  });

  it('leaves the first channel reachable rather than stranding it', async () => {
    // The reason the old behaviour was worse than leaving: a channel you are
    // present in is filtered out of your own home screen, so being wrongly
    // marked present in it made it invisible and unreachable at once.
    const { alice, first, second } = await twoChannels();
    app.channels.dispatch(second, alice.account.id, { type: 'ENTER' });

    const reachable = app.channels
      .rejoinableFor(alice.account.id)
      .map((entry) => entry.channelId);
    expect(reachable).toContain(first);
  });

  it('keeps you a member of the channel it steps you out of', async () => {
    // Stepped out, not gone: the distinction the two departures exist for.
    const { alice, first, second } = await twoChannels();
    app.channels.dispatch(second, alice.account.id, { type: 'ENTER' });

    const channel = app.channels.get(first)!;
    expect(channel.participants).toContain(alice.account.id);
    expect(channel.everPresent).toContain(alice.account.id);
    expect(channel.status).toBe('active');
  });

  it('releases a floor claim held in the channel being left', async () => {
    const { alice, bob, first, second } = await twoChannels();
    app.channels.dispatch(first, bob.account.id, { type: 'ENTER' });
    app.channels.dispatch(first, alice.account.id, { type: 'CLAIM_FLOOR' });
    expect(app.channels.get(first)!.floor.holder).toBe(alice.account.id);

    app.channels.dispatch(second, alice.account.id, { type: 'ENTER' });
    expect(app.channels.get(first)!.floor.holder).toBeNull();
  });

  it('stops a recording the departure leaves with nobody in it', async () => {
    // Stepping out empties the channel, and an empty channel stops recording —
    // the same rule, reached by a new route.
    const { alice, first, second } = await twoChannels();
    app.channels.dispatch(first, alice.account.id, { type: 'START_RECORDING' });
    await settle();
    expect(app.channels.get(first)!.recording.status).toBe('recording');

    clock += 5_000;
    app.channels.dispatch(second, alice.account.id, { type: 'ENTER' });
    await settle();

    expect(app.channels.get(first)!.present).toEqual([]);
    expect(app.channels.get(first)!.recording.status).toBe('idle');
    expect(app.channels.get(first)!.lastRecording?.durationMs).toBe(5_000);
  });

  it('re-entering the channel you are already in changes nothing', async () => {
    const { alice, first } = await twoChannels();
    app.channels.dispatch(first, alice.account.id, { type: 'ENTER' });
    expect(app.channels.channelsFor(alice.account.id)).toEqual([first]);
  });
});

describe('a channel everybody else has left', () => {
  it('is still listed for whoever remains', async () => {
    // It used to be dropped from the only list it appeared in, on the
    // reasoning that a channel with nobody else in it is not worth offering.
    // That was survivable when channels expired. Now it leaves a live,
    // permanent channel that its last member cannot reach — with their name
    // for it, their description, and their recordings hanging off it.
    const { alice, bob } = await circle();
    const { channelId } = (await createSessionWith(alice, [bob.account.id]).then(
      (r) => r.json()
    )) as { channelId: string };
    app.channels.dispatch(channelId, bob.account.id, { type: 'ENTER' });
    app.channels.dispatch(channelId, alice.account.id, { type: 'STEP_OUT' });
    app.channels.dispatch(channelId, bob.account.id, { type: 'LEAVE_CHANNEL' });

    const channel = app.channels.get(channelId)!;
    expect(channel.participants).toEqual([alice.account.id]);
    expect(channel.status).toBe('active');

    const listed = app.channels
      .rejoinableFor(alice.account.id)
      .find((entry) => entry.channelId === channelId);
    expect(listed).toBeDefined();
    // Nobody else to name it by, which the client renders as "Just you".
    expect(listed!.others).toEqual([]);
  });

  it('still ends when that last member deletes it', async () => {
    const { alice, bob } = await circle();
    const { channelId } = (await createSessionWith(alice, [bob.account.id]).then(
      (r) => r.json()
    )) as { channelId: string };
    app.channels.dispatch(channelId, bob.account.id, { type: 'LEAVE_CHANNEL' });
    app.channels.dispatch(channelId, alice.account.id, { type: 'DELETE_CHANNEL' });

    expect(app.channels.get(channelId)!.status).toBe('ended');
    expect(app.channels.rejoinableFor(alice.account.id)).toEqual([]);
  });
});
