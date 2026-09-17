import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildApp, type App } from '../src/app';

/**
 * The train's own front door, with and without the trailing slash.
 *
 * `/app/` was a 403 from the first web deploy until 2026-09-16, and the
 * reason is entirely inside `@fastify/static`: the root is a real directory,
 * so `@fastify/send` tries to redirect to the slashed form, finds the slash
 * already there and refuses. The shell is registered as the *not-found*
 * handler of the scope, and a 403 is not a 404, so it never ran.
 *
 * It is a URL people type and one that anything appending a slash produces,
 * so what is worth pinning is not the mechanism but the promise: both
 * spellings of the door behave the same, and neither of them is an error.
 */

let app: App;
let clock = 1_700_000_000_000;

/**
 * This suite's own train directory, which is the whole reason it can be run
 * beside another copy of itself.
 *
 * **It used to be `server/web`, the real one.** Three suites made a train
 * there and `rm -rf`'d it afterwards, so two runs of the suite at once — a
 * `bin/deploy` overlapping anybody else's `npm test`, which is the ordinary
 * case rather than a strange one — deleted each other's fixtures mid-assertion
 * and failed in `open`, `train-root` and `guest-flow`. `mkdtemp` is the
 * pattern `export.test.ts` and `playback.test.ts` already use for the same
 * reason; the trains were the one thing that had no option to point anywhere
 * else, and `BuildOptions.trainRoot` is that option.
 */
let root: string;

const trainDir = (name: string) => join(root, name);

async function withTrains<T>(names: string[], body: () => Promise<T>): Promise<T> {
  for (const name of names) {
    await mkdir(join(trainDir(name), '_expo'), { recursive: true });
    await writeFile(
      join(trainDir(name), 'index.html'),
      '<!doctype html><html><head><title>The Floor</title></head><body></body></html>'
    );
  }
  try {
    return await body();
  } finally {
    for (const name of names) {
      await rm(trainDir(name), { recursive: true, force: true });
    }
  }
}

const get = (url: string) => app.fastify.inject({ method: 'GET', url });

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'thefloor-trains-'));
  app = buildApp({ dbPath: ':memory:', now: () => clock, trainRoot: root });
});

afterEach(async () => {
  app.channels.stop();
  await app.fastify.close();
  await rm(root, { recursive: true, force: true });
});

describe('a train root', () => {
  it('serves the shell with or without the trailing slash', async () => {
    await withTrains(['stable', 'beta'], async () => {
      for (const url of ['/app', '/app/', '/beta', '/beta/']) {
        const page = await get(url);
        expect([url, page.statusCode]).toEqual([url, 200]);
        expect(page.headers['content-type']).toMatch(/text\/html/);
        expect(page.body).toContain('<title>The Floor</title>');
      }
    });
  });

  it('writes the install tags into the slashed spelling too', async () => {
    // The slashed door goes through the shell handler rather than the file on
    // disk, which is the whole reason to register a route instead of letting
    // the static plugin serve an index: the manifest link is added here.
    await withTrains(['stable'], async () => {
      const page = await get('/app/');
      expect(page.body).toContain('<link rel="manifest" href="/app/manifest.json" />');
    });
  });

  it('never caches the shell, by either spelling', async () => {
    await withTrains(['stable'], async () => {
      for (const url of ['/app', '/app/']) {
        expect((await get(url)).headers['cache-control']).toBe('no-store');
      }
    });
  });

  it('says the bundle is missing rather than 403ing when there is none', async () => {
    // No `withTrains`, so nothing is on disk. Both spellings have to give the
    // same answer, and it has to be the one that explains itself.
    for (const url of ['/app', '/app/']) {
      const page = await get(url);
      expect([url, page.statusCode]).toEqual([url, 503]);
      expect(page.json().error).toContain('has not been built');
    }
  });

  it('still refuses to list a directory inside the bundle', async () => {
    // Deliberately left as it was: `_expo/` is the export's own plumbing, and
    // a refusal is the right answer to a request to list it.
    await withTrains(['stable'], async () => {
      expect((await get('/app/_expo/')).statusCode).toBe(403);
    });
  });
});
