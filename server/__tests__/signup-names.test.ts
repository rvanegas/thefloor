import { buildApp, type App } from '../src/app';
import { MemoryMailer } from '../src/mail';

/**
 * What an account is called the moment it exists.
 *
 * The derivations themselves are `core/derivedNames.ts`'s tests; what is here
 * is the part only a database can answer — that a name is written at signup,
 * that two people called the same thing both end up with a username, and that
 * neither is touched again afterwards.
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

async function signIn(identifier: string, displayName?: string) {
  const code = app.accounts.issueCode(identifier, clock)!;
  const verified = await app.fastify.inject({
    method: 'POST',
    url: '/auth/verify',
    payload: { identifier, code, displayName },
  });
  const { token, account } = verified.json() as {
    token: string;
    account: { id: string; displayName: string };
  };
  return { token, account, row: app.accounts.byId(account.id)! };
}

describe('signing up with no name given', () => {
  it('is named out of the address rather than after it', async () => {
    const alice = await signIn('anna.k@example.com');
    expect(alice.account.displayName).toBe('Anna K');
    expect(alice.row.display_name).toBe('Anna K');
  });

  it('gets a username from the name it was just given', async () => {
    const alice = await signIn('anna.k@example.com');
    expect(alice.row.username).toBe('anna_k');
  });
});

describe('signing up with a name', () => {
  it('keeps the name and derives the username from it', async () => {
    const alice = await signIn('rvanegas@gmail.com', 'Anna Kowalski');
    expect(alice.account.displayName).toBe('Anna Kowalski');
    expect(alice.row.username).toBe('anna_kowalski');
  });

  it('falls back to the address when the name offers no stem', async () => {
    // A name in a script the username alphabet has nothing for. The address is
    // ASCII by construction, so there is always something to fall back to.
    const mei = await signIn('mei@example.com', '芽衣');
    expect(mei.account.displayName).toBe('芽衣');
    // Numbered because `mei` is a character short of the username floor, not
    // because anybody else has it.
    expect(mei.row.username).toBe('mei1');
  });
});

describe('two people with the same name', () => {
  it('numbers the second rather than leaving her without one', async () => {
    const first = await signIn('alice@example.com', 'Alice');
    const second = await signIn('alice@work.example.com', 'Alice');
    expect(first.row.username).toBe('alice');
    expect(second.row.username).toBe('alice2');
  });

  it('gives up after a run of them, which costs nobody a signup', async () => {
    for (let n = 0; n < 10; n += 1) {
      await signIn(`alice${n}@example.com`, 'Alice');
    }
    const eleventh = await signIn('alice-again@example.com', 'Alice');
    // No username, which is the state every account was in before this
    // existed — and a signin that worked, which is the point.
    expect(eleventh.row.username).toBeNull();
    expect(eleventh.account.displayName).toBe('Alice');
  });

  it('does not hand out a username somebody has already chosen', async () => {
    const anna = await signIn('anna@example.com', 'Anna Other');
    await app.fastify.inject({
      method: 'POST',
      url: '/me',
      headers: { authorization: `Bearer ${anna.token}` },
      payload: { username: 'Bob_K' },
    });

    const bob = await signIn('bob@example.com', 'Bob K');
    // Folded, so his `bob_k` is her `Bob_K` and the index refuses it.
    expect(bob.row.username).toBe('bob_k2');
  });
});

describe('afterwards', () => {
  it('leaves the username alone when the name is corrected', async () => {
    // Somebody may be holding the invite link built out of it.
    const alice = await signIn('alice@example.com', 'Alice');
    await app.fastify.inject({
      method: 'POST',
      url: '/me',
      headers: { authorization: `Bearer ${alice.token}` },
      payload: { displayName: 'Alice Nkemdirim' },
    });
    expect(app.accounts.byId(alice.account.id)!.username).toBe('alice');
  });

  it('leaves the username alone when signing in renames the account', async () => {
    const alice = await signIn('alice@example.com', 'Alice');
    const again = await signIn('alice@example.com', 'Alice Nkemdirim');
    expect(again.row.display_name).toBe('Alice Nkemdirim');
    expect(again.row.username).toBe('alice');
  });

  it('does not give one to an account that predates this', async () => {
    // The derivation runs at creation and nowhere else, so a sign-in by
    // somebody who gave their username up does not quietly hand it back.
    const alice = await signIn('alice@example.com', 'Alice');
    await app.fastify.inject({
      method: 'POST',
      url: '/me',
      headers: { authorization: `Bearer ${alice.token}` },
      payload: { username: '' },
    });
    const again = await signIn('alice@example.com');
    expect(again.row.username).toBeNull();
  });
});
