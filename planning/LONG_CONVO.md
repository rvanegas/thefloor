# Tasks from the long conversation with Todd

Everything the call between Todd and Rodrigo, transcribed 2026-10-07
(`~/Documents/maiden.txt`), asks for, exported from `planning/task/`. Each
section below is the full text of one task file. Those files are the
copies to edit; this export is a snapshot as of commit `35008c38`.

**New from this call:**

- answer-a-ping-with-when-you-can-come.md
- tell-the-absent-what-the-first-one-in-is-saying.md
- catch-up-when-stepping-into-a-conversation-under-way.md
- show-that-you-are-being-recorded-away-from-the-channel-view.md
- the-channel-is-one-long-conversation.md
- a-playlist-of-the-best-lines-in-their-own-voices.md
- run-a-cheap-transcriber-beside-assemblyai-and-compare.md
- free-to-talk-paid-to-transcribe-and-digest.md
- recommend-contacts-from-what-channels-talk-about.md

**Already filed, and taken further by this call:**

- a-digest-of-each-call-and-of-the-channel.md: the prompt's context and the running preamble
- add-voice-messages.md: the hold-to-record design, then doubt that it should exist
- transcribe-automatically-in-chosen-channels.md: who pays
- transcribe-as-the-conversation-happens.md: raised again as the precondition for catching up mid-call

**Related, but the call added nothing to them:** keep-the-transcript-and-let-the-audio-go.md,
settle-whether-ping-is-enough-on-its-own.md, improve-transcripts-ui.md,
introduce-radiate.md, payments-upgrade.md.

**Raised and not filed:** a timeline or "constellation" visualisation of who
said what (Rodrigo: "we'll see"); the names *Porchlight* and *scribe on the
wall*; integration with tools for thinking alone.

---

## Answer a ping with when you can come

Todd, on the call with Rodrigo transcribed 2026-10-07. He was pinged while
recording something of his own, *"in the flow"*, and had no way of saying so
without leaving it. To the people waiting, his silence could have meant
anything: busy, didn't see it, gone. He wanted **a reply to a ping that costs
one tap**, with three kinds of answer that are not the same: *in the flow,
don't know when*; *a few minutes*; and *free at a known time*, say twenty
minutes from now. Whoever is there can then decide to wait or to come back.
Several such answers together become, in his words, *"a loose negotiation …
of a time multiple people might be around"*. That is the path from
asynchronous to synchronous, which he called *"a big part of the experience
of the app"*.

Rodrigo agreed that this is the problem. Today the ping is *"very rigidly tied
to push notifications and a 15-minute time limit and nothing more"*. A ping
already carries words and leaves them on the profile card while the window is
open (GLOSSARY.md § *Ping*). What is missing is the reply.

This is the direction `settle-whether-ping-is-enough-on-its-own.md` already
names if ping turns out not to be enough: *make ping carry more — a reason, a
time, a thing to answer — not … grow a thread inside the app*. Keep to that.
A reply here is a state on the roster card, like *nearby*, and not a message
in a thread. Open questions: whether *"back in 20"* should notify the room or
only show up there; and whether a stated time should itself become a later
notification to the person who said it.

---

## Tell the absent what the first one in is saying

Todd's opening idea on the call transcribed 2026-10-07, and the one Rodrigo
called *"brilliant"*. When you step into an empty channel you talk anyway —
*"my riff of why I'm here"* — and what you said is distilled and sent to the
members who are not present, as part of the ping. It replaces a bare *come
in* with *here is what I want to talk about*, which can be the thing that
makes somebody drop what they were doing. He proposed a second notification
on the same principle. If the absent have not come and the conversation has
been going for twenty minutes and is good, they hear about that too:
*"FOMO … but in very genuine ways"*.

**This is where the call's thinking about voice messages ended up.** Rodrigo:
*"maybe we should not have voicemails at all, but instead you're just talking
into the channel. The AI is recording, transcribing, and digesting, and then
messages with these digests are sent to members of the channel … excluding
the ones who are present."* For the people present, the same digest shows up
in the app as a running log, which Todd called *"the scribe on the wall"*.
See `add-voice-messages.md`, which this would replace.

