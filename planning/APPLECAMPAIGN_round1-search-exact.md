# round1-search-exact, as built

**The as-built record of one campaign, written 2026-09-15 while it was being
created, and temporary by construction.** APPLECAMPAIGN.md is the plan and the
argument — why this channel, what may be spent, what the kill rule is. This is
the other half: what was actually typed into Apple Ads, which settings
defaulted wrong, and what has to be true before it is taken off hold.

**Delete it when the campaign has been run and read**, with APPLECAMPAIGN.md
and on the same terms — what survives moves into `decisions/`. Two files
rather than one because they answer different questions and are read at
different moments: the plan is read before deciding, this is read with the
browser open.

## What exists in Apple Ads

| | |
| --- | --- |
| Campaign | `round1-search-exact` |
| Campaign ID | 2144685544 |
| Status | **On hold** — start date Sep 19 2026, nothing serving |
| Placement | Search Results |
| Storefront | United States, one region |
| Bid strategy | Manage Bids |
| Ad groups | Group A (Tier 1), Group B (Tier 2) |
| Default Max CPT | $0.64 on both, Apple's suggestion, applied unchanged |

**It is on hold rather than saved as a draft, because Apple Ads Advanced has
no draft.** The creation flow is complete-or-cancel, so the campaign was
created with a start date past the release and left on hold. Everything
entered is preserved; nothing can spend. That is the draft.

## The keywords, as entered

**Ad group A — Tier 1, the complaint terms, 22 exact.** The twenty from
MARKETING.md § *The keyword list, in three tiers* plus the two brand-defence
terms, which live here rather than in B.

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
    the floor uninterrupted   the floor voice chat

**Ad group B — Tier 2, the group affinities, 12 exact.**

    family voice chat         gaming voice chat
    family group call         voice chat for gaming
    group audio chat          dnd voice chat
    small group chat app      band practice app
    long distance voice chat  book club app
                              talk to friends app
                              keep in touch with friends app

**Two ad groups rather than one is the whole reason this is readable.** Pooled,
thirty-four terms return one number and Tier 2 converting well reads as Tier 1
working — and *do the complaint terms convert* is the only question round one
answers. See APPLECAMPAIGN.md § *The buy*.

## The negatives, 25 at campaign level, broad

    ring doorbell, ring camera, ring alarm, ring app, ring login, video doorbell,
    intercom support, live chat, helpdesk, door intercom, doorbell, baby monitor,
    radio, frs, gmrs, ham, toy, kids, long range,
    flooring, floor plan, laminate, tile, carpet, hardwood

Four optional additions Tier 2 brings, this file's rather than MARKETING.md's:
`do not disturb` (against `dnd voice chat`, which is Do Not Disturb to half the
people typing it), and `ebook`, `audiobook`, `reading list` (against
`book club app`, whose close variants lean toward reading apps).

**Campaign level, so both ad groups inherit them.** Nothing in the pollution is
specific to a tier, and one list cannot drift from itself.

### `floor` is the one that must never be shortened

Broad negatives are the sharper instrument and can silently kill terms you are
paying for. All 25 were checked against all 34 positives and none collides —
`live chat` needs both words and no positive has *live*; `long range` needs
both and only `long distance voice chat` has *long*; `radio`, `kids`, `toy`,
`ham` and `doorbell` appear in nothing bought.

**The near-miss is `floor`.** The brand-defence terms are
`the floor uninterrupted` and `the floor voice chat`. The flooring negatives
are `flooring` — a different token — and `floor plan`, which broad-matches
only when *both* words are present. **A bare `floor` broad negative would kill
the brand defence outright**, and it is the obvious thing for somebody tidying
the list to write.

## The four settings that default wrong

Every one of these was found by creating the campaign rather than by planning
it, which is why this file exists.

1. **Bid strategy — Maximize Conversions requires Search Match.** Its own
   description says so. Choosing the friendlier-looking box turns Search Match
   on with no separate switch to turn it off, which undoes the campaign's
   central decision without presenting it as one. **Manage Bids.**
2. **Search Match defaults ON, per ad group**, and re-defaults there even when
   the campaign is set to Manage Bids. It is a toggle in Ad Group Settings.
3. **Keywords default to broad; negatives default to exact.** The inverse of
   what this campaign wants, and not an accident — Apple's defaults maximise
   volume and spend, where this campaign buys a readable answer. **Match type
   is fixed at creation**: changing it means adding the keyword again with the
   right type and pausing or deleting the original.
4. **End date is optional and starts at one day.** Four weeks is the plan;
   Sep 19 + 28 days. An end date makes step 8 enforce itself rather than be
   remembered.

**And a fifth that is not a setting: there is no account-level negative
keyword.** MARKETING.md says the flooring set goes in at account level and no
such level exists — campaign and ad group only. So that set is a standing
obligation on every campaign this account ever runs, and it matters more in
round two's Discovery campaign, where Search Match is on by design.

## Outstanding before it comes off hold

- [ ] **Search Match off** on Group A and Group B. It read `On` for both in
      the ad-group table as of 2026-09-15 and is the one item here that makes
      everything else moot.
- [ ] **Match type confirmed exact** on all 34 keywords — check the Match Type
      column under *All Keywords*, adding it via *Edit Columns* if hidden.
- [ ] **End date set** four weeks past the start.
- [ ] **build/213 released**, which is APPLECAMPAIGN.md step 5 and carries both
      the cohort card and the level 3 header.
- [ ] **A cohort host named** in `COHORT_HOST_IDENTIFIERS`, and the daily cap
      sized to what that one person can answer — $20, not $25, until a second
      host exists.
- [ ] **The listing metadata shipped with 213.** Apple assembles the ad from
      store assets, so **the listing is the creative** — there is no ad copy to
      write, and the subtitle and description riding that submission are what
      the ad will say. The invite-link sentence is the one that decides whether
      a bought install ever recruits a second person.

## The open question this file cannot answer

**Whether a one-day smoke test runs first.** It was raised, then deferred to
wait for the release, and never settled either way. A day at $20 would replace
the uncosted ~$1-a-tap assumption in MARKETING.md § *What a tap costs* with a
measurement — Apple's suggested bid of $0.64 already hints the budget stretches
further than planned — and would prove the machinery serves at all. It tells
you nothing the kill rule reads.

**Decide it before unpausing**, because it changes what the first read means
and when the four weeks start.

## What this campaign can and cannot tell you

**Can:** whether thirty-four exact terms serve at all; what a tap actually
costs; whether the negatives are blocking something bought; whether Tier 1 and
Tier 2 differ, which is the thing the two ad groups exist to separate.

**Cannot:** anything in the kill rule, for three to four weeks after the spend
stops. Every paid arrival lands in **alone**, indistinguishable from word of
mouth and a passed-on link, so *alone* rising proves nothing. What counts is
first circle and onward in `bin/growth`'s `classes`, `weeks` and `roots`.
Installs will look fine throughout and mean nothing.
