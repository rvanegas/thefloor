# 2026-09-21 — Nothing is published until everybody in it has agreed

Publishable recordings, built. This retires `tasks/publishable-recordings.md`
down to what is genuinely left, and deletes `PODCAST.md`, whose design this
implements and whose surviving reasoning is carried here.

## What shipped

A channel may declare itself public. It then has a page at `/c/<id>` carrying
its name, its notepad and its published recordings, and a feed at
`/c/<id>/feed.xml` a podcast client can subscribe to. Both are unauthenticated,
both check the channel's `public_at` on every request, and the address carries
the channel id — 72 random bits — so it is unlisted rather than secret, and is
handed to somebody the way a guest link is.

This is **(a) from PODCAST.md's fork**, built first on that document's own
recommendation: no artwork, no `itunes:category`, no `itunes:author`, no
submission to Apple or Spotify. None of those is needed to hear an episode and
each adds a review cycle rather than a capability. What was *not* deferred is
the consent model, which (b) needs identically — so nothing here is thrown away
by listing the feed later.

## The consent model, which is the part that is not a subset of anything

PODCAST.md said the honest bar is every participant's assent rather than one
member's, and called it a new mechanic rather than a new guard. It is built as
one: `recording_consents`, a row per person per recording.

**Unanimity.** A recording publishes when every account that took part has
agreed and not before. `mayManageRecording` — the bar for deleting, renaming
and transcribing — is deliberately not reused. Those acts change a shared
artefact for people who could already reach it; publishing shows everybody's
voice to anybody at all, and no single member has standing to decide that for
the rest.

**Withdrawal is one person's, with no appeal.** The mirror of unanimity and
forced by it: if it took everybody to put it up, it cannot take everybody to
take it down, or somebody who changed their mind would be outvoted about their
own voice. Deleting your account is the most complete withdrawal available and
does the same — `Accounts.erase` unpublishes before it clears the rows.

**A guest is asked where there is anybody to ask.** The first version of this
took PODCAST.md's second option — *publication requires that there were none* —
and refused any recording a guest had been in. That was wrong twice over, and
both were caught at the prompt rather than by a test:

- **A guest who never spoke was blocking it.** A run's audience unions presence
  with stems (`fileRun` says why), so somebody who sat in the room and opened
  no microphone is on the roster while being in none of the audio. There is
  nothing of theirs to publish and nothing for them to agree to, and the rule
  let them veto a conversation permanently with nobody able to undo it.
- **A guest with an account was being treated as unreachable.** A guest is
  somebody holding a seat in a channel they are not a member of, *with or
  without an account here* — `guest_sessions.account_id` is exactly that
  person. They can be asked, so they are: they join the consent set like a
  member and withdraw like one.

**That forced the one widening in this feature.** Everywhere else, reach is
`recordingsFor` — *are you in this channel*. Publishing cannot use that alone,
because the question is not who may hear a recording but whose voice it would
broadcast, and those sets come apart precisely at a signed-in guest who spoke.
So `Publication.recordingFor` admits anybody in `mustConsent`, which confers
nothing else: playing, exporting, renaming and deleting all still ask
`recordingsFor`.

What is left is a guest who spoke and has no account, and there the refusal
stands. The alternatives remain dropping their stem — which changes what the
episode *is*, and would mean re-rendering from stems, the one thing
`transcodeToPublished` exists to forbid — and asking the members on their
behalf, which is what unanimity denies. PODCAST.md's third option, a guest link
that carries the possibility up front, is the only honest fix and is in the
task.

**The asymmetry is in the interface, in those words.** Withdrawing takes the
episode off the page and out of the feed and reaches no copy a subscriber has
already downloaded. That is the one fact somebody needs *before* agreeing
rather than after, so it is in the confirmation on the way in.

**Consent is per recording, never per channel.** Agreeing to publish last
Tuesday's conversation says nothing about this one, and a standing permission
would quietly convert one judgement into every future judgement.

## Three things that were got right by construction rather than by care

**The floor.** The published M4A is a transcode of `mixed.ogg` — the file
`encodeRecording` already produced, with `buildStemGraph` having silenced every
speaker across every window in which they held no floor. `transcodeToPublished`
takes a finished mix and has no way to read a stem, so a published episode
inherits the floor's guarantee from the same code path as a private export.
This is the property a reimplementation would silently break: anything that
renders its own audio for publication is a second place the floor can be got
wrong, and getting it wrong here broadcasts to the world a remark somebody was
silenced for.

