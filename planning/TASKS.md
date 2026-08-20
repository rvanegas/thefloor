
# TASKS

These are new items on the roadmap — features, but also audits, open questions
and things to go and find out. There are more in BACKLOG.md.

## Self-Mute Still Moves the Audio Category

**Reported 2026-08-19, from the phone: self-muting plays a tone and unmuting
plays its inverse, with another person present and talking.** That is the sound
of a Bluetooth profile handover, and under the channel-wide rule adopted
2026-08-18 it should not happen.

**Diagnosed and fixed in source on 2026-08-20; what is left is hearing it.** The
mechanism was the SDK's native policy observer, which `app/index.ts` installed
as `{ recording: CALL, playout: IDLE }` — a per-self rule reinstating exactly
the one the channel-wide rule replaced. `setMicrophoneEnabled(false)` took the
engine to playout-only, the observer applied `IDLE` on the audio worker thread
at the transition itself, and `playAndRecord` became `playback`. It beat our own
re-statement because anything crossing the bridge lands after it. `session.ts`'s
`policyFor` now hands the observer the value `sessionFor` would return, pushed
*before* each transition rather than restated after, so the two writers no
longer have anything to disagree about. The reasoning, the two traps in pushing
a policy, and the rejected alternative are in DECISIONS.md § *The native
observer is agreed with rather than argued with*.

**What remains is a phone, a Bluetooth headset and a second person.** Self-mute
and unmute should now be silent. This is a verification rather than a
precondition: the fix does not rest on the link that was inferred, since it
makes the observer agree with us whether or not a self-mute drives the engine to
playout-only. But the report was a sound and the confirmation has to be a sound,
so STATES.md's disagreement 5 is marked fixed-in-source, unconfirmed-on-device
and says not to stamp it closed from the diff. Stamp it once somebody has heard
it.

**If a tone survives, the next instrument is cheaper than it used to be.** The
standing "do not instrument this with `audioDeviceModuleEvents`" warning was
over-broad and has been narrowed in both places it appeared: only
`willEnableEngine` and `didDisableEngine` are owned by the native policy.
`setWillStartEngineHandler` and `setDidStopEngineHandler` are free, carry the
same `isPlayoutEnabled` / `isRecordingEnabled` pair, and would say whether the
engine transitioned at all — which distinguishes "our policy raced" from "not
the observer after all". Keep any such handler `__DEV__`-only and log-only; it
blocks the audio worker thread until it returns. The observer also logs to
`os_log`, which needs no code:

    log stream --predicate 'subsystem == "com.livekit.react-native-webrtc"'

Its `Native auto-config: setting category …` lines interleave by timestamp with
the `[audio]` lines `useSessionAudio` writes in development builds.

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

