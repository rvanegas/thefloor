import { USAGE_RETENTION_MS } from '../../core/constants';
import { newId, type Db } from './db';

/**
 * Who did how much of what, on every route, for one hour at a time — and a
 * flag when somebody does far more of something than anybody does.
 *
 * **It refuses nothing.** A flag is a sentence for a human to read, written
 * once, and the evaluating is theirs. That is the whole design: a budget per
 * route is argued and tuned alone, and each one only counts what its author
 * thought to count — the accept route's budget counted acceptances while its
 * leak was in its refusals. This counts every answer, so it does not have to
 * have guessed which one leaks. See planning/decision/
 * 2026-10-03-excess-is-watched-across-every-route-rather-than-budgeted-per-route.md.
 *
 * **It does not replace a budget on a secret.** It notices after the fact, and
 * what was learned stays learned; `invite_guesses` and the sign-in code's
 * attempts are still what protect a pin and a code.
 *
 * **The counts live in memory and die with their hour.** Only a flag is
 * written, so what is held about anybody who trips nothing is nothing at all.
 * A restart forgets the hour in progress, which costs at most one hour's
 * notice of something that is, by construction, still going on.
 *
 * **Read by `bin/usage` and nothing else**, on usage.ts's rule for the meter:
 * no endpoint, no field on the wire, no email — a figure the application can
 * see is one it will eventually decide something with. `bin/usage excess` is
 * the report, and runs with every other one when `bin/usage` is run bare. A
 * warning in the journal is the only other trace, for somebody already there.
 */

/** How long one count runs before it is thrown away. */
export const EXCESS_WINDOW_MS = 60 * 60 * 1000;

/**
 * The least that can be excess, whatever anybody else does.
 *
 * **Needed because the population is small.** "Far more than anybody" against
 * a route only one account touched this hour is far more than nothing, which
 * is everything — so below these nothing is flagged however lonely it is.
 *
 * Refusals are the one that matters: a walk of usernames is a run of `unknown`s,
 * and no honest person is refused sixty times in an hour on one route. Total
 * requests are there for the other shape, somebody hammering a route that
 * answers yes, and are set at a sustained one a second.
 */
export const EXCESS_REFUSED_FLOOR = 60;
export const EXCESS_TOTAL_FLOOR = 3600;

/** How many times the typical caller on a route somebody must reach. */
export const EXCESS_MULTIPLE = 10;

/**
 * How many callers one hour may track before it stops admitting new ones.
 *
 * A bound on memory rather than a judgement, and reaching it is said once in
 * the journal: something sending from that many addresses in one hour is
 * itself the news, and is not something this table could describe.
 */
export const EXCESS_MAX_SUBJECTS = 20_000;

/**
 * Who a request is counted against: the account when it was signed in, and
 * otherwise the address it came from.
 *
 * **An address is shared by strangers** — a phone on mobile data, a café — so
 * an address flag says *something here*, never *somebody*. Fine for asking a
 * human to look; it would be wrong for refusing, which is one more reason this
 * only flags.
 */
export interface ExcessSubject {
  kind: 'account' | 'address';
  id: string;
}

/** What was too much: answers that refused, or answers of any kind. */
export type ExcessMeasure = 'refused' | 'total';

export interface ExcessFlag {
  id: string;
  flaggedAt: number;
  windowStart: number;
  subject: ExcessSubject;
  /** The route's pattern — `/i/:username` — never the address requested. */
  route: string;
  measure: ExcessMeasure;
  count: number;
  /** The median of everybody else on that route this hour. */
  typical: number;
}

interface Tally {
  total: number;
  refused: number;
  /** Measures already flagged this hour, so each says so once. */
  flagged: Set<ExcessMeasure>;
}

const key = (subject: ExcessSubject) => `${subject.kind}:${subject.id}`;

export class Excess {
  private windowStart = 0;
  /** route → subject key → tally, for the current hour only. */
  private tallies = new Map<string, Map<string, Tally>>();
  private subjects = new Set<string>();
  private saturated = false;

  constructor(
    private db: Db,
    private onFlag: (flag: ExcessFlag) => void = () => {},
    private onSaturated: () => void = () => {}
  ) {}

  /**
   * Counts one answer, and returns the flag if this one tipped it over.
   *
   * A 4xx is a refusal; a 5xx is not, being this server's fault rather than
   * anything the caller did, though it is in the total. Only a route this
   * server has is ever passed in — an address that matched nothing reveals
   * nothing, and counting the internet's scanners would bury everything else.
   */
  record(
    subject: ExcessSubject,
    route: string,
    status: number,
    now: number
  ): ExcessFlag | null {
    this.roll(now);

    const subjectKey = key(subject);
    if (!this.subjects.has(subjectKey)) {
      if (this.subjects.size >= EXCESS_MAX_SUBJECTS) {
        if (!this.saturated) {
          this.saturated = true;
          this.onSaturated();
        }
        return null;
      }
      this.subjects.add(subjectKey);
    }

    let byRoute = this.tallies.get(route);
    if (!byRoute) {
      byRoute = new Map();
      this.tallies.set(route, byRoute);
    }
    let tally = byRoute.get(subjectKey);
    if (!tally) {
      tally = { total: 0, refused: 0, flagged: new Set() };
      byRoute.set(subjectKey, tally);
    }

    tally.total += 1;
    if (status >= 400 && status < 500) tally.refused += 1;

    return (
      this.check(subject, subjectKey, route, byRoute, tally, 'refused', now) ??
      this.check(subject, subjectKey, route, byRoute, tally, 'total', now)
    );
  }

