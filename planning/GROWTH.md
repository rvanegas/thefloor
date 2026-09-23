# Driving growth, from what the numbers say

**Written 2026-09-23, against a measurement taken that morning.** MARKETING.md
is the standing argument — why the unit of acquisition is a group, what the
fourteen levels are, which channels are worth the effort and what marketing may
not do. This file does not restate any of it. It is the other half: **what the
production numbers actually say on one dated morning, what that changes about
the order of the work, and the plan that follows.**

**The figures below are perishable and the plan is not.** At thirty-one people
every number here moves on one person's week, so a session reading this in a
month should re-take the measurement with `bin/growth` before trusting a single
row — § *How it is read back* says which reports. What should survive
re-measurement is the ordering, and where it does not, that is the finding.

**Delete it when the tracks below are done and read**, on APPLECAMPAIGN.md's
terms; what survives moves into `decisions/`.

## Contents

| § | Answers |
| --- | --- |
| *The measurement* | What was true on 2026-09-23, by level |
| *What the measurement changes* | The four places it contradicts the standing plan |
| *The plan* | Five tracks, ordered, with what each is waiting on |
| *How it is read back* | Which `bin/growth` report judges which track |

## The measurement

Taken 2026-09-23 against production. Thirty-one accounts, six weeks of them.

**The loop closes, and this is the finding that reorders everything else.**

| Level | Report | What it said |
| --- | --- | --- |
| 9, 10 | `pings` | **47 sent, 24 answered — 51%.** Of the answers, 63% came in under thirty seconds |
| 11 | `groups` | **45 active channels, 22 used on a second day — 49%**, ten of them with three or more people |

Levels 10 and 11 are two of the three MARKETING.md § *The three levels worth
all the attention* names, and they are the two hardest in the table. They are
not leaking. **A plan built on the assumption that this product does not work
would be built against the evidence.**

**The blockage is level 6, which is the third of those three.**

| Contacts | People | Share |
| --- | --- | --- |
| none | 4 | 13% |
| **exactly one** | **15** | **48%** |
| two | 5 | 16% |
| three to five | 5 | 16% |
| six or more | 2 | 6% |

**Seven people of thirty-one have reached level 6.** The median account here
holds one contact, which is one possible room and one possible person in it.
MARKETING.md predicted this level would be the leak and did so before there
were numbers; the numbers agree.

**A shape the standing documents do not predict.** Of 102 channels ever made,
**60% are pairs** and 2% hold six. The app is being used as a two-person tool.
Two readings fit — level 6 is strangling the thesis, or the thesis is meeting
the world — and **this measurement cannot separate them**, which is worth
recording rather than resolving by preference.

**There is no bridging work available.** Five islands; the largest holds 27 of
31 (87%) and the other four are islands of one. **Pending requests: zero.
Bridges the pending asks would form: zero.**

**Reachability is unknown rather than bad.** `notify` reports 9 granted, 2 not
yet asked, 20 *nobody has said*. The instrumentation landed 2026-09-16, so the
twenty are overwhelmingly accounts that have not opened a new enough build.
**Reading 65% as a refusal rate is the mistake this paragraph exists to
prevent.**

**The cohorts have not been tested.** Two exist, made 2026-09-15, five people
in them, and `came_back` is empty. Level 4 has no result either way.

## What the measurement changes

Four places where it contradicts, or reorders, what the standing documents
assume.

**1. The warmest growth prompt has nothing to show.** ONBOARDING.md §
*Growth is a different thing* ranks four prompts by warmth and rests tier 1 on
*outstanding requests are not swept, so a bridge can sit there indefinitely* —
an existing backlog of one-tap merges. **That backlog is empty: zero pending,
zero bridges.** Tier 3, the outgoing half, is empty for the same reason. So the
design is right about the ordering and wrong about which rung is reachable
today, and **tier 2 is not merely first to build, it is the only warm one that
exists.**

**2. Paid ran ahead of its own gate, and the gate is still shut.**
MARKETING.md § *The sequence* item 6 says Apple Search Ads is "genuinely
waiting on 2 and 5". Item 2 is closing the listing, and LISTING.md §
*The description is one revision behind* records that the live description is
the 2026-09-03 draft, whose fifth gap is that **it never mentions the invite
link** — the app's own viral primitive, shipped in 1.4.0. Item 5 is the
cohorts, which have one untested day. **Both rounds of spending therefore
bought traffic onto a page that does not carry the sentence the recommender
needs.** APPLECAMPAIGN_round2-searchmatch.md has the campaign's own state.

**3. The funnel's healthy half should be watched for regression, not
improved.** 51% and 49% are good numbers to hold, and effort spent raising them
is effort not spent on the level where half the population is stuck.

**4. The demand question is not answered by the ad result and was never going
to be.** A campaign that took 7 taps for $2.66 measures nothing, and the
channel delivers individuals to a product whose unit is a group. **The evidence
that people want this is the nineteen invitations that were sent and accepted
with no marketing at all** — and the evidence against is that nine of twelve
roots brought nobody, and `onward` stands at one person.

## The plan

Five tracks. A and B are product work and are the highest-return marketing on
the list, which is MARKETING.md § *Organic, ranked* item 1 stated against
measured numbers rather than in principle.

### Track A — level 6, the second and third contact

Where 48% of the population is stuck.

