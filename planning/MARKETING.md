# How this app gets to people

**Standing statement of the acquisition argument**, and a third sibling to
PROPOSITION.md and LISTING.md. The proposition holds the argument about what
the app is *for*; the listing and DESCRIPTION.md hold the copy; this file holds
the argument about how a stranger comes to be a user, and what may and may not
be spent to make that happen.

**It is standing rather than temporary.** Not a campaign and not a launch
checklist — those are downstream of it and are named in § *The sequence* at
the end. What is here is the reasoning that decides whether a given tactic is
on the thesis, because almost every ordinary growth tactic in this category is
not, and the reason is always the same one.

**Read it before spending money, before adding any measurement, and before
writing copy aimed at anybody who has not already been recommended this app.**
Its § *What marketing may not do* is the half that will be argued with, and it
is the half derived from PROPOSITION.md § *What this proposition forbids*
rather than invented here.

## Contents

- **The unit of acquisition is a group** — the one claim everything else is a
  consequence of.
- **What is already built** — the assets inventory, the one most apps in
  this category have to buy, and the getting-started cohort, which is
  scaffolding rather than an asset and is off as this is written.
- **Who else is on the field** — the competitors, sorted by which claim each
  contests, and the two things that changes for the copy.
- **The funnel is upside down** — the guest page and the invite page are the
  top of it; the listing is the middle.
- **The funnel, level by level** — the fourteen levels, what each one loses
  people to, and which of them are even visible today. **Level 4 is the
  cohort's, and only placed accounts are eligible for it.**
- **Measurement, which is now a choice** — what `bin/growth` already answers,
  what is still unmeasured, what first-party analytics can buy, what
  third-party would cost, and the three reports a cohort contaminates.
  **Two of the three gaps were closed on 2026-09-15** and the cohort split is
  done; the section is marked where it describes what was true before that.
- **Paid, since it is on the table** — what money can and cannot buy here,
  ranked, with the kill rule, the Apple Ads keyword list and what a tap costs.
- **Organic, ranked** — where the effort actually goes.
- **The email list, which is consent collected and not yet spent** — the
  permission the app already collects, what the checkbox's own words let it
  carry, and the unsubscribe link that has to ship in the same commit as
  whatever first sends.
- **The tagline, and the slot it does not go in** — *Conversation
  Uninterrupted*, why it is not the App Store subtitle, and which surfaces it
  is for.
- **What marketing may not do** — the constraints, applied to this file's
  subject rather than to the product's, including the one bounded exception to
  *no strangers* and the rule that it may not be advertised.
- **The sequence** — what to do first, and what each step is waiting on.

---

## The unit of acquisition is a group

**Value accrues per group, not per install**, which PROPOSITION.md § *Growth*
establishes and this file takes as given. A single user of this app has
nothing: the proposition requires three to five *specific* people they already
know, and no amount of product quality substitutes for their presence.

Everything below is a consequence of that sentence, so it is worth stating the
consequences plainly before any of them is argued:

- **An install is not a conversion.** The conversion is a group having its
  second conversation. Counting installs measures the raw material rather than
  the product.
- **Cost-per-install buys the wrong thing at any price.** It buys individuals
  with nobody to talk to, and nearly all of that spend evaporates — not because
  the targeting is poor but because the unit is wrong. A campaign that
  delivered installs at a tenth of the going rate would still mostly evaporate.
- **So the creative's job is recruitment, not persuasion.** Every ad, every
  post and every page has to leave the reader thinking of three named people,
  not thinking well of the app. A reader who is impressed and brings nobody is
  a failure that looks like a success in every dashboard that could be built.
- **Density beats count, and it is not close.** One whole book club, band,
  family or standing four-a-side is worth more than fifty scattered downloads,
  because fifty scattered downloads are worth approximately nothing.

**None of that is changed by the getting-started cohort** described below. A
cohort gives an arrival somewhere to be, which is not the same as giving them
their three people, and this file's unit is unmoved: the conversion is still a
group having its second conversation, and a cohort is still not that group.
What it changes is the *arithmetic* of a cold install, and § *Paid* is where
that is argued.

**The useful test for any proposal is: what does this do for the second and
third person?** A tactic that reaches one person well and gives them no reason
or means to bring the others is off the thesis however cheap it is.

## What is already built

Most apps in this category have to buy their way past a cold start. This one
has the primitives in the product already, and two of them are unusual enough
to be worth naming as marketing assets rather than as features.

- **The invite link, `/i/<username>/<pin>`, shipped in 1.4.0.** This is the
  durable, person-owned link PROPOSITION.md § *Growth* called for as
  *direction* — and the direction is now shipped, which changes the plan from
  the one that document imagined. It seats exactly one person, lasts thirty
  days, and **implicitly makes the pair contacts**, so the new account is not
  alone the moment it exists. `server/src/invite.ts` is the page it opens, and
  it **inverts the landing page's call to action deliberately** — the browser
  first, the App Store second, because a trip through the App Store loses the
  address and the relationship with it. That inversion is the single most
  valuable growth decision in the codebase and it is already made.
- **The guest link**, which delivers the experience before the signup — a URL
  that survives being pasted into the thread where the coordination is already
  happening, costing the recipient no install and no account. **Its limit is
  that it dies with the room**: it is live only while people are actually
  there, so it converts in the moment or not at all and cannot be seeded in
  advance. Marketing cannot lean on it; it is a conversion surface, not a
  distribution one.
- **The landing page at `/`**, `server/src/landing.ts`, server-rendered rather
  than the web bundle.
- **The store listing**, argued at length in LISTING.md and largely live as of
  1.4.0.
- **The web app at `/open`**, which means "try it" does not require an install
  on a desktop.

### The cohort, which is scaffolding and not an asset

*Early Cohorts* —
`decisions/2026-09-15-a-new-account-does-not-arrive-alone.md` is the argument
and the ending. An account that arrives with nobody here is placed into one
channel with up to three others who arrived around the same time and a
**cohort host**. It is listed here because it changes the cold-start arithmetic
this whole file is about — it is the whole of § *The funnel*'s level 4, the only
level above the group half at which somebody hears the product work — and it is
listed *separately* from the assets above because **it is temporary by
construction and the rest are not.** Nothing in the plan below may be built on
its continuing to exist.

**It is off as this is written.** `COHORT_HOST_IDENTIFIERS` is empty,
`bin/cohorts` reports none, and it may not be switched on until a build drawing
the explanatory card is downloadable — that is builds 206 and later, against a
`released` of 127. **So it is not yet true of anybody, and § *The sequence*
orders the switch rather than assuming it.**

**The placement waits for notifications, which narrows who it reaches and is
worth knowing before counting on it.** Since 2026-09-15 a seat goes only to
somebody who has turned notifications on, and it is spent at the moment they
do rather than at signup —
`decisions/2026-09-15-a-cohort-seat-goes-to-somebody-who-can-be-told.md`. The
reasoning is the funnel's own: the channel's whole offer is that somebody may
speak into it later, and a member who cannot be told that happened is a seat
that can never answer. **For the arithmetic here it cuts both ways.** Fewer
arrivals are placed, so the cohort seeds more slowly than an unconditional
placement would; but every account that *is* placed is reachable, which is the
precondition for level 4 meaning anything at all. A room of five where two
phones are silent was never going to produce the thing level 4 counts.

**The reason it does not relax *no strangers* is structural, not a promise.**
Every other channel in the application grows by invitation, and the server
refuses an invitation to anybody who is not already an accepted contact of the
person making it — `create` and INVITE both, `channels.ts`. A cohort is made by
the server instead, so **no pair in one is a contact, and no pair became one
involuntarily**: the contact graph is untouched by placement, and it is the
contact graph rather than the roster that everything reachable is gated on. The
consequence worth stating plainly, because it is the objection a reader will
arrive with: **nobody in a cohort can ping you.** The ping is refused between
non-contacts like everything else, so being placed with four people does not
hand any of them the permission the product runs on. What they can do is talk
in one room, which somebody has to open, and which anybody can leave.

