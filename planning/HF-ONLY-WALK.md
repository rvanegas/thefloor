# The hands-free-only walk

**Temporary.** This is the device check for the 2026-08-27 audio session rule
on branch `worktree-hf-only`. Delete it when the branch merges and the walk has
been done; what it establishes belongs in decisions/DECISIONS.md § *Hands-free
only, because fidelity had exactly one real claimant*, which is already
written and already says the walk is outstanding.

It exists because this subsystem has a documented habit of being reasoned from
source, shipped, and written up as fixed before anybody listened — STATES.md
disagreement 5 is an entry that says exactly that about itself. The suite being
green is evidence about the reducer. It is no evidence at all about a Bluetooth
profile.

## What you need

- **Two accounts**, on two devices, or the demo pair from DEMO-ACCOUNT.md.
- **A Bluetooth headset that can do HFP** — AirPods are the reference device
  here, having been the one the build 72 check was done on. **And ideally a
  Bluetooth speaker with no microphone**, which is a different case and the one
  that surprised somebody on 2026-08-21.
- **Another app making sound**: a podcast or music app, playing over the same
  Bluetooth route.
- **`accounts.debug` set** on the account you are watching, so
  `AudioDebugPanel` renders. It is the asked-versus-actual comparison and it is
  the whole instrument.
- **A USB cable and `idevicesyslog -m "Native auto-config"`** if anything
  disagrees. That is the native observer's own voice, and it is the second
  writer — a network pairing is not enough, and `log stream` reads this Mac
  rather than the phone.

## How to read a step

Every step names what the panel should say and what you should *hear*. The two
are different instruments and the point is to use both:

- **`asked`** — what the app requested. `IDLE` or `CALL`; there is no third
  value any more.
- **`actual`** — what `AVAudioSession` reports. A difference here is the shape
  every bug in this subsystem has taken.
- **`self/needed/audio`** — the three flags. Only the third decides the
  session now.
- **`audible`** — the subscribed track count. **It decides nothing since this
  change**, and that is deliberate; it is here to tell a lost subscription from
  a dead engine.
- **The event log** — the ring the panel prints below the rows, and the only
  instrument that shows *ordering*. `connect <intent> <config>` is the
  configuration a connection was given before the session was taken;
  `<intent> <config>` on its own is a later write; `sub + <id> (n)` is a
  subscription; `room connected, N audio already published` is the variable the
  playback investigation turns on. Steps 23 and 25 are read here and nowhere
  else.
- **The route** — mono or stereo is audible without any instrument, and on a
  mic-less speaker the boundary is a *route eviction* to the phone's own
  loudspeaker rather than a profile change.

---

## A. The one thing this configuration is still for

`IDLE` exists for another app and nothing else now. If any of these four
regress, the change is wrong regardless of how the rest goes.

1. **Music playing, not in a channel.** Stereo, playing. The baseline.
2. **Enter a channel, alone.** Music **keeps playing**, route **stays stereo**.
   `asked` `IDLE`, `self/needed/audio` ends in `-`.
3. **Background the app, wait ten seconds, foreground it.** Music still
   playing. — *This is the surviving half of TASKS.md § "The Foreground
   Interruption". The everybody-muted half of that recipe is now `CALL` by
   design and is no longer a fault; this half is unchanged and still open.*
4. **Leave the channel.** Nothing moves.

## B. The arrival boundary

5. **Alone in a channel with music playing; the second account enters.** Music
   stops. Route drops to mono, audibly. `asked` `CALL`. Both of you can hear
   each other.
6. **The second account steps out.** Route blooms back to stereo. `asked`
   `IDLE`. Music is resumable, and may resume itself depending on the app.

## C. The row that changed

7. **Both present, both self-muted.** Route **stays mono**, `asked` **stays
   `CALL`**, no handover is heard, the other app stays interrupted. — *Under
   the old rule this bloomed to stereo and let the music back in. This step is
   the change.*
8. **One of you unmutes and speaks immediately.** The **first syllable is
   heard**, uncut. — *This is what the previous step buys, and it is the whole
   argument for it. Under the old rule this word landed inside an HFP handover.*
9. **Self-mute while the other person is talking.** They stay audible, the
   route does not move, nothing clicks. — *Regression guard for the 2026-08-19
   route loss. It is fixed here by a different argument than the one that fixed
   it before, so it is worth re-checking rather than assuming.*

## D. Shared playback — the one most likely to fail

The build 89/90 fault was shared audio played to somebody **alone** in a
channel being inaudible, and the suspicion was a category write landing on the
engine's start. This rule moves that write earlier, to the load. Whether that
was the mechanism is what these steps settle.

10. **Alone in a channel, music playing in the other app. Load a track — do not
    play it.** Route drops to mono **at the load**. Other app stops. `asked`
    `CALL`. — *If this does not happen at the load, `setTrack` is not leaving
    the status `paused` and the whole timing argument is wrong.*
11. **Play it.** Audible **from the first sample**, and it stays audible. —
    *The main event. A track that plays for a fraction of a second and stops,
    or never sounds at all, is the old fault surviving, and it exonerates the
    category write.*
12. **Pause it.** Stays `CALL`, stays mono. Other app does not come back.
13. **Clear the track.** `asked` `IDLE`, route blooms to stereo, other app is
    free again.
