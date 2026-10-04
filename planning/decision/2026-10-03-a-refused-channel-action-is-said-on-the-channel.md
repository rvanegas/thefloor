# A refused channel action is said on the channel

Closes the backlog entry *A channel action that never lands says nothing, and
the screen believes it anyway*, by building the cheaper half of it and deciding
against the rest.

## What was wrong

When the registry refuses a `channel.action`, `dispatch` returns a sentence
written for the person who acted: *Channels hold up to N people.*, *You are the
last member, so leaving would destroy this channel…*, *Removing somebody takes
two members agreeing…*, and the rest. Several of those refusals have comments
in `server/src/channels.ts` saying they are refused "out loud rather than
silently", because a refusal nobody hears reads as a dead button.

The server said them, and the app put every one in `lastError`. Only `AuthView`
renders that, and signing in or out clears it. So nobody saw them, and a refused
act looked like exactly the dead button those comments were written against.

## What was built

- **The `error` frame carries `channelId`** when what was refused was a channel
  action, in both places `channel.action` can be refused (`dispatch`, and
  answering a knock). It is optional and additive: a build that predates it
  ignores the field, so there is no deploy order to keep. `refusedIn` in
  `server/src/ws.ts` sets it only when the payload's id is a string.
- **The socket splits the frame**: one naming a channel goes to `onRefused`,
  anything else to `onError` as before. *Malformed message.* and a device that
  has gone therefore stay off channel screens.
- **`AppProvider` keeps the last refusal per channel** in `refusals`, until
  dismissed or replaced, and clears them on every reset. It is kept per channel
  and not on the screen that acted because that screen has usually gone:
  *Settings* sends the rename as it closes, so the answer lands on the channel.
- **`ChannelView` draws it as a notice card** above the tab content: *That did
  not go through*, the server's sentence, and *Got it*. It is STYLE.md's notice
  card, placed where the getting-started and public-page cards are and for
  their reason, which is that it is news whichever tab is open.

The server's sentences are English, as they already were on the sign-in
screen; only the heading is translated.

## What was not built, deliberately

**An acknowledgement for `channel.action`** — an id on each action and an
answer for each. The entry asked for it, and it was weighed and dropped.

- **The real refusals are not on the wire.** A reducer guard (`SET_NAME`
  without `canEditChannel`, say) returns the state unchanged, which is also what
  a harmless no-op returns. So `dispatch` reports success either way. An
  acknowledgement could honestly say *arrived* but not *refused*, unless every
  guard in `core/` were taught to give a reason. That is the expensive part,
  and it is what the entry was really about.
- **What it would catch is rare.** The app hides or disables these controls
  using the same guards, so a refusal needs a race (the room changed between
  drawing the button and pressing it), a stale snapshot, or an older build. The
  offline case, an action that never left, was handled on 2026-09-16 by `send`
  returning whether it wrote. And a lost rename still shows the old name.

If refusals by the guards ever turn out to matter, the way in is guards that
say why they refused, which would let `dispatch` return them as ordinary
refusals. This card would then say them with no further change.
