# Decisions

What was built, why it was built that way, and what it cost to find out. Also
what was considered and deliberately not built, which is the half most likely to
be mistaken for an oversight.

This is history rather than work. Nothing here is outstanding; see BACKLOG.md
for that. It is kept because the reasoning is the expensive part and it does not
survive anywhere else — a commit message is read once, by whoever is already
looking at the diff, and never again by the person about to make the same
mistake.

**This is the live volume. New decisions are appended here.** Earlier ones are
in dated volumes, which are closed and are never edited again:

| Volume | Covers | Ends at |
| --- | --- | --- |
| `DECISIONS-2026-08-07-to-2026-08-13.md` | the first decisions through self-hosting the media | the media server moving off LiveKit Cloud |
| `DECISIONS.md` — this file | 2026-08-13 onward | live |

**Keep every volume under 2,000 lines.** A plain read stops there and says so,
but the notice is easy to miss in a file that reads like an archive, and what
gets dropped is the tail — the newest and most likely to matter. When this file
approaches it, close it: rename it `DECISIONS-<first date>-to-<last date>.md`,
give it the closed-volume header the others carry, start a fresh `DECISIONS.md`
with this preamble, and add a row above. Cut on a section boundary and on a seam
that means something — an epoch in the project, not a line number.

Two sections here are exceptions to the chronology and stay in the live volume
however old they get, because they are single running records rather than dated
entries: `## The deploy history`, which is newest-first and grows at the top,
and `## The Android adaptive icon`, which describes something still unshipped.

**On vocabulary.** What this project used to call a session is now a channel,
renamed on 2026-08-10 when it stopped being a short-lived conversation and became
a permanent place. Historical passages below still name types and files as they
were at the time — `SessionView`, `SessionState` — and those are now
`ChannelView` and `ChannelState`. Two other things in this codebase are also
called sessions and are unrelated: the auth session behind a bearer token, and
LiveKit's `AudioSession`. Neither was renamed.

**And a channel is never called a room.** The word belongs to Clubhouse, and a
product that borrows a competitor's vocabulary invites the comparison it should
be avoiding. The media layer does use it — `closeRoom`, `setSilenced({ room })`,
`issueToken({ room, identity })`, `new Room(...)` in the app — because it is
LiveKit's own term for a LiveKit thing, and none of it reaches a screen. The
test is whether a user could ever read the word: in the code it is the media
plane's vocabulary; in the interface it does not exist.

---

## A card per person in a channel, lit by who is actually audible

Built 2026-08-13. The roster used to be one line of muted grey per person
under the channel title — `Dana Chu · Present · muted` — which made the answer
to "who is here and who is talking" the smallest type on a screen whose next
four cards described what the channel was doing. It is a card each now, with
the name at full weight and a dot that fills while that person is audible.

**Everybody gets one, yourself included.** Your own mute and your own speaking
indicator are things you want to see, and a roster that lists everyone but you
makes the count on Home disagree with what the screen shows. Your card is the
one that is not pressable: it would lead to a read-only view of yourself
offering to add you as your own contact.

**The speaking indicator comes from the room, not from the reducer.** These are
different questions and it would be easy to answer the wrong one: the floor
says who *may* speak and the server enforces it by muting everybody else, so a
card lit from `channel.floor.holder` would glow through three minutes of
silence and would stay dark for the ordinary case of several people talking
with no claim at all. Only the media connection knows who is making noise, so
`useSessionAudio` now surfaces LiveKit's `ActiveSpeakersChanged` as a list of
identities. They are account ids — the server issues join tokens under
`identity: userId` — so they index straight into a channel's participants with
no second lookup and no mapping to keep in step.

The list is emptied on `Disconnected` rather than left as it was. A name still
pulsing on a screen whose audio has dropped is exactly the reading that
matters, and it is the one a stale list gets wrong.

**No animation.** The dot is filled or hollow, driven by the events as they
arrive, which is already several changes a second while somebody is talking.
Its size does not change with the state, so a card cannot reflow every time
somebody draws breath, and there is no animation loop running behind a screen
that is otherwise idle while a conversation goes on above it.

What the card does *not* do is show an audio level. LiveKit reports one, and a
bar that moves with it is a more literal answer to "a dynamic visual
indicator" — but it is also a value arriving continuously into a React tree
that currently re-renders on server snapshots and a one-second tick, and
speaking-or-not is what a reader of the screen is actually asking. It is worth
revisiting if the binary dot turns out to read as laggy.

---

## Two idle timers, and one place that turns a gap into words

Built 2026-08-13, alongside the channel cards the two of them are shown on.

**They measure different things and come from different clocks.** The one on a
channel card is "when were you last *in this channel*", which the reducer knows:
`stepOut` is the single route out — a tap, a grace period running out, and
leaving the channel outright all pass through it — so the stamp goes there and
nowhere else. The one on Home is "when were you last *in the app*", which the
reducer cannot know, the app being a thing that exists outside any channel. That
is a socket, so it is `accounts.last_seen_at`, written by the websocket layer.

**`last_seen_at` is written on every message, not only at the edges.** Writing
it as a socket opens and closes is the obvious cheaper thing and it is wrong for
the case that matters most: somebody who has had the app open since this morning
would read as last seen this morning. The client heartbeats, so a write per
message keeps the value within one interval of the truth. That is one small
UPDATE per client per interval, which at this scale is nothing; if it ever stops
being nothing the fix is to skip the write when the stored value is already
recent, not to move it to the edges.

**Absent means absent, and is shown as nothing.** Both clocks have states with
no answer, and the temptation in each is to manufacture one. A restart drops
`present` without anybody stepping out, so there is no moment when they left —
stamping the restart would report the deploy as the time they went. An account
that has not connected since the column existed has no last-seen — backfilling
from `created_at` would read as a year idle for somebody who used the app this
morning. Both are left null, and the interface says nothing rather than
something false. `idleMs` returns null for all three of "here", "never here" and
"unknown" for the same reason: none of them is a duration.

**The wording is dayjs's.** `agoOrNull` and `ago` in `app/src/ui/relativeTime.ts`
wrap `dayjs`'s `relativeTime` plugin, which inherits moment's thresholds — 45
seconds is "a minute", 90 minutes is "2 hours", 25 days is "a month". That ladder
is a solved problem with unobvious edges, and one written by hand reads fine at
the values it was tested against and says "1 minutes ago" at the ones it was not.
The test pins the strings, so an upgrade that changes the wording fails here
rather than on a phone.

Two things the wrapper does that the library does not. It clamps negatives,
because these are computed against the server's clock learned a round trip ago,
and dayjs renders a negative gap as "in a few seconds" — a future tense for
something that has already happened. And it never reads the device clock: the
gap is passed in as a duration and offset from a fixed anchor, rather than
passing an absolute time and letting dayjs subtract `Date.now()`, which would
quietly reintroduce the device clock this app counts against the server's to
avoid.

