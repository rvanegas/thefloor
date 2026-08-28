# The hands-free-only walk

**Temporary.** This is the device check for the second audio-session rule added
on 2026-08-27, which lives behind the **Headphones → Keep the connection
steady** setting. Delete it once the walk has been done; what it establishes
belongs in decisions/DECISIONS.md § *Hands-free only, because fidelity had
exactly one real claimant*, which is already written and already says the walk
is outstanding.

**Turn the setting on before step 1.** Settings → Headphones → *Keep the
connection steady* → On. Off is the default and is what every build before this
one did, so a phone that has never been in Settings is walking the old rule and
every step below will disagree with it. The setting is persisted per phone, so
it survives a relaunch and has to be turned off deliberately.

**Because it is a setting, this walk is no longer a merge gate.** The default
is unchanged, so nothing here has to pass before the work lands — what the walk
decides is what to recommend, and whether the setting deserves to stay.

It exists because this subsystem has a documented habit of being reasoned from
source, shipped, and written up as fixed before anybody listened — STATES.md
disagreement 5 is an entry that says exactly that about itself. The suite being
green is evidence about the reducer. It is no evidence at all about a Bluetooth
profile.

## Organised by how many people it takes, which is the scarce thing

Restructured 2026-08-28. The steps and their numbers are unchanged — this is
the same walk in a different order, so a reference to "step 23" still means what
it meant. What changed is that they are now grouped by **what has to be
arranged** rather than by what they are about, because the constraint on
actually doing this is not the reading, it is getting two other people and a
headset into the same half hour.

- **Part One** needs one account and one phone. It is **seventeen of the
  thirty-six steps**, and it contains the single most diagnostic step in the
  whole document — step 30a, where the two rules agree, which is exactly what
  makes it a measurement rather than a comparison. Do this part first and do it
  alone; if it fails there is no point arranging anything.
- **Part Two** needs a second account present. Most of it works with a second
  phone on the table in front of you, and the steps that need a second *person*
  — somebody who speaks when a conversation would have them speak — are marked
  **†**. Those are the ones the whole change is about, and they cannot be
  faked.
- **Part Three** needs two other people. It is short, and it is not an
  afterthought: **the trade this setting makes is sharpest in a two-person
  channel and nearly vanishes in a three-person one**, for a reason that is
  visible in `anyMicrophoneOpen` and is invisible from any two-person sitting.
  A verdict reached on Part Two alone is a verdict about the smallest room this
  app has.

---

## What you need

**For Part One:**

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

**For Part Two, additionally:** a second account, on a second device — the demo
pair from DEMO-ACCOUNT.md will do. For the **†** steps, a person to hold it.

**For Part Three, additionally:** a third account and a second person.

## How to read a step

Every step names what the panel should say and what you should *hear*. The two
are different instruments and the point is to use both:

- **`steady headset`** — which of the two rules produced everything else in the
  dump. Added 2026-08-28 to the panel, to the copied text's first line, and to
  the event log as a `steady headset on|off` line written at launch and at every
  flip. **Read it before reading anything else**, because two pastes of the same
  step under the two settings are otherwise identical in their provenance, and
  a pair of readings that cannot be told apart is not a pair.
- **`asked`** — what the app requested. `IDLE` or `CALL`; there is no third
  value any more.
- **`actual`** — what `AVAudioSession` reports. A difference here is the shape
  every bug in this subsystem has taken.
- **`self/needed/audio`** — the three flags. Only the third decides the
  session now, and **it is the answer to a different question under each rule**
  — *is anybody present capturing* under the default, *does this app have any
  audio at all* under the setting. `F` does not mean the same thing in the two
  halves of a pair.
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

**Copy the panel at every step you intend to compare**, not at the end. The log
is two hundred lines and a walk is longer than that.

---

# Part One — one account, one phone

