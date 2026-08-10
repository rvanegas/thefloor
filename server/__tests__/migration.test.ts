import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { openDb } from '../src/db';

/**
 * The schema canary. Every fixture here is a database as some earlier version
 * of this server actually wrote it, and the assertions are what must still be
 * true after `openDb` has had its way with it.
 *
 * Two migrations are in play and they compose in one direction only: rosters
 * were backfilled when channels grew past two people, and then sessions were
 * renamed to channels. The middle fixture is the important one — it is the
 * shape of the deployed database, and neither end of the range covers it.
 */

/** The original two-party schema: no rosters, and sessions are sessions. */
const ORIGINAL = `
CREATE TABLE accounts (
  id           TEXT PRIMARY KEY,
  identifier   TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  created_at   INTEGER NOT NULL
);
CREATE TABLE sessions (
  id           TEXT PRIMARY KEY,
  initiator_id TEXT NOT NULL REFERENCES accounts(id),
  invitee_id   TEXT NOT NULL REFERENCES accounts(id),
  created_at   INTEGER NOT NULL,
  ended_at     INTEGER,
  ended_reason TEXT
);
CREATE TABLE recordings (
  id           TEXT PRIMARY KEY,
  session_id   TEXT NOT NULL REFERENCES sessions(id),
  initiator_id TEXT NOT NULL,
  invitee_id   TEXT NOT NULL,
  started_at   INTEGER NOT NULL,
  duration_ms  INTEGER NOT NULL,
  s3_key       TEXT NOT NULL,
  segment_keys TEXT,
  stems TEXT,
  floor_timeline TEXT
);
`;

/** What is deployed today: rosters and names, still called sessions. */
const BEFORE_RENAME = `
CREATE TABLE accounts (
  id           TEXT PRIMARY KEY,
  identifier   TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  created_at   INTEGER NOT NULL
);
CREATE TABLE sessions (
  id           TEXT PRIMARY KEY,
  initiator_id TEXT NOT NULL REFERENCES accounts(id),
  invitee_id   TEXT NOT NULL REFERENCES accounts(id),
  created_at   INTEGER NOT NULL,
  ended_at     INTEGER,
  ended_reason TEXT,
  participants TEXT,
  name         TEXT
);
CREATE TABLE recordings (
  id           TEXT PRIMARY KEY,
  session_id   TEXT NOT NULL REFERENCES sessions(id),
  initiator_id TEXT NOT NULL,
  invitee_id   TEXT NOT NULL,
  participants TEXT,
  started_at   INTEGER NOT NULL,
  duration_ms  INTEGER NOT NULL,
  s3_key       TEXT NOT NULL,
  segment_keys TEXT,
  stems TEXT,
  floor_timeline TEXT
);
`;

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'thefloor-migration-'));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

function seedAccounts(db: DatabaseSync): void {
  db.prepare('INSERT INTO accounts VALUES (?,?,?,?)').run(
    'acct_a',
    'a@example.com',
    'A',
    1
  );
  db.prepare('INSERT INTO accounts VALUES (?,?,?,?)').run(
    'acct_b',
    'b@example.com',
    'B',
    1
  );
}

function tableNames(db: DatabaseSync): string[] {
  return (
    db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
      .all() as Array<{ name: string }>
  ).map((row) => row.name);
}

