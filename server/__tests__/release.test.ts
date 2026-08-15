import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildApp, type App } from '../src/app';
import { deployed, MIN_SUPPORTED_BUILD } from '../src/release';

/**
 * What the box says it is. The point of all of this is that a running server
 * can be asked which revision it is, so the tests are about the answer being
 * present and honest rather than about any particular value.
 */
describe('release identity', () => {
  let app: App;

  beforeEach(() => {
    app = buildApp();
  });

  afterEach(async () => {
    await app.fastify.close();
  });

  it('reports the compatibility floor and an unknown commit from a checkout', async () => {
    const health = await app.fastify.inject({ method: 'GET', url: '/healthz' });
    const body = health.json();

    expect(body.ok).toBe(true);
    expect(body.minBuild).toBe(MIN_SUPPORTED_BUILD);
    // Asserted as present rather than as 'unknown'. bin/deploy writes
    // deployed.json into this package on its way past and removes it again, so
    // an interrupted deploy can leave one behind and a test that demanded
    // 'unknown' would fail for a reason having nothing to do with the code.
    expect(typeof body.commit).toBe('string');
    expect(body.commit).not.toHaveLength(0);
  });

  it('reads what bin/deploy stamped, and survives there being nothing to read', () => {
    const dir = mkdtempSync(join(tmpdir(), 'thefloor-release-'));
    const cwd = process.cwd();
    try {
      process.chdir(dir);
      expect(deployed()).toBeNull();

      writeFileSync(
        join(dir, 'deployed.json'),
        JSON.stringify({
          commit: 'abc1234-dirty',
          branch: 'master',
          at: '2026-08-15T00:00:00Z',
        })
      );
      expect(deployed()?.commit).toBe('abc1234-dirty');

      // Garbage is the same as absent rather than a crash on boot: this is
      // read on the startup path, and a server that will not start because a
      // provenance file is malformed has traded a real thing for a label.
      writeFileSync(join(dir, 'deployed.json'), 'not json');
      expect(deployed()).toBeNull();
    } finally {
      process.chdir(cwd);
      rmSync(dir, { recursive: true, force: true });
    }
  });

  /**
   * The floor is compared against iOS build numbers, which only ever rise and
   * are integers. A float or a string would be a comparison that silently does
   * the wrong thing at exactly one value.
   */
  it('keeps the floor an integer', () => {
    expect(Number.isInteger(MIN_SUPPORTED_BUILD)).toBe(true);
  });
});
