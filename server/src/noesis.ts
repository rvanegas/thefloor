import { createCipheriv, createDecipheriv, createHash, hkdfSync, randomBytes } from 'node:crypto';
import type { Db } from './db';

/**
 * Each account's own noesis library, connected by signing in at noesis — the way a
 * claude.ai connector is, and through the same page.
 *
 * noesis is the identity for its libraries, and another application reaches a
 * person's only through a grant from it (rvanegas-site's PROJECTS.md, *Shared
 * rules*, since 2026-11-01). So The Floor is an OAuth client of noesis — a
 * confidential one, registered by noesis's operator with `scripts/add_client.py`
 * and holding `NOESIS_CLIENT_ID` / `NOESIS_CLIENT_SECRET` — and this is that client:
 *
 * - **Connecting** is *Connect* on *Floor Settings*: `start` makes an
 *   authorization URL (code flow with PKCE), the app opens it in a browser,
 *   the person signs in at noesis with their address and an emailed code, and
 *   noesis sends the browser back to `/noesis/callback`, where `finish` trades the
 *   code for tokens and asks noesis whose library it is.
 * - **What is kept** is the refresh token, encrypted with a key derived from
 *   the client secret, so a copy of the database alone reaches nobody's
 *   library; rotating the secret disconnects everybody, who connect again.
 *   Access tokens live an hour, in memory.
 * - **A press** asks `accessToken` for the token of whoever switched the
 *   channel's library on; Anthropic's servers call noesis with it, as they did
 *   with the one `NOESIS_TOKEN` this replaces.
 * - **Refreshing rotates the refresh token** (noesis's rule), so one account's
 *   refreshes are serialised; a refused refresh means the grant is gone at
 *   noesis, and the connection is dropped here too.
 * - **Disconnecting** revokes at noesis, best effort, and forgets the row.
 * - **Which libraries** are the person's is noesis's `/me`, read at connecting
 *   and again by `refreshLibraries` whenever Floor Settings or a channel's
 *   card asks: what the channel toggles offer. The grant reaches all of them;
 *   a channel's selection is sent with each press (claude.ts).
 * - **Sending a room's text** (`send`, since 2026-11-02) files it in one of
 *   the person's libraries through noesis's import — the one thing The Floor
 *   writes there, and only with the `import` scope, which noesis's operator
 *   grants this client alone and its sign-in names. Asked for at every
 *   connecting; a connection made before it lacks it (`canSend`) and connects
 *   again to have it. Before sending, the person's display name here is added
 *   to the names noesis keeps as their voice, so their lines are filed as
 *   their own words and everybody else's as context.
 */
export interface NoesisOptions {
  /** noesis's MCP endpoint, which Anthropic's servers call; its origin is the authorization server. */
  url: string;
  clientId: string;
  clientSecret: string;
  /** This server's `/noesis/callback`, registered with noesis as the client's one redirect. */
  callbackUrl: string;
  /** Tests answer for noesis. */
  fetch?: typeof fetch;
}

/** Where a finished sign-in sends the person: back into the app, or a page the web app polls behind. */
export type NoesisReturn = 'app' | 'web';

export interface NoesisStatus {
  connected: boolean;
  /** noesis's user name for the library's owner, and the address they sign in to noesis with. */
  user?: string;
  email?: string | null;
  connectedAt?: number;
  /** The person's library ids at noesis, `user/library`, as last read. */
  libraries?: string[];
  /** Whether the grant includes filing a room's text (`import`); false for one made before it was asked. */
  canSend?: boolean;
}

/** What `send` came to: the file noesis wrote, or why nothing was. */
export type NoesisSent =
  | { ok: true; file: string | null }
  | { ok: false; reason: 'not_connected' | 'no_grant' | 'not_yours' | 'busy' | 'allowance' | 'failed'; message?: string };

/** The scope that lets this client file conversations at noesis, which its operator grants. */
export const NOESIS_IMPORT_SCOPE = 'import';

interface Pending {
  accountId: string;
  verifier: string;
  returnTo: NoesisReturn;
  expiresAt: number;
}

interface Row {
  account_id: string;
  noesis_user: string;
  noesis_email: string | null;
  refresh_token: string;
  connected_at: number;
  libraries: string | null;
  /** The scopes noesis granted, space-separated, as its token response said; null before they were kept. */
  scopes: string | null;
}

/** How long a sign-in begun on *Floor Settings* may take, as long as noesis's own. */
export const NOESIS_SIGN_IN_TTL_MS = 10 * 60 * 1000;

