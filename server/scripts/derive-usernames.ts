/**
 * The SQL that gives each account the username signup would have given it.
 *
 * Read by bin/backfill-usernames, which is where the reasoning lives. This is
 * only the half that has to be TypeScript: the candidates come from the same
 * `core/derivedNames.ts` functions `Accounts.deriveUsername` calls, in the
 * same order and with the same fallback to the address, so the rule cannot
 * drift between a signup and the backfill.
 *
 * In: on stdin, `sqlite3 -json` rows of `{ id, identifier, display_name }`,
 * oldest account first, since the first to be offered a name gets it. Empty
 * input is no rows — sqlite prints nothing rather than `[]` for an empty
 * result. The number of tries is the one argument.
 *
 * Out: on stdout, one guarded UPDATE of `temp.names` per candidate. Each one
 * applies only while that account still has no name and nobody has the
 * candidate, which is the unique index's test done as a condition, so the
 * statements stand in for `deriveUsername`'s try-and-catch loop in a language
 * that has no loop.
 */
import {
  displayNameFromIdentifier,
  usernameAttempts,
  usernameStem,
} from '../../core/derivedNames';

type Row = { id: string; identifier: string; display_name: string };

const tries = Number(process.argv[2]);
if (!Number.isInteger(tries) || tries < 1) {
  throw new Error(`derive-usernames: tries must be a positive integer, got ${process.argv[2]}`);
}

const quote = (value: string): string => `'${value.replace(/'/g, "''")}'`;

let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => (input += chunk));
process.stdin.on('end', () => {
  const rows: Row[] = input.trim() === '' ? [] : JSON.parse(input);
  for (const row of rows) {
    const stem =
      usernameStem(row.display_name) ??
      usernameStem(displayNameFromIdentifier(row.identifier));
    if (!stem) continue;
    for (const candidate of usernameAttempts(stem, tries)) {
      process.stdout.write(
        `UPDATE temp.names SET username = ${quote(candidate)}` +
          ` WHERE id = ${quote(row.id)} AND username IS NULL` +
          ` AND NOT EXISTS (SELECT 1 FROM temp.names` +
          ` WHERE username = ${quote(candidate)} COLLATE NOCASE);\n`
      );
    }
  }
});
