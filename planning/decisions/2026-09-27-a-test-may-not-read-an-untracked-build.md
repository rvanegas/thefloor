# A test may not read an untracked build

`invite-link.test.ts` § *hands the tab a username and no pin* passed in the main
checkout and failed in every fresh worktree, and neither answer was about the
code. It now injects its own empty `trainRoot` and stands a train up for the one
test that means one. The rule the fix is an instance of: **no test may depend on
a build output that git does not carry.**

## What it actually turned on

The assertion is that the invite page writes `thefloor.invite` into the tab, so
that somebody who clicks arrives with a contact waiting rather than an empty
Home. That script is emitted by one line in `invite.ts` —
`const accepting = options.webAppReady` — and `webAppReady` is
`availableTrains().length > 0`, which is `access(join(trainRoot, <dir>,
'index.html'))` over `stable` and `beta`. `trainRoot` defaults to `server/web/`,
both directories are built by `bin/deploy-web`, and both are in `.gitignore`.

So the test passed in a checkout that had built a train at some point and failed
in one git had just populated. `appStoreUrl` is unset either way, so the passing
direction was not taking the store path: it was passing **because of an
artefact** and nothing else.

## Why it was worth fixing rather than noting

Two costs, and the second is the sharp one.

A red suite nobody caused is how a session learns to stop reading test output.
This one was met while landing an unrelated feature, and the first instinct was
that the feature had broken `app.ts`.

**And `bin/deploy` runs the suite and refuses to continue when it fails.** A
checkout that has never built a train cannot deploy the server, for a reason
that has nothing to do with the server. That is a self-inflicted outage waiting
for the right afternoon, and it is the half that makes this more than tidiness.

## The fix, which was already the house pattern

`open.test.ts`, `train-root.test.ts` and `guest-flow.test.ts` all `mkdtemp` a
directory per test and pass it as `BuildOptions.trainRoot` — the option exists
for exactly this. `invite-link.test.ts` was the one file reaching the condition
through the app while inheriting it from disk; the others in the same file that
touch this at all go through its own `drawn()` helper, which passes
`webAppReady` in directly.

So: a temp `trainRoot` in the `beforeEach`, empty by default, and a `withTrain`
helper scoping a train to the single test whose precondition it is. **An empty
directory is the honest default** — a box serving no train is an ordinary box,
and every other test in the file means one.

**A second test was added for the other direction**, which is what would have
caught this originally: with no train, the page writes nothing into the tab and
says *not handing out the app yet*. It is asserted at the route as well as in
`drawn()`, because the seam between them is where the defect lived — the unit
half was already right and the route half was reading the disk. Verified by
running the file both with and without `server/web/{stable,beta}` present: 36 of
36 either way, where before the artefact decided it.

## The rule, and how far it reaches

Stated as one line because it generalises past this file: **a test asserts under
preconditions it has stated, and a gitignored directory is not a statement.** The
sweep that produced this entry found no other offender — `mail`, `shell`,
`release` and `social-cards` all look like they touch a train and are really
naming an App Store URL or a literal `/app/manifest.json`, and `social-cards`
calls `landingPage({ webAppReady: true })` with the value passed in. `open.test.ts`
is the only other file that fetches `/` at route level and it already injects.

The shape to watch for is narrower than "tests should be hermetic": it is a
**default that reads the filesystem**. `trainRoot` has a sensible production
default, which is what made the dependency invisible at every call site that did
not pass one. Anything else acquiring that shape wants the same treatment.
