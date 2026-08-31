import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { buildApp, type App } from '../src/app';

/**
 * The one door into the web app.
 *
 * What it is for is a question no address carries the answer to: a channel, a
 * contact and a guest link belong to neither train, so every page that sends
 * somebody into the app has to decide, and each of them deciding separately is
 * what put a 503's JSON body in front of somebody twice in two days.
 *
 * The deciding itself happens in a browser — the remembered train is in
 * `localStorage`, which this server cannot read — so what is testable here is
 * the page it serves: which trains it offers, in which order, and what it says
 * when there are none.
 */

let app: App;
let clock = 1_700_000_000_000;

const trainDir = (name: string) => join(__dirname, '..', 'web', name);

async function withTrains<T>(names: string[], body: () => Promise<T>): Promise<T> {
  for (const name of names) {
    await mkdir(trainDir(name), { recursive: true });
    await writeFile(join(trainDir(name), 'index.html'), '<!doctype html>');
  }
  try {
    return await body();
  } finally {
    for (const name of names) {
      await rm(trainDir(name), { recursive: true, force: true });
    }
  }
}

const open = (url = '/open') => app.fastify.inject({ method: 'GET', url });

beforeEach(() => {
  app = buildApp({ dbPath: ':memory:', now: () => clock });
});

afterEach(async () => {
  app.channels.stop();
  await app.fastify.close();
});

describe('/open', () => {
  it('offers only the trains this box actually serves', async () => {
    await withTrains(['beta'], async () => {
      const page = await open();
      expect(page.statusCode).toBe(200);
      expect(page.headers['content-type']).toMatch(/text\/html/);
      // The list the script intersects a remembered train against. A prefix
      // that is not deployed is not in it, which is what stops a remembered
      // train stranding anybody on a 503.
      expect(page.body).toContain('["/beta"]');
      expect(page.body).not.toContain('/app');
    });
  });

  it('prefers stable, which is where somebody with no history should go', async () => {
    await withTrains(['stable', 'beta'], async () => {
      const page = await open();
      expect(page.body).toContain('["/app","/beta"]');
      // And the no-script way through goes to the same place.
      expect(page.body).toContain('href="/app"');
    });
  });

  it('says so rather than redirecting when there is no web app at all', async () => {
    // An ordinary state, not an error: stable is cut from `released` and
    // cannot exist until a release contains the web app.
    const page = await open();
    expect(page.statusCode).toBe(200);
    expect(page.body).toContain('not available in a browser');
    expect(page.body).not.toContain('location.replace');
  });

  it('carries a channel through to the train', async () => {
    await withTrains(['beta'], async () => {
      const page = await open('/open/c/chan_abc');
      expect(page.body).toContain('"/c/chan_abc"');
      expect(page.body).toContain('href="/beta/c/chan_abc"');
    });
  });

  it('escapes what it puts in the fallback link', async () => {
    await withTrains(['beta'], async () => {
      const page = await open(`/open/c/${encodeURIComponent('a"b')}`);
      expect(page.body).not.toContain('href="/beta/c/a"b"');
      expect(page.statusCode).toBe(200);
    });
  });

  it('is never cached, since which trains exist changes without a restart', async () => {
    const page = await open();
    expect(page.headers['cache-control']).toBe('no-store');
  });
});

describe('the landing page', () => {
  it('offers the browser when any train is deployed, not only stable', async () => {
    // It asked about stable alone until 2026-08-30, and so withheld the web
    // app entirely from a box that was serving beta perfectly well.
    const without = await app.fastify.inject({ method: 'GET', url: '/' });
    expect(without.body).not.toContain('/open');

    await withTrains(['beta'], async () => {
      const page = await app.fastify.inject({ method: 'GET', url: '/' });
      expect(page.body).toContain('href="/open"');
      // The redirect names the door rather than a train, for the same reason.
      expect(page.body).toContain("location.replace('/open')");
    });
  });
});

describe('arriving rather than looking', () => {
  it('forwards the one query it knows, and only that one', async () => {
    await withTrains(['beta'], async () => {
      const asked = await open('/open/c/chan_abc?enter=1');
      expect(asked.body).toContain('"/c/chan_abc?enter=1"');
      expect(asked.body).toContain('href="/beta/c/chan_abc?enter=1"');

      // Anything else is dropped rather than passed along: this is a hallway,
      // and a door that forwards arbitrary query is a door somebody can push
      // things through.
      const smuggled = await open('/open/c/chan_abc?enter=yes&other=1');
      expect(smuggled.body).toContain('"/c/chan_abc"');
      expect(smuggled.body).not.toContain('other=1');
    });
  });
});
