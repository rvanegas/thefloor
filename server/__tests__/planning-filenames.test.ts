/**
 * planning/ keeps its filenames in step with its headings.
 *
 * The check itself is `ts note check`, technosophia's shared script, and this
 * file is deliberately a thin wrapper around it rather than a
 * reimplementation: the slug rule has to exist in exactly one place or the
 * tool and the test drift apart — a lagging source of truth authorises the
 * wrong thing. It runs the script by path, `$TECHNOSOPHIA` or
 * ~/src/technosophia, since a test does not rely on PATH.
 *
 * **Why it lives in the server's suite, which it has nothing to do with.**
 * `core/` forbids I/O and imports outside itself, enforced by
 * `core/__tests__/purity.test.ts`, so it cannot host this. The honest home is
 * a root-level suite for repo hygiene, which does not exist and would cost a
 * jest project to create. This is the compromise, and it is the reason the
 * file is named for what it checks rather than for anything in `server/`.
 *
 * What it buys: `ts deploy` runs the tests before it ships anything, so a
 * task file whose heading and name disagree, or a bare pointer to the deleted
 * `planning/TASKS.md`, fails the deploy rather than being found by the next
 * person to go looking for an entry that does not resolve.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const repoRoot = path.resolve(__dirname, '../..');
const technosophia =
  process.env.TECHNOSOPHIA ?? path.join(os.homedir(), 'src', 'technosophia');

describe('planning/ filenames', () => {
  it('agree with their headings, per ts note check', () => {
    let out = '';
    try {
      out = execFileSync(path.join(technosophia, 'bin/note'), ['check'], {
        cwd: repoRoot,
        env: { ...process.env, TS_ROOT: repoRoot },
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch (err) {
      const e = err as { stdout?: string; stderr?: string };
      // The script says which file and what it wanted; pass that through
      // rather than a bare non-zero exit, which would send somebody reading
      // bash to find out what broke.
      throw new Error(
        `ts note check failed:\n${e.stderr ?? ''}${e.stdout ?? ''}`.trimEnd(),
      );
    }
    expect(out).toContain('every task and backlog filename is its heading');
  });

  // A pointer to a file that no longer exists is a dead end rather than a
  // citation. The 2026-09-14 split left the titled ones (`TASKS.md § *Title*`)
  // alone deliberately, since `ts note find` resolves them, so only a bare path
  // is a fault. bin/restore-mtimes is exempt: it names the old files as paths
  // *in history*, reading them at the commit before the split.
  it('has no bare pointer to the pre-split TASKS.md or BACKLOG.md in the code', () => {
    const bare = /planning\/(TASKS|BACKLOG)\.md/;
    const offenders: string[] = [];
    const walk = (dir: string): void => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
        const p = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(p);
        else if (p !== path.join(repoRoot, 'bin', 'restore-mtimes')) {
          fs.readFileSync(p, 'utf8')
            .split('\n')
            .forEach((line, i) => {
              if (bare.test(line) && !line.includes('§')) {
                offenders.push(`${path.relative(repoRoot, p)}:${i + 1}`);
              }
            });
        }
      }
    };
    for (const dir of ['bin', 'app/src', 'server/src', 'core']) {
      walk(path.join(repoRoot, dir));
    }
    expect(offenders).toEqual([]);
  });
});
