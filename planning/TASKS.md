
# TASKS

These are new items on the roadmap — features, but also audits, open questions
and things to go and find out. There are more in BACKLOG.md.

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
they part. A backgrounded app loses presence in about a hundred seconds, so
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

## App Store Data Collection Answers

The privacy questionnaire in App Store Connect was answered for an application
that sent nothing anywhere. Transcripts change that: audio leaves for a
third-party processor when somebody asks, which is a disclosure rather than an
implementation detail, and getting it wrong is a rejection at the wrong end of
a submission. Go through the questionnaire again before the next one, with the
`/privacy` page open beside it — that page is now the honest inventory and the
two must not disagree.

Two other things have moved since it was last answered and should be checked in
the same pass rather than found separately. The usage meter records durations
and byte counts per account, which is data collected even though it is never
shown to anyone and expires in thirty days. And Ko-fi reports an email address,
a name and an amount for each donation. Neither is new — both predate the
questionnaire's last answers — so the question is whether it was answered for
them at all.

This is not a code task and nothing in the repository settles it. RELEASING.md
is where the answer belongs once it exists, beside the rest of what a
submission needs.

## Lock Screen

explore options in case screen locks during a call. lock screen, control center, etc.

## SMS Authentication

Not just email.

## Phone Calls

What happens when user receives a phone call?

## UI Restyling

Improve look and feel

## Odds and Ends

adding names to 'bin/usage', and simplifying

## Grow UI for iPad

Target iPad specifically.

## HF only

hands-free only media player. this should simplify matters.

## Add as Contact From Guest View

Being in same channel is permission to ask each other to be contacts, without need for email to identify.

## App as Watch Party Player

If watch party is started and a there is a second session with the same account, let the second app become the player.

## Publishable Recordings

A channel may declare itself public. If public, then it has a page at thefloor.rvanegas.co where anyone can listen to selected recordings. Settings would include image. Name and description would show on the page. Contacts remain private, though they may be explicitly described in the description.

## Calendar Integrations

Explore scheduling and usage patterns

## Introduce Radiate

A channel owner can gen a link defining the channel as root. Define a user's radiate number relative to a channel as 0 if user is in channel, and 1 + n the minimum radiate number of one's recently connected contacts is n. Recency is defined as having exchanged words in a channel. Having exchanhed words is defined as taking immediate turns in both directions in a channel.

Number is updated lazily when exchange occurs. In User View display radiate number.

## Build for Android

First evaluate relevant differences and establish dev simulator on mac.

## Payments Upgrade

Voluntary donations shipped on 2026-08-14 — a Ko-fi link, external, unlocking
nothing. See DECISIONS.md for why it is not in-app purchase. What is left:

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
