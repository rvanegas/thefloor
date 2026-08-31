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
  const insert = db.prepare(
    'INSERT INTO accounts (id, identifier, display_name, created_at) VALUES (?,?,?,?)'
  );
  insert.run('acct_a', 'a@example.com', 'A', 1);
  insert.run('acct_b', 'b@example.com', 'B', 1);
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

it('gives historical recordings an end time', () => {
  // `ended_at` distinguishes a finished recording from one still capturing,
  // and the boot sweep finalizes everything null. Rows written before the
  // column existed were all complete — the old code inserted a recording only
  // once it had finished — so without this backfill the first boot after the
  // upgrade would adopt every recording ever made as interrupted and stamp a
  // failure on it.
  const path = join(dir, 'ended.db');
  const old = new DatabaseSync(path);
  old.exec(ORIGINAL);
  seedAccounts(old);
  old
    .prepare(
      'INSERT INTO sessions (id, initiator_id, invitee_id, created_at, ended_at) VALUES (?,?,?,?,?)'
    )
    .run('sess_1', 'acct_a', 'acct_b', 1, 2);
  old
    .prepare(
      `INSERT INTO recordings
       (id, session_id, initiator_id, invitee_id, started_at, duration_ms, s3_key)
       VALUES (?,?,?,?,?,?,?)`
    )
    .run('rec_1', 'sess_1', 'acct_a', 'acct_b', 1_000, 5_000, 'k');
  old.close();

  const db = openDb(path);
  const row = db
    .prepare('SELECT ended_at, failure FROM recordings WHERE id = ?')
    .get('rec_1') as { ended_at: number; failure: string | null };
  expect(row.ended_at).toBe(6_000);
  expect(row.failure).toBeNull();
  db.close();
});

it('closes a channel left open by a server that predates persistence', () => {
  // Before channels were persisted, a live one lived in memory alone, so a row
  // with no end time meant the process had died holding it — not that the
  // channel was still going. Under the new rules that same row reads as live
  // and would be revived, putting a roster nobody remembers back on their home
  // screens. A live row always carries a state blob, so its absence is what
  // identifies the ghosts, and that also makes this safe to run on every boot.
  const path = join(dir, 'ghost.db');
  const old = new DatabaseSync(path);
  old.exec(BEFORE_RENAME);
  seedAccounts(old);
  old
    .prepare(
      `INSERT INTO sessions (id, initiator_id, invitee_id, created_at, ended_at, participants)
       VALUES (?,?,?,?,NULL,?)`
    )
    .run('sess_live', 'acct_a', 'acct_b', 4_000, JSON.stringify(['acct_a', 'acct_b']));
  old.close();

  const db = openDb(path);
  const row = db
    .prepare('SELECT ended_at FROM channels WHERE id = ?')
    .get('sess_live') as { ended_at: number | null };
  expect(row.ended_at).toBe(4_000);
  db.close();
});

