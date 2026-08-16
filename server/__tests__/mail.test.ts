import { buildApp, type App } from '../src/app';
import { MemoryMailer, isEmailAddress } from '../src/mail';
import { OTP_RESEND_INTERVAL_MS } from '../src/accounts';

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

const requestCode = (identifier: string) =>
  app.fastify.inject({
    method: 'POST',
    url: '/auth/request-code',
    payload: { identifier },
  });

const verify = (identifier: string, code: string, displayName?: string) =>
  app.fastify.inject({
    method: 'POST',
    url: '/auth/verify',
    payload: { identifier, code, displayName },
  });

describe('identifier routing', () => {
  it.each([
    ['someone@example.com', true],
    ['a.b+tag@sub.example.co.uk', true],
    ['+15550000001', false],
    ['not an email', false],
    ['@example.com', false],
    ['someone@', false],
  ])('%s -> email: %s', (identifier, expected) => {
    expect(isEmailAddress(identifier)).toBe(expected);
  });

  it('rejects anything that is not an email, without mentioning phones', async () => {
    // Sign-in is email-only and the interface says so nowhere else; an error
    // that raised the possibility of texting would be the one place it leaked.
    const response = await requestCode('+15550000001');
    expect(response.statusCode).toBe(400);
    expect(response.json().code).toBe('invalid_identifier');
    expect(response.payload.toLowerCase()).not.toMatch(/sms|text message|phone/);
    expect(mailer.sent).toHaveLength(0);
  });
});

describe('sending a code', () => {
  it('emails a six-digit code that then signs the user in', async () => {
    const response = await requestCode('someone@example.com');
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ sent: true });

    expect(mailer.sent).toHaveLength(1);
    expect(mailer.sent[0].to).toBe('someone@example.com');
    expect(mailer.sent[0].code).toMatch(/^\d{6}$/);

    const signedIn = await verify(
      'someone@example.com',
      mailer.sent[0].code,
      'Someone'
    );
    expect(signedIn.statusCode).toBe(200);
    expect(signedIn.json().account.displayName).toBe('Someone');
  });

  it('never returns the code to the caller', async () => {
    const response = await requestCode('someone@example.com');
    expect(response.payload).not.toContain(mailer.sent[0].code);
  });

  it('throttles repeat requests without revealing that it did', async () => {
    await requestCode('someone@example.com');
    const second = await requestCode('someone@example.com');

    // Same response as the first, so the endpoint cannot be used to probe
    // whether an address was recently asked about.
    expect(second.statusCode).toBe(200);
    expect(second.json()).toEqual({ sent: true });
    expect(mailer.sent).toHaveLength(1);
  });

  it('sends again once the throttle window passes', async () => {
    await requestCode('someone@example.com');
    clock += OTP_RESEND_INTERVAL_MS + 1;
    await requestCode('someone@example.com');
    expect(mailer.sent).toHaveLength(2);
    expect(mailer.sent[0].code).not.toBe(mailer.sent[1].code);
  });

  it('invalidates the earlier code when a new one is sent', async () => {
    await requestCode('someone@example.com');
    const first = mailer.sent[0].code;
    clock += OTP_RESEND_INTERVAL_MS + 1;
    await requestCode('someone@example.com');

    expect((await verify('someone@example.com', first)).statusCode).toBe(401);
    expect(
      (await verify('someone@example.com', mailer.sent[1].code)).statusCode
    ).toBe(200);
  });
});

