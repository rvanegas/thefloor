
# TASKS

These are new items on the roadmap — features, but also audits, open questions
and things to go and find out. There are more in BACKLOG.md.

## UI Restyling

Improve look and feel

## Grow UI for iPad

Target iPad specifically.

## Keep Alive During Watch Party

Since there's no speaking, there must be another way.

## App Description

Consider UNINTERRUPTED.md to rewrite description of app. The idea is to reinvent voip, letting go, finally, of the logic of pre-internet telephony, adopting the logic of group text messaging, such as in telegram and whatsapp, and respecting preferences of today's younger generation for whom phone calls are rude, but discord rooms are okay.

## PIP Watch Party

Small video in the corner.

## Review S3

What's there? How many files? What kind? What is the lifecycle?

## Lock Screen

explore options in case screen locks during a call. lock screen, control center, etc.

## SMS Authentication

Not just email.

## App as Watch Party Player

If watch party is started and a there is a second session with the same account, let the second app become the player.

## API to Create Telegram or Whatsapp Group Chat

Is it possible?

## Add Voice Messages

These are recordings, sharing the infrastructure with the existing recordings, but with a distinct interface.

- Recording is the same. In the room, everyone and media is heard and recorded. 
- Constrained to 60s.

## Publishable Recordings

A channel may declare itself public. If public, then it has a page at thefloor.rvanegas.co where anyone can listen to selected recordings. Settings would include image. Name and description would show on the page. Contacts remain private, though they may be explicitly described in the description.

PODCAST.md designs an RSS feed as the machine-readable half of the same publication — an addition to this entry rather than a reading of it, and it carries what publishing costs: the Ogg/Opus mix no podcast client plays, the consent a guest cannot give, and the fact that unpublishing recalls nothing.

## Calendar Integrations

Explore scheduling and usage patterns

## Introduce Radiate

A channel owner can gen a link defining the channel as root. Define a user's radiate number relative to a channel as 0 if user is in channel, and 1 + n the minimum radiate number of one's recently connected contacts is n. Recency is defined as having exchanged words in a channel. Having exchanhed words is defined as taking immediate turns in both directions in a channel.

Number is updated lazily when exchange occurs. In User View display radiate number.

## Build for Android

First evaluate relevant differences and establish dev simulator on mac.

## Payments Upgrade

Voluntary donations shipped on 2026-08-14 — a Ko-fi link, external, unlocking
nothing. See decisions/DECISIONS.md for why it is not in-app purchase. What is
left:

- **`bin/import-donations`**, reconciling a Ko-fi CSV export into the
  `donations` table. Ko-fi has no read API, so a delivery missed while the
  server was down exists only in their dashboard; their dashboard is the
  authoritative record and ours is a convenience copy. Deferred until there is
  a real export to write the parser against, and it is also the answer for a
  donation paid from an address nobody signed in with.
- **In-app purchase, or Stripe**, if the Ko-fi arrangement stops being worth
  it. IAP is the only option that works outside the United States storefront;
  Stripe is the only one that can attribute a donation exactly, via
  `client_reference_id`. Both are a larger build than what shipped.

## A Leaderboard Of One's Contacts

The standings ship gated on an `accounts.leaderboard` column set by hand, and
the gate is not a feature — it is the only answer anybody had to the objection
that a board of the whole population is the directory `/privacy` promises does
not exist here. Show a reader only their own accepted contacts and every name
on the screen is one they were already entitled to, so the column has nothing
left to protect and the screen can be open to everybody. That is the change:
the filtering is the mechanism, and removing the gate is the point. Plan is
here: LEADERBOARD.md

## The Foreground Interruption

OPEN, reproducible, and the measurement comes before any code

**Seen once on build 65 and withdrawn within the hour when a retry missed it;
reproduced on build 72 on 2026-08-21 with a recipe.** Everybody present
self-muted, background the app, start another app's audio, foreground this one
— and the other app's audio is suspended.

