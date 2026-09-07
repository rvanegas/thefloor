# Labs, which hides two features rather than rearranging one — 2026-09-06

TASKS.md § *Labs Setting*, whole: a fifth account setting, cleared by default,
which makes the experimental features visible and enabled. Transcripts and the
watch party are the two.

**It reads the other way round from every setting beside it, and that is the
whole design.** Appearance, the tap and the control cards change how something
already yours behaves, and each defaults to what the app did before it existed.
This one decides whether something *exists* for you, and its default is off —
which means that on the day it shipped it took two features off everybody's
screen, including from the people who had been using them. That is not a
regression to be softened: an experimental feature that arrives without being
asked for has shipped, whatever the code calls it.

### Both ends, and the two ends withhold differently

The app cannot be the only enforcement, because a transcript spends money at
AssemblyAI per use and a party puts a video in front of everybody in the room.
So the server refuses the two acts that *begin* one of these — `POST
/recordings/:id/transcript` answers 403, and `START_WATCH` is refused in
`Channels.dispatch` beside the YouTube-link parse that was already there.

What each end hides is decided by where the state lives, and the two cases came
out differently:

- **A transcript is viewer-relative already.** `transcriptViewOf` builds the
  `transcript` field per reader, and the app has withheld the whole button
  since transcripts shipped when that field is absent — which is how a server
  with no AssemblyAI key says it cannot do this at all. Labs reuses that
  absence exactly: no client change was needed for transcripts, and a client
  built before Labs existed hides them too.
- **A party is channel state.** It arrives on every snapshot whether the reader
  asked for the feature or not, so the app has to decide, and `ChannelView`
  draws the section on `app.labs || party`.

That `|| party` is not a hole in the gate. Somebody who never asked for watch
parties can be sitting in a channel where one is running: their own player is
being driven by it, and the recording controls are refusing them *because* of
it. Hiding the card would leave them with an unexplained refusal and no way to
stop what is causing it — so they get the card, the transport and Stop, and
what Labs decides is whether they can begin one. The server enforces exactly
that line: `START_WATCH` is gated, and `STOP_WATCH`, `WATCH_PLAY`,
`WATCH_PAUSE` and `WATCH_SEEK` are not.

### What was not built

**No per-feature switches.** One toggle for both, on the argument that the
list will keep changing and a screen of five switches is a screen nobody
reads. If a feature graduates it leaves the list; if the list grows past what
one sentence can name, that is the moment to reconsider, not before.

**Reading a transcript is behind the gate too**, which breaks the rule
transcripts shipped with — "reading is never limited, what goes is the ability
to spend". It is the price of reusing the field's absence, and the case it
costs is narrow: a member with Labs on makes a transcript, and a member with it
off cannot read it. The remedy is the switch, which is two taps away and
explains itself. The alternative was a field present for reading and absent for
spending, which is two states the app has no way to tell apart today.

**Nothing was migrated.** The column is null for every account, which reads as
off — so everybody who was using either feature has to ask for it again. There
are few enough of those people to count on one hand, and turning it on is the
only way anybody learns the switch exists.

2,062 lines with this entry in it, so it closed the volume it was written into
and opened this one. Decided at the landing rather than when the entry was
written, which is the rule that stops two branches producing the same closed
volume from different trees — master had not rolled over first, so this one is
ours.