**Under a minute reads as presence rather than as a number.** "A few seconds
ago" about somebody sitting in the app is true and answers a question nobody
asked; it is also where the heartbeat's staleness lives, so a live user would
otherwise flicker between a count and nothing. Home says "In the app now"; a
channel card says nothing at all, presence being spelt out beside it already.

**What this discloses, said plainly.** A contact can now see roughly when you
last had the app open. That is a real disclosure and it is the point of the
feature — the list is for deciding whether it is worth trying somebody — but it
is worth writing down as a thing that was chosen rather than a thing that
happened. It is limited to contacts, who are people you accepted; an outgoing
request shows nothing, because that row is an address rather than a person and
whether anybody is behind it is exactly what it must not answer.

---

## The speaking indicator holds on the way down

Changed 2026-08-13, the same day the cards shipped, on the strength of build 29
on a real phone: the dot flickered through every breath and every gap between
sentences. Distracting in a way the test suite could not have found, because
LiveKit's speaker detection is what produces the transitions and no test here
has a live room.

**The hold is on the removal, and it could not have been on the signal.** The
obvious shape — "speaking if there was a signal in the last two seconds" — is
wrong, and wrong in a way that only shows up in the case the feature is most
for. `ActiveSpeakersChanged` fires when the set *changes*, not continuously, so
somebody talking uninterrupted for a minute produces one event at the start and
nothing after it; a last-signal clock would expire mid-sentence and put the dot
out while they were still talking. What the event says is who is speaking *now*,
and it stays true until the next one — so what needs smoothing is the moment
somebody leaves the set.

The leading edge is deliberately not smoothed. A dot that appeared 300ms after
somebody started talking would be a worse fault than the flicker.

It lives in `app/src/audio/speaking.ts` as a pure function of (hold, speakers,
now), on the same reasoning as `micNeeded`: the timing rules are the entire
substance, and they are not exercisable through a hook that needs a real room to
produce a single event. The hook keeps a timer alongside it, because a hold
running out is the one transition nothing announces — the room has already said
everything it has to say about somebody who stopped.

---

## Donations, by a link out rather than in-app purchase

Built and deployed 2026-08-14. The roadmap had said "Payment — In-app
purchases, optional" since it was written, and the word doing the work turned
out to be *optional*: what was wanted was a way to give money toward keeping the
thing running, not a paid tier. Nothing is unlocked. An account that has never
given a penny behaves identically to one that has, which is what kept the build
to one table, one module and two routes — there is no entitlement to model, no
quota to enforce, and nothing in `core/` to thread a subscription through.

**Why it can be a link at all.** App Review Guideline 3.1.1(a) reads: *"These
entitlements are not required for developers to include buttons, external links,
or other calls to action in their United States storefront apps"*, and the
prohibition on such links applies *"in all other storefronts, except for the
United States storefront, where this prohibition does not apply."* So an
external donate link is permitted outright — no entitlement, no Apple
commission, and no Paid Apps agreement, banking details or tax forms, none of
which an IAP tip jar could have avoided.

**The cost is that the app ships United States only.** That is the single
setting the whole argument rests on, and widening availability later without
also removing the link is how a compliant app becomes a rejected one. It is
worth knowing that the carve-out exists because of the April 2025 injunction,
which is under appeal — so the remedy has to be cheap, and it is: the Ko-fi URL
comes from `KOFI_URL` in the environment and reaches the app only through `GET
/donations`. Withdrawing the call to action is an edit and a restart, not an App
Store round trip. The same reasoning that keeps the LiveKit URL out of the
binary.

Two neighbouring routes were checked and do not apply. **3.2.1(vi)**, charitable
fundraising, requires approved nonprofit status. **3.2.1(vii)** permits optional
person-to-person gifts outside IAP, but it is user-to-another-user and ends *"a
gift that is connected to or associated at any point in time with receiving
digital content or services must use in-app purchase"* — too close to the line
for a donation that keeps the app you are using alive.

### Attribution is by address, and admits when it fails

Ko-fi's donate link carries no passthrough field — nothing a Stripe Payment Link
does with `client_reference_id`. So who gave is worked out afterwards, from the
address they paid with, matched against `accounts.identifier` the way
`byIdentifier` already matches: exactly, case-insensitively. The cheapest half
of this is not code at all — the Settings screen shows people their own sign-in
address and asks them to use it.

**A middle stage was built and then removed, and the removal is the decision.**
It recorded an intent row when somebody tapped Support, and attributed a
donation arriving shortly after under an unrecognised address to whoever's
intent was open. It is wrong in the case it exists for: two people donating at
once, where it credits one person's money to another and *nothing afterwards
would ever reveal that it had*. An unattributed row is visible and fixable by
hand; a confidently wrong one is neither. Removing it also deleted a table, a
route, a sweep and a TTL, which is the shape of a guess that was not earning its
complexity.

What resolves the remainder is a person, reading Ko-fi's dashboard. `matched_by`
records which way each row was found — `'email'` or `'manual'` — so a total can
say how much of itself it is sure about, and `raw` is nullable precisely so a
row typed in from the dashboard does not have to invent a payload it never had.

**Ko-fi's dashboard is the authoritative record; the `donations` table is a
convenience copy.** There is no read API, so a delivery missed while this server
was down cannot be fetched later, only copied across. That asymmetry is worth
stating before somebody reconciles the two and assumes ours is right.

### The verification token is not stored, and once was

Ko-fi authenticates itself with a `verification_token` inside the request body —
a shared secret rather than a signature, which is only safe because Caddy
terminates TLS in front of this. It is compared with `timingSafeEqual`.

The first implementation stored the entire request body in `raw`, faithfully,
including that token. So the secret that authenticates every future delivery was
written to the database on every row, into every backup, and into the output of
any query that selected the column — which is exactly how it was found, by a
`substr(raw, 1, 120)` during verification that printed it. The token was rotated
and the row deleted.

The payload is still kept whole, minus that one field, because Ko-fi may extend
their shape without telling anyone and a field that matters in six months should
be recoverable rather than lost for every row already written. There is a test
asserting the token appears nowhere in the table, including a stringify of every
column, so this cannot come back through a different route.

The general form, worth carrying beyond this feature: **a payload that
authenticates itself contains a credential, and storing it verbatim stores the
credential.** Faithfulness and secrecy pull against each other here, and the
resolution is to keep everything except the part whose only job was already done.

### Shipping worldwide, and filtering who is offered the link

Added later the same day, on learning there were already non-US users. The
original plan had the app shipping **United States only**, which is the simplest
way to satisfy 3.1.1(a) and turned out to be the wrong trade: it would have left
existing users unable to install from the App Store at all, stuck on TestFlight
builds that expire every ninety days. The guideline prohibits the *link* outside
the US storefront, not the *app* — so the app ships everywhere and the link is
withheld per person.

**The client reports, the server decides.** The app sends its locale and
timezone, read from `Intl` (built into Hermes, so no dependency and no native
module); `server/src/region.ts` decides what that means. Putting the policy on
the server is the whole point: this is a compliance rule, and one compiled into
a binary takes a release plus however long people take to update, while one on
the server takes a restart.

