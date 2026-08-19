import { DatabaseSync } from 'node:sqlite';
import { createHash, randomBytes } from 'node:crypto';

/**
 * SQLite via Node's built-in driver, so the server has no native dependencies
 * and its build artifact is portable across architectures. The surface used
 * here is small and deliberately boring; swapping in better-sqlite3 later means
 * changing this file and nothing else.
 */

export interface AccountRow {
  id: string;
  identifier: string;
  display_name: string;
  created_at: number;
  /** Markdown, as typed. Null until they write one. */
  bio: string | null;
  /**
   * When this person last held a live socket — written as they connect, as
   * they speak, and as they go. Null for an account that has not connected
   * since the column existed.
   */
  last_seen_at: number | null;
  /**
   * The iOS build they last connected from, or null when they last connected
   * from one that does not report it. Absent is not "unknown" in the useless
   * sense — it is a bound, meaning at or below the first build that sends the
   * header, and it stays that until the account connects again.
   */
  last_build: number | null;
  /**
   * Forces the donate link visible (1) or hidden (0), overriding what the
   * device's region suggests. Null — the default for everyone — means decide
   * automatically. See region.ts for why the automatic answer needs an
   * override at all.
   */
  donations_allowed: number | null;
}

export interface ContactRow {
  a_id: string;
  b_id: string;
  state: 'pending' | 'accepted';
  requester_id: string;
  created_at: number;
}

export interface DeviceTokenRow {
  token: string;
  account_id: string;
  platform: 'ios' | 'android';
  created_at: number;
  last_seen_at: number;
}

export interface RecordingRow {
  id: string;
  channel_id: string;
  initiator_id: string;
  invitee_id: string;
  /** JSON: string[] — every participant of the recorded channel, in order. */
  participants: string | null;
  /**
   * JSON: { [id]: displayName } — what each of them was called at the moment
   * the run was filed.
   *
   * The ids alone are not enough to label a recording that outlives things.
   * Resolving them live means an old recording relabels itself when somebody
   * renames themselves, and — worse — an id that no longer resolves is
   * silently dropped, so a recording of two people can come to read as though
   * nobody else was there. Null on rows written before this existed, which
   * fall back to resolving live.
   */
  participant_names: string | null;
  /**
   * What the recording is called: decided when the run stopped, the same for
   * everybody in it, never recomputed. Null on rows written before it existed,
   * which fall back to a label derived at read time — the old behaviour, and
   * viewer-relative, because there is nothing recorded to do better with.
   */
  name: string | null;
  started_at: number;
  duration_ms: number;
  s3_key: string;
  segment_keys: string | null;
  /**
   * JSON: { [identity]: Array<{ key, startMs }> } — each participant's
   * segments in order, with where in the recorded audio each begins. Rows
   * written before mid-channel joins existed hold { [identity]: string[] };
   * the export accepts both.
   */
  stems: string | null;
  /** JSON: Array<{ identity, fromMs, toMs }> — when each party was silenced. */
  floor_timeline: string | null;
  /**
   * Where the mixed recording stands: `'pending'` while it is being made,
   * `'ready'` once it is in the bucket, `'unmixed'` when there is not one and
   * nothing is going to make one without being asked.
   *
   * A pending recording is shown to nobody — see `recordingsFor`. The other two
   * are both displayable, which is the distinction that matters: `'unmixed'`
   * covers rows written before mixes existed and runs whose mix failed, and
   * both of those still export, by encoding on demand exactly as every
   * recording used to.
   *
   * Null on a row that is still capturing, and on legacy rows until the
   * migration backfills them.
   */
  mix_state: string | null;
  /** Null while the run is still capturing; restore() finalizes strays. */
  ended_at: number | null;
  /** Why the run ended early, when it did not end by anyone's choice. */
  failure: string | null;
  /** When its channel was deleted. Null until then; the sweep reads it. */
  deleted_at: number | null;
}

/**
 * One interval of one thing being carried, open until it is closed.
 *
 * Spans rather than counters because the request asks for timestamps as well
 * as minutes, and because a counter cannot answer the question the egress cap
 * makes urgent — how many stems were running *at once* — which needs to know
 * when each one overlapped the others.
 */
