
# FEATURES

These are new items on the roadmap.

## Track Usage

Per user tracking of minutes and timestamps of webrtc usage, minutes and timestamps of media playback including recordings playback, minutes and timestamps of recordings associated to user who initiates the recording, minutes of transcripts requested, GBs of recording egress/exports.

## Media Playback quality

Suppose two users are in a channel, both are muted and they are playing media. Is the quality of the playback equivalent to playing it directly or is it diminished by passing over webrtc? I sometimes get the impression that quality varies even during the playbook of a single file. Volume also seems to rise and fall, without manual intervention. Maybe this is a feature of webrtc?

## Watch Party

Currently, media play allows uploaded audio to be played and included into exportable recordings. Independently of this functionality, a watch party plays video, and disallows recordings. Plan is here: WATCHPARTY.md

## Availability Logic

By way of indicators and notifications, users know when their contacts are available for conversartion, without having to interrupt each other with disruptive phone calls.

## Payment

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

## Integration

Calendar, Contacts.

## Transcripts

Implement integration with Assembly.ai. Use multi-channel transcripts, searchability, batch transcription (not streaming), multi-language, diarization or speak-identification. Transcript triggered manually on recordings, result attached to recording and exportable. Search available during playback, and also across set of recording in channel.

## Anonymous Web Access

Channels can be shared to anyone with a link which navigates to web page with channel view modified for anonymous listener. Plan is here: ANONWEB.md

## Build for Android

First evaluate relevant differences and establish dev simulator on mac.
