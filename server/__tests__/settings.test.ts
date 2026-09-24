import { buildApp, type App } from '../src/app';
import { MemoryMailer } from '../src/mail';
import {
  DEFAULT_ACCOUNT_SETTINGS,
} from '../../core/settings';

/**
 * The settings that belong to a person rather than to a phone.
 *
 * Everything stored on the Floor Settings screen: the colour scheme, the
 * language, whether the channel screen repeats its footer's controls as cards,
 * whether the experimental features are visible at all, and whether we may
 * write to this person. A tap on a channel was one of them until 2026-09-21.
 * Two more were here and are not — where the channel tabs are drawn, and how
 * loud the channel chimes are — and each has a test below saying that a body
 * still carrying it is ignored rather than refused. There was one more still —
 * holding the hands-free link steady — which was about the headset somebody
 * was wearing and never reached this server, and the last test here is what
 * survives it:
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
      language: 'system',
      hideControlCards: false,
      labs: false,
      marketingEmail: false,
      // The old names as well, which is what stops a build already on a phone
      // reading this answer as its channel settings having been turned over.
      // See settings-wire.ts.
      //
      // `tapToLook` and `tapToStepIn` are constants now rather than anybody's
      // choice: the setting went on 2026-09-21 and the behaviour became
      // unconditional, so what goes out is the one answer there is.
      tapToLook: true,
      tapToStepIn: false,
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
    await save(alice.token, { labs: true });
    await save(alice.token, { appearance: 'light' });
    expect(app.accounts.settings(alice.account.id)).toEqual({
      appearance: 'light',
      language: 'system',
      hideControlCards: false,
      labs: true,
      marketingEmail: false,
    });

    await save(alice.token, { labs: false, hideControlCards: true });
    expect(app.accounts.settings(alice.account.id)).toEqual({
      appearance: 'light',
      language: 'system',
      hideControlCards: true,
      labs: false,
      marketingEmail: false,
    });

    await save(alice.token, { appearance: 'dark' });
    expect(app.accounts.settings(alice.account.id)).toEqual({
      appearance: 'dark',
      language: 'system',
      hideControlCards: true,
      labs: false,
      marketingEmail: false,
    });

    // And the language, which is the newest of them and the one most likely to
    // be clobbered by a screen saving something else.
    await save(alice.token, { language: 'es' });
    expect(app.accounts.settings(alice.account.id)).toEqual({
      appearance: 'dark',
      language: 'es',
      hideControlCards: true,
      labs: false,
      marketingEmail: false,
    });
    await save(alice.token, { appearance: 'light' });
    expect(app.accounts.settings(alice.account.id).language).toBe('es');
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
      hideControlCards: true,
    });
    await save(alice.token, {
      appearance: 'system',
      hideControlCards: false,
    });
    expect(app.accounts.settings(alice.account.id)).toEqual(
      DEFAULT_ACCOUNT_SETTINGS
    );
    const row = app.accounts.byId(alice.account.id)!;
    expect(row.appearance).toBe('system');
    expect(row.hide_control_cards).toBe(0);
  });

  /**
   * The language's own half of the two tests above, which is worth stating
   * rather than folded into them: it is the one setting here whose being wrong
   * makes the rest of the screen unreadable, so a null read as the wrong thing
   * would be the most expensive default on the object.
   */
  it('leaves the language to the phone until somebody says otherwise', async () => {
    const alice = await signIn('user1@example.com', 'Alice');
    expect(app.accounts.settings(alice.account.id).language).toBe('system');
    expect(app.accounts.byId(alice.account.id)!.language).toBeNull();

    await save(alice.token, { language: 'es' });
    expect(app.accounts.settings(alice.account.id).language).toBe('es');
    expect(app.accounts.byId(alice.account.id)!.language).toBe('es');

    // Chosen back, and stored as the choice it is rather than reverted to
    // null, for the reason the scheme's test gives.
    await save(alice.token, { language: 'system' });
    expect(app.accounts.settings(alice.account.id).language).toBe('system');
    expect(app.accounts.byId(alice.account.id)!.language).toBe('system');
  });

  /**
   * Refused rather than coerced, like the scheme. The app's own `stringsFor`
   * answers English for a tag it does not know, which is right for a device's
   * report of itself and wrong for a stored choice: a preference silently read
   * as something else is one nobody can change back.
   */
  it('refuses a language it has no catalogue for, and changes nothing', async () => {
    const alice = await signIn('user1@example.com', 'Alice');
    await save(alice.token, { language: 'es' });
    const response = await save(alice.token, { language: 'fr' });
    expect(response.statusCode).toBe(400);
    expect(app.accounts.settings(alice.account.id).language).toBe('es');
  });

  it('refuses a scheme it could not render, and changes nothing', async () => {
    const alice = await signIn('user1@example.com', 'Alice');
    await save(alice.token, { appearance: 'dark' });
    const response = await save(alice.token, { appearance: 'sepia' });
    expect(response.statusCode).toBe(400);
    expect(app.accounts.settings(alice.account.id).appearance).toBe('dark');
  });

  /**
   * **Ignored rather than refused**, which is the change of 2026-09-21. There
   * is no such setting any more, and a build still drawing the toggle will go
   * on sending one under either name. Answering that with a 400 would turn a
   * setting nobody can change into an error they cannot get past; dropping it
   * leaves the toggle inert and the next settings push asserts the one answer.
   */
  it('ignores a tap setting, whatever it says and whatever it is', async () => {
    const alice = await signIn('user1@example.com', 'Alice');
    expect((await save(alice.token, { tapToLook: false })).statusCode).toBe(200);
    expect((await save(alice.token, { tapToStepIn: true })).statusCode).toBe(200);
    // Not even a non-boolean, which used to be the 400 above: there is nothing
    // to validate a value against when nothing reads it.
    expect((await save(alice.token, { tapToLook: 'yes' })).statusCode).toBe(200);
    // And what goes out is the constant, regardless of any of it.
    const response = await save(alice.token, { tapToStepIn: true });
    expect(response.json()).toMatchObject({ tapToLook: true, tapToStepIn: false });
  });

  it('refuses a card setting that is not a yes or a no', async () => {
    const alice = await signIn('user1@example.com', 'Alice');
    const response = await save(alice.token, { hideControlCards: 'off' });
    expect(response.statusCode).toBe(400);
    expect(app.accounts.settings(alice.account.id).hideControlCards).toBe(
      false
    );
  });

  /**
   * The chime's loudness, which was a setting for a day and is not one now —
   * the app plays at one peak, `CHIME_AMPLITUDE` in the audio-route module.
   * See planning/decisions/2026-09-15-the-chime-has-one-loudness-again.md.
   *
   * Ignored rather than refused, on the tab position's reasoning below: build
   * 211 and earlier have the ladder and send a peak the moment somebody taps a
   * rung, and a 400 would be an error on a screen where nothing went wrong.
   * What comes back does not mention it, and the column it was stored in is
   * dropped at boot.
   */
  it('ignores the chime loudness an installed build still sends', async () => {
    const alice = await signIn('user1@example.com', 'Alice');
    const response = await save(alice.token, {
      appearance: 'dark',
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().chimeAmplitude).toBeUndefined();
    expect(app.accounts.settings(alice.account.id).appearance).toBe('dark');
  });

  /**
   * The tab position, which was a setting for a day and is not one now — the
   * tabs are at the top of the channel screen for everybody. See
   * planning/decisions/2026-09-13-the-channel-tabs-stay-at-the-top.md.
   *
   * Ignored rather than refused, which is the half worth a test: builds 193
   * and earlier still have the card and send this the moment somebody presses
   * it, and a 400 would be an error on a screen where nothing went wrong. An
   * unknown field is left alone here, as it is for anything else a body
   * carries, and what comes back does not mention it.
   */
  it('ignores the tab position an installed build still sends', async () => {
    const alice = await signIn('user1@example.com', 'Alice');
    const response = await save(alice.token, {
      appearance: 'dark',
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().tabsAtFoot).toBeUndefined();
    expect(app.accounts.settings(alice.account.id).appearance).toBe('dark');
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
    await save(alice.token, { appearance: 'dark', hideControlCards: true });
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
      'language',
      'marketingEmail',
      'tapToLook',
      'tapToStepIn',
    ]);
  });

  /**
   * The other half of settings-wire.ts. A build on somebody's phone says
   * `controlCards: false` and means the cards are hidden; read as the new name
   * without negating it, that same body would turn the setting the other way —
   * silently, on the device of somebody who never opened the screen again.
   *
   * Delete this test with the aliases, and not before. Its tap half went on
   * 2026-09-21 with the setting: there is nothing left for either name to turn.
   */
  it('takes the renamed card setting under the name old builds send', async () => {
    const alice = await signIn('user1@example.com', 'Alice');
    await save(alice.token, { controlCards: false });
    expect(app.accounts.settings(alice.account.id)).toEqual({
      appearance: 'system',
      language: 'system',
      hideControlCards: true,
      labs: false,
      marketingEmail: false,
    });

    // And is refused when it is not a boolean, rather than being stored as one.
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
    await save(alice.token, { hideControlCards: true, controlCards: true });
    expect(app.accounts.settings(alice.account.id).hideControlCards).toBe(true);
  });
});
