# The copy uses the generic masculine

2026-09-26. Where a Spanish sentence in this app agrees with a person, it takes
the masculine, about everybody. The app does not know anybody's gender, does
not ask, and has no field for one. This entry exists because that is a decision
rather than an oversight, and because the evidence for it being an oversight is
sitting in the catalogue where anybody can find it.

## What prompted it

`availability.lastSeen` reads *Visto por última vez hace 3 horas*, and *visto*
is a masculine participle agreeing with the contact the line is drawn under. It
sits beneath a name on every contact row and every profile — the most-drawn
sentence in the catalogue that is about a person at all.

That was reported as a defect on 2026-09-25, against the rule the Spanish
catalogue was written under at the time: *nothing agrees with a person's
gender*. The copy was to be built from constructions that take no agreement — a
noun rather than a participle, a state rather than a description of the person
in it — falling back to the masculine generic only where nothing else read
naturally. By that rule, *Visto* was a straightforward violation.

## What was tried, and backed out

A gender setting, built the same day: `feminine` / `masculine` / unset, unset
being the default and rendering as the masculine. Because most sentences that
agree are about *somebody else* — a contact's row, a member's card — the value
had to be published on `PublicAccount` to reach the screens that draw them.
Seven messages took a gender parameter, four from the subject's row and three
from the reader's own settings.

It worked, and it was backed out the next day without landing. The commit is
`3851db45` if it is ever wanted; nothing of it survives in the tree.

**The reason is scope, not correctness.** What the setting bought was one
adjective ending, in seven sentences, in one of two languages. What it cost was
a column, a wire field on the shape embedded in every roster, invitation and
recording row, a compatibility shim with its own SHIMS.md entry, a new control
idiom on Floor Settings — the first whose lit button does something when tapped
again — and a permanent question on every future Spanish message about whose
gender it agrees with. That is a lot of standing surface for a vowel.

## What is true now

**The generic masculine, everywhere, and the copy is not contorted to avoid
it.** This is the third position the project has held on the question in three
days, so it is worth being plain about what each one asked for. *Avoid all
agreement* asked the copy to work around a fact the app had never collected.
*Ask, and agree* asked for a setting, a column and a wire field. *Generic
masculine* asks for nothing at all: it is how the catalogue already reads, and
keeping it costs no code and no future decision.

**It is not a claim that the distinction does not matter**, and nobody should
write that down later as the reasoning. It is a judgement that the app should
not carry a gender field in order to get one adjective right, made by the
person whose app it is.

## What must not be undone by somebody being helpful

- **`Visto` is correct.** The next person to read the catalogue with Spanish
  and without this file will file it again. GLOSSARY.md § *The two rules the
  whole catalogue is written under* says so at the point of use, which is why
  the rule there is stated as what to do rather than as what was decided.
- **The backlog entry raising it is deleted**, since it is answered rather than
  outstanding — `backlog/README.md` § *Everything known and not done*.
- **The vocabulary the old rule produced stays**: *Invitaciones* for the group
  of pending seats, *Sin entrar* for a member who has never come in. Both were
  chosen partly to sidestep an inflection and both also won against the other
  candidate words, which is the test that matters. Nothing about the dodging
  being over makes a worse word better, and reverting them would be the one
  real regression available here.
- **No message takes a gender argument.** If one appears, the rule has been
  lost rather than extended.
