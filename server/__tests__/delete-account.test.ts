import { buildApp, type App } from '../src/app';

/**
 * The account-deletion page, which exists because **Google Play requires a URL
 * where somebody can find out how to delete their account without the app** —
 * asked for in the Data safety form, which gates a release to any track rather
 * than only to production.
 *
 * So what is worth testing is exactly what the requirement is: that it answers
 * without a token, that it points at a way to do it that does not need an
 * install, and — the one that would be a real defect rather than a compliance
 * failure — that it does not itself delete anything.
 */

let app: App;

afterEach(async () => {
  app.channels.stop();
  await app.fastify.close();
});

const fetchPage = () =>
  app.fastify.inject({ method: 'GET', url: '/delete-account' });

// Collapsed, on privacy.test.ts's reasoning: this is prose wrapped for reading,
// and a sentence broken across two lines is still the sentence.
const collapsed = (body: string) => body.replace(/\s+/g, ' ');

describe('The account deletion page', () => {
  it('is served as a page to anyone, with no token', async () => {
    app = buildApp({ dbPath: ':memory:' });
    const answered = await fetchPage();

    expect(answered.statusCode).toBe(200);
    expect(answered.headers['content-type']).toContain('text/html');
    expect(answered.body).toContain('Deleting your account');
  });

  it('names a way to do it that needs nothing installed', async () => {
    // The whole point of the requirement. A page that only said "open the app"
    // would answer 200 and satisfy nobody, which is why this asserts the web
    // route specifically rather than the presence of the word "delete".
    app = buildApp({ dbPath: ':memory:' });
    const body = collapsed((await fetchPage()).body);

    expect(body).toContain('href="/app"');
    expect(body).toContain('do not need to have the app installed');
    expect(body).toContain('There is nothing to install');
  });

  it('sends the reader to the policy rather than restating it', async () => {
    // The retention figures live in privacy.ts and are deliberately not copied
    // here — one page making claims about how long data survives is enough, and
    // a second copy is a second thing to keep true.
    app = buildApp({ dbPath: ':memory:' });
    expect((await fetchPage()).body).toContain('href="/privacy"');
  });

  it('offers a route for somebody who has lost the address', async () => {
    app = buildApp({ dbPath: ':memory:', contactEmail: 'help@example.com' });
    const body = collapsed((await fetchPage()).body);

    expect(body).toContain('mailto:help@example.com');
  });

  it('escapes the address rather than trusting it', async () => {
    app = buildApp({
      dbPath: ':memory:',
      contactEmail: '"><script>alert(1)</script>',
    });
    const body = (await fetchPage()).body;

    expect(body).not.toContain('<script>alert(1)</script>');
    expect(body).toContain('&lt;script&gt;');
  });

  it('still says something useful with no address configured', async () => {
    // The fallback matters: this page is reachable on a server whose contact
    // address is unset, and a dangling "write to" sentence would be worse than
    // naming the store listing.
    app = buildApp({ dbPath: ':memory:' });
    const body = collapsed((await fetchPage()).body);

    expect(body).toContain('store listing');
    expect(body).not.toContain('mailto:');
  });

  /**
   * The page is a document and not a control, and this is the assertion that
   * says so. Deleting an account is `DELETE /me`, authenticated; a GET that
   * destroyed anything would be a defect of a different order from a
   * compliance gap, and one nothing else here would catch.
   */
  it('deletes nothing itself, and refuses the verb that would', async () => {
    app = buildApp({ dbPath: ':memory:' });

    const posted = await app.fastify.inject({
      method: 'POST',
      url: '/delete-account',
    });
    expect(posted.statusCode).toBe(404);

    const deleted = await app.fastify.inject({
      method: 'DELETE',
      url: '/delete-account',
    });
    expect(deleted.statusCode).toBe(404);
  });

  it('is reachable from the policy, which is the page people are sent to', async () => {
    app = buildApp({ dbPath: ':memory:' });
    const policy = await app.fastify.inject({ method: 'GET', url: '/privacy' });

    expect(policy.body).toContain('href="/delete-account"');
  });
});
