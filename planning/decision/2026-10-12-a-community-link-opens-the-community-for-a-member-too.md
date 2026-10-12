# A community link opens the community for a member too

2026-10-12. Asked at the prompt: whether or not somebody has already
accepted the invitation to a community, tapping its link takes them to the
channel. Two things stood in the way, one on each end. Neither was intended.

**The app dropped every answer, not only a member's.** The effect in
`AppProvider` that spends a join link clears the link before the request goes
out, and the link is one of the effect's own dependencies. Clearing it re-ran
the effect, the cleanup set `cancelled`, and the server's answer was thrown
away. A newcomer still became a member, and the community appeared on Home
because the server pushes it there, but nobody opened it. A member got the
same id back with `already: true`, and nothing visible happened at all. The
invite effect beside it had the same fault, so an invite link never opened the
pair's channel either, despite `2026-09-24-accepting-a-request-opens-the-channel-it-makes.md`.
Both now check a ref holding the current session, so only a sign-out or an
account switch makes an answer stale. The `cancelled` flag is gone.
`joinLanding.test.tsx` covers all three cases. Nothing had tested the effects
themselves, only the URL matchers.

**In a browser, the page turned a member of a full community away.** `/j/<code>`
is unauthenticated, so it cannot tell a member from a stranger. For a full
community it said *full for now* and handed over nothing. It now hands over
whenever there is a web app. The signed-in app asks the server, which can tell
them apart: a member gets the community, and a stranger gets *X is full* from
`joinByCode`, shown as the app shows any refusal. That narrows
`2026-10-11-a-community-invitation-is-two-links.md`: the full page survives
only on a box with no web app, where there is nobody to ask.

**No shim and no ordering.** No wire field moved. The server half is a page
handing over where it used to refuse, and the app half needs a build to reach
phones.
