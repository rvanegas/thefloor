# The first Apple Search Ads campaign

**A campaign rather than a standing document, written 2026-09-15, and
temporary by construction.** MARKETING.md holds the argument about what may be
spent and why; it names campaigns as downstream of itself, in § *The sequence*
item 6. This is that item, specified to the point where somebody can open
Apple Ads and type. **Delete it when the campaign has been run and read**,
moving what survives into `decisions/` — which will be the answer to the one
question it exists to ask, and the kill rule's verdict, and nothing else.

It was chosen under a constraint worth recording, because it excludes almost
everything: **one paid channel, requiring minimal or no collateral beyond the
landing page that already exists.**

## Why this channel, and why the others were excluded

**Apple assembles the ad from store assets. There is no ad copy and no image
to make** — the five captures in `assets/store/` already populate the default
product page, so the collateral constraint is satisfied by doing nothing. It
also targets by search intent rather than by audience, which is how a campaign
that must not target the tech industry avoids having to say so: you are buying
somebody who typed *intercom app*, whoever they turn out to be.

The alternatives failed on facts rather than on judgement:

- **Recruiter-shaped social on group affinities**, MARKETING.md § *Paid* item
  2, needs composed imagery — a social card, an Instagram frame — which is
  sequence item 4 and does not exist in any form. It fails the constraint
  outright.
- **Broad cost-per-install on any network** is § *Paid* item 3, which is the
  word *no*.
- **Show HN** was the recommendation before *paid* was a requirement, and is
  the only channel in the file needing literally nothing. It is recorded here
  as the thing to fall back to, and its one blocker is not imagery: MARKETING.md
  defers *the launch surfaces* as a block behind item 4, but that reasoning is
  Product Hunt's — a gallery is the post there, whereas an HN post is a title,
  a URL and a first comment. It targets the tech industry, which is why it is
  not this.

## The buy

One exact-match campaign, **Tiers 1 and 2** — the twenty complaint terms and
the twelve group affinities in MARKETING.md § *The keyword list, in three
tiers*, which is the list rather than this file. Thirty-two terms. **Tier 3 is
not in round one.**

**Tier 1 alone was the answer until 2026-09-15**, and this file asserted it
without arguing it, which is what the question *why not Tier 2* exposed. The
argument for excluding it was never about the thesis. By this file's own test
Tier 2 is the *more* on-thesis half: MARKETING.md says those terms buy
somebody who already has the other three people, **which is the whole test
applied to everything else here**, where Tier 1 buys one person with a
complaint who must then do level 6 — the hardest step in the funnel and the
one § *The three levels worth all the attention* names. The exclusion was a
budget argument, the same one § *Two deviations* makes against Discovery:
splitting thin money halves the signal.

**The budget argument is answered by structure rather than by money**, which
is why both tiers can go in. An ad group per tier keeps them readable apart —
see step 7 — so round one still answers *do the complaint terms convert* and
now also asks whether buying an intact group does better, which is a question
worth the same four weeks.

**Tier 3 stays out**, and its exclusion is argued rather than assumed.
MARKETING.md caps it hard for two stated reasons — contested by subscription
apps with real revenue per user, so the most expensive terms on the list, and
it buys *an individual with nobody to talk to*. There is a third that decides
it for round one: that is precisely the shape of the failure the kill rule
watches for. Money spent there would swell **alone** with nothing underneath
it, and the read afterwards could not separate *the complaint terms did not
convert* from *we spent the budget on terms that were never going to*.

The three negative sets from that section go in with it, and they matter more
than the keywords, because Search Match finds the pollution before it finds the
term: `ring doorbell` and its family against Ring, `intercom support` and its
family against Intercom and door hardware, `radio`/`frs`/`gmrs`/`ham`/`toy`
against two-way radio. **The flooring negatives go in at account level** —
`flooring`, `floor plan`, `laminate`, `tile`, `carpet`, `hardwood` — and cost
nothing, being the one item here that is not a growth bet but a refusal to have
somebody else's category charged to this one.

**$20–25 a day for four weeks, six to seven hundred dollars.** Then **three to
four weeks of silence** before reading anything. The lag is part of the rule,
not patience: recruiting the second person is level 6 and is slower than
arriving, so a read taken the week the money stops is taken before the only
number that matters has moved.

### Two deviations from MARKETING.md, both to protect the signal

