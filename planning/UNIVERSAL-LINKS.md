# Universal links, and the file that admits the app

**Deferred on 2026-09-16, deliberately, and this file is the account of what
was not built and what it would take.** It is not a design awaiting a review:
the decision that day was that guest links open the web app and nothing else,
with an *Open in the app* button where one is appropriate. This is here so
that whoever revisits it starts from the costs rather than from the idea.

When it is built, what survives moves to `decisions/` and this file goes. If
the answer stays no for long enough that nobody is tempted, delete it anyway
— an unbuilt design nobody is considering is a file that only costs reads.

Nothing described here exists today. `server/src` serves neither
`/.well-known/apple-app-site-association` nor `/.well-known/assetlinks.json`,
`app.json` has no `ios.associatedDomains`, and nothing in `app/src` calls
`Linking.getInitialURL` or listens for a `url` event. **The app also has no
`expo.scheme`**, which is the one item on this list that the decision of the
day *does* need — see § *The button is a custom scheme, and stays one*.

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
        "components": [{ "/": "/g/*", "comment": "Guest links and seats" }]
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

**`/i/<username>/<pin>` must stay out of it, and that is a decision rather
than an omission.** `server/src/invite.ts` argues at length that the browser
is the way to *accept* an invitation — "a trip through the App Store loses it
… somebody who takes that route arrives with no relationship and nothing to
show for having been asked" — and inverts the landing page's call to action on
exactly that reasoning. Claiming `/i/*` would hand that page to the app for
everybody who already has it, which is not the population it is written for.
Whoever adds a second entry to `details` should have to argue with that
paragraph first.

## The button is a custom scheme, and stays one

**A universal link does not fire on a tap from a page already on that domain.**
Neither does a URL typed into Safari's address bar. So the *Open in the app*
button on the guest page cannot be an `https://thefloor.rvanegas.co/…` link
however the AASA is written — that navigates the tab — and it does not become
one later when universal links land. It is `thefloor://…`, before and after.

**Which means `expo.scheme` is needed by the decision that deferred all of
this**, and is the one line of the checklist below that is not deferred. There
is no scheme in `app.json` today, so a production build registers no
`CFBundleURLTypes` and the button has nothing to open. Adding it is a
`prebuild` and a new build: **no installed build can be reached by that button
until one ships carrying the scheme**, which is the ordering to get right.

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
5. **Ingestion in the app**, which is two paths and not one:
   `Linking.getInitialURL()` for a cold start and
   `Linking.addEventListener('url', …)` for a process already running. The
   cold-start URL arrives before sign-in state resolves, so it has to be held
   and spent afterwards — the native equivalent of what
   `app/src/ui/handover.ts` does with `sessionStorage` on the web, and it
   should be the same shape so that the two can be read against each other.
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

Two things would change the arithmetic, and neither has happened:

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
