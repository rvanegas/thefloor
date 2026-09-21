# round2-searchmatch, as built

**The as-built record of the second campaign, written 2026-09-21 while
diagnosing why it was serving nothing, and temporary by construction.**
APPLECAMPAIGN.md is the plan and the argument; `APPLECAMPAIGN_round1-search-exact.md`
is the same kind of record for round one. This is the other half for round
two: what is actually in Apple Ads, what was changed and when, and what is
still outstanding.

**Delete it when the campaign has been run and read**, with the other two and
on the same terms — what survives moves into `decisions/`. It exists to be
read with the browser open.

Round two is the Discovery campaign APPLECAMPAIGN.md § *The buy* defers to,
where **Search Match is on by design** — the inverse of round one's central
decision. Everything in round one's file about keeping Search Match off is
about round one and does not transfer, which is the single most confusing
thing about holding both in mind at once.

## What exists in Apple Ads

| | |
| --- | --- |
| Campaign | `round2-searchmatch` |
| Campaign ID | 2144714298 |
| Status | **Running** — start Sep 20 2026 12:00 AM PT, **no end date** |
| Placement | Search Results |
| Storefront | United States, one region |
| Bid strategy | Manage Bids |
| Daily budget | $20.00 |
| Promoted app | The Floor Uninterrupted |
| Ad groups | `discovery`, one only |

And the ad group:

| | |
| --- | --- |
| Ad group | `discovery` |
| Ad group ID | 2151236743 |
| Status | Running, **Search Match ON** |
| Default Max CPT | **$1.00** since 2026-09-21; **$0.40** as created |
| CPA cap | none |
| Schedule | not scheduled |
| Audience | Reach All Eligible Users — no narrowing |
| Ads | `Default Ad`, Active, Default Product Page |

**No keywords, by design** — a Search Match ad group has none, and the
*Keywords* tab reading empty is correct rather than a symptom. It is the one
screen that looks broken and is not.

## The zero-impressions diagnosis, 2026-09-21

The campaign served nothing at all in its first day and a half: 0 impressions,
0 taps, $0.00. Everything structural was checked and every one of it was
already right — not on hold, Search Match on, ad active against the default
product page, no CPA cap, no ad-group schedule, no audience narrowing, budget
and storefront as intended, and Apple offering no recommendations.

**Round one is the control that made the answer legible**, being the same app,
storefront, product page and account:

| | round1 Group A | round1 Group B | round2 `discovery` |
| --- | --- | --- | --- |
| Ran | Sep 18 10:00 → Sep 20 10:15 PT | same | Sep 20 → |
| Bid cap | $0.64 | $0.64 | $0.40 |
| Impressions | 555 | 0 | 0 |
| Taps | 7 | 0 | 0 |
| Avg CPT paid | **$0.38** | — | — |

Group A ran at roughly 275 impressions a day. Round two had comparable time and
produced nothing, so the shortfall is not low volume — **the bid was the only
material difference**, and it was raised $0.40 → $1.00 on 2026-09-21.

**The reasoning is that Search Match does not buy round one's keywords.** It
generates broad head queries, where the competition is funded messaging and
voice apps rather than the obscure complaint terms round one won at $0.38. A
cap that clears a niche exact auction can lose every broad one, and losing
every auction reads as zero rather than as few — which is why zero did not
mean a misconfiguration here.

**The cap is a ceiling and not a price**, which is what makes the raise cheap:
round one capped at $0.64 and paid $0.38. Nothing is spent unless it wins, and
the $20 daily budget bounds the day either way.

### It also answered round one's question, in the negative

**Group B took 0 impressions in two days at the same $0.64 cap that won Group A
555.** Tier 2 — the group affinities — appears to have no search volume at all.
That is round one's result rather than round two's, and belongs in round one's
write-up when it is read; it is recorded here because this is the session that
measured it.

## Outstanding

- [ ] **Negative keywords: there are none.** Not one, at either level. Round
      one's file calls the flooring set a standing obligation on every campaign
      this account ever runs and says it matters *more* here, because Search
      Match finds the pollution before it finds the term. With the bid now able
      to win, that exposure is live rather than theoretical. The list to add is
      round one's 25 plus its four Tier 2 additions — `do not disturb`,
      `ebook`, `audiobook`, `reading list` — broad, at campaign level.
      **`floor` stays out of it**: a bare `floor` broad negative kills the
      brand-defence terms outright, and it is the obvious thing for somebody
      tidying the list to write.
- [ ] **No end date.** APPLECAMPAIGN.md wants four weeks, and an end date is
      what makes that enforce itself rather than be remembered. Round one set
      one; round two did not.
- [ ] **Read the bid raise before reading anything else.** Reporting lags up to
      three hours and the campaign timezone is America/Los_Angeles while
      reporting is UTC, so give it a full day before concluding the raise
      worked or did not.

## The trap that costs ten minutes

**Deep links into Apple Ads do not hold.** Navigating straight to a campaign or
ad group URL redirects to whatever the console last had, which during this
session repeatedly landed on *round one's* settings while the intent was round
two's — close enough to edit the wrong campaign without noticing. Click through
from *All Campaigns* instead, and confirm the campaign name in the breadcrumb
before touching a field. The ad group settings page prints
`CAMPAIGN NAME: round2-searchmatch` above the ad group name, which is the check
worth making.

**The page also renders its controls late.** Search Match and Audience read as
plain unselected boxes for a second or two before the toggle and the blue
selection border appear, so a screenshot taken too early says a setting is off
when it is on.
