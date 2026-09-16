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

One exact-match campaign. **Tier 1 only** — the twenty complaint terms in
MARKETING.md § *The keyword list, in three tiers*, which is the list rather
than this file. Tiers 2 and 3 are not in round one.

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

**What would reopen it before then:** Tier 1 failing to place the spend at all.
§ *The keyword list* already expects these twenty terms to be thin, and if
four weeks cannot spend $20 a day against them, the question stops being
*should we buy persuasion* and becomes *is there any intent here to buy* —
which is a different question, and the competitor names are the nearest place
an answer lives.

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
somebody can open it and type — and because four of these settings are the
difference between a test and a donation.

**Advanced, not Basic.** Basic is the one Apple pushes: you give it a budget
and it chooses the terms. That is the opposite of this campaign, whose whole
question is *do the complaint terms convert* — a product Apple picks the
keywords for cannot answer it, and it cannot hold negatives either. If the
interface is offering a single budget box and no keyword list, it is the wrong
one.

### One campaign, one ad group

**Campaign:** storefront United States only. Every number in
§ *What a tap costs* is a US number, and a second storefront halves the signal
on the only question round one asks. **Budget:** no lifetime cap; the daily
cap is the control — see below. **Search Match: OFF.** It is on by default and
it is the single most expensive default here: Search Match is how `no ring`
finds Ring and how `intercom app` finds helpdesk software, and the negatives
below exist to survive it rather than to invite it. Discovery is round two and
is where Search Match belongs, on purpose and on its own budget.

**Ad group:** one, holding Tier 1 only. Tiers 2 and 3 are not in round one —
§ *The buy*. An ad group per tier is what MARKETING.md specifies and is right
once there is more than one tier; with one tier it is one ad group, and adding
the others later is adding ad groups rather than rebuilding.

**Default product page**, since there are no Custom Product Pages — § *Two
deviations*, where that is recorded as a real cost rather than an oversight.

### The keywords: Tier 1, exact match, all twenty

From MARKETING.md § *The keyword list, in three tiers*, which is the list
rather than this file. **Exact match on every one**, which in Apple Ads means
entering them in the Exact field rather than Broad — broad match is Search
Match wearing a different hat and lands you in the same polluted searches.

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

Plus the two brand-defence terms from the same section:
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
- **Account-level, against flooring**: `flooring`, `floor plan`, `laminate`,
  `tile`, `carpet`, `hardwood`. **Account level rather than campaign level**,
  deliberately, so that round two and everything after inherit them without
  anybody remembering to. This is the one item here that costs nothing and
  refuses to have somebody else's category charged to this one.

### The daily cap, which is sized to a person and not to a budget

**$20–25 a day is the budget; the cap is what the host can answer.**
§ *The cohort, where the constraint is not money* does the arithmetic: at
roughly a dollar a tap and half of taps installing, $25 a day is on the order
of a dozen installs, three cohorts a day, **eighty-odd cohorts over four
weeks, every one of them a room where a human being is supposed to answer.**

So: **start at $20, on one host, and raise it only after watching what a day
of it actually produces in `bin/cohorts`.** For the full $25, name a second
host in `COHORT_HOST_IDENTIFIERS` first — an ordered list precisely so that is
configuration rather than code. Tier 1 is thin enough that the spend may not
place at all, which § *The keyword list* already expects and which here is the
feature rather than the disappointment.

**Bids:** start at Apple's suggested maximum CPT and leave them. Round one is
asking whether these terms convert, not what they clear at, and a week spent
tuning bids on twenty low-volume exact terms is a week of noise.

### Before you leave the browser

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

