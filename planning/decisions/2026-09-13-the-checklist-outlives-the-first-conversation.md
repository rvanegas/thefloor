# The checklist outlives the first conversation

2026-09-13. Four rungs were added to the getting-started checklist — claim the
floor, say you are nearby, bring in a guest, play something together — and
every one of them is done *inside* a channel. That single fact forced three
decisions, because the card they join lives on Home and used to disappear the
first time somebody had a conversation.

It also fixed a defect that had been live since the feature shipped, and which
is the reason anybody looked at this module at all. That is the last section.

## Retirement moved from the first conversation to the last rung

ONBOARDING.md § *Retirement* said **retire on item 3, not on all boxes
ticked**, and it was right about the ladder it was written for: every rung of
that one came *before* stepping in, so a leftover unticked *get somebody here*
was a stale nag rather than anything left to do.

With four rungs that come *after* stepping in, the same rule means they are
never drawn. The first conversation is the one moment at which none of the four
can yet have been reached, so retiring there would have shipped four rows that
no account could ever see.

So `doneAt !== null || conversing` became two separate rules:

- **`conversing` still draws nothing**, unchanged. A checklist on screen during
  the conversation it was asking for is the one moment it is actively silly.
  This was never the retirement; it only looked like it because the other half
  fired at the same instant.
- **Retirement is now `conversedAt !== null && allTried(tried)`** — the
  conversation *and* the four. It is `and` rather than `or` deliberately: the
  four are written by the client rather than derived from a snapshot, and a
  stray write must not retire the ladder for somebody who has never stepped in.

The card therefore comes back on Home after the conversation, carrying what is
left. That is the Zeigarnik mechanism the original design invoked, finally
given something to work with — the old shape retired the list at the exact
moment it first had anything unfinished on it.

**`stepIn` ticks now, and never could before.** It was drawn permanently
hollow, because the card vanished the instant it came true. A rung that stayed
hollow while the card outlived it would be telling somebody they had not done
the thing they had just done.

## The stored key keeps its name and loses its meaning

`thefloor.intro.doneAt` is **written at exactly the moment it always was** —
the first conversation — and every account already carrying one means precisely
that. What changed is what is concluded from it.

It is loaded into a field called `conversedAt`, which is what it has always
meant. The key string was left alone on purpose: renaming it would have
discarded the stamp on every install to gain nothing, and there is no migration
here at all, only a different reading of a value that is already correct
everywhere.

## The four are per install, and are the one thing not read off a snapshot

The founding rule of this feature is that every rung is a view of the Home
snapshot — ONBOARDING.md § *No third-party module* rejects the whole category
of onboarding SDK partly because **the completion signal is domain state, not a
tap**, and forwarding our state into somebody's bus to read it back would be
absurd.

Nothing in any snapshot says whether this account has ever claimed the floor,
declared itself nearby, admitted a guest or played anything.
`RejoinableView.nearby` comes closest and answers a different question —
whether you are nearby *now* — which would untick itself a quarter of an hour
later.

The options were a wire change (server-held per-account flags on `HomeView`,
plus the bookkeeping to write them) or four keys on the device. **Four keys on
the device**, in `state/tried.ts`, `thefloor.intro.tried.*`, written from the
control that does the thing rather than from the checklist.

The honest cost is that a second device starts these four unticked on an
account that has done all of them. That is acceptable *for these four and not
for the rungs above them*: the others say **this is true of you**, and these
say **you have tried this**, which is a fact about somebody having been shown a
control — and a control lives on a device.

They are **not cleared on sign-out**, unlike the two account keys beside them,
for the same reason: a second person signing in on the same phone has equally
been shown those controls. All six go in `INSTALL_KEYS`, so *Forget this phone*
takes them.

**One `const` per key rather than an object literal**, which looks like
pointless indirection and is not: `storageKeys.test.ts` greps the source for an
*assignment* — `= 'thefloor.…'` — specifically so a key assembled from pieces
cannot slip past it, and a key written only as an object property is invisible
to it in the same way.

## What the invited cohort sees, revisited

The single card exists because for an invited arrival the rungs above `stepIn`
are born ticked, and **a list of things somebody else did for you is theatre**.

That argument is about those two rungs and expires with them. The four below
are done by nobody but the reader, so once the one thing the card asks for has
happened there is an honest ladder left, and this cohort gets one. It shows
**the four and nothing else** — drawing the two ticked rungs above them would
be that same theatre, a fortnight later and with two extra rows of it.

So `show: 'invited'` is now gated on `conversedAt === null`.

## Every rung's button goes to Channels, and the repetition is the answer

`actionFor` gives all four the same control. There is exactly one place to send
somebody — all four are done inside a channel — and varying the word would not
change where the tap lands. What differs is the row's own instruction, which
names the tab or the slot: *the bar along the bottom*, *the Invite tab*, *the
Player tab*.

The card still may not reach past a list. It will not step somebody into a
channel to claim a floor for them, and a rung that opened the Player tab of a
channel they were not in would promise something the app would then refuse.

**The guest rung's note carries the lifetime**, because *send a link, they will
join later* is what everybody assumes and a guest link stops working once the
channel is empty of members. ONBOARDING.md § *Three things the campaign
exposes* named this as something the copy has to say; this is the copy saying
it.

## The defect this started from

**Symptom:** an established account, repeatedly shown the card reading *You
have not stepped in yet* — by somebody who plainly had, and had been for weeks.
That sentence is the invited card's fallback, used when there is no pending
invitation to take a name from.

**Cause:** a null token that meant two different things. `AppProvider` starts at
`token: null` and restores the real one from the keychain in an effect, so
**every cold launch passes through a frame indistinguishable from a sign-out**
— and the sign-out path in `useIntroduction` is the one place that *deletes*
both `thefloor.intro.*` keys.

So the retirement was wiped at every launch. The arrival latch was then
re-derived from the snapshot in hand; an established account has contacts, so it
latched `invited`; and with no invitation actually pending the card had no name
to show and fell back to that sentence. The module's own comment asserted that
this path "should appear only on a sign-out", and the `introTrace`
instrumentation in `AppProvider` had been added to chase exactly this — it was
looking at `conversing` and the cause was two doors along.

**Fix:** `AppState.ready` is already precisely *the keychain read has
resolved, whatever it found*. It is now passed to the hook, and a null token
clears the in-memory state either way but only touches the keys once `ready`.
Forgetting in memory is right before the restore lands; forgetting on disk
never is.

`app/src/state/__tests__/introColdLaunch.test.tsx` covers both halves — the
cold launch that must not wipe, and the sign-out that must.

**The two are independent.** The fix stands on its own and was worth landing
whether or not the four rungs ever shipped; it is recorded here because this is
the commit it arrived in, and because the retirement change rewrites the code it
touches.
