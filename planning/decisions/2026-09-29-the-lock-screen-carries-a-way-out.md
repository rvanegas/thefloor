# The lock screen carries a way out

Built 2026-09-29 from `tasks/out-on-lock-screen.md` — *add button to lock
screen with the action to "step out" of room*. The card now reads: **channel
name, *Open*, microphone, Out.**

## What this reverses, and why it does not

`2026-09-17-the-lock-screen-carries-two-controls.md` said *Mute and open, and
nothing else*, and GLOSSARY.md said *the count is the design*. Read for what it
actually excluded, the count was an outcome rather than a rule: the one thing
it kept off the card was **claiming the floor**, because that opens a
microphone and iOS refuses to open one for a backgrounded app — the card would
be offering something it could not deliver. That was the test.

A step-out passes it. It opens nothing; it gives the room up. The reducer has
no refusal for `STEP_OUT` at all — the footer's comment is *a departure is the
one act nothing on this screen can withhold* — so the button is never grey and
there is no disabled state to explain. The glossary line now says the test
rather than the count.

## The one real difference from Mute: the app may go to sleep

A mute leaves the audio session exactly where it was, so the app stays alive
and the card follows the next snapshot. **A step-out is the act that ends the
audio session**, and an app without one is suspended at iOS's convenience —
possibly before the snapshot that would have taken the card down has arrived.
The card would then go on describing a room this account had left, with a Mute
button on it: the stale-card bug of
`2026-09-18-the-lock-screen-card-does-not-outlive-the-room.md`, by a new route.

So **this is the one event that is answered.** `StepOutIntent.perform()` asks
JavaScript to act and waits — two seconds at most — to hear what `act`
returned, which is whether the action reached the socket. True, and the intent
ends the card itself, there and then. That is safe only because `STEP_OUT` is
never refused: a departure that has reached the server is a departure.

**False, and the card stays up.** A queued step-out is sent on reconnect, but
until then the device is still in the media room and can still be heard — a
card that vanished on the tap would be telling somebody audible that they had
left. It comes down the ordinary way, with the snapshot after the reconnect,
or at the end of the grace if there is no reconnect. No answer at all is
treated as false for the same reason.

## No passcode

**`authenticationPolicy` is `.alwaysAllowed`**, which is iOS 26's setting and
did not exist before it; the property is declared `@available(iOS 26.0, *)` and
the older systems never ask. The sibling task *Unmute without Unlock* reports
the Mute button asking for the passcode, and the default policy is the likely
cause — **inferred, not confirmed on a phone**; the header gives the property
and not its default.

The instruction was explicit, and the reasoning is short: the worst somebody
holding another person's phone can do with this button is take them out of a
conversation whose name the card already shows. `ToggleMuteIntent` was **not**
changed here; it is the whole of that sibling task and was kept to it.

## The shape

The Mute button's arrangement, a second time. `StepOutIntent.swift` has two
target memberships and joins `SHARED` in `plugins/with-live-activity.js`;
`LiveActivityModule` emits `onStepOut` with an id and takes the answer back
through `answerStepOut`; `addLockScreenStepOutListener` in
`modules/live-activity` answers with the handler's boolean; `useLockScreen`
takes an `onStepOut` that `App.tsx` points at a bare `STEP_OUT`. Bare, because
the footer's `stepOut` adds only whether leaving closes the screen, which it
does not (`stepOutClosesScreen`).

**The glyph is the footer's `StepIcon`** — `lucide/log-out`, transcribed into
`StepOutShape` as `MicShape` was — with the word as its accessibility label,
*Out* / *Fuera*, the footer's `rungOut` resolved by the app and sent as
`outLabel`. That field is **optional in `ContentState`** so that a card adopted
at launch from a build before this one still decodes.

Below iOS 17 nothing is drawn for it: the microphone is shown there because it
states something true about the room, and a door does not.

## What was checked, and what was not

`swiftc -typecheck` over the widget's sources as the extension sees them, at
iOS 17 and at 16.1, clean; and a full `prebuild --clean` and simulator build
of the app and extension, which is the only check that compiles the intent's
real body and the module's wait against the pod — clean, no warnings from any
of these files. The hook's tests cover the current-channel read, the
stale card, and both answers. **Nothing is verified on a device**, and two
things can only be judged there:

- **Whether three controls crowd the name.** `LockScreenCard.scale` was 1.5
  when there were two, chosen by looking; a third at the same scale takes about
  sixty more points from the name. Look before changing the number.
- **The walk:** step in, lock, tap Out — the room hears the falling chime and
  the card goes; the same in airplane mode — the card stays; on iOS 26, no
  passcode is asked for.

A project generated before this change needs `prebuild --clean`: the plugin
returns early on a project that already has the widget target, so the new file
is not added to an existing one.
