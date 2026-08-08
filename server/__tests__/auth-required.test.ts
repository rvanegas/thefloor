import { buildApp, type App } from '../src/app';
import { MemoryMailer } from '../src/mail';

/**
 * What remains of the suite that once covered AUTH_DEV_BYPASS, a switch that
 * accepted any code as valid. It is gone, so these assert the property its
 * removal was meant to guarantee: there is no path to a token that does not go
 * through a code the server issued.
 */

let app: App;
let mailer: MemoryMailer;
const clock = 1_700_000_000_000;

beforeEach(() => {
  mailer = new MemoryMailer();
  app = buildApp({ dbPath: ':memory:', mailer, now: () => clock });
});

afterEach(async () => {
  app.sessions.stop();
  await app.fastify.close();
});

const verify = (identifier: string, code: string, displayName?: string) =>
  app.fastify.inject({
    method: 'POST',
    url: '/auth/verify',
    payload: { identifier, code, displayName },
  });

describe('there is no way in without a real code', () => {
  it('refuses an identifier that never requested one', async () => {
    expect((await verify('someone@example.com', '123456')).statusCode).toBe(401);
  });

  it('refuses a wrong code', async () => {
    const code = app.accounts.issueCode('someone@example.com', clock)!;
    const wrong = code === '000000' ? '000001' : '000000';
    expect((await verify('someone@example.com', wrong)).statusCode).toBe(401);
  });

  it('accepts the code it actually issued', async () => {
    const code = app.accounts.issueCode('someone@example.com', clock)!;
    const response = await verify('someone@example.com', code, 'Someone');
    expect(response.statusCode).toBe(200);
    expect(response.json().token).toBeTruthy();
  });

  it('never returns a code to the caller', async () => {
    const response = await app.fastify.inject({
      method: 'POST',
      url: '/auth/request-code',
      payload: { identifier: 'someone@example.com' },
    });
    expect(response.json()).toEqual({ sent: true });

    const sent = mailer.lastCodeFor('someone@example.com')!;
    expect(sent).toMatch(/^\d{6}$/);
    expect(response.payload).not.toContain(sent);
    expect(response.payload).not.toMatch(/\d{6}/);
  });

  it('reports no bypass on the health endpoint, because none exists', async () => {
    const health = await app.fastify.inject({ method: 'GET', url: '/healthz' });
    expect(health.json()).not.toHaveProperty('authBypass');
  });
});
