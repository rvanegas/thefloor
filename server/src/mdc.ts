import { createCipheriv, createDecipheriv, createHash, hkdfSync, randomBytes } from 'node:crypto';
import type { Db } from './db';

/**
 * Each account's own mdc library, connected by signing in at mdc — the way a
 * claude.ai connector is, and through the same page.
 *
 * mdc is the identity for its libraries, and another application reaches a
 * person's only through a grant from it (rvanegas-site's PROJECTS.md, *Shared
 * rules*, since 2026-11-01). So The Floor is an OAuth client of mdc — a
 * confidential one, registered by mdc's operator with `scripts/add_client.py`
 * and holding `MDC_CLIENT_ID` / `MDC_CLIENT_SECRET` — and this is that client:
 *
 * - **Connecting** is *Connect* on *Floor Settings*: `start` makes an
 *   authorization URL (code flow with PKCE), the app opens it in a browser,
 *   the person signs in at mdc with their address and an emailed code, and
 *   mdc sends the browser back to `/mdc/callback`, where `finish` trades the
 *   code for tokens and asks mdc whose library it is.
 * - **What is kept** is the refresh token, encrypted with a key derived from
 *   the client secret, so a copy of the database alone reaches nobody's
 *   library; rotating the secret disconnects everybody, who connect again.
 *   Access tokens live an hour, in memory.
 * - **A press** asks `accessToken` for the token of whoever switched the
 *   channel's library on; Anthropic's servers call mdc with it, as they did
 *   with the one `MDC_TOKEN` this replaces.
 * - **Refreshing rotates the refresh token** (mdc's rule), so one account's
 *   refreshes are serialised; a refused refresh means the grant is gone at
 *   mdc, and the connection is dropped here too.
 * - **Disconnecting** revokes at mdc, best effort, and forgets the row.
 */
export interface MdcOptions {
  /** mdc's MCP endpoint, which Anthropic's servers call; its origin is the authorization server. */
  url: string;
  clientId: string;
  clientSecret: string;
  /** This server's `/mdc/callback`, registered with mdc as the client's one redirect. */
  callbackUrl: string;
  /** Tests answer for mdc. */
  fetch?: typeof fetch;
}

/** Where a finished sign-in sends the person: back into the app, or a page the web app polls behind. */
export type MdcReturn = 'app' | 'web';

export interface MdcStatus {
  connected: boolean;
  /** mdc's user name for the library's owner, and the address they sign in to mdc with. */
  user?: string;
  email?: string | null;
  connectedAt?: number;
}

interface Pending {
  accountId: string;
  verifier: string;
  returnTo: MdcReturn;
  expiresAt: number;
}

interface Row {
  account_id: string;
  mdc_user: string;
  mdc_email: string | null;
  refresh_token: string;
  connected_at: number;
}

/** How long a sign-in begun on *Floor Settings* may take, as long as mdc's own. */
export const MDC_SIGN_IN_TTL_MS = 10 * 60 * 1000;

export class MdcConnections {
  private pending = new Map<string, Pending>();
  private access = new Map<string, { token: string; expiresAt: number }>();
  private refreshing = new Map<string, Promise<string | null>>();
  private key: Buffer;
  private origin: string;

  constructor(
    private db: Db,
    private options: MdcOptions,
    private now: () => number,
    private log?: { warn(details: object, message: string): void }
  ) {
    this.origin = new URL(options.url).origin;
    this.key = Buffer.from(
      hkdfSync('sha256', options.clientSecret, 'thefloor', 'mdc refresh tokens', 32)
    );
  }

  /** The URL to open: mdc's sign-in, for this account, coming back to `returnTo`. */
  start(accountId: string, returnTo: MdcReturn): string {
    const now = this.now();
    for (const [state, entry] of this.pending) if (entry.expiresAt < now) this.pending.delete(state);
    const state = randomBytes(24).toString('base64url');
    const verifier = randomBytes(48).toString('base64url');
    this.pending.set(state, { accountId, verifier, returnTo, expiresAt: now + MDC_SIGN_IN_TTL_MS });
    const url = new URL('/authorize', this.origin);
    url.search = new URLSearchParams({
      response_type: 'code',
      client_id: this.options.clientId,
      redirect_uri: this.options.callbackUrl,
      code_challenge: createHash('sha256').update(verifier).digest('base64url'),
      code_challenge_method: 'S256',
      state,
    }).toString();
    return url.toString();
  }

  /**
   * mdc's answer at the callback: the code traded, the connection kept. The
   * state is what names the account — the callback carries no session — and
   * is spent whatever happens, so it cannot be replayed.
   */
  async finish(
    state: string,
    code: string | undefined,
    error: string | undefined
  ): Promise<{ ok: true; accountId: string; returnTo: MdcReturn } | { ok: false; returnTo: MdcReturn; reason: string }> {
    const entry = this.pending.get(state);
    this.pending.delete(state);
    if (!entry || entry.expiresAt < this.now()) {
      return { ok: false, returnTo: 'web', reason: 'expired' };
    }
    if (error || !code) return { ok: false, returnTo: entry.returnTo, reason: error ?? 'no_code' };
    const tokens = await this.token({
      grant_type: 'authorization_code',
      code,
      redirect_uri: this.options.callbackUrl,
      code_verifier: entry.verifier,
    });
    if (!tokens) return { ok: false, returnTo: entry.returnTo, reason: 'token' };
    const me = await this.whoIs(tokens.access_token);
    if (!me) return { ok: false, returnTo: entry.returnTo, reason: 'me' };
    this.db
      .prepare(
        `INSERT INTO mdc_connections (account_id, mdc_user, mdc_email, refresh_token, connected_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT (account_id) DO UPDATE SET mdc_user = excluded.mdc_user,
           mdc_email = excluded.mdc_email, refresh_token = excluded.refresh_token,
           connected_at = excluded.connected_at`
      )
      .run(entry.accountId, me.user, me.email, this.seal(tokens.refresh_token), this.now());
    this.access.set(entry.accountId, {
      token: tokens.access_token,
      expiresAt: this.now() + tokens.expires_in * 1000,
    });
    return { ok: true, accountId: entry.accountId, returnTo: entry.returnTo };
  }

