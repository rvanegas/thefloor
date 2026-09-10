import type { HelpQuestion } from '../../core/protocol';
import { newId, type Db } from './db';

/**
 * The questions people ask of The Floor, and the answers written back.
 *
 * **The whole mechanism is a table and two people.** Somebody types a question
 * in the app; it lands here; whoever is running this reads it with `bin/help`
 * and writes an answer into the same row; the answer appears under the
 * question the next time that screen opens. There is no queue, no routing, no
 * status, and nothing that pretends to be automated — this is the smallest
 * thing that answers a question at all, and it is deliberate.
 *
 * **Writing and sending are two moves**, since 2026-09-10. `bin/help <id>
 * "..."` puts the answer in `answer_draft`, where nobody but its author can
 * see it, and `bin/help publish <id>` is what the asker ever reads. The one
 * move it replaced published on the same keystroke that composed, which is a
 * fine arrangement for "yes, tap the button twice" and a poor one for the
 * answers that are actually hard — a paragraph about somebody's own account,
 * written to a stranger, with no way to read it back before it was sent. The
 * draft is not a workflow; there is still no queue and no status. It is the
 * gap between finishing a sentence and standing behind it.
 *
 * **Why it exists beside the support page.** `/support` is a page of answers to
 * questions somebody guessed at in advance, and the email address on it is a
 * conversation that leaves the app entirely. This is the middle: a question
 * asked from inside the app, by somebody already signed in, so the asker is
 * known without their having to say who they are, and the answer arrives where
 * the question was asked rather than in a mail client. The questions also
 * accumulate into the only honest list of what people actually find confusing,
 * which is what the support page ought to be written from.
 *
 * **Nothing here notifies anybody**, and that is a decision rather than an
 * omission. Pushing when an answer lands is a real thing to want, and it needs
 * a notification level people can turn off before it is anything but a way to
 * be woken by a support reply; the answer being there when they next look is
 * enough for something this rare.
 */

/**
 * The longest question that will be taken, in characters.
 *
 * Generous rather than tight — somebody describing what went wrong in a call
 * needs room, and the useful reports are the long ones. It is a bound against
 * a client posting a megabyte, not an editorial opinion about length.
 */
export const MAX_QUESTION_LENGTH = 4000;

/**
 * How many unanswered questions one account may have outstanding.
 *
 * **A limit on the backlog rather than a rate.** A rate limit answers *how
 * fast*, which is not the problem: one person can wait a minute between each of
 * two hundred questions and the reading is still hopeless. What this says is
 * that somebody with five questions in the air is waiting on us, and the useful
 * next move is an answer rather than a sixth question.
 *
 * Answered questions do not count, so it never becomes a lifetime cap — a
 * person who has asked and been answered forty times is exactly the person this
 * should keep taking questions from.
 */
export const MAX_OUTSTANDING = 5;

export type AskResult =
  | { ok: true; question: HelpQuestion }
  | { ok: false; reason: 'empty' | 'too-long' | 'too-many' };

/**
 * What happened when a draft was sent — or why nothing was.
 *
 * Three values rather than a boolean because the two failures want opposite
 * corrections from the person at the terminal, and a `false` covering both
 * would send them to check the id when what is wrong is that they never wrote
 * the answer.
 */
export type PublishResult = 'published' | 'no-such-question' | 'nothing-drafted';

interface Row {
  id: string;
  text: string;
  asked_at: number;
  answer: string | null;
  answered_at: number | null;
}

export class Help {
  constructor(private db: Db) {}

  /**
   * Takes one question.
   *
   * Trimmed before anything is decided about it, because leading whitespace is
   * not content and a field holding only a newline is an empty field however
   * the client feels about it.
   */
  ask(accountId: string, text: string, now: number): AskResult {
    const trimmed = text.trim();
    if (!trimmed) return { ok: false, reason: 'empty' };
    if (trimmed.length > MAX_QUESTION_LENGTH) {
      return { ok: false, reason: 'too-long' };
    }
    if (this.outstandingFor(accountId) >= MAX_OUTSTANDING) {
      return { ok: false, reason: 'too-many' };
    }

    const id = newId('q');
    this.db
      .prepare(
        `INSERT INTO help_questions (id, account_id, text, asked_at)
         VALUES (?, ?, ?, ?)`
      )
      .run(id, accountId, trimmed, now);

    return {
      ok: true,
      question: {
        id,
        text: trimmed,
        askedAt: now,
        answer: null,
        answeredAt: null,
      },
    };
  }

