# How this app gets to people

**Standing statement of the acquisition argument**, written 2026-09-14, and a
third sibling to PROPOSITION.md and LISTING.md. The proposition holds the
argument about what the app is *for*; the listing and DESCRIPTION.md hold the
copy; this file holds the argument about how a stranger comes to be a user,
and what may and may not be spent to make that happen.

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
- **What is already built** — the assets inventory, and the one most apps in
  this category have to buy.
- **The funnel is upside down** — the guest page and the invite page are the
  top of it; the listing is the middle.
- **The funnel, level by level** — the thirteen levels, what each one loses
  people to, and which of them are even visible today.
- **Measurement, which is now a choice** — what `bin/growth` already answers,
  what is still unmeasured, what first-party analytics can buy, and what
  third-party would cost.
- **Paid, since it is on the table** — what money can and cannot buy here,
  ranked, with the kill rule.
- **Organic, ranked** — where the effort actually goes.
- **What marketing may not do** — the constraints, applied to this file's
  subject rather than to the product's.
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

**Imagery was the gap in this inventory and is now half closed.** On
2026-09-14 two screenshots joined the landing page — `server/public/home.webp`
and `floor.webp`, 52 KB the pair — chosen because they are the two where the
interface itself carries an argument: the channel list showing presence and
recency, and a roster showing *has the floor* as a state on a person.

**The half that is still open is everything image-first.** Product Hunt,
Instagram and every paid social surface need assets that are composed rather
than captured, and there are none. **The store captures are now in the repository**, in
`assets/store/`, at full resolution and excluded from `bin/deploy` — they were
in a desktop folder, which is not a record for something a submission depends
on. The two the landing page uses are derived from them.

**One limit applies to every image this project will ever make.** The central
claim is a non-event: a phone that does not ring cannot be photographed. No
screenshot supports it, and no video will either without a comparison in the
frame — see § *The sequence* item 6.

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

**Thirteen levels, and the shape of the thing is not a funnel but a loop** —
the bottom returns to the top, and that return is the only reason any of this
works at scale. What follows is the standing definition; § *Measurement* says
which are visible today and what it would take to see the rest.

**It forks at level 4.** Above that the unit is a person and the levels are the
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

**Level 3 is the unusual one and it is load-bearing.** In almost every app it
is a nice-to-have measured out of habit. Here a decline silently breaks the
product — an invitation nobody was shown is an invitation nobody declined —
and the failure is attributed to the app rather than to the setting. **If only
one new number is ever instrumented, it is this one**, and ROADMAP item 1 is
the work it would measure.

### The group half

| # | Level | Lost here because |
| --- | --- | --- |
| 4 | **First mutual contact** | Nobody to ask, or the ask is awkward to make |
| 5 | **Three mutual contacts** — the threshold the proposition names | Recruiting the second and third person is a different, harder act than recruiting the first |
| 6 | **A channel with three or more members** | The reason to make one is not obvious from an empty app |
| 7 | **First conversation** — two people present, audio exchanged | The empty room; nobody was there when they looked |
| 8 | **First ping sent** | The answer to the empty room is not discoverable at the moment it is needed |
| 9 | **Ping answered — somebody arrives** | The habit imported from telephony: ping, then put the phone out of reach, where a banner cannot fetch you |
| 10 | **Second conversation, on a separate day** | **This is the conversion.** Below it the group exists; above it, it does not |
| 11 | **Habit** — conversation in two of the last four weeks | Nothing here will ever nag them back, by design |
| 12 | **Recommendation** — an invite link sent, and redeemed | Sending one requires a username and a reason, and nothing rewards it |

**Level 10 is the conversion and everything above it is raw material.** A
dashboard that stops at level 2 is measuring the top third of a funnel whose
economics live in the bottom third.

### The three levels worth all the attention

Named separately because the levels are not equally leaky, and the leaks are
not where an install-shaped intuition puts them.

- **5, the third contact.** Levels 4 and 5 look like the same act repeated and
  are not. The first contact is somebody the user was already talking to about
  the app; the second and third require going and asking people who have heard
  nothing. This is where density is won or lost, and it is the level the
  recommender's tooling — username, Copy Invite Link, the link surviving a
  paste — exists to serve.
- **9, the ping answered.** This is the central loop closing, and the
  proposition already documents the failure mode as *observed, and not a bug in
  anything*: somebody pings and then puts the phone away as though a call were
  coming. It is the leading indicator for 10, and it is the one level where the
  fix is copy rather than product — ROADMAP item 2 is exactly this.
- **12, the recommendation**, because it is the return leg. Levels 0 through 11
  are a cost; 12 is the only one that pays for another pass through 0. **An app
  with a strong 12 does not need most of this file.**

### What the shape implies

**Paid spending enters at level 0 and has to survive twelve levels to be worth
anything**, which is the quantitative version of the argument that CPI
evaporates. A referral enters at level 1 *already past level 4* — the invite
link makes the pair contacts outright — which is the quantitative version of
the claim that the invite page, not the listing, is the top of the funnel.

**And a guest link enters at level 7.** Somebody opening one is hearing
friends before they have an account, which is why the proposition calls it
better than most viral primitives: it delivers the experience before the
signup and skips the six levels that lose the most people.

## Measurement, which is now a choice

**Revised 2026-09-14 at the prompt**, which is open to introducing analytics
and to amending the privacy policy accordingly. The section this replaces
treated the absence as settled; it is not, so what follows is the cost of each
option rather than a refusal.

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
  sent and answered, invites redeemed. Levels 4 through 12 are entirely
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
   membership, presence and the usage tables. Most of levels 4 through 11 are
   already there, unqueried.