### Imagery, which is the half-closed gap in the inventory

Two screenshots serve the landing page — `server/public/home.webp` and
`floor.webp`, 52 KB the pair — chosen because they are the two where the
interface itself carries an argument: the channel list showing presence and
recency, and a roster showing *has the floor* as a state on a person.

**The half that is still open is everything image-first.** Product Hunt,
Instagram and every paid social surface need assets that are composed rather
than captured, and there are none. **The store captures are in the
repository**, in `assets/store/`, at full resolution and excluded from
`bin/deploy` — a desktop folder is not a record for something a submission
depends on. The two the landing page uses are derived from them.

**The central claim was thought unphotographable, and it turned out not to
be.** A phone that does not ring is a non-event, so no screenshot of the app
can carry it — but a *lock screen* can, by comparison: The Floor's notification
sitting in the ordinary queue, the same shape as an activity reminder beneath
it. That capture is the third image on the page.

**What it cost is the lesson worth keeping.** Five attempts, and every
difference between them was about *time* rather than composition. The one that
works shows a ping at `now` with the step-in six minutes behind it — inside
`WAITING_WINDOW_MS`, so the request is still answerable. Attempts at thirty
minutes showed a lapsed intention and read as a backlog, which is the opposite
claim. **A marketing image that contradicts the product's own clock is worse
than no image**, and nothing about that is visible without knowing the
constant.

The same principle carries to video, and is why the format there is a
comparison rather than a demo — § *The sequence* item 8.

## Who else is on the field

LAUNCH.md names three competitors and concedes the fight in the right direction
— *this app loses a feature comparison to Discord, Zello and the platform
walkie-talkies, all of which have more of everything; it wins the argument
about what the ring is for.* That judgement stands. What follows is who is
actually on the field now, which includes a company that ran the same diagnosis
this one did.

**The useful sort is not by feature but by which claim each contests**, since
the app makes three and they are defended separately.

**1. The room you drop into — contesting *nothing rings*.**

- **Discord**, still the nearest true thing said, and LAUNCH.md § *The
  objections* already holds the answer: the difference is not features but who
  is in it. A server is a place you join; this has no directory, no search and
  no strangers, everybody agreed twice, and the floor is enforced on the audio
  because there are no moderators by design.
- **WhatsApp group voice chats**, which are not in LAUNCH.md and are the entry
  worth the most attention. WhatsApp shipped join-when-you-like group voice —
  no ring — into a surface that already contains every contact the target
  reader has. It concedes the exact affordance the thesis is built on, for
  free, inside the network effect this app has to build by hand. **This is the
  competitor that matters**, and the honest answer to it is the contact graph
  and the floor, not the absence of a ring.
- **Telegram voice chats**, the same shape with less reach here.

**2. Voice with a waiting state — contesting *voice has no later*.**

- **Clubhouse**, which did not die and is the instructive case. After cutting
  past half its staff it **pivoted its core product from live drop-in rooms to
  asynchronous voice messaging** — a company arriving at PROPOSITION.md §
  *What the ring actually buys* from the opposite end of the same problem.
- **Airchat**, threaded asynchronous voice posts with automatic transcription,
  still running. Its transcription bet is the one the recordings half of this
  app makes. It is a public network rather than a closed graph, so it contests
  the thesis at the second scale and not at the first.
- **Marco Polo**, asynchronous messages to people you actually know. The most
  commercially proven version of *voice with a later*, and the answer a great
  many ordinary people have already given to this problem.

**3. The floor mechanic — contesting *who speaks*.** Zello, Voxer, the Apple
Watch walkie-talkie. LAUNCH.md objection 2 remains correct and remains the
answer: those are half-duplex by design, and the floor here is a claim for
finishing a thought inside an open conversation rather than the standing mode.

### The two things this changes for the copy

**Nobody occupies the square, and that is the positioning.** The combination —
mutual-consent contact graph, no ring by construction, open conversation with a
server-enforced floor — has no direct competitor. Discord has the rooms without
the graph, Marco Polo the graph without synchrony, Zello a floor that is the
wrong shape. The copy should never assert this, because asserting it invites
the grid; it should be *true*, so that a reader who goes looking finds nothing
closer.

**But the incumbent is a default, not a company.** The thing most readers have
to be argued out of is *just send a voice note* or *just text them*.
PROPOSITION.md already knows this — *texting won on intrusiveness, not on
convenience* — but files it as evidence for the thesis rather than as the
competitor. It is both, and it is the one holding the market. **Copy that
answers only Discord and Zello is answering the objections of people who
already agree**, which is a smaller audience than it feels like from inside the
argument.

**Nothing here changes the naming rule.** LISTING.md and DESCRIPTION.md both
forbid naming any competitor in store copy — a 4.1 exposure, and positioning
rather than describing — and § *What marketing may not do* forbids positioning
against messengers at all. Naming one in a comment thread where somebody else
raised it stays fine and expected. The place this section is spent is the
objections, not the listing.

**LAUNCH.md has an outstanding edit.** Its objections section predates WhatsApp
group voice being ubiquitous and predates Clubhouse's pivot, and has no
paragraph for either. That is standing launch copy and changing it is a
separate decision from recording this.

**These two are perishable and were last checked on 2026-09-14**, by search
rather than from a product page; a session acting on either after some months
should check again rather than trust this paragraph.

## The funnel is upside down

**The listing is not the top of the funnel; the invite page and the guest page
are.** A stranger reading a listing has to be persuaded from cold. Somebody
opening an invite link has been asked by name, by somebody they know, and
somebody opening a guest link is already hearing their friends.

This is not a preference about tone, it is a claim about where the work pays:

| Surface | Who arrives | What it has to do |
| --- | --- | --- |
| Invite page `/i/…` | Asked by name, by a contact | Get them in, in the browser, without losing the relationship to an App Store detour |
| Guest page | Already hearing friends, live | Nothing but stay out of the way, then offer contact |
| Landing `/` | Curious, cold, possibly a recommender's second stop | Say what it is truthfully in two sentences, and be quotable |
| Store listing | Cold, or checking out a recommendation | Be **repeatable by a recommender** rather than complete |

**So copy is optimised for repeatability rather than for conversion**, and the
sentence the whole apparatus is tuned to produce is the one PROPOSITION.md
predicts will actually travel: *"It's a group chat, but voice, and it never
rings you."* Every surface should leave a reader able to say that sentence
without having read it verbatim.

**The corollary is that the recommender is the customer.** The person worth
the most effort is not the one who installs, it is the one who installs and
then sends four invite links. Everything in the product that makes that easier
— the username, Copy Invite Link, the link surviving a paste into a thread —
is growth work, and is more valuable than any external channel on this list.

## The funnel, level by level

**Fourteen levels, and the shape of the thing is not a funnel but a loop** —
the bottom returns to the top, and that return is the only reason any of this
works at scale. What follows is the standing definition; § *Measurement* says
which are visible today and what it would take to see the rest.

**Older documents cite these levels one lower, and their citations are off by
one.** Level 4, *heard it work*, belongs to the getting-started cohort and sits
above the group half, so what some files call level 4 is 5 here, the conversion
some call 10 is **11**, and the recommendation some call 12 is **13**. Anything
in LAUNCH.md, a decision, a commit message or a comment in `bin/` is on the old
numbering unless it has been corrected; the archive is not corrected.

**It forks at level 5.** Above that the unit is a person and the levels are the
ordinary ones any app has. Below it the unit is a *group*, and every level is
about two or more people at once — which is why an install-shaped funnel
mismeasures this product so badly. Half of the levels below cannot be
attributed to an individual at all.

### The personal half

