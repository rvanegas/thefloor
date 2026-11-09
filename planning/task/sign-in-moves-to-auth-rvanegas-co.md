# Sign-in moves to auth.rvanegas.co

Decided 2026-11-08 (rvanegas-site
`planning/task/one-sign-in-for-every-project-at-auth-rvanegas-co.md`, which
is the design): one sign-in for The Floor,
noesis, dianoia and Roxana, at an identity service of its own.

**Phase 1:** `server/src/noesis.ts` goes to auth for `/authorize`, `/token`
and `/revoke`, and to auth's `/names` with a `client_credentials` token; the
libraries callbacks are unchanged.

**Phase 2 replaces The Floor's own sign-in.** The app signs in through auth
in the system sheet (ASWebAuthenticationSession, not ephemeral, so Safari's
session is shared; Custom Tabs on Android); the server exchanges the code as
client `thefloor` and gives the app its session as now. Accounts are keyed
by auth's user, matched by address (the names register already pairs them).
The emailed-code routes and the App Review fixed code move to auth
(`planning/DEMO-ACCOUNT.md` changes with it); switching accounts is
`prompt=login`; *Connect noesis* goes, since the sign-in grant carries
`noesis:read`. Old builds still call the code routes, so they stay until
`MIN_SUPPORTED_BUILD` passes them (technosophia `CLIENTS.md`), and a new
build goes through review.

**Phase 1 built 2026-11-08, not deployed:** branch `auth-sign-in` (server
only; no app change). `server/src/auth.ts` gets The Floor's own token and
checks noesis's; `AUTH_URL` joins the box's `server/.env`; the library
section of the privacy policy says where people sign in now, dated
8 November 2026. It deploys at the cut-over, after auth and noesis, since
until then noesis still asks with HTTP Basic, which this server no longer
takes.

**Phase 2's design, decided 2026-11-09** (the operator chose each point):

- **One sign-in, which also connects the library.** The app's *Sign in*
  opens dianoia-auth's `/authorize` in the system sheet
  (`expo-web-browser`'s `openAuthSessionAsync`, not ephemeral, so Safari's
  session is shared: somebody signed in to noesis or Roxana is not asked for
  a code). The client is `thefloor`, as for *Connect* now, its scopes widened
  to `identity noesis:read noesis:import`, back at `/noesis/callback`, whose
  pending entry says whether it is a sign-in or a connection. *Connect* then
  goes: a signed-in person's library is connected.
- **No session token in a URL.** The callback finds the account by the
  user name dianoia-auth gives (a Floor username is already the register's),
  or makes one, mints this server's session, and sends the app a one-time
  ticket (`thefloor://auth?ticket=…`, or the web page's own address), which
  the app trades for the token over the API.
- **A new account's display name and marketing consent are asked in the
  app**, on a first-run step after sign-in, not on dianoia-auth's page,
  which stays identity only. Invitations to the address are accepted when
  the account is made, as `/auth/verify` does now.
- **App Review signs in at dianoia-auth with a fixed code**: one review
  address dianoia-auth accepts with a configured code instead of mailing
  one, as `REVIEW_IDENTIFIER` does here now. `planning/DEMO-ACCOUNT.md`
  changes with it.
- **Old builds keep The Floor's own code**: `/auth/request-code` and
  `/auth/verify` stay, an entry in `planning/SHIMS.md`, until
  `MIN_SUPPORTED_BUILD` passes the first build that signs in at
  dianoia-auth; then they go.
- **Unchanged:** the developer's account switching (`/auth/switch`), guests,
  sessions on several devices, signing out here (which also sends the person
  to dianoia-auth's `/logout`).
- **Costs:** a native module, so a new build, an upload, a review and a
  release; the privacy policy says where people sign in, dated with it.
