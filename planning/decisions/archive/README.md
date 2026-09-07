# The closed volumes

Eleven volumes, 2026-08-07 to 2026-09-06, in the shape they were written in.
Frozen on 2026-09-07 when the project moved to one file per decision; see
`../README.md` for the scheme that replaced this one and why.

**Nothing here is appended to, and nothing is reformatted.** The dating and
heading conventions drift across the set — the first three volumes carry no
dates in their headings at all, later ones use `— YYYY-MM-DD`, and a few use a
trailing `, YYYY-MM-DD`. That drift is left alone deliberately: normalising a
frozen archive rewrites history to look tidier than it was, and everything that
reads these greps for a title rather than parsing a date.

The volume boundaries meant something for the first three — the media leaving
LiveKit Cloud, the first submission, the first public release — and nothing at
all for the rest, which were cut wherever the line count fell. Each says which
in its own header. Do not read significance into where the later ones stop.

**Two repairs were made on 2026-09-07, and they are the only edits these files
will ever get.** `## The deploy history` and `## The Android adaptive icon`
were running records that belonged to the live volume, and each rollover copied
them forward instead of moving them, so `DECISIONS-2026-08-31-to-2026-09-04.md`
and `DECISIONS-2026-09-04-to-2026-09-06.md` each ended up carrying a copy. The
copies had gone stale — the earlier one was missing the 2026-09-06 deploy — so
somebody grepping the set could get a wrong answer about what was on the box.
Both copies were deleted. The live versions are `../deploy-history.md` and
`../android-adaptive-icon.md`.

| Volume | Covers |
| --- | --- |
| `DECISIONS-2026-08-07-to-2026-08-13.md` | the first decisions through self-hosting the media |
| `DECISIONS-2026-08-13-to-2026-08-15.md` | self-hosted media through the first App Review submission |
| `DECISIONS-2026-08-16-to-2026-08-19.md` | the first submission through the first public release |
| `DECISIONS-2026-08-20-to-2026-08-21.md` | the presence measurements and the whole of the AirPods tone |
| `DECISIONS-2026-08-21-to-2026-08-23.md` | the notification levels, the two push stacks, and the ping |
| `DECISIONS-2026-08-23-to-2026-08-24.md` | the whole watch party, the profile, and several sessions per account |
| `DECISIONS-2026-08-24-to-2026-08-27.md` | the audio nobody could hear, the notification levels, and the heartbeat |
| `DECISIONS-2026-08-28-to-2026-08-31.md` | the walk, the profile becoming a screen, and a token ceasing to be a device |
| `DECISIONS-2026-08-31-to-2026-08-31.md` | fourteen entries written on one day, from the two halves of the channel screen to the profile naming a room |
| `DECISIONS-2026-08-31-to-2026-09-04.md` | the iPad's two panes, the web app as a versioned client, and the address that names a place |
| `DECISIONS-2026-09-04-to-2026-09-06.md` | Android push built inert, the whole of the audio-session consolidation, and usernames |
