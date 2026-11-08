# The Restore Waits Forever On A Network That Drops Packets

On 2026-11-07, build 419, a cold start behind a VPN that was passing nothing
sat on the launch spinner indefinitely. Other apps on the phone could not
connect either, so the network was the cause. What is ours is that the app
said nothing at all. The spinner is `App.tsx`'s `!ready`, and `ready` is set
by the restore in `AppProvider.tsx` ("Restore a previous sign-in before
showing anything") only once the keychain read and then `api.home(token)`
have settled. Neither has a timeout of ours. A refused connection or a 5xx
fails fast and lands on the wall, but a request whose packets are dropped
just stays pending. The server log for that window held no `GET /home` from
any phone, so the request never got as far as the box.

Give the restore's `/home` a deadline of a few seconds, after which it takes
the error branch that already exists: `ready: true`, `status: 'closed'`,
`lastError` set, which draws the wall and its retry. First find out whether
the deadline belongs in `request` in `api/http.ts` for every call, or only
here. A slow `/home` on a working network has to stay distinguishable from
none. Also check what iOS's own request timeout actually is under
`fetch`, since the spinner outlasted the minute it is usually assumed to be.
