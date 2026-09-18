import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { buildApp, type App } from '../src/app';
import { MemoryMailer } from '../src/mail';
import { MemoryPusher } from '../src/push';
import {
  COHORT_CHANNEL_NAME,
  COHORT_REACH_FLOOR,
  COHORT_SIZE,
} from '../../core/constants';
import type { HomeView } from '../../core/protocol';
import { OUR_DOMAIN } from '../src/accounts';
import { NOTIFY_HEADER } from '../src/release';

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

/**
 * An account, reachable by default — which is what a placement now waits for.
 *
 * **Notifications on unless a test says otherwise**, because since 2026-09-15
 * signing in no longer places anybody: the seat goes to somebody who can be
 * told the room went live, and `POST /devices` is where that becomes true. A
 * helper that stopped at `/auth/verify` would leave every test below asserting
 * about an account the feature is still waiting on, which is a different
 * subject from the one each of them is about.
 *
 * Pass `{ notifications: false }` to get the arrival who has refused, or not
 * yet been asked. That is the gate's own subject and it is tested explicitly
 * rather than by omission.
 */
async function signIn(
  identifier: string,
  displayName = 'Someone',
  options: { notifications?: boolean } = {}
) {
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
  const user = { ...body, identifier };
  if (options.notifications !== false) await enableNotifications(user);
  return user;
}

/**
 * Turning notifications on, as the app does it: one address, registered, and
 * the grant declared on the same request.
 *
 * The route rather than a write, because the placement hangs off the route —
 * `POST /devices` is what notices an account's first address, and a test that
 * inserted the row would be exercising neither half.
 *
 * **Both halves, since 2026-09-18.** The gate is `notifications = 'granted'`
 * *and* an address, and the header is how a phone says the first — written by
 * `requireAccount` on the way into this very request, which is why one inject
 * still does it. A registration without the header is a build too old to say,
 * and that is a case with its own test rather than the shape of this helper.
 */
async function enableNotifications(user: {
  token: string;
  identifier: string;
}) {
  const registered = await app.fastify.inject({
    method: 'POST',
    url: '/devices',
    headers: { ...auth(user.token), [NOTIFY_HEADER]: 'granted' },
    payload: { token: `apns-${user.identifier}`, platform: 'ios' },
  });
  expect(registered.statusCode).toBe(200);
}

/**
 * Every cohort channel this account is a member of, **by number**.
 *
 * Both of Home's lists, because a cohort moves between them: it is a standing
 * place while nobody has ever been in it, and an invitation from the host once
 * somebody has. `channelsFor` is no use here — it answers about presence, not
 * membership.
 *
 * **The number rather than the name, since 2026-09-18**, when every cohort
 * became `COHORT_CHANNEL_NAME` and names stopped telling them apart. It is
 * also the better test: `channels.cohort` is what the server actually keys
 * these on, where the name is a string any member may rewrite.
 */
function cohortsOf(accountId: string): number[] {
  const ids = [
    ...app.channels.rejoinableFor(accountId).map((view) => view.channelId),
    ...app.channels.invitesFor(accountId).map((view) => view.channelId),
  ];
  return ids
    .map((id) => app.channels.cohortNumberOf(id))
    .filter((n): n is number => n !== null);
}

/** The live state of this account's cohort, for the tests that act on it. */
function cohortChannelOf(accountId: string) {
  const id = [
    ...app.channels.rejoinableFor(accountId),
    ...app.channels.invitesFor(accountId),
  ]
    .map((view) => view.channelId)
    .find((channelId) => app.channels.cohortNumberOf(channelId) !== null);
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

    expect(cohortOf(arrival.account.id)).toBe(1);
    // The host is in it, which is the point of it. Without this the channel is
    // four strangers and nobody to answer them.
    expect(cohortOf(host.account.id)).toBe(1);
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
      expect(cohortOf(arrival.account.id)).toBe(1);
    }

    // The seat after the last one opens a second, rather than widening the
    // first past what a channel holds.
    const overflow = await signIn('overflow@example.com');
    expect(cohortOf(overflow.account.id)).toBe(2);
  });

  it('is placed in exactly one, ever', async () => {
    await signIn(HOST, 'Rochelle');
    const arrival = await signIn('new@example.com');
    // Signing in again is not arriving again.
    await signIn('new@example.com');

    expect(cohortsOf(arrival.account.id)).toEqual([1]);
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
    expect(cohortOf(next.account.id)).toBe(2);
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

  it('leaves out somebody who cannot be told the room went live', async () => {
    await signIn(HOST, 'Rochelle');
    const unreachable = await signIn('quiet@example.com', 'Someone', {
      notifications: false,
    });

    // Signing up is no longer the moment. A seat is spent once and the whole
    // of what it offers is that somebody may speak into it later, so it does
    // not go to a phone that could never hear about it.
    expect(cohortOf(unreachable.account.id)).toBeNull();
  });
});