export class NoesisConnections {
  private pending = new Map<string, Pending>();
  private access = new Map<string, { token: string; expiresAt: number }>();
  private refreshing = new Map<string, Promise<string | null>>();
  private key: Buffer;
  private origin: string;

  constructor(
    private db: Db,
    private options: NoesisOptions,
    private now: () => number,
    private log?: { warn(details: object, message: string): void }
  ) {
    this.origin = new URL(options.url).origin;
    this.key = Buffer.from(
      hkdfSync('sha256', options.clientSecret, 'thefloor', 'noesis refresh tokens', 32)
    );
  }

  /** The URL to open: noesis's sign-in, for this account, coming back to `returnTo`. */
  start(accountId: string, returnTo: NoesisReturn): string {
    const now = this.now();
    for (const [state, entry] of this.pending) if (entry.expiresAt < now) this.pending.delete(state);
    const state = randomBytes(24).toString('base64url');
    const verifier = randomBytes(48).toString('base64url');
    this.pending.set(state, { accountId, verifier, returnTo, expiresAt: now + NOESIS_SIGN_IN_TTL_MS });
    const url = new URL('/authorize', this.origin);
    url.search = new URLSearchParams({
      response_type: 'code',
      client_id: this.options.clientId,
      redirect_uri: this.options.callbackUrl,
      code_challenge: createHash('sha256').update(verifier).digest('base64url'),
      code_challenge_method: 'S256',
      scope: NOESIS_IMPORT_SCOPE,
      state,
    }).toString();
    return url.toString();
  }

  /**
   * noesis's answer at the callback: the code traded, the connection kept. The
   * state is what names the account — the callback carries no session — and
   * is spent whatever happens, so it cannot be replayed.
   */
  async finish(
    state: string,
    code: string | undefined,
    error: string | undefined
  ): Promise<{ ok: true; accountId: string; returnTo: NoesisReturn } | { ok: false; returnTo: NoesisReturn; reason: string }> {
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
    /*
      The noesis account has to be this account's own: the same address, and
      so — noesis deciding names (names.ts) — the same username. Somebody who
      signed in at noesis under another address is refused rather than
      linked, and the grant they just made is given back.
    */
    const mine = this.db
      .prepare('SELECT identifier FROM accounts WHERE id = ?')
      .get(entry.accountId) as { identifier: string } | undefined;
    if (!mine || !me.email || mine.identifier.trim().toLowerCase() !== me.email.trim().toLowerCase()) {
      await this.post('/revoke', { token: tokens.refresh_token }).catch(() => undefined);
      return { ok: false, returnTo: entry.returnTo, reason: 'address' };
    }
    this.db
      .prepare(
        `INSERT INTO noesis_connections (account_id, noesis_user, noesis_email, refresh_token, connected_at, libraries, scopes)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (account_id) DO UPDATE SET noesis_user = excluded.noesis_user,
           noesis_email = excluded.noesis_email, refresh_token = excluded.refresh_token,
           connected_at = excluded.connected_at, libraries = excluded.libraries, scopes = excluded.scopes`
      )
      .run(
        entry.accountId,
        me.user,
        me.email,
        this.seal(tokens.refresh_token),
        this.now(),
        JSON.stringify(me.libraries),
        tokens.scope ?? ''
      );
    this.access.set(entry.accountId, {
      token: tokens.access_token,
      expiresAt: this.now() + tokens.expires_in * 1000,
    });
    return { ok: true, accountId: entry.accountId, returnTo: entry.returnTo };
  }

  status(accountId: string): NoesisStatus {
    const row = this.row(accountId);
    return row
      ? {
          connected: true,
          user: row.noesis_user,
          email: row.noesis_email,
          connectedAt: row.connected_at,
          libraries: parseLibraries(row.libraries),
          canSend: grants(row, NOESIS_IMPORT_SCOPE),
        }
      : { connected: false };
  }