it('is idempotent across reopenings', () => {
  const path = join(dir, 'new.db');
  const first = openDb(path);
  first
    .prepare(
      'INSERT INTO accounts (id, identifier, display_name, created_at) VALUES (?,?,?,?)'
    )
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

/**
 * The `debug` column, added 2026-08-21 for the audio diagnostic panel.
 *
 * The live database already exists, so `CREATE TABLE IF NOT EXISTS` never runs
 * against it and the `ALTER TABLE` is the only thing that puts this column on
 * the box. A column that arrives only on a fresh database is one that works
 * everywhere except in production.
 */
it('adds the debug column to a database that predates it', () => {
  const path = join(dir, 'debug.db');
  const old = new DatabaseSync(path);
  old.exec(BEFORE_RENAME);
  seedAccounts(old);
  old.close();

  const db = openDb(path);
  const columns = (
    db.prepare('PRAGMA table_info(accounts)').all() as Array<{ name: string }>
  ).map((c) => c.name);
  expect(columns).toContain('debug');

  // Null for everyone, which is the value that means no panel. Backfilling it
  // either way would be turning a diagnostic on for accounts nobody chose.
  const row = db
    .prepare('SELECT debug FROM accounts WHERE id = ?')
    .get('acct_a') as { debug: number | null };
  expect(row.debug).toBeNull();
  db.close();
});

it('drops the bio column from a database that has one', () => {
  // The column was added by this same migration pass from 2026-08-23 until
  // 2026-08-31, so every live database has one with people's prose in it. It
  // goes rather than being left in place and ignored: nothing can show, edit
  // or delete an unreachable field, which is the state account deletion
  // exists to make impossible.
  const path = join(dir, 'bio.db');
  const old = new DatabaseSync(path);
  old.exec(BEFORE_RENAME);
  seedAccounts(old);
  old.exec('ALTER TABLE accounts ADD COLUMN bio TEXT');
  old
    .prepare('UPDATE accounts SET bio = ? WHERE id = ?')
    .run('Cellist. **Bach** mostly.', 'acct_a');
  old.close();

  const db = openDb(path);
  const columns = (
    db.prepare('PRAGMA table_info(accounts)').all() as Array<{ name: string }>
  ).map((c) => c.name);
  expect(columns).not.toContain('bio');
  // The rest of the row is untouched, a dropped column being the only loss.
  const row = db
    .prepare('SELECT display_name FROM accounts WHERE id = ?')
    .get('acct_a') as { display_name: string };
  expect(row.display_name).toBeDefined();
  db.close();

  // And a second open finds no column to drop, which is the guard working.
  const again = openDb(path);
  expect(
    (
      again.prepare('PRAGMA table_info(accounts)').all() as Array<{
        name: string;
      }>
    ).map((c) => c.name)
  ).not.toContain('bio');
  again.close();
});

/**
 * A database as the box held it on 2026-08-24, the moment before sessions
 * learned to say when they were last heard from and what build they are.
 *
 * `accounts` already carries both facts — one row per person, which is all
 * anybody needed while one session per account was enforced — and `tokens`
 * carries neither.
 */
const BEFORE_SESSION_STAMPS = `
CREATE TABLE accounts (
  id           TEXT PRIMARY KEY,
  identifier   TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  created_at   INTEGER NOT NULL,
  last_seen_at INTEGER,
  last_build   INTEGER
);
CREATE TABLE tokens (
  token_hash TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(id),
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
`;

function seedSessions(db: DatabaseSync): void {
  const account = db.prepare(
    `INSERT INTO accounts (id, identifier, display_name, created_at, last_seen_at, last_build)
     VALUES (?,?,?,?,?,?)`
  );
  account.run('acct_old', 'old@example.com', 'Old', 1, 1_000, 56);
  account.run('acct_new', 'new@example.com', 'New', 1, 2_000, 86);
  // Never held a socket, so there is nothing to say about it and nothing to
  // copy down.
  account.run('acct_quiet', 'quiet@example.com', 'Quiet', 1, null, null);

  const token = db.prepare(
    'INSERT INTO tokens (token_hash, account_id, created_at, expires_at) VALUES (?,?,?,?)'
  );
  token.run('hash_old', 'acct_old', 1, 9_000_000);
  token.run('hash_new', 'acct_new', 1, 9_000_000);
  token.run('hash_quiet', 'acct_quiet', 1, 9_000_000);
}

const sessionRow = (db: ReturnType<typeof openDb>, hash: string) =>
  db
    .prepare('SELECT last_seen_at, last_build FROM tokens WHERE token_hash = ?')
    .get(hash) as { last_seen_at: number | null; last_build: number | null };

/**
 * The build census moved from accounts to sessions on 2026-08-24, and adding
 * the two columns null emptied it: `/healthz` went from `oldestBuild: 56` to
 * `oldestBuild: null` on the deploy, with nine unstamped rows behind it.
 *
 * Null is loud, and nobody raises a compatibility floor on a null. What is not
 * loud is the recovery — sessions stamp themselves as their clients reconnect,
 * so while that is happening `oldestBuild` is the minimum over whichever
 * phones have opened the app since, which reads like a measurement and is
 * biased *upwards*. Upwards is the direction that strands installs. And an
 * unstamped session is in neither `oldestBuild` nor `silentBuilds`, so the
 * guard rail built to stop the first being trusted reads zero throughout.
 *
 * The backfill is exact rather than approximate, which is what makes it
 * legitimate: one session per account was enforced until that same day, so an
 * account's answer *is* its only session's answer.
 */
it('gives a session that predates the columns its account’s answer', () => {
  const path = join(dir, 'sessions.db');
  const old = new DatabaseSync(path);
  old.exec(BEFORE_SESSION_STAMPS);
  seedSessions(old);
  old.close();

  const db = openDb(path);

  expect(sessionRow(db, 'hash_old')).toEqual({
    last_seen_at: 1_000,
    last_build: 56,
  });
  expect(sessionRow(db, 'hash_new')).toEqual({
    last_seen_at: 2_000,
    last_build: 86,
  });
  // Nothing to say, so nothing is said — this session stays out of the census
  // exactly as its account did.
  expect(sessionRow(db, 'hash_quiet')).toEqual({
    last_seen_at: null,
    last_build: null,
  });
  db.close();
});

/**
 * The backfill speaks only for sessions that have not spoken for themselves.
 * A session stamped since is the better evidence — it is the device reporting
 * its own build, where the account column is whichever device wrote last.
 */
it('does not overwrite a session that has since been heard from', () => {
  const path = join(dir, 'sessions-live.db');
  const old = new DatabaseSync(path);
  old.exec(BEFORE_SESSION_STAMPS);
  seedSessions(old);
  old.close();

  const first = openDb(path);
  first
    .prepare('UPDATE tokens SET last_seen_at = ?, last_build = ? WHERE token_hash = ?')
    .run(5_000, 90, 'hash_old');
  first.close();

  // Reopening runs every migration again, which is the case this is about.
  const db = openDb(path);
  expect(sessionRow(db, 'hash_old')).toEqual({
    last_seen_at: 5_000,
    last_build: 90,
  });
  db.close();
});
