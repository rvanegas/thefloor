# The slug rule is a script, and the test suite runs it

Written the same day as `2026-09-14-one-task-one-file.md`, which created the
problem this fixes. That split left title → slug → filename as prose in three
READMEs and in AGENTS.md, implemented by eye in three separate places: making a
file, resolving a quoted reference, and checking neither has rotted. The third
was written ad hoc during the split itself and deleted when it had served its
purpose, which is the argument for a tool in one gesture.

`bin/note` is that rule and nothing else is. `new`, `find`, `list`, `rename`,
`check`.

## `find` is the load-bearing mode

AGENTS.md's matching rule, executable: slugify the quotation, take an exact
filename, else the unique file it prefixes, else refuse and print what it
collided with. **The refusal is the feature.** An ambiguous reference is
exactly the case where a session guesses, silently, and starts building the
adjacent thing — which is the failure the quoting convention exists to prevent
and could not previously detect. `bin/note find "The checklist"` naming four
files is the tool doing its job.

It also resolves the ~30 citations still reading `TASKS.md § *Title*`, since
those shorten the title and the prefix rule was written for them.

## `bin/task` exists because of what `bin/help` learned

`bin/task "Some Title"` is the common case and is a five-line script that execs
`bin/note new tasks`. The obvious alternative — a bare `bin/note "Some Title"`
meaning new-task — was rejected on bin/help's own precedent: that tool moved
*away* from bare-argument magic to a strict verb-first grammar in September,
having spent months as three conventions at once, and recorded that nothing
there was worth remembering the shape of. So the common case is short because
it has its own name, not because it is spelled irregularly.

## The check is a test, so drift fails the deploy

`server/__tests__/planning-filenames.test.ts` shells out to `bin/note check`
and asserts exit 0. It is deliberately a wrapper rather than a reimplementation:
two copies of the slug rule drift, which is the failure AGENTS.md names for the
glossary. `bin/deploy` runs the tests first, so a heading that disagrees with
its filename now fails a deploy rather than waiting to be found by whoever
follows a reference that does not resolve.

**It lives in `server/`'s suite and has nothing to do with the server.**
`core/` forbids I/O, enforced by its purity test, so it cannot host this; the
honest home is a root-level hygiene suite that does not exist and would cost a
jest project. Named for what it checks, so nobody looks for a server reason.

## What it found immediately

Pointed at `decisions/`, the strict rule failed 52 of 73 files — and the
directory is not the thing at fault. `decisions/README.md` states that the
heading is the full title with the date suffix; 9 files are written that way.
41 lead with a bare title, 23 with the date first, and several differ in
substance rather than shape.

So `check` holds `tasks/` and `backlog/` to the strict rule and asks of a
decision only that it be dated and titled. **That is a checker describing
practice rather than enforcing a rule**, which is a compromise and is marked as
one in both the script and the README. Retitling 52 historical files is the
alternative, and it is probably wrong: they are cited by title from thirty-odd
places, so the retitle is the one edit that breaks references which currently
work. `tasks/decisions-do-not-obey-the-convention-they-document.md` carries the
open question.

**Settled 2026-09-22, the way this paragraph guessed it would be**: the README
moved to the practice and the task file is gone. See
`2026-09-22-a-decision-is-named-once-and-titled-freely.md`.

One genuinely stale pointer turned up with it — `app/src/audio/__tests__/
reconnect.test.tsx` cited a TASKS entry that moved to `TWO-DEVICES-WALK.md` on
2026-09-02 — and now points at where it went.
