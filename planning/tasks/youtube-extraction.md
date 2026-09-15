# Youtube Extraction

Take a youtube url, determine whether an audio only download is available, and make it available to media player using yt-dlp and ffmpeg.

## What is already built, and what it leaves to do

The pipeline this lands in exists end to end. `POST /channels/:id/track` takes
bytes, writes them into a per-track directory minted by `newTrackDir()`, asks
`probeDurationMs` how long the file actually is rather than trusting whoever
sent it, and calls `loadTrack`. From there `PlaybackPump` decodes through an
ffmpeg child into 10ms frames and sends the *same samples* to the room and to
the recording stem. **So "make it available to media player" is: land a
decodable audio file in a track dir and call `loadTrack`** — nothing downstream
changes, and a second path into playback would be a second thing to get wrong.

`parseYouTubeUrl` in `core/watch.ts` already gates this on both ends, by regular
expression so it runs under Metro, matching the eleven-character id exactly.
Reuse it; a second parser is how the app and the server come to disagree about
what a link is. ffmpeg is already provisioned. **yt-dlp is not.** `export.ts`'s
`run` is the model for spawning a child politely on this box — `-threads 1` plus
`setPriority(PRIORITY_LOW)`, because the SFU shares the two vCPUs and a live
conversation has nothing but urgency.

## This contradicts a shipped decision, and that is the substance

`core/watch.ts` opens with *"The Floor carries no video. What travels is a
transport clock over a link, and each person's own player follows it."* The
submission notes for every release since 1.2.0 carry that argument to Apple:
never fetches, decodes, stores or shows a frame; YouTube's own IFrame player,
unmodified and unobscured.

**Extraction inverts every clause of it.** The server would fetch YouTube
content, decode it, store it, publish it into a room, write it into a
recording, transcribe it, and hand it back as an exportable file. That is
squarely the surface `backlog/playing-media-into-a-channel-is-a-copyright-surface-nobody-has-addressed.md`
says has never been reviewed, and it is a harder case than the upload it
generalises: there the user brought a file they already had, here the server
is the party doing the fetching. It also collides with `watch-leaves-labs`,
which is a rewrite of those same notes.

**So step zero is a dated decision file, and the scope question is open.**
Three readings, and they are not the same piece of work: **(a)** extraction is a
first-class way to load a track, which needs the review-notes rewrite and
probably a line on the privacy page; **(b)** it sits behind *Labs* alongside
Transcribe, which changes the arithmetic in `watch-leaves-labs` since Labs would
then gate two things rather than one; **(c)** only the probe is built — the half
that answers *is an audio-only download available* is a read and stores nothing
— and the fetch is left undecided. What follows plans (a); (b) adds a gate and
(c) stops after step three.

## The build

**A spike first, because it can make the rest moot.** YouTube increasingly
serves bot-checks to datacenter IPs. One `yt-dlp -J` run from the live box
against a handful of videos, before anything is written: if it 403s there, the
answer is cookies, and cookies are a credential with an account attached — a
`CREDENTIALS.md` entry and a different conversation. Ten minutes to find out.

**1. `server/src/youtube.ts`, the only module that knows yt-dlp exists.**
Behind an interface the way `MediaServer` and `Decoder` are, so the channel
tests never shell out. Two functions:

- `probeAudio(videoId)` runs `yt-dlp -J --no-playlist` and filters `formats`
  for `vcodec === 'none' && acodec !== 'none'`, returning the title, the
  duration and the chosen format, or **null**. Null is the task's *determine
  whether*: live streams, members-only, region-blocked, age-gated and
  audio-less videos are an ordinary **no**, and are distinguished from the
  apparatus being broken — the distinction `isNotFound` draws in `media.ts`,
  drawn here for the same reason.
- `fetchAudio(videoId, dir)` runs `yt-dlp -f bestaudio` and then ffmpeg, both
  reniced, both under a wall-clock timeout that kills the process group.
  Transcoding rather than passing `bestaudio` through, though `FfmpegDecoder`
  would decode either: it normalises the extension that `GET
  /channels/:id/track` reads its content type off, and `-vn` explicitly, so a
  format carrying embedded cover art cannot smuggle a video stream into the
  file.

**2. `POST /channels/:id/track/youtube`, a sibling of the upload route rather
than a branch inside it.** Validate with `parseYouTubeUrl`; 400 if null. Probe;
**422 with a reason the user can act on** if the probe says no — *that video has
no audio-only download* and *that is a live stream* are different sentences and
the person pasting the link can only act on one of them. Otherwise
`newTrackDir`, fetch, `probeDurationMs` against the result rather than yt-dlp's
metadata, `loadTrack` under the video's title. Remove the directory on any
failure; the existing route's error handling already gets this right and should
be copied rather than reinvented.

**3. Bounds, which are all new exposure.** The upload route is bounded by
`MAX_TRACK_BYTES` and by a human choosing a file off their phone. **A URL is
bounded by nothing.** A duration cap checked at probe time, before a byte is
fetched, is the cheap guard and the important one; `--max-filesize` is the
backstop for when the duration is wrong; a timeout, because yt-dlp hangs on a
stalled CDN; and **one extraction at a time**, per channel and ideally per box,
since two yt-dlp-and-ffmpeg pairs on two vCPUs is audible in the live room.
Membership is already checked inside `loadTrack`.

**4. App.** A sibling of `app/src/api/upload.ts` that posts a URL, and an entry
point in `ChannelView.tsx`; the Start-button logic already lights up off
`parseYouTubeUrl`, so the client-side shape exists. **It needs a pending state
the upload does not**, because an upload's progress is known and an
extraction's is *the server is working on it, for between two seconds and a
minute*. A pending track slot, cleared when `loadTrack` broadcasts, is the
honest version.

**5. `bin/provision`, and not from apt.** The packaged yt-dlp lags and yt-dlp
breaks whenever YouTube changes, so a stale one fails in the field with an
opaque error. Pin a release binary, and **put its version on `/healthz`** beside
the sha, so `bin/health` can say whether the box's extractor is the one you
think it is — updating it is then an ordinary deploy-time concern rather than a
mystery.

## Tests

`core/` needs nothing. The server tests fake the module at its interface: a
non-YouTube url is 400; a null probe is 422 carrying the right reason; the happy
path calls `loadTrack` with the **probed** duration rather than yt-dlp's; a
throwing fetch leaves no track directory behind; an over-long video is refused
*before* the fetch. One integration test that really shells out, skipped by
default, since it depends on the network and on YouTube's mood.

## Order

The spike; the decision file; `youtube.ts` and its tests; the route, its bounds
and its tests; `bin/provision` and the health line; the app entry point and its
pending state; and the review-notes rewrite, coordinated with
`watch-leaves-labs` rather than done twice.
