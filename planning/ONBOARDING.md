# The onboarding checklist

**Built on 2026-09-10 and not yet landed.** It was a design for work not yet
done, and is now the account of what was written; delete it when the work
ships, moving whatever survives into `decisions/` — the reversals in the last
section but one are what that record needs, the rest being description of code
that exists.

`TASKS.md` § *Onboarding Checklist* named it in a bare heading; this is what
that heading turned out to mean, and why. It was designed in conversation on
2026-09-10, after the heading had been renamed from *Introduction Checklist*
and the session that argued it out went off to do `bin/growth` instead. Every
code reference below was checked against the tree at `f3459cf`.

**What is built is the checklist and nothing else.** The growth-by-warmth card
below is a separate feature and was not written; neither were the three
campaign gaps, one of which is more urgent than any of this.

## What the convention is

An **onboarding checklist**, also *getting-started checklist*; the umbrella is
*progressive onboarding*, revealing an app in steps rather than all at once,
and with a progress meter it becomes *gamified onboarding*. Growth teams call
it an *activation checklist*, because each item maps to an activation event.
The mechanism underneath is the Zeigarnik effect: an unfinished list nags.

The word matters here only so far as it sets the scope. **This is an activation
ladder, not a guided first-run walkthrough** — no coach marks, no tour, no
sequence of overlays pointing at controls. That was the ambiguity the empty
heading left open, and it is settled the first way.

## No third-party module

The RN-capable options are Appcues, Pendo, UserGuiding, Chameleon and Intercom
Product Tours. What they sell is **remote authoring** — changing checklist copy
without shipping a build — and given that a client change here costs an upload,
a submission, an approval and a release, that is the one thing on offer with
real value. It still loses, on four counts:

- **The completion signal is domain state, not a tap.** Added a contact,
  opened a channel, stepped in — the server already knows all of it. These SDKs
  carry their own event stream, so the shape would be forwarding our state into
  their bus to read it back and tick a box. The checklist is a view of a
  snapshot, and rendering server snapshots is what `app/` already is.
- **Every one of them is an analytics pipe, and that changes `/privacy`.**
  User identifiers and behavioural events to a third party, plus App Store
  privacy-label entries under Identifiers and Usage Data, on an app whose pitch
  is uninterrupted private conversation. AssemblyAI is called out in AGENTS.md
  partly because its presence changes what `/privacy` claims; this would be a
  larger disclosure than that, paid at every submission.
- **A native module is a second pin on SDK 54.** The version is pinned by
  `@livekit/react-native-webrtc`'s config plugin having no SDK 57 release.
  Another native SDK with its own plugin is a second thing to clear before any
  upgrade, and the media layer is already the constraint.
- **The dependency list is deliberately lean** — Expo modules, LiveKit,
  `react-native-svg`, `dayjs`. Nothing in it is hosted SaaS at a per-MAU price.

Built in-house it is a list component and a handful of booleans derived from
the Home snapshot, with no wire change at all if the fields it needs are
already sent.

## Not a modal

Typical for the pattern is a dismissable overlay. This codebase has litigated
that question twice and landed the other way both times, so the overlay is out
on precedent rather than on taste:

- **There is no `Modal` in `app/` at all**, on any platform, including the web
  build.
- `Screen`'s `header` and `footer` are each documented as *a sibling above or
  below the ScrollView rather than an overlay on it, so it takes its own height
  out of the viewport and nothing is ever hidden beneath it*.
- `HomeView` records moving profiles out of `ContactsView` on the grounds that
  a list *is a body now and cannot cover anything*.
- `notificationAsk.ts` is the app's existing answer to introducing somebody to
  something, and its whole argument is about *when*: nothing until
  `worthAsking`, and the thing it replaced is named in its own comment as *the
  ten-seconds-after-install ask*. A first-launch modal listing things the user
  cannot do yet is that interruption rebuilt.

**A modal would be right for an item that blocks** — something that must be
answered before the app functions. Nothing on this list qualifies; they are all
invitations.

## Where it goes

`app/src/ui/HomeView.tsx`, as the first child of `<Screen>` at `:313`,
immediately above the `list === 'channels' ? … : …` ternary at `:314`. **In the
scroll, not the pinned header.**

Two things decide this:

