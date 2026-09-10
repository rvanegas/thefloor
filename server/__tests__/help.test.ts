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

/**
 * Writing an answer and sending it are two moves, and all of this is about the
 * gap between them. `bin/help` is the only thing that drives it, so what is
 * worth testing here is the pair of columns rather than the script: that a
 * draft reaches nobody, that it goes on counting as unanswered, and that
 * publishing moves it rather than copying it.
 */
describe('drafting an answer', () => {
  const draftOf = (id: string) =>
    app.db
      .prepare('SELECT answer_draft, drafted_at FROM help_questions WHERE id = ?')
      .get(id) as unknown as {
      answer_draft: string | null;
      drafted_at: number | null;
    };

  const askOne = async (text: string) => {
    const { token, account } = await signIn('asker@example.com');
    await ask(token, text);
    const [question] = app.help.forAccount(account.id);
    return { token, account, question };
  };

  it('shows the asker nothing at all until it is published', async () => {
    // The failure the whole split exists to prevent: a half-written sentence
    // about somebody's own account, read by them before anybody decided it was
    // finished. Asserted over the whole serialised view rather than over the
    // two fields, because a draft leaking through some third key would satisfy
    // the narrower test and still be the thing that went wrong.
    const { token, question } = await askOne('Why is my microphone off?');

    expect(
      app.help.draft(question.id, 'Somebody else has the floor.', clock + 1000)
    ).toBe(true);

    const view = (await read(token)).json();
    expect(view.questions[0]).toMatchObject({ answer: null, answeredAt: null });
    expect(JSON.stringify(view)).not.toContain('Somebody else has the floor.');
  });

  it('is still an unanswered question while it sits there', async () => {
    // Nobody is less waiting on us because somebody has started typing, so a
    // draft must not quietly hand back the slot its question was occupying.
    const { token, account } = await signIn('waiting@example.com');
    for (let i = 0; i < MAX_OUTSTANDING; i += 1) {
      await ask(token, `question ${i}`);
    }
    const [oldest] = app.help.forAccount(account.id).slice(-1);

    app.help.draft(oldest.id, 'nearly ready', clock + 1000);
    expect((await read(token)).json().canAsk).toBe(false);

    expect(app.help.publish(oldest.id, clock + 2000)).toBe('published');
    expect((await read(token)).json().canAsk).toBe(true);
  });

  it('publishes what was drafted, stamped when it was sent', async () => {
    const { token, question } = await askOne('How do I stop a recording?');
    app.help.draft(question.id, 'Tap the floor once more.', clock + 1000);

    expect(app.help.publish(question.id, clock + 9000)).toBe('published');

    expect((await read(token)).json().questions[0]).toMatchObject({
      answer: 'Tap the floor once more.',
      // When it was sent, not when it was written. The asker is being told
      // when this reached them, and the two can be days apart.
      answeredAt: clock + 9000,
    });
  });

  it('moves the draft rather than copying it', async () => {
    // A draft beside a published answer has to mean an edit in progress. Left
    // behind as a copy it would mean that on every answered question there has
    // ever been, and the distinction would say nothing.
    const { question } = await askOne('anything');
    app.help.draft(question.id, 'the answer', clock + 1000);
    app.help.publish(question.id, clock + 2000);

    expect(draftOf(question.id)).toMatchObject({
      answer_draft: null,
      drafted_at: null,
    });
  });

  it('refuses to publish what nobody wrote, and says which failure it was', async () => {
    // The two failures want opposite corrections — one wants the id checked,
    // the other wants the answer written — and a boolean covering both sends
    // somebody to look at the wrong one.
    const { account, question } = await askOne('unanswered');

    expect(app.help.publish(question.id, clock + 1000)).toBe('nothing-drafted');
    expect(app.help.publish('q_nosuchthing', clock + 1000)).toBe('no-such-question');

    expect(app.help.forAccount(account.id)[0]).toMatchObject({
      answer: null,
      answeredAt: null,
    });
  });

  it('refuses a draft that says nothing', async () => {
    // Stored as the empty string it is indistinguishable from a draft holding
    // a real answer, and publish would send it as an empty paragraph.
    const { question } = await askOne('anything');

    expect(app.help.draft(question.id, '   \n  ', clock + 1000)).toBe(false);
    expect(draftOf(question.id).answer_draft).toBeNull();
    expect(app.help.publish(question.id, clock + 2000)).toBe('nothing-drafted');
  });

  it('trims it, and replaces it when a better one is written', async () => {
    const { token, question } = await askOne('anything');

    app.help.draft(question.id, '  first attempt  ', clock + 1000);
    expect(draftOf(question.id).answer_draft).toBe('first attempt');

    app.help.draft(question.id, 'second, better', clock + 2000);
    expect(draftOf(question.id).answer_draft).toBe('second, better');

    app.help.publish(question.id, clock + 3000);
    expect((await read(token)).json().questions[0].answer).toBe('second, better');
  });
});
