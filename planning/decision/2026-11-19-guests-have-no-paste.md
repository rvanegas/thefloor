# Guests have no paste

Rodrigo decided this on 2026-11-16, on the call with Erta, and it was built on
2026-11-19. In the guest view he saw none of the transcript but did see
Claude's replies. A reply from *Ask Claude* lands as a *paste*, and a guest
saw pastes: the seat view carried `clip`, the channel's newest paste, which a
guest's page drew as *Last pasted* in the app and *Clipboard* in the browser,
with a button to paste. Claude answering a conversation the page showed none
of was odd on its face, and pasting is an obscure feature that confused a
guest more than it served one. **So a guest neither pastes nor sees a paste.**

**The server stops sending it, rather than the client hiding it**, as the task
asked:

- `canPasteClip` asks `present` where it asked `isHere`, so the reducer
  refuses a guest's paste by whatever route it arrives. `canClearClip`, the
  build-363 shim, is now the same test, as its own comment always said it was.
- `PASTE_CLIP` and `CLEAR_CLIP` are off `GUEST_ACTIONS` and out of
  `GuestAction`, and the server's guest branch that minted a guest's clip is
  gone. A guest who sends one is told *Not an action.*
- `GuestView.clip` is gone from the type and the snapshot. The *Last pasted*
  card leaves `SeatView`, with its three strings in both languages, and the
  *Clipboard* section leaves the browser page.
- `ChannelState.clip` stays, for `Pastes.follow` and the builds before 364
  (SHIMS.md, gate 364). Guests' earlier pastes stay in members' *Records*.

**No shim, and what that costs.** Installed builds up to 440 read `view.clip`
as optional in practice (`view.clip ? … : …`), so they draw an empty card
reading *Nothing pasted yet.* until they update. Their *Paste mine* now gets
*Not an action.* back, shown as trouble on the page. That is a refusal of
something no longer permitted, not a shape kept for compatibility. It goes
away as those builds do, and nothing goes in SHIMS.md. The browser page is the
server's own, so it changed with the deploy.

**Asking Claude was never a guest's.** `canAskClaude` is built on the paste
rule, and its comment said "member or guest", but the route has always
required membership (`isMemberOf`). Only the comment changed. Whether a guest
should still *hear* a reply read aloud is a separate question:
`task/guests-are-a-pro-feature.md`, which answers it by making guests a Pro feature.
