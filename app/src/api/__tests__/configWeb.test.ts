/**
 * What the web build thinks the server's address is.
 *
 * Imported as `../config.web` by its full name rather than as `../config`,
 * deliberately: this suite does not run under the web platform, so ordinary
 * resolution would hand back the native file and the test would pass while
 * testing nothing.
 *
 * It exists because of a specific failure. `API_URL` was the empty string on
 * web, on the reasoning that a relative path is what "same origin" means — and
 * the empty string already meant *no server configured at all* to four call
 * sites, each of which refuses to act. The web app threw "No server
 * configured." at the first person who typed an email address, having never
 * made a request. Nothing in the suite could see it, because nothing asserted
 * what the value was.
 */

/** A stand-in for `location`, which jest does not have. */
function atOrigin(href: {
  origin: string;
  protocol: string;
  host: string;
}): void {
  Object.defineProperty(globalThis, 'location', {
    value: href,
    configurable: true,
    writable: true,
  });
}

/**
 * `require` rather than a dynamic `import`, which this jest setup refuses
 * without `--experimental-vm-modules`. The point is the same: re-read the
 * module after `location` has been set, since its exports are computed once at
 * import time and cached.
 */
const load = (): typeof import('../config.web') => {
  jest.resetModules();
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  return require('../config.web') as typeof import('../config.web');
};

describe('the web build finds its own server', () => {
  const realLocation = Object.getOwnPropertyDescriptor(globalThis, 'location');

  afterEach(() => {
    if (realLocation) Object.defineProperty(globalThis, 'location', realLocation);
    delete process.env.EXPO_PUBLIC_API_URL;
  });

  /**
   * The regression. Whatever else is true, this must not be falsy — every
   * guard that reads it treats empty as "there is no server", and answers a
   * sign-in with an error instead of a request.
   */
  it('names an origin rather than leaving it empty', () => {
    atOrigin({
      origin: 'https://thefloor.rvanegas.co',
      protocol: 'https:',
      host: 'thefloor.rvanegas.co',
    });
    const { API_URL } = load();
    expect(API_URL).toBeTruthy();
    expect(API_URL).toBe('https://thefloor.rvanegas.co');
  });

  it('builds a secure socket url from a secure page', () => {
    atOrigin({
      origin: 'https://thefloor.rvanegas.co',
      protocol: 'https:',
      host: 'thefloor.rvanegas.co',
    });
    const { WS_URL } = load();
    // A page on https may not open an insecure socket — a browser rule.
    expect(WS_URL).toBe('wss://thefloor.rvanegas.co/ws');
  });

  it('builds a plain socket url from a plain page', () => {
    atOrigin({
      origin: 'http://localhost:8787',
      protocol: 'http:',
      host: 'localhost:8787',
    });
    const { WS_URL } = load();
    expect(WS_URL).toBe('ws://localhost:8787/ws');
  });

  /**
   * The escape hatch that makes `expo start --web` against a server on another
   * port work. It is not something production can do — there is no CORS on
   * that server — but it is how the app is developed.
   */
  it('lets an explicit address win over the page it came from', () => {
    atOrigin({
      origin: 'http://localhost:8081',
      protocol: 'http:',
      host: 'localhost:8081',
    });
    process.env.EXPO_PUBLIC_API_URL = 'http://192.168.7.150:8787';
    const { API_URL, WS_URL } = load();
    expect(API_URL).toBe('http://192.168.7.150:8787');
    expect(WS_URL).toBe('ws://192.168.7.150:8787/ws');
  });

  /** Nothing to report: a browser always knows where it came from. */
  it('never reports a missing configuration', () => {
    atOrigin({
      origin: 'https://thefloor.rvanegas.co',
      protocol: 'https:',
      host: 'thefloor.rvanegas.co',
    });
    const { describeMissingConfig } = load();
    expect(describeMissingConfig()).toBeNull();
  });
});
