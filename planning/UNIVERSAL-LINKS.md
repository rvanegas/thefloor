# Universal links, and the file that admits the app

**Deferred on 2026-09-16, deliberately, and this file is the account of what
was not built and what it would take.** It is not a design awaiting a review:
the decision that day was that guest links open the web app and nothing else,
with an *Open in the app* button where one is appropriate. This is here so
that whoever revisits it starts from the costs rather than from the idea.

When it is built, what survives moves to `decisions/` and this file goes. If
the answer stays no for long enough that nobody is tempted, delete it anyway
— an unbuilt design nobody is considering is a file that only costs reads.

No universal link exists today: `server/src` serves neither
`/.well-known/apple-app-site-association` nor `/.well-known/assetlinks.json`,
and `app.json` has no `ios.associatedDomains`.

**Two things this file said were missing have since been built, and the
corrections are the reason to read this section rather than skip it.**
`app.json` has carried `"scheme": "thefloor"` since 2026-09-16, so a production
build does register `CFBundleURLTypes` and the *Open in the app* button has
something to open. And `app/src` now calls `Linking.getInitialURL` and listens
for `url` in two places: `useChannelLink.ts` for `thefloor://channel/<id>` from
a Live Activity, and `useInviteLink.ts` for `thefloor://i/<username>/<pin>` from
the invite page. Item 5 of § *What it would cost here* is therefore already
done, twice, and is a pattern to copy rather than work to schedule.

---

## What a universal link is

An ordinary `https://` address that opens the app instead of Safari when the
app is installed, and loads the web page when it is not.
`https://thefloor.rvanegas.co/g/<token>` would stay exactly the string it is
today and gain the property that a phone with The Floor on it intercepts it.

**That one-address property is the whole of the appeal, and it is why this
would be the mechanism rather than a custom scheme.** A custom scheme fails
ugly on a phone without the app — Safari answers that the address is invalid,
and several messaging clients will not make it tappable at all. A guest link
is pasted into exactly those places, handed to somebody who may have no
install and no account. One address that works both ways is the only shape
that survives that.

## The two halves, which have to agree

**The app claims the domain.** The entitlement
`com.apple.developer.associated-domains`, listing
`applinks:thefloor.rvanegas.co`. In Expo that is `ios.associatedDomains` in
`app.json`, applied by `prebuild`. It also needs the Associated Domains
capability enabled on the App ID in the developer portal and the provisioning
profile regenerated. **This is the same shape of trap as `APNS_ENV`'s
entitlement, and fails the same way**: the file only *asks*, the profile
decides what may be claimed, and an entitlement claiming a domain the profile
does not permit is dropped without a word.

**The domain admits the app**, at

```
https://thefloor.rvanegas.co/.well-known/apple-app-site-association
```

No file extension, `Content-Type: application/json`, HTTPS, no redirects, no
authentication, under 128KB. For this app:

```json
{
  "applinks": {
    "details": [
      {
        "appIDs": ["9946JKHZUJ.co.rvanegas.thefloor"],
        "components": [
          { "/": "/i/*", "comment": "Invite links" },
          { "/": "/g/*", "comment": "Guest links and seats" }
        ]
      }
    ]
  }
}
```

**`components` is the scoping, and it is what keeps this from being a change
to every address on the domain.** Entries are matched in order and a path
matching none of them is not claimed, so `/app`, `/beta`, `/privacy`,
`/support` and the landing page keep opening in a browser with no exclusion
rule written. Matching on `?` query and `#` fragment is available, as is
`"exclude": true` to carve a hole in a broader pattern; neither is needed for
a list this short.

**`/i/<username>/<pin>` is now the *first* thing to claim, which reverses what
this section said until 2026-09-25.** It used to argue that `/i/*` must stay
out, on the grounds that `server/src/invite.ts` made the browser the way to
accept and that claiming the path would hand the page to the app for everybody
who already had it — "not the population it is written for".

`2026-09-25-the-invitation-asks-for-one-thing.md` makes that premise false. The
install is the single call to action now, and the page's own instruction is to
come back to the link and press *Open in the app*, which exists precisely
because the tap cannot land in the app by itself. Claiming `/i/*` would collapse
that two-tap return to one, and would put somebody who already has the app
straight into it rather than onto a page telling them to install what they
have.

So the `components` list to write is `/i/*` **and** `/g/*`, and `/i/*` is the
one with a measured cost behind it.

## The button is a custom scheme, and stays one

**A universal link does not fire on a tap from a page already on that domain.**
Neither does a URL typed into Safari's address bar. So the *Open in the app*
button on the guest page cannot be an `https://thefloor.rvanegas.co/…` link
however the AASA is written — that navigates the tab — and it does not become
one later when universal links land. It is `thefloor://…`, before and after.

**Which is why `expo.scheme` was needed by the decision that deferred all of
this, and it landed on 2026-09-16.** The ordering rule it came with is worth
keeping because it recurs: no installed build can be reached by a scheme URL
until one ships carrying the handler for *that* URL. The scheme being
registered is not the same as the path being understood — installed builds have
opened on `thefloor://` since build 288 and ignored `/i/` paths entirely, which
is why `tasks/the-invite-page-can-offer-open-in-the-app.md` holds the invite
page's button back until a build carrying `useInviteLink.ts` is *released*.

