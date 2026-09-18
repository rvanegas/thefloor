# The watch party has been walked once, and the rest of the walk is outstanding

**Partly done as of 2026-08-23**, and the heading here used to read "Nobody has
watched anything", which stopped being true the first time somebody did. The
verdict was *mostly works*, and the one thing it found is recorded in
decisions/ § *A watch party leaks into the channel through the
microphone* — not a defect but a property of the design, now said in the
interface rather than fixed, because no code can fix it.

What the first pass did **not** cover, and what is still outstanding: steps 2
through 6 below, and in particular step 1's ten minutes. Drift over time is the
thing `WATCH_DRIFT_MS` was chosen to buy and the only one a clock and a pair of
eyes can check. The reasoning for the feature is decisions/ § *The
Floor carries no video, and that is the whole watch party*. Two phones in one
channel, a desktop browser open on each:

1. Paste a link, Start, Play. Both browsers should be within a second or two of
   each other, and **stay there for ten minutes without a visible correction** —
   which is the one thing `WATCH_DRIFT_MS` was chosen to buy and the one thing
   only a clock and a pair of eyes can check.
2. Seek from one phone; both browsers jump.
3. Claim the floor from one phone; the other phone's transport greys out and
   **the video keeps playing** — a claim confers control, it does not pause.
4. Record is greyed with its reason. Load an audio file: the party ends and the
   shared audio takes over.
5. Both step out; the party pauses. Step back in; it is still paused, where it
   was.
6. Restart the server; the party comes back paused at its position and both
   pages reconnect on their own.

7. **Paste a second link while the pages are open.** They should swap to it
   *stopped*, showing its title and staying that way until somebody presses
   Play. A burst of the new video before it settles means `cueVideoById` is
   not doing what its contract says, and the fix would be to hold the swap
   until the transport asks for it.
8. Copy the link from a follower page and check it is the URL as pasted. Then
   click the video itself: it may pause locally, and `follow()` should undo
   that within half a second — nothing should reach the other screens.
9. **Let a video run to its end.** It should stop there and say Finished, on
   every screen, and stay stopped. Then press Play: it should start again from
   the beginning on all of them. The failure this replaces was the first second
   stuttering endlessly, and the failure the fix risks is the opposite — a
   screen stuck on Finished that will not replay.

**Three steps arrived on 2026-09-17, when the player moved into the app** —
decisions/2026-09-17-the-screen-is-the-app.md. Everything above was written for
a follower page on a laptop, which no longer exists; read *both browsers* as
*both screens*, wherever each person has chosen to put theirs.

10. **A film on one device.** Watch here, on the phone you are in the room on.
    The room should go quiet as it starts and stay quiet — *Unmute the room*
    greyed with its reason — and your own microphone should close: a Bluetooth
    headset blooming from mono to stereo is the audible proof, and it is the
    whole point of the exception. Pause: the voice comes back, and so does
    mono. **Do this a dozen times.** The handover at each pause is the one
    thing the design left unsettled, and whether it is tolerable is a question
    only an evening can answer.
11. **A film on two devices, one account.** Watch on another device from the
    phone, with the web app signed in on a laptop. The laptop should start
    showing it without stepping in — nothing about presence changes, the phone
    is not displaced, and the roster gains no second entry — and the room
    should stay unmutable, because nobody's screen and voice are one device.
12. **Switching mid-film.** With the room unmuted and a film running on the
    laptop, tap *Watch here* on the phone. **Nothing should happen until the
    next pause**: no voice is cut, and the room is still audible. Pause and
    play again, and the room goes quiet. That is the sampling, and getting it
    wrong is a conversation cut off mid-sentence.

**Unmute the room before doing any of this**, which is now a deliberate act:
parties start muted, so a walk done on the defaults will be a walk with every
microphone shut and no drift audible at all. Then use headphones, or the
microphone bleed above dominates everything and you will be listening to that
rather than to what you came for. **And do it muted at least once too** — the
mute lifting on pause and returning on resume is the behaviour most likely to
feel wrong in use, and no test can tell you how it feels.

**Steps 7 and 8 are unverified by anything.** The swap-in behaviour rests on
YouTube's documented distinction between `cueVideoById` and `loadVideoById`,
read rather than observed, and `getVideoData` — which supplies the title — is
not in YouTube's published method list at all, though it has been stable for
years and is what every player on the web uses for this. Both are guarded so
that failure is a blank line rather than a broken page, and both want one look
at a real player.

Two things are known-unknown rather than untested, and are worth watching for
during the walk. **Nobody has seen what a video whose embedding is disabled
does** — the page says "That video will not play here" and the channel does not
learn it, so the transport goes on saying playing while one screen shows an
error; whether that is tolerable or wants a `WATCH_FAILED` from the page is a
decision to make after seeing it. And **the gate is per page**: a follower who
has not tapped yet is a screen the transport believes is watching, which is
correct and may still read as a bug to whoever is looking at it.
