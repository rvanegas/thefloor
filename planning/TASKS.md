
# TASKS

These are new items on the roadmap — features, but also audits, open questions
and things to go and find out. There are more in BACKLOG.md.

## Should a Closing Socket Stamp Now, or the Last Thing It Heard

Found while answering "What a Restart Does to Last-Seen", which is now in
DECISIONS.md, and left as a question because the answer moves a user-visible
number. The `close` handler in `server/src/ws.ts` writes
`markSeen(connection.userId, now(), ...)` — the moment the socket ended. For a
sign-out or a foregrounded app that is the truth. For a phone that froze in a
pocket it is not: `sweep` needs HEARTBEAT_TIMEOUT_MS to notice, then
`socket.close()` spends `ws`'s 30-second `closeTimeout` waiting for a close
frame that is never coming, so the handler runs about 42 seconds after the last
thing that actually proved the person was there, and stamps *that* as when they
were last seen. On Home the 60-second floor in `agoOrNull` is laid on top, so
somebody reads "In the app now" for roughly a hundred seconds after their last
ping rather than sixty.

`connection.lastSeen` is sitting right there, is never later than the truth,
and is at worst one five-second heartbeat early — which the floor absorbs. So
the change is one word. What makes it a question rather than a fix is that it
shortens how long a pocketed phone looks present, and how long that should be
is the same product question as "Is a Hundred Seconds the Right Time to Declare
Somebody Gone" below. Decide them together; two independent nudges to the same
number is how it ends up somewhere nobody chose.

## Is a Hundred Seconds the Right Time to Declare Somebody Gone

Measured 2026-08-20 and left open deliberately. A suspended phone stops being
present 105 seconds later, not the 72 to 77 that HEARTBEAT_TIMEOUT_MS and
DISCONNECT_GRACE_MS account for between them; the rest is `ws`'s 30-second
`closeTimeout`, spent waiting for a close frame from a process that is frozen.
DECISIONS.md § *Backgrounding costs presence in about a hundred seconds* has
the measurement and the mechanism, and `bin/suspend-log` is how to take it
again.

The question is not whether the 30 seconds is a bug — it may be exactly the
slack wanted before declaring somebody gone. It is that nobody chose it. It
arrived as a library default, through a `socket.close()` written to do
something else, and it is 40% of a budget the repo believed was 72 seconds.
`socket.terminate()` in `sweep` would remove it at a stroke and keep the same
close handler, so the choice is cheap in either direction; what is wanted first
is a view on what the number should be, and that is a product question about
how long a tunnel is. Note the same delay sits in front of everything else that
keys on a channel emptying — a forgotten recording's tail, most visibly.

## Contacts View

**Built 2026-08-19.** `app/src/ui/ContactsView.tsx`, reached from a link beside
Settings in Home's header. A row is a person and their availability — "In the
app now", "last seen 3 hours ago" — and tapping one opens `ProfileView`, which
is where the bio, the shared channels and removing them already lived. There is
deliberately no "step into a channel with them" on a contact row: that overlap
is what took the old contact list apart, and Home owns the channel list.

`Add contact` came with it, folded away at the top: a line until tapped, then a
field, because reading the list is what somebody opens this screen for. The
screen carries its own settings link, on the pattern Home and a channel already
followed, and `Name` and `About you` moved into it from the Home settings screen
— those are what a contact sees, so they belong behind the contact list rather
than beside the appearance setting and the delete button.

**Two things are still open.** Requests are still on Home, and were left there
on purpose for now: an incoming request is time-sensitive, and a person is
something you look up where a request is something you answer. Whether that is
right or whether they should follow the contacts is a decision nobody has made.
And the order is the server's, which is to say undecided — see
`## Contact Card Sorting and Classes` below, which is still empty.

## Contact Card Sorting and Classes

