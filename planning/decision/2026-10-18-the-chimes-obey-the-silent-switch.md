# The chimes obey the silent switch

Asked for directly: the chimes — recording, somebody stepping in or out, nearby,
the film's play and pause — should not sound on a phone whose ringer switch is
set to silent. This reverses `2026-09-17-the-chime-is-not-an-alert.md`, which
moved them onto `AVAudioPlayer` so that they *would* sound through it.

**The argument that entry made was about what a presence cue is, and it was not
wrong so much as not the user's.** It held that a chime fired in a call is part
of the conversation rather than an interruption of it. The switch is the
person's own statement, and the one they are making is *no sounds from this
phone that are not somebody talking*. The voices still play; they are the call.
What goes is the app's commentary on the call, which the screen also carries.

**The mechanism is the path, because nothing can read the switch.** There is no
public API for its position — the iOS 26.2 SDK headers mention it only as a
behaviour of categories — and the known detector is a timing guess: play a
silent system sound and see whether it returned too quickly. The alert path is
the one thing the switch governs directly, in a call or out of one, and the
2026-09-17 entry is the device evidence that it does: chimes inaudible in a
channel, phone in silent mode. So `CHIME_PATH` in
`app/modules/audio-route/index.ts` is `system` again, and nothing else changed
in what plays.

**What it costs.** The alert path plays at the ringer's level rather than the
call's, and takes no gain — the original complaint of
`2026-09-15-the-chime-has-no-volume-because-of-the-path.md`. That complaint was
mostly the cold first play and the switch itself, both since understood, and
the peak is at full scale; but on a phone with the ringer turned down the
chimes will be quieter than the voices around them. **Worth listening for on
the first build that carries this.**

**Left in place, deliberately.** The film's play chime holds the microphone
until it has been heard (`useFilmHandover`, `waitForChime`), and the pause chime
waits for `playAndRecord` to come back (`useWatchChime`). Both exist because a
player chime plays into this app's session and was lost when the session moved.
A system sound does not depend on that session, so both may now guard nothing —
but they were built against a race seen on a phone, and are removed when a
phone shows they are not needed, not on reasoning. With no player reading the
hold ends on `no reading`, its `HANDOVER_MS` fallback, which is what every
device did before 2026-10-03.

**Not done: a buzz in place of a silenced chime.** `AudioServicesPlayAlertSound`
vibrates when the switch is thrown, where `AudioServicesPlaySystemSound` does
nothing. It was not asked for, and a buzz cannot say which chime it was —
the reason the chimes are sounds at all.
