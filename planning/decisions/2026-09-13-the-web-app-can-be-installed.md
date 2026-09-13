# The web app can be installed, and the checklist says so

2026-09-13.

## What was asked for

A getting-started checklist item offering to install the web app, shown to
somebody who has not installed it. One rung, in
`ui/Introduction.tsx`.

## What that turned out to require first

**The web app was not installable at all**, which the request could not have
known and which makes the rung worthless on its own — a checklist item nobody
can tick is the one failure mode a checklist has. The export Expo produces
carries no manifest and none of the Apple tags, and what was being served at
`/app` and `/beta` was a page like any other: Chrome offered nothing, and an
iOS *Add to Home Screen* made an icon that reopened Safari, so
`display-mode: standalone` could never answer *yes* and the rung could never
go away.

So the work is in two halves and the first is the larger:

- **`app/public/`**, which Expo copies verbatim to the root of the export —
  `manifest.json`, two PNG icons and an `apple-touch-icon.png`, all resized
  from `assets/icon.png`.
- **`server/src/shell.ts`**, which puts the manifest link and the Apple meta
  tags into the shell as it is served.

## Why the server writes half of it

One export is served at two prefixes, and both halves of the pairing have a
constraint that rules out the obvious place to put it.

**Every URL inside `manifest.json` is relative** — `"./"`, `"./icon-192.png"`
— because a manifest is resolved against its own address, so one file is
correct at `/app/manifest.json` and at `/beta/manifest.json` and for a local
`expo start --web` at the root. An absolute path would aim one train at the
other's bundle.

**The `<link rel="manifest">` cannot be relative**, for the mirror of that
reason: the shell is returned for every route the single-page app has, so on
`/app/channels/<id>` a relative href would ask for
`/app/channels/manifest.json`. The server is the only party that holds both
the HTML and the prefix it is answering under, so it writes that tag, and the
Apple ones alongside it. It is string surgery on generated HTML; the
alternatives are a build step per train or a second copy of the bundle.

`apple-mobile-web-app-capable` is the load-bearing one. Without it the icon
opens in Safari rather than standalone, which is both a worse result and an
undetectable one.

## No service worker, and therefore no promise of notifications

**An installed browser app is exactly as unreachable as the tab it came from.**
There is no service worker in this project and no web push, so what installing
buys is an icon, a window without browser chrome, and a way back — and the
rung's note says that and nothing more. The neighbour it must not be confused
with is `ui/installNotice.ts`, which asks somebody to get the App Store app
*because a browser cannot notify you*; the two sit in the same tier, and
having them both claim to solve reachability would make one of them a lie.

That absence has a second consequence worth knowing: Chrome dropped the
service-worker requirement for the install item in its own menu (108 on
mobile, 112 on desktop) but still wants a `fetch` handler before it fires
`beforeinstallprompt`. So the button of our own is the rare case, and the
usual rung is a sentence naming where the browser keeps the command.

## Which browsers are told what, and which are told nothing

`state/install.ts` is the rule, pure and tested; `state/useInstall.web.ts`
reads the browser and `state/useInstall.ts` is the phone's constant *no*. Four
answers:

| Browser | What the rung says |
|---|---|
| Volunteered a `beforeinstallprompt` | A button that installs, here |
| Safari on iOS or iPadOS | *Tap Share in Safari, then Add to Home Screen* |
| Chromium, Safari on macOS, Firefox on Android | *Open your browser's menu and choose Install* |
| Anything else — desktop Firefox, an in-app browser | **Nothing at all** |

The last row is the point of the `menu` flag. Desktop Firefox has no install
command anywhere, and an in-app browser has no *Add to Home Screen* in a
`WKWebView` — telling either to go and find one sends somebody hunting for a
menu item that does not exist, which is worse than silence.

It is user-agent sniffing, and there is no alternative: the question being
asked is *where in your chrome is the command*, and no API answers it.
`core/embedded.ts` makes the same argument at greater length, and is reused
here for the in-app case rather than copied.

## The rung itself, and why it is never ticked

Between *get somebody here* and *step in* on the ladder: not first, because
nobody installs an app they have not decided to keep, and not last, because
stepping in is what the whole thing retires on and nothing may sit below it.

**Nothing is stored and nothing is ticked.** A browser running the installed
app says so, so the rung is simply not drawn — its absence is the tick. That
is what keeps it right across machines: install on the laptop, open a tab on
another, and the rung is back, which is honest, because on that machine it
has not been done.

**It joins the `invited` card too**, which is the one thing that has been
allowed to join it. The argument against making that card a list is that both
its items are born ticked and congratulating somebody on what was done for
them is theatre; this is neither of those. Without it the feature would be
invisible to the cohort most people arrive in.

## What was left alone

- **No service worker**, and so no offline mode and no web push. That is a
  feature with its own privacy and staleness questions, and none of it is
  needed to put an icon on a home screen.
- **The manifest's two colours are hardcoded**, `#F5F6F8` from the light
  palette. `ui/theme.ts` is the one source of colour in the app and a static
  JSON file cannot read it; the alternative was generating the manifest per
  build, which costs more than the drift is worth. There is deliberately no
  `theme-color` meta tag, so that is the only copy.
- **`MIN_SUPPORTED_BUILD` and SHIMS.md are untouched.** Nothing here is a wire
  change: an older client is served a shell with tags it ignores.
