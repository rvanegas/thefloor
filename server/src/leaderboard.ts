/**
 * Who has brought the most people here, as a page.
 *
 * **This is the third served page and the first that is not a document.** The
 * privacy policy and the support page exist because App Store Connect will not
 * take a submission without a URL for each, and both are prose that anybody may
 * read. This one is a list of real people's names against a number, and the
 * thing it must not become is the directory that `/privacy` and `/support` both
 * promise in writing does not exist: *"There is no directory, no search for
 * strangers, and no way to be added to anything without saying yes."*
 *
 * So it is off unless `LEADERBOARD_KEY` is set, and behind HTTP Basic when it
 * is — an operator's page, the browser-shaped sibling of `bin/usage`. Basic
 * rather than a key in the query string because a URL with a secret in it ends
 * up in history, in a bookmark and in the referer of anything the page links
 * to, and the page is meant to be opened by a person rather than scripted.
 *
 * If this ever wants to be something users see, that is a different decision
 * from this one and it starts by changing what those two pages say.
 */

import { createHash, timingSafeEqual } from 'node:crypto';

import { escapeHtml, page } from './html';

export interface LeaderboardRow {
  id: string;
  displayName: string;
  invited: number;
}

export function leaderboardPage(rows: LeaderboardRow[]): string {
  const body = rows.length
    ? `
<table>
<thead><tr><th>#</th><th>Who</th><th class="n">Invited</th></tr></thead>
<tbody>
${rows.map(row).join('\n')}
</tbody>
</table>
<p class="note">The count is everybody who signed up from this person’s
invitation, plus everybody <em>those</em> people went on to invite, all the way
down. Accounts that have been deleted are not counted, though the chains they
sit in the middle of are still followed through them. Somebody who has brought
nobody here does not appear.</p>`
    : `<p class="note">Nobody has brought anybody here yet — or nobody has since
the count started, which for every account that existed before it is the same
thing.</p>`;

  return page({
    title: 'Invitations — The Floor',
    heading: 'Invitations',
    standfirst: 'The Floor · who brought whom, counting onwards',
    body: `
<style>
  table { border-collapse: collapse; width: 100%; margin-top: 1.5rem; }
  th, td { text-align: left; padding: 0.5rem 0.25rem; border-bottom: 1px solid #8883; }
  th { font-size: 0.85rem; text-transform: uppercase; letter-spacing: 0.04em; color: #6b7280; }
  .n { text-align: right; font-variant-numeric: tabular-nums; }
  .rank { color: #6b7280; width: 2.5rem; }
  .note { color: #6b7280; font-size: 0.9rem; margin-top: 1.5rem; }
</style>
${body}`,
  });
}

/**
 * Rank is the row's position and not its count, so equal counts get separate
 * numbers. Deliberately: this is read by one person wanting to know the shape
 * of the thing, and standings-style shared ranks would be inventing a
 * competition nobody has entered.
 */
const row = (entry: LeaderboardRow, index: number) =>
  `<tr><td class="rank">${index + 1}</td><td>${escapeHtml(
    entry.displayName
  )}</td><td class="n">${entry.invited}</td></tr>`;

/**
 * Whether an `Authorization` header carries the configured password.
 *
 * The username is ignored — there is one credential here and no accounts, so
 * asking for a name would be asking the operator to remember a second string
 * that decides nothing. Browsers require the field, not a particular value.
 *
 * Compared in constant time, and length-padded first because `timingSafeEqual`
 * throws on a length mismatch rather than returning false — and throwing on
 * exactly the wrong lengths is a timing signal of its own. Hashing both sides
 * makes every comparison the same width without a branch.
 */
export function basicPasswordMatches(
  header: string | undefined,
  password: string
): boolean {
  if (!header?.startsWith('Basic ')) return false;
  let decoded: string;
  try {
    decoded = Buffer.from(header.slice('Basic '.length), 'base64').toString('utf8');
  } catch {
    return false;
  }
  const separator = decoded.indexOf(':');
  if (separator === -1) return false;
  const offered = decoded.slice(separator + 1);
  return timingSafeEqual(digest(offered), digest(password));
}

function digest(value: string): Buffer {
  return createHash('sha256').update(value, 'utf8').digest();
}
