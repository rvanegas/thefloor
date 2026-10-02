# Checklist items don't seem to complete, and signing in again restores the checklist

Reported 2026-10-02, in these words: *Checklist items don't seem to complete.
Newly signing in restores checklist.* The checklist is the *introduction* —
*Getting started* on screen — and GLOSSARY.md § *Introduction* is what it is
supposed to do. Two symptoms, which may or may not be one bug.

**Rungs that do not tick.** Not new: 732f86de added a TEMPORARY trace to
`AppProvider` and `useIntroduction` for *the checklist that will not retire*,
logging every input to `conversing` into the diagnostics panel. Read what that
trace has captured before theorising afresh; if it has settled nothing, it is
the instrument to reproduce under. Which rungs fail matters — the four *try*
rungs are stamps on the account (`core/tried.ts`), *step in with somebody* is
`thefloor.intro.doneAt` on the install, and *get somebody here* is the contact
count against the *starting line*. Each fails differently.

**Signing in brings it back.** Probably the mechanism rather than an accident:
`doneAt`, `dismissed` and `contactsBase` are in `INSTALL_KEYS`
(`app/src/state/storage.ts`) and are forgotten whenever the token goes null —
deliberately, so that `switchAccount` does not hand one account the other's
ladder. The cost is that the same account signing back in loses its
dismissals, its *step in with somebody* tick and its starting line, the last
of which hands it *get somebody here* hollow again. The *try* stamps survive,
being the server's. Whether the fix is to move those three onto the account
too, as the *try* rungs were on 2026-09-13, or to key them by account on the
install, is the decision; `decisions/2026-09-13-the-tried-rungs-belong-to-the-account.md`
is the precedent and `…-the-checklist-has-a-second-exit.md` is why dismissal
was put on the install in the first place.
