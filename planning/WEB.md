# The web app

**A design for unbuilt work.** Delete it when the work ships, moving whatever
survives into `decisions/DECISIONS.md`. Nothing here is running.

It answers `TASKS.md` § *Web UI* — "Should be able to run app in web" — and it
is written after a spike rather than before one, because the whole question was
how much of the existing UI survives a browser and that is not a thing to
estimate. The spike is commit `8b8c059` on `worktree-web-spike`, which is
throwaway; this document is its durable half.

## The premise, which decides most of the rest

**The web app is a secondary interface. The phone is the referential
install.** Somebody is expected to install on a phone and reach for the browser
as a convenience — a laptop already open, a machine that is not theirs, a
keyboard for the clipboard.

Nearly every scope decision below follows from that sentence rather than from a
technical limit, so it is worth arguing with directly if it ever stops being
true. It is why notifications are skipped: a secondary interface has no
business waking anybody, and the phone is already there to do it. It is also
why file upload is *not* optional — picking a file is the one thing a laptop
does better than a phone, so it is among the reasons to open the browser at
all rather than a feature ported for completeness.

## What the spike established

The iOS UI ports essentially wholesale under `react-native-web`. `ChannelView`
— 2,356 lines — renders in a browser with correct state: participants, the
floor card, clipboard, watch-together, shared audio, recording, invite, guest
link. No console errors. `AuthView` and `HomeView` likewise, the socket
connects, `/home` arrives.

**The cost to get there was three web-only files and two edits to shared
files**, not eight thousand lines retyped:

| File | Why |
| --- | --- |
| `index.web.ts` | replaces `index.ts`, whose whole body is iOS audio setup |
| `livekitReactNative.web.ts` | `@livekit/react-native` reaches `react-native-webrtc`, which calls `requireNativeComponent` — an API `react-native-web` has removed, so the import throws before any of our code runs |
| `useSessionAudio.web.ts` | the native hook with the `AVAudioSession` half gone |

Bundle: 1.51 MB raw, **405 KB gzipped**, 582 modules.

Two measurements worth keeping. `Pressable` renders as a real
`<button role="button">`, so the semantic-HTML cost of `react-native-web` is
lower than assumed. And the layout is fluid with no maximum: at a 1600px
viewport the *Claim the floor* button measures 1534px wide. That is a container
and a few breakpoints, not a redesign.

**Audio was not tested end to end.** The machine had no LiveKit and no Docker,
and the two ways to get one were installing a media server or pointing at
production. Neither was worth it for a path `server/web/guest.ts` already
proves in production: `livekit-client` → `attach()` into the document →
`startAudio()`.

## Decisions

### It is `react-native-web`, bundled by Expo

Metro resolves React Native's dependency graph out of the box. esbuild — which
this repo already uses for the guest page — would have to cope with
`react-native`'s untranspiled Flow source, which is a bundler fight with no
upside. The guest page stays on esbuild; they do not need the same tool.

### Fastify serves it, with `@fastify/static`

Same origin, which is not a preference: **the server has no CORS at all** — no
`@fastify/cors`, no `Access-Control` headers anywhere — and an app served from
another port renders and then says it cannot reach the server. Confirmed by
`curl -H 'Origin: …'`.

This is also what `app.ts` already decided for the guest page: Caddy would mean
"a path on the box that deploys separately from the code… this way the page
ships with the server that talks to it and cannot be a version behind."