Rodrigo's unanswered question: **how does the system decide which segment to
send?** Todd suggested waiting for a long enough pause. Depends on
`transcribe-as-the-conversation-happens.md` (a digest of a riff is no use an
hour later) and on `a-digest-of-each-call-and-of-the-channel.md`. Recording
when nobody else is there is a consent question for every member, not just
the speaker (`backlog/two-party-consent-has-not-been-reviewed.md`).

---

## Catch up when stepping into a conversation under way

Todd, on the call transcribed 2026-10-07. Arriving twenty minutes into a
conversation, *"people are like laughing already … there's this awkward
entrance"*. When you step in, give a quick account of what has been said so
far: a short digest, or *"the juicy bits of actual lines"* along with who said
them. Rodrigo: *"If I switch to real-time transcripts, there's no reason why
you couldn't take the transcript so far and run it through a digester, and
then you can read the digest or maybe even in a private channel have it spoken
to you."* Todd's addition, which he thought useful but costly: **suggest what
the newcomer might ask**. That means gaps, tangents nobody picked up, and
things a fresh pair of ears is well placed to raise.

This is the in-call version of the newcomer case in
`a-digest-of-each-call-and-of-the-channel.md`, which is about joining a
*channel* later. Here the gap is minutes, not weeks, and it needs the
transcript to exist while the call is still going
(`transcribe-as-the-conversation-happens.md`). Spoken catch-up means
text-to-speech. Rodrigo named ElevenLabs as the default and noted that the OS
already reads text aloud. Who may read the digest is the same consent question
the channel digest raises: what is said in a call before you arrive is
something you were not present for.

---

## Show that you are being recorded away from the channel view

Todd, on the call transcribed 2026-10-07. A group call he was on through
CarPlay ended abruptly when Rodrigo left, and he could not tell whether he was
still being recorded. The quickest way to be sure, without looking at buttons
while driving, was to swipe the app away. Rodrigo: *"currently it tells you if
you're recording only if you look at the channel view … if you're on the lock
screen, you certainly don't know. So maybe that needs to change."*

**There is also a defect nobody wrote down.** Rodrigo: *"The chime is also
supposed to indicate, but we noticed that there was a bug and I forgot to make
a note of it."* The recording chime (GLOSSARY.md) plays only for a run
somebody *started*, and an automatic run is silent by design. So first find
out what the bug was, and whether "silent by design" is itself the gap Todd
fell into. Candidate surfaces: the Live Activity or lock screen,
CarPlay's now-playing, and a chime when a recording *stops* as well as when it
starts. It is the question Erta raised on 2026-10-02 too
(`keep-the-transcript-and-let-the-audio-go.md`): she wants to know while she
is speaking.

---

## The channel is one long conversation

Rodrigo's reframing on the call transcribed 2026-10-07, prompted by Todd, and
the one thing he said he was *"completely sold on"*: *"the conversation is not
something that happens in the channel, rather the channel is one very long
conversation with interruptions."* The recordings, their transcripts and
whatever passes between calls are one transcript, *"a year-long
conversation"* and *"not a set of individual 1-hour conversations"*.
*"I want to literally scroll in the phone through the conversation."* Todd's
image was a necklace. Quoted lines would be credited to whoever said them,
which leads people back to each other.

Concretely: one scrollable history per channel. It interleaves digests,
transcripts and the asynchronous material between calls, with
`a-digest-of-each-call-and-of-the-channel.md` supplying the summaries. It is
probably the answer to the empty `improve-transcripts-ui.md`.

**It runs into PROPOSITION.md § *Not chat*.** On the call Rodrigo himself
asked whether he really wants to *"reimplement text interaction when so much
work goes into building something like Signal or Telegram"*. He did not
answer, and later dropped voice messages in favour of digests
(`tell-the-absent-what-the-first-one-in-is-saying.md`). If what goes between
calls is digests of talk rather than typed messages, the history stays a
transcript and does not become a thread. Settle that before building it.

---

## A playlist of the best lines, in their own voices

Todd, on the call transcribed 2026-10-07. Alongside the generated digest, pull
out the best lines as spoken and string the audio together into a playlist.
That is *"compressed with the source content versus generated content"*. He
does this in text already with his own Claude distillations (*"juicy bits"*).
The point is that how a thing was said, and by whom, survives. Rodrigo added
the companion: **elements of a digest link into the recording** and play that
segment. Todd uses that in Otter all the time.

