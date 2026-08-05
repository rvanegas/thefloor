import { buildApp, type App } from '../src/app';
import { MemoryMailer } from '../src/mail';

/**
 * The development bypass accepts any code as valid, because there is no SMS or
 * email transport yet and a real user could not otherwise receive one. These
 * pin down both halves: that it works when asked for, and — more importantly —
 * that nothing resembling it happens when it is not.
 */

let app: App;
const clock = 1_700_000_000_000;

afterEach(async () => {
  app.sessions.stop();
  await app.fastify.close();
});

function verify(identifier: string, code: string, displayName?: string) {
  return app.fastify.inject({
    method: 'POST',
    url: '/auth/verify',
    payload: { identifier, code, displayName },
  });
}

describe('with the bypass on', () => {
  beforeEach(() => {
    app = buildApp({ dbPath: ':memory:', authBypass: true, now: () => clock });
  });

  it('accepts any code without one ever being issued', async () => {
    const response = await verify('+15550000001', 'literally-anything', 'Alice');
    expect(response.statusCode).toBe(200);
    expect(response.json().account.displayName).toBe('Alice');
  });

  it('returns the same account on a second sign-in', async () => {
    const first = await verify('+15550000001', 'aaa', 'Alice');
    const second = await verify('+15550000001', 'bbb');
    expect(second.json().account.id).toBe(first.json().account.id);
  });

  it('issues a working token', async () => {
    const { token } = (await verify('+15550000001', 'x', 'Alice')).json();
    const home = await app.fastify.inject({
      method: 'GET',
      url: '/home',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(home.statusCode).toBe(200);
  });

  it('still refuses a request with no code at all', async () => {
    const response = await app.fastify.inject({
      method: 'POST',
      url: '/auth/verify',
      payload: { identifier: '+15550000001' },
    });
    expect(response.statusCode).toBe(400);
  });

  it('sends nothing and admits as much', async () => {
    const response = await app.fastify.inject({
      method: 'POST',
      url: '/auth/request-code',
      payload: { identifier: '+15550000001' },
    });
    expect(response.json()).toEqual({ sent: true, bypass: true });
  });

  it('is visible on the health endpoint rather than having to be inferred', async () => {
    const health = await app.fastify.inject({ method: 'GET', url: '/healthz' });
    expect(health.json()).toEqual({ ok: true, authBypass: true, audio: 'none' });
  });
});

describe('with the bypass off (the default)', () => {
  let mailer: MemoryMailer;

  beforeEach(() => {
    mailer = new MemoryMailer();
    app = buildApp({ dbPath: ':memory:', mailer, now: () => clock });
  });

  it('defaults to off', async () => {
    const health = await app.fastify.inject({ method: 'GET', url: '/healthz' });
    expect(health.json()).toEqual({ ok: true, authBypass: false, audio: 'none' });
  });

  it('refuses a wrong code', async () => {
    const code = app.accounts.issueCode('+15550000001', clock)!;
    const wrong = code === '000000' ? '000001' : '000000';
    expect((await verify('+15550000001', wrong)).statusCode).toBe(401);
  });

  it('refuses to sign in an identifier that never requested a code', async () => {
    expect((await verify('+15550000002', '123456')).statusCode).toBe(401);
  });

  it('never returns a code to the caller', async () => {
    const response = await app.fastify.inject({
      method: 'POST',
      url: '/auth/request-code',
      payload: { identifier: 'someone@example.com' },
    });
    expect(response.json()).toEqual({ sent: true });

    // The code reached the transport, and nothing about it reached the caller.
    const sent = mailer.lastCodeFor('someone@example.com')!;
    expect(sent).toMatch(/^\d{6}$/);
    expect(response.payload).not.toContain(sent);
    expect(response.payload).not.toMatch(/\d{6}/);

    const issued = app.db
      .prepare('SELECT code_hash FROM otp_codes WHERE identifier = ?')
      .get('someone@example.com') as { code_hash: string };
    expect(response.payload).not.toContain(issued.code_hash);
  });
});