above is about. A profile reachable without entering a channel; `ProfileView`
and its route in `App.tsx` are both still wired and reachable from a channel
roster, so this is a way in rather than a screen to build. The requests and
`Add contact`, which are on Home in the meantime only because an incoming
request is time-sensitive and would be invisible behind a screen nobody has
built yet. And the availability line — "In the app now", "last seen 3 hours
ago" — which is on the profile now and was on every contact row before; the
server never stopped composing it, so showing it again is a rendering change.

## Review Logic for States

**The audit is done and lives in STATES.md**, which is now the standing
reference for what each state is called in each layer, when it holds, and where
two layers describe the same thing. Its closing section numbers the
disagreements it found; three of those are open by design and documented as
such, and the rest are either closed or already handled.

Six of the seven numbered items are closed. 1 and 5 — recording alone, and
stepping out clearing the mute — were already built and tested, and the audit
only confirmed it. 3 and 7 were one bug: self-muting reconfigured the audio
session, which forced a Bluetooth profile handover and lost the route. 4 and 6
were another: a room that dropped had no path back, so a Telegram or Zoom call
left the channel live with dead audio until the app was force-quit. Both fixed
2026-08-18; the diagnoses are in DECISIONS.md.

**What is left is item 2, which needs a phone.** Multiple members present, audio
from a background app with its output set to Bluetooth speakers: does it loop
back into the mic and into the channel? The configuration half-answers it — with
anybody's microphone open the session is `CALL`, which carries no
`mixWithOthers`, so the background app is interrupted and there should be
nothing left to loop back. What that does not settle is whether iOS honours the
exclusivity against a route that is already active, which no log line here can
report: nothing in this stack can read the audio route at all.

To go and find out: run a development build, which writes an `[audio]` line on
every session write, alongside the SDK's own `os_log` — see STATES.md for the
`log stream` predicate and for the warning about the one instrumentation
approach that would silently break the audio policy.

## Self-Mute Still Moves the Audio Category

**Reported 2026-08-19, from the phone: self-muting plays a tone and unmuting
plays its inverse, with another person present and talking.** That is the sound
of a Bluetooth profile handover, and under the channel-wide rule adopted
2026-08-18 it should not happen — with somebody else's microphone open
`anyMicrophoneOpen` stays true, `sessionFor` returns `CALL` both sides of the
mute, and `useSessionAudio.ts`'s `appliedRef` comparison finds the configuration
unchanged. Our writer did the right thing. The category moved anyway.

**The mechanism is the native observer, and it is reinstating exactly the rule
the fix replaced.** `app/index.ts` installs it as
`setupIOSAudioManagement(true, { recording: CALL, playout: IDLE })`, and
`@livekit/react-native/src/audio/AudioManager.ts` says what that means: *"The
native observer applies `recording` while recording, `playout` while
playout-only, and deactivates on full stop when requested."* The question it
asks is whether **this device** is capturing — which is the per-self rule
STATES.md's `Audio Session Configuration` entry says was wrong. So
`setMicrophoneEnabled(false)` takes the engine to playout-only, the observer
applies `IDLE`, and `playAndRecord` becomes `playback`: HFP down, A2DP up, one
tone. Unmute reverses it for the other.

It wins because it is not a competing JavaScript write. `applyFor` re-states
`CALL` immediately afterwards, but that is a round trip through
`LiveKitModule.setAppleAudioConfiguration` landing *after* a native policy that
was applied on the audio worker thread at the transition itself.

**This is disagreement 5 in STATES.md, and it is now a bug rather than a
hazard.** `index.ts`'s comment licenses the two writers to differ and argues
that licence entirely in terms of `mixWithOthers` — an unrequested write "can
only ever let another app back in and never take one away." But `IDLE` and
`CALL` also differ in **category**, and the category is the route boundary. The
licence was written as though the observer could only cost somebody's music. It
can also cost the profile, which is the thing the channel-wide rule exists to
protect.

