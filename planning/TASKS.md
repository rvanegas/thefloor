
# TASKS

These are new items on the roadmap — features, but also audits, open questions
and things to go and find out. There are more in BACKLOG.md.

## Stepping into Channel Distinct from Tapping on Card

## Loading Channel View

## Relation of Version and Build

## Recency per Channel

## Effect of Quitting App

## Clipboard Sharing

## Idleness Privacy

## Contact Card Sorting and Classes

## Notify Channel Member

Ping specific member with a notification with specific text. Limited char count.

## Review Logic for States

Self-Mute, Muted-by-Claim, Claimed Floor, In-App, Present-in-Channel, Mic Open, Speaking, Recording, Playing, Audio Connected, Audio Output Selection.

For each of these and perhaps others: determine its name in the source code, determine its conditions according to the source, and further specify its conditions where these disagree.

Allow recording when alone.

Multiple members present, audio from background app with its output set to bluetooth speakers. Does audio loop back into mic and into channel?

Self-muting in a channel with other speakers should not disconnect output from bluetooth headphones.

Regression: Running Zoom client on phone at the same time aggressively holds audio for itself, muting and/or silencing TheFloor.

## Channel Admins

Channels, by default, have no admins or owner. In channel settings, a user can declare himself owner, and then give admin status to others. Certain functions are now available only to admins, and owner who is an admin implicitly.

## Track Usage

Per user tracking of minutes and timestamps of webrtc usage, minutes and timestamps of media playback including recordings playback, minutes and timestamps of recordings associated to user who initiates the recording, GBs of recording egress/exports. Also, track minutes and timestamps of conversation shared by pairs of users. This tracking expires if more than one week old. 

All of this is saved in db.

## Redesign User Cards

In both Home and Channel views, user cards need redeign. Their cards can be horizontally thinner, and include name and time strings on same line. Omit indication of whether there exists a channel already. This information is on the User View. Is that what the source calls it? A User View? Also, do not display all contacts. Only six. If user has more contacts, then after these display a control (with same icon as "start a channel") with label "See All" and opens a new View "Contacts". On both Home View and User View, sort contacts by a key to be determined later.

## Media Playback quality

Suppose two users are in a channel, both are muted and they are playing media. Is the quality of the playback equivalent to playing it directly or is it diminished by passing over webrtc? I sometimes get the impression that quality varies even during the playbook of a single file. Volume also seems to rise and fall, without manual intervention. Maybe this is a feature of webrtc?

## Transcripts

Implement integration with Assembly.ai. Use multi-channel transcripts, searchability, batch transcription (not streaming), multi-language, diarization or speak-identification. Transcript triggered manually on recordings, result attached to recording and exportable. Search available during playback, and also across set of recording in channel.

## Watch Party

Currently, media play allows uploaded audio to be played and included into exportable recordings. Independently of this functionality, a watch party plays video, and disallows recordings. Plan is here: WATCHPARTY.md

## Availability Logic

By way of indicators and notifications, users know when their contacts are available for conversartion, without having to interrupt each other with disruptive phone calls.

## Phone Calls

What happens when user receives a phone call?

## Anonymous Web Access

Channels can be shared to anyone with a link which navigates to web page with channel view modified for anonymous listener. Plan is here: ANONWEB.md

## Calendar Integrations

Explore scheduling and usage patterns

## Introduce Radiate

A channel owner can gen a link defining the channel as root. Define a user's radiate number relative to a channel as 0 if user is in channel, and 1 + n the minimum radiate number of one's recently connected contacts is n. Recency is defined as having exchanged words in a channel. Having exchanhed words is defined as taking immediate turns in both directions in a channel.

Number is updated lazily when exchange occurs. In User View display radiate number.
n
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

