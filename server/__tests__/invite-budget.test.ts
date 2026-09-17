import { buildApp, type App } from '../src/app';
import { MemoryMailer } from '../src/mail';
import { INVITE_MAX_SENDS, INVITE_SEND_WINDOW_MS } from '../src/accounts';

/**
 * What bounds the mail one account can send to strangers.
 *
 * The cap itself is arithmetic, so the questions worth asking are about what
 * the budget is charged for: an invitation to somebody who already has an
 * account sends push rather than mail and must be free, a duplicate never
 * reaches the mailer and must be free, and a withdrawal must not buy the quota
 * back — that last being the whole reason a cap on *outstanding* invitations
 * was not the answer, since `/contacts/withdraw` is behind an ordinary session.
 */

let app: App;
let mailer: MemoryMailer;
let clock = 1_700_000_000_000;

beforeEach(() => {
  clock = 1_700_000_000_000;
  mailer = new MemoryMailer();
  app = buildApp({ dbPath: ':memory:', mailer, now: () => clock });
});

afterEach(async () => {
  app.channels.stop();
  await app.fastify.close();
});

const auth = (token: string) => ({ authorization: `Bearer ${token}` });

async function signIn(identifier: string, displayName: string) {
  const code = app.accounts.issueCode(identifier, clock)!;
  const verified = await app.fastify.inject({
    method: 'POST',
    url: '/auth/verify',
    payload: { identifier, code, displayName },
  });
  return verified.json() as { token: string; account: { id: string } };
}

type User = Awaited<ReturnType<typeof signIn>>;

const invite = (from: User, identifier: string) =>
  app.fastify.inject({
    method: 'POST',
    url: '/contacts/request',
    headers: auth(from.token),
    payload: { identifier },
  });

const withdraw = (from: User, identifier: string) =>
  app.fastify.inject({
    method: 'POST',
    url: '/contacts/withdraw',
    headers: auth(from.token),
    payload: { identifier },
  });

/** Whether anything on the sender's own list names this address. */
const listed = (user: User, identifier: string) =>
  app.accounts
    .contactsFor(user.account.id)
    .some((entry) => entry.account.displayName === identifier);

/** Spends the whole budget on addresses nobody holds. */
async function spendBudget(user: User) {
  for (let i = 0; i < INVITE_MAX_SENDS; i++) {
    const response = await invite(user, `stranger${i}@example.com`);
    expect(response.statusCode).toBe(200);
  }
}

test('the budget stops the next invitation, and says so plainly', async () => {
  const sender = await signIn('sender@example.com', 'Sender');
  await spendBudget(sender);
  expect(mailer.invited).toHaveLength(INVITE_MAX_SENDS);

  const refused = await invite(sender, 'one-too-many@example.com');
  expect(refused.statusCode).toBe(429);
  expect(refused.json().error).toMatch(/as many invitations as you can today/);

  // No mail, and no row: a refused request must not show as pending on the
  // sender's screen, which is the one state the mistake cannot be corrected
  // from — every retry would answer "Request already sent".
  expect(mailer.invited).toHaveLength(INVITE_MAX_SENDS);
  expect(listed(sender, 'one-too-many@example.com')).toBe(false);
});

test('withdrawing does not buy the quota back', async () => {
  const sender = await signIn('sender@example.com', 'Sender');
  await spendBudget(sender);

  const undone = await withdraw(sender, 'stranger0@example.com');
  expect(undone.statusCode).toBe(200);

  const refused = await invite(sender, 'someone-else@example.com');
  expect(refused.statusCode).toBe(429);
});

test('the window lapses, and the budget comes back whole', async () => {
  const sender = await signIn('sender@example.com', 'Sender');
  await spendBudget(sender);
  expect((await invite(sender, 'blocked@example.com')).statusCode).toBe(429);

  clock += INVITE_SEND_WINDOW_MS;
  const allowed = await invite(sender, 'tomorrow@example.com');
  expect(allowed.statusCode).toBe(200);
  expect(mailer.invited.at(-1)!.to).toBe('tomorrow@example.com');
});

