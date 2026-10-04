# Donations are not reconciled, because they are moving to in-app purchase

The backlog entry *Donations arrive by webhook alone, and nothing reconciles
them* proposed `bin/import-donations`, which would read a Ko-fi CSV export to
fill in deliveries the webhook missed and to match donations paid from an
address nobody had signed in with. **It is dropped, not deferred: donations are
moving to in-app purchase anyway**, and a tool for reconciling Ko-fi's records
has nothing to do once Ko-fi is no longer how anybody pays. With in-app
purchase, the purchase arrives already tied to the account that made it.

What stays true until the move:

- **Ko-fi's dashboard is the authoritative record** and the `donations` table
  is a convenience copy. A delivery missed while the server was restarting
  exists only there, and Ko-fi has no read API to recover it.
- **A donation is matched to an account once, when it arrives, and never
  again.** The match compares the payer's address with
  `accounts.identifier`, so somebody who gives first and signs in with that
  address later is never credited. That was found while reviewing the entry on
  this date and is left unfixed for the same reason.
- **A missed delivery that matters can still be entered by hand.** `db.ts`
  carries the `INSERT` for it, with `matched_by = 'manual'` and `raw` null.

Two flaws in the dropped plan, worth knowing if anyone revives it: the
fallback key, a hash of timestamp, address and amount, would never collide
with a webhook row's real transaction id, so importing an export would count
every donation the webhook already recorded a second time. And the work was
deferred for want of a real export, which by now Ko-fi's dashboard can
probably supply.

The `donations` table and its rows stay. They are money that changed hands,
and whatever replaces Ko-fi has to decide what becomes of them.
