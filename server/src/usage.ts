import { cpus, loadavg } from 'node:os';
import { USAGE_RETENTION_MS } from '../../core/constants';
import { newId, pairKey, type Db } from './db';

/**
 * What separates the parts of an open span's key.
 *
 * A NUL, because it is the one byte that cannot occur in any of the four
 * things being joined — a kind, a channel id and two account ids — so a key
 * cannot be made ambiguous by an id that happens to contain the separator.
 * `closeOthers` and `closeChannel` split it back apart and rely on that.
 *
 * **Written as an escape, and it must stay one.** Until 2026-09-25 all three
 * sites carried a literal NUL byte in the source instead. It behaved
 * identically and cost something else entirely: git treats a file holding a
 * NUL as binary, so `git diff` reported `Bin` and no content for this file,
 * and every change to it was unreviewable. One named constant also beats
 * three separators nobody can see.
 */
const SEPARATOR = '\0';

/** What the box is doing right now, as `egress_starts` records it. */
export type HostLoad = () => { load1m: number; cpus: number };

/**
 * The host's run queue, for context and not for blame. Egress admits a job
 * against `cores × max_cpu_utilization (0.8)` less what *its own* processes
 * cost — each the larger of its measured CPU and track_cpu_cost — so nothing
 * else on the box can refuse a stem, and a precise whole-box utilisation
 * would not say who to blame. The load average says whether the box was
 * struggling at the time, which is all a refusal needs from it.
 */
const hostLoad: HostLoad = () => ({
  load1m: loadavg()[0],
  cpus: cpus().length,
});

/** Long enough for any LiveKit message; short enough that none is a payload. */
const ERROR_LIMIT = 300;

/**
 * What this box carried, for the last thirty days and no longer — and, since
 * 2026-09-15, one thing it did not carry but did.
 *
 * Every claim this project makes about load is reasoned rather than counted.
 * `track_cpu_cost: 0.15` caps the box at roughly ten simultaneous recorded
 * participants and nobody knows how close it has come; the sizing argument in
 * planning/MIGRATION.md runs in both directions on judgement. This is the thing
 * that would settle either.
 *
 * **It is instrumentation, not a feature.** Nothing reads these tables in code.
 * There is no endpoint, no field on the wire, no screen — `bin/usage` runs the
 * queries against the box from outside. That is a decision rather than an
 * omission: a figure the application can see is a figure the application will
 * eventually decide something with.
 *
 * The design and its stated bounds are in
 * planning/decision/archive/DECISIONS-2026-08-16-to-2026-08-19.md § *The meter
 * is two tables and a script*, which is now four. `pings` was added here rather
 * than to ChannelRegistry because it is the same kind of thing — a row nothing
 * in the application reads, swept on the same horizon, cleared by the same
 * `forget`, and queried from outside by `bin/growth`. It is the one table here
 * that measures an intention rather than a cost; see `recordPing`.
 *
 * **`nav_counts` is the fourth and obeys none of those three rules**, which is
 * why it is worth naming here rather than leaving to the schema. It is not
 * swept, not cleared by `forget`, and not a row per anything — it holds no
 * identity to need any of that, being a running total of which of four
 * controls a population reaches for. See `recordNav`, and
 * planning/decision/2026-09-18-two-ways-out-and-two-ways-in.md.
 *
 * **`episode_listens` is the fifth and keeps the fourth's rules rather than
 * the first three's**, for the same reason and one more of its own: it is the
 * only thing measured here about somebody who has no account at all. It
 * counts starts of an episode on the public podcast page, per episode per
 * day, holding no address, no user agent and nobody. See `recordListen`,
 * `startsAnEpisode` for what a start is, and
 * planning/decision/2026-09-25-counting-what-the-public-page-serves.md.
 *
 * **Listening inside the app is not in it** — that is a `listen` span against
 * an account, above, and is a cost question rather than this one.
 *
 * The bounds worth repeating, because they govern what any query over the
 * spans can honestly say:
 *
 * - **Mic and listen spans are sampled**, at USAGE_POLL_INTERVAL_MS, so every
 *   edge is accurate to within one interval and a microphone opened and closed
 *   inside one window is invisible. Noise across a month of minutes; not noise
 *   across a single conversation.
 * - **The `floor` kind is the exception to both, and to the subject.** Its
 *   edges come from the reducer's committed transitions rather than a poll, so
 *   they are exact; and it is the one kind that measures what somebody did
 *   rather than what this box carried. Added 2026-09-17 to answer whether the
 *   claim delay produces the turn-taking it was designed to produce. The rule
 *   above is what keeps it honest and it binds here hardest — see the schema.
 * - **Stem uploads are invisible.** The egress jobs write to S3 on their own
 *   PutObject-only credential and never through this process, so the largest
 *   category of bytes is not in `usage_bytes` and cannot be. What is there is
 *   what this server served.
 */