Recorded as deviations rather than quietly taken, since that file specifies the
buy and this one departs from it twice.

- **No Discovery campaign in round one.** § *The keyword list* wants two
  campaigns, and its argument is sound — Discovery with everything above as an
  exact negative is what generates evidence for the store keyword field rather
  than opinion about it. But at this budget, splitting the money halves the
  signal on the only question round one answers. **Discovery is round two,
  funded by what Tier 1 teaches.**
- **No Custom Product Pages.** They are the only creative lever Apple Ads has,
  and skipping them means the intercom searcher and the recording searcher see
  the same first screenshot. **That is the price of the collateral constraint**,
  it is a real one, and a CPP is the first thing to add back the moment a day
  can be spent on it.

## What has to be true first

The file blocks this on sequence items 2 and 5. Both blocks are real. They are
not the same kind of thing, and the difference decides what to do about each.

### The listing, which is cheap and is not optional

Every tap lands on the App Store product page. **The live description is still
the 2026-09-03 draft, and it does not mention the invite link** —
LISTING.md § *The description is one revision behind* has the seven
differences and names this as the fifth. That link is the app's own viral
primitive and the sentence that decides whether a bought install ever recruits
a second person. **Buying traffic against that page is paying to hide the
mechanism the traffic is being bought for.**

Promotional text needs no review and can be live within the hour. Subtitle,
keywords and description ride the next submission. LISTING.md § *The checklist*
is the order.

**The category dispute should be settled in the same sitting.** Live is primary
Utilities, secondary Social Networking; Rodrigo decided the reverse on
2026-08-27, and both records are confident. It is app-level rather than
version-level so it waits on nothing, and **it changes which searchers Apple
shows the app to**, which makes it a question to answer before money moves
rather than after.

### The cohort, where the constraint is not money

`released` is **build/202** against the 206 the explanatory card needs, so
cohorts cannot legitimately be switched on yet — the ordering in
`server/.env.example` is not negotiable, an older build showing the room and no
reason for it. What was missing was **a release rather than a
build** — `build/206` through `build/212` are tagged already, so the blocker
as first written waited on moving `released` and not on `bin/upload-ios`.
**That stopped being true on 2026-09-15**, and the paragraph below is why: the
release this now waits on is 213, which is not yet uploaded, so an upload is
back on the path. (MARKETING.md § *The cohort* states this against a
`released` of 127, which has since moved; the figure there is stale and the
ref is the authority.)

**The release this waits on is 213**, decided 2026-09-15 and revised the same
day. 212 was the answer for a few hours; it is tagged, it is past 206, and it
would have cleared this blocker on its own. It was set aside because of what
it does *not* carry.

**`build/212` predates the funnel instrumentation by six commits**, which
splits that work in two on the way to a phone. `pings` — levels 9 and 10 — is
written by the server and starts recording on the next deploy whatever is
installed. `notify` — level 3 — is an answer only the app can give, so a
release of 212 would have left the column null for the whole population and
the report reading *nobody has said* throughout the campaign. Honest, and
exactly the row somebody reports as a refusal rate.

**So the submission is cancelled and 213 carries the header.** That is a
longer road than moving a ref — an upload, a submission, an approval and a
release, against 212's release alone — and it is the right trade: level 3 is
the level MARKETING.md says to instrument if only one ever is, and a campaign
read with it dark is a campaign that cannot tell an app nobody wants from an
app nobody can be reached by. 213 is past 206 as well, so **one release clears
both this blocker and the instrumentation**, and step 5 below is now the same
act as shipping the header.

**What it still cannot tell you early.** A released build reaches phones as
people update, so the fourth row empties over weeks rather than on the release
day. **Read the three answers against each other and not against everybody**
until it is small — which is the report's own standing caveat, arriving here
as a schedule rather than as a footnote.

Past that there is a ceiling MARKETING.md § *What a tap costs* names and nobody
has costed. At roughly a dollar a tap and half of taps installing, $25 a day is
on the order of a dozen installs, three cohorts a day, and **something like
eighty cohorts over four weeks, all accumulating on one host's Home, each one a
room where a human being is supposed to answer.** No budget fixes that.

**So size the daily cap to what the host can answer rather than to the budget**,
and let Tier 1's thin volume work in its favour — that file already expects the
spend to be hard to place, which here is the feature rather than the
disappointment. For the full $25 a day, **name a second host in
`COHORT_HOST_IDENTIFIERS` first**; it is an ordered list precisely so that is
configuration rather than code.

