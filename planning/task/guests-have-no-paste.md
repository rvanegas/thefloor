# Guests have no paste

Rodrigo, 2026-11-16, decided on the call with Erta. In the guest view he saw
none of the transcript but did see Claude's replies, because *Ask Claude*'s
reply lands as a *paste* and a guest sees pastes. That is odd on its face, and
pasting is an obscure feature that confuses more than it serves a guest. So:
**remove paste for guests** — neither pasting nor seeing pastes. Check what
`SeatView.tsx` draws and what the server sends a seat, so the server stops
sending them rather than the client hiding them. Whether a guest should still
hear Claude read aloud is the backlog item
`a-guest-does-not-hear-claude-read-aloud.md`.
