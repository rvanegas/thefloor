# Replace the getting-started checklist

The *Getting started* card on Home — the *introduction* in the code — confused
the people it was for, and on 2026-10-08 it was switched off rather than
fixed: `DRAWS_INTRODUCTION` in `app/src/ui/HomeView.tsx` is false, and
*Show the checklist again* left Settings with it. A different approach is
wanted; what it is has not been decided, and nothing is to be built until it
has.

**What is still running underneath**, deliberately, so that whatever comes
next can use it or remove it knowingly: `state/introduction.ts` and
`useIntroduction` still compute the ladder, the four *try* rungs are still
stamped on the account (`markTried`), `doneAt` is still written, and the
channel screen's *Tap In, at the foot of the screen* line still reads
`learningToStepIn` — that line is its own decision
(`decision/2026-09-24-the-channel-screen-says-how-to-be-heard.md`) and was
left on. `ui/Introduction.tsx` and its tests are kept and skipped.

**Settle first what confused people**, since the answer shapes the
replacement. The backlog item
`checklist-items-don-t-seem-to-complete-and-signing-in-again-restores-the-checklist.md`
is one report of it — rungs that did not tick, and a card that came back on
signing in. Then decide whether the replacement reuses any of the machinery
above, and delete what it does not, `forgetIntroduction` and the TEMPORARY
trace in `AppProvider` included.
