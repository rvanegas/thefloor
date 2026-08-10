/**
 * A refused credential has to become a sign-out.
 *
 * Until signing in on a second device began revoking the first token, a live
 * app meeting a 401 was barely reachable — a token lasted ninety days and only
 * the launch-time restore checked one. Now it is ordinary, and every path that
 * can see a 401 has to report it, not just the one that happens to be easiest
 * to reach.
 */

const OK = { status: 200, ok: true, json: async () => ({}) };
const UNAUTHORIZED = {
  status: 401,
  ok: false,
  json: async () => ({ error: 'Unauthorized', code: 'unauthorized' }),
};

function load() {
  jest.resetModules();
  process.env.EXPO_PUBLIC_API_URL = 'http://test.local';
  return require('../http') as typeof import('../http');
}

afterEach(() => {
  delete (globalThis as { fetch?: unknown }).fetch;
});

describe('a 401 from an ordinary request', () => {
  it('reports a sign-out', async () => {
    const http = load();
    const listener = jest.fn();
    http.onSignedOut(listener);
    (globalThis as { fetch?: unknown }).fetch = jest.fn(async () => UNAUTHORIZED);

    await expect(http.api.home('dead-token')).rejects.toBeInstanceOf(
      http.ApiError
    );
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('still throws, so the caller is not left thinking it worked', async () => {
    const http = load();
    http.onSignedOut(jest.fn());
    (globalThis as { fetch?: unknown }).fetch = jest.fn(async () => UNAUTHORIZED);

    await expect(http.api.home('dead-token')).rejects.toMatchObject({
      status: 401,
    });
  });
});

describe('everything else', () => {
  it('leaves a successful call alone', async () => {
    const http = load();
    const listener = jest.fn();
    http.onSignedOut(listener);
    (globalThis as { fetch?: unknown }).fetch = jest.fn(async () => OK);

    await http.api.home('good-token');
    expect(listener).not.toHaveBeenCalled();
  });

  it('does not treat a 403 as a sign-out — being refused is not being unknown', async () => {
    const http = load();
    const listener = jest.fn();
    http.onSignedOut(listener);
    (globalThis as { fetch?: unknown }).fetch = jest.fn(async () => ({
      status: 403,
      ok: false,
      json: async () => ({ error: 'Forbidden' }),
    }));

    await expect(http.api.home('good-token')).rejects.toMatchObject({
      status: 403,
    });
    expect(listener).not.toHaveBeenCalled();
  });
});

describe('the listener', () => {
  it('can be cleared, so an unmounted provider is not called', async () => {
    const http = load();
    const listener = jest.fn();
    http.onSignedOut(listener);
    http.onSignedOut(null);
    (globalThis as { fetch?: unknown }).fetch = jest.fn(async () => UNAUTHORIZED);

    await http.api.home('dead-token').catch(() => {});
    expect(listener).not.toHaveBeenCalled();
  });
});