### One thing to do before the spend rather than after — done

**Split `channels.cohort` out of `channels`, `talking` and `groups` in
`bin/growth`**, per MARKETING.md § *Cohorts contaminate three of those four*.
It is small now and much worse once a campaign's results are already mixed into
the baseline it would have been measured against.

**Done on 2026-09-15.** All three reports read the column; the funnel's rows
exclude cohorts and each report carries a separate cohort block. So the
baseline this campaign will be read against is already clean, which was the
whole reason for doing it first.

Two further things were built the same day and are not blockers for this
campaign, but change what step 9 can read: **`pings`** (levels 9 and 10, a
durable record of somebody asking for company and of it working) and
**`notify`** (level 3, whether the app can reach anybody at all). Neither is
in the kill rule — see below, which is unchanged — but the second is worth a
look before the money moves, since a bought install that cannot be reached is
a bought install that will not recruit anybody. See MARKETING.md § *What is
still not measured, which since 2026-09-15 is guests alone*.

## The kill rule, written before the money

From MARKETING.md § *The shape of the spend*, which derives it from
`bin/growth`'s own header: **judge the campaign by what grows underneath the
roots it buys, not by the roots.**

Every paid arrival lands in the **alone** class, indistinguishable from word of
mouth, a passed-on link and a listing found by accident. So *alone* going up
proves nothing whatsoever. What counts is **first circle and onward, in
`classes`, `weeks` and `roots`, read three to four weeks after the spend
stops.** Forty added to *alone* and nothing in the two classes below it means
forty trees of one — the scattered-install failure, made visible for once.
**Installs will look fine throughout and will mean nothing.**

**Expect the first read to be ambiguous.** The volumes are small enough that
ordinary variation will swamp the effect. That is a reason to treat this as a
learning budget rather than an investment — revenue per install is
approximately zero, there is no ROAS to clear, and the only honest question
this money answers is **whether the complaint terms convert at all.**

## The open question, which was Rodrigo's — leaning against

**Bidding on competitors' app names.** MARKETING.md § *What paid may not do*
leaves it deliberately unsettled and says to ask rather than assume. Apple
permits it; the term never appears in the listing or in any creative, so it is
not the 4.1 exposure the no-comparison rule guards against; and § *Who else is
on the field* names several apps whose searchers have exactly this complaint,
which makes some of the highest-intent terms available other apps' names.
Against that, it buys somebody mid-decision about a *different* product, which
is persuasion rather than intent — the distinction this whole argument turns
on.

**Rodrigo leans against, 2026-09-15.** So **round one carries no competitor
names**, and since it is part of round one or of nothing, that is the working
answer unless he says otherwise before the campaign is set up.

Recorded as a lean rather than as a rule, which is the honest shape of it and
also the useful one. The argument against was always the stronger half — it is
the distinction the whole file turns on, and a campaign built to buy intent
should not open by buying persuasion. But it is a judgement about one channel
rather than a constraint derived from the proposition, and **it is the cheapest
thing here to reverse**: adding exact-match terms to a live campaign is a text
field, not a rebuild. So it is settled for round one and open for round two,
where the Discovery campaign will have said something about which searches
actually convert.

**What would reopen it before then — revised 2026-09-15, and the first version
had this wrong.** It said Tier 1 failing to place the spend was the trigger,
on the reasoning that unplaceable money makes the question *is there any
intent here to buy*. The reasoning holds; the conclusion skipped a step.
**Tier 2 was the answer to that trigger all along** — cheaper, already on the
list, needing no decision reversed, and buying people who have the group
rather than people mid-decision about a rival. It is now in round one outright
(§ *The buy*), so the cheap answer has been spent in advance.

What is left behind it is thin and should stay behind Discovery's evidence:
**Tier 3**, which MARKETING.md caps hard and expects not to pay, and
competitor names. Neither is a round-one lever. **If thirty-two terms across
both tiers cannot place $20 a day for four weeks, that is a finding about the
category rather than a prompt to widen** — and the honest next move is the
Discovery campaign § *Two deviations* defers, which exists precisely to find
the terms nobody here thought of.

## The order, in one list