**It is an approximation, and it is wrong in a chosen direction.** The
authoritative signal is the App Store storefront, which only StoreKit reports
and which would have cost a native module to read — added, ironically, to avoid
in-app purchase. What is used instead is where the phone says it is. So every
ambiguous case resolves to hidden, because the two failure modes are not
comparable: showing the link outside the US storefront is a guideline violation,
and hiding it from somebody inside it costs one donation.

Three details that carry the weight:

- **Both signals must agree.** Region alone would show the link to somebody
  abroad who has set their phone to US formatting, which people do. Their
  timezone is still where they are, and that is what refuses it. The cost is a
  US person travelling, whose timezone follows them — the case a human can
  recognise, which is what the override is for.
- **The zones are a list, not a prefix test.** `America/` spans Canada, Mexico
  and South America; `America/Toronto` and `America/Sao_Paulo` would both pass
  `startsWith('America/')`. The list includes Hawaii and Alaska, which are not
  `America/` zones at all, and the territories sharing the US storefront —
  Puerto Rico, Guam, the USVI, American Samoa, the Northern Marianas.
- **Silence means no.** Every build before this sends no hints, and reading that
  absence as "United States" is the single guess that could put an external
  payment link in front of the wrong storefront.

`accounts.donations_allowed` overrides it in both directions — null for
everyone by default, meaning decide automatically. It exists because the
automatic answer is a guess and somebody who actually knows the truth for one
account should be able to say so with an UPDATE rather than a deploy.

Withholding the link does **not** withhold somebody's own donation history. That
is a rule about where money may be solicited, not about who may see what they
have already given.

### What else shipped alongside

**A fixed one-time code for App Review** (`REVIEW_IDENTIFIER`, `REVIEW_CODE`).
Signing in means reading a six-digit code out of an inbox, and a reviewer has no
inbox — so without this the app cannot be opened by the people who decide
whether it ships, which is a rejection rather than a rough edge. The code is
published in the review notes and is therefore public; the account it opens must
hold nothing that matters. Everything else about the path is unchanged: still
hashed, still expires, still counts attempts. Unset is the only configuration in
which every code is random.

**A privacy policy at `GET /privacy`**, which App Store Connect will not accept
a submission without. Served by the server it describes, so it deploys with the
code and cannot drift from it — a change to what is stored has to walk past the
page that claims otherwise. Written as claims checkable against this codebase
rather than boilerplate.

### Blocking was built for Guideline 1.2, and reverted

1.2 asks apps carrying user content for ways to filter objectionable content,
report it, and block abusive users. The instinct was that blocking was the
missing piece, since `declineContact` and `withdrawRequest` only reach somebody
who is not yet a contact and nothing severs an accepted one. It was built —
table, methods, routes, tests — and then removed unbuilt on the observation that
the mechanisms already present answer 1.2 better than the new one would have:

- **`DELETE /recordings/:id` is guarded by the same reach test as play and
  export**, so any member of a channel can delete any recording in it. That is
  removal by the person harmed, at the moment of harm, with no queue and no
  appeal to the developer.
- **There is no way in without consent.** Channels require an accepted contact
  on both sides; there is no discovery, no directory, no way to be reached by a
  stranger. That places The Floor with messaging apps, which ship no moderation
  tooling, rather than with social feeds, which must.
- **Leaving already works**, via `STEP_OUT` and `LEAVE_CHANNEL`.

So it is a review-notes item rather than a code item. If a reviewer raises it,
blocking is a day's work. Building it speculatively ahead of a rejection that
may never come was the thing not worth doing — and the reasoning is here so that
the next person to notice the gap knows it was noticed.

---

## A mute is about a track, and tracks do not last

**Status:** built 2026-08-14, after a report that entering a channel and having
the other person claim the floor did not silence the reporter — she went on
hearing him for the whole claim while both screens said he was silenced.

The floor is enforced by unsubscribing every listener from the silenced
speaker's audio (`setSilenced`), which is the right cut and is argued for at
length in `server/src/media.ts`. What was wrong is *when* it was stated. It was
stated once, on a transition — the holder changing, or somebody arriving — and
then believed. LiveKit's `UpdateSubscriptions` takes **track ids**, and a track
id is not a property of a person: a client that drops and reconnects publishes a
brand-new one, which the old statement does not name and which is subscribed to
by default. Nothing in `ChannelState` changes when that happens, so nothing
re-stated it.

The evidence is two logs read side by side, and it is worth keeping because
neither is legible alone. The server's:

    11:58:17.110  setSilenced chan_W… wjD<-sud=true   participant does not exist
    11:58:17.356  …the same, and again at .857 and 18.357

and LiveKit's, for the same seconds:

    11:58:08.343  participant closing   sud   PEER_CONNECTION_DISCONNECTED
    11:58:18.712  starting RTC session  sud                 ← a new session
    11:58:18.947  mediaTrack published  sud                 ← a new track id
    11:58:19.362  UpdateSubscriptions   wjD                 ← the mute, at last

That claim recovered by luck: his websocket dropped along with his media
connection, so the roster changed, so `commit` re-stated everything. Eleven
minutes later the media plane flapped **alone**, twice —

    12:06:11 closing → 12:06:20 rejoin, new track
    12:06:41 closing → 12:06:49 rejoin, new track

— and there is not one `UpdateSubscriptions` in that window. Nothing was even
attempted.

### What replaced it

The server now records what it was actually told: per `listener<-speaker` pair,
the room, whether the speaker was withheld, and **the track ids it was stated
against** (`silenceSignature`). Once a tick, while a floor is held,
`reconcileSilence` asks the media plane what the room is really carrying and
restates every pair whose signature disagrees. A republished track is a changed
signature, so it is caught within 500 ms without anything else having to notice.

Two properties of that are load-bearing and easy to lose:

- **A statement in flight is not a statement in force.** The record is cleared
  before the call, not after it fails, and written only when the call returns a
  track it acted on. So a failure, a call that found nothing published, and a
  call never made are all the same thing to the reconciliation — which is what
  makes it converge rather than believe itself.
- **It touches only pairs where both ends are in the room.** This is what
  retired the loudest line in the log. The old retry loop worked from
  `state.participants`, which is channel *membership*, and asked LiveKit about
  people who were not there — `participant does not exist`, twice a second, for
  as long as a claim lasted, 470 in one day. Room presence is now read from the
  room, so an absent member is not asked about at all.

The immediate statement on a transition is kept, and is deliberately dumber: it
does not know who is in the room and fires at once so that a claim takes effect
now rather than up to a tick later. Everything it cannot land is left to the
reconciliation. That is the division — **the transition is for latency, the
reconciliation is for truth** — and collapsing either into the other loses one
of them.

### What was not done

**LiveKit's `UpdateSubscriptionPermissions`** is the primitive this wants: it is
keyed to the publisher rather than to a track, so it would survive republishing
without any reconciliation at all. It is not in `livekit-server-sdk@2.17.0`, and
reaching past the SDK to the twirp endpoint to get it was not worth it for a
mechanism the tick already affords. Worth revisiting on an SDK upgrade.

