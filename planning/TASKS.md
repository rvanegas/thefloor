
# TASKS

These are new items on the roadmap — features, but also audits, open questions
and things to go and find out. There are more in BACKLOG.md.

## Self-Mute Still Moves the Audio Category

**Reported 2026-08-19 and still true after a fix: self-muting plays a tone and
unmuting plays its inverse, with another person present and talking.** That is a
Bluetooth profile handover — A2DP to HFP and back — and under the channel-wide
rule adopted 2026-08-18 it should not happen.

**The first fix was aimed at the category, and the category is not what moves.**
`policyFor` (2026-08-20) stops the SDK's native observer writing `IDLE` while
somebody else is talking, which was a real disagreement and is kept. Build 56
carried it, was tested on a device the same day, and the tone was unchanged.

**What is now believed, and this codebase already said it.**
`stopMicTrackOnMute: true` makes a self-mute genuinely stop capturing, and the
comment in `useSessionAudio.ts` arguing *for* that setting notes that a muted
track otherwise "keeps the device open, so … a Bluetooth speaker stays in the
mono hands-free profile". Read the other way: **stopping the track is what
releases HFP.** The link drops on mute and is re-acquired on unmute, the
category stays `playAndRecord` throughout, and nothing handed to the observer
can prevent it. Neither can a different AVAudioSession category: the constraint
is the Bluetooth protocol rather than iOS, and a headset cannot carry a
microphone and stereo at the same time.

**What "muted" means was the question underneath, and it is decided
(2026-08-20): muted means *nothing is transmitted*, expansively. The hardware
mode is not part of the promise**, being invisible and functionally irrelevant
to the other side. That picks candidate 1 below and retires the other two, and
it is worth stating as a promise rather than an implementation detail, because
it is the thing a future change must not quietly weaken: what is being traded
is a hardware guarantee for a software one. The track is disabled and no samples
leave, but somebody self-muting to say something in the room is now trusting
code rather than the OS. The orange indicator staying lit is the visible face of
that and is accepted — during a call it is lit anyway, and what changes is only
that self-mute stops extinguishing it.

**The three candidates, for the record and because the last fix was chosen
without testing any of them.**

1. **Separate the two closes** — the leading candidate. `stopMicTrackOnMute:
   false` so a self-mute leaves capture running and there is no transition to
   hear, *plus* an explicit release when `micNeeded` goes false.
   **The second half is not optional and the flag alone is not the fix.** That
   setting is a room-level publish default and cannot tell the two reasons the
   microphone closes apart; today they are deliberately conflated, both calling
   `setMicrophoneEnabled(false)` and both stopping the track. Flip it and
   neither stops, so an empty channel hands back to `playback` with the input
   still running — which `useSessionAudio.ts` names as what silences the echo
   canceller, and is the one-way door from the other side.
   Costs the orange microphone indicator staying lit while the app says you are
   muted. No audio leaves, the track being disabled, but iOS and the app then
   disagree on screen about a thing users are right to care about. Does *not*
   cost the usage meter: `server/src/channels.ts` deliberately polls the room
   rather than trusting that predicate, and says so.
2. **Drop `allowBluetooth` from `CALL` and keep `allowBluetoothA2DP`** —
   *rejected 2026-08-20.* The headset microphone is never used, input comes from
   the phone, output stays A2DP stereo, and there is no handover ever. It is the
   right answer for a Bluetooth speaker and the wrong one here: **the tone was
   reproduced on AirPods Pro**, and this would route a voice through a handset
   that is usually in a pocket. Worth remembering if the hardware assumption
   ever changes — for a speaker-in-a-room product this is the cheapest fix
   there is.
3. **Keep it and fix the story instead** — *rejected by the same decision.*
   STATES.md frames the transition as an honest signal that the room is live,
   and it has now been reported as a defect twice by the person who wrote that
   framing. Note what survives anyway: candidate 1 removes the mute/unmute pair
   and **not** the alone→somebody-arrives and last-person-leaves crossings,
   which still move the profile. So the cue does not disappear — it narrows to
   the boundaries that carry more meaning, which is arguably what STATES.md
   should have claimed in the first place.

**The tone was reproduced on AirPods Pro on 2026-08-20**, which is a device
with a microphone and therefore an HFP link to lose — consistent with the
diagnosis above. A Bluetooth speaker usually has no microphone, so the boundary
is silent there and the audio is stereo throughout, which the same day was read
as proof that a live microphone was shut. STATES.md carries that correction.
**Test whatever is chosen on both, since the symptom differs by hardware.**

The instrument, if one is wanted, needs no code:

    log stream --predicate 'subsystem == "com.livekit.react-native-webrtc"'

If no `Native auto-config: setting category …` line appears at the instant of a
tone, then the category is not moving and the route is — which is the argument
above, settled.

## Clipboard Sharing

In channel, any user may paste his clipboard into the channel, after which any user may copy from the channel to his own clipboard. This is then a convenient way to share URLs or other small contents for which clipboards are typically used.

## Channel Admins

Channels, by default, have no admins or owner. In channel settings, a user can declare himself owner, and then give admin status to others. Certain functions are now available only to admins, and owner who is an admin implicitly.

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