| # | Level | Lost here because |
| --- | --- | --- |
| 0 | **Impression** — an ad, a post, a search result, or a friend's sentence | It is a category nobody searches for; the complaint has no name |
| 1 | **Page view** — landing `/`, invite page, guest page, or the store product page | Copy that describes a different app, or no imagery to look at |
| 2 | **Install or account** | The store page did not make the thesis land, or the App Store detour lost the invitation |
| 3 | **Notification permission granted** | Asked at the worst moment in the worst climate — PROPOSITION.md says the central loop does not close without it |
| 4 | **Heard it work** — audio exchanged in a getting-started cohort. **Only for accounts placed in one**, which since 2026-09-15 means only accounts that reached level 3; an invited arrival skips it, being past level 5 already | The room stayed silent: nobody opened it, or nobody answered when they did |

**Level 4 is the cohort's, and it is the last level anybody can reach alone.**
It belongs in the personal half because the unit is still one person and no
relationship exists yet — which is exactly why it sits above the fork rather
than among the group levels.

**3 now gates 4, which it did not when this table was first drawn.** The two
levels sat in this order because that is the order they tended to happen in;
since 2026-09-15 the placement is *made* on the permission being granted, so
nobody reaches 4 without 3 and the adjacency is a mechanism rather than a
coincidence. Two consequences for reading the numbers. A level 3 that falls
takes level 4 down with it a beat later, and the second drop is not a separate
problem to go and solve. And the 3 → 4 conversion is now the cleanest
measurement in the personal half: everybody in the denominator is reachable by
construction, so a room that stays silent is telling you something about the
room rather than about who could hear it.

**What it is worth is that it is the only level below 5 that is about the
product rather than about the store.** Levels 0 through 3 are impression, page,
install, permission — none of which is the app doing the thing it is for. An
arrival who has heard a voice come out of this app has evidence for the ask at
level 5 that no screenshot supplies. **It is also the one step where the app
can help itself**, since the host is a person who can answer, and a cohort
nobody opens fails here rather than later.

**It is not a promotion and nothing below inherits it.** Reaching 4 says
somebody has heard the product work; it says nothing about their having anyone
to use it with, which is what every level from 5 down is about.

**It is not on everybody's path, and this is the part that will be misread.**
Only an account that was *placed* in a cohort can reach it — which is somebody
who arrived with nobody, while the hosts are set. **An invited arrival never
reaches 4 and has lost nothing**, because the invite link made them a contact of
the person who sent it before they had an account: they are past level 5
already, which is the thing level 4 exists to make reachable. **So the funnel
forks twice, and the first fork is above the group half.** One path runs
0–1–2–3–5 and is what a recommendation looks like; the other runs 0–1–2–3–4–5
and is what a cold arrival looks like while this feature is on, with 4 the only
thing standing between that arrival and an empty app.

**Which fixes the denominator, and it is not *all arrivals*.** The share
reaching 4 is over *placed* accounts — `bin/cohorts` counts exactly those — and
anybody who compares it against every signup will read the invited half as a
failure at a level they were never eligible for and were better off skipping.
**A falling level 4 share is only bad news if placements are flat**; if it is
falling because fewer arrivals need placing, that is § *The ending has no
number* arriving, which is the outcome this whole feature is built to work
itself out of.

**And it is the one level that can be deleted.** Unset the hosts and nobody can
reach 4 again; the level stays in this table describing something that used to
happen, the way any level would if the surface it measures went away. **It does
not renumber back** — the numbers below it are cited in too many places to move
twice, and a gap that has to be explained once is cheaper than a shift
everything downstream has to be re-read for.

**Level 3 is the unusual one and it is load-bearing.** In almost every app it
is a nice-to-have measured out of habit. Here a decline silently breaks the
product — an invitation nobody was shown is an invitation nobody declined —
and the failure is attributed to the app rather than to the setting. **If only
one new number is ever instrumented, it is this one**, and ROADMAP item 1 is
the work it would measure.

### The group half

| # | Level | Lost here because |
| --- | --- | --- |
| 5 | **First mutual contact** | Nobody to ask, or the ask is awkward to make |
| 6 | **Three mutual contacts** — the threshold the proposition names | Recruiting the second and third person is a different, harder act than recruiting the first |
| 7 | **A channel with three or more members, all of them the user's own contacts** | The reason to make one is not obvious from an empty app |
| 8 | **First conversation** — two people present, audio exchanged, in such a channel | The empty room; nobody was there when they looked |
| 9 | **First ping sent** | The answer to the empty room is not discoverable at the moment it is needed |
| 10 | **Ping answered — somebody arrives** | The habit imported from telephony: ping, then put the phone out of reach, where a banner cannot fetch you |
| 11 | **Second conversation, on a separate day** | **This is the conversion.** Below it the group exists; above it, it does not |
| 12 | **Habit** — conversation in two of the last four weeks | Nothing here will ever nag them back, by design |
| 13 | **Recommendation** — an invite link sent, and redeemed | Sending one requires a username and a reason, and nothing rewards it |

**Level 11 is the conversion and everything above it is raw material.** A
dashboard that stops at level 2 is measuring the top third of a funnel whose
economics live in the bottom third.

**A getting-started cohort counts at none of the levels in this table, and the
wording above is written to say so.** Levels 7 through 12 are about a channel
of the user's *own contacts*, and a cohort is the one channel in the
application that is nobody's: the server made it, no pair in it is a contact,
and nobody in it can ping anybody. **So talking in a cohort is not a first
conversation and two cohort days are not the conversion** — counting them would
credit the app for a room nobody chose to be in, and would quietly report the
growth hack as the growth.

**Its level is 4, in the personal half above**, which is where an act somebody
can complete alone belongs. The distinction is the whole of it: level 4 says the
product has been *heard to work*, and every level from 5 down says somebody has
people to work it with. **An account placed the hour it signs up can reach 4
that afternoon and is no closer to level 5 than it was**, because the four
people in the room with it are not candidates for it — nobody in this
application becomes a contact by having been put somewhere.

**This is a definition, not a discount.** The feature is worth having precisely
because it does something the group levels do not measure; a funnel that
absorbed it would stop being able to tell whether it worked. § *Cohorts
contaminate three of those four* is the same rule stated against the reports
that would otherwise break it.

### The three levels worth all the attention

Named separately because the levels are not equally leaky, and the leaks are
not where an install-shaped intuition puts them.

- **6, the third contact.** Levels 5 and 6 look like the same act repeated and
  are not. The first contact is somebody the user was already talking to about
  the app; the second and third require going and asking people who have heard
  nothing. This is where density is won or lost, and it is the level the
  recommender's tooling — username, Copy Invite Link, the link surviving a
  paste — exists to serve.
- **10, the ping answered.** This is the central loop closing, and the
  proposition already documents the failure mode as *observed, and not a bug in
  anything*: somebody pings and then puts the phone away as though a call were
  coming. It is the leading indicator for 11, and it is the one level where the
  fix is copy rather than product — ROADMAP item 2 is exactly this.
- **13, the recommendation**, because it is the return leg. Levels 0 through 12
  are a cost; 13 is the only one that pays for another pass through 0. **An app
  with a strong 13 does not need most of this file.**

### What the shape implies

**Paid spending enters at level 0 and has to survive thirteen levels to be
worth anything**, which is the quantitative version of the argument that CPI
evaporates. A referral enters at level 1 *already past level 5* — the invite
link makes the pair contacts outright — which is the quantitative version of
the claim that the invite page, not the listing, is the top of the funnel.

**And a cold install enters at 4 rather than at 5, while cohorts are on.** A
placement puts somebody in a room of five and advances them no distance into the
group half: no contact made, nobody they can ping, not one of levels 5 through
12 reached. What it buys is the level above — **the app can be heard working
before anybody has been asked for anything**, which is the one thing an empty
install could never offer and the only reason to buy a cold install at all.

