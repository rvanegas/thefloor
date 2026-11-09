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