Nothing here needs another person, and two of these sections are pairs: the
same step run twice under the two settings, back to back, on one headset. **A
pair is only a pair where the *stimulus* means the same thing under both
rules** — where the two rules disagree about what *should* happen, you are
comparing two designs rather than testing one, and that is Part Two's job.

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

## D. Shared playback — the one most likely to fail, and a pair

The build 89/90 fault was shared audio played to somebody **alone** in a
channel being inaudible, and the suspicion was a category write landing on the
engine's start. This rule moves that write earlier, to the load. Whether that
was the mechanism is what these steps settle.

**Run all five twice, off then on** — added 2026-08-28, and the original draft
of this walk missed that they were a pair at all. Alone with a track loaded,
`anyMicrophoneOpen` is false (nobody present is capturing) so the **default**
asks `IDLE`, while `channelHasAudio` asks `CALL` at the load. That is the
sharpest discriminator in the document and it costs one person one sitting.
**Audible under `on` and not under `off`** says the category-write timing was
the mechanism. Audible under both, or dead under both, exonerates it and puts
the engine start back in the frame.

10. **Alone in a channel, music playing in the other app. Load a track — do not
    play it.** Route drops to mono **at the load**. Other app stops. `asked`
    `CALL`. — *If this does not happen at the load, `setTrack` is not leaving
    the status `paused` and the whole timing argument is wrong.* Under the
    default the route does **not** move here, which is the point of the pair
    and not a failure.
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

## E. The watch party

A party can be started alone — `canStartWatch` asks only that you are in the
room and no recording is running — so this section needs nobody.

16. **Start a party and play the video.** Every microphone closes, `asked`
    `IDLE`, route **blooms to stereo**, and the player's audio comes through
    it. — *The film is another app, and this is the same rule as step 2 seen
    from a different direction.*
17. **Pause the party.** `asked` `CALL`, route drops to mono, talking works.
    Alone, this is the setting's answer and not the default's: pause a party
    alone with the setting **off** and the route stays stereo, both rules being
    right about their own question.
18. **Resume.** Back to `IDLE` and stereo.
27. **Load a track while a watch party is playing.** The party ends, the track
    is loaded paused, and the session goes `IDLE → CALL`. — *`SET_TRACK` calls
    `stopParty` and starting a party clears the track: they are mutually
    exclusive by construction. Worth one crossing to confirm the withhold being
    asked *first* in `channelHasAudio` does not strand the session in `IDLE`
    when the thing it was withholding for has gone.*

## F. Cases that are cheap to check while you are there

20. **Alone, start a recording.** `asked` `CALL`. Stop it: `asked` `IDLE`. —
    *The one case that captures with nobody there, and the reason
    `microphoneNeeded` is a function with a test rather than a condition
    inline. Both rules agree here.*
21. **On a mic-less Bluetooth speaker, cross the boundary in either
    direction** — alone, using step 20's recording or step 10's loaded track to
    make the crossing. The speaker is **evicted to the phone's loudspeaker**
    while `CALL` holds, and comes back after. Not subtle, and correct — an
    ineligible output under `playAndRecord` is the 2026-08-21 fix working.
22. **Background past a minute so presence drops, then foreground.** The room
    rebuilds. `asked` and `actual` agree afterwards. — *A minute since
    2026-08-27, not a hundred seconds; the sweep stopped waiting out a close
    frame.*

## G. The measurement that needs nobody at all

30a. **TASKS.md § "The Foreground Interruption", the alone-in-a-channel
    variant.** Alone in a channel, background the app, start another app's
    audio, foreground this one. Read `asked` and `actual` at the instant the
    log stamps `app active`. — ***The most diagnostic single step in this
    document, and it is in Part One because the two rules agree here***: alone
    and quiet, `anyMicrophoneOpen` and `channelHasAudio` are both false and
    both ask `IDLE`. So the setting is a *control* rather than a variable, and
    an interruption that happens under both settings cannot be the predicate.
    That indicts the other two candidates — the observer being handed
    `recording: CALL` unconditionally, or the activation itself — and closes
    STATES.md disagreement 11 in the direction the entry does not expect.
    `actual` reading `playAndRecord` against an `asked` of `IDLE` settles it
    outright; *when* the two part says which candidate. **Note whether the
    connection actually dropped while backgrounded**, since that is what
    separates a rebuild from a resume.

    Run it under both settings anyway. Not for the comparison — there is none —
    but because a step where the two rules provably agree and the phone does
    not is a finding about something else entirely.