4. **Invite pin redemptions**, which are level 12 exactly, recorded because the
   feature needs them to be.

**Corrected 2026-09-14.** This section originally proposed writing
`bin/growth`. **It already existed**, since 2026-09-10, and is 33 KB of
carefully argued shell — the proposal was made without looking in `bin/`, and
what was proposed was thinner than what is there.

### What `bin/growth` actually does, which is the referral half

It answers *where the people here came from*, on two graphs that deliberately
do not have to agree:

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
`usage.ts` argues for. **It serves level 12 of § *The funnel* completely, and
levels 4 and 5 obliquely** — islands are a better answer than the
pairs-per-account distribution this file originally asked for.

**And it states its own limits**, which are worth repeating because they bound
every claim below: not installs (the box hears about somebody at sign-in, and
nothing joins that to App Store Connect), not guests (no account, no class),
and erased accounts and the two App Review accounts are excluded throughout.

### What is still not measured, which is the group half

**Levels 6 through 11 — every channel and every conversation.** Nothing reports
a channel created, a conversation held, a ping sent or a ping answered over
time. `bin/live` is the present moment rather than a history, and `bin/usage`
is minutes and bytes as capacity instrumentation. **So the conversion at level
10 is currently unmeasurable**, and so is the leading indicator at level 9.

*Direction.* **A second set of reports on the same pattern**, in `bin/growth`
or beside it, over channels rather than accounts: channels by member count,
conversations per channel per week, ping-sent against ping-answered, and
second-week retention of groups rather than of accounts. Plus **the one
client-side addition worth making**, the notification permission outcome at
level 3. `bin/growth` is the model to copy — the vocabulary declared once as
temp views, each report being the question it asks.

**Installs are deliberately not at the top of that report.** They are in App
Store Connect, they are level 2 of thirteen, and putting them beside the right
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
cost-per-install campaigns on any network. **Measurement is no longer the
objection** — first-party counting will show what a campaign delivered as far
down as level 10. The objection is the unit: broad CPI buys level-2 events
that reliably fail to reach level 5, and better measurement of a campaign that
buys the wrong thing tells you precisely how much was wasted rather than
saving any of it. Revisit this when § *The funnel* shows a healthy 5 and 12,
because a leaky funnel does not get fixed by putting more in at the top.

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
second and third person is level 5 and is slower than arriving; a read taken
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
- **No claim that is not checkable in the shipped build**, on the listing's own
  rule. Open channels and alarm-by-permission are not built and may not be
  advertised.
- **No third-party attribution SDK or ad-network pixel**, per § *Measurement* —
  recommended rather than forbidden outright, since the prompt has reopened it.
  First-party counting is not covered by this and is where the value is. What
  is *not* reopened is `/privacy` going stale: whatever is added, that page is
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

## What marketing may not do

PROPOSITION.md § *What this proposition forbids* is a list of product
constraints, and each one has a marketing consequence that is easier to
violate than the product one. Reproduced here in the form that bites this
file's subject:

- **No re-engagement notification, ever** — which forbids lifecycle
  marketing outright. No push campaign, no streak, no digest, no *your channel
  misses you*, and no email of that shape either. The server can send mail
  (`mail.ts`) and it is for invitations and account business, not for
  marketing. **This one costs real growth and is not negotiable**, because the
  permission is the thing the product runs on and item 1 of the roadmap spends
  its credibility on exactly this promise.
- **No strangers and no directory** — which forbids every tactic whose
  mechanism is connecting people who do not know each other. No suggested
  contacts, no address-book upload, no *people you may know*, no public
  channels to browse. **Growth that requires relaxing this is growth that
  dismantles the product.**
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

1. **Fix the copy that describes a different app.** ROADMAP item 6: the
   landing page and `support.ts` both say *one person speaks at a time*, which
   the proposition says in terms is wrong, and nothing outside the listing says
   that nothing rings. Cheapest item on any list here, ships with a deploy,
   waits on nothing. **Done as part of this work** — see the rebuilt
   `landing.ts`.
2. **Close the listing.** LISTING.md's draft is argued and mostly live; what is
   outstanding is the subtitle, promotional text and keywords, none of which
   can be read back from the public lookup API. Needs App Store Connect, not a
   deploy.
3. **Extend `bin/growth` to the group half, and instrument level 3.**
   `bin/growth` exists and covers arrivals and the contact graph; what nothing
   reports is channels and conversations over time, which is where the
   conversion at level 10 lives. Queries over tables that already exist. The
   one genuine addition is the notification permission outcome, a field rather
   than a pipeline — **amend `/privacy` in the same commit**, since the page is
   a live public claim and the listing links to it.
4. **Get the rest of the imagery into the repository.** Two landing-page
   screenshots landed on 2026-09-14; the App Store set is on a desktop and
   nothing composed exists at all. Blocks nothing above it and everything
   below.
5. **Apple Search Ads**, small, on the complaint keywords, once 3 can read the
   result past level 2. It is first among paid because its attribution needs
   nothing installed and its intent is already present.
6. **The launch surfaces**, once 4 exists, because a Product Hunt post without
   imagery is a post that was not made.
7. **Group-affinity social**, last, because it is the most expensive to do
   well and the hardest to read. **Video belongs here rather than earlier**,
   and the format that works is a comparison rather than a demo — two phones,
   one ringing and one not — because that is the only way to make a non-event
   visible. A screen recording of this app is a list of names.