14. **With a track loaded, leave the channel and come back.** Still audible. —
    *The "already published when we arrive" case, which is the variable
    `useSessionAudio`'s connect path calls the investigation's own. Everything
    that failed had the media participant already in the room.*
15. **Both present, with a track playing, one of you talks over it.** The
    track's quality does not change. — *That invariance is the argument this
    whole change was made on; it is worth hearing once.*

## E. The watch party

16. **Start a party and play the video.** Every microphone closes, `asked`
    `IDLE`, route **blooms to stereo**, and the player's audio comes through
    it. — *The film is another app, and this is the same rule as step 2 seen
    from a different direction.*
17. **Pause the party.** `asked` `CALL`, route drops to mono, talking works.
18. **Resume.** Back to `IDLE` and stereo.

## F. Cases that are cheap to check while you are there

19. **A guest who has not been given the microphone, with members present.**
    `asked` `CALL`. They hear everything, and another app cannot play over it.
20. **Alone, start a recording.** `asked` `CALL`. Stop it: `asked` `IDLE`.
21. **On a mic-less Bluetooth speaker, cross the boundary in either
    direction.** The speaker is **evicted to the phone's loudspeaker** while
    `CALL` holds, and comes back after. Not subtle, and correct — an ineligible
    output under `playAndRecord` is the 2026-08-21 fix working.
22. **Background past a minute so presence drops, then foreground.** The room
    rebuilds. `asked` and `actual` agree afterwards.

## G. The edges the first draft of this walk missed

Found by reading the diff back against the walk rather than by walking it. Each
of these is a code path this change actually moved, and none of the steps above
crosses it.

23. **Enter a channel that somebody is *already* in** — as against step 5, where
    they arrive after you. Read the **event log**, not the panel: the first line
    should be `connect capturing CALL`, and there should be **no second session
    write** after it. — *This is the case the whole timing argument is for. The
    old rule read the audible count, which is zero at connect by construction,
    so it took `IDLE` at this line and rewrote to `CALL` when the track
    subscribed — which is the instant the engine starts. `channelHasAudio` is
    already true here because the room is not empty, so the configuration this
    connection needs is the one it is given, before anything is active. A
    `connect ... IDLE` line followed by a `capturing CALL` line means the ref
    was read before the snapshot showed the occupants, and the collision is
    still there.*
24. **Leave a channel yourself while the other person is still talking.** Route
    returns to stereo, the other app is free, and nothing is left holding the
    session. — *The teardown stops the session and re-arms the observer with
    `IDLE` (`pushPolicy(false)`). Leaving `CALL` behind is what the code calls
    the live hazard: an observer armed with `playAndRecord` would take the
    route at some later transition with no channel to justify it. Steps 6 and
    13 both reach `IDLE` while connected; this is the only step that reaches it
    by disconnecting.*
25. **With a second person present, watch the panel's `audible` count move off
    zero as their track subscribes.** — *`hasAudio` was already true before
    they published — they were in the room — so the session does not move and
    the effect takes its early-return path. That path refreshing `asked` is now
    the **only** way the panel learns a subscription happened. It was added on
    2026-08-24 after a frozen zero cost a wrong diagnosis, and this change puts
    more weight on it, not less: a lost subscription and a dead engine are
    still told apart here and nowhere else.*
26. **Alone with a track loaded, have somebody arrive, then have them leave
    again.** Both terms are true in the middle and one is true either side, so
    **no handover should be heard at all** — the route stays mono throughout.
    — *The two-term interaction. A crossing here means the rule is being
    evaluated as something other than an `or`.*
27. **Load a track while a watch party is playing.** The party ends, the track
    is loaded paused, and the session goes `IDLE → CALL`. — *`SET_TRACK` calls
    `stopParty` and starting a party clears the track: they are mutually
    exclusive by construction. Worth one crossing to confirm the withhold being
    asked *first* in `channelHasAudio` does not strand the session in `IDLE`
    when the thing it was withholding for has gone.*

---

## What would falsify this

- **`actual` disagreeing with `asked` at any step**, and especially at a
  foreground or a rebuild. That is the shape of every bug this subsystem has
  had, and it means a second writer won a race. `idevicesyslog` names which.
- **Step 11 failing.** The category write was not the mechanism, the engine
  start is the suspect again, and the change should be judged on its other
  merits rather than as a fix.
- **Step 8's first syllable still being clipped.** Then the handover was not
  what cost it and step 7's trade bought nothing.
- **Step 2 or step 16 regressing.** `IDLE` has one job left and it is not doing
  it. That is disqualifying, not a trade.
- **Step 23 logging `connect ... IDLE`.** The write still races the engine's
  start on the path that matters most, and the timing argument this change
  rests on is wrong even if every audible step passes.
- **Step 26 producing an audible crossing.** The predicate is not behaving as
  the disjunction it is written as, which would mean something is re-deriving
  it rather than calling it.

## What this walk cannot tell you

Battery, and how a channel held for hours on a mono link feels to somebody who
did not choose it. That is the cost this change accepts on purpose, and it is
not measurable in an afternoon — it wants a day of ordinary use, which is the
other reason not to merge this on a green suite alone.