**LiveKit webhooks** (`track_published`) would cut the 500 ms to nothing and
remove the polling. They also add a public endpoint, a shared secret, and a
second thing to configure in `livekit.yaml` — for a saving of at most half a
second on an event that happens when somebody's connection drops. The
reconciliation costs one `ListParticipants` per held floor per tick, which is
one call every 500 ms for as long as somebody is actually talking, and nothing
at all otherwise. If the floor ever needs to be tighter than a tick, this is the
change to make.

---

## Deleting your account, and the row that survives it

**Status:** built 2026-08-14, for the App Store submission. App Review Guideline
5.1.1(v) requires an application that lets people create an account to let them
delete one *from inside it*. This one created accounts on first sign-in and
offered no way out at all: `server/src/privacy.ts` promised deletion by writing
to `CONTACT_EMAIL`, which is precisely the arrangement the guideline exists to
end. It is the one certain rejection the audit in APPREVIEW.md found.

`DELETE /me`, a row under Sign out in `HomeSettingsView`, and one confirmation.

### It leaves, it does not evict

The decision that shaped everything else: **a channel is not owned by anybody.**
`canLeaveChannel` refuses the last member and hands them `canDeleteChannel`
instead, because there would be nobody to leave it *to*. So deleting an account
is `LEAVE_CHANNEL` from every live channel, and the existing rule then ends the
ones where that person was the last member — taking their recordings on the mark
and sweep that already exists.

Channels with other people still in them survive, and so do the recordings made
in them. That is not a compromise with the guideline, it is the same rule
`recordingsFor` has always applied from the other direction: a recording belongs
to the place it was made rather than to whoever was in the room, which is why
joining a channel gives you everything ever recorded in it and leaving takes it
away. Deleting recordings *by participant* would reach into other people's
channels and remove their copy of a conversation they were in.

Both departures go through `apply` rather than the reducer, so a departing
floor-holder releases the floor and a run in a channel about to be deleted ends
before the channel does. One route, the same one a tap takes.

Invitations are the case that is not membership and so is not reached by
leaving. An unnamed channel's invitation to somebody who no longer exists would
sit there for ever, so `removeMember` spends it with `INVITE_TAKEN` — already the
server's way of saying this invitation will not be answered here.

### The account row survives, emptied, and that is the interesting part

`channels.initiator_id` and `invitee_id` are `NOT NULL REFERENCES accounts(id)`,
and foreign keys are on. Every channel that person ever started holds one —
including channels other people are still talking in, and ended channels that
anchor recordings. Deleting the row would break those constraints; making it
possible would mean either rewriting other people's history to say somebody else
started their channel, or rebuilding two tables to drop a NOT NULL.

So `Accounts.erase` empties the row instead. The identifier becomes
`erased:<id>` — unique by construction, and deliberately not an email address, so
`request-code` can never issue a code for it however it is typed and the same
person signing up again gets a genuinely new account. The display name becomes
`Deleted account`; bio, `last_seen_at` and `donations_allowed` go to null.
Contacts in both directions, invitations sent and received, sign-in codes and
every token go outright.

**What remains is a tombstone, not an account.** There is nothing on it that
describes a person and nothing anybody can sign in as. What it buys is that a
stale id in an old participant list resolves to *something* — `public()` gives it
the same shape as any other account, and `displayName` already fell back to
'Someone' when it resolved to nothing.

Worth being clear that this is a reading of the guideline rather than a dodge:
what 5.1.1(v) requires is that the account and the personal data go, in the app,
without asking anybody. They do.

### Donations are unlinked, not deleted

`account_id` and `matched_by` are nulled and the row stays. It is money that
changed hands; Ko-fi holds the authoritative record either way, and a payment
vanishing from this side because the payer left would leave the two ends
disagreeing with nothing to reconcile from. `matched_by` goes with the link it
describes rather than being left claiming a match to nobody — see the attribution
section above for why an unattributed row is fine and a confidently wrong one is
not.

### The confirmation is the feature

"This cannot be undone" is true of everything destructive and tells nobody
anything. What is not obvious — and what somebody who finds out afterwards has no
remedy for — is that channels are not yours to take with you. So the alert says
what is removed immediately, that shared channels and their recordings carry on
without you, and that channels you are the only member of go with everything in
them.

It is not behind a submenu and not behind a typed confirmation. Deletion has to
be as easy to find as signing up was, and a flow that makes it harder to finish
than it needs to be is itself a review finding.

The app's own path is the inverse of `signOut`'s, deliberately. Signing out
clears the local session first, because it is gone either way whether the server
hears or not. This one waits for the server: a failure has to leave the account
intact *and* the person still signed in to try again, rather than a screen
claiming they have no account while the server still has one.

### The privacy page moved with it

Two paragraphs: deletion is in Settings and immediate, and here is exactly what
stays behind and why. A test asserts both, because a page making claims about a
feature is the thing that goes stale the moment the feature moves — which is the
whole argument for the policy living beside the code.

---

## Two pages nobody in the app ever sees

**Status:** built 2026-08-14, for the App Store submission.

The privacy policy has been served at `GET /privacy` since donations shipped.
It has a sibling now — `GET /support` — because App Store Connect requires a
Support URL, will not accept a `mailto:` in that field, and shows the link on
the listing to anybody reading it. It is the first thing about this application
that somebody can open without installing anything.

Both are served by the server they describe, which is the whole argument for
where they live: they deploy with the code, and a change to what the software
does has to walk past the page claiming otherwise. `server/src/html.ts` holds
what they share — the escaping and the chrome — and deliberately nothing else.
The prose is the point of each page and belongs in the file that is about it.
Two copies of an escaping function is how one of them comes to be missing a case
the other has.

**The support page is written for somebody with a question**, not for a reviewer
with a checklist. That is not a stylistic preference: a page written for the
reviewer is one no user is helped by, and it is on the listing where users are.
So it leads with a way to reach a person, and then answers what people actually
ask — there is no password, nobody can reach you without mutual consent,
recording is deliberate and visible, and account deletion is under Settings. The
last of those is there because a support page is exactly where somebody looks
after failing to find something in the app.

`/support` was the app's donations route until it moved to `/donations`, which
freed the human name for the human page. Fastify refuses a duplicate method and
path at boot, so the rename had to land first; a test asserts both answer now,
the page unauthenticated and the JSON route with a 401.

### The privacy link in the app, and why it is not a constant

Guideline 5.1.1(i) wants the policy reachable from inside the application rather
than only from the listing, which is reasonable on its own terms — the listing is
where you were before you signed up, and this is the question you have after.

It opens `${API_URL}/privacy`, and using the API's own address rather than a URL
written into the app is the part worth keeping. A build points at exactly one
server, and that server's page is the one making claims about the data it is
holding. A constant could name a different one and nothing would ever notice.

---

## A participant with nothing to record is not a failure

