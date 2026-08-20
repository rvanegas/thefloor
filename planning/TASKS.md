
# TASKS

These are new items on the roadmap — features, but also audits, open questions
and things to go and find out. There are more in BACKLOG.md.

## Self-Mute Still Moves the Audio Category

**Reported 2026-08-19; fixed twice on 2026-08-20 and heard neither time.** The
symptom is a tone on self-mute and its inverse on unmute, reproduced on AirPods
Pro with somebody else talking — a Bluetooth profile handover, which the
channel-wide rule adopted 2026-08-18 exists to prevent.

**The first fix aimed at the audio category, which is not what moves.**
`policyFor` stops the SDK's native observer writing `IDLE` at a playout-only
transition. Real, kept, and insufficient: build 56 carried it and the tone was
unchanged.

**The second separates the two closes, and is what wants hearing.** Muting used
to stop capture, and stopping capture is what releases the hands-free link.
There are now three states rather than two — `MicIntent` in `useSessionAudio.ts`
— and `muted` leaves the device exactly as it is. The reasoning, the two
implementation details that are not free choices, and what the promise now
trades are in DECISIONS.md § *Muting and letting go are two different closes*.

**What remains is a phone, AirPods and a second person.** Self-mute and unmute
should be silent; the crossings when somebody arrives and when the last person
leaves should still be audible, and that is deliberate. STATES.md disagreement 9
is marked fixed-in-source, unverified, and says not to stamp it closed from the
diff — which is exactly what happened to disagreement 5 the same morning.

**Check two things that are not the tone**, since both are new and neither is
covered by a test that can hear:

- **The orange microphone indicator stays lit through a self-mute**, and going
  out when you leave the channel or the last person does. Lit for the whole call
  is correct now. Never going out is a leaked device.
- **The echo canceller after a self-mute that ends alone.** Self-mute, have the
  other person leave, then have somebody arrive and talk. This is the path where
  the device must have been let go — `releaseMicrophone` unpublishes for exactly
  this reason — and getting it wrong sounds like the far end hearing themselves,
  which is POSTMORTEM-echo.md.

If a tone survives all this, the instrument needs no build and no code — see
below — and the next suspect is not the category, which will have been ruled out
twice.

The instrument wants the phone on **USB**, not merely paired over the network:

    idevicesyslog -m "Native auto-config"

**Not `log stream`**, which this file and two others recommended until
2026-08-20: it reads the Mac's own logs and has no device options on current
macOS, so it succeeds and shows nothing. The observer logs from native code, so
a TestFlight build answers the category question; only the `[audio]` lines need
a development build.

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

