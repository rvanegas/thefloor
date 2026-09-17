# A recording somebody started says so out loud

A fourth chime, three notes rising, on every present device at the moment a
hand-started run begins. `backlog/two-party-consent-has-not-been-reviewed.md`
is what asked for it, and it is worth being exact about what it does and does
not do to that question.

**The notice was visual and therefore reached whoever was looking.** A red dot
and the word *Recording* in the channel view, which is a real notice to
somebody holding their phone and no notice at all to somebody who walked back
to Home — and walking back to Home leaves you in the conversation, which is the
point of the product. The entry's *What exists today* listed the dot first. The
gap was not that the app said nothing; it was that it said it in the one
modality a conversation is not being conducted in.

**Local, not published into the media room**, on the reasoning
`2026-09-14-the-room-says-who-came-and-went.md` settled for the presence
chimes: publishing it into LiveKit would need the media participant open at
moments it is not, and would land the cue in the stem and therefore in the
transcript. Each device makes its own sound. The cost of that is real and
should be said — the chime is **not** in the recording, so the artifact carries
no evidence that notice was given. Putting it there is a separate change in
`server/src/export.ts` and was considered and not done: it is a different thing
(a marker in a file) answering a different question (what can be shown later),
and nobody in the room hears it.

**Everybody present hears it, the starter included.** This is the one place it
breaks the rule the presence chimes are built on — you never hear yourself —
and the break is deliberate. There, the sound is information, and telling you
what you just did is noise. Here the sound *is* the notice: the event being
recorded is that both parties were told, in the same way, at the same moment,
and a notice one party is exempt from is a weaker thing to have given. Nothing
is saved by sparing the starter 270ms they were expecting.

**Only runs started by hand, which was the instruction and is the
uncomfortable half.** `autoRecord` starts a run with nobody pressing anything,
and those are silent. The defensible reading is that a chime marks a decision
somebody made and there is no such moment in an automatic start; the reading
that should be put in front of whoever reviews the consent question is that the
runs with no audible notice are precisely the ones no human initiated. That is
scope, not an oversight, and it is written down here so that the next person to
open the backlog entry finds it rather than rediscovers it.

**It answers nothing legal.** Notice is not consent in several US states, which
is the whole of what the backlog entry says and it still says it. What changed
is that the notice now reaches an ear. The entry stays open.

## How it is built

`RecordingState.automatic` carries how the run began. Both starts commit the
same `START_RECORDING`, so the distinction had to reach the snapshot — the
devices that need to decide are not the one that acted. The server's
`autoRecord` latch in `server/src/channels.ts` is the only thing that sets it;
the wire form of the action has no such field, so a client cannot claim a run
was automatic and silence the chime on somebody else's phone.

`useRecordingChime` is the schedule, mounted in `App.tsx` beside
`usePresenceChime` and above the channel screen for the same reason — the
person the dot never reached is the person not looking at the channel. It keys
on the **run id**, not the status, which is what makes pause and resume silent:
a resumed run is the same run. A run already going when you arrive is taken as
read, as an arrival into an occupied room is.

The sound is `"recording"` in `chimeNotes` in `AudioRouteModule.swift`, mirrored
row for row in `chime.web.ts`. **Three notes where every other kind is one or
two**, deliberately: the presence chimes are a closed vocabulary about who is in
the room, and a fourth two-note pair would have been heard as a fifth member of
it. A phone whose native half predates this build plays nothing at all —
`chimeNotes` returns false for a kind it does not know, which is the behaviour
that module already chose on the grounds that a chime nobody recognises is
worse than silence. So an old install keeps exactly today's notice rather than
acquiring a wrong sound, and no shim is owed.
