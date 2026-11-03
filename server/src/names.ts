import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * noesis's register of names, which decides every username here.
 *
 * Since 2026-11-02 noesis is the source of truth for people's names across
 * the applications it serves, and The Floor keeps its own sign-in but not the
 * say over names: a person is the same `@name` here and at noesis, and an
 * address is one name throughout. See
 * `decision/2026-11-02-noesis-decides-every-username.md`.
 *
 * - **Signing up asks noesis for the name** (`nameFor`), which answers with the
 *   address's name if it has one — a noesis account's, or a reservation another
 *   signup made — and otherwise reserves one, from the display name's stem if
 *   free and the address's if not. noesis unreachable means the account cannot
 *   be made; signing in to an existing one never asks.
 * - **Renaming on the Contact screen asks noesis first** (`choose`), which
 *   renames the noesis account too when there is one, libraries and all.
 * - **A rename made at noesis arrives at `/noesis/renamed`**, a POST signed
 *   with this client's secret (`signedByNoesis`), since an account that never
 *   connected has no grant to notice it with.
 * - **An address moves at noesis only while it is a reservation's** (`move`):
 *   a noesis account's address is how its owner signs in there.
 *
 * The register answers this client by its id and secret, as HTTP Basic, on
 * nobody's behalf; noesis's operator marks it with `scripts/client_names.py`.
 * The Floor keeps the case its people type and noesis keeps names lowercase,
 * so the two are the same name compared without case, as usernames here are.
 */
export interface NamesOptions {
  /** noesis's origin. */
  origin: string;
  clientId: string;
  clientSecret: string;
  /** Tests answer for noesis. */
  fetch?: typeof fetch;
}

/** What a change at the register came to: done, or refused with noesis's sentence. */
export type NamesAnswer =
  | { ok: true; user: string }
  | { ok: false; reason: 'taken' | 'busy' | 'invalid' | 'unreachable'; message: string };

const UNREACHABLE = 'noesis, which keeps everybody’s username, did not answer. Try again in a minute.';

export class NoesisNames {
  private fetch: typeof fetch;
  private basic: string;

  constructor(private options: NamesOptions) {
    this.fetch = options.fetch ?? fetch;
    this.basic =
      'Basic ' + Buffer.from(`${options.clientId}:${options.clientSecret}`).toString('base64');
  }

  /**
   * The name noesis gives this address, reserving one if it has none; the
   * suggestions are tried before the address. `null` for something noesis does
   * not take as an address, whose name is then this server's to derive.
   * Throws when noesis cannot be asked.
   */
  async nameFor(email: string, suggest: string[]): Promise<string | null> {
    const answer = await this.call('POST', '/names', { email, suggest });
    if (answer.ok) return answer.user;
    if (answer.reason === 'invalid') return null;
    throw new Error(`noesis: ${answer.message}`);
  }

  /** Makes `user` the address's name at noesis: reserved if it has none, renamed if it has another. */
  choose(email: string, user: string): Promise<NamesAnswer> {
    return this.call('PUT', '/names', { email, user });
  }

  /** Moves the address's reservation to another; refused as `taken` for a noesis account's. */
  async move(email: string, newEmail: string): Promise<NamesAnswer> {
    return this.call('PUT', '/names/address', { email, new_email: newEmail });
  }

  /** Whether a rename's body came from noesis: its HMAC under this client's secret. */
  signedByNoesis(body: string, signature: string | undefined): boolean {
    if (!signature) return false;
    const expected = Buffer.from(
      'sha256=' + createHmac('sha256', this.options.clientSecret).update(body).digest('hex')
    );
    const given = Buffer.from(signature);
    return given.length === expected.length && timingSafeEqual(given, expected);
  }

  private async call(method: string, path: string, body: object): Promise<NamesAnswer> {
    let response: Response;
    try {
      response = await this.fetch(new URL(path, this.options.origin).toString(), {
        method,
        headers: { authorization: this.basic, 'content-type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(10_000),
      });
    } catch {
      return { ok: false, reason: 'unreachable', message: UNREACHABLE };
    }
    const parsed = (await response.json().catch(() => ({}))) as { user?: unknown; detail?: unknown };
    if (response.ok) return { ok: true, user: typeof parsed.user === 'string' ? parsed.user : '' };
    const message = typeof parsed.detail === 'string' ? parsed.detail : UNREACHABLE;
    if (response.status === 409) return { ok: false, reason: 'taken', message };
    if (response.status === 423) return { ok: false, reason: 'busy', message };
    if (response.status === 400) return { ok: false, reason: 'invalid', message };
    return { ok: false, reason: 'unreachable', message: UNREACHABLE };
  }
}
