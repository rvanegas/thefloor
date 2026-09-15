/**
 * How far this install has read its own answered help questions, which is the
 * whole of what the Support tab's dab is drawn from.
 *
 * **One number, and it can only ever say *something* came back.** The help
 * screen argues at length that it has no unread count — there is one person
 * with a script behind it, the answer is written into the question's own place,
 * and there is no reply to the reply. A mark on the tab does not contradict
 * that as long as what is remembered is a watermark rather than a set: this
 * knows that an answer is newer than the last time the screen was open, and
 * cannot know which question it belongs to. So nothing inside `HelpView` gains
 * a mark, and the tab says exactly one thing — go and look.
 *
 * **The Contacts dab needs none of this**, which is the asymmetry between the
 * two marks and worth holding on to. A request to answer is live state: it is
 * on the Home snapshot, and answering it takes it off. An answered question
 * stays answered for ever, so the fact alone can never stop being true and
 * something has to remember having seen it. One of these marks clears itself
 * and the other is cleared by being read. See `answerableRequests` in
 * `ui/ContactsView`.
 *
 * On the device rather than the account, like every other key in here, and so
 * a second phone shows the mark again. That is the right way round: the mark
 * means *you* have not read this, and this phone has not.
 */

/**
 * A `const` assignment rather than an inline literal, which
 * `__tests__/storageKeys.test.ts` requires: it greps the source for
 * `= 'thefloor.…'` so that every key the app writes is named in
 * `INSTALL_KEYS`, and a key spelled only as an argument is invisible to it.
 */
export const HELP_SEEN_KEY = 'thefloor.help.seenAnsweredAt';

/**
 * Whether an answer has arrived since this install last had the screen open.
 *
 * `answeredAt` is `HomeView.helpAnsweredAt` — the newest answer the server
 * knows about, or null when there is none. `seenAt` is what this phone last
 * wrote, or null when it has never opened the screen at all.
 *
 * **Never seen is not the same as nothing waiting.** An account that asked a
 * question on one phone and reads the answer on a second has a mark there on
 * its first look, which is correct: nobody at that phone has seen it.
 *
 * Strictly greater, so the write `HelpView` makes on the way in settles the
 * mark rather than leaving it up by one millisecond.
 */
export function answersWaiting(
  answeredAt: number | null | undefined,
  seenAt: number | null
): boolean {
  if (answeredAt == null) return false;
  return seenAt == null || answeredAt > seenAt;
}

/**
 * The watermark a screenful of questions justifies, or null when it justifies
 * none.
 *
 * **The newest answer that was actually on screen, rather than the clock.**
 * Writing `Date.now()` would mark as read an answer written in the second
 * between the fetch and the write, and that answer is then invisible for ever
 * — the one failure a watermark can have that a set cannot. Taking it off the
 * rows means the worst case is a mark that survives one reading, which the next
 * one clears.
 *
 * Unanswered questions are skipped rather than counted as zero, so an account
 * with nothing answered writes nothing and its stored value stays as it was.
 */
export function watermarkOf(
  questions: ReadonlyArray<{ answeredAt: number | null }>
): number | null {
  let newest: number | null = null;
  for (const question of questions) {
    if (question.answeredAt == null) continue;
    if (newest == null || question.answeredAt > newest) {
      newest = question.answeredAt;
    }
  }
  return newest;
}

/** Reads a stored watermark, treating anything unreadable as never seen. */
export function seenAtOf(stored: string | null): number | null {
  if (stored == null) return null;
  const value = Number(stored);
  return Number.isFinite(value) && value > 0 ? value : null;
}
