
# TASKS

These are new items on the roadmap — features, but also audits, open questions
and things to go and find out. There are more in BACKLOG.md.

## Self-Mute Still Moves the Audio Category

**Reported 2026-08-19. Four fixes on 2026-08-20, none of which changed the
sound.** Self-muting hands a Bluetooth headset from the hands-free link back to
A2DP and unmuting brings it back, audibly, reproduced on AirPods Pro with
somebody else talking.

**Stop proposing mechanisms. The next move is a reading.** What was tried, in
order, each plausible and each kept because each corrected something real:

| Build | Aimed at | Result |
| --- | --- | --- |
| 56 | the audio session's **category** (`policyFor`) | no change |
| 57 | the mute **releasing the track** (`MicIntent`) | no change |
| 58 | the engine's **mute mode** (`configureMuteMode`) | no change |

Three different layers, three confident diagnoses read off the source, three
misses. The common fault is not the reasoning at any step — it is that four
rounds of reading were spent before one measurement, and the reading kept
finding mechanisms that were real but not this one.

**The instrument is `src/audio/engineState.ts` and it needs no syslog, no USB
and no Mac.** Every audio-engine reader is blocking-synchronous, so a full
snapshot is taken either side of each microphone transition and the
*difference* kept — `recording: true -> false`, or `nothing moved`.

**It reads on the phone, in a TestFlight build**, under the mute button in
`ChannelView`, because the reading needs a Bluetooth headset and a second
person and that is a situation which happens away from a desk. A development
build would put the answer in Metro, where somebody who is not at home cannot
get at it. Development builds log it as well, so `expo run:ios` still works.

**All of it is temporary and comes out together**: `SessionAudio.engineLog`,
`src/audio/engineState.ts`, and the block in `ChannelView` that renders it.
Deleting one and leaving the others is how a diagnostic becomes furniture.

**What each reading would mean** is written into that file's header so the next
session does not re-argue it. In short: `recording` going false means the input
is stopped despite everything, and the next lever is
`setRecordingAlwaysPreparedMode`, which exists to hold it open. `nothing moved`
means the engine is not what moves, three of the four fixes were aimed at the
wrong layer entirely, and the route is the remaining suspect — which is awkward,
because nothing in this stack can read a route (STATES.md, disagreement 8).

**Do not ship a fifth fix before that reading exists.** It is the only
instruction in this entry that matters.

If the syslog relay is wanted as well, it takes the phone on **USB** — a network
pairing is not enough, and `devicectl` will happily report the device
"available" while the relay says "No device found":

    idevicesyslog -m "Native auto-config"

**Not `log stream`**, which three files recommended until 2026-08-20: it reads
the Mac's own logs and has no device options on current macOS, so it succeeds
and shows nothing.

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

