# Mute a locked phone through CallKit

The card's Mute asks for Face ID or the passcode on a locked iOS 26 phone, and
nothing the app declares changes that: iOS gates every third-party Live
Activity button on the lock screen.
`decision/2026-10-01-a-lock-screen-button-asks-whatever-is-declared.md` is
the evidence. **A mute that works without authentication has to be on a
surface iOS runs itself**, and two fit. This is the question of whether either
is worth what it costs, and it is a decision before it is any work.

**CallKit was tried on 2026-10-08 and does not deliver this.** A call that
the app places gets no system call screen. The pill opens the app, through the
passcode, and Rodrigo decided that Channel View is the call screen. See
`decision/2026-10-08-a-channel-is-an-outgoing-call-and-channel-view-is-its-screen.md`.
CallKit is still being integrated for other reasons (`integrate-with-callkit.md`),
so the CallKit half below is closed and **PushToTalk is the one candidate
left**. The *busy* sentence below no longer applies either: iOS gives call
waiting, and the idea was dropped.

**CallKit**: report being in a channel as an outgoing call the app started —
`CXStartCallAction` on entering, ended on stepping out — and the system call
screen carries a mute that works while locked. This is **not** ringing: no
VoIP push and no incoming-call UI are involved. But it collides with a stated
position — `apply-the-app-store-listing.md` and `post-to-the-launch-surfaces.md`, the latter in what App Review
was told, both say *there is no CallKit in it at all*. Those sentences are about
not ringing and not piercing a Focus, which this would not do, but they say
CallKit by name and would need rewriting, and a reviewer may ask. It is also
most of what `phone-calls-during-watch.md` asks for: a channel that counts as
a call is one that other calls meet as busy. Read STATES.md and
POSTMORTEM-echo.md first — CallKit takes over the audio session's activation,
and three components already configure it.

**PushToTalk**: Apple's framework, with a system lock screen UI, and the
entitlement GLOSSARY.md § *Lock screen card* already names as what would let a
backgrounded app claim the floor. A larger change of model, and an entitlement
Apple grants on request rather than by default.

The third surface, the Now Playing controls, was ruled out: play and pause
meaning unmute and mute is a misuse that collides with the watch party.