---

# Part Two — with one other person

A second phone on the table covers most of this. The **†** steps need a person,
because what is being measured is a word arriving when a conversation would
have it arrive, and you cannot produce that by pressing a button on a device
you are holding.

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
8. **† One of you unmutes and speaks immediately.** The **first syllable is
   heard**, uncut. — *This is what the previous step buys, and it is the whole
   argument for it. Under the old rule this word landed inside an HFP handover.*
9. **† Self-mute while the other person is talking.** They stay audible, the
   route does not move, nothing clicks. — *Regression guard for the 2026-08-19
   route loss. It is fixed here by a different argument than the one that fixed
   it before, so it is worth re-checking rather than assuming — and worth
   running under **both** settings for the same reason.*
15. **† Both present, with a track playing, one of you talks over it.** The
    track's quality does not change. — *That invariance is the argument this
    whole change was made on; it is worth hearing once.*

## G. The edges the first draft of this walk missed

Found by reading the diff back against the walk rather than by walking it. Each
of these is a code path this change actually moved, and none of the steps above
crosses it.

19. **A guest who has not been given the microphone, with a member present.**
    `asked` `CALL`. They hear everything, and another app cannot play over it.
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
    still there.* **Not a pair**: with the other person unmuted both predicates
    are true at connect, so both rules should log `connect capturing CALL`. Run
    it with the setting **on**, that being the harsher version of the same test.
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

## H. The comparison, which is what the setting is actually for

Nothing above compares the two rules on a stimulus that means the same under
both. These do, and they are the reason a setting beats a branch — one phone,
one headset, one sitting, both answers. Run them last, when your ear is
calibrated.

28. **In a channel with somebody else, both of you self-muted, flip the setting
    off and then on again.** Off, the route blooms to stereo and the other app
    comes back; on, it drops to mono and the other app stops. The log should
    show a `steady headset` line at each flip with the session write beside it.
    — *The row the whole thing is about, heard in both directions under your own
    thumb. If this does nothing, the setting is not reaching `App.tsx` and every
    other step in this walk is measuring the same rule twice.*
29. **† From that state, with the setting off, have the other person unmute and
    speak immediately. Then turn it on and repeat.** — *The direct comparison:
    the first word crosses a profile handover in one case and not the other.
    Whether that is audible enough to be worth the mono link is the judgement
    this whole change waits on, and it cannot be reasoned to.*
30b. **The Foreground Interruption, everybody-muted variant, twice — off, then
    on.** — *Not a fair pair, and it is here as a **positive control** for step
    30a rather than as evidence in itself. Under the setting the interruption is
    intended behaviour, so what this establishes is that the panel shows you an
    interruption you predicted, which calibrates the reading before you take the
    one that counts. Read 30a as the honest measurement, since it means the same
    thing under both rules.*
31. **Sit in a channel for an afternoon with the setting on.** Battery, and
    whether a mono link for hours is something you stop noticing or something
    you resent. — *Not a step so much as the thing the other thirty-five cannot
    tell you, and the reason not to decide this on one sitting.* **It needs
    somebody in the channel with you**, which is easy to get wrong: alone and
    quiet, the setting asks `IDLE` and there is no mono link to resent, so a
    solo afternoon measures nothing. A loaded paused track is a solo
    approximation of it and is not the same thing.

---

# Part Three — with two other people

