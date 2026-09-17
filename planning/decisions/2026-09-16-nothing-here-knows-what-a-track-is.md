# Nothing here knows what a track is

Decided 2026-09-16, retiring
`backlog/playing-media-into-a-channel-is-a-copyright-surface-nobody-has-addressed.md`,
which had been open since 2026-08-14 and through two App Review passes. It is
deleted with this. **Nothing is built, and that is the decision** — the half
most likely to be mistaken later for an oversight, which is why it is written
down at all.

## The argument that closed it

The entry's title located the problem in the feature: that somebody can play a
copyrighted track into a channel. That is not a surface. **Every player plays
whatever it is handed, and `cp` copies whatever it is pointed at, and no
responsibility has ever attached to either for what a user chose.** A product
is answerable for what it *knows*, and this one knows nothing about a track
beyond a title somebody typed and a file somebody uploaded. There is no
fingerprint, no catalogue, no lookup, and no inference — and **acquiring one
would be manufacturing the very knowledge that creates the duty.** So the
absence is load-bearing rather than incidental.

This survives the four things the code does that a local player does not: the
upload lands on the server's own disk (`server/src/media.ts`), the pump sends
the same samples to the room and to the encoder so a recording contains the
track (`server/src/playback.ts`), a member may download the uploaded file
itself (`Channels.trackFileFor`), and since 2026-08-25 the `media` stem is
transcribed. **Each of those is hosting, transmitting, copying or
redistributing — none of them is knowing.** A host that holds a file for two
people and hands it back is the ordinary shape of every storage product there
has ever been, and the reason that shape is safe is precisely that the host
cannot see what it holds.

**No public surface exists today**, which is what keeps this cheap: the track
download and the recording export are both gated on channel membership rather
than presence, and a guest is somebody who was invited. Nothing played in a
channel is reachable by the world.

## What was rejected along with it

**A line in the review notes and a line on the privacy page**, which is what
the entry itself proposed. Under the argument above it is worse than doing
nothing: it volunteers a question two reviews have not asked, about conduct
that needs no disclosure, and invites a reviewer to form a view where they
currently have none. Guideline 5.2 is about the app's own use of protected
material, and this app makes no such use.

**Anything that inspects an upload** — a fingerprint, a hash check, a
blocklist, a duration heuristic. Each one is a claim to know, and a wrong claim
is worse than no claim. This is the same reasoning that makes the watch party
legitimate from the other direction, and the two now sit either side of it
deliberately.

## The two things that would reopen it

**A first notice.** "Responsibility follows knowledge" is silent up to the
moment somebody tells you and decisive immediately after. **So the trigger is
an email, not a feature**, and what it needs on that day is an address that is
read and a willingness to remove a file — neither of which costs anything to
not-have until it happens. Nothing is built for it now, on the grounds that a
procedure nobody has ever exercised is a procedure that will be wrong when it
is.

**Publishable recordings.** `tasks/publishable-recordings.md` would put a
recording — containing whatever was played into it — in front of the world
rather than in front of the two people who made it. That is the fact this
entry's whole analysis rests on, and it is the one thing above that changes
when that ships. **Read this before building it**, and expect the answer to be
different: a host serving the public is where notice-and-takedown stops being
optional and starts being the thing that keeps the rest of the argument true.

## The sentence next door

`server/src/watch-page.ts` says of the watch party: *"Nothing is fetched,
decoded, published or stored by us, which is what makes the feature legitimate
and also why a channel running one refuses to record."* **The uploaded track
fails all four clauses, by design, and that is not a contradiction** — the
watch party's problem is YouTube's terms of service, which are a contract about
*how their video may be embedded*, and the answer to a contract is compliance
with it. Copyright is not a contract and has no equivalent clause to comply
with. The two tests look alike and are not, and a reader who finds the strict
one stated and the other unstated should read this file rather than assume the
second was forgotten.
