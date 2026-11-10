# noesis is read-only without Pro, and Send to noesis goes

Decided at the prompt on 2026-11-10 and built the same day. *Send to noesis*
beside *Open in noesis* on a segment's menu read as one thing offered twice,
and Rodrigo: *"noesis should be available only to Pro."* Asked what that
meant for a channel's library, which every member reads: *"noesis is
read-only for non-Pro."* Asked whether an account marked unlimited by hand
counts: *"Make them all Pro."* This reverses
`2026-11-02-send-a-segment-s-text-to-your-own-noesis-library.md`.

## Read-only without Pro

- **Connecting stays everybody's**, since it is what opens a channel's library
  at noesis, and so do both *Open in noesis* buttons and *Open noesis*.
- **Switching your own library on in a channel is Pro's.** The server counts
  a connection without Pro as none where `SET_LIBRARY` asks
  (`connected` beside `isPro`, app.ts), and *Channel Settings*' *Library*
  card is not drawn without it (`NoesisView.pro`, new). *Floor Settings*'
  card says that consulting your own comes with Pro, and where Pro cannot be
  bought — the web, Android — that it is bought on an iPhone.
- **A lapse keeps the connection and the switch.** At a press an owner who is
  not Pro is passed over (`tokenFor` answers null), so their library goes
  quiet in every channel and comes back when they renew, with nothing turned
  on again. Disconnecting them was the alternative: simpler, and a reconnect
  for every renewal.
- **The channel's own library** already filed only while a Pro member is
  connected (`channelLibraries.ts`), and every member still reads it. noesis
  holds the other half: at noesis a member who does not pay may read a
  channel's library and nothing more.

## The mark set by hand is Pro

`transcripts_unlimited` was metering only: it lifted the weekly minutes and
chose nothing. Since this day it is Pro everywhere Pro decides — the model
grades, the library switch, the channel library's filing, the members noesis
is told pay — through one `isPro` in app.ts, which `transcribesFreely` was
folded into, having become the same function. `ProView.until` still says only
what was bought, so *Floor Settings*' Pro card is unchanged for those
accounts.

## Send goes, in two steps

noesis copies now (noesis's
`2026-11-10-a-document-is-copied-into-your-own-library-your-lines-yours.md`):
from the channel's library into one's own, adding the name one goes by in
the channel to one's names, and asking which speaker one is when none
matches — what Send did silently with the Floor display name. So build 429
drops the menu row, its library chooser, `api.sendToNoesis`, the *Connect
again* path on *Floor Settings* and their strings in both languages.

It is wire-visible, since builds 404 to 428 call `POST /me/noesis/send`, so
the server keeps answering them — for Pro alone, 402 otherwise — with the
`import` scope still asked for at connecting and `canSend` still reported.
SHIMS.md, gate 429, says what goes once the floor passes 428. Nothing already
sent is touched; no data migrates.
