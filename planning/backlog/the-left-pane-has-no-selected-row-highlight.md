# The left pane has no selected-row highlight

Nothing in the list beside a conversation says which conversation is open. On a
phone the question could not arise, the list having been replaced by what you
opened; beside it, a list with no mark is a list that has stopped answering
where you are.

Almost certainly worth doing, and what held it back is gone: it should follow
rather than precede somebody actually looking at the split, and somebody did on
2026-09-02 — decisions/ § *The split and the web app have both been
looked at*. What remains is only that it touches `ChannelsView`'s list
rendering, which is the busiest surface in the app.

**The tier landed on 2026-09-01 and made it a smaller question, not a settled
one.** The room you are in is now above the list, in Home's pinned top, so a
list with no mark is no longer the only thing on screen saying where you are —
but it still does not say which conversation the pane beside it is showing, and
the two are different rooms as often as not.
