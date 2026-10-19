# Payments Upgrade

**Move donations from the Ko-fi link to in-app purchase.** Decided on
2026-10-03 — `decision/2026-10-03-donations-are-not-reconciled-because-they-are-moving-to-in-app-purchase.md`,
which also dropped `bin/import-donations` and says what stays true about Ko-fi
until the move. What it replaces is in the archive, *Donations, by a link out
rather than in-app purchase* (`DECISIONS-2026-08-13-to-2026-08-15.md`).

Stripe is no longer a contender. Its one advantage was exact attribution, and a
purchase carrying an `appAccountToken` arrives tied to its account too; being a
link out, it is also confined to the US storefront by Guideline 3.1.1(a), the
same as Ko-fi (`server/src/region.ts`).

## It does not wait on SDK 56

Measured 2026-10-19 by a spike that was then dropped: **`expo-iap` 5.8.3, with
its `openiap` 3.6.1 pod, builds for a device on SDK 55 with Xcode 26.3** — so
none of this needs macOS 26, which SDK 56's Xcode 26.4 does. The app links
StoreKit; the config plugin's only change to the generated project is a
CocoaPods source line in the Podfile, with **no entitlement and no
`Info.plist` key**. `fetchProducts`, `requestPurchase` with an
`appAccountToken`, `finishTransaction` and `purchaseUpdatedListener` typecheck
from this codebase. Add the dependency in the commit that first calls it, not
before; `npm install expo-iap@~5.8.3` and `"expo-iap"` in `app.json`'s
`plugins` is the whole of it.

**It is developed against SDK 57**, so recheck it at every SDK hop rather than
assuming. `react-native-iap` is the alternative and needs
`react-native-nitro-modules` as well.

## The order

1. **App Store Connect, by hand, and it gates everything.** The Paid Apps
   agreement with banking and tax — without it products load empty in
   TestFlight and nothing says why. The Small Business Program, which halves
   the commission. The products, as **consumables** (`co.rvanegas.thefloor.tip.*`,
   a few amounts), each with a review screenshot. A sandbox tester.
2. **The server, deployed before any client speaks to it.**
   - A **new table** for Apple purchases keyed on `transactionId`, rather than
     columns on `donations`, which is keyed on `kofi_transaction_id` and whose
     `matched_by` allows only `email` and `manual`. `Donations.forAccount`
     sums both, so the thank-you counts both.
   - **`POST /donations/apple`**: the client sends the signed transaction; the
     server verifies Apple's JWS with `@apple/app-store-server-library`, checks
     the `appAccountToken`, records, returns totals. Idempotent on
     `transactionId`.
   - **App Store Server Notifications V2** for refunds, at a second endpoint.
     They are signed by Apple and need no key; an In-App Purchase `.p8` is
     needed only to call Apple's API, and would go in CREDENTIALS.md and under
     `~/.config/thefloor` like the other two.
   - **`GET /donations`** gains the product ids beside `url`. Older builds
     ignore the field; keep `url` and the webhook for them — a SHIMS.md entry,
     retired by the build that ships purchase.
3. **The client** (`SupportView.tsx`): product buttons priced by StoreKit in
   place of `Linking.openURL`. **`finishTransaction` only after the server has
   acknowledged** — finish first and a failed upload loses the donation — and
   unfinished transactions picked up at launch. A StoreKit configuration file
   for local runs, the sandbox tester for TestFlight.
4. **Words and review.** `/privacy`'s Donations section (`server/src/privacy.ts`)
   and the App Privacy answers — Purchase History, linked to the user.
   GLOSSARY.md and STYLE.md in the same commit as the screen. A sandbox purchase
   in the APPREVIEWSCRIPT.md walk. The first products are reviewed with the
   build that carries them.
5. **Ko-fi retires once `MIN_SUPPORTED_BUILD` passes that build**: `KOFI_URL`,
   `/donations/kofi`, and — if nothing else wants them — `region.ts`, its app
   twin and `accounts.donations_allowed`. The rows stay.

## Open

- **The `appAccountToken` has to be a UUID, and account ids are not.** They are
  `acct_` and twelve base64url characters (`newId` in `server/src/db.ts`). Either
  a stored random UUID per account, or one derived from the id (v5) that the
  server recomputes — the second needs no column, and gives Apple the same
  stable identifier per account either way.
- **Android.** If the app ships on Play, Google requires Play Billing the same
  way, and the server verification doubles. iOS alone is one path.
- **One-off tips only, or monthly too.** One-off first; a subscription brings
  renewals, grace periods and the refund endpoint in earnest.
- **What becomes of the Ko-fi rows**, which the decision leaves to whatever
  replaces Ko-fi — kept and summed, most simply.
- **Whether the Ko-fi link stays in the US storefront.** If it goes, so can the
  region gate. If it stays, `getStorefront` — which `expo-iap` has — reads the
  storefront itself, where `region.ts` deliberately approximates it from the
  phone's locale and time zone because reading it would have cost a native
  module. Purchase brings that module anyway.
