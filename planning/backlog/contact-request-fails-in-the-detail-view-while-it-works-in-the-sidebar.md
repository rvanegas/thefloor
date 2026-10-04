# Contact request fails in the detail view, while it works in the sidebar

Reported 2026-10-02, in these words: *Contact request fails in detail view,
while it works in sidebar.* "Sidebar" is the *list* pane and "detail view" the
*detail (pane)*, in GLOSSARY.md's terms. Read as an *incoming* request being
answered, which the code below bears out; not yet reproduced on a device.

**Diagnosed 2026-10-04, from the code.** Since *A waiting bar that names one
thing goes to it* (2026-09-27), Home's bar for a single incoming request opens
the requester's profile in the detail pane. Before that, a profile showing an
incoming request was reachable only from a channel roster, so the two of you
always shared a room. Someone who asked by address usually shares none, and
both server routes that profile screen uses refuse that pair:

- `GET /profiles/:id` admits yourself, a contact, or `shareAChannel`. A
  pending requester is none of those, so the screen opens `refused` with only
  the fallback name.
- *Accept their request* is the incoming branch of the Contact card, and it
  calls `ask()` → `connectWith` → `POST /contacts/:id/request`. That route is
  gated on `shareAChannel` too and answers 404 *No such person.*, which is the
  error line it shows. Unlike *Add contact*, the button is not disabled when
  the profile was refused.

The list's `RequestRow` *Accept* is `acceptContact` → `POST /contacts/:id/accept`,
which needs only the pending request. So it works.

**The fix is to accept on the accept route, not to loosen the by-id gate.**
That gate is what keeps account ids from being a way to pester people. The
incoming branch should call `acceptContact` and then go to the pair channel, as
`RequestRow` does. Separately, `GET /profiles/:id` probably should admit
somebody with a pending request *to you*, since they told you who they are. The
bar's decision already assumes it does. That widens who can read whose profile,
though, so it is a decision rather than a formality. Without it, the bar opens
onto an empty profile with a working button.

No test covers an incoming requester you share no channel with. The view test
for this button, in `contacts.test.tsx`, asserts that it calls `connectWith`.
That pins the faulty path, so it changes with the fix. `server/__tests__/profiles.test.ts`
tests the crossed request by id only between channel members.

The guest row's *Add contact* in `channelCards` is a third path, and was not
part of the report.
