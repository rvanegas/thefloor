
# FEATURES

These are new items on the roadmap.

## Idle Timer

User card should say how long has been idle. Two timers: first, time since not in app, displayed in Home View user card. The second, time since not present in channel, displayed in user card of channel.

## Track Recording Costs

Track costs of recordings and assign them to the user who starts the recording.

## Meter WebRTC

Count connection minutes as they are spent, so running out is something seen coming rather than discovered. The free tier is 5000 minutes a month and it ran out on 2026-08-13 with no warning: the first sign was a channel with people in it and no audio, and the app showing the LiveKit SDK's own words for a refused websocket. LiveKit will not tell us the remaining budget — the Analytics API reports `connectionMinutes` per session and is Scale plan or higher, and nothing at any plan reports an allowance or a reset date — so the count has to be ours. The server already knows who is present in which channel and when, which is the same quantity LiveKit bills, every human participant-minute; ingress, egress and playback participants are not charged. That makes it an estimate rather than the authoritative number, which is fine for a warning and not for a bill. Display on HomeView, before channel cards.

## Watch Party

Currently, media play allows uploaded audio to be played and included into exportable recordings. Independently of this functionality, a watch party plays video, and disallows recordings. Plan is here: WATCHPARTY.md

## Availability Logic

By way of indicators and notifications, users know when their contacts are available for conversartion, without having to interrupt each other with disruptive phone calls.

## Payment

In-app purchases, optional.

## Integration

Otter.ai, Calendar, Contacts.

## Anonymous Web Access

Channels can be shared to anyone with a link which navigates to web page with channel view modified for anonymous listener. Plan is here: ANONWEB.md

## Build for Android

First evaluate relevant differences and establish dev simulator on mac.
