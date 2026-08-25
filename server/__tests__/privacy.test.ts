import { USAGE_RETENTION_MS } from '../../core/constants';
import { buildApp, type App } from '../src/app';
import { PRIVACY_UPDATED } from '../src/privacy';
import { MemoryTranscription } from '../src/transcription';

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
    // Was `no analytics`, until the usage meter made that false. What
    // survives is the part that was always the substance of it: nobody else
    // receives anything, and nothing here profiles anyone. The narrowing is
    // the point — this assertion is what made the claim get rewritten rather
    // than quietly outlived.
    expect(page).toContain('no third-party analytics');
    expect(page).toContain('nothing is used to profile you');
    // And the thing that replaced it has to be stated, not merely not-denied.
    expect(page).toContain('How much the server carried for you');
    expect(page).toContain('durations and sizes, never content');
    // Deleting is a mark swept later, and saying so is the point.
    expect(page).toContain('7 days later');
    // And the meter's horizon is a published promise, so it has to be the one
    // the sweep actually keeps. These were both seven days until 2026-08-19,
    // which is how a single number came to stand for two different claims;
    // this is what fails if the constant moves and the prose does not.
    const usageDays = USAGE_RETENTION_MS / (24 * 60 * 60 * 1000);
    expect(page).toContain(`kept for ${usageDays} days`);
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

  describe('transcription', () => {
    // The section is conditional on the server having a provider, because the
    // claim is only true where the credential is. Both halves are asserted:
    // silence without one is as much a requirement as disclosure with one.
    it('says nothing about a processor when there is none', async () => {
      app = buildApp({ dbPath: ':memory:' });
      const page = (await fetchPolicy()).body.replace(/\s+/g, ' ');

      expect(page).not.toContain('AssemblyAI');
      expect(page).not.toContain('Transcripts');
      // And the sentence transcription narrows is intact in the meantime.
      expect(page).toContain('none of them receive your conversations');
    });

    it('names the processor, and narrows the claims it makes false', async () => {
      app = buildApp({
        dbPath: ':memory:',
        transcription: new MemoryTranscription(),
      });
      const page = (await fetchPolicy()).body.replace(/\s+/g, ' ');
      const provider = new MemoryTranscription().name;

      expect(page).toContain(provider);
      // The four claims the implementation has to keep true.
      expect(page).toContain('somebody in the channel asks for it');
      expect(page).toContain('the words in it and nothing else');
      expect(page).toContain(
        'the parts a silenced person spoke while they did not hold the floor are removed'
      );
      expect(page).toContain(
        `${provider} is asked to delete the audio and its own copy`
      );
      // Their DELETE marks rather than erases, so the page says so. This is
      // the assertion that stops it drifting back to promising an erasure
      // nothing performs.
      expect(page).toContain('removed within about 30 days');

      // The two sentences that were false the moment audio left. Neither may
      // survive unqualified — this is the assertion that makes a later reader
      // rewrite them rather than quietly outlive them, the way `no analytics`
      // was outlived by the usage meter.
      expect(page).not.toContain(
        'no service anywhere that receives your activity.'
      );
      expect(page).not.toContain('none of them receive your conversations');
    });

    it('dates itself by the version in front of the reader', async () => {
      // A page nobody's configuration changed should not tell them to re-read
      // it, so the date moves with the section rather than with the file.
      app = buildApp({ dbPath: ':memory:' });
      expect((await fetchPolicy()).body).toContain(PRIVACY_UPDATED);
      app.channels.stop();
      await app.fastify.close();

      app = buildApp({
        dbPath: ':memory:',
        transcription: new MemoryTranscription(),
      });
      expect((await fetchPolicy()).body).not.toContain(PRIVACY_UPDATED);
    });
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