**It belongs to the tier, not to either list.** `HomeView`'s own doc comment
settles the class of question: the live bar was going to be drawn inside the
contact list, and that was rejected because *a live room is not a contact and
has no business in that list. It belongs to whatever contains both lists, which
is this.* A checklist spanning *get somebody here* and *open a channel* spans
both lists in exactly the same way. Putting it in the scroll also means it
survives the list switch — ticking an item on Contacts does not make the
checklist vanish when you flip to Channels.

**It is the mirror of Support at the foot of the same component.** Support sits
last on the reasoning that *everything above it is what somebody opened the app
to do*. For a new account with nothing in it, the checklist **is** that, which
is why it takes the top rather than the foot.

**There is no empty state to replace, contrary to the obvious move.**
`ChannelsView` with no channels draws `StartChannelRow` (`:278`) and nothing
else; the only `Empty` there is `Loading…` before the first snapshot (`:332`),
deliberately, because an empty screen at cold launch reads as an account with
nothing in it. So this is new furniture rather than dead space reclaimed.

**The known trade, to be argued in the commit rather than slipped in:** this
pushes `StartChannelRow` down, and that row was moved to the top of the scroll
on 2026-09-02 specifically so it would sit where *Add contact* sits on the
other tab. The displacement is bounded — the checklist shows only while the
list beneath it is thin, and its items point *at* that row rather than compete
with it — but it does contradict a dated decision.

## The list is derived, not fixed

**Because the two arrival paths start from different places.**
`AppProvider.tsx:1041` records that *being invited is how most people arrive and
the invitation is the first thing they have*. An invited account already has a
contact and something to walk into, so *Add a contact* would be both its first
instruction and noise.

### Invited arrival — the majority

| # | Item | Done when |
|---|---|---|
| 0 | **Say who you are** | `displayName` non-empty. Conditional; `AuthView` offers it at signup, so it appears only for accounts that left it blank |
| 1 | **Get somebody here** | `home.contacts.length > 0 \|\| home.invites.length > 0` — born ticked here |
| 2 | **Open a channel** | `home.rejoinable.length > 0` — usually born ticked, and reads as the invitation itself |
| 3 | **Step in** | `conversing` (`AppProvider.tsx:1060`) |

Items 1 and 2 arriving ticked leaves a one-line checklist: *step into the
conversation waiting for you*. **That is arguably not a checklist at all**, and
the honest rendering is a single card rather than four rows with three ticks.
See the open question at the foot.

### Alone arrival — the campaign cohort

An uninvited install has nobody, and **there is nothing to do here alone**, so
for this cohort the checklist's real job is recruitment rather than setup. Two
routes exist, and they are different promises:

- **Invite link** (`ContactsView.tsx:450`) — `/i/<username>/<pin>`, good once,
  shared however you already talk to somebody. Asynchronous: it works while you
  sleep, and they become a contact when they sign up. **Gated on choosing a
  username** (`InviteLink`, same file).
- **Guest link** (`ChannelView.tsx`, the guest section) — they open the channel
  in a browser, no account, no install. Synchronous: the glossary is explicit
  that it *stops working once the channel is empty of members*, so you have to
  be sitting in the channel when they open it.

**Add a contact by address is close to useless for this cohort**, since it needs
the other person to already have an account. Yet it is the primary affordance:
the field is at the top of the card and the invite link sits below an `or`.
That ordering is right for the invited cohort and backwards for this one.

| # | Item | Done when |
|---|---|---|
| 0 | **Say who you are** | `displayName` non-empty — conditional, and it matters more here, since a guest meets your name in a browser with no other context |
| 1 | **Choose a username** | `me.username` set |
| 2 | **Get somebody here** | `home.contacts.length > 0`, which includes outgoing requests |
| 3 | **Step in** | `conversing` |

**Username is an item here and not there**, which reverses the first answer
given. The glossary calls it *optional, and most people have none*, and for the
invited majority that is right — promoting it would tell most users to do
something the app deliberately does not require. For the alone cohort it is the
gate on the only asynchronous route out, so it earns a row.

Item 2's card carries both routes explicitly — *invite someone*, they install
later, and *talk to someone now*, start a channel and share a guest link while
you stay in it. A campaign arrival cannot infer which one fits their situation.

