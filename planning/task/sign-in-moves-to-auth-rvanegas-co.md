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
