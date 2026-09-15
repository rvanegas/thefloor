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
