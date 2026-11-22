import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { AuthClient } from '../src/auth';
import { openDb } from '../src/db';
import { Unlimited } from '../src/unlimited';

/**
 * Who is unlimited is auth's mark since 2026-11-22: The Floor asks for it,
 * keeps the last answer, and dropped the column it kept by hand.
 */

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'unlimited-'));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

it('asks auth with its own token and reads the user names, lowercase', async () => {
  const asked: Array<{ url: string; authorization?: string }> = [];
  const auth = new AuthClient({
    origin: 'https://auth.example',
    clientId: 'thefloor',
    clientSecret: 'client-secret',
    fetch: (async (input: unknown, init?: { headers?: Record<string, string> }) => {
      const url = String(input);
      asked.push({ url, authorization: init?.headers?.Authorization });
      if (url.endsWith('/token')) return Response.json({ access_token: 'own', expires_in: 900 });
      return Response.json({ users: ['Beth', 'liliana'] });
    }) as typeof fetch,
  });
  expect(await auth.unlimited()).toEqual(['beth', 'liliana']);
  expect(asked[1]).toEqual({ url: 'https://auth.example/unlimited', authorization: 'Bearer own' });
});

it('keeps auth’s last answer, whole, and keeps it when auth cannot be asked', async () => {
  const db = openDb(join(dir, 'floor.db'));
  const unlimited = new Unlimited(db);
  expect(unlimited.has('beth')).toBe(false);
  expect(await unlimited.refresh(async () => ['beth', 'erta'])).toBe(true);
  expect(unlimited.has('Beth')).toBe(true);
  expect(await unlimited.refresh(async () => ['erta'])).toBe(true);
  expect(unlimited.has('beth')).toBe(false);
  expect(await unlimited.refresh(async () => Promise.reject(new Error('auth is down')))).toBe(false);
  expect(unlimited.has('erta')).toBe(true);
  expect(unlimited.has(null)).toBe(false);
  db.close();
});

it('seeds the copy from the column it replaces, and drops the column', () => {
  const path = join(dir, 'floor.db');
  const old = new DatabaseSync(path);
  old.exec(`
    CREATE TABLE accounts (
      id TEXT PRIMARY KEY, identifier TEXT NOT NULL UNIQUE, display_name TEXT NOT NULL,
      created_at INTEGER NOT NULL, username TEXT, transcripts_unlimited INTEGER
    );
    INSERT INTO accounts VALUES ('acct_b', 'b@example.com', 'Beth', 1, 'beth', 1);
    INSERT INTO accounts VALUES ('acct_c', 'c@example.com', 'Cy', 1, 'cy', NULL);
    INSERT INTO accounts VALUES ('acct_n', 'n@example.com', 'No name', 1, NULL, 1);
  `);
  old.close();
  const db = openDb(path);
  const columns = (db.prepare('PRAGMA table_info(accounts)').all() as Array<{ name: string }>).map((c) => c.name);
  expect(columns).not.toContain('transcripts_unlimited');
  expect(db.prepare('SELECT username FROM unlimited').all()).toEqual([{ username: 'beth' }]);
  db.close();
});
