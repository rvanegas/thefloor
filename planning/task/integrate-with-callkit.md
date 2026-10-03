# Integrate With CallKit

Integrate the app with CallKit. Two existing tasks would each be delivered by
part of this, and they say to decide CallKit together:
`mute-a-locked-phone-through-callkit.md`, which wants a lock screen mute that
needs no passcode, and `phone-calls-during-watch.md`, which wants other calls
to get a busy signal. Doing it means rewriting the "there is no CallKit in it
at all" position in `DESCRIPTION.md` § 2 and `LAUNCH.md`. Read STATES.md and
POSTMORTEM-echo.md first, because CallKit takes over activating the audio
session.

On the call with Erta, 2026-10-02, Rodrigo said he wants this: being on The
Floor should count as a phone call to the phone, so that **incoming calls see
you as busy** and **the call shows up in Recents**.