**So the cohort's job is to make level 5 askable, not to skip it.** Every
other arrival faces *first mutual contact* from an app they have never seen
working; this one faces it having heard what the app is for. **Nothing is
ticked off on their behalf** — the four people in the room are not candidates
for level 5, since nobody here becomes a contact by having been put somewhere.

**And the bet is a long one, because 4 is where it pays.** A cohort that talks
happily for a month and produces no contact of the user's own has produced
nothing this file counts, and that is the right verdict rather than a harsh one:
the room was somebody else's, the server made it, and it ends when the hosts are
unset. **Nothing predicts the 4-to-5 rate and nothing measures it yet** — it is
the number the whole hack stands or falls on, and it is a level 5 number, not a
level 7 one.

**And a guest link enters at level 8.** Somebody opening one is hearing
friends before they have an account, which is why the proposition calls it
better than most viral primitives: it delivers the experience before the
signup and skips the six levels that lose the most people.

## Measurement, which is now a choice

Analytics is open, and so is amending the privacy policy accordingly. What
follows is the cost of each option rather than a refusal.

**The starting position.** There is no analytics in this application — not
reduced, none. No third-party SDK, no event pipeline, no attribution.
`server/src/usage.ts` is instrumentation rather than a feature: it counts the
minutes and bytes the box carried, nothing in the code reads its tables, and
`bin/usage` runs the queries from outside. `/privacy` states publicly that
there is no advertising and no third-party analytics, and the listing's closing
paragraph rests on that sentence.

**What is being spent if that changes.** Not privacy in the abstract — a
specific claim, made publicly, to an audience selected for caring about it.
LISTING.md argues that habitually declining notifications from a new app *is a
rational habit* and that the user this app is for is the one who learned that
lesson well. That user reads `/privacy`. So the question is not whether
analytics is acceptable; it is **which kind is worth the sentence it costs.**

### The line worth drawing: first-party yes, third-party no

**Recommended, and it gets nearly all of the value for nearly none of the
cost.**

- **First-party, server-side.** The server already sees every event in the
  funnel below level 3 — contacts forming, channels created, presence, pings
  sent and answered, invites redeemed. Levels 5 through 13 are entirely
  derivable from tables that exist or from small additions to them. **No SDK,
  no client code, no data leaving the box**, and the privacy page changes from
  *there is no third-party analytics* to *there is no third-party analytics,
  and here is what this server counts* — which is a **stronger** sentence than
  the one it replaces, not a weaker one, because it is specific and checkable.
- **First-party, client-side, narrowly.** Levels 0 through 3 are the ones the
  server cannot see on its own. The one genuinely worth adding is **level 3,
  the notification permission outcome** — a single field on an existing
  request, not a pipeline. Page views on `/` and `/i/…` are already server
  requests and need nothing but counting them.
- **Third-party SDKs and ad-network pixels — still no.** This is where the
  sentence on `/privacy` actually gets spent, and it buys cross-network
  attribution that the ranked paid plan below barely uses. Apple Search Ads,
  the one paid channel recommended first, carries its own attribution inside
  Apple's boundary and needs nothing installed. **Take the 90% that costs
  nothing before spending the claim on the last 10%.**

*If the decision goes the other way* and a third-party SDK is wanted anyway,
the constraint that survives is this: **it may not carry conversation content,
contact graphs, or channel names off the box**, and `/privacy` has to say
plainly what leaves and to whom, in the register the rest of that page is
written in. Amending the page is not optional — it is a live public claim and
the listing links to it.

### What can be counted today, with no change at all

1. **App Store Connect's own reporting** — impressions, product page views,
   installs, and *source type*, which separates App Store Search from Web
   Referrer from App Referrer. Apple's measurement of Apple's surface, requires
   nothing added to the app, and covers levels 0 through 2.
2. **Apple Search Ads attribution**, inside the same boundary.
3. **Server-side facts already in SQLite** — accounts, mutual pairs, channels,
   membership, presence and the usage tables. Most of levels 5 through 12 are
   already there, unqueried.
4. **Invite pin redemptions**, which are level 13 exactly, recorded because the
   feature needs them to be.

### What `bin/growth` actually does, which is the referral half

`bin/growth` is 33 KB of carefully argued shell. It answers *where the people
here came from*, on two graphs that deliberately do not have to agree:

- **The invitation forest.** Every account has at most one inviter, written
  once and never moved, so depth in that forest classifies everybody:
  **alone** (depth 0), **first circle** (depth 1, invited by a root) and
  **onward** (depth 2+, invited by somebody who was themselves invited).
  **The third class is the one that matters** — its own header says it: *first
  circle can be bought with effort, onward cannot.*
- **The islands**, connected components of the accepted-contacts graph. Not
  the forest: somebody can be invited, arrive, and accept no contact at all,
  and two people who each arrived alone can end up on one island. `roots_on_it`
  is written as a premise being tested rather than a fact, and on this box it
  already fails — which is the network working.

Seven reports: `classes`, `weeks`, `months`, `depth`, `roots`, `islands`,
`defects`. Read-only, run from outside the application, exactly the discipline
`usage.ts` argues for. **It serves level 13 of § *The funnel* completely, and
levels 5 and 6 obliquely** — islands are a better answer than a
pairs-per-account distribution.

**And it states its own limits**, which are worth repeating because they bound
every claim below: not installs (the box hears about somebody at sign-in, and
nothing joins that to App Store Connect), not guests (no account, no class),
and erased accounts and the two App Review accounts are excluded throughout.

### The group half

`bin/growth` carries four further reports, on the same pattern: the vocabulary
declared once as temp views, each report being the question it asks.

- **`pairs`** — mutual contacts per person as a distribution rather than a
  mean, which is levels 5 and 6. The mean would hide the thing worth knowing:
  an average of four is compatible with half of everybody having none.
- **`channels`** — rooms by how many people are in them, and made per month.
  Level 7, and full history, since channels are not swept.
- **`talking`** — two people in a room together, by week. Levels 8 and 12.
- **`groups`** — rooms used on more than one day. **This is level 11, the
  conversion**, and the reason the other three are there.

**The memory is thirty days and that bounds two of the four.** The only durable
trace of a conversation anywhere in the box is a `pair` span in `usage_spans`,
swept at `USAGE_RETENTION_MS`. So `talking` and `groups` are a window rather
than a history — **a group that meets monthly cannot show two days inside it**
and reads as one that did not convert. Which makes a low number ambiguous and a
high number trustworthy, the right way round for a figure nobody should be able
to talk themselves into.

### Cohorts contaminate three of those four, and the fix is a column

**None of those four reports knows a cohort from a group.** Switch the hosts on
and `channels`, `talking` and `groups` begin counting rooms the server made out
of strangers alongside rooms people built:

- **`groups` is the damage**, because it is level 11 and level 11 is the
  conversion. A cohort chatting on two separate days scores exactly as a book
  club does, and § *The unit of acquisition is a group* says it is not one —
  the proposition's group is three to five *specific people already known*. A
  cohort is by definition none of that.
- **The host is in every cohort**, so that contamination is not evenly spread;
  it accumulates on one account's conversations.
- **`pairs` is unaffected**, since placement makes no contacts. That is the
  same structural fact as § *The cohort*: the contact graph does not hear about
  any of this.

**So the reports need `channels.cohort` split out before a single number from
them is read against a campaign** — and *split*, not deleted, because the funnel
has a level that wants exactly the discarded half. Two rows rather than one:
the funnel's own rows, which count channels of the user's contacts and are the
only figures § *The funnel* is defined over; and the cohort rows, which are
level 4 and are worth their own reading. An exclusion would throw away the
evidence for the step this file has added.

**Done on 2026-09-15**, on those terms: all three reports read
`channels.cohort`, the funnel's rows exclude cohorts, and each carries a
separate cohort block beneath it. The one in `groups` is labelled as not a
conversion, since that is the whole point of having split it. Doing it before
the campaign rather than after was the reason it was worth doing at all — it
is small now and much worse once a campaign's results are already mixed into
the baseline they would have been measured against.

