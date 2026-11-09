import { generateKeyPairSync, sign } from 'node:crypto';
import { AuthClient } from '../src/auth';

/**
 * auth, as the tests answer for it (auth.ts): a key of their own, published
 * as auth's, the tokens it signs, and The Floor's own token by client_credentials.
 */
export const AUTH_ORIGIN = 'https://auth.example';
export const OWN_TOKEN = 'floor-own-token';

const { privateKey, publicKey } = generateKeyPairSync('ed25519');
const stranger = generateKeyPairSync('ed25519').privateKey;
const jwk = publicKey.export({ format: 'jwk' });

/** A token auth signed: noesis's own, by default, for asking who belongs. */
export function authToken(
  claims: Partial<{ sub: string; client_id: string; scope: string; aud: string; iss: string; exp: number }> = {},
  key = privateKey,
  kid = 'k1'
): string {
  const part = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const body = {
    iss: AUTH_ORIGIN,
    sub: 'noesis',
    aud: AUTH_ORIGIN,
    client_id: 'noesis',
    scope: 'thefloor:members',
    exp: Math.floor(Date.now() / 1000) + 900,
    ...claims,
  };
  const signed = `${part({ alg: 'EdDSA', kid })}.${part(body)}`;
  return `${signed}.${sign(null, Buffer.from(signed), key).toString('base64url')}`;
}

export const strangerToken = () => authToken({}, stranger);

/** auth's endpoints The Floor's server calls, and who asked for what. */
export function fakeAuthFetch(asked: string[] = []): typeof fetch {
  return (async (input: unknown, init?: { body?: unknown }) => {
    const url = new URL(String(input));
    asked.push(url.pathname);
    if (url.pathname === '/.well-known/jwks.json') return Response.json({ keys: [{ ...jwk, kid: 'k1' }] });
    if (url.pathname === '/token') {
      const form = new URLSearchParams(String(init?.body));
      if (form.get('grant_type') !== 'client_credentials') return new Response(null, { status: 400 });
      return Response.json({ access_token: OWN_TOKEN, expires_in: 900, scope: form.get('scope') });
    }
    return new Response(null, { status: 404 });
  }) as typeof fetch;
}

export function fakeAuth(asked: string[] = []): AuthClient {
  return new AuthClient({ origin: AUTH_ORIGIN, clientId: 'thefloor', clientSecret: 'client-secret', fetch: fakeAuthFetch(asked) });
}
