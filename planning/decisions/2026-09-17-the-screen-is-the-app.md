# The screen is the app — 2026-09-17

What was asked was `tasks/watch-party-on-one-device.md`: *explore options for
doing it without a second device.* What was built is larger and simpler than
that — the film plays **inside the app**, on whichever device you choose, and
one device and two stop being different features. The design was
`planning/WATCH-IN-APP.md`, deleted with this entry, its surviving reasoning
being here.

It absorbs `tasks/app-as-watch-party-player.md` entire: a second session
becoming the player is one case of the rule below rather than a feature.

## The player moved, and nothing else about the feature did

**The Floor still carries no video.** A WebView on native and an iframe on the
web, both running YouTube's own IFrame player, unmodified and unobscured; still
nothing fetched, decoded, published, recorded or stored here; still a position
and a clock on the wire. What changed is which window the player is in.

`react-native-webview` was the reason the 2026-08-23 design refused an in-app
player — a native module, a rebuild, and build 2's black screen as the
argument. SDK 54 bundles 13.15.0 and autolinks it with no config plugin, so the
cost was a prebuild rather than a plugin.

**Neither implementation decides anything.** `followInstructions` and
`correctionFor` moved into `core/watch.ts`, and the native page is a player and
a postbox: it reports what it is doing four times a second and takes play,
pause and seek back over the bridge. Three followers running a shared clock is
one rule or it is three, and it was on its way to being three. The port fixed
`backlog/a-rewind-while-the-watch-party-is-paused-leaves-the-picture-where-it-was.md`
on the way: a paused transport is now corrected whatever the player was doing,
pause first and seek second.

## A screen is a role, not a place to be

**Any signed-in instance of your own account.** Three facts already in place
made that free: several sessions per account since 2026-08-24; watching a
channel says nothing about presence; and `displaceOtherSessions` fires on
`ENTER`, not on holding a snapshot.

So a second instance renders the film **without stepping in** — no
displacement, and `channelHasAudio` false, so it holds no audio session at all
and plays through an unclaimed audio system while the phone keeps the voice.
Two devices is not a compromise to be tolerated: it is the configuration that
sounds best.

Being a screen is declared rather than inherited from navigation. Opening a
channel you are not in does not start playing a film at you.

## Watching here is the case that costs something

A device cannot both play a film in stereo and hold a microphone open: an open
microphone forces `playAndRecord` under a voice mode, which is mono over
Bluetooth, ducked, and voice processed. So:

```
partyWithholds = playing && (mutedAll || somebodyIsWatchingHere)
```

`mutedAll` stays the intent. The second term is materialised into it at one
edge — see below — and the microphone of whoever is watching here closes while
the film plays, `isScreening` in `core/micNeeded.ts`.

**It is an exception, and is written down as one.** *You hold the audio system
if and only if you are stepped in* has been the whole of that file since the
2026-09-08 redesign, and this is the first thing to qualify it. A clause not
marked as an exception is a clause somebody deletes as an inconsistency.

**Two properties of a watch party make it safe and neither generalises.** A
loaded party already refuses a recording — `canStartRecording` requires
`watch.party === null`, playing or paused and wherever anybody watches — so the
declined capture feeds nothing, and it feeds no subscription either, the run
being enforced-muted. And a film keeps the app in front, which is where iOS
requires a *new* microphone to be asked for; `expo-keep-awake` and
`navigator.wakeLock` hold off the idle timer, and a deliberate swap away is the
deferred promotion in STATES.md, which already existed.

**The price is a Bluetooth profile handover at every pause**, stereo to mono
and back. Stereo needs the category change; HFP follows a category that carries
an input, so the hope that dropping the voice *mode* alone would do is dead on
the 2026-09-08 readings. The bloom is what is being bought. Whether the gap is
tolerable across a dozen pauses in an evening is the one thing no test here can
answer.

**The predicate is `hasMicrophone && watchingHere`**, not presence and
watching. A guest with no speech grant is in the room, may well have the
television, and has no microphone to be a problem — one of those must not quiet
a room for nothing. A self-mute counts, a muted microphone being held open
rather than released; *self-mute is not an input to the audio session* is a
standing rule and this is not the thing that reopens it.

`microphoneNeeded` split into `hasMicrophone` plus the exception for exactly
this: `anyScreenInTheRoom` has to ask whether somebody's microphone matters in
order to decide whether to close it, and asking the combined predicate would
have been asking a question whose answer it was computing.

## Enforcement is sampled at one edge

`WATCH_PLAY` asks whether anybody is watching here, writes `enforced`, and
nothing asks again until the next pause. So somebody switching to their only
device during a playing, unmuted film changes nothing until the film is paused
and started again — **no voice is ever cut mid-sentence**, and the moment
enforcement begins is invisible, because at a pause everybody may talk anyway.

No latch, no pending state, no second clock. And it falls out of what the mute
already meant: it only ever asserts over a running film.

The cost is accepted and made legible rather than prevented: between the switch
and the next pause that person is inaudible while the room believes otherwise —
the mirror of the fault `isWithheld` forbids — so **`watchingHere` is drawn on
the roster**, and the silence reads as *watching* rather than as a dropped
call.

### What this costs, on the record