1. Promotional text. No review, live within the hour.
2. Settle the category question.
3. The submission carrying subtitle, keywords and description — the invite-link
   sentence being the one that matters.
4. ~~Split `channels.cohort` out of `bin/growth`.~~ Done 2026-09-15.
5. Cancel the 212 submission, upload 213 with the funnel instrumentation in
   it, submit, and release it — then name the host or hosts. **One release
   does both jobs**: 213 is past the 206 the explanatory card needs and is the
   first build that answers level 3. This is the long pole; everything below
   waits on it and nothing above does.
6. ~~Decide the competitor-name question.~~ Leaning against, 2026-09-15:
   round one carries no competitor names. Reversible at any time; see the
   section above for what would reopen it.
7. **Set up the campaign.** The step this file exists for, and the only one
   done in a browser rather than a terminal. Elaborated below.
8. Four weeks of spend, then three to four weeks of silence.
9. Read `bin/growth` — `classes`, `weeks`, `roots`. Write the verdict into
   `decisions/` and delete this file. `notify` and `pings` are worth reading
   alongside, and are not the verdict: the kill rule is the three above.

## Step 7 in full, which is the only part done in a browser

Everything above is a terminal or a decision. This is Apple Ads Advanced,
`ads.apple.com`, and it is written out because the file's premise is that
somebody can open it and type — and because a handful of these settings are
the difference between a test and a donation. The placement is the first of
them and was missing from this section until 2026-09-15, which is how a
write-up meant to be typed from can still put the wrong thing first.

**Advanced, not Basic**, which is settled before any of this by which product
you opened. Basic is the one Apple pushes: you give it a budget and it chooses
the terms. That is the opposite of this campaign, whose whole question is *do
the complaint terms convert* — a product Apple picks the keywords for cannot
answer it, and it cannot hold negatives either. If the interface is offering a
single budget box and no keyword list, it is the wrong one. The screen below
exists only in Advanced, so arriving at it is the confirmation.

### The placement, which is the first choice and the one that decides the rest

**Search Results, and nothing else.** Campaign Settings asks this before
budget, before keywords, before anything — *Select where ads will run* — and
offers four: Today Tab, Search Tab, Search Results, Product Pages.

**It is not a distribution question.** It decides whether the rest of this
section applies at all: Search Results is the only placement bought by what
somebody typed, and so the only one where twenty exact-match terms and three
negative sets have anywhere to go. Choose another and the apparatus below is
inert.

The other three, against this file's own test:

- **Today Tab** — the App Store front page, seen by people who came to browse.
  No search, no term, no intent; it buys impressions from somebody who is not
  looking for anything. That is the broad awareness spend MARKETING.md
  § *Paid* item 3 answers with the word *no*.
- **Search Tab** — shown *as somebody begins a search*, before they have typed.
  Close enough to be tempting and wrong for the reason that matters: nobody has
  expressed a complaint yet, so it targets an audience rather than an intent.
  It is also where a thin budget goes fastest, everybody who taps search being
  eligible.
- **Product Pages** — the *You Might Also Like* strip at the foot of **other
  apps'** pages. **This is the competitor-adjacency play in placement form**,
  and it is ruled out by the same decision that ruled out bidding on
  competitors' names — § *The open question*. It buys somebody mid-decision
  about a different product, which is persuasion rather than intent; taking it
  after declining the keywords would be the same purchase through a different
  door. Worth noticing that two unrelated screens reach the same answer from
  one principle.

**Round two may revisit it, and on the same terms as everything else deferred
there.** Product Pages is the one of the three that could ever be argued for,
and only if the competitor question is reopened first — in that order, never
by taking the placement as a way around the question.

### One campaign, one ad group

**Campaign:** storefront United States only. Every number in
§ *What a tap costs* is a US number, and a second storefront halves the signal
on the only question round one asks. **Budget:** no lifetime cap; the daily
cap is the control — see below. **Search Match: OFF.** It is on by default and
it is the single most expensive default here: Search Match is how `no ring`
finds Ring and how `intercom app` finds helpdesk software, and the negatives
below exist to survive it rather than to invite it. Discovery is round two and
is where Search Match belongs, on purpose and on its own budget.