describe('the seat waits for the permission rather than the signup', () => {
  it('places on the registration that brings the first address', async () => {
    await signIn(HOST, 'Rochelle');
    const arrival = await signIn('later@example.com', 'Someone', {
      notifications: false,
    });
    expect(cohortOf(arrival.account.id)).toBeNull();

    // The permission granted days later, through the route the app uses. This
    // is the deadlock the app half exists to avoid — nothing else would ever
    // have given this account somebody.
    clock += 3 * 24 * 60 * 60 * 1_000;
    await enableNotifications(arrival);

    expect(cohortOf(arrival.account.id)).toBe(1);
  });

  it('does not place twice when the same phone registers again', async () => {
    await signIn(HOST, 'Rochelle');
    const arrival = await signIn('again@example.com');
    expect(cohortsOf(arrival.account.id)).toEqual([1]);

    // Every launch re-registers the address it already holds. The placement
    // hangs off an account's *first* one, so the rest are bookkeeping.
    await enableNotifications(arrival);
    await enableNotifications(arrival);

    expect(cohortsOf(arrival.account.id)).toEqual([1]);
    expect(cohortChannelOf(arrival.account.id)!.participants).toHaveLength(2);
  });

  it('spends no seat on the arrival who never turns them on', async () => {
    await signIn(HOST, 'Rochelle');
    await signIn('quiet@example.com', 'Someone', { notifications: false });

    // The cohort that arrival would have opened does not exist, so the next
    // person who can be reached gets seat one rather than seat two.
    const reachable = await signIn('loud@example.com');
    expect(cohortOf(reachable.account.id)).toBe(1);
    expect(cohortChannelOf(reachable.account.id)!.participants).toHaveLength(2);
  });

  /**
   * An address is not a permission, and the gate wants the permission.
   *
   * Until 2026-09-18 it wanted only the address, on the reasoning that a phone
   * with a token is a phone that was asked — which is true of a phone and not
   * true of an account. The two come apart in both directions, and the
   * direction that filled the first two cohorts is this one: a build that
   * predates the header registers an address and claims nothing, and *unknown*
   * was being read as yes.
   */
  it('spends no seat on a build too old to say whether it was granted', async () => {
    await signIn(HOST, 'Rochelle');
    const old = await signIn('old-build@example.com', 'Someone', {
      notifications: false,
    });

    // The address alone, with no claim about the permission — which is exactly
    // what every build before 213 sends.
    const registered = await app.fastify.inject({
      method: 'POST',
      url: '/devices',
      headers: auth(old.token),
      payload: { token: 'apns-old-build', platform: 'ios' },
    });
    expect(registered.statusCode).toBe(200);

    expect(cohortsOf(old.account.id)).toEqual([]);
    // And the backfill agrees with the live path, which is the whole reason
    // the gate is one predicate: a restart must not place whom a signup would
    // not.
    expect(app.channels.backfillCohorts(app.accounts.cohortCandidates())).toBe(0);
    expect(cohortsOf(old.account.id)).toEqual([]);
  });

  it('spends no seat on somebody who has an address and has refused', async () => {
    await signIn(HOST, 'Rochelle');
    const refused = await signIn('refused@example.com', 'Someone', {
      notifications: false,
    });

    const registered = await app.fastify.inject({
      method: 'POST',
      url: '/devices',
      headers: { ...auth(refused.token), [NOTIFY_HEADER]: 'denied' },
      payload: { token: 'apns-refused', platform: 'ios' },
    });
    expect(registered.statusCode).toBe(200);

    expect(cohortsOf(refused.account.id)).toEqual([]);
    // And it is the one refusal they can undo: Home still says a cohort is
    // waiting on them, so the app may ask again.
    expect(app.channels.wouldPlaceInCohort(refused.account.id)).toBe(true);
  });
});