Short, and not an afterthought. **`anyMicrophoneOpen` is a claim about the whole
room**, so the default rule hands the stereo route back only when the *last*
open microphone closes — and the chance of every microphone in a room being shut
at once falls sharply as the room grows. In a two-person channel one person
muting is half the room; in a three-person channel it is a third, and the state
step 7 is about becomes rare. **So the trade this setting makes is at its
sharpest in the smallest room this app has**, and a verdict reached entirely on
Part Two is a verdict about that room and no other. These steps are what say
whether the setting is worth recommending to somebody whose channels have three
people in them.

Added 2026-08-28. Numbered from 32 so that 1–31 keep their meanings.

32. **All three present and talking. One self-mutes, then a second.** Under the
    **default**, the route should **not move** at either mute — somebody's
    microphone is still open — and should bloom to stereo only when the third
    one closes. Under the **setting** it never moves at all. — *The room-size
    effect, and the only step that shows it. If the route moves on the first
    mute, `anyMicrophoneOpen` is being evaluated against something other than
    the room — the roster, or your own microphone — and that is the 2026-08-19
    regression returning by a new route.*
33. **† All three self-muted; one unmutes and speaks immediately, under each
    setting in turn.** The step 29 comparison, in the room where it is rarest.
    — *If the first syllable survives here under the default, the trade the
    setting offers is one that a three-person channel rarely has to make, and
    the recommendation should say so rather than being stated flat.*
34. **† Two of them talk; one claims the floor and silences the other. You
    listen, having claimed nothing.** Your route should **not move**, under
    either rule. — *A silenced person is still present and their publication is
    still open — the floor withholds *subscriptions* rather than muting the
    publication, which is decisions/DECISIONS.md's oldest surprise in this area
    — so both predicates stay true throughout and neither should cross the
    boundary. A crossing here means the session is reading the subscription
    count again, which it has not been allowed to do since 2026-08-27. This is
    the only case a two-person channel cannot produce: a claim needs two in the
    room, so hearing one as a bystander needs three.*
35. **A guest without the microphone, while two members hold a conversation.**
    The fuller form of step 19: `asked` `CALL` for the guest, another app cannot
    play over it, and nothing the two members do to their own microphones moves
    the guest's route. — *`anyMicrophoneOpen` counts guests as occupants
    deliberately; this is the reverse reading, that a guest's own session
    follows a room they cannot speak into.*

---

## What would falsify this

- **`actual` disagreeing with `asked` at any step**, and especially at a
  foreground or a rebuild. That is the shape of every bug this subsystem has
  had, and it means a second writer won a race. `idevicesyslog` names which.
- **Step 11 failing under both settings.** The category write was not the
  mechanism, the engine start is the suspect again, and the change should be
  judged on its other merits rather than as a fix.
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
- **Step 30a interrupting under both settings.** Not a falsification of this
  change at all — it clears the predicate entirely and moves TASKS.md § *The
  Foreground Interruption* onto the observer or the activation. Recorded here
  because it is the outcome most likely to be misread as this change failing.
- **Step 32's route moving on the first of three mutes.** The default rule is
  not asking about the room, and everything Part Two concluded about it was
  measured on a rule that does not exist.

## What this walk cannot tell you

Whether the trade is worth it for anybody but you. Step 31 is one person's
afternoon on one headset, and the reason this shipped as a setting rather than
a decision is precisely that the answer is not expected to be the same for
everybody. A walk that comes out clean argues for recommending it, not for
making it the default — and a walk that comes out badly on your hardware is not
by itself an argument for removing an option somebody else may want.

Part Three is the closest this gets to escaping that, and it does not escape
it: it says the trade is smaller in a larger room, which is a fact about the
rule rather than about a person. It does not say whose room.

What *would* argue for removing it: nobody turning it on, or it turning out to
have a failure mode rather than a cost. Those are the two things worth watching
for after this is in people's hands, and neither is visible from here.