**Ad groups: two, one per tier, and this is load-bearing rather than tidy.**
MARKETING.md § *The keyword list* specifies an ad group per tier *so each tier
reads separately*, and with both tiers buying at once that is the whole thing
keeping round one answerable. Pooled in one ad group, thirty-two terms return
one number and the question *do the complaint terms convert* has no answer in
it — Tier 2 converting well would read as Tier 1 working. Split, the same
money answers two questions instead of blurring one.

    Ad group A — Tier 1, the complaint terms       20 terms
    Ad group B — Tier 2, the group affinities      12 terms

Tier 3 is not here; § *The buy* says why. Adding it later is adding an ad
group rather than rebuilding, which is the point of the structure.

**Default product page**, since there are no Custom Product Pages — § *Two
deviations*, where that is recorded as a real cost rather than an oversight.

### The keywords: thirty-two, exact match, split by ad group

From MARKETING.md § *The keyword list, in three tiers*, which is the list
rather than this file. **Exact match on every one**, which in Apple Ads means
entering them in the Exact field rather than Broad — broad match is Search
Match wearing a different hat and lands you in the same polluted searches.

**Ad group A — Tier 1, the complaint terms.** Somebody here has the complaint
and does not know anything answers it.

    intercom app              voice chat with friends
    home intercom app         voice channel app
    phone intercom            audio room app
    walkie talkie app         drop in audio
    walkie talkie phone       talk without calling
    push to talk              call without ringing
    push to talk app          no ring call
    ptt app                   silent call app
    voice chat app            hands free talk app
    group voice chat          always on voice chat

**Ad group B — Tier 2, the group affinities.** Somebody here already has the
other three people, which is the thing Tier 1's arrivals still have to go and
do.

    family voice chat         gaming voice chat
    family group call         voice chat for gaming
    group audio chat          dnd voice chat
    small group chat app      band practice app
    long distance voice chat  book club app
                              talk to friends app
                              keep in touch with friends app

Plus the two brand-defence terms from the same section, in ad group A:
`the floor uninterrupted` and `the floor voice chat`. **Never the bare app
name** — that is what the account-level negatives below are for, and bidding
it would be paying to collide with flooring.

### The negatives, which matter more than the keywords

Three sets at the ad-group or campaign level, one per polluted term, and the
account-level set that is not a growth bet at all. **Enter these before the
campaign goes live, not after the first invoice.**

- **Against Ring**, the doorbell company, which § *The keyword list* calls the
  largest single way to burn this budget: `ring doorbell`, `ring camera`,
  `ring alarm`, `ring app`, `ring login`, `video doorbell`.
- **Against Intercom**, the support software, and against door hardware:
  `intercom support`, `live chat`, `helpdesk`, `door intercom`, `doorbell`,
  `baby monitor`.
- **Against two-way radio and toys**: `radio`, `frs`, `gmrs`, `ham`, `toy`,
  `kids`, `long range`.
- **Against flooring**: `flooring`, `floor plan`, `laminate`, `tile`,
  `carpet`, `hardwood`. This is the one item here that costs nothing and is
  not a growth bet at all — it refuses to have somebody else's category
  charged to this one.

  **MARKETING.md calls these *account-level negatives* and there is no such
  thing**, which is worth correcting where somebody is about to look for the
  setting. Apple Ads Advanced holds negative keywords at campaign level and at
  ad-group level, and nowhere above campaign. So the intent behind the phrase —
  *entered once, inherited by everything after* — is not available, and what
  replaces it is a standing obligation: **this set goes into every campaign
  this account ever runs**, round two's Discovery campaign included, where it
  matters more than here because Search Match will be on.

**All four sets go in at campaign level, not ad-group level.** Both ad groups
inherit them, which is what you want — nothing in the pollution is specific to
a tier — and it is one list to maintain rather than two that can drift.

**They do less work here than MARKETING.md implies, and are still worth
entering.** That section's claim — *the negatives matter more than the
keywords* — is written about Search Match, which finds the pollution before it
finds the term. With Search Match off and every keyword exact, the ad is
eligible for the terms bought and their close variants, so most of the
pollution never gets a chance. What is left is exactly the close variants:
Apple counts plurals, misspellings and minor reorderings as exact, which is
enough for `no ring call` to reach Ring-adjacent phrasing. So enter them —
they cost nothing, they cover the variants, and the account-level set carries
into every campaign after this one — but do not read a low spend on polluted
terms as the negatives having earned it. Search Match being off did most of
that work.