Both need word-level timestamps per speaker, which batch transcripts already
have (decision/2026-08-25-transcripts.md), and a recording that still exists.
That puts this in tension with `keep-the-transcript-and-let-the-audio-go.md`:
a channel that keeps only text has no voices to play. Clips shared outside the
channel are publication, and go through
`decision/2026-09-21-nothing-is-published-until-everybody-in-it-has-agreed.md`.

---

## Run a cheap transcriber beside AssemblyAI and compare

Rodrigo's plan, stated on the call transcribed 2026-10-07: *"I'll keep
AssemblyAI up, but I'll implement a parallel transcription using the very
cheap one and then compare them. If they're comparable, then there you go …
If they're not, then maybe I can just keep both implementations alive."* The
one he had in mind was about 1/20th of the cost and popular. He did not name
it on the call.

AssemblyAI was chosen for diarisation, but here diarisation comes from the
stems: one track per microphone (decision/2026-08-25-transcripts.md). So a
provider without speaker separation loses little, and the comparison is about
word accuracy on our own audio. Rodrigo: *"it's useless to get the words
backwards"*. The seam is the provider interface that decision already
describes. Run both on the same stems and diff them. Whatever is learned also
feeds the provider question in `transcribe-as-the-conversation-happens.md`.

The digester is the other half of the cost, and that was decided on the call
too: **Sonnet first**, and tune down later. A digest can stand a little
degradation, since *"once you get the gist … you'll have your own sense of
what it was really about"*. Cost is judged against tomorrow's prices rather
than today's.

---

## Free to talk, paid to transcribe and digest

Rodrigo, on the call transcribed 2026-10-07: *"making the whole service free,
unless you wanted … transcribing and digesting. And in that case, you get, I
don't know, maybe a couple of hours a month for free. And if you want more
than that, then you sign up for the monthly."* The part he called beautiful:
**one member can pay for a channel**, so the others get the value without
paying, and later pay for it themselves in channels of their own. Recording
stays free (*"recording is free, so I can record everything"*). Social
channels leave transcription off, high-value ones turn it on. That is how
cost is managed.

This answers the **who pays** question that
`transcribe-automatically-in-chosen-channels.md` and
`a-digest-of-each-call-and-of-the-channel.md` both leave open. It replaces
decision/2026-08-25-transcripts.md's one-free-transcript-per-account rule with
an hours allowance. A subscription is in-app purchase or Stripe, a bigger
build than the Ko-fi donations in `payments-upgrade.md`, which lays out the
trade between the two. Until there are users who are not friends and family,
Rodrigo estimates the whole bill at under $20 a month, so there is no rush.

---

## Recommend contacts from what channels talk about

Rodrigo, on the call transcribed 2026-10-07: different channels that share
some of the same people and, *"as determinable by the digests themselves"*,
the same subjects suggest second-degree connections, and *"it's trivial to …
surface that to the user with just contact recommendations"*. Todd's version
works inside a call: the system knows who in the network has interesting
things to say on what is being discussed, and suggests pinging them.

Next to `introduce-radiate.md`, which measures distance through contacts but
says nothing about subject. Reading one channel's digests to recommend
somebody to members of another channel leaks what was said across the
boundary between channels, so the consent question comes first: it is the
same one `a-digest-of-each-call-and-of-the-channel.md` raises, at a larger
scale.

---

## A digest of each call and of the channel

Todd's, 2026-09-30. When a call ends, the people who were on it are sent a
short **distillation** of what was said. Over time these add up to a journal
of the channel. Somebody who joins later gets **a distillation of all the
distillations**: what this channel talks about, beyond its name.

Todd sees two uses. It is a nice touch for the people who were on the call.
And it helps a newcomer get up to speed, which also answers the complaint from
a couple of users that The Floor is no different from a phone call. A
channel's accumulated memory is something a phone call does not have.

