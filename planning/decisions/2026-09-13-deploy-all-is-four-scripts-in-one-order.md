# `bin/deploy-all` is four scripts in one order

2026-09-13. The afternoon that puts a revision on the box, in TestFlight, on
the beta web train and onto an Android handset was four commands typed in
sequence. It is now `bin/deploy-all`, which runs exactly those four —
`bin/deploy`, `bin/upload-ios`, `bin/deploy-web --beta`, `bin/android --apk` —
with no flags it invents and nothing it does itself.

The header of the script carries the operating detail. What is here is the
reasoning that would otherwise be mistaken for arbitrary.

## The order is a dependency, and that is the only thing the script knows

`bin/deploy-web --beta` cuts the beta train from **the newest `build/<n>` tag**,
and `bin/upload-ios` is what creates that tag. Reverse the two and the web
deploy ships the *previous* build's web app — succeeding, printing a green
line, and leaving the train a build behind the TestFlight it exists to match.
Nothing anywhere would say so; the only symptom is a web app that behaves like
last week's.

That single fact is what makes this a script rather than a shell alias. It is
also why there is **no `--only`**: a way to run one stage in isolation is a way
to discard the one piece of knowledge being encoded, one stage at a time.
`--from <stage>` runs that stage and everything after it, which preserves the
order by construction.

## Why it resumes rather than restarts

Four stages is twenty-odd minutes, so a failure in the third is a failure with
two successes behind it. Restarting from the top would re-deploy a server that
is already deployed — harmless — and **upload a second build**, which is not:
the number is spent, a second `build/<n>` tag exists, and TestFlight holds a
build nobody meant to make. So a failed run prints the `--from` line that picks
up where it stopped, and says in as many words not to run it from the top.

`--keep-going` is the `;` the task was written with: run the rest anyway. It is
not the default, because the default should be the one that does not compound a
failure.

## It is not a fifth verb, and the plan is where that is admitted

RELEASING.md § *The five verbs* is untouched. This spans two of them —
`deploy`, which is reversible in a minute, and `upload`, which spends a build
number and writes a permanent tag — and a name cannot make that one thing. The
honesty is in the plan the run prints before anything starts: it names the
upload, and what the upload costs, in the line above the first stage.

It does not then ask. The first cut had a y/n on the upload, with `--yes` to
skip it and a refusal when there was no terminal; that was removed the same
day. Typing `bin/deploy-all` *is* the asking — the rule one section down is
that nothing here decides to run, so a run only ever exists because somebody
typed it — and a prompt on top of that is a second answer to a question already
answered. What the prompt was actually protecting against is a mistyped
command, and a y/n is a poor guard against that: the reflex answer to a
question you expected is *y*. The guards that catch a wrong run are the
preflight and the printed plan, and both survive.

**`bin/submit-ios` is deliberately not one of the four.** Putting a build in
front of App Review is a different day and a different decision, and the one
verb in the set that cannot be undone at all.

## `--dirty` is not offered, because the stricter of two rules governs

`bin/deploy` will ship a dirty tree when asked; `bin/upload-ios` refuses one
outright, because it tags, and a tag naming a commit the build did not come
from is worth nothing. A run that shipped the working tree to the box and then
stopped dead at the upload is the worst of both outcomes, so the tree must be
clean and there is no flag to say otherwise. Run `bin/deploy --dirty` by hand
if that is what is wanted; it was never the thing this script is for.

## Preflight asks `bin/android`, it does not restate it

The value of checking up front is entirely in the last stage: `bin/android`
refusing for want of a JDK 17 costs nothing on its own and costs half an hour
when it happens after an archive and a web export. But the SDK and JDK paths
are stated in `bin/android`, and a copy of them in a second script is a second
thing to be wrong on the day one of them moves.

So `bin/android` gained **`--check`**, which runs its own `require_sdk` and
`require_jdk17` and nothing else — no prebuild, no Gradle, no emulator. Whether
the build *succeeds* is not a question with a cheap answer; whether the machine
can attempt it is. `bin/deploy-all` asks that question rather than answering it
itself.

Every other preflight check is the same shape: a thing one of the four would
check for itself, checked before the first one starts. Nothing there is a new
rule, so it cannot be what lets a bad run through — a stage that would refuse
still refuses.

## It pushes nothing

`bin/upload-ios` commits the build-number bump and tags it and pushes neither,
which is the normal state here — AGENTS.md is explicit that landing is asked
for each time. So a successful run ends by printing the two push commands and
not running them. The tag is the one that gets forgotten, being made by a
script rather than typed.