export class UsageMeter {
  /**
   * The id of each open span, keyed by what it is a span *of*. Whoever opens a
   * span has to be able to find it again to close it, and the natural key is
   * the thing itself rather than a handle — the poll rediscovers an open
   * microphone every fifteen seconds without remembering it opened one.
   *
   * In memory rather than read back from the table on every transition. The
   * table is the record; this is the working set, and `closeStrays` is what
   * reconciles the two after a restart has thrown it away.
   */
  private open = new Map<string, string>();

  constructor(
    private db: Db,
    private now: () => number = Date.now,
    private load: HostLoad = hostLoad
  ) {}

  /** How many spans of a kind are open, across every channel. */
  openCount(kind: string): number {
    let count = 0;
    for (const key of this.open.keys()) {
      if (key.split(SEPARATOR)[0] === kind) count++;
    }
    return count;
  }

  /**
   * The key an open span is remembered under. Everything that identifies the
   * span except when it started — two spans with the same key are the same
   * span continuing, which is what makes `open` idempotent and lets the poll
   * be written as a statement of what is true now rather than a diff.
   */
  private key(span: {
    kind: string;
    channelId: string;
    accountId?: string | null;
    peerId?: string | null;
  }): string {
    return [
      span.kind,
      span.channelId,
      span.accountId ?? '',
      span.peerId ?? '',
    ].join(SEPARATOR);
  }

  /**
   * Starts a span, or does nothing if one of the same shape is already open.
   *
   * Idempotent on purpose. The poll says what is true now and calls this for
   * every microphone it finds open, including the ones that were already open
   * a moment ago; a version that started a second span would turn one
   * conversation into a row per sample.
   */
  openSpan(span: {
    kind: string;
    channelId: string;
    accountId?: string | null;
    peerId?: string | null;
    recordingId?: string | null;
    source: 'room' | 'state';
  }): void {
    const key = this.key(span);
    if (this.open.has(key)) return;

    const id = newId('usg');
    this.db
      .prepare(
        `INSERT INTO usage_spans
           (id, kind, account_id, peer_id, channel_id, recording_id,
            started_at, ended_at, source)
         VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?)`
      )
      .run(
        id,
        span.kind,
        span.accountId ?? null,
        span.peerId ?? null,
        span.channelId,
        span.recordingId ?? null,
        this.now(),
        span.source
      );
    this.open.set(key, id);
  }

  /** Ends a span. Does nothing if none of that shape is open. */
  closeSpan(span: {
    kind: string;
    channelId: string;
    accountId?: string | null;
    peerId?: string | null;
  }): void {
    const key = this.key(span);
    const id = this.open.get(key);
    if (id === undefined) return;
    this.open.delete(key);
    this.db
      .prepare('UPDATE usage_spans SET ended_at = ? WHERE id = ?')
      .run(this.now(), id);
  }

  /**
   * Closes every open span of these kinds in a channel, except the ones
   * `keep` says are still true.
   *
   * This is what makes the poll a statement rather than a diff: it hands over
   * everything it found, and everything else of that kind in that channel is
   * by definition over. Without it, a microphone that closed while the phone
   * was gone would leave a span open until the channel ended.
   */
  closeOthers(
    kinds: string[],
    channelId: string,
    keep: ReadonlySet<string>
  ): void {
    for (const key of [...this.open.keys()]) {
      const [kind, channel] = key.split(SEPARATOR);
      if (!kinds.includes(kind) || channel !== channelId) continue;
      if (keep.has(key)) continue;
      const id = this.open.get(key)!;
      this.open.delete(key);
      this.db
        .prepare('UPDATE usage_spans SET ended_at = ? WHERE id = ?')
        .run(this.now(), id);
    }
  }

  /** The key `closeOthers` wants, for a span the caller has just opened. */
  keyOf(span: {
    kind: string;
    channelId: string;
    accountId?: string | null;
    peerId?: string | null;
  }): string {
    return this.key(span);
  }