**Level 4 was already measured when none of the other gaps were.**
`bin/cohorts` reports `entered` per cohort, from `everPresent` — a cohort at
five seats and zero entered is a room nobody opened — so the newest level in
the funnel is the one needing no instrumentation at all. What that script does
not report is what happened next, and next is level 5, which `bin/growth`'s
`pairs` already holds.

**The kill rule survives untouched, and that is not luck.** § *The shape of the
spend* judges a campaign by *first circle* and *onward*, which come from
`invited_by`, and a placement writes no such row. The one number paid spending
is judged on is the one number cohorts cannot inflate.

**The ending has no number, and it should have one.** The decision ends this
feature at *growth that no longer needs seeding* and leaves it there, which is
the right condition and not yet a threshold anybody could act on. The natural
gauge is already built: the **onward** share of arrivals in `bin/growth`'s
`classes` and `weeks`, onward being growth that seeded itself by definition.
**What that share has to reach is Rodrigo's call and is deliberately not
invented here**; what this file asserts is only that the switch deserves a
figure rather than an impression, since the person who turns it off is not
necessarily the person who turned it on.

### What is still not measured, which since 2026-09-15 is guests alone

This section named three gaps and gave a direction. Two of the three were
built that day, on exactly the terms the direction set — first-party,
server-side, no SDK, nothing leaving the box — and the third is not the same
kind of thing. The decision is
`decisions/2026-09-15-the-funnel-is-instrumented-where-it-leaks.md`.

**Levels 9 and 10 — the ping sent, and the ping answered — are the `pings`
report.** A `pings` table, written by `UsageMeter` after `ChannelRegistry` has
decided to send one, holding who asked, who was asked, which channel, when,
whether there were words, and when the target next arrived inside the window
the ping opened. `lastPingedAt` in `channels.ts` is untouched and is still
only the rate limiter — a restart forgives it, which is right for a limit and
was useless as a record. **The words themselves are not stored**, only whether
there were any, which is enough to ask whether a written ping is answered more
often and is the most this could hold and still be describable on `/privacy`.
Swept at `USAGE_RETENTION_MS` with the rest of the meter, so it is a
thirty-day window like `talking` and `groups`, and the number to read is the
rate.

**Level 3 is the `notify` report**, over `accounts.notifications` — the three
answers the app already flattens to, carried as one header on requests that
were already being made and mirrored as `?notify=` on the websocket, exactly
as the build number is. Written only when it changes. **Absent is a fourth
answer and not a fourth state**: every build before this one omits it, and the
web client omits it deliberately, a browser having no such permission to
report. Read the shares against the three that answered while that row is
large.

**And it starts as the whole population, which is the thing to hold on to.**
`build/212` was tagged before this shipped, so the first release that answers
level 3 at all is 213 — the submission was cancelled and rebuilt for exactly
that reason. The server half needs only a deploy, and `pings` starts
recording on one; level 3 is an answer only the app can give. **After 213 the
fourth row empties as installs update, over weeks rather than on the release
day**, so read the three answers against each other and not against everybody
until it is small. A refusal rate taken off a large fourth row is invented,
which is the misreading the fourth answer exists to prevent.

**And guests are invisible throughout, still.** No account, so no contact edge
and no `pair` span: a member and four guests talking for an hour leave nothing
in any report. **This one is structural rather than missing** — it would take
giving a guest an identity that outlives their link, which is a product
decision about what a guest *is* and not a piece of instrumentation. It is not
in the direction above and was never going to be closed by it.

**`/privacy` was amended in the same commit**, as the direction required, and
the page now names three measurements where it named one. The sentence it
spends is still *there is no third-party analytics* — nothing was installed,
nothing leaves the box — which is § *The line worth drawing* holding rather
than being tested.

**Installs are deliberately not at the top of that report.** They are in App
Store Connect, they are level 2 of fourteen, and putting them beside the right
numbers invites somebody to optimise for them.

## Paid, since it is on the table

The proposition argues against spending and the argument is sound as far as it
goes: cost-per-install buys individuals. **But the argument is against a
*mechanism*, not against money**, and there are two places where money buys
something other than a scattered install. Ranked, with the least defensible
last.

**1. Apple Search Ads on the complaint keywords. Start here.** Somebody
searching *no ring*, *intercom*, *walkie talkie*, *push to talk*, *silent
call*, *group voice chat* has the complaint this app is built on and does not
yet know that anything answers it. This is the one paid channel that is fully
on-thesis, for four separate reasons: intent is already present so no
persuasion is being bought; attribution lives inside Apple's boundary so it
needs nothing added to the app; the keyword list is already reasoned about in
LISTING.md § *Keywords*, where `no ring` and `intercom` are named as the bets;
and the spend is bounded by search volume, which for these terms is small —
which is a feature, since it caps the amount that can evaporate. **It is also
the only paid channel that improves the organic asset**, since what it teaches
about which terms convert feeds straight back into the keyword field.

**2. Recruiter-shaped social, targeted at group affinities rather than at
individuals.** The targeting principle follows from the unit: do not target
people who might like a voice app, target people who visibly *already have a
group* and a coordination problem — book clubs, tabletop and D&D groups,
amateur bands and choirs, running and cycling clubs, co-op gaming, families
spread across time zones, long-distance couples, hobby communities with
standing weekly sessions. **The creative rule is that the ad must ask for the
group, not for the install**: it names the three people, not the feature list.
An ad whose call to action is *Download* is asking for the thing that
evaporates; one whose call to action is *Send this to your three* is asking
for the thing that compounds.

**3. Nothing else, for now**, and specifically not broad-interest
cost-per-install campaigns on any network. **Measurement is not the objection**
— first-party counting will show what a campaign delivered as far down as level
11. The objection is the unit: broad CPI buys level-2 events that reliably fail
to reach level 6, and better measurement of a campaign that buys the wrong
thing tells you precisely how much was wasted rather than saving any of it.
Revisit this when § *The funnel* shows a healthy 5 and 12, because a leaky
funnel does not get fixed by putting more in at the top.

### The keyword list, in three tiers

LISTING.md § *Keywords* holds the hundred-character store field; this is the
buy, and the two are different instruments. The store field is a fixed budget
of characters spent once; a campaign is priced per term, so a term that is too
expensive to buy can still be worth a word in the field, and a term that
converts in the campaign is what the field should be rewritten around.

**Tier 1, the complaint terms, and the only tier that is fully on-thesis.**
`intercom app`, `home intercom app`, `phone intercom`, `walkie talkie app`,
`walkie talkie phone`, `push to talk`, `push to talk app`, `ptt app`,
`voice chat app`, `group voice chat`, `voice chat with friends`,
`voice channel app`, `audio room app`, `drop in audio`, `talk without calling`,
`call without ringing`, `no ring call`, `silent call app`,
`hands free talk app`, `always on voice chat`. Exact match, one ad group,
modest caps. Somebody searching these has the complaint and does not know
anything answers it.

**Tier 2, the group affinities**, which follow from § *The unit of acquisition
is a group* rather than from the complaint: `family voice chat`,
`family group call`, `group audio chat`, `small group chat app`,
`long distance voice chat`, `gaming voice chat`, `voice chat for gaming`,
`dnd voice chat`, `band practice app`, `book club app`, `talk to friends app`,
`keep in touch with friends app`. These buy somebody who already has the other
three people, which is the whole test this file applies to everything else.

**Tier 3, the recording half, low bid and harvest only.**
`multitrack voice recorder`, `record conversation app`, `conversation
recorder`, `remote podcast recording`, `record interview app`,
`transcribe conversation`, `voice transcript app`. **Cap these hard**, for two
independent reasons: they are contested by subscription apps with real revenue
per user, so they are the most expensive terms on the list, and they buy an
individual with nobody to talk to, which is the failure `bin/growth` will show
as roots with nothing underneath. They are on the list because the recording
half is genuinely why some people search at all, not because they are expected
to pay.

