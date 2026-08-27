# A channel's recordings as a podcast feed

**Temporary, and undecided.** This is a design for an addition to TASKS.md
§ *Publishable Recordings*, written 2026-08-27 from an exploration and not from
a line of code. When the work ships it is deleted, and whatever survives goes to
`decisions/DECISIONS.md`. Nothing here has been built.

**It is an addition to that task rather than a reading of it.** The entry asks
for a page at `thefloor.rvanegas.co` where anyone can listen to selected
recordings of a channel that has declared itself public. A feed is not that
page; it is the machine-readable half of the same publication, and the page is
what its `<link>` points at. Everything the entry asks for — the public flag,
the selection, the name and description, the image — a feed needs too, which is
why the two are one piece of work rather than two.

---

## The thing that makes this cheap: the artefact already exists

A published episode is a file this server has already made and already stored.
`mix()` renders a run's stems into one object at
`<channelId>/<recordingId>/mixed.ogg` when the run ends, not per request, and
sets `mix_state = 'ready'` (`server/src/channels.ts`, `mixKeyFor`). Playing and
exporting are both a single fetch of that object. **An enclosure is a third
reader of the same file**, and no part of publication has to think about stems,
egress or ffmpeg graphs.

That matters more than convenience, because of what the mix *is*.
`buildStemGraph` in `server/src/export.ts` gates each speaker to silence across
every window in which they held no floor, and the doc comment there says why it
is one function: so the floor cannot be got right in one place and wrong in
another. A published episode therefore inherits the floor's guarantee **by
construction**, from the same code path as a private export. It is the single
most important property of this design and the one a reimplementation would
silently break — anything that renders its own audio for publication, for any
reason, has to go through `buildStemGraph` or it is publishing remarks somebody
was silenced for.

The rest of the metadata is already there too:

| Feed element | Where it comes from |
| --- | --- |
| `<title>`, `<description>` | `channels.name`, `channels.description` |
| `<item><title>` | the recording's shared name — renameable, already a settled social object |
| `<pubDate>` | `recordings.started_at` |
| `<itunes:duration>` | `recordings.duration_ms` |
| `<guid isPermaLink="false">` | `recordings.id` |
| `<podcast:transcript>` | the existing VTT export, `formatTranscript` |
| `<itunes:image>` | **nothing. See § *Artwork*.** |

`channels.description` is Markdown source, and a feed `<description>` wants
either plain text or escaped HTML. Rendering it is not new work — the public
page has to render it anyway — but the feed and the page must render the same
source through the same function, for the reason every other pair in this
repository does.

---

## Four things stand in the way, in this order

### 1. The audio is Ogg/Opus, which podcast clients do not play

`RECORDING_CONTENT_TYPE` is `audio/ogg` and both encoders are `-c:a libopus`
(`server/src/export.ts`, `server/src/playback.ts`). That is the right choice for
what it was chosen for — the app fetches it, the app decodes it, and Opus is
smaller than anything else at speech bitrates. It is the wrong choice for a
feed. Apple Podcasts accepts M4A and MP3; Opus-in-Ogg is not on the list, and
support across third-party clients is patchy enough that a feed serving it works
for some subscribers and not others, which is worse than failing outright.

So publication means a **second artefact per published recording** —
`mixed.m4a` beside `mixed.ogg`, under the same prefix, so the sweep that already
deletes by prefix keeps working without being taught anything.

Three things follow, and they are all in the design's favour:

- **It is a transcode, not a re-mix.** `ffmpeg -i mixed.ogg -c:a aac` reads the
  finished, floor-gated file. No stems, no filter graph, no second place the
  floor could be got wrong. The gating question above answers itself.
- **It happens at publish time, not at capture time.** Only recordings somebody
  actually publishes get one. Capture is untouched, and a channel that never
  publishes pays nothing.
- **Storage grows only for what is published.** AAC at speech bitrates is larger
  than Opus but not by a factor that changes the sizing argument in
  MIGRATION.md.

