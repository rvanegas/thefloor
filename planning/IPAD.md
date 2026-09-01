# Growing the UI for iPad

**A design for work in flight.** TASKS.md § *Grow UI for iPad* names it in a
line; this is what that line turns out to mean. When it ships, what survives
goes to `decisions/DECISIONS.md` and this file is deleted. What is here is what
is only true while the work is open — the step list, the simulator matrix, the
per-file inventory, and the questions still unanswered.

## Context

`app/app.json` says `ios.supportsTablet: false`, and RELEASING.md says why:
*"Nothing in the layout adapts to a larger screen and nobody has opened it on
an iPad. Claiming support invites App Review to test there, on a layout built
for a phone. Turn it back on after actually looking at one."*

That was still literally true when this began — not one `maxWidth`,
`Dimensions` or `useWindowDimensions` call anywhere in `app/src/`. Every screen
is flex-fill with padding, so at 1024pt nothing *breaks*; everything
**stretches**. A channel row with a two-word title and a timestamp 900pt away.
A 976pt email field on the sign-in screen. A transcript running the full width,
past any measure a person can read.

**It is the web app's outstanding layout item too.** WEB.md ends with *"The
layout. Measured, not fixed: at a 1600px viewport the Claim the floor button is
1534px wide. A container with a maximum and a couple of breakpoints."* Same
defect from the other end, and the web train has not been deployed yet. One
responsive layer closes both, which is why none of this is gated on
`Platform.OS`.

## What was decided before any of it was written

Two panes on a wide viewport, a list on the left and the screen you are looking
at on the right. Multitasking supported outright rather than opted out of. All
four orientations on iPad, iPhone left portrait-only. Nested screens confined
to the right pane. And the scope stops at the code: no upload, no submission,
no App Store screenshots.

## Why it is smaller than it looks

Two facts about the codebase do most of the work, and both are worth knowing
before touching anything.

**No screen knows how wide it is.** Every one renders through `Screen` into a
`flex: 1` parent. Putting one in a 340pt column and another in the remaining
700 asks nothing of either.

**"Nested screens open in the right pane" is satisfied by doing nothing.**
`ProfileView`, `ChannelSettingsView` and `TranscriptView` are early returns
*inside* `ChannelView` and `ContactsView`, and those are the right pane. The
nesting already puts them where the decision wants them — and this is also what
preserves the argument at the top of `App.tsx`, that routing profiles through
`Root` would make it know which screen a profile was opened from.

So there are two mechanisms, deliberately separate because they answer
different questions:

1. **A measure.** No column of cards or controls exceeds 620pt. `maxWidth` plus
   `alignSelf: 'center'` — a **constant**, relative to its parent by
   construction, needing no hook and no measurement, correct in a window or in
   a pane.
2. **A layout mode.** Two panes or one, from the current window width.
   Reactive, and with exactly one call site.

Keeping them apart is what leaves `ui/theme.ts` intact. That file argues the
module-scope `StyleSheet.create` blocks may capture their tokens once at import
because the *platform* re-resolves colour, and that a `useTheme()` would force a
re-render path through all of them. A cap is a constant, so a module-scope block
spreads it exactly as it spreads `spacing(2)`. **No existing style block becomes
reactive.**

## The steps, in order

Each is independently shippable and independently verifiable.

1. **This file.**
2. **`ui/layout.ts` and its test**, imported by nothing. Pure addition.
3. **The measure** — the token in `theme.ts`, `Screen`'s content container, the
   seven header rows, the channel footer. Ships alone, changes nothing on a
   phone, and fixes desktop web by itself.
4. **The panes** — `ui/Panes.tsx`, `NoDetailView`, `Root`'s restructure,
   `Screen`'s keyboard suppression in the list pane. Still invisible on a
   phone, because nothing is 800pt wide.
5. **`app.json`** — the first commit that can be opened on an iPad.
6. **Pane-aware trims** — the channel screen's Home button, Home's live bar.
7. **The documents**, and this file goes.

## The simulator matrix

| Device | Portrait | Landscape | Proves |
| --- | --- | --- | --- |
| iPhone SE | 320 | — | the phone is untouched |
| iPhone 16 | 393 | — | the phone is untouched |
| iPad mini | 744 → stack | 1133 → split | the fallback, on real iPad hardware |
| iPad 11" | 820 → split | 1180 → split | the ordinary case |
| iPad Pro 13" | 1032 → split | 1376 → split | the caps, at the widest |

What to do on each iPad, beyond looking:

- Rotate through all four with a channel open, then again with a transcript
  open. **Nothing should remount** — a lost composer or a closed profile is the
  tell.
- Drag another app in to make the window narrow, then wide, then out again.
  The transition is live and must not remount either.
- **With audio connected, do the whole sweep and confirm the call survives.**
  The session hook is above the split so it should, and this is the one thing
  that has to be verified rather than reasoned about.
- Open a recording rename in the right pane: the reveal scrolls its card, and
  the left pane does not shrink.
- The iPad's floating keyboard, and a hardware keyboard. Neither is something
  the phone layout has ever met.

## The seven header rows

Each is a `headerTop` block, `flexDirection: 'row'` with
`justifyContent: 'space-between'`, inside a full-bleed header with a bottom
hairline. The row gets the cap; the header and its border stay full-bleed, so
the rule still runs edge to edge.

    HomeView.tsx            ContactsView.tsx        ProfileView.tsx
    ChannelSettingsView.tsx HomeSettingsView.tsx    SupportView.tsx
    LeaderboardView.tsx