it('renames the original schema and backfills rosters in one pass', () => {
  const path = join(dir, 'original.db');
  const old = new DatabaseSync(path);
  old.exec(ORIGINAL);
  seedAccounts(old);
  old
    .prepare(
      'INSERT INTO sessions (id, initiator_id, invitee_id, created_at) VALUES (?,?,?,?)'
    )
    .run('sess_1', 'acct_a', 'acct_b', 1);
  old
    .prepare(
      `INSERT INTO recordings
       (id, session_id, initiator_id, invitee_id, started_at, duration_ms, s3_key, stems)
       VALUES (?,?,?,?,?,?,?,?)`
    )
    .run('rec_1', 'sess_1', 'acct_a', 'acct_b', 1, 5_000, 'k', JSON.stringify({ acct_a: ['k'] }));
  old.close();

  const db = openDb(path);

  const tables = tableNames(db);
  expect(tables).toContain('channels');
  expect(tables).not.toContain('sessions');

  // The id is untouched. Historical S3 keys embed it, so rewriting it would
  // orphan real audio — the prefix is a minting convention, nothing reads it.
  const channel = db
    .prepare('SELECT id, participants FROM channels WHERE id = ?')
    .get('sess_1') as { id: string; participants: string };
  expect(channel.id).toBe('sess_1');
  expect(JSON.parse(channel.participants)).toEqual(['acct_a', 'acct_b']);

  const recording = db
    .prepare('SELECT channel_id, participants FROM recordings WHERE id = ?')
    .get('rec_1') as { channel_id: string; participants: string };
  expect(recording.channel_id).toBe('sess_1');
  expect(JSON.parse(recording.participants)).toEqual(['acct_a', 'acct_b']);

  // Membership through json_each finds the backfilled rows for both parties.
  for (const id of ['acct_a', 'acct_b']) {
    const rows = db
      .prepare(
        `SELECT id FROM recordings
         WHERE EXISTS (SELECT 1 FROM json_each(recordings.participants)
                       WHERE json_each.value = ?)`
      )
      .all(id);
    expect(rows).toEqual([{ id: 'rec_1' }]);
  }
  db.close();
});

it('repoints the recordings foreign key at channels', () => {
  const path = join(dir, 'fk.db');
  const old = new DatabaseSync(path);
  old.exec(ORIGINAL);
  seedAccounts(old);
  old.close();

  const db = openDb(path);
  const ddl = db
    .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'recordings'")
    .get() as { sql: string };
  expect(ddl.sql).toMatch(/REFERENCES\s+"?channels"?/i);
  expect(ddl.sql).not.toMatch(/REFERENCES\s+"?sessions"?/i);

  // And it is still enforced, rather than merely renamed.
  expect(() =>
    db
      .prepare(
        `INSERT INTO recordings (id, channel_id, initiator_id, invitee_id,
         started_at, duration_ms, s3_key) VALUES (?,?,?,?,?,?,?)`
      )
      .run('rec_x', 'chan_missing', 'acct_a', 'acct_b', 1, 1, 'k')
  ).toThrow(/FOREIGN KEY/i);
  db.close();
});

it('migrates the deployed schema without disturbing rosters or names', () => {
  const path = join(dir, 'deployed.db');
  const old = new DatabaseSync(path);
  old.exec(BEFORE_RENAME);
  seedAccounts(old);
  old
    .prepare(
      `INSERT INTO sessions (id, initiator_id, invitee_id, created_at, participants, name)
       VALUES (?,?,?,?,?,?)`
    )
    .run(
      'sess_1',
      'acct_a',
      'acct_b',
      1,
      JSON.stringify(['acct_a', 'acct_b', 'acct_c']),
      'Book club'
    );
  old.close();

  const db = openDb(path);
  const row = db
    .prepare('SELECT participants, name FROM channels WHERE id = ?')
    .get('sess_1') as { participants: string; name: string };
  // A three-person roster must survive: the backfill would flatten it to two.
  expect(JSON.parse(row.participants)).toEqual(['acct_a', 'acct_b', 'acct_c']);
  expect(row.name).toBe('Book club');
  expect(tableNames(db)).not.toContain('sessions');
  db.close();
});

it('is idempotent across reopenings', () => {
  const path = join(dir, 'new.db');
  const first = openDb(path);
  first
    .prepare('INSERT INTO accounts VALUES (?,?,?,?)')
    .run('acct_a', 'a@example.com', 'A', 1);
  first
    .prepare(
      `INSERT INTO channels (id, initiator_id, invitee_id, created_at, participants)
       VALUES (?,?,?,?,?)`
    )
    .run('chan_1', 'acct_a', 'acct_a', 1, JSON.stringify(['acct_a', 'acct_b', 'acct_c']));
  first.close();

  // Reopening must not overwrite a roster that is already the truth.
  const second = openDb(path);
  const row = second
    .prepare('SELECT participants FROM channels WHERE id = ?')
    .get('chan_1') as { participants: string };
  expect(JSON.parse(row.participants)).toEqual(['acct_a', 'acct_b', 'acct_c']);
  expect(tableNames(second)).not.toContain('sessions');
  second.close();
});
