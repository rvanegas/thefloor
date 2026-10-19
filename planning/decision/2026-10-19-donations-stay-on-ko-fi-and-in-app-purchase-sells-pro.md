# Donations stay on Ko-fi, and in-app purchase sells Pro

**This reverses half of `2026-10-03-donations-are-not-reconciled-because-they-are-moving-to-in-app-purchase.md`.**
Donations are not moving to in-app purchase. The Ko-fi link stays exactly where
it was — Support, Chip in, US storefront only by `region.ts` — and still
unlocks nothing. What in-app purchase is for instead is **Pro**: a $2-a-month
auto-renewable subscription, offered in Floor Settings on an iPhone, that makes
an account's transcription unmetered and changes nothing else.

That decision's other half stands: `bin/import-donations` stays dropped, and
what it said stays true about Ko-fi — their dashboard is the record, a donation
is matched once by address, a missed delivery can be entered by hand. It was
dropped *because* Ko-fi was going away; Ko-fi staying does not revive it, it
only means the reason was a different one.

**How it was got to.** In-app tips were built first, on 2026-10-19, replacing
the link on iPhones, and were taken out before anything landed: the ask was
that this not replace Ko-fi. What survived from them is everything that is not
about donations — Apple's signature checked server-side against the G3 root
in `server/certs`, a stored random `appAccountToken` per account that decides
whose a purchase is regardless of who uploads it, a transaction finished only
after the server's 200, and the notifications route.

**What Pro is, in the code.** `transcribesFreely` was the hand-set
`transcripts_unlimited` mark alone; it is now that mark or an active
subscription, so recorded and live transcripts both stop being metered. A
subscription is one `pro_subscriptions` row per original transaction, holding
the furthest period anybody has shown the server; it counts for a day past its
end (`PRO_LEEWAY_MS`) so that a renewal heard of late does not lapse it.
Off-sale is a restart: unset `APP_STORE_PRO_PRODUCT` and the card stops
offering it while subscribers keep it to the end of their period.

**The name collides, and was kept.** *Pro* was already the flagship grade of
*Transcription model*, a channel setting shown only to `debug` accounts. The
subscription was asked for as "pro", so that is what the screen says; the code
never calls it a bare `'pro'`, and GLOSSARY.md carries the contrast both ways.
Renaming one of them is cheap until the product exists in App Store Connect,
whose display name is what a subscriber sees on their bill.

**Deleting the account does not cancel the subscription**, and cannot: Apple
bills it, and only its owner stops it. The Pro card and the privacy page say
so, because it is the one thing somebody would reasonably assume the other
way. The delete-account confirmation does not, yet.
