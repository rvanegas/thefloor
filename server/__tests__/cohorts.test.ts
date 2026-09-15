import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { buildApp, type App } from '../src/app';
import { MemoryMailer } from '../src/mail';
import { MemoryPusher } from '../src/push';
import { COHORT_REACH_FLOOR, COHORT_SIZE } from '../../core/constants';

/**
 * *Getting-started channels*: the introductory channel a new account with
 * nobody here is placed in.
 *
 * What is worth writing down is mostly what it refuses to do. Placing somebody
 * is three lines; the behaviour that would go quietly wrong is the gate, the
 * seat accounting, and the off switch — and each of them fails in the
 * direction of putting a stranger in somebody's room, which is not a defect
 * anybody would file as one. It reads as the feature working.
 *
 * The clock is fixed and the database is in memory. Nothing here talks to
 * Apple or to LiveKit.
 */

let app: App;
let pusher: MemoryPusher;
let clock = 1_700_000_000_000;

const HOST = 'rochelle@example.com';

/** An app with cohorts on, unless a test asks for them off. */
function build(options: { hosts?: string[] } = {}): App {
  return buildApp({
    dbPath: ':memory:',
    mailer: new MemoryMailer(),
    now: () => clock,
    pusher,
    cohortHosts: options.hosts ?? [HOST],
  });
}

beforeEach(async () => {
  clock = 1_700_000_000_000;
  pusher = new MemoryPusher();
  app = build();
  await app.fastify.listen({ port: 0, host: '127.0.0.1' });
});

afterEach(async () => {
  app.channels.stop();
  await app.fastify.close();
});

const auth = (token: string) => ({ authorization: `Bearer ${token}` });

async function signIn(identifier: string, displayName = 'Someone') {
  const code = app.accounts.issueCode(identifier, clock)!;
  const verified = await app.fastify.inject({
    method: 'POST',
    url: '/auth/verify',
    payload: { identifier, code, displayName },
  });
  expect(verified.statusCode).toBe(200);
  const body = verified.json() as {
    token: string;
    account: { id: string; displayName: string };
  };
  // Carried along because half of what a contact route takes is an address,
  // and the account body does not include one.
  return { ...body, identifier };
}

/**
 * Every cohort channel this account is a member of, by name.
 *
 * Both of Home's lists, because a cohort moves between them: it is a standing
 * place while nobody has ever been in it, and an invitation from the host once
 * somebody has. `channelsFor` is no use here — it answers about presence, not
 * membership.
 */
function cohortsOf(accountId: string): string[] {
  const names = [
    ...app.channels.rejoinableFor(accountId).map((view) => view.name),
    ...app.channels.invitesFor(accountId).map((view) => view.name),
  ];
  return names.filter(
    (name): name is string => !!name && /^Getting Started Cohort /.test(name)
  );
}

/** The live state of this account's cohort, for the tests that act on it. */
function cohortChannelOf(accountId: string) {
  const id = [
    ...app.channels.rejoinableFor(accountId),
    ...app.channels.invitesFor(accountId),
  ].find((view) => /^Getting Started Cohort /.test(view.name ?? ''))?.channelId;
  return id ? app.channels.get(id)! : null;
}

const cohortOf = (accountId: string) => cohortsOf(accountId)[0] ?? null;

type User = Awaited<ReturnType<typeof signIn>>;

/** Asking somebody by address, which is what inviting somebody is. */
const request = (from: User, identifier: string) =>
  app.fastify.inject({
    method: 'POST',
    url: '/contacts/request',
    headers: auth(from.token),
    payload: { identifier },
  });

/** Two accounts made contacts through the routes a person would use. */
async function connect(a: User, b: User) {
  const asked = await request(a, b.identifier);
  expect(asked.statusCode).toBeLessThan(400);
  const accepted = await app.fastify.inject({
    method: 'POST',
    url: `/contacts/${a.account.id}/accept`,
    headers: auth(b.token),
  });
  expect(accepted.statusCode).toBeLessThan(400);
}

