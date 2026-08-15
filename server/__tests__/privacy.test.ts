import { buildApp, type App } from '../src/app';

/**
 * The privacy policy is a page rather than a feature, so what is worth testing
 * is that it is reachable without signing in — App Store Connect fetches it,
 * and so does anybody deciding whether to sign up — and that the one value
 * interpolated into it behaves.
 */

let app: App;

afterEach(async () => {
  app.channels.stop();
  await app.fastify.close();
});

const fetchPolicy = () =>
  app.fastify.inject({ method: 'GET', url: '/privacy' });

describe('The privacy policy', () => {
  it('is served as a page to anyone, with no token', async () => {
    app = buildApp({ dbPath: ':memory:' });
    const answered = await fetchPolicy();

    expect(answered.statusCode).toBe(200);
    expect(answered.headers['content-type']).toContain('text/html');
    expect(answered.body).toContain('Privacy');
  });

  it('says the things about this application that are easy to get wrong', async () => {
    app = buildApp({ dbPath: ':memory:' });
    // Collapsed, because this is prose wrapped for reading: a sentence that
    // happens to break across two lines is still the sentence, and a test that
    // could not see it would be testing the line width.
    const page = (await fetchPolicy()).body.replace(/\s+/g, ' ');

    // Each of these is a claim the codebase has to keep true, which is the
    // reason the policy lives beside the code rather than in a CMS.
    expect(page).toContain('no analytics');
    // Deleting is a mark swept later, and saying so is the point.
    expect(page).toContain('7 days later');
    // Live conversation is not stored; only a deliberate recording is.
    expect(page).toContain('is not written anywhere');
    expect(page).toContain('Ko-fi');
  });

  it('says account deletion happens in the app, and what it leaves behind', async () => {
    // This page promised deletion by writing to a support address until the
    // route existed, which is the arrangement Guideline 5.1.1(v) was written to
    // end. Asserted here because a page making a claim about a feature is one
    // that goes stale the moment the feature moves.
    app = buildApp({ dbPath: ':memory:', contactEmail: 'hello@example.com' });
    const page = (await fetchPolicy()).body.replace(/\s+/g, ' ');

    expect(page).toContain('deleted from inside the application');
    // And the part that is not obvious: a channel is not yours to take with
    // you, and the recordings made in one belong to it.
    expect(page).toContain('carry on without you');
  });

  it('names a contact address when there is one', async () => {
    app = buildApp({ dbPath: ':memory:', contactEmail: 'hello@example.com' });
    const page = (await fetchPolicy()).body;
    expect(page).toContain('mailto:hello@example.com');
  });

  it('points somewhere real when there is not', async () => {
    app = buildApp({ dbPath: ':memory:' });
    const page = (await fetchPolicy()).body;
    expect(page).not.toContain('mailto:');
    expect(page).toContain('App Store listing');
  });

  it('escapes the address rather than trusting it', async () => {
    app = buildApp({
      dbPath: ':memory:',
      contactEmail: '"><script>alert(1)</script>',
    });
    const page = (await fetchPolicy()).body;
    expect(page).not.toContain('<script>alert(1)</script>');
    expect(page).toContain('&lt;script&gt;');
  });
});