**One link is inferred and wants the phone.** That `setMicrophoneEnabled(false)`
drives the engine to playout-only, rather than merely disabling a track and
leaving the audio unit running, is read off the SDK rather than observed. A
development build writes an `[audio]` line on every write we make; the observer
writes to `os_log`. If the diagnosis is right the observer's line precedes ours
at each mute. Same predicate as item 2 above, and the same warning applies about
the one instrumentation approach that would silently break the audio policy:

    log stream --predicate 'subsystem == "com.livekit.react-native-webrtc"'

**Two fix directions, different in kind.** Either make the policy track
`anyMicOpen` — re-call `setupIOSAudioManagement` with `playout` set to whatever
`sessionFor` would return, so the observer agrees with us instead of being
licensed to differ — or stop the engine leaving recording on a self-mute at all,
muting the track rather than tearing down capture, so there is no transition for
the observer to fire on. The first collapses the `mixWithOthers` licence, which
is an argument to have rather than wave through, and the SDK cautions about
switching setup mid-call. The second is cleaner if it works and rests on the
same unconfirmed fact. Confirm before choosing.

## Media Playback quality

Suppose two users are in a channel, both are muted and they are playing media. Is the quality of the playback equivalent to playing it directly or is it diminished by passing over webrtc? I sometimes get the impression that quality varies even during the playbook of a single file. Volume also seems to rise and fall, without manual intervention. Maybe this is a feature of webrtc?

**Part of this was Bluetooth rather than WebRTC, and changed on 2026-08-18.**
Quality varying *during* one file is what the old audio rule produced on a
headset: any mute or unmute moved the session between `playAndRecord` and
`playback`, which is a switch between the mono hands-free profile and stereo
A2DP, mid-track. Under the rule in STATES.md the category now follows whether
*anybody* is capturing, so two muted people playing a file sit in A2DP for the
whole of it. Retest before investigating the codec — the remaining question is
narrower than it was, and the rising and falling volume is a separate matter and
most likely WebRTC's automatic gain control, which is worth confirming before
anything is built.

**And that claim is now in doubt** — see `## Self-Mute Still Moves the Audio
Category` above. If the native observer moves the category on every mute
regardless of what the channel-wide rule decided, then two muted people are not
sitting in A2DP for the whole of a file; they crossed the profile boundary on
the way in. Settle that before reading anything into a retest.

## Clipboard Sharing

In channel, any user may paste his clipboard into the channel, after which any user may copy from the channel to his own clipboard. This is then a convenient way to share URLs or other small contents for which clipboards are typically used.

## Channel Admins

Channels, by default, have no admins or owner. In channel settings, a user can declare himself owner, and then give admin status to others. Certain functions are now available only to admins, and owner who is an admin implicitly.

## Track Usage

Per user tracking of minutes and timestamps of webrtc usage, minutes and timestamps of media playback including recordings playback, minutes and timestamps of recordings associated to user who initiates the recording, GBs of recording egress/exports. Also, track minutes and timestamps of conversation shared by pairs of users. This tracking expires if more than one week old. 

Save all of this to db.

## Anonymous Web Access

Channels can be shared to anyone with a link which navigates to web page with channel view modified for anonymous listener. Plan is here: ANONWEB.md

## Transcripts

Implement integration with Assembly.ai. Use multi-channel transcripts, searchability, batch transcription (not streaming), multi-language, diarization or speak-identification. Transcript triggered manually on recordings, result attached to recording and exportable. Search available during playback, and also across set of recording in channel.

## Watch Party

Currently, media play allows uploaded audio to be played and included into exportable recordings. Independently of this functionality, a watch party plays video, and disallows recordings. Plan is here: WATCHPARTY.md

## Stepping into Channel Distinct from Tapping on Card

Optional.

## Availability Logic

By way of indicators and notifications, users know when their contacts are available for conversartion, without having to interrupt each other with disruptive phone calls.

## Phone Calls

What happens when user receives a phone call?

## Publishable Recordings

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