describe('what Home says about it', () => {
  /** `HomeView.cohortEligible`, which is what unlocks the app's ask. */
  const eligible = (user: User) =>
    app.fastify
      .inject({ method: 'GET', url: '/home', headers: auth(user.token) })
      .then((reply) => (reply.json() as { cohortEligible?: boolean }).cohortEligible);

  it('is true for an arrival who is waiting on nothing else', async () => {
    await signIn(HOST, 'Rochelle');
    const arrival = await signIn('waiting@example.com', 'Someone', {
      notifications: false,
    });
    expect(await eligible(arrival)).toBe(true);
  });

  it('is false once the seat has been taken', async () => {
    await signIn(HOST, 'Rochelle');
    const arrival = await signIn('placed@example.com');
    // Placed already: there is nothing further this permission would fetch
    // them, so the app goes back to asking for everybody else's reason.
    expect(await eligible(arrival)).toBe(false);
  });

  it('is false for somebody who arrived into a group, and for the host', async () => {
    const host = await signIn(HOST, 'Rochelle');
    const hub = await signIn('hub@example.com');
    for (let n = 0; n < COHORT_REACH_FLOOR; n += 1) {
      const spoke = await signIn(`spoke${n}@example.com`);
      await connect(hub, spoke);
    }
    const joined = await signIn('joined@example.com', 'Someone', {
      notifications: false,
    });
    await connect(hub, joined);

    expect(await eligible(joined)).toBe(false);
    expect(await eligible(host)).toBe(false);
  });

  it('is false for everybody while the feature is switched off', async () => {
    app.channels.stop();
    await app.fastify.close();
    app = build({ hosts: [] });
    await app.fastify.listen({ port: 0, host: '127.0.0.1' });

    const arrival = await signIn('nohost@example.com', 'Someone', {
      notifications: false,
    });
    expect(await eligible(arrival)).toBe(false);
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
    expect(cohortsOf(cold.account.id)).toEqual([1]);
    expect(cohortsOf(host.account.id)).toEqual([1]);

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
    // And the live path refuses them too, which is the half the candidate list
    // cannot cover: a reviewer registering a phone goes through `placeInCohort`
    // rather than through any backfill.
    expect(cohortsOf(reviewer.account.id)).toEqual([]);
  });
});

/**
 * Who a cohort may never hold, whatever their situation — `cohortExcluded`.
 *
 * Distinct from the four refusals above it, and the distinction is the point:
 * those are about what somebody *has* and every one of them can stop being
 * true, where these are about who somebody is and cannot. Both of these were
 * found in a live cohort on 2026-09-18, the backfill having placed them.
 */
describe('who is refused on identity rather than on situation', () => {
  it('leaves out an erased account, on both paths', async () => {
    await signIn(HOST, 'Rochelle');
    const leaving = await signIn('leaving@example.com');
    expect(cohortsOf(leaving.account.id)).toEqual([1]);

    const deleted = await app.fastify.inject({
      method: 'DELETE',
      url: '/me',
      headers: auth(leaving.token),
    });
    expect(deleted.statusCode).toBe(204);

    // Deleting takes them out of the channel, which `removeMember` has always
    // done. What is new is that nothing puts them back: a tombstone is not a
    // candidate, and a seat spent on one could never be answered.
    expect(app.accounts.cohortCandidates()).not.toContain(leaving.account.id);
    expect(app.channels.backfillCohorts(app.accounts.cohortCandidates())).toBe(0);
    expect(cohortsOf(leaving.account.id)).toEqual([]);
  });

  it('leaves out every address on our own domain', async () => {
    await signIn(HOST, 'Rochelle');
    const rig = await signIn(`rtest2@${OUR_DOMAIN}`, 'A test rig');

    // The live path, which is where this one actually bit: `rtest2@` was not a
    // demo account, so identity-by-identity exclusion missed it and it sat in
    // a cohort with four strangers.
    expect(cohortsOf(rig.account.id)).toEqual([]);
    expect(app.accounts.cohortCandidates()).not.toContain(rig.account.id);
    expect(app.channels.hasCohorts()).toBe(false);
  });

  it('tells neither of them that a cohort is waiting on the permission', async () => {
    await signIn(HOST, 'Rochelle');
    const rig = await signIn(`rtest1@${OUR_DOMAIN}`, 'A test rig', {
      notifications: false,
    });

    // The Home flag is `placeInCohort`'s gate with the reachability half taken
    // off, so a refusal that has nothing to do with reachability has to be
    // inside it — otherwise the app asks for a permission that would unlock
    // nothing.
    expect(app.channels.wouldPlaceInCohort(rig.account.id)).toBe(false);
  });
});