  /**
   * Removes what names an account: its flags, and its counts this hour.
   *
   * Called from `DELETE /me`, beside `Usage.forget`, for the promise the
   * privacy page makes — that nothing which remains identifies you.
   */
  forget(accountId: string): void {
    this.db
      .prepare(
        "DELETE FROM excess_flags WHERE subject_kind = 'account' AND subject = ?"
      )
      .run(accountId);
    const subjectKey = key({ kind: 'account', id: accountId });
    for (const byRoute of this.tallies.values()) byRoute.delete(subjectKey);
    this.subjects.delete(subjectKey);
  }

  /**
   * Deletes flags older than the usage tables keep anything, on the same
   * horizon and for the same reason: no long-run history of anybody.
   */
  sweep(now: number): number {
    const swept = this.db
      .prepare('DELETE FROM excess_flags WHERE flagged_at < ?')
      .run(now - USAGE_RETENTION_MS);
    return Number(swept.changes);
  }

  /**
   * Starts a new hour when this one is over, which is also when the table is
   * swept — so the monitor needs no timer, and an idle box has nothing to
   * sweep.
   */
  private roll(now: number): void {
    const start = now - (now % EXCESS_WINDOW_MS);
    if (start === this.windowStart) return;
    this.windowStart = start;
    this.tallies.clear();
    this.subjects.clear();
    this.saturated = false;
    this.sweep(now);
  }

  private check(
    subject: ExcessSubject,
    subjectKey: string,
    route: string,
    byRoute: Map<string, Tally>,
    tally: Tally,
    measure: ExcessMeasure,
    now: number
  ): ExcessFlag | null {
    if (tally.flagged.has(measure)) return null;
    const count = measure === 'refused' ? tally.refused : tally.total;
    const floor =
      measure === 'refused' ? EXCESS_REFUSED_FLOOR : EXCESS_TOTAL_FLOOR;
    if (count < floor) return null;
    // Past the floor, the median is taken on the floor and every tenth count
    // after it rather than on every request: it is a pass over everybody on
    // the route, and somebody sitting just above the floor and below the
    // multiple would otherwise pay for it on each one.
    if (count !== floor && count % 10 !== 0) return null;

    const typical = median(byRoute, subjectKey, measure);
    if (count < typical * EXCESS_MULTIPLE) return null;

    tally.flagged.add(measure);
    const flag: ExcessFlag = {
      id: newId('xs'),
      flaggedAt: now,
      windowStart: this.windowStart,
      subject,
      route,
      measure,
      count,
      typical,
    };
    this.db
      .prepare(
        `INSERT INTO excess_flags
           (id, flagged_at, window_start, subject_kind, subject, route,
            measure, count, typical)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        flag.id,
        flag.flaggedAt,
        flag.windowStart,
        subject.kind,
        subject.id,
        route,
        measure,
        count,
        typical
      );
    this.onFlag(flag);
    return flag;
  }
}

/**
 * The middle of everybody else's count on this route this hour, zeros
 * included — somebody who used the route and was never refused is a caller
 * whose refusals were typical, and leaving them out would make one stray
 * refusal the norm.
 */
function median(
  byRoute: Map<string, Tally>,
  except: string,
  measure: ExcessMeasure
): number {
  const counts: number[] = [];
  for (const [subjectKey, tally] of byRoute) {
    if (subjectKey === except) continue;
    counts.push(measure === 'refused' ? tally.refused : tally.total);
  }
  if (counts.length === 0) return 0;
  counts.sort((a, b) => a - b);
  const middle = Math.floor(counts.length / 2);
  return counts.length % 2 === 1
    ? counts[middle]
    : (counts[middle - 1] + counts[middle]) / 2;
}

/**
 * The address a request came from, as Caddy saw it.
 *
 * **Not `request.ip`, which is 127.0.0.1 for everybody** — Node binds to
 * loopback and only Caddy reaches it, and nothing sets `trustProxy`. Setting it
 * would fix this and would also start writing every caller's address into the
 * journal through `logSafeRequest`'s `remoteAddress`, which today holds only
 * loopback; that is a change of its own, and this does not need it.
 *
 * `X-Forwarded-For` is believed only when the connection is from loopback,
 * which is to say from Caddy, and its last entry is taken: the address Caddy
 * itself saw, whatever a caller put in front of it.
 */
export function clientAddress(
  socketAddress: string | undefined,
  forwardedFor: string | string[] | undefined
): string {
  const peer = socketAddress ?? 'unknown';
  if (!isLoopback(peer) || !forwardedFor) return peer;
  const header = Array.isArray(forwardedFor)
    ? forwardedFor.join(',')
    : forwardedFor;
  const hops = header
    .split(',')
    .map((hop) => hop.trim())
    .filter(Boolean);
  return hops[hops.length - 1] ?? peer;
}

function isLoopback(address: string): boolean {
  return (
    address === '::1' ||
    address.startsWith('127.') ||
    address.startsWith('::ffff:127.')
  );
}
