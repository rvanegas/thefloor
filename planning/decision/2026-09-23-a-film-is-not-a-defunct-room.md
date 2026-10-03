# A film is not a defunct room

Rule A — `ChannelRegistry.considerRetiring`, 2026-09-06 — steps everybody out
of a room into which nothing is published unmuted and in which no media is
playing for `WAITING_WINDOW_MS`. It asked `playback.status` and never
`watch.status`, so a room watching a film in silence read as defunct and was
emptied fifteen minutes in.

**Reported from the room rather than found by reading.** Two channels, one
account, twice in forty minutes: stepped out at 900.1s and 900.0s from the last
microphone closing, the second time with the screen lit and the video playing.
No socket closed in either window, which is what ruled out the disconnect grace
— the first diagnosis, and the wrong one. The watch position froze at the same
instant both times, which is what dated the first occurrence before anybody
thought to look.

**The comment on the rule said the case was safe, and said why, and the why
covered half the room.** It argued that a party's mute is `setSilenced` — each
listener unsubscribed from each speaker — rather than a track mute, so tracks
stay unmuted for the length of a film and `publishing` is never empty. Every
word of that is still true, and it is true only of somebody whose microphone is
open: the second-device configuration this design prefers, film on a
television, you in the room on your phone.

It says nothing about watching on the device you are in the room on. That
microphone is not muted but **closed** — `isScreening` in core/micNeeded.ts,
for stereo, since an open microphone forces `playAndRecord` under a voice mode,
which is mono over Bluetooth and ducked. A closed microphone is not an unmuted
track and not a muted one; it is no track, so there is nothing for the
mechanism to be true of. And that configuration is the one the app defaults to,
the film coming up on the device you are looking at — so the case the comment
called safe was the ordinary one.

**What falsified it was the player moving into the app**, which created a
configuration in which the audience has no microphone rather than a quiet one.
core/micNeeded.ts records precisely that, in as many words — *the second has
come back, inverted, and the sentence it left on is now false* — about its own
watch-party clause. Nothing connected that note to this rule, written two days
earlier and reasoning about the same film from the other end.

The first draft of this entry blamed the 2026-09-05 change that made
`publishing` count transmitting microphones rather than existing ones. That
change is real and is the clause above this one in the code, but it is a red
herring here: it governs tracks that exist and are muted, and the screening
device has no track at all. Corrected on the day, on a reader's question.

GLOSSARY.md § *Mute* carried the same too-broad claim and has been corrected in
place.

So the exemption is by exception now, and says so. `considerRetiring` asks
`watch.status` beside `playback.status`, which puts it in step with
`subscribeable` in core/channel.ts — the two are described in both their
comments as a pair, and differed on exactly one of the three things
`subscribeable` counts.

## The pause is what makes the exemption safe

The objection to exempting a watch party is that it is then a way to opt a
channel out of Rule A for ever: leave a video running in a room everybody has
walked out of and no clock can ever start. Answering it by exempting the
non-empty case only — asking whether anybody is there as well as whether
anything is playing — would have put the same condition in two rules and left
the state itself still claiming a film was playing to nobody.

**So `tick` pauses instead.** A playing track or a playing party in a room with
no occupants comes to rest, and the room is quiet a tick later; every clock
that was waiting on quiet starts then, unchanged. The rule needs no knowledge
of who is present and the state stops asserting something that is not true.

Paused rather than stopped, so the evening survives being walked out of: the
party, the video and the position are all kept, and somebody stepping back in
resumes where the room left off. Occupants rather than `present`, on
`pollUsage`'s reasoning — a room holding guests and no members is a room with
people in it.

Worth knowing: an abandoned party was always self-limiting in the end, since
`watchHasReachedEnd` pauses a video once a follower has reported its length.
That is a bound of hours and the wrong shape to rely on, and it does nothing at
all for a party whose length nobody reported.

## What the tests were worth before this

Both new assertions were written the way the existing one was — advance the
clock past the window, poll once — and **passed against the unfixed code**. One
poll can only ever start the quiet clock, so a single poll after any amount of
time retires nobody and the assertion held whatever the rule did. The existing
*a track is playing to silent listeners* had been vacuous on the same ground
since it was written; it now polls twice, as the watch-party pair do, and each
was checked against a reverted fix before being kept.
