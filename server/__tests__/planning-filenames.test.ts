/**
 * planning/ keeps its filenames in step with its headings.
 *
 * The check itself is `bin/note check`, and this file is deliberately a
 * two-line wrapper around it rather than a reimplementation: the slug rule has
 * to exist in exactly one place or the tool and the test drift apart, which is
 * the failure AGENTS.md names for the glossary — a lagging source of truth
 * authorises the wrong thing.
 *
 * **Why it lives in the server's suite, which it has nothing to do with.**
 * `core/` forbids I/O and imports outside itself, enforced by
 * `core/__tests__/purity.test.ts`, so it cannot host this. The honest home is
 * a root-level suite for repo hygiene, which does not exist and would cost a
 * jest project to create. This is the compromise, and it is the reason the
 * file is named for what it checks rather than for anything in `server/`.
 *
 * What it buys: `bin/deploy` runs the tests before it ships anything, so a
 * task file whose heading and name disagree, or a bare pointer to the deleted
 * `planning/TASKS.md`, fails the deploy rather than being found by the next
 * person to go looking for an entry that does not resolve.
 */
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const repoRoot = path.resolve(__dirname, '../..');

describe('planning/ filenames', () => {
  it('agree with their headings, per bin/note check', () => {
    let out = '';
    try {
      out = execFileSync(path.join(repoRoot, 'bin/note'), ['check'], {
        cwd: repoRoot,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch (err) {
      const e = err as { stdout?: string; stderr?: string };
      // The script says which file and what it wanted; pass that through
      // rather than a bare non-zero exit, which would send somebody reading
      // bash to find out what broke.
      throw new Error(
        `bin/note check failed:\n${e.stderr ?? ''}${e.stdout ?? ''}`.trimEnd(),
      );
    }
    expect(out).toContain('every task and backlog filename is its heading');
  });
});
