import { buildApp, type App } from '../src/app';
import { MemoryMailer } from '../src/mail';

/**
 * Permission to send mail that is not a sign-in code.
 *
 * One checkbox on the sign-in screen writes this and nothing else does, so what
 * matters is the asymmetry: a tick grants, and everything else — a clear box, a
 * client too old to send the field at all — says nothing. The screen is read
 * before anybody is identified and therefore cannot show an existing answer, so
 * reading silence as a refusal would mean the second device somebody signs in
 * on revoked what the first one granted.
 */

let app: App;
let clock = 1_700_000_000_000;

beforeEach(() => {
  clock = 1_700_000_000_000;
  app = buildApp({
    dbPath: ':memory:',
    mailer: new MemoryMailer(),
    now: () => clock,
  });
});

afterEach(async () => {
  app.channels.stop();
  await app.fastify.close();
});

async function signIn(
  identifier: string,
  payload: Record<string, unknown> = {}
) {
  const code = app.accounts.issueCode(identifier, clock)!;
  const verified = await app.fastify.inject({
    method: 'POST',
    url: '/auth/verify',
    payload: { identifier, code, ...payload },
  });
  const { token, account } = verified.json() as {
    token: string;
    account: { id: string };
  };
  return { token, account, row: app.accounts.byId(account.id)! };
}

describe('the sign-in opt-in', () => {
  it('records when permission was given, not merely that it was', async () => {
    const alice = await signIn('anna.k@example.com', { marketingEmail: true });
    expect(alice.row.marketing_email_at).toBe(clock);
  });

  it('leaves an untouched box as no permission at all', async () => {
    const unticked = await signIn('anna.k@example.com', {
      marketingEmail: false,
    });
    expect(unticked.row.marketing_email_at).toBeNull();

    // A client that predates the box says nothing rather than no, and lands in
    // the same place: absent is not a grant either.
    const silent = await signIn('bea@example.com');
    expect(silent.row.marketing_email_at).toBeNull();
  });

  /**
   * The case the asymmetry exists for. Signing in on a second device shows a
   * clear box, because this screen is read before anybody is identified.
   */
  it('is not withdrawn by a later sign-in with the box clear', async () => {
    const granted = await signIn('anna.k@example.com', {
      marketingEmail: true,
    });
    clock += 60_000;
    const again = await signIn('anna.k@example.com');
    expect(again.account.id).toBe(granted.account.id);
    expect(again.row.marketing_email_at).toBe(granted.row.marketing_email_at);
  });

  /** The stamp says when permission was first given, so a second yes is a no-op. */
  it('keeps the first date when the box is ticked again', async () => {
    const first = await signIn('anna.k@example.com', { marketingEmail: true });
    clock += 60_000;
    const second = await signIn('anna.k@example.com', { marketingEmail: true });
    expect(second.row.marketing_email_at).toBe(first.row.marketing_email_at);
  });

  /** Deleting the account ends the permission along with everything else. */
  it('goes when the account is erased', async () => {
    const alice = await signIn('anna.k@example.com', { marketingEmail: true });
    expect(app.accounts.erase(alice.account.id)).toBe(true);
    expect(app.accounts.byId(alice.account.id)!.marketing_email_at).toBeNull();
  });
});

/**
 * The other end of the same permission: Floor Settings, which is behind a
 * session and can therefore show the answer in force — and is consequently the
 * only place it may be taken back.
 */
describe('the Floor Settings switch', () => {
  async function save(token: string, marketingEmail: boolean) {
    return app.fastify.inject({
      method: 'POST',
      url: '/me/settings',
      headers: { authorization: `Bearer ${token}` },
      payload: { marketingEmail },
    });
  }

  it('reads as a boolean though it is stored as a date', async () => {
    const alice = await signIn('anna.k@example.com', { marketingEmail: true });
    expect(app.accounts.settings(alice.account.id).marketingEmail).toBe(true);

    const bea = await signIn('bea@example.com');
    expect(app.accounts.settings(bea.account.id).marketingEmail).toBe(false);
  });

  it('grants, stamping the moment', async () => {
    const alice = await signIn('anna.k@example.com');
    clock += 60_000;
    const saved = await save(alice.token, true);
    expect(saved.statusCode).toBe(200);
    expect(saved.json()).toMatchObject({ marketingEmail: true });
    expect(app.accounts.byId(alice.account.id)!.marketing_email_at).toBe(clock);
  });

  it('withdraws, which is what this screen is for', async () => {
    const alice = await signIn('anna.k@example.com', { marketingEmail: true });
    const saved = await save(alice.token, false);
    expect(saved.json()).toMatchObject({ marketingEmail: false });
    expect(app.accounts.byId(alice.account.id)!.marketing_email_at).toBeNull();
  });

  /**
   * Turning it off and on again is one person saying yes twice, not a consent
   * whose date has quietly moved — the second yes is a new grant, because the
   * first was revoked.
   */
  it('dates a fresh grant after a withdrawal', async () => {
    const alice = await signIn('anna.k@example.com', { marketingEmail: true });
    await save(alice.token, false);
    clock += 60_000;
    await save(alice.token, true);
    expect(app.accounts.byId(alice.account.id)!.marketing_email_at).toBe(clock);
  });

  /** Saying yes again while it already holds leaves the original date alone. */
  it('does not re-date a permission that already holds', async () => {
    const alice = await signIn('anna.k@example.com', { marketingEmail: true });
    const granted = app.accounts.byId(alice.account.id)!.marketing_email_at;
    clock += 60_000;
    await save(alice.token, true);
    expect(app.accounts.byId(alice.account.id)!.marketing_email_at).toBe(
      granted
    );
  });

  it('refuses anything that is not a yes or a no', async () => {
    const alice = await signIn('anna.k@example.com');
    const saved = await app.fastify.inject({
      method: 'POST',
      url: '/me/settings',
      headers: { authorization: `Bearer ${alice.token}` },
      payload: { marketingEmail: 'yes please' },
    });
    expect(saved.statusCode).toBe(400);
    expect(app.accounts.byId(alice.account.id)!.marketing_email_at).toBeNull();
  });
});