/**
 * The repair, which is about the two cohorts that already exist.
 *
 * Tightening a gate stops the next placement and does nothing at all about the
 * ones already made: a placement is a channel, and channels are not re-derived
 * from the gate on boot. On 2026-09-18 the live cohort 1 was closed at five
 * seats, two of them holding erased accounts.
 *
 * On a file database throughout, because every claim here is about what a
 * restart finds.
 */
describe('the repair of cohorts a looser gate assembled', () => {
  let dbPath: string;

  const boot = async () => {
    app = buildApp({
      dbPath,
      mailer: new MemoryMailer(),
      now: () => clock,
      pusher,
      cohortHosts: [HOST],
    });
    await app.fastify.listen({ port: 0, host: '127.0.0.1' });
  };

  const reboot = async () => {
    app.channels.stop();
    await app.fastify.close();
    await boot();
  };

  beforeEach(async () => {
    app.channels.stop();
    await app.fastify.close();
    dbPath = join(mkdtempSync(join(tmpdir(), 'thefloor-repair-')), 'test.db');
    await boot();
  });

  it('takes an erased account out and gives its seat back', async () => {
    await signIn(HOST, 'Rochelle');
    const leaving = await signIn('leaving@example.com');
    const staying = await signIn('staying@example.com');
    const channelId = cohortChannelOf(staying.account.id)!.id;
    expect(app.channels.get(channelId)!.participants).toHaveLength(3);

    // Erased behind the registry's back, which is the state the live rows were
    // actually in: both were tombstones weeks before a cohort existed, so
    // nothing ever removed them from a channel — the backfill put them in one.
    app.accounts.erase(leaving.account.id);

    await reboot();

    const repaired = app.channels.get(channelId)!;
    expect(repaired.participants).not.toContain(leaving.account.id);
    expect(repaired.participants).toContain(staying.account.id);
    // The seat back, so the next arrival takes it rather than opening a cohort
    // of their own. This is the one place a spent seat is ever returned.
    const next = await signIn('next@example.com');
    expect(cohortOf(next.account.id)).toBe(1);
  });

  it('takes our own addresses out of a cohort they were placed in', async () => {
    const host = await signIn(HOST, 'Rochelle');
    const stranger = await signIn('stranger@example.com');
    const channelId = cohortChannelOf(stranger.account.id)!.id;

    // Placed before the domain rule existed, which is how `rtest2@` came to be
    // sitting in a room with four strangers. Put there through the ordinary
    // invitation rather than by a write, so the channel is in exactly the
    // state the old placement produced — which needs them to be contacts
    // first, that being what `dispatch` refuses on.
    const rig = await signIn(`rtest2@${OUR_DOMAIN}`, 'A test rig');
    await connect(rig, host);
    app.channels.dispatch(channelId, host.account.id, {
      type: 'INVITE',
      contactId: rig.account.id,
    } as never);
    expect(app.channels.get(channelId)!.participants).toContain(rig.account.id);

    await reboot();

    expect(app.channels.get(channelId)!.participants).not.toContain(
      rig.account.id
    );
  });

  it('leaves alone somebody who simply has not granted notifications', async () => {
    await signIn(HOST, 'Rochelle');
    const placed = await signIn('placed@example.com');
    const channelId = cohortChannelOf(placed.account.id)!.id;

    // The permission withdrawn afterwards, which is a real person in a room
    // they can already see. The gate decides who a seat is *spent* on; reading
    // it as grounds for eviction is a different act and not one this does.
    app.accounts.markNotifications(placed.account.id, 'denied', clock);

    await reboot();

    expect(app.channels.get(channelId)!.participants).toContain(
      placed.account.id
    );
  });

  it('renames what this code named, and not what a person named', async () => {
    const host = await signIn(HOST, 'Rochelle');
    const member = await signIn('member@example.com');
    const channelId = cohortChannelOf(member.account.id)!.id;

    // Through the reducer rather than by a write to the row: the name lives in
    // `channels.state`, the durable projection a restore actually reads, and a
    // test that updated the `name` column alone would assert against a value
    // nothing loads.
    const rename = async (name: string) => {
      app.channels.dispatch(channelId, host.account.id, {
        type: 'SET_NAME',
        name,
      } as never);
      expect(app.channels.get(channelId)!.name).toBe(name);
      await reboot();
    };

    // Exactly the string the first implementation generated.
    await rename('Getting Started Cohort 1');
    expect(app.channels.get(channelId)!.name).toBe(COHORT_CHANNEL_NAME);

    // And a name somebody chose survives, being a thing a person did rather
    // than a thing this code did.
    await rename('Thursday lot');
    expect(app.channels.get(channelId)!.name).toBe('Thursday lot');
  });

  it('repairs nothing on a second boot', async () => {
    await signIn(HOST, 'Rochelle');
    const leaving = await signIn('leaving@example.com');
    await signIn('staying@example.com');
    app.accounts.erase(leaving.account.id);

    await reboot();
    expect(app.channels.repairCohorts()).toEqual({ renamed: 0, removed: 0 });
  });
});