The open question is what `mix_state` becomes. It is currently three values —
`pending`, `ready`, `unmixed` — describing one file. A second file with its own
lifecycle wants its own column rather than a fourth value in that one, because
"the Opus mix is ready and the AAC one is not" is a state that has to be
representable: it is what every published recording passes through.

### 2. The enclosure must be a plain, cacheable, Range-capable GET

`/recordings/:id/export` (`server/src/app.ts`) requires an account, buffers the
whole object into memory, and sets no `Accept-Ranges`. A podcast client is not a
browser: Apple's crawler and most players issue byte-range requests, expect
`206` with `Content-Range`, and some will not seek at all without it.
`RecordingStore` in `server/src/storage.ts` offers `get(key): Promise<Buffer>`
and nothing else — no ranged read, no stream.

Two shapes, and they trade the same thing in opposite directions.

**Serve it from the box.** A new unauthenticated route, a ranged read added to
`RecordingStore`, and the bytes stay inside this server — which keeps them
inside `usage.recordBytes`, keeps the privacy story one that can be told in one
sentence, and keeps the enclosure URL stable and ours forever. The cost is that
the box serves them: 2GB and 2 vCPU, with the SFU on the same machine. A feed
that catches on means the same file going to thousands of clients over the few
hours after an episode lands, next to live audio — the same neighbourliness
problem AGENTS.md § *Known rough edges* already flags for deploys, arriving from
a new direction and with no upper bound.

**Point the enclosure at S3.** Range and bandwidth for free, and the box never
sees the traffic. The cost is that the object must be publicly readable, which
means the bucket that holds every private recording acquires a public path — and
`thefloor-server` is `GetObject`-only precisely so that a leak is bounded
(planning/CREDENTIALS.md). A presigned URL is not the escape: presigned URLs
expire, feeds are cached by aggregators for days, and an expired enclosure is a
broken episode. It would have to be a genuinely public object, or a separate
bucket for published audio, or a CDN in front of one.

**Start with the first.** Real traffic will be small for a long time, the
accounting stays honest, and the second is a change of URL rather than a change
of design — the feed can point anywhere later. The second is noted here so that
whoever meets the traffic is not designing under load. A separate
published-audio bucket is the version to reach for, not a public path on the
existing one.

### 3. Publication is irreversible, and consent is not modelled

Every rule about a recording today is scoped to channel membership, down to
hiding a recording's *existence*: the export route answers `404` for absent,
deleted and not-yours alike, and says in a comment that knowing a recording
exists is itself something only the channel's members should learn. A feed
inverts that for a chosen subset, and nothing in the schema currently represents
the choice.

The state is small — a `public` flag on the channel and a `published_at` on the
recording, which is also the feed's filter and the audit trail of when. **Who
may set them is the whole of the difficulty.**

- Renaming a recording is already a shared act, and `renameRecording` refuses
  while anybody is in the channel: *"Somebody is in this channel. Step in to
  rename a recording."* The reasoning in that doc comment — a recording has one
  name and it is everybody's — applies with more force here.
- `mayManageRecording` is the existing bar for acts that shape a shared artefact
  (deleting, transcribing). Publishing is at least that.
- But it is arguably not enough. Transcribing shows everybody's words to
  everybody who was already there. Publishing shows them to anybody. **The
  honest bar is every participant's assent, not one member's**, and that is a
  new mechanic rather than a new guard.
- **Guests cannot give it.** A guest who spoke is recorded on purpose — the
  comment at the capture site says a recording is of the conversation and a
  guest who was speaking was in it — and a guest has no account, no persistent
  identity, and no surface on which to have agreed to anything. Either their
  stem is excluded from a published mix, which changes what the episode is, or
  publication requires that there were none, or a guest link carries the
  possibility up front. The third is the only one that is honest and the only
  one that costs a design.

And the asymmetry that has to reach the interface rather than staying in a
comment: **unpublishing does not recall anything.** Dropping an item from the
feed stops new subscribers getting it; every client that has already downloaded
it has the file, and this system has no reach into any of them. Deleting a
recording today is genuinely a deletion — the sweep empties the bucket a week
later. Publishing is the first act in this system that a later act cannot undo,
and the screen that offers it should say so in those words.