  status(accountId: string): MdcStatus {
    const row = this.row(accountId);
    return row
      ? { connected: true, user: row.mdc_user, email: row.mdc_email, connectedAt: row.connected_at }
      : { connected: false };
  }

  connected(accountId: string): boolean {
    return this.row(accountId) !== undefined;
  }

  /**
   * A current access token for the account's library, refreshed when within
   * a minute of expiring; null when it has none, or mdc no longer honours it.
   */
  async accessToken(accountId: string): Promise<string | null> {
    const cached = this.access.get(accountId);
    if (cached && cached.expiresAt - 60_000 > this.now()) return cached.token;
    const inFlight = this.refreshing.get(accountId);
    if (inFlight) return inFlight;
    const refresh = this.refresh(accountId).finally(() => this.refreshing.delete(accountId));
    this.refreshing.set(accountId, refresh);
    return refresh;
  }

  /** Revokes at mdc, best effort, and forgets the connection: *Disconnect*, and account deletion. */
  async disconnect(accountId: string): Promise<void> {
    const row = this.row(accountId);
    this.forget(accountId);
    if (!row) return;
    try {
      await this.post('/revoke', { token: this.open(row.refresh_token) });
    } catch (error) {
      this.log?.warn({ err: error }, 'mdc: could not revoke a disconnected grant');
    }
  }

  private forget(accountId: string): void {
    this.access.delete(accountId);
    this.db.prepare('DELETE FROM mdc_connections WHERE account_id = ?').run(accountId);
  }

  private async refresh(accountId: string): Promise<string | null> {
    const row = this.row(accountId);
    if (!row) return null;
    let tokens: TokenResponse | null;
    try {
      tokens = await this.token({ grant_type: 'refresh_token', refresh_token: this.open(row.refresh_token) });
    } catch (error) {
      // mdc unreachable: the press goes without the library, and the grant is kept.
      this.log?.warn({ err: error }, 'mdc: could not refresh a library token');
      return null;
    }
    if (!tokens) {
      this.log?.warn({ accountId }, 'mdc refused a refresh; the connection is dropped');
      this.forget(accountId);
      return null;
    }
    this.db
      .prepare('UPDATE mdc_connections SET refresh_token = ? WHERE account_id = ?')
      .run(this.seal(tokens.refresh_token), accountId);
    this.access.set(accountId, { token: tokens.access_token, expiresAt: this.now() + tokens.expires_in * 1000 });
    return tokens.access_token;
  }

  /** mdc's token endpoint: the tokens, or null where it refused (4xx). Throws where it could not be reached. */
  private async token(fields: Record<string, string>): Promise<TokenResponse | null> {
    const response = await this.post('/token', fields);
    if (response.status >= 400 && response.status < 500) return null;
    if (!response.ok) throw new Error(`mdc /token answered ${response.status}`);
    const body = (await response.json()) as Partial<TokenResponse>;
    if (!body.access_token || !body.refresh_token || typeof body.expires_in !== 'number') {
      throw new Error('mdc /token answered without tokens');
    }
    return body as TokenResponse;
  }

  private post(path: string, fields: Record<string, string>): Promise<Response> {
    const doFetch = this.options.fetch ?? fetch;
    return doFetch(new URL(path, this.origin), {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        ...fields,
        client_id: this.options.clientId,
        client_secret: this.options.clientSecret,
      }).toString(),
    });
  }

  private async whoIs(accessToken: string): Promise<{ user: string; email: string | null } | null> {
    const doFetch = this.options.fetch ?? fetch;
    const response = await doFetch(new URL('/me', this.origin), {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!response.ok) return null;
    const body = (await response.json()) as { user?: string; email?: string | null };
    return body.user ? { user: body.user, email: body.email ?? null } : null;
  }

  private row(accountId: string): Row | undefined {
    return this.db
      .prepare('SELECT * FROM mdc_connections WHERE account_id = ?')
      .get(accountId) as Row | undefined;
  }

  /** AES-256-GCM: iv, tag and ciphertext, base64url, joined by dots. */
  private seal(plain: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const sealed = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
    return [iv, cipher.getAuthTag(), sealed].map((part) => part.toString('base64url')).join('.');
  }

  private open(sealed: string): string {
    const [iv, tag, data] = sealed.split('.').map((part) => Buffer.from(part, 'base64url'));
    const decipher = createDecipheriv('aes-256-gcm', this.key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
  }
}

interface TokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
}