describe('inviting an address with no account', () => {
  /** Signs somebody in and returns their bearer token. */
  async function signIn(identifier: string, displayName: string) {
    const code = app.accounts.issueCode(identifier, clock)!;
    const body = (await verify(identifier, code, displayName)).json() as {
      token: string;
      account: { id: string };
    };
    return body;
  }

  const request = (token: string, identifier: string) =>
    app.fastify.inject({
      method: 'POST',
      url: '/contacts/request',
      headers: { authorization: `Bearer ${token}` },
      payload: { identifier },
    });

  it('emails an invitation naming the sender', async () => {
    const alice = await signIn('alice@example.com', 'Alice');

    const sent = await request(alice.token, 'stranger@example.com');
    expect(sent.statusCode).toBe(200);

    expect(mailer.invited).toHaveLength(1);
    expect(mailer.invited[0].to).toBe('stranger@example.com');
    expect(mailer.invited[0].from).toBe('Alice');
    // Attribution in the body, not only in the metadata: an invitation that
    // does not say who sent it is indistinguishable from spam.
    expect(mailer.invited[0].body).toContain('Alice');
    // And a way out that costs nothing, because the recipient never asked.
    expect(mailer.invited[0].body).toContain('ignore this email');
  });

  /**
   * The sender's address is theirs to give out. The invitation carries the
   * display name the app would have shown and nothing else — otherwise typing
   * an address into the contact field would be a way to hand yours to a
   * stranger who never agreed to receive it.
   */
  it('never puts the sender’s address in the invitation', async () => {
    const alice = await signIn('alice@example.com', 'Alice');
    await request(alice.token, 'stranger@example.com');
    expect(mailer.invited[0].body).not.toContain('alice@example.com');
  });

  it('does not email somebody who already has an account', async () => {
    const alice = await signIn('alice@example.com', 'Alice');
    await signIn('bob@example.com', 'Bob');

    const sent = await request(alice.token, 'bob@example.com');
    expect(sent.statusCode).toBe(200);
    expect(mailer.invited).toHaveLength(0);
  });

  /**
   * A phone number reaches nobody now that the invitation is a message rather
   * than a row, and the pending_invites row it would leave behind is permanent.
   */
  it('refuses a phone number, and writes nothing', async () => {
    const alice = await signIn('alice@example.com', 'Alice');

    const refused = await request(alice.token, '+15550000009');
    expect(refused.statusCode).toBe(400);
    expect(mailer.invited).toHaveLength(0);
    expect(app.accounts.contactsFor(alice.account.id)).toHaveLength(0);
  });

  /**
   * The row and the email stand or fall together. Leaving the row behind after
   * a failed send would show the sender a pending request, answer every retry
   * with "Request already sent", and never reach anybody — the one state the
   * mistake cannot be corrected from.
   */
  it('leaves no pending invite behind when the send fails', async () => {
    const broken = buildApp({
      dbPath: ':memory:',
      now: () => clock,
      mailer: {
        async sendCode() {},
        async sendInvite() {
          throw new Error('SES said no');
        },
      },
    });
    const code = broken.accounts.issueCode('alice@example.com', clock)!;
    const alice = (
      await broken.fastify.inject({
        method: 'POST',
        url: '/auth/verify',
        payload: { identifier: 'alice@example.com', code, displayName: 'Alice' },
      })
    ).json() as { token: string; account: { id: string } };

    const failed = await broken.fastify.inject({
      method: 'POST',
      url: '/contacts/request',
      headers: { authorization: `Bearer ${alice.token}` },
      payload: { identifier: 'stranger@example.com' },
    });
    expect(failed.statusCode).toBe(502);
    expect(broken.accounts.contactsFor(alice.account.id)).toHaveLength(0);

    broken.channels.stop();
    await broken.fastify.close();
  });
});

describe('transport failure', () => {
  it('reports failure rather than claiming a code was sent', async () => {
    const broken = buildApp({
      dbPath: ':memory:',
      now: () => clock,
      mailer: {
        async sendCode() {
          throw new Error('SES said no');
        },
        async sendInvite() {
          throw new Error('SES said no');
        },
      },
    });
    const response = await broken.fastify.inject({
      method: 'POST',
      url: '/auth/request-code',
      payload: { identifier: 'someone@example.com' },
    });
    expect(response.statusCode).toBe(502);
    broken.channels.stop();
    await broken.fastify.close();
  });

  it('refuses sign-in entirely when no mailer is configured', async () => {
    const noMail = buildApp({ dbPath: ':memory:', now: () => clock });
    const response = await noMail.fastify.inject({
      method: 'POST',
      url: '/auth/request-code',
      payload: { identifier: 'someone@example.com' },
    });
    expect(response.statusCode).toBe(503);
    noMail.channels.stop();
    await noMail.fastify.close();
  });
});