`useSpeakingReport` and `useSilencedNudge` read the local capture, and the
report exists because the SFU tells a withheld speaker about nobody but
themselves. With no capture during an enforced run, **a withheld speaker cannot
report itself for the length of the film** — the case
`decisions/2026-09-13-a-withheld-speaker-reports-itself.md` was written for. The
need shrinks with it, the condition now being categorical and said under the
roster, but that is a decision narrowed by this one.

## Nobody speaks through a film, so the clock had to learn something

A watch party is the case where somebody is unmistakably present and produces
no evidence at all. A browser's attention clock counts a hand on the page, and
somebody watching a video produces none for two hours — a cross-origin iframe
swallows even the clicks they do make. Fifteen minutes in,
`useAttention.web.ts` would step them out of the channel the party is running
in, and take their voice with it.

**Most of the fix was already true and nobody had noticed.** `attentive` keys
on `(channel, user)` and checks membership rather than presence, so evidence
from any of an account's devices refreshes the clock for the room another of
them is standing in: **the laptop showing the film is what saves the phone
holding the voice.** presence.test.ts now says so out loud, the fact being
load-bearing and not obvious.

What had to be added is one report: a tab showing the film says so every
`ATTENTION_REPORT_MS` while it plays. **Evidence rather than an exemption**,
which is the distinction that clock turns on — an abandoned tab is the ghost it
is hunting, and a tab showing a film somebody deliberately started, which stops
itself at the end, is not one. Only while *playing*: a paused party is a tab
that may genuinely have been walked away from.

**And ws.ts carried a comment saying the opposite**, which is now corrected:
*somebody watching a party on a laptop while their phone sits in a drawer is
not attending the room the phone is holding. Control lives on the phone; so
does attention.* That was true of a follower page — a link credential that
could not send the message at all. A screen is an ordinary session now, and a
person watching the thing the room is attending to is attending it.

Somebody in the room on a browser who has chosen **no** screen is deliberately
not covered. They are in a channel where a film is playing and are
demonstrably doing nothing, which is the case the window exists for. That
closes `tasks/keep-alive-during-watch-party.md`.

## The picker, and the banner that is deliberately prose

Two buttons: **Watch here** and **Watch on another device**. Not "Play here" —
*Play* is the transport's word and its control is inches away, and two acts
sharing one word is the drift GLOSSARY.md exists to prevent.

The list appears only when there is more than one other instance. One other is
not a choice and is taken without asking; none draws a banner saying to sign in
elsewhere. **The banner stays prose on purpose.** The obvious nicety is a
handoff link or a QR, and that mints a *full session* — strictly wider than the
six-hour, one-channel watch token this change retires, and the swap the
original design rejected because a URL pasted into a chat would become a
credential for the whole account. It is buildable and it is its own decision.

`screens.list`, `screens.use` and `screens.showing` carry it. The third is not
the same report as `WATCH_HERE`: that one is a fact about the channel and is
dispatched, this one is connection state, so that a device signed in and
face-down on a table is not offered beside the laptop somebody is looking at.

**A device name rides on the socket URL and is shown to one person.** It never
reaches another member, another account or a row on disk. It is also weak by
construction: `UIDevice.name` answers a generic "iPhone" on iOS 16 and newer
without the user-assigned-device-name entitlement — requested, not yet granted
— so the model name is preferred, and the web has no such API at all. A device
that gave no name is described by its kind, because a made-up name in a list of
real ones is worse than a gap.

## The follower page is deleted rather than kept

`/watch/:channelId`, `watch-page.ts`, the `watch_tokens` table, the mint route,
`issueWatchToken`, `watchTokenFor`, `canOpenWatchScreen`, and the socket's
`{ kind: 'watch' }` scope with every narrowing that hung off it. The scope
stays a union of one, because a shape is what the next restriction will want.

**No shim and no floor raise**, which was asked for and is cheaper than it
sounds. `bin/health` read `minBuild 80`, `oldestBuild 80`, `silentBuilds 0`, and
Watch is behind Labs, so an un-updated build meets this only if its owner turned
Labs on — and what it meets is a dead link button. The general argument is the
one worth keeping: **a shim here could not preserve the feature for an old
build, only its buttons.** An old build has no in-app player, so it is in a
party with no screen either way, and keeping the page alive would have preserved
the very thing being replaced.

**So this must land before `tasks/watch-leaves-labs.md`**, which removes the
shelter that makes the break cheap.

The table is dropped rather than left to expire, on the bio column's reasoning
in db.ts: it holds credentials, and a credential nothing can check, revoke or
show anybody is the kind of row account deletion exists to make impossible.

## What App Review has to be told

The 1.5.2 notes say *"A watch party is behind Labs and carries no video: this
app never fetches, decodes, stores or shows a frame; it shares a position and a
clock."* **The clause about showing a frame stops being true.** The argument
survives — YouTube's own player, unmodified and unobscured, nothing extracted,
recordings still refused — and the claim does not, so the paragraph is rewritten
here and must be rewritten again in whatever version ships it.
`tasks/watch-leaves-labs.md` is queued to rewrite the same section, and the two
rewrites should be one.

## The part no test reaches

The same sentence as 2026-08-23, and it has not stopped being true: 26 new core
tests, 5 new server tests, and a suite of 2,907 across three packages, none of
which has watched anything. What is outstanding is in
`backlog/the-watch-party-has-been-walked-once-and-the-rest-of-the-walk-is-outstanding.md`,
which this adds three steps to — a film on one device, a film on two, and
somebody switching between them mid-film — and the handover at each pause is the
one unsettled question in the design.