`@fastify/static` rather than a hand-rolled directory server: the existing
`/g/assets/:file` allowlist ("named rather than resolved, which is the whole of
the traversal story") cannot carry to hashed Expo filenames, and traversal
defence is where hand-rolled static servers fail. `@fastify/websocket` is
already a production dependency, so a `@fastify/*` plugin on the box is an
established pattern rather than a new one.

**`index.html` must be served `no-store`.** Hashed assets can be `immutable`,
but a cached shell means a returning visitor silently runs an old bundle —
which would falsify the premise that the web app is always current, and that
premise is what excuses it from the build census below.

### Three variants of `deploy`, not a sixth verb

`RELEASING.md` § *The five verbs* gains variants rather than a row: **deploy
server**, **deploy web stable**, **deploy web beta**. Deploying is still
deploying — it reaches everybody in a minute and is reversible — and the thing
that differs is the target.

- **stable** tracks what is on the App Store; cut from the `released` ref.
- **beta** tracks what is in TestFlight; cut from its `build/<n>` tag.

Served at two prefixes on the existing host, so there is no DNS record, no
second certificate, and same-origin holds for both.

**Built from the tag, not the working tree.** `bin/deploy` rsyncs the working
tree on purpose, but "coinciding with the App Store release" is only nominally
true unless the bundle is exported from `released` — via `git archive` or a
temporary worktree — rather than from whatever is checked out.

**Not folded into `bin/upload-ios` or the release step.** AGENTS.md is
emphatic that naming one verb does not name another, and that these are
manually triggered every time.

### The web app is a versioned client, which changes what protects it

The guest page is rebuilt on **every** `bin/deploy` and must stay in lockstep
with the server. `build.mjs` explains why a bundle is never committed, and
`bin/deploy` states the stake: "a stale bundle is a page whose behaviour is a
deploy behind its server, and nothing on it would say so." For a page with no
version, that unconditional rebuild *is* the entire compatibility mechanism.

The web app takes the other route: it gets a version and is pinned to a
release train. So it **can** fall behind the server, and the protection has to
come from the discipline that already protects iOS — *never ship a wire change
to a server before the client can speak it*, two-stepped, aliases first.

**The two browser clients therefore have opposite policies**, deliberately: a
guest seat is ephemeral, `sessionStorage`, no install, and lockstep is free;
the web app is a client with users and a train. Written down here because the
next person will otherwise "fix" one to match the other.

### It reports a build number, and nothing is silent

The web client sends the **App Store build number of the train it was cut
from**, read from `app.json`'s `ios.buildNumber` at the exported tag and
inlined at export as `EXPO_PUBLIC_BUILD`. Correct by construction: the stable
train is cut from `released`, the beta train from `build/<n>`, and neither
needs hand-syncing.

`build.ts` reads `nativeBuildVersion` rather than `app.json` because Xcode's
re-signing has been observed bumping `CFBundleVersion`. **That objection does
not apply here** — there is no signing step and the bundle is the artefact — so
a `build.web.ts` returning the injected constant is sound rather than a
shortcut.

Two things follow. `heartbeatTimeoutFor` keys the 5s cadence on `build >= 110`,
so a web client reporting a real build gets the fast path instead of the legacy
12s one. And `MIN_SUPPORTED_BUILD` now applies to web — which is consistent,
since the floor is never raised past what is released, but the expiry screen
needs a web variant: `updateUrl` points at the App Store, and what a browser
user must do is reload.

### The census counts native only

Per the decision that the census exists to measure an *installed population*,
and the web app has none — there is one live version and everyone gets it on
load.

This needs a **platform field separate from the build number**, and the reason
is worth keeping because it is counter-intuitive. Absence of a build number is
web-shaped today — production reports `silentBuilds: 0` — but it is not a safe
rule: every native build before 37 is silent too, those installs still exist,
and a returning one misfiled as web would be dropped from the census. That
number's job is to say when a shim may be deleted; misfiling it to zero would
license a deletion that strands a phone.

So platform is explicit and opt-in, and **absent means native** — not because
silence is native-shaped, but because the field will not exist in any installed
binary, and every client that can omit it shipped before it was invented. A new
field's absent-value must describe the population that already exists, since
that population is exactly the set that cannot be taught the field is there.

With the build number above, web is not silent anyway; the platform field is
what keeps it out of the count.

## Traps found, both verified

**`--exclude 'app/'` matches at any depth.** rsync patterns without a leading
slash match a directory of that name anywhere, so a bundle exported to
`server/web/app/` is silently not shipped — the deploy succeeds and the page
404s with nothing saying why. Confirmed by dry run. **Anchor it to
`/app/`**; only the top-level `app/` exists in the tree, so this changes
nothing today and makes the pattern say what it meant.

**Metro does not apply platform extensions to the entry point.** With
`"main": "index.ts"` in `app/package.json`, `index.web.ts` is silently ignored
and the whole iOS audio graph bundles anyway — 765 modules rather than 582, and
no error. `"main": "index"` fixes it.

## Scope

The spike inverted this question. Nearly everything arrives free, so what
follows is a list of removals rather than a list of features.

| | |
| --- | --- |
| **Notifications** | **Skipped.** No service worker, no VAPID, no server path beside APNs. The phone does this. |
| **File upload and download** | **Built.** See below — this is a reason to open the browser, not a port for completeness. |
| **Haptic cues** | **Replaced**, by a tab indicator. See below. |
| **`AudioDebugPanel`** | **Hidden on web.** 454 lines of `AVAudioSession` route diagnostics describing a session a browser does not have. It is already gated on `hello.debug`; the web build gates it on the platform as well. |

### Upload and download

`upload.ts` uses `expo-document-picker` and `expo-file-system/legacy`;
`download.ts` uses `expo-file-system` and `expo-sharing`. Both get `.web.ts`
siblings.

Upload is `<input type="file">` and the raw body the server already accepts —
`app.ts` registers raw parsers for `/^audio\//` with `bodyLimit:
MAX_TRACK_BYTES`, 100 MB. **Note that `fetch` reports no upload progress**; a
100 MB file over domestic upstream is minutes of silence, so this wants
`XMLHttpRequest`, which does, rather than the more obvious call.

Download cannot be a plain link, because `GET /recordings/:id/export` needs the
bearer token: fetch it, take the blob, `URL.createObjectURL`, click a synthetic
`<a download>`, revoke. The whole file is in memory for the moment it takes,
which at 100 MB is acceptable and worth knowing.

### The tab indicator, which replaces the buzz

`cue.ts` is imported as `./cue` by both `useKnockNudge` and `useSilencedNudge`,
and **both already take `fire: () => void = buzz` as a parameter**. So Metro's
platform resolution means a single `cue.web.ts` covers this and neither hook
changes.

What it does: set a marker on `document.title` and swap the favicon, then clear
both on `visibilitychange` when the tab is looked at. No permission and no
integration — `navigator.setAppBadge()` gives a real badge but needs an
installed PWA and is absent in Firefox, so it is a later enhancement at most.
`fire()` is edge-triggered and the marker is a state, so repeated fires are
idempotent rather than a flash each.

**This is weaker than what it replaces, and deliberately so.** The buzz's
entire justification was that it reaches a *locked phone* — "most of what a
pocket is", confirmed on a device at build 72. A browser tab has no equivalent,
and with notifications skipped there is no delivery to a machine nobody is
watching. A tab marker is only read by somebody who looks.

That is the premise working as intended rather than a gap, and it is written
down so that nobody later closes it by reaching for notifications — or by
reviving the tone into the audio session, which `DECISIONS.md` § *The buzz
reaches a locked phone, so the tone is not built* rules out and which would
play over the very voice it was announcing.

## What is left to decide

- **The two prefixes' names**, and whether stable eventually earns `/`.
- **Whether the spike's `?channel=` seed becomes a real URL model.** It has to:
  the sign-out effect wipes navigation state while the token is still being
  read from storage, because the app has no notion of navigation that predates
  a session. On a phone there is none. In a browser the address *is* the
  navigation, and every route meets this.