/**
 * What a cohort is called, and who is told which one it is.
 *
 * Adopted 2026-09-18. The name carried the number, and with `COHORT_SIZE` at
 * five that told every member roughly how many people had ever arrived here
 * alone — on the Home screen of exactly the people being asked to believe the
 * place is worth staying in.
 */
describe('the name, and the number the host alone is sent', () => {
  const rejoinable = (user: User) =>
    app.fastify
      .inject({ method: 'GET', url: '/home', headers: auth(user.token) })
      .then((reply) => (reply.json() as HomeView).rejoinable);

  it('calls every cohort the same thing', async () => {
    await signIn(HOST, 'Rochelle');
    const first = await signIn('first@example.com');
    for (let n = 0; n < COHORT_SIZE; n += 1) {
      await signIn(`filler${n}@example.com`);
    }

    // Two cohorts, one name. The number is still what the server keys them on.
    expect(cohortsOf((await signIn('later@example.com')).account.id)).toEqual([2]);
    expect(cohortChannelOf(first.account.id)!.name).toBe(COHORT_CHANNEL_NAME);
  });

  it('sends the host the number of each, since they are in all of them', async () => {
    const host = await signIn(HOST, 'Rochelle');
    await signIn('first@example.com');
    for (let n = 0; n < COHORT_SIZE; n += 1) {
      await signIn(`filler${n}@example.com`);
    }
    await signIn('later@example.com');

    const numbers = (await rejoinable(host))
      .map((view) => view.cohort)
      .filter((n): n is number => n != null)
      .sort();
    expect(numbers).toEqual([1, 2]);
  });

  it('sends a member no number at all, which is the point of moving it', async () => {
    await signIn(HOST, 'Rochelle');
    const member = await signIn('member@example.com');

    const views = await rejoinable(member);
    expect(views.map((view) => view.name)).toContain(COHORT_CHANNEL_NAME);
    // Not null-but-present: the key is absent from a member's snapshot, so the
    // number is not one `console.log` away from somebody who was never to be
    // shown it.
    expect(views.every((view) => view.cohort == null)).toBe(true);
  });

  it('gives an ordinary channel no number, even to the host', async () => {
    const host = await signIn(HOST, 'Rochelle');
    const friend = await signIn('friend@example.com');
    await connect(host, friend);

    const ordinary = (await rejoinable(host)).filter(
      (view) => view.name !== COHORT_CHANNEL_NAME
    );
    expect(ordinary.length).toBeGreaterThan(0);
    expect(ordinary.every((view) => view.cohort == null)).toBe(true);
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