**It is a fault, and the first reading of it was that it is not.** The reading
was that self-mute keeps the session a call, so an exclusive session is what a
muted channel should have. `anyMicrophoneOpen` in `core/micNeeded.ts` says the
opposite, in exactly the case it was written for: it excludes self-muted people
by construction, so *everybody* muted means `anyMicOpen` is false, and
`sessionFor(false, 0)` is `IDLE` — `playback` with `mixWithOthers`. The music
is supposed to keep playing. What one person's self-mute keeps a call is
everybody else's session while somebody else's microphone is still open; when
no microphone is open there is nothing to be exclusive for, and `IDLE` exists
precisely so that a quiet channel costs another app's audio nothing.

Alone in a channel is the same case as far as the session goes — also
`sessionFor(false, 0)`, also `IDLE`, also supposed to mix — which is why the
build 65 sighting and this one are one bug.

**The leading candidate, and a comment that is now known false.**
`app/src/audio/session.ts` hands the native observer `recording: CALL`
unconditionally, justified like this: *the observer reads it only while this
device is capturing, and our capturing implies `anyMicOpen`*. Self-mute
falsifies the implication. `intentFor` returns `muted`, which holds the device
open on purpose — `applyFor`'s own header says the engine never leaves the
recording state — while `anyMicrophoneOpen` excludes the self-muted. So the
engine can report recording while `anyMicOpen` is false, which is precisely the
input on which the observer would apply `CALL` over the `IDLE` we asked for.
That is not a stale comment on the side; it is the argument licensing the
unconditional value. STATES.md carries it as disagreement 11.

**Two other candidates survive the same evidence**, and the foreground is where
they part. A backgrounded app loses presence in about sixty seconds — it was a
hundred until 2026-08-27, when the sweep stopped waiting out a close frame,
the silence budget came down and the grace period began running from the last
ping rather than from noticing — so
depending on how long the other app played, foregrounding may be rebuilding the
room rather than resuming one — and a rebuild calls `startAudioSession`. Either
WebRTC re-applying its own defaults, the third writer of the process-wide
configuration, or the activation itself could be what interrupts, with the
observer innocent. **Activation is not configuration**, and this symptom
appears at an activation.

**Measure before touching code, which is the whole of what this entry asks.**
Set `accounts.debug`, open the diagnostic panel, run the recipe, and read the
`asked` and `actual` lines at the moment the app foregrounds — the log stamps
it `app active`. `actual` reading `playAndRecord` against an `asked` of `IDLE`
settles it outright, and *when* the two part settles which of the three
candidates it is. Note whether the connection actually dropped while
backgrounded, since that is what separates a rebuild from a resume. The
self-mute investigation spent four fixes and six builds reasoning from source
before one measurement; this subsystem has earned the opposite order.

**And do not "fix" it by pinning the session.** `core/micNeeded.ts` names both
of the cleanups that will suggest themselves — pin `CALL` on, or debounce the
transition — and says both delete the audible mono/stereo cue, which is
designed behaviour and is STATES.md disagreement 4. The bug is between what is
asked and what the system ends up in, not in what is asked.

**One thing to settle on the way past.** `SessionAudio.mutedByServer` is
written from `RoomEvent.TrackMuted` and read by nothing, and since the floor
withholds subscriptions rather than muting the publication, it is not clear it
can ever be true. STATES.md disagreement 1 is where the answer belongs.

## Websocket Lost

**The websocket half is answered and acted on — 2026-08-27.** The timeline,
what was wrong with it and what was changed are in
`decisions/DECISIONS.md` § *Talking into a void, which had three causes and one
of them was politeness*; the states themselves are in STATES.md §
*Claimed Floor* and § *Audio Connected*. Worst case from a phone going quiet to
the room being told is now ~17s rather than ~47s, a claim is released as soon as
a drop is noticed rather than a minute later, and the roster warns from the
media plane before the websocket can know anything.

**What is left is the phone call**, which is the half this entry asks about
that nothing has measured. There is no `AVAudioSession.interruptionNotification`
observer anywhere in the app — only a route-change one, in
`AudioRouteModule.swift` — and no CallKit integration, so an incoming call is an
ordinary interruption handled entirely by `RTCAudioSession` inside the WebRTC
layer. Answering it backgrounds the app, which suspends it despite the `audio`
background mode because the interruption means it is no longer playing anything,
and the whole websocket timeline above then runs. The one recorded sighting is a
*Telegram* VoIP call on 2026-08-18 that left the room dead until a force-quit
(STATES.md § *Audio Connected*); the specific hole it found was fixed, and a
real cellular call has still never been tried. Measure before writing code, the
same order § *The Foreground Interruption* asks for and for the same reasons.