**Status:** fixed 2026-08-14, found while making demo data for the App Store
submission. Recording from a phone failed four times in a row with

    acct_42U9kVnzIm-V is not publishing audio; nothing to record.

and each attempt filed a 0:01 recording. The account named was signed in on an
iOS Simulator where **the microphone permission had been declined**: it joined
the room, subscribed, and published nothing.

The first diagnosis written here was that the Simulator cannot capture a
microphone through `react-native-webrtc` at all. That was wrong, and it is worth
leaving the correction visible because it is the more useful fact:
`xcrun simctl privacy <device> grant microphone co.rvanegas.thefloor`, then
relaunch, and it publishes like a phone — the recording made immediately
afterwards carries a stem for the simulator and one for the handset, starting
2 ms apart. A declined permission and an impossible platform produce exactly the
same symptom from the server's side, which is precisely why the server should
not be trying to tell them apart.

**The bug was modelling that as an error at all.** `MediaServer.startRecording`
asks LiveKit for the participant's tracks and threw when there was no audio one.
But a participant in the room with no track open is an ordinary state, and one
this application *deliberately creates*: `useSessionAudio` keeps the microphone
closed while somebody is alone in a channel, so that sitting in an empty room
does not drag a Bluetooth speaker down to the hands-free profile. A connection
re-establishing and a permission not yet granted look identical from here.

So it now returns **null** rather than throwing, and the caller treats null as
"not yet" — releasing the reserved key, and handing the participant to
`ensureEgress`, which is the path somebody who walks in mid-recording already
takes. A microphone that opens ten seconds in yields a stem from ten seconds in.
If it never opens, `fileRun` files a recording that person is simply not on.

### What stayed fatal, and why the distinction is the whole fix

`startEgress` has a `fatal` flag: everyone present when a run starts is fatal,
and late arrivals are not. That was right, and the reasoning above it still
holds — *"a channel recorded with one voice missing is worse than none, because
it looks complete"* — but it was being applied to two different things.

- **The recorder refusing** — egress unavailable, S3 unreachable, a codec
  mismatch — is a failure of the apparatus. Still fatal, and still tested.
- **A participant with no track** is a fact about one person that says nothing
  about whether anybody else can be captured.

Conflating them meant one silent participant cost everybody else their
conversation. **A recording missing one voice is worth having; a recording that
does not exist is not.**

### Two things it left behind

The error reached the interface verbatim, so a user was shown
`acct_42U9kVnzIm-V is not publishing audio` — an internal id in a sentence
meant for a person. `captureFailed` still passes `error.message` through to
`RECORDING_FAILED` for genuine failures, and it should name people rather than
rows. In BACKLOG.md.

And every aborted attempt was filed: `fileRun` deletes a run with no stems, but
these had one — the working participant's — so four 0:01 recordings appeared in
a channel. Fixing the cause fixes the symptom, but a run that ended in failure
still lists like any other.

---

## `pending_invites.identifier` stays an identifier, and is now checked

Settled 2026-08-15, from a roadmap question asking whether the column should
hold an account id or an email instead.

**An account id is impossible by construction.** The table exists for exactly
the case where no account exists. Storing the request either way is what stops
the interface answering whether an address is registered here — a real request
producing a row and an imaginary one producing nothing is a membership oracle
anyone can query one guess at a time. The comment above the table in `db.ts`
carries the full reasoning and is the thing to read before changing any of it.

**It is already the email**, under the name this codebase gives a sign-in
address everywhere else: `accounts.identifier`, `otp_codes.identifier`, and the
bodies of `/auth/request-code` and `/contacts/request`. Renaming it to `email`
would make one table disagree with the rest, break the resolution join in
`resolveInvitesFor` against `accounts.identifier`, and decide against a phone
number ever being an identifier — which the design still reserves.

What the question did surface is a real gap. `/auth/request-code` validates
with `isEmailAddress`; `/contacts/request` validated nothing, and passed the
raw string to `requestContact`, which wrote it to `pending_invites` verbatim
whenever no account matched. So `bob`, a sentence, or ten kilobytes of text
became a row that can never resolve — signing up requires an address — and that
nothing removes: the only deletions are on resolution and on erase, and there
is no sweep.

The check added is `isPlausibleIdentifier`, and it is **deliberately wider than
sign-in's**. Email-only was written first and broke twenty-two tests, which was
the useful part: contact requests are made to phone numbers throughout the
suite. "Is this an address" and "can a code be mailed to this" are different
questions, and answering the first with the second would settle the SMS
question from the one place with no stake in it. So it accepts an email or a
phone shape, caps length at 254, and rejects nothing else.

**Shape only, never existence.** Refusing a well-formed address because no
account holds it would reopen the enumeration hole the table was built to
close. The two checks must not be allowed to merge.

**`/contacts/withdraw` is left unvalidated, on purpose.** Rows written before
this hold identifiers that would not pass, and withdrawal is the only thing
that can remove one — validating there would make exactly those rows permanent,
which is the problem rather than the fix. Nothing is exposed by the asymmetry:
withdrawal only ever deletes a row whose `requester_id` is already the caller's.

---

## Branches, once there was a build to be wrong about

Adopted 2026-08-15, the day after build 36 was submitted. Until then there was
one branch and it did not matter: every install was the author's, and the
2026-08-10 wire break — which stopped every running client dead — was accepted
precisely because of that. A submitted build ends the exemption.

**The constraint is that there are two release vehicles with nothing in common
but this repository.** The server deploys in about a minute and is reversible
in another. An iOS build goes through review, then through whenever each person
chooses to update, and is not reversible at all. They can never ship together,
which is the whole content of the two-step wire migration already written down:
teach the server both shapes, deploy, ship the client, remove the old shape a
release later.

**And the App Store is not a version, it is a population.** This is the part a
branch cannot express and the reason the convention is mostly not branches. The
deploy history is full of sentences like "build 30 kept working across the
restart" and "installed builds up to 35 call `GET /support` expecting JSON and
now receive HTML" — the thing the server owes compatibility to is the oldest
build still installed somewhere, which is neither the newest released build nor
anything a ref points at.

### What was chosen

**`master` stays trunk, with short-lived branches merged back.** No develop
branch, no release branches. One person, a one-minute server deploy, and a
release cadence measured in days: git-flow would be ceremony bought with
nothing.

**Builds are tagged, not branched.** A submitted build is immutable and is a
point in history — that is a tag. `build/36` was created retroactively on
`b069d61`, the commit that set `buildNumber` to 36 and the `app/` that was
actually archived; the three commits between it and the submission note touched
only `server/` and `planning/`, so `app/` and `core/` — the wire contract that
build speaks — are unchanged across them. `bin/release-ios` now does it for
every upload.

**`released` is the one branch, and it does not exist yet.** It points at what
somebody can download, so it is created when 36 is released rather than when it
is approved — the two are separate decisions on purpose, which is why the
release was set to manual. It earns its place for one reason that a tag does
not cover: if review rejects a build, the fix is made against what was
submitted rather than against a trunk that has moved on.

