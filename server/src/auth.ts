import { createPublicKey, verify, type KeyObject } from 'node:crypto';

/**
 * auth (`auth.rvanegas.co`), the one sign-in for The Floor, noesis, dianoia and
 * Roxana since 2026-11-08 — rvanegas-site's
 * `planning/task/one-sign-in-for-every-project-at-auth-rvanegas-co.md`. noesis
 * was the authorization server before it, and The Floor's client there (its id
 * and secret, `NOESIS_CLIENT_ID` / `NOESIS_CLIENT_SECRET`) moved over as it was.
 *
 * Two things here, both for talking to noesis without a shared secret:
 *
 * - **The Floor's own token** (`ownToken`): auth's `client_credentials` grant,
 *   for the scopes the operator allowed this client (`noesis:keep`, keeping
 *   its channels' libraries at noesis), kept until a minute before it lapses.
 * - **Checking a token** (`verify`): auth's access tokens are EdDSA JWTs, and
 *   noesis presents one of its own, scope `thefloor:members`, when it asks who
 *   belongs to a channel. Checked against auth's published keys
 *   (`/.well-known/jwks.json`, kept five minutes, asked again at most every
 *   half minute for a key not known) by issuer, audience and expiry.
 */
export interface AuthOptions {
  /** auth's origin, its issuer. */
  origin: string;
  clientId: string;
  clientSecret: string;
  /** Tests answer for auth. */
  fetch?: typeof fetch;
  now?: () => number;
}

export interface Claims {
  iss: string;
  sub: string;
  aud: string | string[];
  client_id: string;
  scope: string;
  exp: number;
}

const KEYS_TTL_MS = 5 * 60 * 1000;
const KEYS_RETRY_MS = 30 * 1000;

export class AuthClient {
  private own = new Map<string, { token: string; until: number }>();
  private keys = new Map<string, KeyObject>();
  private fetchedAt = -Infinity;
  private triedAt = -Infinity;
  readonly origin: string;

  constructor(private options: AuthOptions) {
    this.origin = new URL(options.origin).origin;
  }

  private now(): number {
    return (this.options.now ?? Date.now)();
  }

  /** The Floor's own access token for `scope`; throws where auth refuses or cannot be reached. */
  async ownToken(scope: string): Promise<string> {
    const kept = this.own.get(scope);
    if (kept && kept.until > this.now()) return kept.token;
    const response = await (this.options.fetch ?? fetch)(new URL('/token', this.origin), {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        scope,
        client_id: this.options.clientId,
        client_secret: this.options.clientSecret,
      }).toString(),
    });
    if (!response.ok) throw new Error(`auth /token answered ${response.status}`);
    const body = (await response.json()) as { access_token?: string; expires_in?: number };
    if (!body.access_token || typeof body.expires_in !== 'number') throw new Error('auth /token answered without a token');
    this.own.set(scope, { token: body.access_token, until: this.now() + (body.expires_in - 60) * 1000 });
    return body.access_token;
  }

  /** The token's claims, if auth signed it for this audience, it has not expired, and it carries `scope`. */
  async verify(token: string, scope: string): Promise<Claims | null> {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    let header: { alg?: string; kid?: string };
    let claims: Claims;
    try {
      header = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
      claims = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    } catch {
      return null;
    }
    if (header.alg !== 'EdDSA' || !header.kid) return null;
    const key = await this.key(header.kid);
    if (!key) return null;
    const signed = Buffer.from(`${parts[0]}.${parts[1]}`);
    if (!verify(null, signed, key, Buffer.from(parts[2], 'base64url'))) return null;
    const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
    if (claims.iss !== this.origin || !audiences.includes(this.origin)) return null;
    if (typeof claims.exp !== 'number' || claims.exp * 1000 <= this.now()) return null;
    if (!(claims.scope ?? '').split(' ').includes(scope)) return null;
    return claims;
  }

  private async key(kid: string): Promise<KeyObject | undefined> {
    const now = this.now();
    const stale = now - this.fetchedAt > KEYS_TTL_MS;
    if ((stale || !this.keys.has(kid)) && now - this.triedAt >= KEYS_RETRY_MS) {
      this.triedAt = now;
      try {
        const response = await (this.options.fetch ?? fetch)(new URL('/.well-known/jwks.json', this.origin));
        if (response.ok) {
          const { keys } = (await response.json()) as { keys?: Array<Record<string, string>> };
          this.keys = new Map(
            (keys ?? [])
              .filter((jwk) => jwk.kid && jwk.kty === 'OKP' && jwk.crv === 'Ed25519')
              .map((jwk) => [jwk.kid, createPublicKey({ key: { kty: jwk.kty, crv: jwk.crv, x: jwk.x }, format: 'jwk' })])
          );
          this.fetchedAt = now;
        }
      } catch {
        // auth unreachable: the keys already known still verify.
      }
    }
    return this.keys.get(kid);
  }
}