  /** Closes every open span in a channel, whatever its kind. */
  closeChannel(channelId: string): void {
    for (const key of [...this.open.keys()]) {
      const [, channel] = key.split(SEPARATOR);
      if (channel !== channelId) continue;
      const id = this.open.get(key)!;
      this.open.delete(key);
      this.db
        .prepare('UPDATE usage_spans SET ended_at = ? WHERE id = ?')
        .run(this.now(), id);
    }
  }

  /** Records a transfer this server made, and its size. */
  recordBytes(transfer: {
    kind: string;
    bytes: number;
    accountId?: string | null;
    recordingId?: string | null;
  }): void {
    this.db
      .prepare(
        `INSERT INTO usage_bytes
           (id, kind, account_id, recording_id, bytes, at)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(
        newId('usb'),
        transfer.kind,
        transfer.accountId ?? null,
        transfer.recordingId ?? null,
        transfer.bytes,
        this.now()
      );
  }

  /**
   * Records one request for a stem and what came of it, under the load it was
   * made in. See `egress_starts`.
   *
   * **Called while the stem's own span is still open**, so `concurrent` counts
   * it: the figure is how many the box was being asked to run, which on a
   * refusal is the one that did not fit. Every open egress span counts,
   * including one whose request is still in flight — it has been asked for.
   *
   * The error text loses `scrub` before it is written. LiveKit names the room
   * and the participant in some of its messages, and a participant is an
   * account id; the table is meant to hold nobody, and a message is the one
   * column where somebody could arrive by accident.
   */
  recordEgressStart(start: {
    recordingId: string | null;
    outcome: 'started' | 'no-track' | 'error';
    error?: unknown;
    scrub?: string[];
  }): void {
    let error: string | null = null;
    if (start.outcome === 'error') {
      error =
        start.error instanceof Error
          ? start.error.message
          : String(start.error);
      for (const word of start.scrub ?? []) {
        if (word) error = error.split(word).join('…');
      }
      error = error.slice(0, ERROR_LIMIT);
    }
    const { load1m, cpus } = this.load();
    this.db
      .prepare(
        `INSERT INTO egress_starts
           (id, at, recording_id, outcome, concurrent, load_1m, cpus, error)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        newId('egs'),
        this.now(),
        start.recordingId,
        start.outcome,
        this.openCount('egress'),
        load1m,
        cpus,
        error
      );
  }

  /**
   * Records that one person asked another to come to a channel.
   *
   * Called after `ChannelRegistry.ping` has decided to send one and never
   * before: the rate limiter is the authority on whether a ping happens, and
   * a record written ahead of it would count refusals as asks.
   *
   * **The words are deliberately not a parameter.** Only whether there were
   * any — see the schema on `pings`, and /privacy, which describes this table
   * and could not describe it honestly if the sentence were in it.
   */
  recordPing(ping: {
    channelId: string;
    senderId: string;
    targetId: string;
    withText: boolean;
  }): void {
    this.db
      .prepare(
        `INSERT INTO pings
           (id, channel_id, sender_id, target_id, sent_at, with_text,
            answered_at)
         VALUES (?, ?, ?, ?, ?, ?, NULL)`
      )
      .run(
        newId('png'),
        ping.channelId,
        ping.senderId,
        ping.targetId,
        this.now(),
        ping.withText ? 1 : 0
      );
  }

  /**
   * Marks whatever this person was last asked for in this channel as answered.
   *
   * Called from the presence transition in `ChannelRegistry.commit`, for
   * everybody who has just stepped in or declared themselves nearby — the same
   * two edges `consume` spends an announcement on, and for the same reason:
   * either one is direct evidence that the thing on their lock screen was
   * dealt with. Level 10.
   *
   * **The most recent open ping and no other.** Three people taking turns
   * pinging somebody produce three rows, and one arrival answers one of them;
   * crediting all three would make the answer rate climb with the number of
   * people asking. The newest is the one they can plausibly have acted on.
   *
   * **And only inside `PING_INTERVAL_MS`**, which is the window the ping
   * itself opened. Somebody who wanders into a channel a day after being
   * asked has not answered anything, and counting them would turn level 10
   * into a slow restatement of level 8. The row stays open for good, which is
   * the honest record of a ping nobody answered.
   *
   * Idempotent in the way that matters: an arrival with no open ping behind it
   * updates nothing, which is the ordinary case on every step into a room.
   */
  answerPing(channelId: string, accountId: string, windowMs: number): void {
    const now = this.now();
    this.db
      .prepare(
        `UPDATE pings SET answered_at = ?
          WHERE id = (SELECT id FROM pings
                       WHERE channel_id = ? AND target_id = ?
                         AND answered_at IS NULL
                         AND sent_at > ?
                       ORDER BY sent_at DESC LIMIT 1)`
      )
      .run(now, channelId, accountId, now - windowMs);
  }