  /**
   * One person's questions, newest first.
   *
   * Newest first because the one just asked is the one somebody opened the
   * screen to look at, and an answer to something from three weeks ago is not
   * what they came back for. It is also the order the list is short in: nobody
   * scrolls this.
   *
   * **The columns are named rather than starred, and `answer_draft` is not
   * among them.** This is the one read that reaches a person who is not the
   * author of the draft, so it is the one place a `SELECT *` would be a leak
   * rather than a shortcut.
   */
  forAccount(accountId: string): HelpQuestion[] {
    const rows = this.db
      .prepare(
        `SELECT id, text, asked_at, answer, answered_at
         FROM help_questions WHERE account_id = ?
         ORDER BY asked_at DESC`
      )
      .all(accountId) as unknown as Row[];

    return rows.map((row) => ({
      id: row.id,
      text: row.text,
      askedAt: Number(row.asked_at),
      answer: row.answer,
      // Null exactly when the answer is, whatever the column happens to hold.
      // A timestamp beside no answer would be a screen claiming it was
      // answered at four o'clock and showing nothing — and these two columns
      // are written by hand, so they can come apart in a way the rest of this
      // database cannot.
      answeredAt: row.answer === null ? null : Number(row.answered_at),
    }));
  }

  /** How many of their questions are still waiting on an answer. */
  outstandingFor(accountId: string): number {
    const row = this.db
      .prepare(
        `SELECT COUNT(*) AS n FROM help_questions
         WHERE account_id = ? AND answer IS NULL`
      )
      .get(accountId) as unknown as { n: number } | undefined;
    return Number(row?.n ?? 0);
  }

  /**
   * Writes an answer where only its author can see it.
   *
   * Trimmed, and an empty one refused, for `ask`'s reason and one of its own:
   * a draft stored as the empty string is indistinguishable from a draft that
   * says nothing, and `publish` would happily send it. There is deliberately
   * no command to discard a draft — writing a better one over it is the whole
   * of the edit, and an unpublished draft costs nothing sitting there, the
   * question being genuinely unanswered either way.
   */
  draft(id: string, text: string, now: number): boolean {
    const trimmed = text.trim();
    if (!trimmed) return false;
    const result = this.db
      .prepare(
        'UPDATE help_questions SET answer_draft = ?, drafted_at = ? WHERE id = ?'
      )
      .run(trimmed, now, id);
    return Number(result.changes) > 0;
  }

  /**
   * Sends the draft to the person who asked.
   *
   * The draft is moved rather than copied — `answer_draft` is cleared in the
   * same statement — so a draft sitting beside a published answer means an
   * edit somebody is part-way through and never means the answer that is
   * already out. Written as one UPDATE reading its own row rather than a read
   * followed by a write of what was read, so there is no window in which the
   * text could be improved between the two and the improvement lost.
   *
   * The two failures are told apart because they call for opposite things: a
   * mistyped id wants trying again, and an empty draft wants writing one.
   * Publishing what is not there would otherwise report success and send
   * nothing, which is the failure this whole split exists to make impossible.
   */
  publish(id: string, now: number): PublishResult {
    const row = this.db
      .prepare('SELECT answer_draft FROM help_questions WHERE id = ?')
      .get(id) as unknown as { answer_draft: string | null } | undefined;
    if (!row) return 'no-such-question';
    if (row.answer_draft === null) return 'nothing-drafted';

    this.db
      .prepare(
        `UPDATE help_questions
            SET answer = answer_draft,
                answered_at = ?,
                answer_draft = NULL,
                drafted_at = NULL
          WHERE id = ?`
      )
      .run(now, id);
    return 'published';
  }

  /**
   * Writes an answer and sends it in one move.
   *
   * **There is no route that calls this**, and there is not meant to be:
   * answering is something exactly one person does, and a route for it would
   * need an authorisation model, a screen, and a way to revoke it — all of that
   * for a job that is a line of SQL. `bin/help` goes at the database directly,
   * the way every other operational script here does. This method exists so
   * that the two columns which must move together do so in one place, beside
   * the read that insists they agree.
   *
   * `bin/help` no longer has a form that reaches this — it drafts, and then it
   * publishes. What is left here is the programmatic answer, which is what the
   * tests want when the subject is something other than the drafting.
   */
  answer(id: string, text: string, now: number): boolean {
    const result = this.db
      .prepare('UPDATE help_questions SET answer = ?, answered_at = ? WHERE id = ?')
      .run(text, now, id);
    return Number(result.changes) > 0;
  }
}
