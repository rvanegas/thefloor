# The invite page test asserts against a build artifact git does not carry

`invite-link.test.ts` § *hands the tab a username and no pin* fails in any fresh
worktree and passes in the main checkout, and neither answer is about the code.

**The chain.** The test does `open('/i/alice_k')` through the whole app and
asserts the body contains `thefloor.invite`. That key is written by
`acceptScript` in `server/src/invite.ts`, emitted only when `accepting` — which
is one line, `const accepting = options.webAppReady`. `webAppReady` is
`availableTrains().length > 0`, and that is `access(join(trainRoot, <dir>,
'index.html'))` over `stable` and `beta`. `trainRoot` defaults to
`server/web/`, those directories are built by `bin/deploy-web`, and both are
gitignored. The main checkout has `server/web/stable/` lying about from an
earlier build; a worktree git has just populated has none, so `callToAction`
returns nothing, no `id="accept"` anchor is drawn, no script is emitted, and the
page falls to its `neither` branch — *This server is not handing out the app
yet*. Confirmed by dropping a stub `index.html` into `server/web/stable/` in a
failing worktree: 35 of 35 pass.

Note that `appStoreUrl` is unset in this test either way, so the main checkout
is not taking the store path — it is passing **because of the build artifact and
nothing else.** The assertion is about the handover key, and what actually
decides it is what happens to be on disk.

Found 2026-09-26 while landing the removal feature, which touches none of this.
The cost is that `npm test` in a fresh worktree reports a failure nobody caused,
which is exactly the noise that teaches a session to stop reading test output —
and `bin/deploy` runs the suite, so a box-side checkout without a built train
would refuse to deploy for this.

**The fix is already sitting in the same file.** Three lines down from the
failing test, § *the call to action, on a box that cannot make the usual one*
has a `drawn()` helper that calls `invitePage` directly with `webAppReady`
passed in, and tests the three branches properly that way. This one assertion is
the only thing in the file that reaches the condition through the app instead.
So either move it to `drawn({ webAppReady: true })`, or — if going through the
app is the point, since what is being checked is that the route wires the
username through — pass `trainRoot` to `buildApp` in the `beforeEach`, which is
already an injectable `BuildOptions` field, pointing at a fixture directory with
an empty `index.html`. The second is one line and keeps the test end-to-end.

Whatever is chosen, the invariant to state somewhere is that no test may depend
on an untracked build output. This is the only one known to.