### The three gaps that were closed at the same time

None of this is worth much without knowing what is actually running, and it
turned out nothing did.

**`bin/deploy` rsyncs the working tree rather than a git ref**, deliberately —
"works from a dirty tree" is in its own header comment, and it is the right
call for a one-command deploy. The cost was that the box held no record of what
it was running: `/healthz` returned `{ok, audio}`, and every "verified against
production afterwards" note in this file names a behaviour and no revision. It
now writes `server/deployed.json` before syncing, with the short sha, the
branch, and the time — the sha marked `-dirty` when the tree was, because the
deploys where that is true are exactly the ones somebody will later want to ask
about. It warns rather than refuses: refusing would take back the property the
rsync was chosen for.

The file is deleted from the checkout as soon as it has landed on the box. It
is a fact about one machine, and a copy left behind would have a local server
reporting the revision of whoever last deployed — a confidently wrong answer in
place of the "unknown" a checkout is supposed to give.

**The deploy now checks that the box came back as the code that was sent.** A
restart that failed and left the previous process serving answers `/healthz`
exactly like a successful one — and that is the failure most worth catching,
because everything verified afterwards gets verified against the wrong
revision.

**`bin/release-ios` bumped `buildNumber` and committed nothing**, so the commit
that became a build was identifiable only by reading `app.json` at each
revision. It now refuses a dirty tree, commits the bump before archiving so the
commit is what gets built rather than a description of it, and tags after the
upload succeeds — the tag meaning "Apple has this", which nothing before the
upload can promise. A failed archive therefore leaves a bump commit and no tag:
the build number is spent either way, since Apple will not take it twice, but
no revision claims to be a build that does not exist.

### The floor, and what it cannot do

`MIN_SUPPORTED_BUILD` in `server/src/release.ts` is the oldest build the server
still answers correctly, and it exists to make one thing decidable: **a
compatibility shim may be deleted once the floor has passed the build that
needed it, and not before.** The two-step migration has always had a third step
with no rule attached, and this is the rule.

**It is a declaration rather than a measurement, and that is a real limitation
rather than a footnote.** Nothing on the wire carries a build number — the app
sends no version header, the server records none — so the floor cannot be
checked against reality, and every claim that build N went on working was
reasoned rather than observed. Making it measurable is in BACKLOG.md; it is a
client change, so it takes a build to reach anybody, and the builds already out
there will never send it. Absent will have to mean old.

It starts at 36 because nothing has ever been public: every earlier build is a
TestFlight install on the author's own devices, updatable on demand, and
TestFlight expires them at 90 days regardless. The moment 36 is released this
number stops being free to move — after that, raising it means waiting for a
population to turn over rather than deciding that it has.

Both it and the deployed sha are reported by `/healthz` and in the startup log.
They are unauthenticated, which was a choice: the question "what is running on
the box" is one worth being able to ask by curl from a machine that is not this
one, at the moment a deploy is being doubted, and a short sha of a private
repository is an opaque seven characters to anybody who does not already have
the repository.

---

## AGENTS.md splits by subject, not by age

2026-08-15, the same day it was cut from 728 lines to 617 by moving history
out. Adding the branch conventions put it back at exactly 650, its own limit,
which made the next question unavoidable: what happens when what is left is all
guidance rather than narrative, and there is nothing further to move to
`DECISIONS.md`?

The earlier trims moved things out **by age** — a deploy stops being the most
recent one, so it goes to the history. That works until the file is nothing but
standing guidance, and then it stops: the traps are the whole point of the file,
and shaving them is how a document becomes useless while still being read.

So the second axis is **who needs it**. `planning/RELEASING.md` is everything
only somebody producing an iOS build needs — `app.json`'s settings and their
reasons, the icon that is rejected at upload for carrying an alpha channel,
`prebuild --clean` dropping `DEVELOPMENT_TEAM`, the state of the first
submission. 115 lines, moved verbatim, taking the file to 546. Most sessions
touch the server, the reducer or the app's behaviour and never make a release,
and were paying for all of it before anybody typed anything.

**What stayed is the test that makes this work.** `APNS_ENV` reads like release
material and is not: it costs an afternoon to somebody testing push against a
locally built app, who has no reason to open a document about releasing. Same
for the three artifacts that disagree about entitlements. The seam is not the
subject a section appears to belong to — it is whether a class of work that
never opens the other document can still be bitten by what moved.

The pointer left behind names the traps rather than the topic. A section saying
"see RELEASING.md for release things" is one nobody follows; one saying the icon
is rejected at upload if it carries an alpha channel is one somebody follows
before they generate an icon.

---

## Starting a channel asks nobody anything

Shipped 2026-08-15, from FEATURES.md. Home's way into a channel was a mode: a
button reading *Start a channel with several people*, which armed a selection
over the contact list, turned every row into a checkbox, and waited for a
*Start with 3* to be pressed. It was a form to fill in before anything could
happen. Now there is one primary button reading **Start a channel**, it makes a
channel with nobody in it but you, walks you in, and the invitations are made
from inside — where the roster is already on screen and adding somebody is one
tap whether it is the first or the third.

**The old button was hidden from exactly the people who needed it.** It only
appeared once you had two accepted contacts, that being the least number a
multi-select is worth. So somebody with one contact, or none, had no way to open
an empty channel at all — the affordance for *I would like to be somewhere*
required already knowing who you wanted there. The tap-a-contact path is
untouched and still starts a 1:1 directly; what went is the mode, not the
shortcut.

**Almost nothing had to be built, which is the argument that this shape was
already the model's.** A channel of one was a legal `ChannelState` in every
respect but the constructor's guard: `canDeleteChannel` is the last member's
and `canLeaveChannel` is not, `describeChannel([])` already returns *Just you*,
`rejoinableFor` deliberately keeps a channel everyone else has walked out of,
and `InviteList` already explains that an unnamed channel does not widen. The
changes are three lines of permission — `createChannel` dropping the
at-least-one-invitee throw, `create` dropping the empty-roster refusal, and
`POST /channels` reading an absent `contactIds` as nobody — plus deleting the
mode from `HomeView`.

**The empty case is idempotent, and it is the existing rule that makes it so.**
One unnamed channel per set of people, applied to the set of just yourself,
means everybody has exactly one channel that is only them. Tapping the button
twice walks back into it rather than filing a second row, which matters more
here than it does for a pair: a channel of one is cheap to create by accident,
and Home would otherwise fill with rows all reading *Just you* and all
different. This is why the guard is worth keeping in mind when reading `create`
— it is doing two jobs now.

**Inviting from a channel of one moves the conversation rather than widening
it**, exactly as it does from a channel of three, and the channel of one stays
behind. That is not a special case and was not written as one: an unnamed
channel is its people, so asking Bob in means everyone walks to the unnamed
channel that is you and Bob — creating it or finding the one you already have.
Your channel of one is left standing, empty, ready for the next tap. See
`acceptInvitation`.

