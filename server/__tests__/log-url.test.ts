import pino from 'pino';
import { buildApp, type App } from '../src/app';
import { logSafeRequest, sanitiseLogUrl } from '../src/log-url';

/**
 * What the journal is allowed to learn from an address.
 *
 * These are the five addresses that were signing the reader in until
 * 2026-09-17, plus the ones that look like them and are not. The negative
 * cases matter as much as the positive ones: the fix is only worth having if
 * the build census and the socket diagnostics still read what they read, and
 * those live in the query string of the very route that leaked.
 */
describe('addresses in the log', () => {
  describe('credentials are removed', () => {
    it('strips the session token from a socket connect', () => {
      expect(sanitiseLogUrl('/ws?token=abc123secret')).not.toContain(
        'abc123secret'
      );
    });

    it('strips a guest secret and link token, which are two more credentials', () => {
      const safe = sanitiseLogUrl('/gws?link=LINKTOK&guest=g7&secret=SECRET');
      expect(safe).not.toContain('LINKTOK');
      expect(safe).not.toContain('SECRET');
      // The guest's id is not the guest's credential, and it is what makes two
      // lines the same page.
      expect(safe).toContain('guest=g7');
    });

    it('strips a link token carried in the path rather than the query', () => {
      expect(sanitiseLogUrl('/g/LINKTOKEN')).toBe('/g/[redacted]');
    });

    it('strips an invitation pin but keeps the username, which is public', () => {
      expect(sanitiseLogUrl('/i/rodrigo/884213')).toBe('/i/rodrigo/[redacted]');
    });

    it('strips a push address', () => {
      expect(sanitiseLogUrl('/devices/DEVICETOKEN')).toBe(
        '/devices/[redacted]'
      );
    });

    it('strips the guest link being revoked', () => {
      expect(sanitiseLogUrl('/channels/c1/guest-links/LINKTOK')).toBe(
        '/channels/c1/guest-links/[redacted]'
      );
    });
  });

  describe('diagnostics survive, which is the point of a serializer', () => {
    it('keeps every field the build census and socket diagnostics read', () => {
      const safe = sanitiseLogUrl(
        '/ws?token=SECRET&build=222&client=web&notify=granted&device=d9'
      );
      expect(safe).not.toContain('SECRET');
      expect(safe).toContain('build=222');
      expect(safe).toContain('client=web');
      expect(safe).toContain('notify=granted');
      expect(safe).toContain('device=d9');
    });

    it('leaves an ordinary address alone', () => {
      expect(sanitiseLogUrl('/healthz')).toBe('/healthz');
      expect(sanitiseLogUrl('/recordings/r4/play')).toBe('/recordings/r4/play');
    });

    it('does not mistake the fixed addresses under /g/ for tokens', () => {
      expect(sanitiseLogUrl('/g/seat')).toBe('/g/seat');
      expect(sanitiseLogUrl('/g/assets/app.js')).toBe('/g/assets/app.js');
    });
  });

  describe('what is not a credential and is still not logged', () => {
    it('drops a transcript search, which is what somebody typed', () => {
      expect(sanitiseLogUrl('/channels/c1/transcripts/search?q=divorce')).toBe(
        '/channels/c1/transcripts/search?q=[redacted]'
      );
    });

    it('drops an uploaded filename', () => {
      const safe = sanitiseLogUrl('/channels/c1/track?name=my%20voice.m4a');
      expect(safe).not.toContain('voice');
    });

    it('drops a parameter nobody has thought about yet', () => {
      // The allowlist is the half of this that has to hold up over time: a
      // parameter added next year leaks nothing until somebody adds it.
      expect(sanitiseLogUrl('/ws?somethingNew=whatever')).toBe(
        '/ws?somethingNew=[redacted]'
      );
    });
  });

  describe('the serializer around it', () => {
    it('restates all five of Fastify’s other default fields', () => {
      const logged = logSafeRequest({
        method: 'GET',
        url: '/ws?token=SECRET&build=222',
        headers: { 'accept-version': '1.0.0' },
        host: 'thefloor.rvanegas.co',
        ip: '203.0.113.7',
        socket: { remotePort: 51234 },
      });
      expect(logged).toEqual({
        method: 'GET',
        url: '/ws?token=[redacted]&build=222',
        version: '1.0.0',
        host: 'thefloor.rvanegas.co',
        remoteAddress: '203.0.113.7',
        remotePort: 51234,
      });
    });

    it('survives a request with almost nothing on it', () => {
      expect(logSafeRequest({})).toEqual({
        method: undefined,
        url: undefined,
        version: undefined,
        host: undefined,
        remoteAddress: undefined,
        remotePort: undefined,
      });
    });

    /**
     * The assertion the rest of this file cannot make. Every test above is
     * about a function; this is about whether that function is the one a
     * running server actually uses, which is the half that was wrong for five
     * weeks — the code was fine, there simply wasn't any. A `logger: true`
     * restored by a later merge passes everything else here and fails this.
     */
    it('is the serializer a built app logs through', async () => {
      const app: App = buildApp({ logger: true });
      const installed = (
        app.fastify.log as unknown as Record<
          symbol,
          { req: unknown; err: unknown; res: unknown }
        >
      )[pino.symbols.serializersSym];
      expect(installed.req).toBe(logSafeRequest);
      // Fastify merges ours over its own, so replacing `req` must not have
      // cost the other two.
      expect(typeof installed.err).toBe('function');
      expect(typeof installed.res).toBe('function');
      await app.fastify.close();
    });
  });
});