  /**
   * Files `text` — a room's, as *Share* hands it — in `library`, one of the
   * person's, through noesis's import. Sent again, it replaces what the same
   * conversation filed before (noesis knows one by its turns). `speaker` is
   * the person's display name here, added first to the names noesis keeps as
   * their voice where it is missing; best effort, since the text is worth
   * filing even when that fails.
   */
  async send(accountId: string, library: string, filename: string, text: string, speaker: string): Promise<NoesisSent> {
    const row = this.row(accountId);
    if (!row) return { ok: false, reason: 'not_connected' };
    if (!grants(row, NOESIS_IMPORT_SCOPE)) return { ok: false, reason: 'no_grant' };
    if (!parseLibraries(row.libraries).includes(library)) return { ok: false, reason: 'not_yours' };
    const token = await this.accessToken(accountId);
    if (!token) return { ok: false, reason: 'not_connected' };
    const doFetch = this.options.fetch ?? fetch;
    const bearer = { Authorization: `Bearer ${token}` };
    try {
      await this.keepSpeaker(token, speaker);
    } catch (error) {
      this.log?.warn({ err: error }, 'noesis: could not add a speaker name');
    }
    const url = new URL(`/libraries/${library}/import`, this.origin);
    url.search = new URLSearchParams({ filename, replace: 'true' }).toString();
    let response: Response;
    try {
      response = await doFetch(url, {
        method: 'POST',
        headers: { ...bearer, 'Content-Type': 'text/markdown; charset=utf-8' },
        body: text,
      });
    } catch (error) {
      this.log?.warn({ err: error }, 'noesis: could not reach the import');
      return { ok: false, reason: 'failed' };
    }
    if (response.status === 401 || response.status === 403) return { ok: false, reason: 'no_grant' };
    if (response.status === 402) return { ok: false, reason: 'allowance' };
    if (response.status === 409) return { ok: false, reason: 'busy' };
    if (!response.ok) {
      return { ok: false, reason: 'failed', message: await detailOf(response) };
    }
    return finished(await response.text());
  }