### 4. Artwork is entirely new surface

Apple requires channel artwork: 1400×1400 to 3000×3000, square, JPEG or PNG,
RGB. A feed without it is not listed, and clients that show a grid of subscribed
shows render a blank tile. There is **no image anywhere in the schema** — no
avatars, no channel image, no upload path, and nothing in `RecordingStore` that
stores anything but audio. The task entry's "settings would include image" is
one clause covering an upload endpoint, validation of dimensions and format, a
bucket key, and a public serve route.

It is the largest piece of new code here and the least interesting: plumbing,
not judgement. Which is exactly why it should not gate the rest — see the fork.

---

## The fork: two products, and only one of them is small

**(a) A feed URL you paste into a podcast app.** Unlisted. The URL carries the
channel id, which is unguessable, so it is shared the way a guest link is
shared. Needs: the transcode, the ranged enclosure, the `public` and
`published_at` state, and a feed route. Needs *no* artwork, no
`itunes:category`, no `itunes:author`, no directory submission, and no second
review process by anybody.

**(b) A podcast listed in Apple and Spotify.** Everything above, plus artwork,
the full iTunes namespace, submission to each directory, and a consent story
that has to survive the episode being genuinely broadcast rather than merely
reachable.

**Build (a) first, as a strict subset of the page the task asks for.** It defers
the two things that add review cycles rather than capability, it is most of what
"anyone can listen to selected recordings" actually means, and the consent model
it forces into existence is the same one (b) needs — so nothing is thrown away.
(b) is then artwork, a category, and pressing a button on somebody else's
website.

The feed and the page ship together either way. A feed whose `<link>` points at
nothing is a feed that cannot be checked by a human, and the page is where the
description and the episode list already have to be rendered.

---

## Smaller things, stated so they are not discovered later

- **`pubDate` is `started_at`, not the publish time.** Backfilling a year of
  conversations should land them where they happened; clients sort on this, and
  publishing in a batch would otherwise present them all as today's news in
  arbitrary order. It also means the feed's own order is stable under
  republication.
- **The recording id does two jobs and is good at both.** 72 random bits makes a
  permanent `<guid isPermaLink="false">` — feeds require the guid never change,
  and ours cannot, being the primary key — and makes the enclosure path safe
  against enumeration, which is what allows (a) to be unlisted rather than
  merely obscure.
- **Feed bandwidth is a usage kind that does not exist.** `usage.recordBytes`
  has `export`, `playback-fetch`, `mix-read` and the rest; none of them is a
  stranger fetching an episode. Without a new kind, `bin/usage` keeps reporting
  a census that no longer describes where the bytes went — and this is the first
  traffic class not attributable to an account at all, so the `accountId` on
  those rows has to be allowed to be absent and mean something.
- **`<atom:link rel="self">` is required** by every validator and by Apple, and
  it is an absolute URL, which means the feed route needs to know its own public
  origin rather than inferring it from a `Host` header.
- **`<language>` and `itunes:explicit` are required for (b)** and cost nothing to
  emit for (a). Neither is derivable — both are declarations somebody makes,
  which puts two more fields in channel settings.
- **The transcript link is nearly free and worth having.** `formatTranscript`
  already emits VTT, `<podcast:transcript>` is read by Apple and by Overcast,
  and it is the one element in this design that makes a published episode better
  than the same audio published anywhere else — because the transcript is
  per-stem and knows who spoke, which no other podcast's transcript does. See
  TRANSCRIPTS.md § *The one thing that decides the shape*.
- **A published recording must not be sweepable while published.** The deletion
  sweep removes rows and objects a week after `deleted_at`. A feed item whose
  enclosure 404s is a broken episode in every subscriber's client. Either
  publication blocks deletion, or deletion unpublishes first and the feed drops
  the item before the bytes go — the second is right, and it is an ordering
  constraint of the same kind the sweep's existing comments are careful about.
