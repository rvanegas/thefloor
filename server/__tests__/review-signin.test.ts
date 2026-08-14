import { buildApp, type App } from '../src/app';

/**
 * The fixed one-time code that lets App Review sign in.
 *
 * Sign-in here means reading a six-digit code out of an inbox, and a reviewer
 * has no access to the inbox — so without this the app cannot be opened by the
 * people who decide whether it ships. What these cover is that it opens exactly
 * one door: the configured address, only when both halves are set, and with
 * every other property of the ordinary path intact.
 */

let app: App;
let clock = 1_700_000_000_000;

const REVIEW = { identifier: 'review@example.com', code: '246813' };

afterEach(async () => {
  app.channels.stop();
  await app.fastify.close();
});

function build(review?: { identifier: string; code: string }) {
  clock = 1_700_000_000_000;
  app = buildApp({ dbPath: ':memory:', now: () => clock, review });
}

const verify = (identifier: string, code: string) =>
  app.fastify.inject({
    method: 'POST',
    url: '/auth/verify',
    payload: { identifier, code, displayName: 'Reviewer' },
  });

describe('The review sign-in', () => {
  it('issues the fixed code for its own address, and signs in with it', async () => {
    build(REVIEW);
    expect(app.accounts.issueCode(REVIEW.identifier, clock)).toBe(REVIEW.code);

    const signedIn = await verify(REVIEW.identifier, REVIEW.code);
    expect(signedIn.statusCode).toBe(200);
    expect(signedIn.json().token).toEqual(expect.any(String));
  });

  it('is the same code every time, which is the whole point', async () => {
    build(REVIEW);
    const first = app.accounts.issueCode(REVIEW.identifier, clock);
    // Past the resend interval, so a genuinely new code would be issued.
    clock += 10 * 60 * 1000;
    const second = app.accounts.issueCode(REVIEW.identifier, clock);
    expect(first).toBe(REVIEW.code);
    expect(second).toBe(REVIEW.code);
  });

  it('matches the address case-insensitively, as the database does', async () => {
    build(REVIEW);
    expect(app.accounts.issueCode('  REVIEW@Example.COM ', clock)).toBe(
      REVIEW.code
    );
  });

  it('leaves every other address random', async () => {
    build(REVIEW);
    const mine = app.accounts.issueCode('someone@example.com', clock);
    expect(mine).not.toBe(REVIEW.code);
    expect(mine).toMatch(/^\d{6}$/);
  });

  it('opens nothing when unconfigured', async () => {
    build(undefined);
    const code = app.accounts.issueCode(REVIEW.identifier, clock);
    expect(code).not.toBe(REVIEW.code);

    const guessed = await verify(REVIEW.identifier, REVIEW.code);
    expect(guessed.statusCode).toBe(401);
  });

  it('still refuses a wrong code, and still counts the attempts', async () => {
    build(REVIEW);
    app.accounts.issueCode(REVIEW.identifier, clock);

    for (let attempt = 0; attempt < 5; attempt++) {
      const wrong = await verify(REVIEW.identifier, '000000');
      expect(wrong.statusCode).toBe(401);
    }
    // Burned through OTP_MAX_ATTEMPTS, so even the real code is now refused —
    // the fixed code changes the digits and nothing else about the path.
    const correct = await verify(REVIEW.identifier, REVIEW.code);
    expect(correct.statusCode).toBe(401);
  });

  it('still expires', async () => {
    build(REVIEW);
    app.accounts.issueCode(REVIEW.identifier, clock);
    clock += 11 * 60 * 1000;
    const late = await verify(REVIEW.identifier, REVIEW.code);
    expect(late.statusCode).toBe(401);
  });
});