**The app name is a search-term liability, and it is the cheapest fix here.**
*The Floor* collides with flooring, laminate, tile, carpet and floor plans —
categories with far more ad money in them than this one. Brand defence buys
`the floor uninterrupted` and `the floor voice chat`, never the bare name, and
`flooring`, `floor plan`, `laminate`, `tile`, `carpet` and `hardwood` are
negatives on every campaign. **This said *account-level negatives* until
2026-09-15 and there is no such level** — Apple Ads Advanced holds them at
campaign and ad-group level and nowhere above, so *entered once and inherited*
is not available and the set has to be repeated per campaign. It matters most
in a Discovery campaign, where Search Match is on and the collision is live. This is the one item here that is not a growth bet: it
is stopping somebody else's category from being charged to this one.

**The negatives matter more than the keywords, because three of the best terms
are polluted** and Search Match finds the pollution first.

- **`no ring` collides with Ring**, the doorbell company, which is the largest
  single way to burn this budget. Negative `ring doorbell`, `ring camera`,
  `ring alarm`, `ring app`, `ring login`, `video doorbell`.
- **`intercom` collides with Intercom**, the support software, and with
  doorbell hardware. Negative `intercom support`, `live chat`, `helpdesk`,
  `door intercom`, `doorbell`, `baby monitor`.
- **`walkie talkie` and `push to talk` collide with two-way radio and with
  toys.** Negative `radio`, `frs`, `gmrs`, `ham`, `toy`, `kids`, `long range`.

**Two campaigns rather than one.** Exact-match campaigns, an ad group per tier,
so each tier reads separately; and **one Discovery campaign with Search Match
on and every term above added as an exact negative**, so it can only surface
terms nobody here thought of. That second campaign is the one that pays twice —
§ *Paid* already argues that what converts feeds back into the store field, and
Discovery is what generates that evidence rather than opinion about it.

**The creative lever is Custom Product Pages and there is no other.** Apple
builds the ad from store assets, so this file's rule that *the ad must ask for
the group, not the install* cannot be met by writing better ad copy — there is
no ad copy. One product page for the intercom and walkie searcher, a different
first screenshot for the recording searcher, set up before the spend rather
than after.

### What a tap costs, and why that is not the constraint

**These figures were last checked by search on 2026-09-15 and are
perishable** — they are market figures that move, so a session acting on them
after some months should check again rather than trust this paragraph.

**The mechanic.** Apple Ads is a second-price auction on **cost per tap**: paid
per tap on the ad, not per impression and not per install. You set a maximum
CPT per keyword, a daily cap, and optionally an advisory CPA goal. No minimum
spend. **Your bid is not what you pay** — you clear just above the runner-up —
which is why bidding an honest ceiling on a thin term like `intercom app` is
safe, and why the Tier 1 list can be bid properly rather than timidly.

**The figures.** Global median CPT around **$0.92**; the all-category average
nearer **$1.40**, with North America the most expensive market by a distance.
The spread by category is enormous — Sports around $14.41, Finance around $6.06
— and **Utilities, which is the live primary category, is among the cheapest**,
reported around **$2.90 CPI** in the US. Mapped onto the tiers above, expect
roughly **$0.40–$1.20** on Tier 1, **$1–$2.50** on Tier 2, and **$3–$6 or
worse** on Tier 3, which is the second reason to cap that tier.

**None of which is the constraint, and this is the part worth keeping.** The
app is free and `support.ts` makes the donation explicitly optional, so
**revenue per install is approximately zero**. There is no ROAS to clear and no
bid ceiling derivable from lifetime value. **A paid campaign here is a learning
budget, not an investment**, and the only honest question it answers is whether
the complaint terms convert at all.

**And this file's own thesis moves the real figure by an order of magnitude.**
At a dollar a tap and half of taps installing, that is about two dollars an
install — but § *The unit of acquisition is a group* says an install is not the
conversion. If something like one cold install in ten recruits even one other
person, the cost per *seeded group* is nearer **twenty to thirty dollars**, and
the cost per group that has a second conversation is higher again. **That
arithmetic is illustrative and is not measured** — the recruitment rate in it
is a guess, and it is precisely the number the first campaign exists to find
out. It is recorded here so that nobody budgets against the two-dollar figure,
which is real and is the wrong unit.

**Cohorts move that guess, and they are the reason to spend at all.** The
recruitment rate above was estimated against an install that opens an empty
app. A bought install now lands in a room with four people in it, one of whom
answers — which is the difference between a product somebody can judge and a
product somebody cannot. **It does not follow that the cost per seeded group
falls**, and this file will not pretend otherwise: **what a bought install
reaches is level 4, and what it is bought for is level 13**, with the whole
group half in between and the 4-to-5 step unmeasured. What can be said is that
the twenty-to-thirty-dollar figure was computed against a cold start that no
longer exists, so it is wrong in an unknown direction.

**The host is the ceiling, not the cost per tap, and this is the constraint
nobody has costed.** Every cohort accumulates on one host's Home — the decision
names that as a real cost, not yet paid — and the promise the whole feature
makes is *one of whom is there to answer*. At roughly a dollar a tap and
something like half of taps installing, the $25-a-day test below is on the order
of a dozen installs a day, three cohorts a day, and **something like eighty
cohorts over four weeks, all on one Home, each expecting a human being.** That
is not a budget question and no amount of money fixes it. **So size the campaign
to what the host can answer, or name the second host first** —
`COHORT_HOST_IDENTIFIERS` is an ordered list precisely so that a second is
configuration rather than code.

**Which sizes the test.** Tier 1 volume is small enough that the spend may be
hard to place at all, which § *Paid* already counts as a feature. Something
like **$20–30 a day for four weeks**, six to eight hundred dollars, then **three
to four weeks of silence** before reading `bin/growth` — the lag in § *The shape
of the spend* is not optional, and a read taken the week the money stops is
taken before the only number that matters has moved.

### The shape of the spend

**Small, sequential, and with the kill rule written before the money goes
in**, because the measurement is thin enough that a large parallel test cannot
be read afterwards. One channel at a time, and a fixed budget per test decided
in advance.

**And `bin/growth` already says what the kill rule has to be.** Its own header
makes the point this file would otherwise have had to discover: *depth 0 is not
a claim about how somebody got here* — word of mouth, a passed-on link, a store
listing found by accident and a paid campaign all land in **alone**,
indistinguishable — so **a campaign will swell that class without a single
thing here having spread.**

Which gives the rule exactly: **judge a campaign by what grows underneath the
roots it bought, not by the roots.** First circle and onward, in the `weeks`
and `roots` reports, over the weeks *after* the spend. A campaign that adds
forty to *alone* and nothing to the two classes below has bought forty trees of
one, which is the scattered-install failure made visible for once. Installs
will look fine throughout and mean nothing.

**The lag is part of the rule and has to be budgeted for.** Recruiting the
second and third person is level 6 and is slower than arriving; a read taken
the week the spend ends is taken before the only number that matters has had
time to move.

**Expect the first read to be ambiguous**, because the volumes involved are
small enough that ordinary variation will swamp the effect. That is not a
reason to spend more to get significance; it is a reason to treat paid as a
supplement to the organic work below rather than as the engine.

### What paid may not do, whatever it costs

- **No creative that promises an alarm**, or implies the app will fetch
  somebody. It is the opposite of the product and it sets the expectation the
  product exists to remove.
- **No comparison by name** to any other app — the same 4.1 exposure LISTING.md
  refuses in the listing body and keywords, and it reads as positioning rather
  than describing.