Two smaller things. The legacy `channels.invitee_id` column is `NOT NULL`, so a
channel with no invitee writes the initiator into it — the same thing `openRun`
already does for a recording made alone, and the column is never read for rows
that carry the `participants` JSON. And `create` now skips the push notify
outright when there is nobody to tell, rather than letting the notifier's own
empty case handle it: that path logs *why* it sent nothing, and would file a
`push skipped` line on every tap of the button.

**The wire change is server-permissive and must be deployed first**, per the
rule in AGENTS.md. An empty `contactIds` was a 400 and is now a create; no
installed build sends one, so nothing that used to work has changed meaning,
but a new client against an old server gets `contactIds is required` on the one
button Home leads with.

---

## `BadDeviceToken` is not a dead address, and pruning on it nearly cost the table

Found and fixed on 2026-08-10, eleven hours after notifications shipped;
written down here on 2026-08-15, which is the point of the entry. It belongs
beside **Notifications, and why the server talks to Apple itself** in
`DECISIONS-2026-08-07-to-2026-08-13.md`, and it is not there because closed
volumes are never edited. Until now it existed only in the message of commit
`2d0821c` and in two comments in `push.ts` — which is exactly the failure this
file's preamble describes: a commit message is read once, by somebody already
looking at the diff.

The trigger was ordinary. A notification had not arrived, and there was no way
to find out why, because **the code said nothing either way**. Two separate
silences, and the second is much worse than the first.

**The notifier sent nothing and did not say so.** There are two ways to send
nothing — every recipient is already in the app and is being told over the
socket, and nobody has a registered device — and both produce the same visible
result as a send that failed outright: no notification, no log line, nothing to
distinguish them. `app.ts` now logs `push skipped` with which of the two kinds
of nothing it was, and `push sent` with the count and every non-200 carrying
Apple's own reason string. Tokens are truncated to eight characters in the log:
the whole address is in the database if it is ever wanted, and a log line is
not the place to accumulate every address the server knows.

**The pusher swallowed Apple's refusals.** `send` returned only the tokens it
judged dead and caught everything else, so APNs could refuse every single
notification and leave no trace anywhere. It returns a `PushResult` per address
now — status, Apple's reason, the transport error if the request never
completed, and whether the row should be forgotten.

**Then the serious one: `400 BadDeviceToken` was being treated as a dead
address and pruned.** It reads like it should be. It is not. Apple answers it
both for a token that never existed *and* for a perfectly good token presented
to the wrong environment — verified against the real service, where production
accepted a token that sandbox had refused with exactly this. So one wrong
`APNS_ENV` would have walked the whole `device_tokens` table and forgotten it,
and every user would have had to relaunch the app before they could be reached
again. The misconfiguration is a one-line fix; the data it destroys is not
recoverable from anywhere on this side.

**Only `410 Unregistered` prunes now**, that being the one unambiguous way
Apple says the install is gone. The rule is `isDeadToken`, a named exported
function rather than an inline condition, precisely so it can be tested without
a round trip to Apple — and the test enumerates the refusals that must *not*
prune: 400, 403 (a rejected provider token), 429 (throttling), 500 (an outage),
and 0, meaning nothing was reached at all. Every one of those is about the
sender or the service, never about the address.

The principle is worth stating on its own, because it generalises past push:
**a misconfiguration should cost delivery until it is fixed, not data.** An
error that means two things must be read as the harmless one when the harmful
reading is destructive and irreversible.

This is the `APNS_ENV` trap in AGENTS.md seen from the other side. That entry
warns that crossing the environments gets you a `BadDeviceToken` naming the
token and saying nothing about the cause, so the obvious next move is to go
looking at registration, which is working fine. This is what that same error
was very nearly allowed to *do* while you were looking in the wrong place.

---

## The deploy history

Moved out of AGENTS.md on 2026-08-15, where it had grown nine deploys deep and
was being paid for in every session's context. What a fresh reader needs at the
root is the current state and the traps; the sequence that produced it is this.
Newest first, and it picks up where AGENTS.md leaves off — that file keeps the
most recent deploy, so the first "before that" below refers to the four deploys
of 2026-08-14 described there.

Before that, three times the same day: **voluntary donations**, the fix for
the mistake the first deploy shipped, and then the region filter.

Donations are a **Ko-fi link, external, unlocking nothing** — see **Donations,
by a link out rather than in-app purchase** above for why it is not in-app
purchase. The build is a `donations` table, `server/src/donations.ts`,
`POST /donations/kofi` and `GET /donations`, plus a Support card in
`HomeSettingsView`. Those two shipped as `/support/kofi` and `/support` and
were renamed later — `support` meant money on
one path and help on every other, and `/support` is the path somebody wanting
help will try, which is what App Store Connect's Support URL has to point at.
Nothing in `core/` changed
except one additive type, so the wire is unchanged and build 30 kept working
across all three restarts. **Build 31 is the one that shows the card**, uploaded
to TestFlight the same day. Alongside it went `GET /privacy` and a fixed one-time
code for App Review (`REVIEW_IDENTIFIER` / `REVIEW_CODE`).

**The app ships worldwide and the link is withheld per person.** App Review
Guideline 3.1.1(a) prohibits an external payment link outside the United States
storefront — the *link*, not the app — so shipping US-only would have locked
existing non-US users out of the App Store for nothing. The app reports its
locale and timezone from `Intl`; `server/src/region.ts` decides. **Silence means
hidden, and so does anything ambiguous**, because showing the link to the wrong
storefront is a violation while hiding it from the right one costs a donation.
`accounts.donations_allowed` overrides it either way — null for everyone by
default. That was the third deploy's migration, on the `bio` / `last_seen_at`
pattern.

The second deploy was the one that mattered. **The first stored Ko-fi's
`verification_token` in the `donations.raw` column**, because it stored the
request body verbatim and that body carries the secret authenticating every
future delivery — into the database, into every backup, and into the output of
any query selecting that column, which is how it surfaced. The token was
rotated, the row deleted, the payload is now stored minus that field, and a test
asserts it appears nowhere in the table. The general form is worth carrying:
**a payload that authenticates itself contains a credential, and storing it
verbatim stores the credential.**

Verified against production afterwards: `donations: "ko-fi"` in the startup log,
a bad token answered `401` with nothing written, `/privacy` served as HTML
naming `support@rvanegas.co`, and data untouched at 5 accounts, 24 channels and
12 recordings. A real end-to-end donation is still untested. Note that Ko-fi's
`closeRoom` noise in the log is unrelated and dates to 2026-08-09.

Before that, on 2026-08-13: the two idle timers, and with them the first
`accounts` migration since `bio`. **`accounts.last_seen_at`**, added and left
null — backfilling it from `created_at` would have read as a year idle for
somebody who used the app that morning — so it fills in as people connect. The
wire gained `ContactView.lastSeenAt`, typed optional precisely because an
installed build meets a server without it, and additive besides, so every build
kept working across the restart; build 30 is the one that shows the timers.
Verified against production afterwards: the column present, two accounts already
stamped by clients reconnecting after the restart, data untouched at 7 channels,
12 recordings with 6 already marked, and 5 accounts. No errors in the log.