test('a refusal does not push the window out', async () => {
  const sender = await signIn('sender@example.com', 'Sender');
  await spendBudget(sender);

  // Half a day of knocking, and the window still lapses when it always would
  // have. A window the refusals extended would let somebody hold themselves
  // locked out indefinitely by retrying.
  clock += INVITE_SEND_WINDOW_MS / 2;
  expect((await invite(sender, 'knocking@example.com')).statusCode).toBe(429);
  clock += INVITE_SEND_WINDOW_MS / 2;

  expect((await invite(sender, 'after@example.com')).statusCode).toBe(200);
});

test('a duplicate is refused without costing anything', async () => {
  const sender = await signIn('sender@example.com', 'Sender');
  expect((await invite(sender, 'stranger@example.com')).statusCode).toBe(200);

  for (let i = 0; i < INVITE_MAX_SENDS; i++) {
    const again = await invite(sender, 'stranger@example.com');
    expect(again.statusCode).toBe(400);
    expect(again.json().error).toBe('Request already sent.');
  }

  // One invitation went, so one is spent, and the repeats took none of the
  // rest: the remaining budget is exactly what it would have been.
  for (let i = 1; i < INVITE_MAX_SENDS; i++) {
    expect((await invite(sender, `other${i}@example.com`)).statusCode).toBe(200);
  }
  expect((await invite(sender, 'over@example.com')).statusCode).toBe(429);
});

test('inviting somebody who already has an account is free', async () => {
  const sender = await signIn('sender@example.com', 'Sender');
  for (let i = 0; i < INVITE_MAX_SENDS + 5; i++) {
    await signIn(`member${i}@example.com`, `Member ${i}`);
    const response = await invite(sender, `member${i}@example.com`);
    expect(response.statusCode).toBe(200);
  }

  // Nothing was mailed, so nothing was charged. The budget is over mail rather
  // than over asking, and a request to an account is a push.
  expect(mailer.invited).toHaveLength(0);
  expect((await invite(sender, 'stranger@example.com')).statusCode).toBe(200);
});

test('the budget is per sender, not global', async () => {
  const first = await signIn('first@example.com', 'First');
  const second = await signIn('second@example.com', 'Second');
  await spendBudget(first);

  expect((await invite(first, 'blocked@example.com')).statusCode).toBe(429);
  expect((await invite(second, 'fine@example.com')).statusCode).toBe(200);
});

test('a failed send is charged, and still leaves no row behind', async () => {
  const sender = await signIn('sender@example.com', 'Sender');
  jest
    .spyOn(mailer, 'sendInvite')
    .mockRejectedValueOnce(new Error('SES said no'));

  const failed = await invite(sender, 'unreachable@example.com');
  expect(failed.statusCode).toBe(502);

  // Charged: the undo below exists so a sender can correct a mistake, and
  // refunding the count would make a provoked failure the way around the cap.
  for (let i = 1; i < INVITE_MAX_SENDS; i++) {
    expect((await invite(sender, `stranger${i}@example.com`)).statusCode).toBe(
      200
    );
  }
  expect((await invite(sender, 'over@example.com')).statusCode).toBe(429);

  // The request itself is gone even so, so it can be tried again tomorrow.
  expect(listed(sender, 'unreachable@example.com')).toBe(false);
});

test('a server with no mailer refuses without charging', async () => {
  app.channels.stop();
  await app.fastify.close();
  app = buildApp({ dbPath: ':memory:', now: () => clock });

  const sender = await signIn('sender@example.com', 'Sender');
  const unavailable = await invite(sender, 'stranger@example.com');
  expect(unavailable.statusCode).toBe(503);

  // Nothing was sent, so nothing was spent: the count is charged at the
  // attempt, and this never became one.
  expect(app.accounts.spendInviteSend(sender.account.id, clock)).toBe(true);
});

test('the sweep clears a lapsed window and the budget still works', async () => {
  const sender = await signIn('sender@example.com', 'Sender');
  await spendBudget(sender);

  clock += INVITE_SEND_WINDOW_MS + 1;
  app.accounts.sweepExpired(clock);

  expect((await invite(sender, 'tomorrow@example.com')).statusCode).toBe(200);
});

test('erasing an account takes its budget row with it', async () => {
  const sender = await signIn('sender@example.com', 'Sender');
  await invite(sender, 'stranger@example.com');

  // The row is a foreign key onto the account, so leaving it would refuse the
  // deletion outright rather than merely orphan something.
  expect(app.accounts.erase(sender.account.id)).toBe(true);
});