- **Bidding on a competitor's name is a separate question and is open**, and
  deliberately not settled here. The rule above was written about *copy*, where
  naming a rival is both a review exposure and an admission that the grid is
  the right frame. An Apple Ads keyword is neither: Apple permits bidding on
  another app's name, the term never appears in the listing or in any creative,
  and § *Who else is on the field* names several apps whose searchers have
  exactly the complaint this one answers. **Some of the highest-intent terms
  available are other apps' names.** Against that, it is the one tactic in this
  file that buys somebody mid-decision about a *different* product, which is
  persuasion rather than intent, and this file spends its whole argument on the
  difference. **Ask rather than assume** — the rule as written reads as a
  blanket refusal and extending or narrowing it is Rodrigo's call, not a
  session's. **Asked and answered for the first campaign, 2026-09-15: he leans
  against, so round one carries no competitor names.** That is a lean about
  one campaign rather than a rule added here, which is why this item still
  says the question is open — the standing answer is still *ask*, and the next
  campaign gets to ask again. APPLECAMPAIGN.md § *The open question* holds the
  reasoning and what would reopen it.
- **No claim that is not checkable in the shipped build**, on the listing's own
  rule. Open channels and alarm-by-permission are not built and may not be
  advertised.
- **No third-party attribution SDK or ad-network pixel**, per § *Measurement* —
  recommended rather than forbidden outright, since the question is open.
  First-party counting is not covered by this and is where the value is. What
  is *not* open is `/privacy` going stale: whatever is added, that page is
  amended in the same commit, because the listing links to it and a live claim
  that has quietly become false is worse than never having made it.

## Organic, ranked

Where the effort actually goes, hardest-working first.

**1. Make the recommender's job frictionless.** This is product work and it is
the highest-return marketing on the list. Copy Invite Link exists; what is
worth knowing is whether people find it, whether the thirty-day expiry bites,
and whether the invite page converts in the browser as designed. That last one
is answerable from server-side facts alone.

**2. Communities that already contain whole groups.** The targeting logic from
paid applies here at zero cost and higher credibility: the places where a
book club, a band or a raid group already talks to itself. **Arrive as a
participant rather than as a launch**, since every one of these communities
punishes the reverse, and the app's own thesis — a small tool for people who
find a phone call rude — is a better conversation opener than any feature.

**3. The launch surfaces**, meaning Show HN, Product Hunt, and the subreddits
where the complaint is native. These are one-day events with a long tail in
search, and their value is disproportionately in the *comments*, where the
thesis can be argued rather than asserted. The copy for these is the fourth
deliverable of this work and is written separately; **the thesis, not the
feature list, is what gets posted** — this app loses on a feature comparison
and wins on the argument.

**4. Writing the argument down in public.** PROPOSITION.md is, stripped of its
roadmap half, a genuinely good essay about why the ring is a category error,
and it is more persuasive than any landing page because it is not selling
anything. This is the slowest channel and the one that compounds.

**5. The landing page and the listing**, which are not channels but are what
every channel above lands on. Both are cheap to improve and both are currently
carrying a sentence that describes a different app — see ROADMAP item 6.

## The email list, which is consent collected and not yet spent

**There is a marketing permission, it is already being collected, and nothing
has ever been sent under it.** The sign-in screen carries a checkbox, Floor
Settings § Email answers it in both directions afterwards, and the answer is
`accounts.marketing_email_at` — a timestamp saying when permission was first
given, or NULL. `SesMailer` has exactly two send paths, `sendCode` and
`sendInvite`, both of them transactional, and neither reads that column.
Nothing exports a list and no template exists. So this is an asset the rest of
this file does not otherwise name, it grows on every signup, and it has never
been spent.

**What it may carry is fixed by the words the permission was asked for in** —
*Email me occasionally about The Floor — how to use it, and what is new.* That
sentence is the whole scope: the subject is the app, never the recipient's own
room. It is deliberately compatible with § *What marketing may not do*'s first
constraint, and the line between them is the subject rather than the medium.
*Here is what the ladder is for* is on the thesis; *your channel misses you* is
the forbidden thing wearing an envelope, and so is a digest of what happened
while somebody was away.

**Nothing may be sent until there is an unsubscribe link, and the two ship in
the same commit.** CAN-SPAM and its equivalents require one on every message
sent under a permission like this, and it is the only exit that works for the
person who deleted the app or never opens the screen the toggle is on — the
in-app control covers only people who still have the app. Whatever sends the
first mail is where the link attaches, so they are one piece of work or the
first send goes out with no way off the list. Three things it has to get
right:

- **It needs a token that names an account and signs nobody in**, and a route
  that clears `marketing_email_at` without a session. `server/web/` is the
  precedent for an unauthenticated browser-facing page.
- **`watch_tokens` is not the shape to reuse**, though it is the one that
  looks nearest. Its `channel_id` is `NOT NULL` and cascades with the channel,
  and half of what the token says is *which channel* — that is the point of
  the table, and what keeps it from being a session credential. It expires, too.
  An unsubscribe link names an account and nothing else, and has to work
  whenever the mail is opened, which is not inside any TTL worth setting.
  Reuse the technique — 32 random bytes, `sha256` at rest,
  `insertWithUniqueKey` — in a table of its own.
- **Amend `/privacy` in the same commit**, on the same reasoning § *The
  sequence* item 3 carries: the page is a live public claim and the listing
  links to it.

**And the withdrawal has to outrank the grant, which today it does not.**
`Accounts.establish` stamps `marketing_email_at` whenever it is NULL and the
client sends `marketingEmail: true`. That is right for the other half of the
case and is reasoned where it stands: the sign-in box is read before anybody
is identified, so it starts clear on every device and cannot be shown an
answer already given — treating a clear box as a no would make every sign-in
on a second phone revoke what the first one granted. What it cannot do is tell
*never asked* from *asked and left*. So somebody who turns the setting off and
later signs in on a new device with the box ticked is silently back on the
list. That is harmless while nothing sends; the moment an unsubscribe link
exists it is precisely the failure the link exists to prevent, since an
unsubscribe a later sign-in quietly reverses is not one. The fix is a recorded
withdrawal — an `unsubscribed_at`, or a suppression row — rather than a NULL
that reads as silence.

**This has no number in § *The sequence*, deliberately.** Nobody has decided to
send anything, and until somebody does, the honest position is that consent has
been collected and not acted on — a safe state to sit in and not one to send
from. The gate is the link and the withdrawal above, both small, and both much
worse to retrofit once a first send has already gone out.
`backlog/marketing-email-has-no-unsubscribe-link.md` is the same statement made
from the other end.

## The tagline, and the slot it does not go in

**Under consideration from 2026-09-22: *Conversation Uninterrupted*.** Whether
it is adopted is not settled here; what is settled is where it may go, because
the obvious slot is the wrong one.

**It does not go in the App Store subtitle.** That field is spent on
*Group voice on your own time*, and LISTING.md § *Subtitle* argues why: it is
the one place a stranger learns what category the thing is in, and
*Group voice* does the categorising in two words so nothing downstream has to.
A tagline naming how the app *feels* assumes a reader who already knows what it
is — which is exactly the reader the store does not have. **Length is not what
rules it out**: twenty-six characters, inside the thirty.

**The second reason is typographic and only visible on the page.** The store
renders the listing name — *The Floor Uninterrupted*, registered because
*The Floor* was taken — in the largest type on the product page, with the
subtitle immediately under it. *Uninterrupted* would then appear twice, on
consecutive lines, and the second one would look like a stutter rather than a
claim.

**Where it earns its place is every surface where the name is just *The
Floor*** — the landing page, the invite and guest pages, an About screen.
Which is the same set § *The funnel is upside down* calls the top of it, and
for the same reason: their reader arrives having been told what this is by a
person, so the categorising is already done and the slot is free for what the
app is like.

