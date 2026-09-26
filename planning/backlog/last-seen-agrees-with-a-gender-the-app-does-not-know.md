# "Last seen" agrees with a gender the app does not know

`availability.lastSeen` in `app/src/i18n/es.ts` reads
*Visto por última vez hace 3 horas*, and *visto* is a masculine participle
agreeing with the person it is about. GLOSSARY.md § *The two rules the whole
catalogue is written under* says nothing in the copy may do that: the app never
learns anybody's gender, so a sentence that inflects for one is wrong about
roughly half the people it is drawn under. Noticed 2026-09-25 while adding the
line to the Spanish table, which is what made the rule and the string visible
together.

**It is the rule's own escape hatch, not an oversight** — the masculine generic
is allowed "where nothing else reads naturally" — so what this asks is whether
something else does. The constructions worth trying are the ones the rest of the
catalogue already uses: a noun instead of a participle, or a state instead of a
description of the person in it. *Última vez hace 3 horas* is the bare version
and reads as a label rather than a sentence. *Activo hace 3 horas* inflects the
same way. *Se le vio hace 3 horas* is impersonal and agrees with nobody, which
is the property wanted, and is longer.

**Check the neighbours before changing it.** The line sits directly under *En la
app ahora*, which has no such problem, and the two are read as one pair on a
contact row and on a profile — so a construction that reads well alone and badly
beside the other one is not an improvement. Both are drawn by
`describeAvailability`, which is the one place to see them together.

Nothing about the English changes, and nothing about the mechanism: *In the app
now* and this line count from the same clock since
`decisions/2026-09-25-in-the-app-now-counts-attention.md`, and this is purely
about the words the Spanish catalogue puts on the second of them.
