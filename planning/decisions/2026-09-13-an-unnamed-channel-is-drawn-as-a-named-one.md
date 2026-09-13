# An unnamed channel is drawn as a named one, and the settings field says why

2026-09-13.

## What changed

The derived title of an unnamed channel — `describeChannel` over the roster,
"Dana Chu" or "Miro Okafor and 2 others" — is no longer italic. It is set in
the same upright body text as a name, in all three places that drew it:

- Home's Channels list (`ChannelsView`, the `described` style, deleted),
- the channel header (`ChannelView`, `describedName`, deleted),
- the *Channels with them* cards on a profile (`ProfileView`,
  `channelDescribed`, deleted).

Each of the three was a ternary on `channel.name`; all three are now one
style unconditionally.

In its place, **the channel name field in Channel Settings takes the derived
title as its placeholder**, in `colors.placeholder`, instead of the prompt
*What is this channel about?*. The string is computed once in `ChannelView`,
beside `others`, and passed to `ChannelSettingsView` as `derivedTitle` — the
roster's display names live on the `ChannelView` snapshot and not on
`ChannelState`, so the settings screen cannot derive it itself, and deriving
it twice from two sources is how the field and the header would come to
disagree about the same channel.

## Why

The italic was carrying an argument, set out in `core/naming.ts`: a name is
one string every member reads and can say to another member, while this is a
*description written from your side* — you see "Dana Chu", she sees your name
— and the interface should admit that rather than dress it as a shared name.

The argument is right and the italic was the wrong instrument for it.

- **A slant cannot say that.** Nothing about italic text means *this string
  is not the one the others see*. A reader who has not been told the rule
  reads emphasis, and a reader who has been told it did not need the slant.
  The distinction was legible only to somebody who already knew it.
- **It landed as emphasis on the channels with least to say.** Most channels
  have no name, so most rows in the list were italic — the styling marked the
  majority case, and marked it in the one way that reads as *pay attention to
  this one*. The earlier note on `described` records the same instinct going
  the other way: dimming was tried and rejected because these are not less
  important. Neither is true; they are ordinary, and ordinary is upright.
- **The channel header had a second, unrelated job to do and was doing it.**
  The reason the header says *Channel* above the title (2026-09-02) is that an
  unnamed channel's header is very nearly what a contact's header looks like.
  That word does the separating, and it does it whatever the title's slant is.

**Where the difference is actionable it is now stated instead of styled.** The
one place it changes what somebody would do is the field they would type a
name into, and that field was the one screen in the app that did *not* say
what the channel is currently called: it sat empty, under a prompt, while
every list drew a title. An empty field there is not an empty name — the
channel is already called something everywhere it appears — and a placeholder
is the exact typographic convention for *this is what is here, and nobody
typed it*. The distinction is carried by the thing that means it: text you did
not write, drawn the way unwritten text is drawn, next to a caret where your
own would go.

It also closes a loop that the prompt left open. The sentence under the field
already said an empty name goes back to listing who is here; the placeholder
now *is* that list, so clearing the field shows you what clearing it gets you.

## What was not done

**The comment in `core/naming.ts` was kept, inverted rather than deleted.** It
still explains that the fallback is a description and not a name, because that
remains true of the data and governs the server, the push title and the
lock screen; what it no longer claims is that the screens mark it. The same
edit was made to `name` in `core/types.ts`, which carried the fuller version
of the argument.

**Nothing changed on the wire, in `core/`, or in what a channel is called.**
`describeChannel` is untouched. This is a styling decision and a placeholder,
and it is deployable and shippable independently of anything.