Before that, on the same day, **the media server moved off LiveKit Cloud onto
this box.** `bin/deploy` was never run — no code
changed — and no build shipped, because the client is told where to connect by
the server and there is no URL in the binary. It was `livekit-server`, a Redis
and the egress recorder installed by the new `bin/provision-livekit`, a second
Caddy site block for `livekit.rvanegas.co`, two firewall rules, and three lines
of `server/.env`. The reasoning is in **The media server is self-hosted, on the
box that was already there**, in DECISIONS-2026-08-07-to-2026-08-13.md; the
numbers and the rebuild path are in MIGRATION.md.

Verified against production afterwards with two phones — join, claim and release
the floor, record, play back into the room — and the recording landed in S3 as
two stems with both egress manifests, timestamps matching `egress_complete` in
the log to the second. Data untouched at 24 channels and 18 recordings, 6 of
them already marked for deletion. Build 28 went on working across it without
being restarted.

Before that, on 2026-08-13, adding `PATCH /recordings/:id`: a name written to
the row every member of the channel reads, guarded by the same reach test that
play, export and delete already ask, so anybody in the channel may rename
anything in it. No schema change — the `name` column has been there since
2026-08-11 — and no change to any existing response, so every installed build
goes on working; build 28 is the one that can ask for it. Verified against
production afterwards: the route answers `401` rather than `404` to an
unauthenticated caller, and the data is untouched at 23 channels and 17
recordings, 6 of them already marked for deletion.

Before that, five times on 2026-08-12. The last added `DELETE /recordings/:id`
— one recording marked for deletion on the same terms as a deleted channel's,
swept a week later by the sweep that already existed. No schema change: the
`deleted_at` column it marks has been there since earlier that day. Verified
against production afterwards: 11 live recordings, 4 already marked, unchanged
by the deploy. Purely additive, so every build keeps working; build 27 is the
one that can ask for it.

Before that, one that narrowed the one-per-set rule to *unnamed* channels and
made an unnamed channel's invitation move the conversation when the invitee
arrives — see **One *unnamed* channel per set of people** in
DECISIONS-2026-08-07-to-2026-08-13.md. No migration: two
fields were added to the state blob, and both default correctly for a channel
that has never moved (`mediaRoom` to the channel id, `invited` to empty), so
existing rows are rewritten on their next change rather than up front. Verified
against production afterwards: 5 live channels revived, 15 recordings, health
green. Wire-additive, so build 23 goes on working; build 25 is the one that
follows a move.

Before that, one that made claiming the floor clear the claimant's self-mute
and refuse to let them set it again until they release — no schema change and
no wire change, so build 23 kept working across it, simply without greying out
its own mute button while it holds the floor.

Before that, twice the same day: recordings moved to the channel they were
made in, with deletion by mark and sweep and playback into the room; then the
branch that answered for recordings whose channel had already ended, once the
four of those were deleted. The first carried a migration — `deleted_at` on
`channels` and `recordings` — verified against production afterwards: 22
channels, 15 recordings, nothing marked.

Before those, twice on 2026-08-11. The second put every channel you belong to
on Home regardless of what the server believes about your presence, and stopped
a bare socket asserting presence. No schema change and no wire change — the
`rejoinable` array simply carries more — so build 19 kept working across it,
showing a channel it is in as both banner and row until build 20 lands. The
restart also cleared the stuck presence that had made a channel invisible;
5 channels came back, `A Priori` among them.

The first, earlier that day, brought the settled recording names and the
channel ordering. Two columns were added to `recordings` —
`participant_names` and `name` — and verified against production afterwards:
22 channels, 11 recordings, both columns present. It was additive to the wire
protocol — two new `RecordingView` fields — so build 16 went on working
against it, ignoring them and labelling recordings the old way.

Before those, twice on 2026-08-10: the channels rework, and later the
empty-channel playback pause and the shared channel-description fallback. That
second one changed no wire format, so build 14 kept working across it.

### The 2026-08-10 deploy broke every installed client, on purpose

The Session → Channel rename changed the wire protocol, and the two ends were
shipped separately because they cannot be shipped together: the server deploys
in a minute and a new iOS build reaches a phone via App Store Connect
processing plus whenever a tester updates. So build 5 stopped working the
instant the server restarted, and stayed broken until build 6 landed.

What broke, concretely — an old client talks and the new server does not answer:

| Build 5 sends | Server now expects |
| --- | --- |
| `watch.session`, `unwatch.session`, `session.action` | `watch.channel`, `unwatch.channel`, `channel.action` |
| `POST /sessions`, `/sessions/:id/media-token`, `/sessions/:id/track` | the same under `/channels` |
| `LEAVE`, `END` | `STEP_OUT`, `LEAVE_CHANNEL` |

Accepted knowingly because the only installs were the author's. **It is not a
choice that survives having users.** The way to avoid it next time is to teach
the server the old names as aliases, deploy that first, ship the client, and
remove the aliases a release later — the ordinary two-step, which costs a
compatibility layer to carry and then delete.

The database migration in that deploy renamed `sessions` to `channels` in place
and repointed the `recordings` foreign key. Verified against production
afterwards: 15 channels, 2 recordings, both still joining, ids unchanged.

---

## The Android adaptive icon, which is preparation rather than shipping

Android is not built or shipped here — there is no `android/`, and
`bin/release-ios` is the only release path. The artwork is prepared in three
layers anyway, and the reasoning for each is below. Moved out of AGENTS.md on
2026-08-15: reasoning about unshipped work is this file's job.

The artwork is the **background** layer, full-bleed. It survives any launcher
mask — circle, squircle, rounded square — because a diagonal through the
centre stays a diagonal through the centre; having no focal mark is what
makes it crop-proof rather than what puts it at risk.

The **foreground** is a fully transparent 1024×1024 PNG. Expo requires the
key, and the foreground is the layer launchers shift for parallax, so
full-bleed art there would slide and expose an edge. The artwork belongs
underneath it.

The **monochrome** layer — the themed icon, Android 13+ — is the one that
took a decision rather than a command. It has to be a single-colour shape on
transparency, and a two-colour split has no silhouette, so the shape is the
orange triangle: the upper-left half, the one that leads in the artwork. Black
on transparent; the system tints it, and only the alpha channel is read.

That silhouette is its own master, `the-floor-icon-mono.svg`, beside the
full one — a second file rather than a `magick` incantation that crops the
first, because which half it is is a decision and belongs somewhere legible.

    magick -background none -size 4096x4096 the-floor-icon-mono.svg -resize 1024x1024 \
      -type TrueColorAlpha -colorspace sRGB PNG32:app/assets/android-icon-monochrome.png

`adaptiveIcon.backgroundColor` went from `#14162B` to `#5B6478`, the artwork's
grey. The background *image* covers it, so it is only what shows if that ever
fails to load — but a fallback in a colour from nowhere in the design was
worse than one that matches.