export interface UsageSpanRow {
  id: string;
  /**
   * `'mic'` — one participant publishing audio.
   * `'listen'` — one participant subscribed to somebody else's audio.
   * `'playback'` — the channel's shared track actually playing.
   * `'egress'` — one recording stem being captured.
   * `'pair'` — two people present in the same channel at the same time.
   */
  kind: string;
  /** Null on a span that belongs to the channel rather than to a person. */
  account_id: string | null;
  /**
   * The other party. On `'pair'` that is the second person, ordered against
   * `account_id` by `pairKey` so a pair has one shape however it is asked
   * about. On `'egress'` it is whose stem is being captured, `account_id`
   * being whoever started the recording — the two differ whenever somebody
   * records a conversation they are not the only voice in, which is most of
   * them. Null on every other kind.
   */
  peer_id: string | null;
  channel_id: string;
  /** `'egress'` only: the run, which is also the recordings row. */
  recording_id: string | null;
  started_at: number;
  /** Null while the span is open. closeStrays finalizes ones a restart left. */
  ended_at: number | null;
  /**
   * Which authority wrote it: `'room'` for what LiveKit was asked, `'state'`
   * for what this process knows because it did it.
   *
   * Not a hedge about confidence. The two are used for different streams on
   * purpose, so a `'mic'` row reading `'state'` would mean the poll had stopped
   * running and the meter had fallen back — a defect, and one that should be
   * visible as a defect rather than averaged into a total.
   */
  source: string;
}

/**
 * Bytes this server moved, and for whom.
 *
 * Not spans: a transfer is an event with a size, and giving it a duration
 * would invite somebody to divide one by the other and call it bandwidth.
 */
