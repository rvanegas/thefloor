# The tier says which room you are in, whatever the pane beside it shows

2026-09-08. Reverses half of `158722d` (2026-09-04) and the paragraph in
`archive/DECISIONS-2026-08-31-to-2026-09-04.md` that first suppressed the bar.
TASKS.md § *On iPad Room One Is In*, now deleted, asked for one thing: the
sidebar should look the same in both cases.

**The bar was suppressed in exactly one case** — a split whose detail pane held
the very channel you were present in — on the argument that what it says, *you
are somewhere else, tap to go back*, is false a hairline from the thing it
points at. That argument is correct about the sentence and wrong about the
line. It then took the LIVE row with it, on the matching argument that a row is
a way *in* to the pane it sits next to, so between them the sidebar named the
one channel you were actually in **nowhere at all**.

**What that cost was visible before it was arguable.** Two screenshots of the
same window a second apart: with the conversation open the left column has
neither bar nor row, and *A Priori* is missing from YOUR CHANNELS; close the
pane and the bar appears, and Start a channel and every row under it drop by
its height. The tier's pinned header therefore changed size as the *other* pane
navigated — a list that moves under your finger for a reason on the far side of
a hairline rule.

**A pinned line is supposed to be redundant; that is what pinning is.** The bar
is the tier's standing statement of which room you are in, and a statement that
blinks out precisely when you are looking at the room is one nobody can learn
to trust or to find. So `App.tsx` no longer suppresses it, in either layout,
and the press it carries is the no-op it looks like — entering the channel that
is already the pane.

**The strict reading was chosen deliberately.** A middle option was offered and
declined: keep the line but drop *· tap to go back* and the press while the
channel is the pane, so the bar never says anything false. It was declined
because it still leaves two renderings to keep in step, and because *the same*
was the whole of the request — the subtitle is a sentence about going back, and
somebody who has just opened the room does not read it as a claim about where
they are.

**The LIVE row stays out, and that half of `158722d` survives.** Three
renderings of one conversation is one too many, and the row is the only one of
the three that is a way in to what is already open. It is also the pre-2026-09-04
behaviour: with the bar never suppressed, *which channel the list leaves out*
and *whether a bar is drawn* are one question again, so `App.tsx`'s separate
`liveChannelId` and `HomeView`'s prop for it are both gone and the list derives
the id from the bar as it always did.

**The test asserts sameness rather than presence.** `session.test.tsx` reads the
bar's `accessibilityLabel` and its rendered text together, before and after
opening the channel, and compares them character for character; the title is
then expected twice, once in the bar and once in the pane. Asserting merely
that a bar exists in both states would pass on two bars that differed.

**The vocabulary collision this sits on is unresolved.** GLOSSARY.md § *Live*
is a property of a channel — somebody is in it — and holds whether or not that
somebody is you, while the code's *live channel* (`liveChannelView`, `live` in
`App.tsx`, "the live bar") means the one **you** are present in. Two subjects,
one adjective. Nothing here renames anything; it is named as a thing to settle.