**No member is named on the page.** The task entry is explicit that members
stay private though they may be described in the description. The trap was not
the roster, which was never drawn — it was the episode *title*. A recording in
an unnamed channel is filed under `nameRecording(displayNames)`, which is the
right label in the app and a byline on a public page. `publicTitle` recomputes
that default from the row's own `participant_names` and falls back to the date
when it matches, so the guard cannot drift from the function it guards. **A
test asserts the rendered HTML contains neither display name**, which is the
only form of it that catches somebody helpfully adding a byline later.

**A subscriber never meets a dead enclosure.** A recording leaves the page and
the feed the moment it is *marked* deleted — a week before the sweep removes
its bytes. PODCAST.md named this as an ordering constraint and preferred this
direction to blocking deletion; it is a `deleted_at IS NULL` in one query, and
the sweep's comment says so from the other end.

## Where the bytes come from, and what that will cost

**Off this box, ranged.** `RecordingStore.getRange` was added for it, and a
`Range` header gets a `206` with a `Content-Range` — a podcast client is not a
browser, Apple's crawler and most players issue byte-range requests, and
several will not let a listener seek without one.

This is PODCAST.md's first option, taken on its argument: the accounting stays
honest, the enclosure URL stays ours, and the privacy story stays one sentence.
The cost is that a feed that catches on means the same file going to many
clients over the hours after an episode lands, next to live audio, on two
vCPUs. **Moving it is a change of URL rather than a change of design** — the
feed can point anywhere later — and a separate published-audio bucket is the
version to reach for, not a public path on the existing one, which is
`GetObject`-only precisely so a leak is bounded.

`usage_bytes` gained an `episode-fetch` kind, which is **the first traffic
class not attributable to an account at all** — the `accountId` is genuinely
absent rather than unknown. Without it `bin/usage` would keep reporting a
census that no longer described where the bytes went.

## What was decided along the way and is not obvious from the diff

**A second column, not a fourth `mix_state`.** `aac_state` describes a
different file with a different lifecycle, and "the Opus mix is ready and the
AAC one is not" is a state every published recording passes through. One column
could not represent it without encoding a pair as a vocabulary.

**`published_bytes` is stored rather than measured.** A feed's `<enclosure>`
must carry a length, and a `0` is not a harmless placeholder — several clients
read it as an empty file and refuse to download. Measuring per request would be
a HEAD per episode per poll per subscriber, for ever.

**Republishing does not re-encode.** `unpublish` leaves the object in the
bucket on purpose, so a decision reversed in a minute costs nothing; `publish`
therefore skips the transcode when one is already there. The first version
re-encoded unconditionally, which made the file unavailable for the length of
an encode after a change of mind, for bytes that were already correct.

**`escapeXml` is not `escapeHtml`.** XML wants `&apos;`, which HTML does not
care about, and a channel called "Nick's kitchen" would otherwise produce a
feed no client could parse. Control characters are dropped rather than escaped,
by codepoint rather than by a character class — a literal range of control
characters in a source file is invisible to every reader, which this file
learnt the hard way when one got written into it.

**`pubDate` is `started_at`.** Backfilling a year of conversations should land
them where they happened; clients sort on this, and publishing in a batch would
otherwise present all of them as today's news in arbitrary order.

**The page carries no script.** An `<audio preload="none">` per episode is the
whole player. Not minimalism: the bytes come off this box, and a page that
autoloaded five episodes would start five ranged reads of a megabyte each on
every visit, beside live audio.

## What this reopens, which was predicted

`2026-09-16-nothing-here-knows-what-a-track-is.md` retired the copyright
question on the explicit strength of there being no public surface, and named
this feature as the one thing that would change that. It does.

**The argument it rested on is unchanged and is not abandoned.** Nothing here
fingerprints, hashes, or inspects an upload, because acquiring that knowledge
is what creates the duty — that entry's central point, and the reason its
absence is load-bearing rather than incidental.

**What changes is that a host serving the public owes a way to be told.** That
entry said the trigger would be an email rather than a feature, and that what
was needed on the day was an address that is read and a willingness to remove a
file. Both now exist and are cheap: the public page carries the contact address
under a line inviting somebody to write about what is on it, and `unpublish` is
the act. Nothing more is built, on that entry's own reasoning that a procedure
nobody has exercised will be wrong when it is.

## What is deliberately still missing

**Artwork**, and with it any possibility of being listed. PODCAST.md called it
the largest piece of new code here and the least interesting — an upload
endpoint, dimension and format validation, a bucket key and a public serve
route — and argued it should not gate the rest. It did not. There is still no
image anywhere in the schema.

**`language` and `explicit`** have columns, a route and a `setDeclarations`
that writes them, and no control in the app: the feed falls back to `en` and
`false`. They are declarations somebody makes rather than anything derivable,
and the two fields belong with the artwork in channel settings when (b) is
built.

**A guest link that carries the possibility up front**, which is the only thing
that would let a conversation a guest spoke in ever be published.