**And the grace period is now measurable rather than argued.** `/healthz`
carries `drops`, `dropsRecovered` and `dropsExpired`, printed by `bin/health`.
`DISCONNECT_GRACE_MS` was deliberately left at a minute — read those counts off
a box that has been up a while before proposing a change to it, and read the
constant's own comment for what it is load-bearing for beyond a dot on a roster.

## Two Devices In One Channel

BUILT on both candidates, and **still never reproduced** — the listen this
entry asked for first has not happened

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
entry is closed by the code above, because a fix for a mechanism nobody
demonstrated is a fix that cannot be known to have removed the symptom.

**The intended rule is per device rather than per account**, and is what the
above implements. Device B stepping into any channel — including the one device
A is already in — steps device A out. To everybody else nothing happens: the
account stays present throughout, since `displaceOtherSessions` tells other
sessions rather than dispatching a `STEP_OUT`, so no snapshot changes and no
roster flickers.

## Downloading From S3 Rather Than Through The Box

DESIGNED, not built — the trigger is measurable load, and it has not arrived

`GET /recordings/:id/export` mixes the stems with ffmpeg, reads the whole
result into a Buffer and sends it, so every byte crosses this process — and
the mix is recomputed for every download. `bin/usage bytes` shows 28
`mix-read` against 11 `mix-write`, which is the same recording being remade
for people who have already been given it once.

**The replacement is a presigned S3 URL, and it is not a tunnel.** The server
signs a time-limited URL for one object and the client fetches it directly:
nothing crosses the box, so there is no Buffer, no egress and no memory
ceiling. A tunnel or a proxy would move every byte through a 2GB instance
again, which is the thing being removed rather than a way of removing it.

**The mix is not on S3 and cannot simply come from egress.** Only the stems are
stored; the mix is *computed*. `buildStemGraph` applies a per-identity volume
envelope from the floor timeline, so a silenced remark is gated out of the
artefact — "the last thing standing between a silenced remark and a user's
ears", in `export.ts`'s own words. A room-composite recording from egress would
know nothing about who held the floor, so that is not the shortcut it looks
like.

So the shape is **mix once, store the mix, presign thereafter**. The first
export pays the CPU and every later download is free and direct, which also
turns the mix from a per-download cost into a per-recording one. That is the
larger win, and the `mix-read` figure above is the evidence for it.

**It needs a credential change.** `thefloor-server` already holds `GetObject`
on recordings, which is enough to *sign* a download URL — that half works
today. Storing a mix needs `PutObject`, which it has not got, and
`thefloor-egress` is deliberately PutObject-only. So one policy widens, scoped
to a `mixes/` prefix. Read CREDENTIALS.md first: the separation of those
credentials is deliberate and this is the first thing to blur it.

Two things that will otherwise cost an afternoon:

- **`<a download>` is ignored cross-origin.** A link straight at S3 saves the
  file under its object key and discards the filename. Sign the URL with
  `response-content-disposition=attachment; filename="…"` so S3 sends the
  header itself.
- **A presigned URL is a bearer credential in a URL**, which is the one thing
  this project otherwise refuses — see the guest link's reasoning, and the
  privacy policy's account of who can reach a recording. It is defensible with
  a short TTL, one object, and issue only after an authenticated request, but
  it wants a decision entry rather than passing unremarked.

**The trigger is not here yet, and this entry exists so it is recognised when
it is.** The largest export so far is 43.7MB against 1,232MB available on the
box, and thirty days of egress from this server is 1.13GB against a 3TB
allowance — 0.04%. What to watch is a single export past ~150MB, or
`mix-read` climbing against `mix-write`. The second is the cheaper signal and
is already visible.

Note that the mix now runs at `PRIORITY_LOW` on one core, so a long one is slow
rather than a hazard to live audio. That was the urgent half and it is done;
what is left pushes on storage and repetition, not on calls being interrupted.

Pairs with § *Review S3*, which is what would say what the stems actually cost.
`bin/usage` cannot see them at all — the egress jobs write to the bucket on
their own credential and never through this process, so the largest category of
bytes is missing from every number it reports.