## What is deliberately left out

- **Turn on notifications.** `notificationAsk.ts` owns this with an argued
  policy: nothing until `worthAsking`, then the explanation, then a daily nudge
  at most. A checklist row reinstates the ask in the first ten seconds, which
  is the exact thing that module says it replaced.
- **Chip in.** Support sits at the foot of `HomeView` because *a request for
  money that sat above that would be reading the room wrong*. The top of the
  same scroll is the worst available place for it.
- **Make a recording, the clipboard, transcripts.** Second-week features, and
  transcripts are behind Labs. A checklist that lists everything the app does
  stops being an activation ladder.
- **Microphone permission.** Demanded naturally at step-in. Listing it asks for
  a permission before the reason for it exists — the notifications error again.

## Retirement

**Retire on item 3, not on all boxes ticked.** Once somebody has had a
conversation the checklist has done its job, and a leftover unticked *Say who
you are* should not keep it on screen.

That makes the persisted state a single `thefloor.intro.doneAt` rather than
anything per-item: every item state is derived from the snapshot, so the only
thing worth storing is *this is over*. **Any such key must be added to
`INSTALL_KEYS` in `app/src/state/storage.ts`**, or
`__tests__/storageKeys.test.ts` fails on the drift — which is the intended
behaviour of that test, not an obstacle.

## Files

What was written, which is close to what the design predicted:

| File | Change |
|---|---|
| `app/src/state/introduction.ts` | new, pure — the steps, which arrival it is, and when all of it stops; beside `notificationAsk.ts` for the reason that file gives |
| `app/src/state/useIntroduction.ts` | new — the two keys, the latch, the retirement, and the one profile fetch |
| `app/src/ui/Introduction.tsx` | new — the card and the ladder. Its own file rather than in-file beside `InstallNotice` (`HomeView.tsx:470`) and `NotificationNotice` (`:530`), a checklist being bigger than a notice |
| `app/src/state/AppProvider.tsx` | calls the hook and puts `introduction` on the context, for `conversing`'s sake |
| `app/src/ui/HomeView.tsx` | renders it at `:339`, first child of `<Screen>` |
| `app/src/state/storage.ts` | both `thefloor.intro.*` keys into `INSTALL_KEYS` |
| `app/src/state/__tests__/introduction.test.ts` | new — 19 cases, the policy |
| `app/src/ui/__tests__/introduction.test.tsx` | new — 7 cases, what Home draws |
| `app/src/ui/testing/harness.tsx`, `app/__tests__/session.test.tsx` | both mocks of `AppProvider` gain the field, defaulting to `none` |
| `planning/GLOSSARY.md` | *introduction* and *arrival*, entries and one-liners |

**Reuse rather than re-derive.** `AppProvider.tsx:1044` already computes
`somebody` from `home.contacts` / `home.rejoinable` / `home.invites`, and
`conversing` at `:1060` from the channel views. `arrivalOf` is the first of
those asked once instead of continuously.

One thing the design did not settle and the code did: **only the next
unfinished rung carries a control.** A button on every unticked row is four
calls to action stacked above a list somebody opened the app to read, and a
ladder that does not say which rung is next is not doing the one thing a
ladder does. *Step in* carries none at all — there is nowhere to send somebody
from here, and the row that starts a channel is immediately below the card.

## Growth is a different thing, and is not this

Asked to prioritise growth to more contacts for virality, the answer is a
**standing prompt, not a checklist, and not part of this feature**. It never
completes, so it cannot be a list that retires. One card in Home's pinned tier
beside `InstallNotice` and `NotificationNotice` (`:303`, `:305`), showing the
warmest prompt currently available and nothing else — one prompt, never four.

Ordered by warmth, which is what `decisions/2026-09-10-an-island-is-not-a-tree.md`
implies: outstanding requests *are not swept, so a bridge can sit there
indefinitely*, meaning there is already a backlog of one-tap merges between
islands. Asking somebody with two contacts to go recruit a third is strictly
worse than asking them to answer what is in front of them.

