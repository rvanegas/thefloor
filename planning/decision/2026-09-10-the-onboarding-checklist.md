# The onboarding checklist

Built 2026-09-10 from `TASKS.md` § *Onboarding Checklist*, and designed in
conversation the same day. This is what survives of `planning/ONBOARDING.md`,
the design, which was deleted on 2026-10-03: the question it settled and the
three things building it changed. The rest of that file described code, and the
code has since moved far past it.

**Most of what follows was itself superseded within days**, and those later
decisions are the account of the checklist as it is:

- `2026-09-13-the-checklist-is-two-rungs.md` and
  `2026-09-13-the-checklist-outlives-the-first-conversation.md` — one ladder
  for everybody, nothing born ticked, seven rungs.
- `2026-09-13-the-tried-rungs-belong-to-the-account.md` — per account, not per
  install.
- `2026-09-13-the-web-app-can-be-installed.md` — the browser's home-screen rung.
- `2026-09-14-the-checklist-reset-is-for-everybody.md`.
- `2026-09-24-the-ladder-waits-its-turn.md` and
  `2026-09-24-the-channel-screen-says-how-to-be-heard.md`.

The growth card and the three campaign gaps that design also carried were not
built; they are in `task/drive-growth-from-what-the-numbers-say.md`.

**Also kept, because code cites them by section:** what the convention is, no
third-party module, not a modal, what is deliberately left out — the guided
walkthrough among it — and § *Retirement*, which
`2026-09-13-the-checklist-outlives-the-first-conversation.md` reversed.

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

**Installing the web app was added on 2026-09-13 and is not a counter-example
to the first of these.** The rung is drawn only in a browser, it asks for no
permission, and what it offers is a place to put the app rather than a promise
about being reached — the thing a browser cannot do is still not claimed, by
this or by anything else on the screen. See the decision above.

## Retirement

**Reversed on 2026-09-13, and this section now describes the old rule.** Four
rungs were added that are done *inside* a channel — claim the floor, say you
are nearby, bring in a guest, play something together — and the first
conversation is the one instant at which none of them can have been reached, so
retiring there would have shipped four rows no account could ever see. It now
retires when the last rung is done. The other half of the old condition —
nothing drawn *during* a conversation — survived that day and was reversed in
turn on 2026-09-14, having turned out to hide the card from the one reader the
four new rungs are written for:
`decision/2026-09-14-the-checklist-stays-while-you-are-in-the-room.md`.
The account of the first reversal is
`decision/2026-09-13-the-checklist-outlives-the-first-conversation.md`, which
also carries the cold-launch defect this was found alongside. What follows is
kept as the reasoning that was right for the ladder it was written for.

**Retire on item 3, not on all boxes ticked.** Once somebody has had a
conversation the checklist has done its job, and a leftover unticked *Say who
you are* should not keep it on screen.

That makes the persisted state a single `thefloor.intro.doneAt` rather than
anything per-item: every item state is derived from the snapshot, so the only
thing worth storing is *this is over*. **Any such key must be added to
`INSTALL_KEYS` in `app/src/state/storage.ts`**, or
`__tests__/storageKeys.test.ts` fails on the drift — which is the intended
behaviour of that test, not an obstacle.

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

**A username is not on the wire, and deliberately.** (This whole paragraph is
history as of 2026-09-13: the rung went, and the fetch it describes went with
it.) The design had *Choose a username* completing on `me.username`. There is
no such field: `PublicAccount`
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
