# 2026-09-17 — The tests stopped sharing a directory

Reported as *many failures during server deploy*, 2026-09-17, and it was not
the deploy. `bin/deploy` runs the suite before it ships, so anything that makes
the suite fail intermittently presents as a deploy that refuses — which is the
guard working, pointed at a fault in the tests rather than in the server.

## What was actually wrong

Three suites — `open`, `train-root` and `guest-flow` — made a web train by
`mkdir`ing **`server/web/stable`** and **`server/web/beta`**, the real
directories in the working tree, and `rm -rf`'d them in a `finally`.

They had no choice. `server/src/app.ts` resolved the train root as
`join(__dirname, '..', 'web', train.dir)` in three places, hardcoded, so a test
that needed a train to exist could only make one where production looks.

**Two runs of the suite at once therefore deleted each other's fixtures.** One
suite's cleanup ran while another was still asserting, and the assertions
failed with a 503 or a *no web app* answer that looks exactly like a real
regression in the train routing. That is the ordinary case rather than a
strange one: a `bin/deploy` overlaps anybody else running `npm test`, and
several sessions work this repository at once.

Reproduction is one line — run the suite twice at the same time — and it failed
in those three suites and nowhere else, three rounds out of three:

    ● a train root › serves the shell with or without the trailing slash
    ● /open › says so rather than redirecting when there is no web app at all
    ● the landing page › offers the browser when any train is deployed…

Serially it had passed five runs in a row, which is why it read as a flake.

## What was done

`BuildOptions.trainRoot`, defaulting to `server/web` — the same shape as
`trackRoot`, which already exists for the same kind of reason — and each of the
three suites now takes a `mkdtemp` directory of its own. `export.test.ts` and
`playback.test.ts` were already doing exactly this; the trains were the one
fixture with no option to point anywhere else.

**It covers only the train directories.** The guest page and the guest bundle
live in the same `server/web` and are committed or built rather than made by a
test, so they keep resolving from the real path. A suite pointing `trainRoot`
at a temp directory is saying *no train is deployed here except the ones I
make*, which is what each of them wants to say.

Verified by the same reproduction: sixteen concurrent full-suite runs, zero
failures in those three suites.

## The second thing, which is not fixed

`ws.test.ts` can still miss a `pong` under heavy load — twice in those sixteen
runs, in the heartbeat tests and nowhere else. Its wait helper had a
three-second deadline against a `testTimeout` of fifteen, which was twelve
seconds of unused headroom, and that is now ten. **It did not fix it**, which
is the useful finding: ten seconds is not slowness.

The cause is that the server's `tick`, `sweep` and `usage` timers are real
`setInterval`s that read the *injected* clock, and these tests advance that
clock by thirty seconds while a socket is live. The next real tick then does
thirty seconds of work at a moment that depends on how busy the machine is —
which is why the number of `channel` snapshots the client sees varies run to
run, and why on an unlucky interleaving the ping is never answered.

So it is a fake clock jumping underneath real timers, exposed by load rather
than caused by concurrency: `ws.test.ts` run twice against itself is clean
eight times out of eight, and it takes two *full* suites to surface. Fixing it
means giving those tests control of the timers rather than only of the clock,
which is a change to how every socket test is set up and was not worth folding
into this.