## What it would cost here

1. **`app/app.json`** — `ios.associatedDomains: ["applinks:thefloor.rvanegas.co"]`,
   beside the `expo.scheme` the button needs anyway.
2. **The App ID and the profile** — Associated Domains capability on, profile
   regenerated. `bin/upload-ios` passes `DEVELOPMENT_TEAM` explicitly because
   `prebuild --clean` drops it; the same clean is what re-generates this.
3. **A Fastify route** for the AASA, not a static file. The reason is the one
   the trains' not-found handler already gives: a route resolves per request
   and cannot be shadowed by a wildcard or removed by an rsync `--delete`.
   `server/public/` is served but is the wrong home for a file that must never
   go missing.
4. **A look at Caddy's site block** before believing the route is reachable.
   Caddy terminates TLS and proxies to a loopback Node; it also handles ACME's
   own `/.well-known/acme-challenge` itself. Proxying everything is the normal
   configuration and is very likely what is there — `curl` the address from
   off the box and read the body, rather than reading the Caddyfile and
   concluding.
5. **Ingestion in the app — already built, twice.** Two paths and not one:
   `Linking.getInitialURL()` for a cold start and
   `Linking.addEventListener('url', …)` for a process already running.
   `useChannelLink.ts` and `useInviteLink.ts` both do it; copy either.

   **This item used to say the hold should be "the same shape" as
   `app/src/ui/handover.ts`, and that advice was half wrong.** A cold-start URL
   does arrive before sign-in resolves and does have to be held and spent
   afterwards, exactly as `sessionStorage` holds the browser's. But a
   module-level variable in the manner of `handover.ts` cannot tell React that
   something arrived, so the effect that spends it never wakes — which silently
   loses the two commonest arrivals, somebody already signed in at launch and
   somebody who taps while the app is backgrounded. It has to be `useState`.
   See `2026-09-25-the-invitation-asks-for-one-thing.md`
   § *Why `useInviteLink` is a hook and not a line in `handover.ts`*; the
   sameness that was actually wanted is at the consumption end.
6. **A build, an upload, and the wait.** See the traps.

## The four traps

- **Apple's CDN serves the file, not this server.** Since iOS 14 the device
  asks `app-site-association.cdn-apple.com`, which fetches ours on its own
  schedule and caches it. A corrected file does not reach phones for hours or
  days, so a wrong one that has shipped is not fixed by fixing it. During
  development this is bypassed with `applinks:thefloor.rvanegas.co?mode=developer`
  in the entitlement plus Settings → Developer → Associated Domains
  Development on the device, which makes the phone fetch this server directly.
- **The file is read at install, not at tap.** A build shipped before the
  domain admitted it does not start honouring the link later without a
  reinstall. **So the AASA is deployed first and the build follows**, which is
  the same ordering rule as a wire change and for the same reason.
- **Not every tap counts** — the same-domain and typed-address rules above.
- **The user can turn it off, and iOS remembers.** Long-pressing offers *Open
  in Safari*, and once somebody takes it, that domain stops opening the app
  for them until they tap the banner at the top of the page. **So the browser
  path stays load-bearing and cannot be treated as the unhappy case**, which
  is an argument for the deferral as much as a caveat about it.

## Android, when there is an Android

The same idea under a different name — App Links —
`/.well-known/assetlinks.json`, which additionally carries the SHA-256
fingerprints of the signing certificates, plus an intent filter marked
`autoVerify`. `backlog/android-has-never-been-built-or-run.md` is why
that is not a cost today. The file is cheap to serve beside the other one when
it is, and the fingerprints are the part that will not be guessable a year
from now.

## When to revisit

**First, the reason it is deferred right now, which is not about the
arithmetic at all.** A domain change is intended. The entitlement bakes the
domain into the *build*, the association is evaluated at *install*, and Apple's
CDN caches it for hours or days — so a build claiming both domains, shipped
before the new domain serves an AASA, caches that failure and does not reliably
re-check. That is the order that fails quietly. Building this before the move
means paying the riskiest third of it twice for an intermediate state that gets
discarded, and running the trap about a wrong file that cannot be fixed by
fixing it at twice. **Wait for the domain to settle, then do it once.**

Note also that existing invite links live in other people's threads for thirty
days, so the old domain has to keep resolving `/i/*` across the move whatever
happens here.

Two further things would change the arithmetic, and neither has happened:

- **The app can hold a guest seat natively.** While a guest seat exists only
  in a browser, a link that opened the app would have to bounce straight back
  out to one, which is worse than the browser it started in. The entitlement
  is worth its cost when the destination is a room rather than a redirect.
- **Guest links become a measurable arrival path.** The bounce through a
  browser costs something only if people are taking it. Nothing counts that
  today; `bin/growth` and the leaderboard walk the invitation forest, and a
  guest who never signs up is in none of it.

Until then the button covers the case that matters — somebody already on the
page, deciding to move — and costs one line of configuration instead of an
entitlement, a capability, a CDN cache and a second address space to keep
right.
