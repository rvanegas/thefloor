import { buildApp, type App } from '../src/app';
import { MAX_OUTSTANDING, MAX_QUESTION_LENGTH } from '../src/help';

/**
 * Questions asked of The Floor from inside the app.
 *
 * The mechanism is deliberately tiny — a table, two routes, and `bin/help`
 * writing the answer by hand — so what is worth testing is not the machinery
 * but the three things this can get wrong in a way somebody would feel:
 * showing one person another person's questions, taking a question and losing
 * it, and letting one account bury the thing that reads them.
 *
 * The backlog limit is tested against the constant rather than against the
 * number five, so raising it is one edit rather than two and the test cannot
 * pass while disagreeing with the server about what the limit is.
 */

let app: App;
let clock = 1_700_000_000_000;

beforeEach(() => {
  clock = 1_700_000_000_000;
  app = buildApp({ dbPath: ':memory:', now: () => clock });
});

afterEach(async () => {
  app.channels.stop();
  await app.fastify.close();
});

async function signIn(identifier: string) {
  const code = app.accounts.issueCode(identifier, clock)!;
  const verified = await app.fastify.inject({
    method: 'POST',
    url: '/auth/verify',
    payload: { identifier, code },
  });
  return (verified.json() as { token: string; account: { id: string } });
}

const auth = (token: string) => ({ authorization: `Bearer ${token}` });

const ask = (token: string, text: string) =>
  app.fastify.inject({
    method: 'POST',
    url: '/help',
    headers: auth(token),
    payload: { text },
  });

const read = (token: string) =>
  app.fastify.inject({ method: 'GET', url: '/help', headers: auth(token) });

describe('asking', () => {
  it('takes a question and gives it back on the next read', async () => {
    const { token } = await signIn('asker@example.com');

    const asked = await ask(token, 'How do I stop a recording?');
    expect(asked.statusCode).toBe(200);
    expect(asked.json().question).toMatchObject({
      text: 'How do I stop a recording?',
      askedAt: clock,
      answer: null,
      answeredAt: null,
    });

    const view = read(token);
    expect((await view).json().questions).toHaveLength(1);
  });

  it('answers with the stored row rather than what was sent', async () => {
    // The screen puts this straight into its list, so a difference between
    // what is stored and what is answered is a list that changes its mind
    // about what you wrote the next time it is opened.
    const { token } = await signIn('asker@example.com');
    const asked = await ask(token, '  padded on both sides  ');
    expect(asked.json().question.text).toBe('padded on both sides');
  });

  it('refuses an empty question, including one that is only whitespace', async () => {
    const { token } = await signIn('asker@example.com');
    expect((await ask(token, '')).statusCode).toBe(400);
    expect((await ask(token, '   \n  ')).statusCode).toBe(400);
    expect((await read(token)).json().questions).toHaveLength(0);
  });

  it('refuses one over the length', async () => {
    const { token } = await signIn('asker@example.com');
    const refused = await ask(token, 'x'.repeat(MAX_QUESTION_LENGTH + 1));
    expect(refused.statusCode).toBe(400);
    // At the limit exactly, which is the boundary a `>` and a `>=` disagree on.
    expect((await ask(token, 'x'.repeat(MAX_QUESTION_LENGTH))).statusCode).toBe(200);
  });

  it('refuses a question from nobody', async () => {
    const refused = await app.fastify.inject({
      method: 'POST',
      url: '/help',
      payload: { text: 'who am I?' },
    });
    expect(refused.statusCode).toBe(401);
  });
});

describe('the backlog', () => {
  it('stops taking questions once too many are waiting, and says so', async () => {
    const { token } = await signIn('asker@example.com');
    for (let i = 0; i < MAX_OUTSTANDING; i += 1) {
      expect((await ask(token, `question ${i}`)).statusCode).toBe(200);
    }

    const refused = await ask(token, 'one too many');
    expect(refused.statusCode).toBe(400);

    const view = (await read(token)).json();
    expect(view.canAsk).toBe(false);
    // The screen prints this verbatim under a greyed-out button, so an empty
    // one is a control that refuses and gives no reason.
    expect(view.askBlocked).toBeTruthy();
  });

  it('counts the waiting ones only, so an answer frees a slot', async () => {
    const { token, account } = await signIn('asker@example.com');
    for (let i = 0; i < MAX_OUTSTANDING; i += 1) {
      await ask(token, `question ${i}`);
    }

    const [oldest] = app.help.forAccount(account.id).slice(-1);
    expect(app.help.answer(oldest.id, 'Here you go.', clock + 1000)).toBe(true);

    const view = (await read(token)).json();
    expect(view.canAsk).toBe(true);
    expect(view.askBlocked).toBeNull();
    expect((await ask(token, 'another')).statusCode).toBe(200);
  });
});

describe('reading', () => {
  it('shows an answer under the question it belongs to', async () => {
    const { token, account } = await signIn('asker@example.com');
    await ask(token, 'Why is my microphone off?');
    const [question] = app.help.forAccount(account.id);

    app.help.answer(question.id, 'Somebody else has the floor.', clock + 5000);

    const [answered] = (await read(token)).json().questions;
    expect(answered).toMatchObject({
      answer: 'Somebody else has the floor.',
      answeredAt: clock + 5000,
    });
  });

  it('is newest first', async () => {
    const { token } = await signIn('asker@example.com');
    await ask(token, 'first');
    clock += 60_000;
    await ask(token, 'second');

    expect((await read(token)).json().questions.map((q: { text: string }) => q.text))
      .toEqual(['second', 'first']);
  });

  it("never shows one person another person's questions", async () => {
    const asker = await signIn('asker@example.com');
    const other = await signIn('other@example.com');
    await ask(asker.token, 'something about my account');

    expect((await read(other.token)).json().questions).toEqual([]);
  });

  it('refuses to say anything to somebody not signed in', async () => {
    const refused = await app.fastify.inject({ method: 'GET', url: '/help' });
    expect(refused.statusCode).toBe(401);
  });
});

describe('deleting an account', () => {
  it('takes the questions with it', async () => {
    // They are sentences somebody wrote about themselves, usually about their
    // own account. Nothing on the other side of one needs it to survive, and
    // an answer written to a tombstone is not a thing anybody wants to send.
    const { account } = await signIn('leaving@example.com');
    app.help.ask(account.id, 'how do I delete my account?', clock);

    app.accounts.erase(account.id);

    expect(app.help.forAccount(account.id)).toEqual([]);
  });
});