  /**
   * Adds one to the count of a navigation control being used.
   *
   * **The only write in this class that records nothing about anybody.** It
   * takes no account id and is given none — the route authenticates the
   * caller, to keep the counter off the open internet, and then throws the
   * account away. See `nav_counts` in the schema, which argues that trade, and
   * /privacy, which is the promise it is protecting.
   *
   * An upsert rather than a read and a write, so two taps landing in the same
   * millisecond cannot lose one of each other. The key is every column but the
   * count, which is why `build` is floored to 0 rather than left null.
   *
   * **The day is UTC**, from this server's clock rather than the caller's.
   * Somebody swiping at eleven at night in Sydney lands on the following day
   * here, which is wrong by a few hours and is the only kind of wrong this
   * column can afford — a client-supplied day would be a field a client could
   * use to write anywhere in the table.
   */
  recordNav(nav: { kind: string; build: number | null; client: string }): void {
    this.db
      .prepare(
        `INSERT INTO nav_counts (kind, build, client, day, count)
         VALUES (?, ?, ?, ?, 1)
         ON CONFLICT(kind, build, client, day)
         DO UPDATE SET count = count + 1`
      )
      .run(
        nav.kind,
        nav.build ?? 0,
        nav.client,
        new Date(this.now()).toISOString().slice(0, 10)
      );
  }

  /**
   * Adds one to the count of an episode being started on the public page.
   *
   * **The second write in this class that records nothing about anybody, and
   * the first about somebody who has no account to record.** A listener on
   * the public page is a stranger: no session, no membership, nothing they
   * ever agreed to. That is the reason this is a counter and not a row — a
   * row per play would carry a time to the millisecond, which for an episode
   * nobody has found yet is very nearly an identity whatever the columns are
   * called.
   *
   * **It is given no address and no user agent, and must not be.** Both are
   * on the request and both are the obvious way to make this a better report
   * — they would separate a podcast app from a browser, and two plays from
   * one person from two people. They are dropped at the door, because with
   * no identity in the row the subtraction cannot be made afterwards and the
   * sentence on /privacy is worth more than the resolution is.
   *
   * An upsert rather than a read and a write, for `recordNav`'s reason: two
   * plays landing in the same millisecond must not lose one of each other.
   *
   * **What a start is, is `startsAnEpisode`'s decision and not this
   * method's.** This one only counts, so the rule can be tested without a
   * database and the route reads as a statement of when it applies.
   */
  recordListen(listen: { channelId: string; recordingId: string }): void {
    this.db
      .prepare(
        `INSERT INTO episode_listens (channel_id, recording_id, day, count)
         VALUES (?, ?, ?, 1)
         ON CONFLICT(channel_id, recording_id, day)
         DO UPDATE SET count = count + 1`
      )
      .run(
        listen.channelId,
        listen.recordingId,
        new Date(this.now()).toISOString().slice(0, 10)
      );
  }

  /**
   * Finalizes spans a dead process left open, and forgets its working set.
   *
   * **Closed at their own `started_at`, not at boot.** The process died at an
   * unknown moment somewhere between the two, and crediting the span the whole
   * of the downtime would invent minutes nobody spent — a server down for a
   * weekend would otherwise report a weekend of conversation. Zero is the only
   * figure that is certainly not an overstatement.
   *
   * The rows are kept rather than deleted, at zero length. "A span was open
   * when the server died" is a fact about a restart, and one worth being able
   * to count.
   */
  closeStrays(): number {
    this.open.clear();
    const result = this.db
      .prepare(
        'UPDATE usage_spans SET ended_at = started_at WHERE ended_at IS NULL'
      )
      .run();
    return Number(result.changes);
  }

