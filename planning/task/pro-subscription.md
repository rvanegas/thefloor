# Pro subscription

**Sell *Pro*: $2 a month, through the App Store, for transcription without the
weekly limit.** Donations stay on the Ko-fi link and are not part of this —
`decision/2026-10-19-donations-stay-on-ko-fi-and-in-app-purchase-sells-pro.md`,
which reverses the plan this file used to carry (moving donations to in-app
purchase) and says what survived it.

## Built, 2026-10-19, and off until the product exists

Nothing changes for anybody until **`APP_STORE_PRO_PRODUCT`** is set on the box.
Unset, `GET /pro` offers nothing and Floor Settings draws no card. That is what
lets the build ship ahead of App Store Connect, and what takes Pro off sale
again by a restart — subscribers keep it to the end of their period.

- **Server** — `server/src/pro.ts` and `appStore.ts`. Apple's signature is
  checked against the G3 root in `server/certs/`, production then sandbox. One
  `pro_subscriptions` row per original transaction holds the furthest period
  shown; active while unexpired (plus `PRO_LEEWAY_MS`, a day) and unrevoked.
  `GET /pro`, `POST /pro/apple`, and `POST /app-store/notifications` for
  renewals, lapses and refunds. `transcribesFreely` is the hand-set mark **or**
  Pro, so recorded and live transcripts both stop being metered.
- **App** — `state/purchases.ts`, watched from `AppProvider` while somebody is
  signed in: every transaction uploaded and **finished only on the server's
  200**, what the store holds swept at launch. The Pro card in
  `HomeSettingsView`: the store's price, the terms and privacy links and
  restore that App Review asks for, then *until when* and Manage subscription.
  iPhone only to buy; being Pro shows everywhere. `purchases.web.ts` keeps
  StoreKit out of the web bundle.
- **Words** — `/privacy` has a Pro section on the cohorts condition (sold now,
  or subscriptions recorded) and says deleting the account does not cancel it.
  GLOSSARY *Pro (the subscription)*, set against the *Pro* transcription model.

Choices made rather than asked, each easy to revisit: the `appAccountToken` is
a stored random UUID, and **decides whose a subscription is regardless of who
uploads it**; iPhone only; Sandbox subscriptions grant Pro, so TestFlight and
review see it work.

## What is left, in order

1. **App Store Connect, by hand.** The Paid Apps agreement with banking and
   tax — without it products load empty and nothing says why. The Small
   Business Program. An **auto-renewable subscription**, one month, $2 (or the
   nearest price point), in a subscription group, with a display name — that
   name is on the subscriber's bill, so it is the last cheap moment to settle
   *Pro* against the transcription model of the same name. A review
   screenshot of the card. A sandbox tester. The notifications URL,
   `https://thefloor.rvanegas.co/app-store/notifications`, version 2, under
   App Information. The standard Apple EULA is what the card links to; the
   listing's description needs the same link and the privacy policy's.
2. **The App Privacy answers**: Purchase History, linked to the user, not used
   for tracking. RELEASING.md § *The App Privacy answers*.
3. **Deploy, then set `APP_STORE_PRO_PRODUCT`** to the product id and restart.
4. **Upload; subscribe as the sandbox tester in TestFlight** — the first time a
   real StoreKit, a real signature and the real verifier meet. Sandbox months
   last minutes, so a renewal and a lapse can both be watched in an afternoon.
5. **Submit with the subscription attached**; the first one is reviewed with
   the build that carries it. The walk's step 13 has it.
6. **The delete-account confirmation** could say that a subscription carries
   on. The card and the privacy page do; that screen does not yet.
