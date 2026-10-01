# Share from YouTube

Register The Floor so one can share directly from youtube page into the floor

**Considered 2026-10-01; not started.** A share-sheet target that hands the
link to the watch party. It does not touch *The Floor carries no video* — it is
a third road for the same link, after the clipboard, and
2026-09-20-the-watch-link-arrives-by-paste-rather-than-by-typing.md already
names YouTube's share sheet as where links come from.

**The saving is modest, and worth knowing before paying for it.** Today: Share
→ Copy link → switch app → channel → *Watch* → press. With a target: Share →
More → The Floor. YouTube's own share panel lists its chosen apps, *Copy link*
and *More*, so we sit behind *More* in the system sheet; from Safari it is one
step nearer. What goes is the app switch, the navigation and the clipboard.

**The shape follows from rules already standing.**

- **No channel picker.** `canStartWatch` asks presence, and one is present in
  at most one channel, so the destination is *the channel one is present in*.
- **A share never starts a film by itself.** It opens *Watch* with the link
  held behind one press — on a loaded card, as the second step of *Change
  video*, for the reason that two-step exists: a stray link must not empty
  everybody else's picture.
- **Present nowhere:** hold the link and offer it on *Watch* in the next
  channel stepped into, as a button, never an autoplay.
- **No server or wire change.** Same `parseYouTubeUrl`, same start; a Short's
  `/shorts/` link is already `isUprightFilm`. No shim, no SHIMS.md entry.

**All the cost is native.** A share extension is a second Xcode target, which
`expo prebuild` cannot write — the reason `app/plugins/with-live-activity.js`
exists, so the pattern is in the tree. Either a hand-written plugin on that
model or `expo-share-intent` (check its SDK 54 support). The extension forwards
the URL on a new `thefloor://` path, read the way `useChannelLink.ts` reads
its own — `getInitialURL` and the listener both, or a cold launch drops it.
Rebuild and upload.

**The one real risk, and the first thing to do.** As understood — not yet
checked against the SDK headers — iOS gives a share extension no supported API
to open its containing app; everyone, `expo-share-intent` included, walks the
responder chain to `openURL`, and Apple has broken variants of that before. So
first: a throwaway extension on a phone running current iOS, measured rather
than reasoned, as the 152 embed error was. The sanctioned alternative — the
extension posting to the server itself, with the session token shared to it
and presence checked outside the app — is much more and not recommended.

**Elsewhere.** Android is a `SEND` `text/plain` intent filter, cheap if Android
ships. The web app cannot: iOS Safari has no Web Share Target.