export interface UsageBytesRow {
  id: string;
  /** `'export' | 'playback-fetch' | 'mix-read' | 'mix-write'` */
  kind: string;
  /** Null when nobody asked for it directly — see the mix kinds. */
  account_id: string | null;
  recording_id: string | null;
  bytes: number;
  at: number;
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS accounts (
  id           TEXT PRIMARY KEY,
  identifier   TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  created_at   INTEGER NOT NULL,
  -- What this person says about themselves, as the Markdown source they
  -- typed. Null until they write one.
  bio          TEXT,
  -- When they last had the app open, to the nearest heartbeat. Null until
  -- they first connect.
  last_seen_at INTEGER,
  -- Which iOS build they last connected from. Null means they have not
  -- connected since the app began saying — which, indefinitely, has to be read
  -- as "something at or below the first build that sends it". See release.ts.
  last_build   INTEGER,
  -- Overrides the guess about whether this person may see the donate link.
  -- Null means decide from what their device reports, which is what everybody
  -- gets until somebody says otherwise; 1 forces it visible and 0 forces it
  -- hidden. It exists because the automatic answer is an approximation of the
  -- App Store storefront and a person who actually knows the truth for one
  -- account should be able to say so without a deploy. See region.ts.
  donations_allowed INTEGER
);

-- One-time codes. The code itself is never stored, only its hash, so a copy of
-- the database does not hand over the ability to sign in as anyone.
CREATE TABLE IF NOT EXISTS otp_codes (
  identifier TEXT PRIMARY KEY,
  code_hash  TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  attempts   INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

-- Bearer tokens, likewise stored hashed.
CREATE TABLE IF NOT EXISTS tokens (
  token_hash TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(id),
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS tokens_account ON tokens(account_id);

-- A contact pair is stored once, with a_id < b_id so the pair has a single
-- canonical row regardless of who asked. requester_id records the direction,
-- which is what distinguishes an incoming request from an outgoing one.
CREATE TABLE IF NOT EXISTS contacts (
  a_id         TEXT NOT NULL REFERENCES accounts(id),
  b_id         TEXT NOT NULL REFERENCES accounts(id),
  state        TEXT NOT NULL CHECK (state IN ('pending', 'accepted')),
  requester_id TEXT NOT NULL,
  created_at   INTEGER NOT NULL,
  PRIMARY KEY (a_id, b_id)
);

-- A contact request sent to an address with no account yet.
--
-- Requests must be storable whether or not the recipient exists, or the
-- interface answers a question it should not: a real request produces a
-- pending row and an imaginary one produces nothing, which tells anyone who
-- looks whether an address has an account here. Keeping both means every
-- request looks the same — and it lets someone invite a friend before that
-- friend has signed up, which is worth having on its own.
--
-- Resolved into a real contacts row the first time that address signs in.
CREATE TABLE IF NOT EXISTS pending_invites (
  requester_id TEXT NOT NULL REFERENCES accounts(id),
  identifier   TEXT NOT NULL,
  created_at   INTEGER NOT NULL,
  PRIMARY KEY (requester_id, identifier)
);

-- Money somebody gave, voluntarily, toward keeping this running. Nothing is
-- unlocked by it: an account that has never given a penny behaves identically
-- to one that has, which is what keeps this table off every read path in the
-- application.
--
-- Keyed on Ko-fi's transaction id because that is the whole idempotency story.
-- A webhook is retried on any answer they do not like, and INSERT OR IGNORE
-- against this key makes a replay a no-op without a read first.
--
-- account_id is nullable on purpose. Ko-fi's donate link carries no passthrough
-- field, so the account is matched afterwards rather than known at the time,
-- and a donation from somebody with no account here is still a donation. Losing
-- it because it could not be attributed would be the wrong trade in every
-- direction.
--
-- Matching is by address alone, and a donation paid from an address nobody has
-- signed in with is left unattributed rather than guessed at. An earlier
-- version inferred the giver from whoever had most recently tapped Support;
-- that credits the wrong person whenever two people are donating at once, and
-- nothing afterwards would ever reveal it had. An unattributed row is visible
-- and fixable; a confidently wrong one is neither.
CREATE TABLE IF NOT EXISTS donations (
  kofi_transaction_id TEXT PRIMARY KEY,
  account_id   TEXT REFERENCES accounts(id),
  -- 'email' when the payer's address is one we know, 'manual' when somebody
  -- resolved it by hand from Ko-fi's dashboard or a CSV export.
  matched_by   TEXT CHECK (matched_by IN ('email', 'manual')),
  email        TEXT,
  from_name    TEXT,
  message      TEXT,
  -- Integer cents. Ko-fi sends "3.00" as a string; it is parsed straight to
  -- cents rather than through a float, because money in a float is a defect
  -- waiting for a large enough number.
  amount_cents INTEGER NOT NULL,
  currency     TEXT NOT NULL,
  -- Ko-fi's own type field: Donation, Subscription, Shop Order, Commission.
  kind         TEXT NOT NULL,
  is_recurring INTEGER NOT NULL,
  is_public    INTEGER NOT NULL,
  received_at  INTEGER NOT NULL,
  -- Their ISO timestamp, kept verbatim and unparsed beside our own clock, so
  -- the two can be compared if they ever disagree.
  kofi_at      TEXT,
  -- The payload as JSON, minus its verification_token. This is a third party's
  -- shape, which they may extend without telling anyone, so it is kept whole
  -- rather than picked apart — a field that turns out to matter in six months
  -- is recoverable from here rather than lost for every row already written.
  --
  -- The token is stripped because it is a long-lived shared secret: storing it
  -- per row put a copy in the database, in every backup, and in the output of
  -- any query that selected this column. It has already done its work by the
  -- time a row is written.
  --
  -- Null for a row entered by hand. Ko-fi has no read API, so a delivery missed
  -- while this server was down is gone for good unless it is copied out of
  -- their dashboard — and a row typed in from there honestly has no payload.
  -- NOT NULL here would have meant inventing one, which is worse than an
  -- absence that says what it is:
  --
  --   INSERT INTO donations (kofi_transaction_id, account_id, matched_by,
  --     email, amount_cents, currency, kind, is_recurring, is_public,
  --     received_at)
  --   VALUES ('<from the dashboard>', '<acct_...>', 'manual',
  --     '<their address>', 500, 'USD', 'Donation', 0, 1, unixepoch() * 1000);
  raw          TEXT
);
CREATE INDEX IF NOT EXISTS donations_account ON donations(account_id);

-- Channels are held in memory while live; this is the record written when one
-- ends, for history and to anchor recordings.
-- initiator_id/invitee_id predate channels holding more than two people.
-- They are kept (and written with the initiator and first invitee) because
-- dropping a NOT NULL column means rebuilding the table for no gain; the
-- participants JSON is what is read.
CREATE TABLE IF NOT EXISTS channels (
  id           TEXT PRIMARY KEY,
  initiator_id TEXT NOT NULL REFERENCES accounts(id),
  invitee_id   TEXT NOT NULL REFERENCES accounts(id),
  created_at   INTEGER NOT NULL,
  ended_at     INTEGER,
  ended_reason TEXT,
  -- JSON string[]: everyone in the channel, initiator first.
  participants TEXT,
  -- What the participants called it, if they named it. Null means unnamed.
  name TEXT,
  -- The channel's description, as the Markdown source somebody typed. Null
  -- means nobody has written one.
  description TEXT,
  -- The durable projection of the live ChannelState, as JSON, rewritten on
  -- every transition that changes it. One blob rather than a column per field,
  -- because the reducer owns the shape and grows it freely; normalising would
  -- mean a migration per field for a value only ever read whole, at boot.
  -- Null only on rows that predate persistence, all of which are ended.
  state TEXT,
  -- When its last member deleted it. The row and its recordings survive the
  -- mark by a week so that a mistake is recoverable and the foreign key stays
  -- pointing at something; the sweep is what actually removes them. Distinct
  -- from ended_at, which pre-dates deletion existing.
  deleted_at INTEGER
);

-- Where to reach a person when their app is not running: one row per install
-- per account, keyed by the address Apple gave that install.
--
-- The token is stored in the clear, unlike everything in tokens and
-- otp_codes. It is an address rather than a credential — holding it lets you
-- ask Apple to show that device a notification, and nothing else. Hashing it
-- would only make it unusable, since the whole point is to send it back.
--
-- Keyed on the token rather than on (account, device) because that is what
-- makes re-registration an upsert: one phone signing in as somebody else keeps
-- the same token, and the row has to *move* to the new account. A second row
-- would push one person's conversations to another person's lock screen.
CREATE TABLE IF NOT EXISTS device_tokens (
  token        TEXT PRIMARY KEY,
  account_id   TEXT NOT NULL REFERENCES accounts(id),
  platform     TEXT NOT NULL CHECK (platform IN ('ios', 'android')),
  created_at   INTEGER NOT NULL,
  -- Refreshed on every registration, so a device that has stopped checking in
  -- is distinguishable from one that never existed.
  last_seen_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS device_tokens_account ON device_tokens(account_id);

CREATE TABLE IF NOT EXISTS recordings (
  id           TEXT PRIMARY KEY,
  channel_id   TEXT NOT NULL REFERENCES channels(id),
  initiator_id TEXT NOT NULL,
  invitee_id   TEXT NOT NULL,
  -- JSON string[], as on channels. Membership queries go through json_each.
  participants TEXT,
  started_at   INTEGER NOT NULL,
  duration_ms  INTEGER NOT NULL,
  s3_key       TEXT NOT NULL,
  -- Flat list of every object written, in order. Superseded by stems, which
  -- says whose audio each one is; kept because it is cheap and readable.
  segment_keys TEXT,
  -- JSON { [identity]: string[] }. One isolated stem per participant, because
  -- the floor is applied when the recording is encoded and a mix cannot be
  -- un-mixed. Pausing still splits a stem into segments.
  stems TEXT,
  -- JSON Array<{ identity, fromMs, toMs }>, offsets into the *recorded* audio
  -- rather than wall clock, so paused time is already excluded. This is what
  -- the encoder gates on.
  floor_timeline TEXT,
  -- 'pending', 'ready' or 'unmixed'. The mix is made when the run ends rather
  -- than per request, so that playing and exporting are immediate; until it
  -- exists the recording is shown to nobody, which is what this column is read
  -- for. See RecordingRow.mix_state.
  mix_state TEXT,
  -- Null while the run is still capturing. The row is written when a run
  -- starts and finalized when it ends, which is what lets a run interrupted by
  -- a server restart be recovered — kept, marked failed — instead of leaving
  -- unreferenced audio in the bucket. A null here after a boot means exactly
  -- that, and the registry's restore() finalizes it.
  ended_at INTEGER,
  -- Why the run ended early, when it did not end by anyone's choice.
  failure TEXT,
  -- Set with the channel's, never on its own: a recording belongs to its
  -- channel and is deleted with it. The sweep reads this, and the objects in
  -- the bucket go at the same time.
  deleted_at INTEGER
);
CREATE INDEX IF NOT EXISTS recordings_participants
  ON recordings(initiator_id, invitee_id);

-- What this box actually carried, for the last week and no longer.
--
-- Written so that claims about load stop being reasoned and start being
-- counted: the egress cap of roughly ten simultaneous recorded participants
-- has never been measured against anything, and neither has the sizing
-- argument in planning/MIGRATION.md.
--
-- Nothing reads these tables in code, deliberately. There is no endpoint, no
-- field on the wire and no screen — the queries are in planning/USAGE.md and
-- are run by hand against the box. A number nobody can see cannot quietly
-- start deciding things.
--
-- No foreign key to accounts, and that is the one interesting choice here. A
-- span is evidence about a week, not a fact about a person, and it must not
-- become a reason a row elsewhere cannot be removed; deleteAccount clears
-- these explicitly instead, which is what keeps the privacy page's promise
-- that nothing identifying remains.
CREATE TABLE IF NOT EXISTS usage_spans (
  id           TEXT PRIMARY KEY,
  -- 'mic' | 'listen' | 'playback' | 'egress' | 'pair'
  kind         TEXT NOT NULL,
  -- Null on a channel-level span.
  account_id   TEXT,
  -- The other party: on 'pair' the second person, ordered against account_id
  -- by pairKey; on 'egress' whose stem it is, where account_id is whoever
  -- started the recording. Null on other kinds. See UsageSpanRow.peer_id.
  peer_id      TEXT,
  channel_id   TEXT NOT NULL,
  -- 'egress' only: the run, which is also the recordings row id.
  recording_id TEXT,
  started_at   INTEGER NOT NULL,
  -- Null while open, exactly as recordings.ended_at is, and for the same
  -- reason: a span interrupted by a restart has to be recoverable rather than
  -- silently absent. See UsageSpanRow.
  ended_at     INTEGER,
  -- 'room' | 'state'. See UsageSpanRow.source.
  source       TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS usage_spans_account
  ON usage_spans(account_id, started_at);
CREATE INDEX IF NOT EXISTS usage_spans_kind ON usage_spans(kind, started_at);
CREATE INDEX IF NOT EXISTS usage_spans_ended ON usage_spans(ended_at);

CREATE TABLE IF NOT EXISTS usage_bytes (
  id           TEXT PRIMARY KEY,
  -- 'export' | 'playback-fetch' | 'mix-read' | 'mix-write'
  kind         TEXT NOT NULL,
  account_id   TEXT,
  recording_id TEXT,
  bytes        INTEGER NOT NULL,
  at           INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS usage_bytes_at ON usage_bytes(at);
`;

export type Db = DatabaseSync;

export function openDb(path: string): Db {
  const db = new DatabaseSync(path);
  db.exec('PRAGMA journal_mode = WAL');
  // Before SCHEMA, deliberately: see renameLegacyTables. Foreign keys are off
  // here (the default), which is what keeps the rename out of the enforcement
  // path; they are turned on immediately afterwards.
  renameLegacyTables(db);
  db.exec('PRAGMA foreign_keys = ON');
  db.exec(SCHEMA);
  migrate(db);
  return db;
}

/** Whether a table of this name exists. */
function hasTable(db: Db, name: string): boolean {
  return !!db
    .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?")
    .get(name);
}

function hasColumn(db: Db, table: string, column: string): boolean {
  if (!hasTable(db, table)) return false;
  const columns = db
    .prepare(`PRAGMA table_info(${table})`)
    .all() as Array<{ name: string }>;
  return columns.some((c) => c.name === column);
}

/**
 * Sessions became channels. This renames the tables a pre-existing database
 * still calls by the old names.
 *
 * **It has to run before `SCHEMA`.** Every statement there is
 * `CREATE TABLE IF NOT EXISTS`, so against an un-renamed database it would
 * cheerfully create an empty `channels` table beside the real `sessions` one,
 * after which the rename is impossible and every existing conversation is
 * stranded where nothing will ever look for it.
 *
 * Idempotent, so reopening a database that has already been renamed — or one
 * created fresh under the new names — does nothing.
 */
function renameLegacyTables(db: Db): void {
  if (hasTable(db, 'sessions') && !hasTable(db, 'channels')) {
    db.exec('ALTER TABLE sessions RENAME TO channels');
  }
  if (
    hasColumn(db, 'recordings', 'session_id') &&
    !hasColumn(db, 'recordings', 'channel_id')
  ) {
    db.exec('ALTER TABLE recordings RENAME COLUMN session_id TO channel_id');
  }

  // SQLite rewrites a child's REFERENCES clause when the parent is renamed,
  // so `recordings` should now point at `channels`. Verified against 3.50.4,
  // but asserted rather than assumed: this is the one irreversible step in the
  // migration, and a silent failure here would surface much later as an insert
  // rejected by a foreign key naming a table that no longer exists.
  if (hasTable(db, 'recordings') && hasTable(db, 'channels')) {
    const ddl = db
      .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'recordings'")
      .get() as { sql?: string } | undefined;
    if (ddl?.sql && /REFERENCES\s+"?sessions"?/i.test(ddl.sql)) {
      throw new Error(
        'recordings still references a sessions table after the rename; ' +
          'the database needs rebuilding by hand before this server can run.'
      );
    }
  }
}

/** Additive migrations for databases created before a column existed. */
function migrate(db: Db): void {
  const columns = db
    .prepare('PRAGMA table_info(recordings)')
    .all() as Array<{ name: string }>;
  for (const column of [
    'segment_keys',
    'stems',
    'floor_timeline',
    'participants',
    'participant_names',
    'name',
    'mix_state',
  ]) {
    if (!columns.some((c) => c.name === column)) {
      db.exec(`ALTER TABLE recordings ADD COLUMN ${column} TEXT`);
    }
  }

  const channelColumns = db
    .prepare('PRAGMA table_info(channels)')
    .all() as Array<{ name: string }>;
  for (const column of ['participants', 'name', 'description', 'state']) {
    if (!channelColumns.some((c) => c.name === column)) {
      db.exec(`ALTER TABLE channels ADD COLUMN ${column} TEXT`);
    }
  }

  // Deletion is a mark and a sweep, and the mark is its own column on both
  // tables rather than a reading of `ended_at`. Channels that ended under the
  // old rule — where the last member leaving ended the channel and kept its
  // recordings — are ended and *not* deleted, and inferring one from the other
  // would have the first sweep destroy exactly the recordings that rule
  // promised to keep. Null means "not marked", and every pre-existing row
  // means it.
  for (const [table, columns] of [
    ['channels', channelColumns],
    ['recordings', db.prepare('PRAGMA table_info(recordings)').all() as Array<{ name: string }>],
  ] as const) {
    if (!columns.some((c) => c.name === 'deleted_at')) {
      db.exec(`ALTER TABLE ${table} ADD COLUMN deleted_at INTEGER`);
    }
  }

  // Recording rows written before runs were filed at start were all complete —
  // the old code inserted only finished runs — so they get the end time their
  // duration implies. Gated inside the ADD COLUMN branch, deliberately: run
  // every boot, this UPDATE would stamp a genuinely interrupted run as clean
  // before restore() could mark it failed.
  const recordingColumns = db
    .prepare('PRAGMA table_info(recordings)')
    .all() as Array<{ name: string }>;
  if (!recordingColumns.some((c) => c.name === 'ended_at')) {
    db.exec('ALTER TABLE recordings ADD COLUMN ended_at INTEGER');
    db.exec('ALTER TABLE recordings ADD COLUMN failure TEXT');
    db.exec('UPDATE recordings SET ended_at = started_at + duration_ms');
  }

  const accountColumns = db
    .prepare('PRAGMA table_info(accounts)')
    .all() as Array<{ name: string }>;
  if (!accountColumns.some((c) => c.name === 'bio')) {
    db.exec('ALTER TABLE accounts ADD COLUMN bio TEXT');
  }
  // Left null rather than backfilled from `created_at`: an account made a year
  // ago and used this morning would read as a year idle, which is worse than
  // reading as unknown. Everyone's fills in the next time they connect.
  if (!accountColumns.some((c) => c.name === 'last_seen_at')) {
    db.exec('ALTER TABLE accounts ADD COLUMN last_seen_at INTEGER');
  }
  // Null rather than backfilled with anything, and the null is load-bearing:
  // it is the only way to say "connected from a build that did not say", which
  // is every account until the first build that sends it has spread. Guessing
  // `MIN_SUPPORTED_BUILD` here would manufacture exactly the reassurance this
  // column exists to stop being manufactured.
  if (!accountColumns.some((c) => c.name === 'last_build')) {
    db.exec('ALTER TABLE accounts ADD COLUMN last_build INTEGER');
  }
  // Left null for everyone, which is the value that means "decide from the
  // device". Backfilling it either way would be asserting something about
  // where existing accounts are that nobody has established.
  if (!accountColumns.some((c) => c.name === 'donations_allowed')) {
    db.exec('ALTER TABLE accounts ADD COLUMN donations_allowed INTEGER');
  }

  // Channels from before persistence whose ended_at is null are ghosts: the
  // old server held live channels in memory only, so a null here means the
  // process died with the channel in it, not that the channel is live.
  // Resurrecting one would put a roster nobody remembers back on their home
  // screens. Live channels always carry a state blob — create() writes it —
  // so "no blob" is what distinguishes a ghost, and makes this idempotent.
  db.exec(`UPDATE channels SET ended_at = created_at
           WHERE ended_at IS NULL AND state IS NULL`);

  // Backfill: every row written before the column existed was a two-party
  // channel, so its roster is exactly the legacy columns. Runs before any
  // query, which is what lets membership checks read participants alone.
  db.exec(`UPDATE channels SET participants = json_array(initiator_id, invitee_id)
           WHERE participants IS NULL`);
  db.exec(`UPDATE recordings SET participants = json_array(initiator_id, invitee_id)
           WHERE participants IS NULL`);

  // Every recording that existed before mixes did has no mix and is not going
  // to grow one on its own. 'unmixed' rather than null because null is what a
  // row still capturing holds, and rather than 'pending' because pending means
  // invisible — backfilling that way would hide the whole history behind a
  // queue of work nobody asked for. They export by encoding on demand, exactly
  // as they always have, and the first export or playback of one stores the
  // mix it made.
  //
  // After the ended_at block above, which is what creates that column on a
  // database old enough not to have it. Safe to run every boot: a live run's
  // ended_at is null, and a finished run always has its state set by fileRun.
  db.exec(`UPDATE recordings SET mix_state = 'unmixed'
           WHERE mix_state IS NULL AND ended_at IS NOT NULL`);
}

export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export function newId(prefix: string): string {
  return `${prefix}_${randomBytes(9).toString('base64url')}`;
}

/**
 * SQLITE_CONSTRAINT_PRIMARYKEY — the row's primary key is already taken.
 *
 * The extended result code is the only reliable discriminator. SQLite reports
 * *every* uniqueness failure with the message "UNIQUE constraint failed: …",
 * so a primary-key collision and a genuine duplicate (a second signup on one
 * email address) are indistinguishable by text. They differ only here:
 * SQLITE_CONSTRAINT_UNIQUE is 2067 and must never be retried, because a fresh
 * key does nothing about the column that actually clashed.
 */
const SQLITE_CONSTRAINT_PRIMARYKEY = 1555;

function isPrimaryKeyCollision(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { errcode?: unknown }).errcode === SQLITE_CONSTRAINT_PRIMARYKEY
  );
}

/**
 * How many keys to try before giving up.
 *
 * A generated key carries 72 bits, so one collision is already beyond
 * plausible and five in a row cannot happen by chance. The cap exists so that
 * a mistake which makes collisions *systematic* — a duplicated RNG seed after
 * a VM snapshot, a mint function that stops varying — fails loudly in
 * milliseconds instead of spinning forever.
 */
const KEY_ATTEMPTS = 5;

/**
 * Inserts a row whose primary key is randomly generated, minting a new key and
 * trying again if that key is somehow already present. Returns the key that
 * succeeded.
 *
 * `insert` must do the insert and nothing else. Anything the caller does with
 * the new key — reading the row back, resolving invitations — belongs after
 * this returns, or a retry would run it more than once.
 *
 * Only a primary-key collision is retried. Every other failure, including a
 * uniqueness violation on some other column and any foreign-key error,
 * propagates unchanged on the first attempt.
 */
export function insertWithUniqueKey<T>(
  mint: () => T,
  insert: (key: T) => void
): T {
  for (let attempt = 1; ; attempt += 1) {
    const key = mint();
    try {
      insert(key);
      return key;
    } catch (error) {
      if (attempt >= KEY_ATTEMPTS || !isPrimaryKeyCollision(error)) throw error;
    }
  }
}

/** Canonical ordering so a pair has one row whichever way round it is asked. */
export function pairKey(x: string, y: string): [string, string] {
  return x < y ? [x, y] : [y, x];
}