It depends on transcripts, either automatic ("Transcribe automatically in
chosen channels") or text-only ("Keep the transcript and let the audio go").
Open questions: which model writes the summaries, and who pays for it; how the
digest reaches people (push, or the channel); whether a newcomer may read
digests of calls from before they joined, which is a consent question like
publishing (`decision/2026-09-21-nothing-is-published-until-everybody-in-it-has-agreed.md`);
and what happens to a digest when its recording or transcript is deleted.

**The call transcribed 2026-10-07 answered two of these and specified the
prompt.** The model is Sonnet first (`run-a-cheap-transcriber-beside-assemblyai-and-compare.md`).
Who pays is `free-to-talk-paid-to-transcribe-and-digest.md`. Rodrigo's
context, stated as steps: the **full transcript of one uninterrupted
conversation** plus the **digests of earlier ones**, each capped in length.
Todd's refinement, which Rodrigo took up: rather than every past digest, one
**running preamble**, like a season recap, regenerated as the history grows.
It is hidden by default and exists to give the next digest its context. It
may be offered to a newcomer, but it is not shown in the history. What the
user sees is the sequence of digests. On length: *"pick a number and then
tune it up or down"*. Rodrigo did not want the model judging how dense or
valuable an hour was. And participants want the raw transcript out too, to
paste into their own tools, as Todd does with Otter. The history this builds
up is `the-channel-is-one-long-conversation.md`.

---

## Add Voice Messages

These are recordings, sharing the infrastructure with the existing recordings, but with a distinct interface.

- Recording is the same. In the room, everyone and media is heard and recorded. 
- Constrained to 60s.

On the call transcribed 2026-10-07 Rodrigo described this in full: hold the
button to record, which keeps a note to between ten seconds and a minute.
Notes are heard privately, from a per-member inbox, with marks for what you
have heard and who has heard yours. Together they are the interval between
two calls. **By the end of the same call he was doubting that this should
exist**: *"maybe we should not have voicemails at all"*. You talk into the
channel, and digests go to the absent. That is
`tell-the-absent-what-the-first-one-in-is-saying.md`. Decide between the two
before building either. Also unresolved on the call: whether such a note is
better received as text, and so whether this is chat by another name
(PROPOSITION.md § *Not chat*).

---

## Transcribe automatically in chosen channels

Rodrigo, 2026-09-30: *"I can configure it to automatically transcribe as well,
just for certain channels or certain accounts. I can experiment with ours."*
Transcription is started by hand today, on a recording (decision/2026-08-25-transcripts.md). This
task is the setting that transcribes every run without anybody tapping.

`autoRecord` is the model to copy
(`decision/2026-09-10-a-channel-that-records-itself.md`): a channel setting
guarded by `canEditChannel`. The first version can be narrower, switched on by
account or channel from the box, since the first use is one channel for an
experiment. The question to settle before it goes further is **who pays**.
decision/2026-08-25-transcripts.md § *Who may ask for one, and what it costs* assumes that
somebody asks, and an automatic transcript has nobody asking.
Rodrigo's answer on the call transcribed 2026-10-07 is
`free-to-talk-paid-to-transcribe-and-digest.md`. Until then he will switch it
on for his own chosen channels *"with all the force"*: transcript and digest
both.

This task needs an existing recording to transcribe. The version with no
recording is "Keep the transcript and let the audio go".

---

## Transcribe as the conversation happens

Find out whether streaming transcription is viable. It came up on the call of
2026-09-30. Todd says AssemblyAI does real time, and uses it in another app.
decision/2026-08-25-transcripts.md chose **batch** on purpose, and in § *The provider is an
interface* it warns off the realtime API's `speech_model` shape.

It matters because of "Keep the transcript and let the audio go". If text can
come straight from the live media, the audio never has to exist as a stored
object. As Rodrigo put it, that is the only way transcript-only works. Things
to find out:

- whether their streaming API takes one track per speaker, so that
  identity-by-stem, which the whole design depends on, survives;
- what it costs per hour compared with batch (about 20¢ now);
- where it would connect: a LiveKit track egress or agent on the box, and what
  that costs the box (INFRASTRUCTURE.md § *What the box can carry*);
- how it handles the floor. A silenced speaker is captured today and gated
  only at export, so streaming would have to apply that gate while the call is
  running.

**The provider question comes with it.** Rodrigo expects to move off
AssemblyAI to something cheaper. His guess is that the price falls from 20¢ an
hour to 2¢ within a year, and that at that price it can be free. Todd pointed
out that Whisper-class models running locally already cost almost nothing. A
self-hosted streaming model on the media box is one of the answers to
evaluate, not just a footnote.

### Findings, 2026-09-30

**Viable, with AssemblyAI. Not viable self-hosted on the media box.** Read
against ASSEMBLY_PROMPT.md, the code, and AssemblyAI's live pricing page —
which already disagrees with the snapshot: their flagship realtime model is
now "Universal-3.6 Pro", where the prompt says 3.5.

**Identity-by-stem survives, because the API forces it.** A realtime session
is one WebSocket carrying one mono 16 kHz PCM stream (ASSEMBLY_PROMPT § 9), so
it is one session per identity — the same one-job-per-stem shape decision/2026-08-25-transcripts.md
chose. There is no multichannel option to be tempted by. Diarisation is
optional (`speaker_labels=true`) and costs +$0.12/hr per stream there; it is
worth paying on the `media` stem, the one where it was ever information, and
probably nowhere else.

**Cost is a wash with batch, if the model is the cheap one.** Streaming is
billed for **as long as the WebSocket is open, not for audio sent**, which
ASSEMBLY_PROMPT does not say. Universal-Streaming (English or Multilingual) is
$0.15/hr; the flagship realtime model $0.45/hr. Batch is $0.21/hr on U3.5 Pro
and $0.15 on U2 — and batch already pays for silence, since every gated stem
is rendered at the recording's full length. So per speaker-hour, the cheap
streaming model costs what batch does now, and the flagship double.
Rate limits: 100 new streams a minute pay-as-you-go, 5 on the free tier.

**Where it connects: an rtc-node subscriber in the server process, not an
egress.** `server/src/media.ts` already joins rooms with `@livekit/rtc-node`
to publish played audio (`openPlayback`, `autoSubscribe: false` on purpose).
A transcriber is that in reverse: subscribe to each audio track, take the
decoded 48 kHz frames, resample to 16 kHz, one WebSocket per identity. It
uses no egress job, so it does not count against the `track_cpu_cost` cap of
~10 participants (INFRASTRUCTURE.md § *What the box can carry*). What it does
cost is Opus decoding and resampling on 2 vCPU — small per stream, unmeasured.
Sessions cap at 3 hours (close code 3008), so a long call has to roll over to
a fresh session.

**The floor is easier live than at export.** Silencing unsubscribes the
listeners from a track (`media.ts`, `updateSubscriptions`); the silenced
person still publishes, which is why egress captures them. The server holds
floor state in memory, so the transcriber can gate at the source. **Gated
audio must be sent as zeros, not dropped**: word timestamps count from the
audio sent, so dropping frames would push them off the recording's timeline,
and zeros are what `buildStemGraph` does at export anyway. Billing is by
connection time, so dropping would save nothing either. One honest difference:
the live gate follows the moment the server *acted* on a floor change, the
export gate follows `floor_timeline`'s timestamps, and the two can differ by
a few hundred milliseconds at a boundary. The live one is arguably closer to
what listeners actually heard.

**What it does for "Keep the transcript and let the audio go":** nothing is
written to S3, so letting the audio go stops needing an unattended delete and
`decision/2026-09-23-the-server-may-not-delete-recordings-and-a-person-does-it-instead.md`
is never reopened. The audio still exists briefly at AssemblyAI while it is
being transcribed, so the red indicator and the consent question stand exactly
as that task says.

**What it costs the design.** decision/2026-08-25-transcripts.md's model inverts: a transcript is
no longer *attached to* a recording, it can exist without one. And streaming
has to be set up before the call starts, so it cannot be a button pressed on
a finished recording. That makes it a channel setting, which collides with the
one-free-transcript-per-account rule, and gives up batch's restart recovery
(the provider id in the row, polled on the tick) — a server restart mid-call
loses whatever was in flight. decision/2026-08-25-transcripts.md's warning about `speech_model` is
about the parameter's shape (realtime takes a required singular string, batch
the plural fallback array), not an argument against streaming.

**Self-hosted is a second box, not this one.** The box is 2 vCPU, 2 GB,
already carrying the SFU, egress and the app. Whisper-class streaming for
several simultaneous speakers needs roughly a core per stream, or a GPU. It is
realistic only on separate hardware, which trades per-hour billing for a
monthly one. Either way the seam should be a `StreamingTranscriptionProvider`
interface (open, send audio, turns arrive, close) beside the batch one, so
moving off AssemblyAI later touches neither the gate nor the per-identity
sessions.

**Next step, if pursued:** a spike on the box with one rtc-node subscriber
and two speakers, measuring CPU use and how well the live gate lines up with
`floor_timeline`, on Universal-Streaming Multilingual at $0.15/hr.
