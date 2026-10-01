# A lock screen button asks, whatever is declared

2026-10-01. **On iOS 26 a locked phone asks for Face ID or the passcode before
the card's Mute or Out runs**, and declaring `authenticationPolicy` as
`.alwaysAllowed` does not change that. Both intents now declare it all the
same, by instruction: the intent is stated correctly and uniformly, and is
already the answer if iOS starts honouring it.

## What was believed, and why it was wrong

`tasks/unmute-without-unlock.md` reported that unmuting from the lock screen
asked for a passcode. On 2026-09-30, `8f345118` closed it on a build 320 run in
which a locked phone's Unmute reached JavaScript in 81ms and asked for nothing.
**That phone was being held to its owner's face.** Face ID satisfied the
requirement without unlocking the screen, so the run never tested a phone
that could not see who was holding it. `2026-09-29-the-lock-screen-carries-a-way-out.md`,
`StepOutIntent.swift` and the glossary repeated the conclusion.

A second misreading propped it up. `a81c270c` read `ToggleMuteIntent`'s built
metadata, `authenticationPolicy: 0`, as `.alwaysAllowed` by default. The same
record carries `isAuthPolExplicit: false`, against `true` for `StepOutIntent`,
which declares it — so the `0` was most likely the field's empty value and not
a policy. It turned out not to matter, for the reason below.

## What settled it

On build 327, phone flat on a table, with Face ID kept out of it:

- **Mute asked, before taking effect, twice.** The log agrees: each `lock tap`
  is followed three to four seconds later by `app active`, the unlock that the
  passcode bought; the earlier taps, made with the phone held up, have no
  `app active` after them.
- **Out asked too**, though it declares `.alwaysAllowed` explicitly.
- **Otter.ai's own Live Activity pause button asked.** A third-party app with
  every reason to want pausing without unlocking does not have it either.
- **The phone permits it**: *Settings → Face ID & Passcode → Allow Access When
  Locked* has both *Lock Screen Widgets* and *Live Activities* on.
- **YouTube's lock screen pause did not ask**, and is not a counterexample:
  that is the system's Now Playing card, which iOS runs itself.

So the requirement is iOS's, applied to third-party Live Activity buttons on
the lock screen. **What `.alwaysAllowed` is for, then, is not established.**
The SDK gives the property and its three cases and no documentation; the
likeliest reading is that a policy can add a requirement an app wants and
cannot remove one iOS imposes. It may also be an iOS 26 defect, which is the
other reason to keep the declaration.

## What follows

**The card's buttons work, and ask unless Face ID is already satisfied** —
which for somebody picking up their phone and looking at it is most of the
time, and is why this went unnoticed for a fortnight. Nothing here changes how
they are drawn.

**Muting a locked phone without authentication is possible only through a
surface iOS runs itself.** The one that fits is CallKit, whose call screen has
a mute that works while locked; repurposing the Now Playing controls would also
work and was ruled out as a misuse that collides with the watch party. Whether
a channel should be a call to iOS is its own decision, filed as a task.

`tasks/a-lock-screen-tap-during-a-reconnect-looks-dead.md` stays open on its
own merits: the nine seconds it chases is a reconnect, not authentication.
