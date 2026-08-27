import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { buildApp, type App } from '../src/app';
import { MemoryMailer } from '../src/mail';
import { MemoryMediaServer } from '../src/media';

/**
 * Channels outlive the process holding them.
 *
 * Everything here works the same way: build an app against a file on disk, do
 * things to it, close it, and build a second app against the same file. That
 * second `buildApp` is a server restart in every way that matters — it is the
 * `bin/deploy` that used to destroy every conversation on the box.
 *
 * Two properties are worth stating because they pull in opposite directions.
 * What is durable has to come back exactly: a channel's name, its description,
 * who belongs to it. What is *not* durable has to come back reset, because it
 * describes a process that is gone — the sockets, the floor, the egress
 * handles. A restart that revived a floor claim held by somebody who is no
 * longer connected would be worse than one that lost the channel.
 */

let dir: string;
let clock = 1_700_000_000_000;

beforeEach(() => {
  clock = 1_700_000_000_000;
  dir = mkdtempSync(join(tmpdir(), 'thefloor-persist-'));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

const dbPath = () => join(dir, 'thefloor.db');

function boot(media?: MemoryMediaServer): App {
  return buildApp({
    dbPath: dbPath(),
    mailer: new MemoryMailer(),
    media,
    mediaUrl: media ? 'wss://example.livekit.cloud' : undefined,
    now: () => clock,
    roomCloseGraceMs: 0,
  });
}

async function shutdown(app: App): Promise<void> {
  app.channels.stop();
  await app.fastify.close();
}

const auth = (token: string) => ({ authorization: `Bearer ${token}` });
/** Media calls are fire-and-forget, so let the microtask queue drain. */
const settle = () => new Promise((r) => setTimeout(r, 0));

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

describe('a channel across a restart', () => {
  it('comes back with everything durable, and everything volatile reset', async () => {
    const first = boot();
    const { alice, bob, channelId } = await pair(first);
    first.channels.dispatch(channelId, alice.account.id, {
      type: 'SET_NAME',
      name: 'Book club',
    } as never);
    first.channels.dispatch(channelId, alice.account.id, {
      type: 'SET_DESCRIPTION',
      description: 'Reading **Dune**',
    } as never);
    first.channels.dispatch(channelId, bob.account.id, { type: 'ENTER' });
    first.channels.dispatch(channelId, bob.account.id, {
      type: 'SET_SELF_MUTE',
      muted: true,
    } as never);
    first.channels.dispatch(channelId, alice.account.id, { type: 'CLAIM_FLOOR' });

    const before = first.channels.get(channelId)!;
    expect(before.present.sort()).toEqual(
      [alice.account.id, bob.account.id].sort()
    );
    expect(before.floor.holder).toBe(alice.account.id);
    await shutdown(first);

    const second = boot();
    const after = second.channels.get(channelId);
    expect(after).toBeDefined();

    // Durable: the channel is the same channel.
    expect(after!.status).toBe('active');
    expect(after!.name).toBe('Book club');
    expect(after!.description).toBe('Reading **Dune**');
    expect(after!.participants).toEqual([alice.account.id, bob.account.id]);
    expect(after!.invitedBy).toEqual({ [bob.account.id]: alice.account.id });
    expect(after!.everPresent.sort()).toEqual(
      [alice.account.id, bob.account.id].sort()
    );
    expect(after!.createdAt).toBe(before.createdAt);
    expect(after!.initiator).toBe(alice.account.id);

    // Volatile: nobody is present, because no socket survived. A floor claim
    // orders a live conversation and there is none to order.
    expect(after!.present).toEqual([]);
    expect(after!.disconnectedAt).toEqual({});
    expect(after!.floor.holder).toBeNull();
    expect(after!.floor.lastClaimedAt).toEqual({});
    expect(after!.recording.status).toBe('idle');
    expect(after!.recording.runId).toBeNull();
    expect(after!.playback.track).toBeNull();

    // Self-mute is volatile by decision rather than by necessity: restoring a
    // mute somebody set a week ago and forgot is a trap, so everyone comes
    // back audible.
    expect(after!.selfMuted).toEqual({
      [alice.account.id]: false,
      [bob.account.id]: false,
    });

    await shutdown(second);
  });

  /** What `durableOf` stores: the stamp, floored to the minute. */
  const asStored = (at: number) => Math.floor(at / 60_000) * 60_000;

  it('remembers when somebody stepped out, across a restart', async () => {
    // "Stepped out an hour ago" has to survive a deploy. When somebody was
    // last in a channel is a fact about the channel rather than about the
    // process serving it, which is what puts it in the durable projection
    // beside the name and the roster.
    //
    // At minute resolution, deliberately — the live value is exact and this
    // one is what a heartbeat would otherwise rewrite every five seconds. See
    // `durableOf`.
    const first = boot();
    const { alice, bob, channelId } = await pair(first);
    first.channels.dispatch(channelId, bob.account.id, { type: 'ENTER' });
    const left = (clock += 60_000);
    first.channels.dispatch(channelId, bob.account.id, { type: 'STEP_OUT' });
    expect(first.channels.get(channelId)!.lastPresentAt[bob.account.id]).toBe(
      left
    );
    await shutdown(first);

    const second = boot();
    expect(second.channels.get(channelId)!.lastPresentAt[bob.account.id]).toBe(
      asStored(left)
    );
    await shutdown(second);
  });

  it('reports what other people did at minute resolution, and never fresher', async () => {
    // `lastPresenceByOthers` is a fold over the same stamps, so it inherits
    // the flooring — and unlike `lastPresenceAt` it has no `lastActiveAt` term
    // to correct with, since that stamp is unattributed. What is asserted is
    // the bound rather than a value: never later than the truth, and never
    // more than the minute `quantise` rounds off.
    const first = boot();
    const { alice, bob, channelId } = await pair(first);
    first.channels.dispatch(channelId, bob.account.id, { type: 'ENTER' });
    const left = (clock += 90_000);
    first.channels.dispatch(channelId, bob.account.id, { type: 'STEP_OUT' });

    const before = first.channels
      .rejoinableFor(alice.account.id)
      .find((entry) => entry.channelId === channelId)!;
    expect(before.lastPresenceByOthers).toBe(left);
    await shutdown(first);

    const second = boot();
    const after = second.channels
      .rejoinableFor(alice.account.id)
      .find((entry) => entry.channelId === channelId)!;
    expect(after.lastPresenceByOthers).toBe(asStored(left));
    expect(after.lastPresenceByOthers).toBeLessThanOrEqual(left);
    expect(left - after.lastPresenceByOthers!).toBeLessThan(60_000);
    await shutdown(second);
  });

  it('carries the last evidence of somebody who was present at the restart', async () => {
    // The restart is not a departure and nothing pretends it is — but it is
    // the end of the evidence, and the honest report is when that evidence
    // stops. Before this, presence at a restart left whatever `stepOut` had
    // written, which for somebody who had stepped out earlier in the
    // channel's life was a departure days old: the screen reported a person
    // who had been talking a second earlier as having left on Monday. The
    // heartbeat is what overwrites it.
    const first = boot();
    const { bob, channelId } = await pair(first);
    first.channels.dispatch(channelId, bob.account.id, { type: 'ENTER' });
    const monday = (clock += 60_000);
    first.channels.dispatch(channelId, bob.account.id, { type: 'STEP_OUT' });
    expect(first.channels.get(channelId)!.lastPresentAt[bob.account.id]).toBe(
      monday
    );

    clock += 3 * 24 * 60 * 60 * 1_000;
    first.channels.dispatch(channelId, bob.account.id, { type: 'ENTER' });
    const heard = (clock += 5_000);
    first.channels.stillHere(channelId, bob.account.id);
    expect(first.channels.get(channelId)!.present).toContain(bob.account.id);
    await shutdown(first);

    const second = boot();
    const after = second.channels.get(channelId)!;
    expect(after.present).toEqual([]);
    expect(after.lastPresentAt[bob.account.id]).toBe(asStored(heard));
    await shutdown(second);
  });

  it('takes an entry as evidence, with or without a socket behind it', async () => {
    // Asserted the opposite until 2026-08-20. The intent behind that was that
    // a missing socket is not evidence of *leaving* — which is right, and is
    // not what this case is. Entering is something a person did, and `create`
    // dispatches ENTER from an HTTP request that has no socket at all.
    //
    // Discarding it left no stamp, so `idleMs` answered null and the roster
    // rendered a bare "Stepped out" with no time under it: a departure claimed
    // with nothing behind it, which is the near-fix the evidence model was
    // chosen over in the first place.
    const first = boot();
    const { bob, channelId } = await pair(first);
    const entered = (clock += 60_000);
    first.channels.dispatch(channelId, bob.account.id, { type: 'ENTER' });
    expect(first.channels.get(channelId)!.present).toContain(bob.account.id);
    await shutdown(first);

    const second = boot();
    const after = second.channels.get(channelId)!;
    expect(after.present).toEqual([]);
    expect(after.lastPresentAt[bob.account.id]).toBe(asStored(entered));
    await shutdown(second);
  });

  it('invents nothing for a member who has never entered', async () => {
    // The other half of the old assertion, which still holds: invited and
    // never arrived is no evidence either way, and none is manufactured. The
    // screen says the invitation is outstanding rather than guessing at an
    // absence.
    const first = boot();
    const { bob, channelId } = await pair(first);
    await shutdown(first);

    const second = boot();
    const after = second.channels.get(channelId)!;
    expect(after.lastPresentAt[bob.account.id]).toBeUndefined();
    await shutdown(second);
  });

  it('is on both members’ home screens again, in the right section', async () => {
    const first = boot();
    const { alice, bob, channelId } = await pair(first);
    // Bob has never entered, so for him this is an invitation; Alice created
    // it and is therefore in everPresent, so for her it is rejoinable.
    await shutdown(first);

    const second = boot();
    const invites = second.channels.invitesFor(bob.account.id);
    expect(invites.map((i) => i.channelId)).toEqual([channelId]);
    expect(invites[0].from.id).toBe(alice.account.id);

    const rejoinable = second.channels.rejoinableFor(alice.account.id);
    expect(rejoinable.map((r) => r.channelId)).toEqual([channelId]);
    // Nobody is present after a restart, which the home screen states rather
    // than guesses at.
    expect(rejoinable[0].presentCount).toBe(0);

    // And it can be walked back into.
    const entered = second.channels.dispatch(channelId, alice.account.id, {
      type: 'ENTER',
    });
    expect(entered.ok).toBe(true);
    expect(second.channels.get(channelId)!.present).toEqual([alice.account.id]);
    await shutdown(second);
  });

  it('survives a second restart, so the projection round-trips through itself', async () => {
    // The first boot writes what create() wrote; the second writes what
    // revive() produced. If those disagree, a channel would decay a little on
    // every deploy, which is the kind of fault that only shows up in
    // production months later.
    const first = boot();
    const { alice, bob, channelId } = await pair(first);
    first.channels.dispatch(channelId, alice.account.id, {
      type: 'SET_NAME',
      name: 'Book club',
    } as never);
    await shutdown(first);

    const second = boot();
    const once = second.channels.get(channelId)!;
    await shutdown(second);

    const third = boot();
    const twice = third.channels.get(channelId)!;
    expect(twice).toEqual(once);
    expect(twice.name).toBe('Book club');
    expect(twice.participants).toEqual([alice.account.id, bob.account.id]);
    await shutdown(third);
  });
});

describe('what is written, and what is not', () => {
  it('writes nothing for a transition that changes only volatile state', async () => {
    // The whole justification for writing inside commit() rather than on a
    // timer. These are real transitions — each one produces a new state, runs
    // the media plane and pushes a snapshot to every watcher — and not one of
    // them changes anything that ought to survive a restart, so not one of
    // them touches the disk.
    //
    // Note this has to be driven by actions rather than by ticks. A tick
    // during a live claim returns the *same* state object, so commit() never
    // runs and nothing would be written even if suppression were removed
    // entirely; a test built on ticks looks like it pins this and pins
    // nothing. Claiming and releasing is the honest exercise.
    const app = boot();
    const { alice, bob, channelId } = await pair(app);
    app.channels.dispatch(channelId, bob.account.id, { type: 'ENTER' });

    const changes = () =>
      (app.db.prepare('SELECT total_changes() AS n').get() as { n: number }).n;

    const before = changes();
    for (let i = 0; i < 5; i += 1) {
      app.channels.dispatch(channelId, alice.account.id, {
        type: 'SET_SELF_MUTE',
        muted: i % 2 === 0,
      } as never);
      app.channels.dispatch(channelId, alice.account.id, { type: 'CLAIM_FLOOR' });
      app.channels.dispatch(channelId, alice.account.id, {
        type: 'RELEASE_FLOOR',
      });
      clock += 61_000;
      app.channels.tick();
    }
    expect(changes()).toBe(before);

    // And those really were transitions, not no-ops the reducer refused.
    expect(app.channels.get(channelId)!.floor.lastClaimedAt).not.toEqual({});
    await shutdown(app);
  });

  it('writes when something durable actually changes', async () => {
    // The complement of the test above: suppression must not be so eager that
    // a rename fails to reach the disk.
    const app = boot();
    const { alice, channelId } = await pair(app);
    const changes = () =>
      (app.db.prepare('SELECT total_changes() AS n').get() as { n: number }).n;

    const before = changes();
    app.channels.dispatch(channelId, alice.account.id, {
      type: 'SET_NAME',
      name: 'Book club',
    } as never);
    expect(changes()).toBeGreaterThan(before);

    // Setting the same name again changes nothing, so it writes nothing.
    const settled = changes();
    app.channels.dispatch(channelId, alice.account.id, {
      type: 'SET_NAME',
      name: 'Book club',
    } as never);
    expect(changes()).toBe(settled);
    await shutdown(app);
  });
});

describe('rows the previous process left behind', () => {
  it('closes a channel that predates persistence rather than reviving it', async () => {
    // Before channels were persisted, a live one existed only in memory, so a
    // row with no end time meant the process had died with the channel in it.
    // Reviving one of those would put a roster nobody remembers back on their
    // home screens. The absence of a state blob is what identifies them.
    const seed = boot();
    const { alice, bob } = await pair(seed);
    await shutdown(seed);

    const raw = new DatabaseSync(dbPath());
    raw
      .prepare(
        `INSERT INTO channels (id, initiator_id, invitee_id, created_at,
                               participants, ended_at, state)
         VALUES (?, ?, ?, ?, ?, NULL, NULL)`
      )
      .run(
        'chan_ghost',
        alice.account.id,
        bob.account.id,
        clock - 90_000,
        JSON.stringify([alice.account.id, bob.account.id])
      );
    raw.close();

    const app = boot();
    expect(app.channels.get('chan_ghost')).toBeUndefined();
    const row = app.db
      .prepare('SELECT ended_at FROM channels WHERE id = ?')
      .get('chan_ghost') as { ended_at: number | null };
    expect(row.ended_at).not.toBeNull();
    await shutdown(app);
  });

  it('deletes an in-flight recording that captured nothing', async () => {
    // A run whose row was opened and which never got a single segment did not
    // happen. Keeping it would put a permanently empty recording on somebody's
    // home screen once the boot sweep marked it ended.
    const seed = boot();
    const { alice, bob, channelId } = await pair(seed);
    await shutdown(seed);

    const raw = new DatabaseSync(dbPath());
    raw
      .prepare(
        `INSERT INTO recordings (id, channel_id, initiator_id, invitee_id,
                                 participants, started_at, duration_ms, s3_key,
                                 stems, ended_at)
         VALUES (?, ?, ?, ?, ?, ?, 0, '', '{}', NULL)`
      )
      .run(
        'rec_empty',
        channelId,
        alice.account.id,
        bob.account.id,
        JSON.stringify([alice.account.id, bob.account.id]),
        clock
      );
    raw.close();

    const app = boot();
    const row = app.db
      .prepare('SELECT id FROM recordings WHERE id = ?')
      .get('rec_empty');
    expect(row).toBeUndefined();
    await shutdown(app);
  });
});

describe('a recording interrupted by the restart', () => {
  it('is kept, marked failed, and reaches the home screen', async () => {
    const media = new MemoryMediaServer();
    const first = boot(media);
    const { alice, bob, channelId } = await pair(first);
    first.channels.dispatch(channelId, bob.account.id, { type: 'ENTER' });
    first.channels.dispatch(channelId, alice.account.id, {
      type: 'START_RECORDING',
    });
    await settle();

    const runId = first.channels.get(channelId)!.recording.runId!;
    expect(runId).toBeTruthy();

    // While it is capturing, the row exists but is not a recording anyone can
    // play, so the home screen does not offer it.
    expect(first.channels.recordingsFor(alice.account.id)).toEqual([]);

    // Long enough for a checkpoint to have written the run's progress. The
    // throttle map starts empty, so the first tick after the run begins always
    // checkpoints.
    clock += 7_000;
    first.channels.tick();
    await settle();

    // The process dies without anybody stopping the recording.
    await shutdown(first);

    const secondMedia = new MemoryMediaServer();
    const second = boot(secondMedia);

    const row = second.db
      .prepare('SELECT * FROM recordings WHERE id = ?')
      .get(runId) as {
      ended_at: number | null;
      failure: string | null;
      duration_ms: number;
      stems: string | null;
    };
    expect(row.ended_at).not.toBeNull();
    expect(row.failure).toMatch(/restarted/i);
    // The duration is whatever the last checkpoint knew, which understates the
    // truth by at most one checkpoint interval — the safe direction.
    expect(row.duration_ms).toBe(7_000);

    // The audio LiveKit already wrote is still referenced, under its run.
    const stems = JSON.parse(row.stems!) as Record<
      string,
      Array<{ key: string; startMs: number }>
    >;
    expect(Object.keys(stems).sort()).toEqual(
      [alice.account.id, bob.account.id].sort()
    );
    for (const segments of Object.values(stems)) {
      expect(segments[0].key).toContain(`${channelId}/${runId}/`);
    }

    // It is a finished recording now, so both parties can find it.
    for (const user of [alice, bob]) {
      expect(
        second.channels.recordingsFor(user.account.id).map((r) => r.id)
      ).toEqual([runId]);
    }

    // The revived channel is not recording, and nothing thinks it is.
    const channel = second.channels.get(channelId)!;
    expect(channel.recording.status).toBe('idle');
    expect(channel.recording.runId).toBeNull();

    // Closing the room is what terminates the egresses whose handles died with
    // the old process; nobody is present in a revived channel, so the room
    // holds only ghosts and closing it costs nothing.
    expect(secondMedia.closed).toContain(channelId);

    await shutdown(second);
  });

  it('leaves a recording that was stopped properly alone', async () => {
    // The boot sweep must touch only unfinished runs. A recording somebody
    // stopped before the restart is already complete, and re-finalizing it
    // would stamp a failure on a conversation that ended perfectly well.
    const media = new MemoryMediaServer();
    const first = boot(media);
    const { alice, bob, channelId } = await pair(first);
    first.channels.dispatch(channelId, bob.account.id, { type: 'ENTER' });
    first.channels.dispatch(channelId, alice.account.id, {
      type: 'START_RECORDING',
    });
    await settle();
    const runId = first.channels.get(channelId)!.recording.runId!;
    clock += 5_000;
    first.channels.dispatch(channelId, alice.account.id, {
      type: 'STOP_RECORDING',
    });
    await settle();
    await shutdown(first);

    const second = boot(new MemoryMediaServer());
    const row = second.db
      .prepare('SELECT ended_at, failure, duration_ms FROM recordings WHERE id = ?')
      .get(runId) as {
      ended_at: number;
      failure: string | null;
      duration_ms: number;
    };
    expect(row.failure).toBeNull();
    expect(row.duration_ms).toBe(5_000);
    expect(row.ended_at).toBe(clock);
    await shutdown(second);
  });
});

describe('when a channel was last in use', () => {
  it('survives a restart, so the list order does not reshuffle', async () => {
    const seed = boot();
    const { alice, bob, channelId } = await pair(seed);
    // Used well after it was created, which is the whole point of the field:
    // creation order and use order are different things.
    clock += 600_000;
    seed.channels.dispatch(channelId, bob.account.id, { type: 'ENTER' });
    const used = clock;
    clock += 60_000;
    seed.channels.dispatch(channelId, alice.account.id, { type: 'STEP_OUT' });
    seed.channels.dispatch(channelId, bob.account.id, { type: 'STEP_OUT' });
    const emptied = clock;
    await shutdown(seed);

    const app = boot();
    const revived = app.channels.get(channelId)!;
    expect(revived.lastActiveAt).toBe(emptied);
    expect(revived.lastActiveAt).toBeGreaterThan(used);
    expect(revived.lastActiveAt).toBeGreaterThan(revived.createdAt);
    await shutdown(app);
  });

  it('falls back to creation for a row written before the field existed', async () => {
    // Those rows are ordinary and revivable; they simply have no record of
    // use. Creation is the honest answer, and it is the order they had before.
    const seed = boot();
    const { channelId } = await pair(seed);
    await shutdown(seed);

    const raw = new DatabaseSync(dbPath());
    const row = raw
      .prepare('SELECT state, created_at FROM channels WHERE id = ?')
      .get(channelId) as { state: string; created_at: number };
    const { lastActiveAt: _dropped, ...older } = JSON.parse(row.state);
    expect(_dropped).toBeDefined();
    raw
      .prepare('UPDATE channels SET state = ? WHERE id = ?')
      .run(JSON.stringify(older), channelId);
    raw.close();

    const app = boot();
    const revived = app.channels.get(channelId)!;
    expect(revived.lastActiveAt).toBe(row.created_at);
    await shutdown(app);
  });
});