- **A1. Build the standing growth card**, to ONBOARDING.md's design: one card
  in Home's pinned tier beside `InstallNotice` and `NotificationNotice`, the
  warmest available prompt and nothing else, at most one showing a day, the day
  spent when the card appears. **Build tier 2 first and tier 4 second**, per §
  *What the measurement changes* item 1 — tiers 1 and 3 have nothing to render
  today and will fill in on their own once there is a backlog. Tier 2 is *add
  the guest who was just in your channel*: the action is already coded as
  `ASK_GUEST_CONTACT` in `core/channel.ts` and wired in `ChannelView.tsx`, and
  **nothing prompts for it at the moment it would land**, which is while the
  guest is still in the room.
- **A2. `ContactsView` card ordering** — the invite link belongs above the
  address field when `contacts.length === 0`, rather than being worked around
  in checklist copy. ONBOARDING.md § *Three things the campaign exposes*
  item 3.
- **A3. Make the guest link outlive an empty channel.** *Send a link, they will
  join later* is the mental model people actually have, and the link dies the
  moment the channel holds no members. Either the lifetime changes or the copy
  has to say *stay here*; the first is the one that serves the primitive. Same
  section, item 2.

### Track B — level 3, and the account that can never be asked

- **B1. Teach `notificationAsk.ts` that an invite link counts.** `worthAsking`
  stands on `somebody` — a contact, a rejoinable channel, or an invitation —
  and **minting or sharing an invite link creates none of those**, since the
  contact row appears only when the other person opens it. So the most likely
  first act of an arrival with nobody leaves no trace in all three signals, the
  pitch never fires, and that account cannot be told their friend has just
  signed up. ONBOARDING.md calls this "the serious one" and the measurement
  does not contradict it.
- **B2. Re-read `bin/growth notify` no earlier than 2026-10-07**, once builds
  have rolled, and before concluding anything from it. See the reachability
  paragraph above.

### Track C — the listing, which is the cheapest item here

LISTING.md § *The checklist, in order of what it costs* is the procedure; this
is the priority against it.

- **C1. Promotional text.** No review, live within the hour, and it is the
  recommender's sentence. There is no reason for this to be outstanding.
- **C2. Subtitle, keywords and description ride the next submission.** None
  justifies a review cycle of its own and all three should go in the moment one
  is happening. The description is the one that closes the invite-link gap.
- **C3. Raise the category dispute** at the next `bin/submit-ios`. Live is
  primary Utilities, secondary Social Networking; the 2026-08-27 decision was
  the reverse. **Both records are confident and they disagree**, so it is a
  question to ask rather than a change to make.

### Track D — outside the app

MARKETING.md § *Organic, ranked* items 2 through 5, in its order, gated as its
§ *The sequence* gates them.

- **D1. Composed imagery**, which is the half still missing — a Product Hunt
  gallery, a social card, an Instagram frame. The captures exist in
  `assets/store/`; nothing composed does. **This gates D3**, since a launch
  post without imagery is a post that was not made.
- **D2. Communities that already contain whole groups.** Zero cost, higher
  credibility than paid, and the targeting logic transfers. **Arrive as a
  participant**; every one of these communities punishes the reverse.
- **D3. The launch surfaces** — Show HN, Product Hunt, the subreddits where the
  complaint is native. **Post the thesis, not the feature list**: this app loses
  a feature comparison and wins the argument, and the value is
  disproportionately in the comments.
- **D4. Write the argument down in public.** PROPOSITION.md stripped of its
  roadmap half is a better piece of persuasion than any landing page because it
  is not selling anything. Slowest channel, only compounding one.

### Track E — paid, which stops

- **E1. Stop `round2-searchmatch` rather than repair it.** It is waiting on C
  and on a cohort result; its money lands on a page that omits the invite link;
  and by its own design it needs thirty-two exact negatives it does not have.
  **Revisit after C1, C2 and D1**, not before.

## How it is read back

One report per track, monthly, and **the number to move is named rather than
left to judgement.**

| Track | Report | The number |
| --- | --- | --- |
| A | `bin/growth pairs` | **Fifteen people holding exactly one contact.** That is the figure the whole track exists to reduce |
| A | `bin/growth channels` | Whether the three-to-five band grows against the pair band — the § *a shape* question |
| A | `bin/growth islands` | Whether `onward` leaves one, and whether pending asks appear at all |
| B | `bin/growth notify` | *nobody has said* falling as builds roll, then the granted share among people who have somebody |
| C, D | `bin/growth classes` | `alone` swelling with nothing under it is the scattered-install failure, made visible |
| — | `pings`, `groups` | **Watched for regression, not for improvement** |

**Expect the first two reads to be ambiguous**, on APPLECAMPAIGN.md § *The kill
rule, written before the money*'s reasoning and for the same cause: the volumes
are small enough that ordinary variation swamps the effect. Direction, not
magnitude.

## What this plan may not do

Not restated here, because a duplicated constraint is one that goes stale:
**MARKETING.md § *What marketing may not do* governs every track above**, and
the three that bite this plan specifically are no re-engagement notification or
email of that shape, no directory or suggested contacts or address-book upload,
and no incentivised referral. Track A is entirely inside those lines, and that
is not a coincidence — the constraints are what leave the recommender's own
tooling as the highest-return work available.

**One thing the tracks above do not carry: a task file each.** None of A1
through E1 exists in `tasks/` as this is written. They are listed here as a
plan rather than promoted to the roadmap, and a session acting on one should
make the file with `bin/task` at the moment it starts.
