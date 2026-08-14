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
  /** Null while the run is still capturing; restore() finalizes strays. */
  ended_at: number | null;
  /** Why the run ended early, when it did not end by anyone's choice. */
  failure: string | null;
  /** When its channel was deleted. Null until then; the sweep reads it. */
  deleted_at: number | null;
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
  last_seen_at INTEGER
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
