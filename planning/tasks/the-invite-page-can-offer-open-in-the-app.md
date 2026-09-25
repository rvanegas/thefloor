# The invite page can offer Open in the app

The last three lines of
`decisions/2026-09-25-the-invitation-asks-for-one-thing.md`, held back
deliberately until a released build can answer them.

**The whole of the work is on the invite page**, `server/src/invite.ts`:

1. A paragraph under the call to action —
   `<p class="app"><a href="thefloor://i/${username}">Open in the app</a> —
   once you have it.</p>` — with the username through `escapeHtml`, drawn only
   where `appStoreUrl` is set, since a box with no store link has no installs
   to open. (There is no pin to carry since 2026-09-25.)
2. Its rule in `STYLE`, beside `.ends`.
3. The store button's aside gains its second sentence: *Then come back to this
   link and tap Open in the app below.* It currently reads *Free. <Name> is in
   your contacts as soon as you sign in.*

**The gate is a release, not an upload.** The scheme has been registered since
2026-09-16 and `released` is later, so every installed build already opens on
`thefloor://` and already ignores an `/i/` path: it opens the app and drops the
pin, silently. Until a build carrying `app/src/state/useInviteLink.ts` is
downloadable, this button would break exactly the arrival the decision is
about — somebody who has just installed, come back and tapped — and leave
nothing behind to notice. `bin/submit-ios --status` is the second opinion about
what is downloadable, `released` being a ref rather than a fact about Apple.

**Then add the page test that is waiting for it**, beside the others in
`server/__tests__/invite-link.test.ts` § *the page*: the body contains
`thefloor://i/${username}`, and still no `href=""` in any of the four absence
rows. There is no refusal page any more — the page reads nothing, so it has
nothing to refuse.

The word-count guard in that file allows for this — the named page is at
sixty-odd words against a ceiling of a hundred and twenty.
