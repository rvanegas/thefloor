import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  COHORT_CHANNEL_NAME,
  TRANSCRIPT_DELETED_RETENTION_MS,
  USAGE_RETENTION_MS,
} from '../../core/constants';
import { NOTIFY_HEADER } from '../src/release';
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
    // And the things that replaced it have to be stated, not merely
    // not-denied. Three of them since 2026-09-15, when the funnel
    // instrumentation added the two the meter never held: whether the app
    // can reach somebody, and whether asking somebody to come worked. Each
    // is listed in *What is stored* and named again in the paragraph that
    // bounds what measurement means here.
    expect(page).toContain('How much the server carried for you');
    expect(page).toContain('Whether you have allowed notifications');
    expect(page).toContain('asked you to come to a channel, and whether you came');
    expect(page).toContain('durations, sizes and outcomes, never content');
    // The one exclusion inside the new bullet that a reader would most want,
    // and the one the column was deliberately built without: a ping says
    // whether there were words with it and never what they were.
    expect(page).toContain('never the words themselves');
    // The public podcast's episode tally, added 2026-09-25 — the first thing
    // measured here about somebody who has no account, which is why the claim
    // that earns a test is the *scope* rather than the existence of it. A
    // reader has to be able to see where this counter stops, and a later edit
    // that quietly widened it to listening inside the app would falsify the
    // second of these rather than merely outgrow it.
    expect(page).toContain('the public podcast pages, and nothing else');
    expect(page).toContain(
      'This applies only to the published pages and feeds.'
    );
    // And what the number honestly is. `episode_listens` cannot tell a second
    // play from a second person and says so in the schema; the page has to say
    // so too, or a tally of starts gets read as an audience.
    expect(page).toContain('a number of starts rather than a number of people');
    // The sentence the nav paragraph had to give up when this arrived. It
    // claimed to be the only measurement attached to nobody, and that stopped
    // being true the moment there were two — the assertion exists so the next
    // such counter has to come back and fix the prose again.
    expect(page).not.toContain('the only measurement here that is attached');
    // Deleting is a mark swept later, and saying so is the point.
    expect(page).toContain('7 days later');
    // And the meter's horizon is a published promise, so it has to be the one
    // the sweep actually keeps. These were both seven days until 2026-08-19,
    // which is how a single number came to stand for two different claims;
    // this is what fails if the constant moves and the prose does not.
    const usageDays = USAGE_RETENTION_MS / (24 * 60 * 60 * 1000);
    expect(page).toContain(`kept for ${usageDays} days`);
    // And the transcript window, which is a different promise about a
    // different thing and is longer for a reason the page gives.
    const transcriptDays =
      TRANSCRIPT_DELETED_RETENTION_MS / (24 * 60 * 60 * 1000);
    expect(page).toContain(`the text is removed about ${transcriptDays} days later`);
    // Live conversation is not stored; only a deliberate recording is.
    expect(page).toContain('is not written anywhere');
    expect(page).toContain('Ko-fi');
  });

  it('says where account deletion happens, and what it leaves behind', async () => {
    // This page promised deletion by writing to a support address until the
    // route existed, which is the arrangement Guideline 5.1.1(v) was written to
    // end. Asserted here because a page making a claim about a feature is one
    // that goes stale the moment the feature moves.
    //
    // **It said "from inside the application" until 2026-09-01**, which was
    // true of the mobile app and misleading about the web one — the same
    // application, in a browser, where deletion has always worked. Google Play
    // requires a way to delete an account *without* the app, so the sentence
    // being read as mobile-only was a compliance problem as well as an
    // inaccuracy. See server/src/deletion.ts.
    app = buildApp({ dbPath: ':memory:', contactEmail: 'hello@example.com' });
    const page = (await fetchPolicy()).body.replace(/\s+/g, ' ');

    expect(page).toContain('deleted under Settings');
    expect(page).toContain('in a browser');
    // The link is the half a form can be pointed at, so it is asserted rather
    // than left to the prose.
    expect(page).toContain('href="/delete-account"');
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
    it('names no processor when there is none, and still describes the text', async () => {
      // The split, and the half that would go quietly wrong. Text kept here
      // outlives the provider being dropped, so a page that fell silent about
      // transcripts still on people's screens would fail worse than the case
      // the gate was built to prevent. Only the *sending* is conditional.
      app = buildApp({ dbPath: ':memory:' });
      const page = (await fetchPolicy()).body.replace(/\s+/g, ' ');

      expect(page).not.toContain('AssemblyAI');
      expect(page).not.toContain('The audio is sent to');
      // Still says what a transcript is and what becomes of it.
      expect(page).toContain('Transcripts');
      expect(page).toContain('somebody in the channel asks for it');
      expect(page).toContain('deleted when the recording is');
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
      // **Nothing at all about what the provider does with its copy.** The
      // server asks it to delete, and what that achieves at their end is not
      // established — so the page describes what this server does and stops.
      // It briefly said "removed within about 30 days" on no source, which is
      // why this is asserted rather than left to judgement. See BACKLOG.md.
      expect(page).not.toContain(`${provider} is asked to delete`);
      expect(page).not.toMatch(/removed within about \d+ days/);
      // What it does say is about copies here, which is checkable.
      expect(page).toContain('A transcript is kept here');

      // The two sentences that were false the moment audio left. Neither may
      // survive unqualified — this is the assertion that makes a later reader
      // rewrite them rather than quietly outlive them, the way `no analytics`
      // was outlived by the usage meter.
      expect(page).not.toContain(
        'no service anywhere that receives your activity.'
      );
      expect(page).not.toContain('none of them receive your conversations');
    });

    it('carries one date, since the page changed for every reader', async () => {
      // It carried two while the whole section was conditional — a second date
      // shown only to a reader whose server had a provider. The storage half
      // is unconditional now, so the page has genuinely moved for everybody
      // and PRIVACY_UPDATED is the only honest answer.
      app = buildApp({ dbPath: ':memory:' });
      expect((await fetchPolicy()).body).toContain(PRIVACY_UPDATED);
      app.channels.stop();
      await app.fastify.close();

      app = buildApp({
        dbPath: ':memory:',
        transcription: new MemoryTranscription(),
      });
      expect((await fetchPolicy()).body).toContain(PRIVACY_UPDATED);
    });
  });

  /**
   * The getting-started section, which is conditional on the same pattern the
   * transcription one is and for the same reason: a page describing something
   * that cannot happen to the reader is the failing this page most has to
   * avoid.
   */
  describe('on getting-started channels', () => {
    const collapsed = async () =>
      (await fetchPolicy()).body.replace(/\s+/g, ' ');

    it('says nothing when the server makes none', async () => {
      app = buildApp({ dbPath: ':memory:' });
      expect(await collapsed()).not.toContain(COHORT_CHANNEL_NAME);
    });

    it('describes them, and the limits, when it does', async () => {
      app = buildApp({
        dbPath: ':memory:',
        cohortHosts: ['rochelle@example.com'],
      });
      const page = await collapsed();

      expect(page).toContain(COHORT_CHANNEL_NAME);
      // The three claims somebody would otherwise reasonably assume the other
      // way, and which the server has to keep true: it is not a contact, the
      // address is not shown, and nobody can find you this way. `cohorts.test.ts`
      // is what holds the first of them to the code.
      expect(page).toContain('none of them become your\ncontacts'.replace(/\s+/g, ' '));
      expect(page).toContain('not shown your email address');
      expect(page).toContain('Nobody can find you this way');
      // And that it is temporary, which is the honest half of asking somebody
      // to accept an exception to what the app says it is for.
      expect(page).toContain('It will stop');
    });

    it('goes on describing them after the switch is turned off', async () => {
      // The trap this gate exists to avoid, and the one the transcripts
      // section already warns about one direction over: emptying the host list
      // stops new placements, it does not delete the channels people are in.
      // A page that fell silent while they were still on somebody's screen
      // would be withdrawing a disclosure rather than a feature.
      // A file database, because the claim is about what a restart finds.
      const dbPath = join(
        mkdtempSync(join(tmpdir(), 'thefloor-privacy-')),
        'test.db'
      );
      // Signing up and then turning notifications on, because the second is
      // what places anybody — the seat goes to somebody who can be told the
      // room went live. See cohorts.test.ts, which is that gate's own subject;
      // here it is only the way to get a cohort to exist.
      const signUp = async (identifier: string) => {
        const code = app.accounts.issueCode(identifier, Date.now())!;
        const verified = await app.fastify.inject({
          method: 'POST',
          url: '/auth/verify',
          payload: { identifier, code },
        });
        const { token } = verified.json() as { token: string };
        await app.fastify.inject({
          method: 'POST',
          url: '/devices',
          headers: {
            authorization: `Bearer ${token}`,
            // The grant as well as the address: both halves are the gate. See
            // cohorts.test.ts.
            [NOTIFY_HEADER]: 'granted',
          },
          payload: { token: `apns-${identifier}`, platform: 'ios' },
        });
      };

      app = buildApp({ dbPath, cohortHosts: ['rochelle@example.com'] });
      await signUp('rochelle@example.com');
      await signUp('new@example.com');
      expect(app.channels.hasCohorts()).toBe(true);
      app.channels.stop();
      await app.fastify.close();

      // The variable emptied and the box restarted. New placements stop; the
      // cohort that exists is still somebody's channel, so the page still
      // describes it.
      app = buildApp({ dbPath, cohortHosts: [] });
      expect(app.channels.hasCohorts()).toBe(true);
      expect(await collapsed()).toContain(COHORT_CHANNEL_NAME);
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