`HomeView` and `ContactsView` each carry `marginRight: -spacing(1)` on
`headerActions`, to align a button's own padding with the edge. Capped, that
negative margin pulls against the cap rather than against the screen edge —
which is still the relationship it wants, but it is the kind of thing that
looks wrong before you work out why it is right.

## What has been seen, and what has not

**Built and run on an iPad Pro 13-inch simulator, 2026-09-01.** Two of the
questions below closed on the strength of it, and one thing worth saying plainly
did not: **the split itself has not been looked at.** Everything above the
sign-in screen needs a session, and the simulator has none — so the caps are
observed and the two panes are so far only tested and reasoned about. That is
the gap to close first, and it closes by signing in on the simulator and
looking, not by more tests.

Rotation is also unobserved. `Info.plist` carries the four `~ipad` orientations
and `TARGETED_DEVICE_FAMILY = "1,2"`, both read out of the generated artefact
rather than the JSON, so the configuration is known good; whether the layout
holds through a rotation is a thing to watch rather than to assume.

## The wide-format refinements, settled and not built

Designed 2026-09-01, after the split landed and before anybody had looked at
it. **Nothing here is implemented.** It was held back because the last of it
turned into TASKS.md § *The Tier Above Both Lists*, and building on the current
structure would mean writing part of it twice. Build it when the tier lands, or
before, if the tier waits.

**One value for the detail pane, replacing a precedence chain.** Five nav flags
resolved in a fixed order answer *which of several open things is on top*. What
is wanted is *the last thing you asked for wins* — tapping a channel while a
profile is open must show the channel. The chain cannot do that, and the bug is
live in what shipped: `HomeView`'s `onEnterChannel` does not clear the profile,
and profile outranks channel, so the tap does nothing visible. Three call sites
already clear other state by hand and the ones that forget are exactly the
faults. A single-valued `Detail` — `none | channel | profile | settings |
standings | support` — makes overriding structural, and stack still renders
`detail.kind === 'none' ? list : detail`, which is the tree that ships today.
It also deletes the `!split && contactsOpen` special case.

**Close, not Back, everywhere and in both layouts.** Six screens say *Back*:
`HomeSettingsView`, `SupportView`, `LeaderboardView`, `ProfileView`,
`ChannelSettingsView`, `TranscriptView`. On a phone the word means *reveal what
is underneath*; in a split there is nothing underneath, since the list is
beside rather than under, and all the control can do is empty the pane. *Close*
is true in both, and one word in both layouts is what keeps the handler
identical — `() => setDetail({ kind: 'none' })`, with no `split` anywhere. Every
attempt to make the wording pane-dependent reintroduces a conditional that this
choice removes.

**`ChannelView` gets a Close too, but only when you are not present in it.**
Without one it is the only view in the detail pane that cannot be dismissed,
which is the single place the panes behave unlike each other. With one offered
unconditionally, somebody present in a conversation can close it, switch the
left pane to Contacts, and be in a call with nothing on screen saying so. So
the button appears exactly when `live?.id !== channelId`, which means it
appears the moment you step out. **The tier is what makes this belt-and-braces
rather than load-bearing**: once the room you are in is shown above both lists,
closing its view cannot hide it.

**`ChannelView`'s Home button stays hidden in a split**, which is already
built. The left pane is either Home or a contact list with a Home button of its
own, so the destination is always one tap away in a pane that never went away.

**A live bar duplicated into `ContactsView` was proposed and rejected.** It
would have closed the same gap, and a live room is not a contact and has no
business in that list. That objection is what produced the tier.

## Open questions

- ~~**Does `alignSelf: 'center'` centre a ScrollView's content container?**~~
  **Yes**, seen on the iPad Pro 13-inch: the sign-in screen is a centred 620pt
  column on a 1024pt screen where it was a 976pt-wide email field. No
  `marginHorizontal: 'auto'` fallback needed.
- ~~**Does the sign-in form want a narrower cap than a list does?**~~ **No.**
  It reads correctly at 620 and the vertical centring survives the cap, which
  was the thing to check. Leave the shared token alone.
- **The left pane holds Home or the contact list**, switched by the same flag
  that makes Contacts a screen on a phone, and a profile opened from that list
  goes in the pane on the right. Added 2026-09-01, after the split shipped;
  `decisions/DECISIONS.md` § *The left pane is a choice* carries the reasoning
  and the one claim it retracts. **Unlooked-at like the rest of the split.**
- **Does the left pane want a selected-row highlight** for the channel open on
  the right? Almost certainly yes, and it touches `HomeView`'s list rendering,
  so it goes last or to BACKLOG.md.
- **Does iPadOS 26 still honour `UIRequiresFullScreen`?** Still open, and it no
  longer blocks anything: the key is deliberately absent and multitasking is
  supported outright, so the answer only matters on the day somebody wants the
  retreat. This checkout builds against the iOS 26.2 SDK, where
  `UISceneSizeRestrictions` notes `allowsFullScreen` is "currently only honored
  on Mac Catalyst", which reads as though the retreat is gone.
- **Is 744 the right side of the cliff?** iPad mini portrait stays stacked. A
  split there would leave a 404pt detail pane, thinner than the phone screen it
  replaced, which is the test a breakpoint has to pass. 768 was tried first and
  fails that same test by twelve points against an iPhone 16 Pro Max, which is
  how the constant became 800. It is still one constant.