describe('a new account with nobody here', () => {
  it('is placed in a cohort with the host', async () => {
    const host = await signIn(HOST, 'Rochelle');
    const arrival = await signIn('new@example.com');

    expect(cohortOf(arrival.account.id)).toBe('Getting Started Cohort 1');
    // The host is in it, which is the point of it. Without this the channel is
    // four strangers and nobody to answer them.
    expect(cohortOf(host.account.id)).toBe('Getting Started Cohort 1');
  });

  it('is not made anybody’s contact by it', async () => {
    const host = await signIn(HOST, 'Rochelle');
    const arrival = await signIn('new@example.com');

    // The distinction the whole feature rests on, and the one somebody would
    // reasonably assume goes the other way: sharing a channel is not a contact
    // here, and the privacy page says so in as many words.
    expect(app.accounts.areContacts(host.account.id, arrival.account.id)).toBe(
      false
    );
  });

  it('tells nobody', async () => {
    await signIn(HOST, 'Rochelle');
    const first = await signIn('first@example.com');
    await app.fastify.inject({
      method: 'POST',
      url: '/devices',
      headers: auth(first.token),
      payload: { token: 'device-first', platform: 'ios' },
    });

    await signIn('second@example.com');

    // A placement is bookkeeping, not somebody waiting for you in a room. Four
    // "you have been invited" notifications per cohort — one to everybody
    // already in it, every time anybody signs up — is the application
    // inventing an event.
    expect(pusher.messagesFor('device-first')).toHaveLength(0);
  });

  it('fills one cohort before opening the next', async () => {
    await signIn(HOST, 'Rochelle');
    const arrivals = [];
    for (let n = 0; n < COHORT_SIZE - 1; n += 1) {
      arrivals.push(await signIn(`arrival${n}@example.com`));
    }

    for (const arrival of arrivals) {
      expect(cohortOf(arrival.account.id)).toBe('Getting Started Cohort 1');
    }

    // The seat after the last one opens a second, rather than widening the
    // first past what a channel holds.
    const overflow = await signIn('overflow@example.com');
    expect(cohortOf(overflow.account.id)).toBe('Getting Started Cohort 2');
  });

  it('is placed in exactly one, ever', async () => {
    await signIn(HOST, 'Rochelle');
    const arrival = await signIn('new@example.com');
    // Signing in again is not arriving again.
    await signIn('new@example.com');

    expect(cohortsOf(arrival.account.id)).toEqual(['Getting Started Cohort 1']);
  });
});

describe('the seats of a cohort', () => {
  it('are spent rather than occupied, so leaving does not reopen one', async () => {
    await signIn(HOST, 'Rochelle');
    const arrivals = [];
    for (let n = 0; n < COHORT_SIZE - 1; n += 1) {
      arrivals.push(await signIn(`arrival${n}@example.com`));
    }
    // Somebody leaves a full cohort.
    const leaving = arrivals[0];
    const channel = cohortChannelOf(leaving.account.id)!;
    app.channels.dispatch(channel.id, leaving.account.id, {
      type: 'LEAVE_CHANNEL',
    });
    expect(cohortOf(leaving.account.id)).toBeNull();

    // The next arrival does **not** inherit the empty place. Counting live
    // participants instead would drop somebody who signed up today into a room
    // whose introductions happened last week, which is the one experience this
    // feature exists to prevent.
    const next = await signIn('next@example.com');
    expect(cohortOf(next.account.id)).toBe('Getting Started Cohort 2');
  });
});

describe('who is left out', () => {
  it('leaves out somebody who arrives already within reach of people', async () => {
    await signIn(HOST, 'Rochelle');

    // A group who all know each other. Three is enough to put anybody they
    // invite at the floor: the newcomer, whoever asked them, and that person's
    // two contacts.
    const group = [];
    for (let n = 0; n < COHORT_REACH_FLOOR - 1; n += 1) {
      group.push(await signIn(`group${n}@example.com`, `Group ${n}`));
    }
    for (let i = 0; i < group.length; i += 1) {
      for (let j = i + 1; j < group.length; j += 1) {
        await connect(group[i], group[j]);
      }
    }

    // Invited by one of them, and so already within reach of all of them
    // before they have accepted anything — which is the case this gate is for
    // and the one an accepted-edges walk would get wrong.
    await request(group[0], 'joiner@example.com');
    const joiner = await signIn('joiner@example.com');

    expect(app.accounts.reachableFrom(joiner.account.id, 99)).toBeGreaterThanOrEqual(
      COHORT_REACH_FLOOR
    );
    expect(cohortOf(joiner.account.id)).toBeNull();
  });

  it('still seeds two people who each know nobody else', async () => {
    await signIn(HOST, 'Rochelle');
    const lonely = await signIn('lonely@example.com');
    await request(lonely, 'friend@example.com');
    const friend = await signIn('friend@example.com');

    // An island of two is the case a cohort helps most, and a floor of two
    // would have excluded it.
    expect(cohortOf(friend.account.id)).not.toBeNull();
  });

  it('leaves out the host', async () => {
    const host = await signIn(HOST, 'Rochelle');
    // Nothing yet: the host is not their own arrival, and a cohort of one
    // person who is the host is not a cohort.
    expect(cohortsOf(host.account.id)).toEqual([]);
  });
});

