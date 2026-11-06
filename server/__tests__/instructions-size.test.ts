/**
 * CLAUDE.md stays within the cap every project shares.
 *
 * The check is `ts instructions check`, technosophia's shared script, and this
 * is a thin wrapper around it for the reason planning-filenames.test.ts gives:
 * the cap lives in one place. It lives in the server's suite for the same
 * reason too, and runs the script by path, `$TECHNOSOPHIA` or
 * ~/src/technosophia.
 */
import { execFileSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';

const repoRoot = path.resolve(__dirname, '../..');
const technosophia =
  process.env.TECHNOSOPHIA ?? path.join(os.homedir(), 'src', 'technosophia');

describe('CLAUDE.md', () => {
  it('is within the cap, per ts instructions check', () => {
    try {
      execFileSync(path.join(technosophia, 'bin/instructions'), ['check'], {
        cwd: repoRoot,
        env: { ...process.env, TS_ROOT: repoRoot },
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch (err) {
      const e = err as { stdout?: string; stderr?: string };
      throw new Error(
        `ts instructions check failed:\n${e.stderr ?? ''}${e.stdout ?? ''}`.trimEnd(),
      );
    }
  });
});
