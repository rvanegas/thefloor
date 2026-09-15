# The checklist reset is for everybody

2026-09-14. *Show the checklist again* has left Diagnostics. It is its own
section on Floor Settings — *Getting started*, above Labs — and every account
sees it, with no `debug` grant involved. *Forget this phone*, its neighbour of
one day, stays exactly where it was.

## What it reverses

`decisions/2026-09-13-the-checklist-has-a-second-exit.md` closes with a
paragraph headed *Dismissals are not offered to accounts without `debug` as a
reset*: the cross is for everybody, the reset stays behind the grant, "it is a
lever with no screen behind it for ordinary accounts". This reverses that
paragraph and nothing else in that file — the cross, the per-install
dismissals, the `alone` latch and the retirement rule all stand.

The reasoning that put it behind `debug` was about who the lever was *for*.
The checklist was a thing somebody met once and finished, the reset was how a
person working on it looked at that screen again without paying a code by
email for the privilege, and nobody using the app had a reason to want it. The
alternative was *Forget this phone*, which clears the two keys as two of
eighteen and signs you out doing it.

## Why that stopped being true the same day

The second exit is what changed it, and the decision that added it did not
notice what it had built. Before the crosses, the ladder had one way to end —
finish it — and a lever marked *again* was of interest only to somebody
inspecting the card. After them, an ordinary reader can put a rung away *for
good*, from Home, one tap, no confirmation. Nothing in the app puts it back.

So the shipped state was: everybody gets a permanent, irreversible decision,
and only `debug` accounts get the undo. That is not a lever with no screen
behind it. It is the handle on the inside of a one-way door, held by the
people who do not need it.

The same argument reaches the rest of the ladder. *You have tried claiming the
floor* is a fact about an account and the card retires on the last of them, so
somebody who did all four in their first week and then forgot what any of the
four were has no way to be shown them again. The card is the app's own answer
to *what is there to do here*, and that is a question people ask more than
once.

## What it is not

**Not a Labs feature.** Labs is an invitation to unfinished things; this is
finished and ordinary. It sits above Labs, with the settings that change what
the app does.

**Not conditional on the card being gone.** Drawing the control only once the
checklist had retired would hide it at the moment it is most wanted — somebody
has just dismissed a rung and wants it back, and the card is still on Home with
six rows left. It is honest in that state too: what comes back is every rung,
hollow, including the ones already ticked. That is what the confirmation says.

**Not a second door for *Forget this phone*.** That one ends the session and
costs a code by email, and its reason for existing — seeing a genuinely new
install, which iOS otherwise makes impossible — is still an instrument's
reason. It keeps the `debug` grant and keeps the Diagnostics label to itself.

**No new state, no wire change.** `forgetIntroduction` is unchanged: it still
latches the starting line to the contact count of the moment, clears `doneAt`
and the dismissals, and calls nothing on the server beyond what the snapshot
already carries. This was a question about who is shown a button.

## The copy changed with the audience

The confirmation was written for somebody holding a debug account and said so:
it contrasted what comes back with *whichever introduction this account would
get today*, which is a sentence about `arrivalOf` rather than about the app.
What survives is the one thing that is not guessable from the button — **step
out of any channel first**, since `doneAt` is written off `conversing` and
being in one with somebody re-ticks the first rung within a frame — plus what
is restored and what is not touched. The busy label is *Showing…* rather than
*Forgetting…*: the button now says what it does to somebody who did not write
it.

See `ui/HomeSettingsView.tsx`, `state/useIntroduction.ts`, ONBOARDING.md
§ *Getting it back*, and GLOSSARY.md § *Introduction*.
