import { buildApp, type App } from '../src/app';
import { MemoryMailer } from '../src/mail';
import { DEFAULT_ACCOUNT_SETTINGS } from '../../core/settings';

/**
 * The settings that belong to a person rather than to a phone.
 *
 * All five on the Floor Settings screen: the colour scheme, whether a tap on a
 * channel steps into it, whether the channel screen repeats its footer's
 * controls as cards, where that screen's tabs are drawn, and whether the
 * experimental features are visible at all. There was one more — holding the
 * hands-free link steady — which was about the headset somebody was wearing
 * and never reached this server, and the last test here is what survives it:
 * it is easy to add a field to a route and hard to notice one that has
 * quietly been let in.
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
  // The one setting whose untouched case is a coin toss rather than a fixed
  // default — where the channel tabs go. Pinned to the top here so that every
  // test below is about the thing it says it is about; the toss itself has its
  // own tests, which are the only ones that touch this again.
  app.accounts.coin = () => false;
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

  /**
   * Except for the tabs, which are a coin toss for anybody who has never said
   * — half of new accounts get them above the footer, and what is being
   * learnt is which half then goes and changes it. See `tabsAtFootFor`.
   */
  it('tosses for the tab position rather than defaulting it', async () => {
    app.accounts.coin = () => true;
    const alice = await signIn('user1@example.com', 'Alice');
    expect(app.accounts.settings(alice.account.id).tabsAtFoot).toBe(true);
  });

  /**
   * And tosses once. A preference that came back different on the next
   * connection is not an experiment, it is a screen that moves its tabs while
   * somebody is using it — and the other device of the same account has to be
   * told what this one was.
   */
  it('remembers how the toss landed rather than tossing again', async () => {
    let tosses = 0;
    app.accounts.coin = () => {
      tosses += 1;
      return true;
    };
    const alice = await signIn('user1@example.com', 'Alice');
    expect(app.accounts.settings(alice.account.id).tabsAtFoot).toBe(true);
    app.accounts.coin = () => false;
    expect(app.accounts.settings(alice.account.id).tabsAtFoot).toBe(true);
    expect(tosses).toBe(1);
  });

  /** And a choice beats the toss, in either direction. */
  it('takes a choice over the toss it had already made', async () => {
    app.accounts.coin = () => true;
    const alice = await signIn('user1@example.com', 'Alice');
    expect(app.accounts.settings(alice.account.id).tabsAtFoot).toBe(true);
    await save(alice.token, { tabsAtFoot: false });
    expect(app.accounts.settings(alice.account.id).tabsAtFoot).toBe(false);
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
      tapToLook: false,
      hideControlCards: false,
      tabsAtFoot: false,
      labs: false,
      // The two old names as well, which is what stops a build already on a
      // phone reading this answer as both of its channel settings having been
      // turned over. See settings-wire.ts.
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
    await save(alice.token, { tapToLook: true });
    await save(alice.token, { appearance: 'light' });
    expect(app.accounts.settings(alice.account.id)).toEqual({
      appearance: 'light',
      tapToLook: true,
      hideControlCards: false,
      tabsAtFoot: false,
      labs: false,
    });

    await save(alice.token, { tapToLook: false, hideControlCards: true });
    expect(app.accounts.settings(alice.account.id)).toEqual({
      appearance: 'light',
      tapToLook: false,
      hideControlCards: true,
      tabsAtFoot: false,
      labs: false,
    });

    await save(alice.token, { appearance: 'dark' });
    expect(app.accounts.settings(alice.account.id)).toEqual({
      appearance: 'dark',
      tapToLook: false,
      hideControlCards: true,
      tabsAtFoot: false,
      labs: false,
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
      tapToLook: true,
      hideControlCards: true,
      tabsAtFoot: true,
    });
    await save(alice.token, {
      appearance: 'system',
      tapToLook: false,
      hideControlCards: false,
      tabsAtFoot: false,
    });
    expect(app.accounts.settings(alice.account.id)).toEqual(
      DEFAULT_ACCOUNT_SETTINGS
    );
    const row = app.accounts.byId(alice.account.id)!;
    expect(row.appearance).toBe('system');
    expect(row.tap_to_look).toBe(0);
    expect(row.hide_control_cards).toBe(0);
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
    const response = await save(alice.token, { tapToLook: 'yes' });
    expect(response.statusCode).toBe(400);
    expect(app.accounts.settings(alice.account.id).tapToLook).toBe(false);
  });

  it('refuses a card setting that is not a yes or a no', async () => {
    const alice = await signIn('user1@example.com', 'Alice');
    const response = await save(alice.token, { hideControlCards: 'off' });
    expect(response.statusCode).toBe(400);
    expect(app.accounts.settings(alice.account.id).hideControlCards).toBe(
      false
    );
  });

  // The newest of them, and the one with no old name to be read under: it
  // shipped after the 2026-09-07 turn, so a body may say it exactly one way.
  it('refuses a tab position that is not a yes or a no', async () => {
    const alice = await signIn('user1@example.com', 'Alice');
    const response = await save(alice.token, { tabsAtFoot: 'bottom' });
    expect(response.statusCode).toBe(400);
    expect(app.accounts.settings(alice.account.id).tabsAtFoot).toBe(false);
  });

  it('refuses a Labs setting that is not a yes or a no', async () => {
    const alice = await signIn('user1@example.com', 'Alice');
    const response = await save(alice.token, { labs: 'on' });
    expect(response.statusCode).toBe(400);
    expect(app.accounts.settings(alice.account.id).labs).toBe(false);
  });

  /**
   * Worth its own test although all three booleans now default off and store
   * the same way: a default read the wrong way round here would put the
   * experimental features in front of every account that has never opened
   * this screen, which is all of them, and one of them spends money.
   */
  it('leaves Labs off until somebody asks for it, and remembers that they did', async () => {
    const alice = await signIn('user1@example.com', 'Alice');
    expect(app.accounts.settings(alice.account.id).labs).toBe(false);
    expect(app.accounts.byId(alice.account.id)!.labs).toBeNull();

    await save(alice.token, { labs: true });
    expect(app.accounts.settings(alice.account.id).labs).toBe(true);
    expect(app.accounts.byId(alice.account.id)!.labs).toBe(1);

    await save(alice.token, { labs: false });
    expect(app.accounts.settings(alice.account.id).labs).toBe(false);
    // Stored as a choice rather than reverted to null, for the reason the
    // test above gives about the other two.
    expect(app.accounts.byId(alice.account.id)!.labs).toBe(0);
  });

  it('is nobody else’s', async () => {
    const alice = await signIn('user1@example.com', 'Alice');
    const bob = await signIn('user2@example.com', 'Bob');
    await save(alice.token, { appearance: 'dark', tapToLook: true });
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
      // The two names builds already installed know, which go out beside the
      // current ones until the compatibility floor has passed them.
      'controlCards',
      'hideControlCards',
      'labs',
      'tabsAtFoot',
      'tapToLook',
      'tapToStepIn',
    ]);
  });

  /**
   * The other half of settings-wire.ts, and the half that matters most: a
   * build on somebody's phone says `tapToStepIn: false` and means the tap
   * should only look. Read as the new name without negating it, that same body
   * would turn the setting the other way — silently, on the device of somebody
   * who never opened the screen again to notice.
   *
   * Delete this test with the aliases, and not before.
   */
  it('takes the two renamed settings under the names old builds send', async () => {
    const alice = await signIn('user1@example.com', 'Alice');
    await save(alice.token, { tapToStepIn: false, controlCards: false });
    expect(app.accounts.settings(alice.account.id)).toEqual({
      appearance: 'system',
      tapToLook: true,
      hideControlCards: true,
      tabsAtFoot: false,
      labs: false,
    });

    await save(alice.token, { tapToStepIn: true });
    expect(app.accounts.settings(alice.account.id).tapToLook).toBe(false);
    // And is refused the same way when it is not a boolean, rather than being
    // stored as one.
    const response = await save(alice.token, { controlCards: 'off' });
    expect(response.statusCode).toBe(400);
    expect(app.accounts.settings(alice.account.id).hideControlCards).toBe(true);
  });

  /**
   * Nothing sends both names, but a body is whatever arrives. The current one
   * wins, on the grounds that it is the one the sender knew was current.
   */
  it('prefers the current name when a body carries both', async () => {
    const alice = await signIn('user1@example.com', 'Alice');
    await save(alice.token, { tapToLook: true, tapToStepIn: true });
    expect(app.accounts.settings(alice.account.id).tapToLook).toBe(true);
  });
});
