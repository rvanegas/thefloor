# The checklist has a second exit, and the reset shows all of it

2026-09-13. Two changes to the introduction, reported as one complaint and
fixed together because they are the same fact from opposite ends: the card had
exactly one way to end, and the control for putting it back did not put it
back.

## What was wrong

The complaint was *reset my account to receive all the getting-started
checklist items*. The account had `debug`, so the shipped control was there —
Settings → *Show the checklist again*. Tapping it produced one card, saying
*You have not stepped in yet*, and nothing else.

That was correct by the code and wrong by every reading of the button.
`forget` cleared `thefloor.intro.arrival`, which re-arms a latch; the effect
below it then re-derived the arrival from the Home snapshot already in hand,
and `arrivalOf` answers `invited` for anybody with a contact, a rejoinable
channel or an invitation. Every established account is one. So the reset
cleared five stored rungs — `stepIn` and the four *try* stamps — and then drew
the one shape that can show none of the four and does not draw `stepIn` as a
rung at all.

The old comment said so and defended it: *somebody with contacts is therefore
returned to the invited card and not to the ladder, which is honest: that is
what this account looks like to a first snapshot now*. It is honest about the
snapshot and dishonest about the tap. Nobody reaches a debug panel to be shown
the introduction their account would qualify for; they reach it to look at the
introduction. The card is the cohort rule, and the cohort rule is about
somebody's first day, not about a lever marked *again*.

The second half surfaced immediately after: with the whole ladder drawn, a
rung somebody has read and decided against has nowhere to go. The ladder's only
exit was finishing it — which for *put The Floor on your home screen* on a
browser nobody will install to, or *bring in a guest* for somebody with no
guests, is never. A row that can be neither answered nor put away makes the
whole card worth ignoring, and a card worth ignoring teaches somebody to skip
the rows that would have helped.

## What was decided

**`forget` latches `alone` rather than clearing the arrival.** It is the one
place in `useIntroduction` that sets an arrival to something no snapshot said,
and it is deliberate: `alone` is the cohort that is shown the whole ladder, and
what comes back is the whole ladder. Five rungs return hollow — `stepIn`,
`floor`, `nearby`, `guest`, `player` — and `somebody` draws ticked, which it
is. Ticked rather than cleared because it is a standing fact about an account
that has a contact, not a task; the reset is of five, and the confirmation
copy now says five.

The latch is *written*, not left null, so it survives a relaunch as well as
the next render. A cleared key was the bug.

**Every row carries a cross.** Dismissing hides a rung and never ticks it. The
distinction is the whole feature: `tried` is a fact about the account, which is
why it moved to the server earlier the same day, and a dismissal is a statement
about this list. Nothing about dismissing reaches the server, and doing the
thing afterwards still marks it — the row is simply not there to fill in.

**Per install, in `thefloor.intro.dismissed`, not per account.** It sits beside
`arrival` and `doneAt`, which are the other two pieces of introduction state
this end owns, and is cleared on sign-out with them. This was argued the other
way and lost: the *tried* rungs went to the account hours earlier precisely
because a second device drew four hollow rungs for somebody who had done all
four. The cases differ in what the answer is *about*. Whether this person has
ever claimed the floor is a fact about them that a new phone cannot derive and
must not guess. Whether they want to keep reading a row about guest links is a
preference about a card, and a second device is entitled to ask again — the
cost of being wrong is one row, once, with its own cross on it. Against that,
account-level dismissals are four columns, a wire field, a route and a deploy
that has to precede the client. If the cost turns out to be real, the state
moves the way `tried` did and this paragraph is the record of why it did not
move first.

**One key holding a list, not a key per rung.** `storageKeys.test.ts` objects
to a blob that hides keys from `INSTALL_KEYS`; this hides none, being one key
whose contents are not keys. The four `thefloor.intro.tried.*` keys were four
independent facts written at four different moments; these are one preference
written whole, and there are seven of them.

**The last dismissal retires the card.** An empty card is not a quiet card. It
is the same conclusion `installStep` reaches about its own absence: a row with
nothing to say is not drawn, and a card whose rows are all gone is not either.

**On the invited card the cross is `stepIn`.** The card is a single-rung
drawing of that rung, so its dismissal is recorded as that rung — otherwise
somebody could put the card away and meet the row again the day they first
conversed. And dismissing it does not answer with the four rungs below
`stepIn`: that is somebody who has not been in a channel, and replacing one row
they declined with four about a screen they have not reached is not a
dismissal. The install rung survives it, being the one rung that was never part
of what the card asked.

## What this cost elsewhere

`findButton` in the test harness falls back to a substring match when nothing
matches exactly, and *Dismiss Step in* contains *Step in* — so the assertion
that the card offers no way in when there is no channel started passing for the
wrong reason. That assertion now asks for the exact name. The accessible names
keep the rung in them regardless: seven controls all called *Dismiss* is a card
nobody can navigate, which is worth more than a helper's convenience.

## What was not done

**No *dismiss all*.** *I will never install this in a browser* and *I have no
guests to bring* are different sentences, and a single hide-everything control
would make somebody spend the second one to say the first. Seven crosses is
seven taps at the outside, and the card retires itself at the last one.

**Dismissals are not offered to accounts without `debug` as a reset.** The
cross is for everybody; *Show the checklist again* stays behind `debug`, which
is unchanged — it is a lever with no screen behind it for ordinary accounts.

See `state/introduction.ts`, `state/useIntroduction.ts`, `ui/Introduction.tsx`,
and GLOSSARY.md § *Introduction* and § *Dismiss (a rung)*.