**The form matters.** *Conversation without Interruption* is the same claim and
is worse: *-ation* against *-uption* is an echo you cannot stop hearing once
you have noticed it, and the prepositional phrase describes the circumstances
where the adjective describes the thing. The two-word form also survives being
set small, which is where a tagline lives.

**There is a second candidate for the same slot**, *Reinventing the phone
call*, in LISTING.md § *Saying it forwards* — which is where the argument
about the word *call* is. Only one of them can be adopted; neither is.

## What marketing may not do

PROPOSITION.md § *What this proposition forbids* is a list of product
constraints, and each one has a marketing consequence that is easier to
violate than the product one. Reproduced here in the form that bites this
file's subject:

- **No re-engagement notification, ever** — which forbids lifecycle
  marketing outright. No push campaign, no streak, no digest, no *your channel
  misses you*, and no email of that shape either. The server can send mail
  (`mail.ts`) and today it sends only invitations and account business.
  **This one costs real growth and is not negotiable**, because the
  permission is the thing the product runs on and item 1 of the roadmap spends
  its credibility on exactly this promise. **It is not a ban on the mail the
  sign-in checkbox asks for** — § *The email list* bounds that one, and the
  line between them is the subject rather than the medium.
- **No strangers and no directory** — which forbids every tactic whose
  mechanism is connecting people who do not know each other. No suggested
  contacts, no address-book upload, no *people you may know*, no public
  channels to browse. **Growth that requires relaxing this is growth that
  dismantles the product.**

  **The getting-started cohort is the one exception, it is named as an
  exception, and it is temporary.** It is recorded here rather than left to be
  discovered as a contradiction between this file and the shipped app. What it
  does not do is the load-bearing half: **it forms no contact, so it connects
  nobody to anybody in the sense this rule means.** No directory, no search, no
  suggestion, nobody findable, and — because every gate in the server is on the
  contact graph rather than on the roster — **nobody in it can ping you.**
  § *The cohort, which is scaffolding and not an asset* has the mechanism. It
  happens once, at signup, only to somebody who arrives with nobody, and
  **emptying `COHORT_HOST_IDENTIFIERS` ends it in one restart.** Two pending
  tasks would narrow it further still — `cohorts-are-opt-in` and
  `cohorts-are-only-for-users-who-enabled-notifications`, both stubs as this is
  written, and the first would remove the involuntary half altogether.

  **The rule is not suspended and nothing else inherits this.** A bounded
  exception with a written ending is not a precedent for the next tactic that
  would like one: suggested contacts, address-book upload and browsable
  channels remain forbidden, and each fails on the test this exception passes —
  they make the app a place to *find* people. This one makes it a place where
  four arrivals can see what the app is before they go and get their own.

- **The cohort may not be advertised.** Nothing in any creative, Custom Product
  Page, store field, landing page or community post may offer being put in a
  room with other people — no *meet people*, no *join a community*, no *you
  won't be alone*. Three reasons, and the first is sufficient: it sells an
  application nobody here wants to have built, and would bring the readers a
  directory would have brought. Second, it is scheduled to be switched off, and
  copy outlives the feature it describes. Third, LISTING.md's rule that every
  claim be checkable in the shipped build cuts against advertising something
  gated on an environment variable that is empty today. **The cohort is what
  the app does when somebody arrives alone, not a reason given to them for
  arriving.**
- **No alarm a sender can choose** — which forbids advertising one, above.
- **Not chat** — which forbids positioning against messengers. The app supplies
  the room and the thread supplies the *when*; copy that claims to replace the
  group thread is claiming ground the app deliberately does not hold.
- **No administration inside a channel** — which forbids selling this to
  organisations as a moderated space. The six are the moderators,
  structurally, and a buyer who wants an admin wants a different product.

**One more, from this file rather than from the proposition: no incentivised
referral.** A bounty for bringing somebody optimises for volume, which is the
unit that evaporates, and it corrupts the one signal worth having — an invite
redeemed because somebody actually wanted to talk to that person. The invite
link works because the motive behind it is real.

## The sequence

What to do, in order, and what each is waiting on.

1. **~~Fix the copy that describes a different app.~~ Done**, and it was bigger
   than ROADMAP item 6 described. That entry named two files; there were three,
   and the one it missed — `invite.ts`, in both bodies — is the page § *The
   funnel is upside down* calls the top of the funnel. Out with it went *The
   Floor is a small application*, true when written and false now, and
   `mail.ts`'s claim that you can see who is around *before you interrupt
   anybody*, which framed arriving as an interruption. The landing page now
   also says **why** the floor exists rather than only what it does.
   deploy-history.md has the deploys.
2. **Close the listing.** LISTING.md's draft is argued and mostly live; what is
   outstanding is the subtitle, promotional text and keywords, none of which
   can be read back from the public lookup API. Needs App Store Connect, not a
   deploy.
3. **Instrument the ping, and the notification permission.** `bin/growth`
   covers arrivals, the contact graph, channels and the conversion at level 11.
   What is left are the two things no table holds: a ping and its answer, which
   is the leakiest point in the funnel, and whether the permission was ever
   granted. Both are small. **Amend `/privacy` in the same commit as either**,
   since the page is a live public claim and the listing links to it.
4. **Composed imagery, which is the half still missing.** The captures are in
   hand — `assets/store/` holds the five, three of them serving the landing
   page, including the lock screen that carries the central claim. What does
   not exist is anything *composed* rather than captured: a Product Hunt
   gallery, a social card, an Instagram frame. Blocks 7 and 8 and nothing
   above them.
5. **Switch the cohorts on, and split them out of `bin/growth`.** It sits here
   because **it is what paid spending lands into.** Three things in order:
   release a build of 206 or later, so the card that explains the channel is on
   the phone the placement happens to — the ordering is in `server/.env.example`
   and is not negotiable, since an older build shows the room and no reason for
   it; name the host or hosts in `COHORT_HOST_IDENTIFIERS`; and split
   `channels.cohort` out of `channels`, `talking` and `groups` before those
   numbers are read against anything, per § *Cohorts contaminate three of those
   four*. The last is small and is much worse to do afterwards, when a
   campaign's result is already mixed into the baseline.
6. **Apple Search Ads**, small, on the complaint keywords. First among paid
   because its attribution needs nothing installed and the intent is already
   present.

   **It is not blocked on 3.** The kill rule in § *The shape of the spend*
   judges a campaign by what grows *underneath* the roots it buys — first
   circle and onward — and `bin/growth`'s `classes`, `weeks` and `roots`
   already report exactly that. Item 3 tells you *why* a funnel leaks at level
   10; it is not needed to tell whether a campaign worked.

   **What it is genuinely waiting on is 2 and 5**, and neither ordering is
   negotiable. Search Ads sends people to the App Store product page, so buying
   traffic before the listing is right pays to show strangers a description
   that still does not mention the invite link. And **5 is what the traffic
   arrives into**: a campaign bought while the cohorts are off is a campaign
   spent on the empty app this file spends its whole argument saying not to buy
   — every tap landing on two empty lists and a ladder that says *go and get
   somebody*. Buying the alone arrival is defensible exactly when there is
   something for them to arrive at.

   **The buy itself is specified** — § *The keyword list, in three tiers* holds
   the terms, the negatives and the campaign structure, and § *What a tap
   costs* holds the pricing and the budget. **Two of their items belong in the
   same App Store Connect sitting as 2** rather than in a later one: the Custom
   Product Pages, which are the only creative lever Apple Ads has, and the
   brand-defence negatives against flooring, which cost nothing and are pure
   waste until they exist.
7. **The launch surfaces**, once 4 exists, because a Product Hunt post without
   imagery is a post that was not made.
8. **Group-affinity social**, last, because it is the most expensive to do
   well and the hardest to read. **Video belongs here rather than earlier**,
   and the format that works is a comparison rather than a demo — two phones,
   one ringing and one not — because that is the only way to make a non-event
   visible. A screen recording of this app is a list of names.