**Two additions Tier 2 brings, which are this file's rather than
MARKETING.md's.** Both are close-variant risks introduced by terms that were
not in round one when that list was written, and both are optional:

- `do not disturb`, against `dnd voice chat`. *DND* is Dungeons & Dragons in
  the term as intended and Do Not Disturb to half the people typing it, and
  the second group is looking for a setting rather than an app.
- `ebook`, `audiobook`, `reading list`, against `book club app`. The close
  variants of that one lean toward reading apps rather than toward people who
  meet to talk about a book.

### The daily cap, which is sized to a person and not to a budget

**$20–25 a day is the budget; the cap is what the host can answer.**
§ *The cohort, where the constraint is not money* does the arithmetic: at
roughly a dollar a tap and half of taps installing, $25 a day is on the order
of a dozen installs, three cohorts a day, **eighty-odd cohorts over four
weeks, every one of them a room where a human being is supposed to answer.**

So: **start at $20, on one host, and raise it only after watching what a day
of it actually produces in `bin/cohorts`.** For the full $25, name a second
host in `COHORT_HOST_IDENTIFIERS` first — an ordered list precisely so that is
configuration rather than code.

**Tier 2 makes this tighter rather than looser, which is the one cost of
adding it.** Tier 1 alone is thin enough that the spend may not place at all,
which § *The keyword list* expects and which here was the feature rather than
the disappointment — the ceiling is a person, not money, and unplaceable money
was the ceiling protecting itself. Twelve more terms, on affinities with more
traffic behind them than complaints have, is the half of this campaign most
likely to actually place the budget. **So the cap is more load-bearing now,
not less**: hold $20 until a day of it has been watched, and treat the second
host as the thing that buys the right to $25.

### The bid strategy, which is where Search Match comes back in disguise

**Manage Bids, never Maximize Conversions.** Campaign Settings offers the two
side by side and the automated one is the friendlier-looking box. Its own
description carries the reason to refuse it: *this is an automated bid strategy
and **Search Match is required***.

**So choosing it turns Search Match on and there is no separate switch to turn
it off again.** That is the setting this section already names as the one that
quietly rewrites what you bought, and it is the whole premise of round one —
thirty-two exact terms, chosen to answer one question, with the negatives as
insurance rather than as the thing holding the campaign together. Maximize
Conversions would undo that decision without ever presenting it as a decision.
It is the single easiest way to spend this budget on something other than what
it was for.

**Bids, once Manage Bids is chosen:** start at Apple's suggested maximum CPT
per ad group and leave them. Round one is asking whether these terms convert,
not what they clear at, and a week spent tuning bids on thirty-two low-volume
exact terms is a week of noise.

### Dates, and letting the schedule enforce itself

**Set an end date four weeks out.** It is optional in the interface and worth
using: step 8 is four weeks of spend and then three to four weeks of silence,
and § *The kill rule* is explicit that a read taken the week the money stops is
taken before the only number that matters has moved. An end date makes the
four weeks a fact rather than something to remember on a busy day, and the
silence afterwards is then the default rather than a discipline.

**Name the campaign for the reader you will be in eight weeks**, not for the
one creating it — something that still says which round and which placement
when there is a Discovery campaign beside it.

### Before you leave the browser

- **Search Results is the only placement ticked.** The first choice and the
  one that makes the rest of this apply; Product Pages in particular is the
  competitor question wearing a different hat.
- **Manage Bids, not Maximize Conversions.** The automated one requires
  Search Match, which is the campaign's central decision undone by a radio
  button. Check this first; it is the most expensive thing on the screen.
- **Two ad groups, one per tier**, not thirty-two terms in one. This is what
  keeps round one's question answerable; see the section above.
- **All four negative sets entered at campaign level**, flooring included —
  there is no account level, whatever MARKETING.md says.
- **An end date four weeks out**, so step 8 enforces itself.
- **Search Match is off.** It defaults on; check it after saving, because it
  is the setting that quietly rewrites what you bought.
- **The negatives saved**, all four sets, the flooring one at account level.
- **Storefront is US only.**
- **The daily cap is the number you meant**, not the budget divided by thirty.
- **Note the start date somewhere you will find it in eight weeks.** Step 8 is
  four weeks of spend and then three to four of silence, and step 9's read is
  dated from the day the spend *stops* — § *The kill rule* is explicit that a
  read taken the week the money ends is taken before the only number that
  matters has moved.

