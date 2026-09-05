import { buildApp, type App } from '../src/app';
import { MemoryMailer } from '../src/mail';
import { DEFAULT_ACCOUNT_SETTINGS } from '../../core/settings';

/**
 * The settings that belong to a person rather than to a phone.
 *
 * Three of the four on the Home settings screen: the colour scheme, whether a
 * tap on a channel steps into it, and whether the channel screen repeats its
 * footer's controls as cards. The fourth — holding the hands-free link
 * steady — is about the headset somebody is wearing and never reaches this
 * server at all, which is what the last test here is for: it is easy to add a
 * field to a route and hard to notice one that has quietly been let in.
 *
 * The socket half is in ws.test.ts, where the client that can read a push
 * already lives.
 */

let app: App;
const clock = 1_700_000_000_000;

beforeEach(() => {
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

const auth = (token: string) => ({ authorization: `Bearer ${token}` });

async function signIn(identifier: string, displayName: string) {
  const code = app.accounts.issueCode(identifier, clock)!;
  const verified = await app.fastify.inject({
    method: 'POST',
    url: '/auth/verify',
    payload: { identifier, code, displayName },
  });
  return verified.json() as {
    token: string;
    account: { id: string; displayName: string };
  };
}

const save = (token: string, payload: Record<string, unknown>) =>
  app.fastify.inject({
    method: 'POST',
    url: '/me/settings',
    headers: auth(token),
    payload,
  });

describe('the settings that follow the account', () => {
  it('gives somebody who has never chosen the defaults', async () => {
    const alice = await signIn('user1@example.com', 'Alice');
    expect(app.accounts.settings(alice.account.id)).toEqual(
      DEFAULT_ACCOUNT_SETTINGS
    );
  });

  it('answers with the whole of it, not the half that was sent', async () => {
    const alice = await signIn('user1@example.com', 'Alice');
    const response = await save(alice.token, { appearance: 'dark' });
    expect(response.statusCode).toBe(200);
    // The tap is in the answer though nothing was said about it: the caller's
    // next move is to tell every device this account holds, and a partial
    // answer would make each of them merge.
    expect(response.json()).toEqual({
      appearance: 'dark',
      tapToStepIn: true,
      controlCards: true,
    });
  });

  /**
   * The property `POST /me` has for the same reason: a screen saving one
   * setting must not blank the other. Both orders, because a partial write
   * that clobbers is easy to write in a way that only shows up one way round.
   */
  it('leaves alone what a write did not mention', async () => {
    const alice = await signIn('user1@example.com', 'Alice');
    await save(alice.token, { tapToStepIn: false });
    await save(alice.token, { appearance: 'light' });
    expect(app.accounts.settings(alice.account.id)).toEqual({
      appearance: 'light',
      tapToStepIn: false,
      controlCards: true,
    });

    await save(alice.token, { tapToStepIn: true, controlCards: false });
    expect(app.accounts.settings(alice.account.id)).toEqual({
      appearance: 'light',
      tapToStepIn: true,
      controlCards: false,
    });

    await save(alice.token, { appearance: 'dark' });
    expect(app.accounts.settings(alice.account.id)).toEqual({
      appearance: 'dark',
      tapToStepIn: true,
      controlCards: false,
    });
  });

  /**
   * Choosing the default back is an act, and the row it writes is what the
   * account's other devices are then told about. Storing it as itself rather
   * than reverting to null is what keeps "I chose system" from being read as
   * "never opened the screen" the day either default moves.
   */
  it('stores a choice of the default as a choice', async () => {
    const alice = await signIn('user1@example.com', 'Alice');
    await save(alice.token, {
      appearance: 'dark',
      tapToStepIn: false,
      controlCards: false,
    });
    await save(alice.token, {
      appearance: 'system',
      tapToStepIn: true,
      controlCards: true,
    });
    expect(app.accounts.settings(alice.account.id)).toEqual(
      DEFAULT_ACCOUNT_SETTINGS
    );
    const row = app.accounts.byId(alice.account.id)!;
    expect(row.appearance).toBe('system');
    expect(row.tap_to_step_in).toBe(1);
    expect(row.control_cards).toBe(1);
  });

  it('refuses a scheme it could not render, and changes nothing', async () => {
    const alice = await signIn('user1@example.com', 'Alice');
    await save(alice.token, { appearance: 'dark' });
    const response = await save(alice.token, { appearance: 'sepia' });
    expect(response.statusCode).toBe(400);
    expect(app.accounts.settings(alice.account.id).appearance).toBe('dark');
  });

  it('refuses a tap that is not a yes or a no', async () => {
    const alice = await signIn('user1@example.com', 'Alice');
    const response = await save(alice.token, { tapToStepIn: 'yes' });
    expect(response.statusCode).toBe(400);
    expect(app.accounts.settings(alice.account.id).tapToStepIn).toBe(true);
  });

  it('refuses a card setting that is not a yes or a no', async () => {
    const alice = await signIn('user1@example.com', 'Alice');
    const response = await save(alice.token, { controlCards: 'off' });
    expect(response.statusCode).toBe(400);
    expect(app.accounts.settings(alice.account.id).controlCards).toBe(true);
  });

  it('is nobody else’s', async () => {
    const alice = await signIn('user1@example.com', 'Alice');
    const bob = await signIn('user2@example.com', 'Bob');
    await save(alice.token, { appearance: 'dark', tapToStepIn: false });
    expect(app.accounts.settings(bob.account.id)).toEqual(
      DEFAULT_ACCOUNT_SETTINGS
    );
  });

  it('is refused to anybody who is not signed in', async () => {
    const response = await app.fastify.inject({
      method: 'POST',
      url: '/me/settings',
      payload: { appearance: 'dark' },
    });
    expect(response.statusCode).toBe(401);
  });

  /**
   * A field nobody validates is a field that gets stored the first time
   * somebody's client sends it, so the account's settings are the ones named
   * here and nothing else.
   *
   * This guarded a real key until 2026-09-05: `steadyHeadset` was the phone's
   * rather than the person's, and this is where that stopped being a comment
   * and started being enforced. The setting is gone and the guard is not — an
   * unknown key is the general case and was always what this tested.
   */
  it('takes no notice of a key it does not know', async () => {
    const alice = await signIn('user1@example.com', 'Alice');
    const response = await save(alice.token, {
      appearance: 'dark',
      somethingTheDeviceKeeps: true,
    });
    expect(response.statusCode).toBe(200);
    expect(Object.keys(response.json()).sort()).toEqual([
      'appearance',
      'controlCards',
      'tapToStepIn',
    ]);
  });
});
