import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CLIENT_ACTIONS } from '../src/channels';

/**
 * **Two hand-maintained lists that have to agree, and nothing checked them.**
 *
 * `ClientAction` in `core/protocol.ts` is what a client may *say* — the wire
 * form, without an actor, which the server widens by supplying one. The
 * allowlist in `channels.ts` is what the server will *accept*. They are written
 * in different files for good reasons: one is a type the app compiles against,
 * the other is a runtime gate standing in front of a reducer that understands
 * far more than a client may send. Nothing kept them in step.
 *
 * What that cost, on 2026-09-28: `WATCH_STARTED` was added to the reducer's
 * actions and to the allowlist and **not** to the wire type, so the server
 * would have accepted a report the app could not legally send. It landed, and
 * the only thing that noticed was `tsc` in a package nobody had run — which is
 * the other half of the same lesson, and is why this is a test and not a note.
 *
 * **The type is erased, so the source is read.** There is no runtime value to
 * compare against, and a type-level assertion would only catch a name the
 * allowlist has and the union does not — not the reverse, and not at all from
 * the server's own tests. Reading the literals out of the source is blunt and it
 * is the only thing here that can see both lists at once.
 */
function wireActionTypes(): Set<string> {
  const source = readFileSync(
    join(__dirname, '..', '..', 'core', 'protocol.ts'),
    'utf8'
  );
  const start = source.indexOf('export type ClientAction =');
  expect(start).toBeGreaterThan(-1);
  // The union runs to the first line that is not part of it: every member
  // begins with `|` or is the first alternative, and the declaration ends at
  // the semicolon that closes it.
  const end = source.indexOf('\n;', start) + 1 || source.indexOf(';\n\n', start);
  const block = source.slice(start, end > start ? end : undefined);
  const union = block.slice(0, block.indexOf('\n\n/**') + 1 || undefined);
  return new Set(
    [...union.matchAll(/type:\s*'([A-Z_]+)'/g)].map((m) => m[1])
  );
}

/**
 * The actions a client may send that the allowlist is *not* the gate for.
 *
 * **One, and it is routed by name before `dispatch` is reached.** Accepting a
 * knock mints an id and a secret for the page waiting at the door, so its result
 * goes to a socket other than the sender's — which `dispatch` has no way to
 * reach. `ws.ts` therefore handles it in the `channel.action` case itself and
 * the allowlist never sees it.
 *
 * Named here rather than the assertion below being loosened, so that the second
 * action to take a private route has to be added deliberately.
 */
const ROUTED_ELSEWHERE = new Set(['ANSWER_KNOCK']);

describe('what a client may say and what the server will accept', () => {
  it('names the same actions in both places', () => {
    const wire = wireActionTypes();
    // A sanity check on the scrape itself: a union this size cannot have come
    // out empty or tiny, and a silently-empty set would make the assertions
    // below pass for the wrong reason.
    expect(wire.size).toBeGreaterThan(20);

    const accepted = [...CLIENT_ACTIONS].sort();
    const sendable = [...wire].sort();

    // Accepted but unsendable: a gate standing in front of nothing, or — as
    // with WATCH_STARTED — a wire type somebody forgot.
    expect(accepted.filter((t) => !wire.has(t))).toEqual([]);
    // Sendable but refused: an action the app compiles a call to and the server
    // drops on the floor, which is the failure that looks like the feature
    // silently not working.
    expect(
      sendable.filter(
        (t) => !CLIENT_ACTIONS.has(t as never) && !ROUTED_ELSEWHERE.has(t)
      )
    ).toEqual([]);
    // And the exception cannot rot: an action that stops being sendable at all
    // has no business being excused here.
    expect([...ROUTED_ELSEWHERE].filter((t) => !wire.has(t))).toEqual([]);
  });
});
