import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { openDb } from '../src/db';

/**
 * A database written before sessions could hold more than two people must come
 * up with every row's roster backfilled, because membership checks — the
 * recordings list, export authorisation — now read the participants JSON alone.
 */

const OLD_SCHEMA = `
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

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'thefloor-migration-'));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

it('backfills participants for pre-existing sessions and recordings', () => {
  const path = join(dir, 'old.db');
  const old = new DatabaseSync(path);
  old.exec(OLD_SCHEMA);
  old
    .prepare('INSERT INTO accounts VALUES (?,?,?,?)')
    .run('acct_a', 'a@example.com', 'A', 1);
  old
    .prepare('INSERT INTO accounts VALUES (?,?,?,?)')
    .run('acct_b', 'b@example.com', 'B', 1);
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
    .run(
      'rec_1',
      'sess_1',
      'acct_a',
      'acct_b',
      1,
      5_000,
      'k',
      JSON.stringify({ acct_a: ['k'] })
    );
  old.close();

  const db = openDb(path);
  const session = db
    .prepare('SELECT participants FROM sessions WHERE id = ?')
    .get('sess_1') as { participants: string };
  expect(JSON.parse(session.participants)).toEqual(['acct_a', 'acct_b']);

  const recording = db
    .prepare('SELECT participants FROM recordings WHERE id = ?')
    .get('rec_1') as { participants: string };
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

it('is idempotent across reopenings', () => {
  const path = join(dir, 'new.db');
  const first = openDb(path);
  first
    .prepare('INSERT INTO accounts VALUES (?,?,?,?)')
    .run('acct_a', 'a@example.com', 'A', 1);
  first
    .prepare(
      `INSERT INTO sessions (id, initiator_id, invitee_id, created_at, participants)
       VALUES (?,?,?,?,?)`
    )
    .run('sess_1', 'acct_a', 'acct_a', 1, JSON.stringify(['acct_a', 'acct_b', 'acct_c']));
  first.close();

  // Reopening must not overwrite a roster that is already the truth.
  const second = openDb(path);
  const row = second
    .prepare('SELECT participants FROM sessions WHERE id = ?')
    .get('sess_1') as { participants: string };
  expect(JSON.parse(row.participants)).toEqual(['acct_a', 'acct_b', 'acct_c']);
  second.close();
});
