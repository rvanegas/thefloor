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
}

export interface ContactRow {
  a_id: string;
  b_id: string;
  state: 'pending' | 'accepted';
  requester_id: string;
  created_at: number;
}

export interface RecordingRow {
  id: string;
  session_id: string;
  initiator_id: string;
  invitee_id: string;
  started_at: number;
  duration_ms: number;
  s3_key: string;
  segment_keys: string | null;
  /** JSON: { [identity]: string[] } — each participant's segments, in order. */
  stems: string | null;
  /** JSON: Array<{ identity, fromMs, toMs }> — when each party was silenced. */
  floor_timeline: string | null;
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS accounts (
  id           TEXT PRIMARY KEY,
  identifier   TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  created_at   INTEGER NOT NULL
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

-- Sessions are held in memory while live; this is the record written when one
-- ends, for history and to anchor recordings.
CREATE TABLE IF NOT EXISTS sessions (
  id           TEXT PRIMARY KEY,
  initiator_id TEXT NOT NULL REFERENCES accounts(id),
  invitee_id   TEXT NOT NULL REFERENCES accounts(id),
  created_at   INTEGER NOT NULL,
  ended_at     INTEGER,
  ended_reason TEXT
);

CREATE TABLE IF NOT EXISTS recordings (
  id           TEXT PRIMARY KEY,
  session_id   TEXT NOT NULL REFERENCES sessions(id),
  initiator_id TEXT NOT NULL,
  invitee_id   TEXT NOT NULL,
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
  floor_timeline TEXT
);
CREATE INDEX IF NOT EXISTS recordings_participants
  ON recordings(initiator_id, invitee_id);
`;

export type Db = DatabaseSync;

export function openDb(path: string): Db {
  const db = new DatabaseSync(path);
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA foreign_keys = ON');
  db.exec(SCHEMA);
  migrate(db);
  return db;
}

/** Additive migrations for databases created before a column existed. */
function migrate(db: Db): void {
  const columns = db
    .prepare('PRAGMA table_info(recordings)')
    .all() as Array<{ name: string }>;
  for (const column of ['segment_keys', 'stems', 'floor_timeline']) {
    if (!columns.some((c) => c.name === column)) {
      db.exec(`ALTER TABLE recordings ADD COLUMN ${column} TEXT`);
    }
  }
}

export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export function newId(prefix: string): string {
  return `${prefix}_${randomBytes(9).toString('base64url')}`;
}

/** Canonical ordering so a pair has one row whichever way round it is asked. */
export function pairKey(x: string, y: string): [string, string] {
  return x < y ? [x, y] : [y, x];
}