  /** Adds `speaker` to the names noesis keeps as the person's voice, where it is not among them already. */
  private async keepSpeaker(token: string, speaker: string): Promise<void> {
    const name = speaker.trim();
    if (!name) return;
    const me = await this.whoIs(token);
    if (!me || me.names.some((kept) => kept.toLowerCase() === name.toLowerCase())) return;
    const doFetch = this.options.fetch ?? fetch;
    const response = await doFetch(new URL('/me/names', this.origin), {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ names: [...me.names, name] }),
    });
    if (!response.ok) throw new Error(`noesis /me/names answered ${response.status}`);
  }

  /** The person's library ids as last read; empty when none is connected. */
  librariesOf(accountId: string): string[] {
    const row = this.row(accountId);
    return row ? parseLibraries(row.libraries) : [];
  }

  /**
   * Reads the person's libraries from noesis again and keeps them; the list,
   * or null when noesis could not be asked (the last one stands).
   */
  async refreshLibraries(accountId: string): Promise<string[] | null> {
    const token = await this.accessToken(accountId);
    if (!token) return null;
    const me = await this.whoIs(token).catch(() => null);
    if (!me) return null;
    this.db
      .prepare('UPDATE noesis_connections SET libraries = ? WHERE account_id = ?')
      .run(JSON.stringify(me.libraries), accountId);
    return me.libraries;
  }

  connected(accountId: string): boolean {
    return this.row(accountId) !== undefined;
  }

  /**
   * A current access token for the account's library, refreshed when within
   * a minute of expiring; null when it has none, or noesis no longer honours it.
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

  /** Revokes at noesis, best effort, and forgets the connection: *Disconnect*, and account deletion. */
  async disconnect(accountId: string): Promise<void> {
    const row = this.row(accountId);
    this.forget(accountId);
    if (!row) return;
    try {
      await this.post('/revoke', { token: this.open(row.refresh_token) });
    } catch (error) {
      this.log?.warn({ err: error }, 'noesis: could not revoke a disconnected grant');
    }
  }

  private forget(accountId: string): void {
    this.access.delete(accountId);
    this.db.prepare('DELETE FROM noesis_connections WHERE account_id = ?').run(accountId);
  }

  private async refresh(accountId: string): Promise<string | null> {
    const row = this.row(accountId);
    if (!row) return null;
    let tokens: TokenResponse | null;
    try {
      tokens = await this.token({ grant_type: 'refresh_token', refresh_token: this.open(row.refresh_token) });
    } catch (error) {
      // noesis unreachable: the press goes without the library, and the grant is kept.
      this.log?.warn({ err: error }, 'noesis: could not refresh a library token');
      return null;
    }
    if (!tokens) {
      this.log?.warn({ accountId }, 'noesis refused a refresh; the connection is dropped');
      this.forget(accountId);
      return null;
    }
    // A refresh keeps the grant's scopes; noesis says so, and an answer without them leaves the last.
    this.db
      .prepare('UPDATE noesis_connections SET refresh_token = ?, scopes = COALESCE(?, scopes) WHERE account_id = ?')
      .run(this.seal(tokens.refresh_token), tokens.scope ?? null, accountId);
    this.access.set(accountId, { token: tokens.access_token, expiresAt: this.now() + tokens.expires_in * 1000 });
    return tokens.access_token;
  }

  /** noesis's token endpoint: the tokens, or null where it refused (4xx). Throws where it could not be reached. */
  private async token(fields: Record<string, string>): Promise<TokenResponse | null> {
    const response = await this.post('/token', fields);
    if (response.status >= 400 && response.status < 500) return null;
    if (!response.ok) throw new Error(`noesis /token answered ${response.status}`);
    const body = (await response.json()) as Partial<TokenResponse>;
    if (!body.access_token || !body.refresh_token || typeof body.expires_in !== 'number') {
      throw new Error('noesis /token answered without tokens');
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

  private async whoIs(
    accessToken: string
  ): Promise<{ user: string; email: string | null; libraries: string[]; names: string[] } | null> {
    const doFetch = this.options.fetch ?? fetch;
    const response = await doFetch(new URL('/me', this.origin), {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!response.ok) return null;
    const body = (await response.json()) as {
      user?: string;
      email?: string | null;
      libraries?: unknown;
      names?: unknown;
    };
    if (!body.user) return null;
    // The person's own only: since 2026-11-07 noesis lists a channel's library
    // too, `thefloor/<handle>`, to each member, and that is the channel's, not
    // theirs to consult or file into as their own.
    const own = `${body.user.toLowerCase()}/`;
    return {
      user: body.user,
      email: body.email ?? null,
      libraries: parseLibraries(body.libraries).filter((id) => id.toLowerCase().startsWith(own)),
      names: parseLibraries(body.names),
    };
  }

  private row(accountId: string): Row | undefined {
    return this.db
      .prepare('SELECT * FROM noesis_connections WHERE account_id = ?')
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

/** A list of strings — library ids, or a person's names — from noesis or from the column; anything else is none. */
function parseLibraries(value: unknown): string[] {
  let list = value;
  if (typeof value === 'string') {
    try {
      list = JSON.parse(value);
    } catch {
      return [];
    }
  }
  return Array.isArray(list) ? list.filter((id): id is string => typeof id === 'string') : [];
}

/**
 * A name noesis's import takes, from the one *Share* gives the file: no
 * separators, no leading dot, not empty, and Markdown, which noesis reads The
 * Floor's text as whatever it is called.
 */
export function noesisFilename(name: string): string {
  const stem = name
    .replace(/[\\/\u0000-\u001f]+/g, '-')
    .replace(/^[.\s]+/, '')
    .replace(/\.(md|txt)$/i, '')
    .trim()
    .slice(0, 120);
  return `${stem || 'The Floor'}.md`;
}

function grants(row: Row, scope: string): boolean {
  return (row.scopes ?? '').split(' ').includes(scope);
}

/**
 * What noesis's import came to, from its server-sent events: the run's `done`,
 * with the files it changed, or its `error`. A run that exits non-zero says
 * why in its last line of output.
 */
export function finished(stream: string): NoesisSent {
  let output = '';
  for (const block of stream.split(/\n\n+/)) {
    const event = /^event: (\w+)$/m.exec(block)?.[1];
    const data = /^data: (.*)$/m.exec(block)?.[1];
    if (!event || data === undefined) continue;
    let payload: { text?: string; exit_code?: number; changed?: Record<string, string>; message?: string };
    try {
      payload = JSON.parse(data);
    } catch {
      continue;
    }
    if (event === 'output') output += payload.text ?? '';
    if (event === 'error') return { ok: false, reason: 'failed', message: payload.message };
    if (event === 'done') {
      if (payload.exit_code === 0) return { ok: true, file: Object.keys(payload.changed ?? {})[0] ?? null };
      const last = output.trim().split('\n').at(-1);
      return { ok: false, reason: 'failed', message: last || undefined };
    }
  }
  return { ok: false, reason: 'failed', message: 'the import ended without saying how' };
}

async function detailOf(response: Response): Promise<string | undefined> {
  try {
    const body = (await response.json()) as { detail?: unknown };
    return typeof body.detail === 'string' ? body.detail : undefined;
  } catch {
    return undefined;
  }
}

interface TokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  /** The scopes granted, space-separated; noesis names them whenever there are any. */
  scope?: string;
}
