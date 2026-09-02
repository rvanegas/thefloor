# Two devices in one channel

**Temporary.** This is the account of one sighting, the two mechanisms that
were closed in response to it, and the device walk that would settle whether
either of them was the thing anybody actually heard. Delete it once the walk
has been done, moving what survives into `decisions/DECISIONS.md`. It was
TASKS.md § *Two Devices In One Channel* until 2026-09-02, when the entry there
narrowed to a line pointing here.

**Both candidates are built and neither is confirmed.** The suite is green on
the code below and that is evidence about the reducer and the socket. It is no
evidence at all about what a third person in the room heard, which is the only
thing this entry has ever been about.

---

## What was seen, and what was found by reading

**Observed 2026-08-29.** One account stepped into a channel on two devices at
once, and the two appeared to compete for the audio rather than one of them
yielding. Nothing was measured and there is no recording of it. What follows
was found by reading instead, which is why the sighting is still open even
though two mechanisms that would produce it are now closed: **nobody has heard
the fixed version, and nobody ever heard the broken one on purpose.**

**A token was not a device, and now a device is.** `displaceOtherSessions`
skipped any connection whose token matched the entering one, so two sessions
sharing a token were never displaced from each other — invisible to each other
by construction. That never mattered while iOS refused to run a second copy of
the app, and two browser tabs on one origin share `localStorage` and therefore
share a token, so it was about to. The socket now carries a `device` query
parameter beside `build` and `client`: minted per JavaScript context in
`app/src/api/device.ts`, which is one per process on a phone and one per *tab*
in a browser, and never persisted — storing it would put it in the same
`localStorage` the token is in and hand both tabs the same answer again. A
socket naming no device falls back to its token, which is exactly the rule
every installed build already runs under, so nothing shipped changes.

**The evicted device now stops instead of fighting.** LiveKit admits one
participant per identity and the identity is the account, so the later joiner
displaces the earlier at the media plane whatever this server thinks —
`useSessionAudio` read that eviction as a network drop and rebuilt on its
500ms-doubling backoff, which re-evicted the other device, which rebuilt in
turn. `DisconnectReason.DUPLICATE_IDENTITY` is now not retried, in both the
native hook and the web one. It gets its own `AudioStatus` rather than `idle`,
which matters twice: `idle` reads on screen as a channel whose audio never
started, and the foreground listener rebuilds a room from any status but
`connected` and `connecting` — so filing an eviction as `idle` would restart
the ping-pong once per trip through the app switcher.

The two are deliberately independent. The server telling the other device it
has been displaced is a second message on a second connection, and a race or a
drop would leave nothing breaking the loop; the media plane needs no message,
because the eviction is itself the news and it arrives on the connection the
news is about.

**What is not answered.** The third candidate — that nothing was wrong and the
oddity was the mono/stereo transition in STATES.md, or simply two devices in
one room hearing each other — is neither confirmed nor ruled out, and the one
listen that would settle it still costs one listen. Do it before assuming this
is closed by the code above, because a fix for a mechanism nobody demonstrated
is a fix that cannot be known to have removed the symptom.

**The intended rule is per device rather than per account**, and is what the
above implements. Device B stepping into any channel — including the one device
A is already in — steps device A out. To everybody else nothing happens: the
account stays present throughout, since `displaceOtherSessions` tells other
sessions rather than dispatching a `STEP_OUT`, so no snapshot changes and no
roster flickers.

---

## What is already verified, and what is not

The two mechanisms have unit coverage — `app/src/audio/__tests__/reconnect.test.tsx`
(a `DUPLICATE_IDENTITY` disconnect lands on `displaced` and is not retried),
`app/src/api/__tests__/displaced.test.ts` and
`app/src/state/__tests__/displaced.test.tsx` (the socket message and what the
app does with it). Running `npm test` re-confirms those and adds nothing here.
What no test can settle is the third candidate above.

## Prerequisites

- **Server.** The deployed commit must contain `cc225f7` ("A token was never a
  device, and the loser stops fighting"), which is what teaches
  `displaceOtherSessions` about `deviceKey`. It was live as of `40a2462`;
  `bin/health` says what is on the box now.
- **Client.** `build/130` and later contain the fix. Anything below 130 is the
  broken version, which is useful only if somebody wants to hear the symptom on
  purpose — see *Hearing the broken one* below.

## The rig

Three parties, because the symptom is what the room heard rather than what a
screen said: devices **A** and **B** on one account, and **C** on a different
account, in the channel and talking.

Two ways to get A and B:

1. **Two browser tabs on `/beta`** — cheapest, and the exact pair the server
   half was written for: same origin, same `localStorage`, therefore the same
   token, distinguished only by the per-context `DEVICE_ID`. Check the train is
   actually up first; `bin/deploy-web --beta` is what puts it there, and it is
   cut from the newest `build/<n>` tag rather than from `master`.
2. **Two handsets** — the fidelity that matches the sighting. An iPhone on
   TestFlight plus the Android build is the easiest second device to come by;
   two iPhones on one account works equally.

## The walk

1. C enters the channel and keeps talking continuously. A steady voice is the
   instrument; silence measures nothing, which is the same reason
   § *A floor claim is enforced against a track* in AGENTS.md says the case
   worth hearing is a claimed floor rather than a quiet room.
2. A enters. Confirm A hears C.
3. **B enters the same channel.** This is the moment.
4. Leave it running for ~30 seconds without touching anything. The old failure
   was a doubling backoff, so it needs time to oscillate.
5. Reverse it: A enters again, and B should yield the same way.

## What settles it

**On A, after step 3.** The audio status line reads *"Audio moved to your other
device."*, once, and stays there. Flickering between that and *"Audio dropped —
reconnecting…"* is the retry loop returning. In a debug build the
`AudioDebugPanel` event log should show `displaced at the media plane; not
rebuilding` exactly once — that line is the direct evidence the
`DUPLICATE_IDENTITY` branch fired instead of the rebuild.

**On C, which is the actual measurement.** One continuous voice from the
account, no gap longer than the handover itself, no doubling, no chopping in
and out. Any pulsing at roughly 0.5s, 1s, 2s, 4s is the ping-pong.

**On everybody.** The roster must not flicker. The account stays present
throughout by design.

**The third candidate.** If C hears a stereo-to-mono shift at step 3 and that
is *all* they hear, that is STATES.md's transition doing its job, and it is the
answer this file is holding open.

Record C's side. It costs one take and it is the artefact that has never
existed for this sighting. `journalctl -u thefloor` during the walk gives the
server's account of the same minute.

## Hearing the broken one

Optional, and worth it only if the walk comes back clean and somebody wants the
symptom characterised rather than merely absent. A build below 130 on device A
against the current server reproduces the media-plane half — the server will
send `displaced`, but the old `useSessionAudio` still reads the eviction as a
drop and rebuilds. Do not use two pre-130 clients against a pre-`cc225f7`
server to do it; that combination is not deployable and reconstructing it costs
more than the recording is worth.