  /**
   * Removes everything past the retention horizon.
   *
   * **Open spans are deliberately left alone.** One open past the horizon
   * is a leak — something opened a span and no longer exists to close it — and
   * sweeping it would hide the leak rather than the row. It shows up as an
   * ancient null `ended_at`, which is exactly what somebody should trip over.
   */
  sweep(now: number): {
    spans: number;
    bytes: number;
    pings: number;
    egressStarts: number;
  } {
    const cutoff = now - USAGE_RETENTION_MS;
    const spans = this.db
      .prepare(
        'DELETE FROM usage_spans WHERE ended_at IS NOT NULL AND ended_at < ?'
      )
      .run(cutoff);
    const bytes = this.db
      .prepare('DELETE FROM usage_bytes WHERE at < ?')
      .run(cutoff);
    // **On `sent_at`, not on `answered_at`.** A ping is swept a month after it
    // was sent whether or not anybody answered it, which is the only rule that
    // does not keep the unanswered ones longer than the answered — and the
    // unanswered are the ones this table exists to count.
    const pings = this.db
      .prepare('DELETE FROM pings WHERE sent_at < ?')
      .run(cutoff);
    const egressStarts = this.db
      .prepare('DELETE FROM egress_starts WHERE at < ?')
      .run(cutoff);
    return {
      spans: Number(spans.changes),
      bytes: Number(bytes.changes),
      pings: Number(pings.changes),
      egressStarts: Number(egressStarts.changes),
    };
  }

  /**
   * Removes every row naming an account, on either side of a pair.
   *
   * Called from `deleteAccount`. The privacy page promises that nothing which
   * remains identifies you, and a metering row carrying your id would falsify
   * it — including, and this is the one easily missed, a `pair` row where you
   * are the `peer_id` and somebody else is the account.
   */
  forget(accountId: string): void {
    this.db
      .prepare('DELETE FROM usage_spans WHERE account_id = ? OR peer_id = ?')
      .run(accountId, accountId);
    this.db
      .prepare('DELETE FROM usage_bytes WHERE account_id = ?')
      .run(accountId);
    // Both ends, for the `pair` row's reason exactly: a ping names two people
    // and an erased account is as identifiable as the target of one as it is
    // as the sender.
    this.db
      .prepare('DELETE FROM pings WHERE sender_id = ? OR target_id = ?')
      .run(accountId, accountId);
  }
}

/**
 * The largest read from the first byte that is treated as a player probing
 * this server rather than somebody starting an episode.
 *
 * A probe is `bytes=0-1`: Safari and several podcast apps send one to learn
 * whether ranges are honoured, and then immediately ask for audio. A real
 * first chunk is hundreds of kilobytes or the whole file. A kilobyte is well
 * clear of the first and nowhere near the second, and nothing observed sits
 * between them.
 */
export const EPISODE_PROBE_BYTES = 1024;

/**
 * Whether this read of an episode is somebody starting it, rather than one of
 * the dozen other requests a media player makes for the same file.
 *
 * **This is the whole of the de-duplication, and it is done without knowing
 * who is asking** — which is the constraint that chose it. With an address or
 * a session one could count a listener once an hour, the way the rest of the
 * industry does; `episode_listens` holds neither on purpose, so the only thing
 * left to tell a second request from a second listener is what the request
 * asks for. A file is begun once per play and seeked afterwards, so the first
 * byte is the signal.
 *
 * Three cases, in the order they are decided:
 *
 * - **No `Range` at all** is the whole file in one reply — a download, and the
 *   least ambiguous start there is.
 * - **A read that does not begin at the first byte** is somebody already
 *   listening: the forward reads of a stream in progress, a seek, or the
 *   suffix read of the moov atom that several players make before they play
 *   anything at all. `parseRange` has already turned `bytes=-500` into a read
 *   near the end, so that arrives here as an ordinary non-zero start.
 * - **A read from the first byte** is a start unless it is small enough to be
 *   a probe, which arrives immediately before the real first chunk and would
 *   otherwise double every listen from the players that send one.
 *
 * The threshold is capped by the file, so a short episode — shorter than a
 * probe, which no real one is — cannot become permanently uncountable by
 * being smaller than the constant.
 */
export function startsAnEpisode(
  range: { start: number; end: number } | null,
  totalBytes: number
): boolean {
  if (!range) return true;
  if (range.start !== 0) return false;
  const asked = range.end - range.start + 1;
  return asked > Math.min(EPISODE_PROBE_BYTES, totalBytes - 1);
}

/** The canonical ordering for a pair span, so a pair has one shape. */
export function pairSpan(
  a: string,
  b: string,
  channelId: string
): { kind: string; channelId: string; accountId: string; peerId: string } {
  const [first, second] = pairKey(a, b);
  return { kind: 'pair', channelId, accountId: first, peerId: second };
}