describe('reach', () => {
  it('counts a pending invitation, which is the whole reason it is not an island', async () => {
    await signIn(HOST, 'Rochelle');
    const asker = await signIn('asker@example.com');
    await request(asker, 'asked@example.com');
    const asked = await signIn('asked@example.com');

    // Nothing has been accepted — `resolveInvitesFor` writes a signup's
    // invitation as pending and there it sits until they tap it. An
    // accepted-edges walk would call this an island of one.
    expect(app.accounts.areContacts(asker.account.id, asked.account.id)).toBe(
      false
    );
    expect(app.accounts.reachableFrom(asked.account.id, 99)).toBe(2);
  });

  it('stops at the limit rather than walking the graph', async () => {
    await signIn(HOST, 'Rochelle');
    const hub = await signIn('hub@example.com');
    for (let n = 0; n < 12; n += 1) {
      await request(hub, `spoke${n}@example.com`);
      // They have to arrive for the edge to exist: an invitation to an address
      // nobody holds is a `pending_invites` row, and it becomes a contact row
      // only when somebody signs up on that address.
      await signIn(`spoke${n}@example.com`);
    }

    // Thirteen people are reachable; asked for three, it answers three. The
    // bound is the point — this runs on the signup path, where the true size
    // of a component is never the question.
    expect(app.accounts.reachableFrom(hub.account.id, 3)).toBe(3);
    expect(app.accounts.reachableFrom(hub.account.id, 99)).toBe(13);
  });

  it('is one for somebody who knows nobody', async () => {
    await signIn(HOST, 'Rochelle');
    const alone = await signIn('alone@example.com');
    expect(app.accounts.reachableFrom(alone.account.id, 99)).toBe(1);
  });
});

describe('the backfill', () => {
  it('places nobody on a second pass', async () => {
    await signIn(HOST, 'Rochelle');
    await signIn('cold@example.com');

    // The honest check that an idempotent pass is idempotent. The accounts it
    // was written for were placed as they signed in above, so the first call
    // here should already find nothing to do.
    expect(app.channels.backfillCohorts(app.accounts.cohortCandidates())).toBe(0);
    expect(app.channels.backfillCohorts(app.accounts.cohortCandidates())).toBe(0);
  });

  /**
   * The staging order the feature ships under, run end to end: deploy with no
   * host, let people sign up, then set the variable and restart.
   *
   * On a file database rather than `:memory:`, because the whole claim is
   * about what survives a restart — a second app on a fresh memory database
   * would prove nothing at all.
   */
  it('sweeps up whoever signed up while it was switched off', async () => {
    app.channels.stop();
    await app.fastify.close();

    const dbPath = join(
      mkdtempSync(join(tmpdir(), 'thefloor-cohorts-')),
      'test.db'
    );
    const boot = async (hosts: string[]) => {
      app = buildApp({
        dbPath,
        mailer: new MemoryMailer(),
        now: () => clock,
        pusher,
        cohortHosts: hosts,
      });
      await app.fastify.listen({ port: 0, host: '127.0.0.1' });
    };

    await boot([]);
    const host = await signIn(HOST, 'Rochelle');
    const cold = await signIn('cold@example.com');
    expect(cohortsOf(cold.account.id)).toEqual([]);
    app.channels.stop();
    await app.fastify.close();

    // The variable set and the box restarted. Nothing is lost by having waited
    // for a build that can draw the card.
    await boot([HOST]);
    expect(cohortsOf(cold.account.id)).toEqual(['Getting Started Cohort 1']);
    expect(cohortsOf(host.account.id)).toEqual(['Getting Started Cohort 1']);

    // And the cohort survives the next restart as a cohort, rather than coming
    // back as an ordinary channel of strangers with nothing explaining itself.
    app.channels.stop();
    await app.fastify.close();
    await boot([HOST]);
    const channel = cohortChannelOf(cold.account.id)!;
    expect(app.channels.cohortNumberOf(channel.id)).toBe(1);
    expect(app.channels.hasCohorts()).toBe(true);
  });

  it('leaves the demo accounts out', async () => {
    app.channels.stop();
    await app.fastify.close();
    app = buildApp({
      dbPath: ':memory:',
      mailer: new MemoryMailer(),
      now: () => clock,
      pusher,
      cohortHosts: [HOST],
      review: {
        identifier: 'review@example.com',
        code: '123456',
        contact: 'review-contact@example.com',
      },
    });
    await app.fastify.listen({ port: 0, host: '127.0.0.1' });

    await signIn(HOST, 'Rochelle');
    const reviewer = await signIn('review@example.com', 'Reviewer');

    // A phone at Apple is not somebody with nobody to talk to. The same
    // reasoning keeps both demo accounts out of the build census.
    expect(app.accounts.cohortCandidates()).not.toContain(reviewer.account.id);
  });
});

describe('with no host configured', () => {
  beforeEach(async () => {
    app.channels.stop();
    await app.fastify.close();
    app = build({ hosts: [] });
    await app.fastify.listen({ port: 0, host: '127.0.0.1' });
  });

  it('places nobody, which is how this ships and how it ends', async () => {
    const arrival = await signIn('new@example.com');
    expect(cohortsOf(arrival.account.id)).toEqual([]);
  });
});