| Tier | Prompt | Why it is warmest | State |
|---|---|---|---|
| 1 | **Accept the request waiting for you** | The other side has already agreed; one tap merges two islands | incoming pending in `home.contacts` |
| 2 | **Add the guest who was just in your channel** | They have already had a conversation here, in a browser, without installing anything | `ASK_GUEST_CONTACT` (`core/channel.ts:1544`), wired at `ChannelView.tsx:1359` |
| 3 | **Your request to X is still waiting** | The un-swept backlog; nudge out of band | outgoing pending |
| 4 | **Invite somebody** | Cold, and the only one needing a username | invite link |

**Tier 2 is the one to build first.** The action is already coded and nothing
prompts for it at the moment it would land, which is while the guest is still
in the room.

**Cadence** borrowed from `askDue`: at most one showing a day, and the day is
spent when the card appears rather than when it is answered — a prompt that
returned until formally dismissed would punish ignoring it. Exempt tier 1,
since an unanswered request is a person waiting rather than a growth nag. Soften
off above about five accepted contacts; the real measure is island
connectivity, which the client cannot see, so count is the available proxy.

**Said once and not belaboured:** every piece of UI reasoning in this codebase
resists urgency — *available rather than urgent*, Chip in at the foot, the
notification cadence. A standing growth prompt cuts against that grain. The
one-card, one-a-day shape above is the attempt to get the priority without the
app starting to nag.

## Three things the campaign exposes that a checklist does not fix

**1. The alone cohort can never be asked about notifications, and this is the
serious one.** `worthAsking` stands on `somebody` — a contact, a rejoinable
channel, or an invitation. Minting and sharing an invite link creates none of
those: the contact row appears only when the other person opens it. So the most
likely first action of a campaign install leaves no trace in all three signals,
the pitch never fires, and that account is unreachable to be told their friend
has just signed up. **That is the one cohort where a push decides whether there
is ever a second session, and it is the cohort the current policy cannot ask.**
It is a change to `notificationAsk.ts`, not to any of this, and if the campaign
has a date it should go first.

**2. The guest link's lifetime contradicts the obvious mental model.** *Send a
link, they will join later* is what people will do, and it dies the moment the
channel is empty of members. Either the checklist copy has to say *stay here*,
or the link needs to outlive an empty channel.

**3. `ContactsView`'s card ordering.** The invite link belongs above the address
field when `contacts.length === 0`, rather than being worked around in
checklist copy.

## The question that was open, and how it was settled

**What the invited majority sees.** Items 1 and 2 are born ticked for them, so
the four-row list degenerates to one row and three ticks for the cohort that is
most of everybody.

**Settled on 2026-09-10: a single card.** It names whoever invited them, says
that stepping in is the moment people can hear them, and offers the way into
that channel. No rows, no ticks, no progress meter. The ladder is the alone
arrival's alone. The reasoning is that a list of things somebody else did for
you is theatre, and that the pattern's own mechanism — an unfinished list nags
— has nothing to work with when three quarters of it arrives finished.

The third option, showing an invited account nothing at all, was declined: the
one thing that cohort has not done is the one thing that matters, and they are
the majority.

## What building it changed

Three things the design was wrong about or silent on. These are what the
decision record needs; everything else above is description of code.

**A username is not on the wire, and deliberately.** The design had *Choose a
username* completing on `me.username`. There is no such field: `PublicAccount`
carries an id and a display name, and `ProfileView` states the division —
*nothing outside this screen reads a username today, so nothing outside this
screen is made to carry one.* Rather than contradict that for one row, the hook
fetches the account's own profile once, for the alone cohort only, and only
while the ladder is unfinished. A failure leaves the username unknown and the
ladder hidden, which is `loadSupport`'s *failure is silence* applied to a card
nobody asked for.

**The arrival has to be latched, and the design did not say so.** Deriving it
from the current snapshot answers *invited* the moment an alone account gets
its first contact — one rung from the top — and the ladder would be replaced by
a card about an invitation nobody sent. It is stored as
`thefloor.intro.arrival`, written at the first snapshot this install ever saw.
So there are two keys rather than the one the design predicted.

**Both keys are cleared on sign-out**, which is the opposite of what every
neighbouring key does. `installNotice.ts` and the four `thefloor.notifications`
keys survive it deliberately, because they record what a *browser* or an
*install* has been shown and iOS grants its one dialog per install however many
people sign in. These two record what an *account* has done, and a second
account on the same phone has done neither.
