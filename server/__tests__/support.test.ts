import { buildApp, type App } from '../src/app';
import { supportPage } from '../src/support';

/**
 * The support page.
 *
 * App Store Connect requires a Support URL and will not take a `mailto:` in
 * that field, so this has to be a page — and the App Store shows the link to
 * anybody looking at the listing, which makes it the first thing somebody
 * reads about the app after the description.
 *
 * These assert the two things a support page fails at: not offering a way to
 * reach a human, and describing an application that has changed underneath it.
 * The prose is not tested word for word — it is prose — but every claim checked
 * here is one the codebase has to keep true.
 *
 */

describe('GET /support', () => {
  let app: App;

  afterEach(async () => {
    app.channels.stop();
    await app.fastify.close();
  });

  it('is served as a page to anyone, with no token', async () => {
    // The App Store links to it, so most people who open it have not installed
    // the app and could not authenticate if they wanted to.
    app = buildApp({ dbPath: ':memory:', contactEmail: 'hello@example.com' });
    const answered = await app.fastify.inject({
      method: 'GET',
      url: '/support',
    });

    expect(answered.statusCode).toBe(200);
    expect(answered.headers['content-type']).toContain('text/html');
    expect(answered.body).toContain('mailto:hello@example.com');
  });

  it('does not collide with the donations route it took the name from', async () => {
    // `/support` was the app's donations route until it moved to `/donations`.
    // Fastify refuses a duplicate method and path at boot, so this passing at
    // all is the assertion; that both still answer is the rest of it.
    app = buildApp({ dbPath: ':memory:' });
    const page = await app.fastify.inject({ method: 'GET', url: '/support' });
    const json = await app.fastify.inject({ method: 'GET', url: '/donations' });

    expect(page.statusCode).toBe(200);
    expect(page.headers['content-type']).toContain('text/html');
    // Unauthenticated, so the donations route refuses rather than answers —
    // which is exactly how it can be told apart from the page.
    expect(json.statusCode).toBe(401);
  });
});

describe('The support page', () => {
  it('leads with a way to reach a person', async () => {
    const page = supportPage('hello@example.com');
    expect(page).toContain('mailto:hello@example.com');
    // Not buried under the explanations: somebody arriving here has a problem.
    expect(page.indexOf('Getting in touch')).toBeLessThan(
      page.indexOf('Signing in')
    );
  });

  it('points somewhere real when no address is configured', async () => {
    const page = supportPage();
    expect(page).not.toContain('mailto:');
    expect(page).toContain('App Store listing');
  });

  it('escapes the address rather than trusting it', async () => {
    const page = supportPage('"><script>alert(1)</script>');
    expect(page).not.toContain('<script>alert(1)</script>');
    expect(page).toContain('&lt;script&gt;');
  });

  it('answers the questions this application actually raises', async () => {
    const page = supportPage('hello@example.com').replace(/\s+/g, ' ');

    // No password, because there isn't one, and somebody looking for a reset
    // link is the most likely first question.
    expect(page).toContain('There is no password');
    // Nobody can reach you without mutual consent — the 1.2 answer, said to
    // users rather than only to a reviewer.
    expect(page).toContain('unless you have both agreed');
    // Recording is deliberate and visible, which is the claim the privacy page
    // makes and the one a support page must not contradict.
    expect(page).toContain('somebody in the channel started one');
    // Where account deletion is, since this page is where somebody looks for
    // it after failing to find it.
    expect(page).toContain('under Settings');
  });

  it('sends people to the privacy policy rather than restating it', async () => {
    expect(supportPage()).toContain('href="/privacy"');
  });
});
