# Guests are a Pro feature

Rodrigo decided this on 2026-11-26, reviewing the backlog item *A guest does
not hear Claude read aloud*, and it was built the same day. A guest page has no
voice of its own (`modules/read-aloud` is iOS's alone) and, since
`2026-11-19-guests-have-no-paste.md`, no reply text either, so a guest heard
*Ask Claude*'s reply only where *the room reader* spoke it — in a *Pro
channel*. The two other ways in were the server speaking whenever a guest was
present, which bills AssemblyAI in a channel nobody pays for, and the page
reading the reply with the browser's `speechSynthesis`, which needs the text
sent to a seat for that alone. **Instead a guest is only ever in a Pro
channel**, on four rules:

1. **Guests are a paid feature.** `canInviteGuest` takes whether the channel is
   Pro — the server from `isProChannel`, the app from `ChannelView.pro`, since
   a subscription is account state `ChannelState` knows nothing of. The
   server refuses a guest link and a guest invitation with *Guests are part of
   Pro.* (403), and refuses letting somebody in at the door the same way;
   turning them away needs no Pro. *Invite as guest* is greyed, with that
   sentence under it. A guest's own Pro still makes no channel Pro.
2. **A room that was Pro stays Pro until it ends.** `Channels.proRooms`
   latches it as the room opens and whenever `isProChannel` finds it Pro while
   it is open, and lets go at `ROOM_ENDED` — not when it empties, since a
   return inside `ROOM_DEPARTURE_MS` is the same room. Every grade follows it,
   not guests alone. In memory, as the room is: a restart drops every call.
3. **No Standard fallback for a language AssemblyAI does not speak.** In a
   Pro room such a reply is posted with `Clip.unspoken` and no phone reads it.
   `speechLanguage` had never actually returned null — it fell back to the
   asker's language, then English, so a Japanese reply was read by an English
   voice. `unspeakable` (`core/speech.ts`) now catches a text more than half of
   whose letters are outside the Latin script all six languages use. **A
   Latin-script language outside the six, Dutch or Polish, is not caught**: the
   marker words cannot tell it from a short text in one of the six, so it is
   still read in the asker's language. *Read a document aloud* refuses such a
   document (422) for the same reason.
4. **Guests end when the channel stops being Pro**, which needed nothing new.
   Every seat, knock, guest invitation and guest link already ends when the
   last member steps out (`settleEmpty`, `Guests.channelEmptied`), in every
   channel; with rule 2 keeping a room Pro to its end, no guest is ever in a
   room that is not.

**Left as they were**, the decision naming only language: a reply over
`SPEECH_MAX_CHARACTERS`, one AssemblyAI refuses, one with no audio inside
`SPEECH_FIRST_AUDIO_MS`, and a box with no AssemblyAI key still fall back to
the phones, and a guest hears none of them. Making those unspoken too is the
same one-line choice in `startSpeech`.

**No shim.** The guest page is the server's own and changed with the deploy.
An installed build draws *Invite as guest* in a channel that is not Pro and is
told *Guests are part of Pro.* — a refusal of something no longer permitted,
as `2026-11-19-guests-have-no-paste.md` reasoned, not a shape kept for
compatibility. An installed build does not know `Clip.unspoken` and reads such
a reply itself, as it would a Standard one, until it updates.
