# Claude's reply is read aloud on arrival

Built 2026-10-28. Rodrigo's ask: a section in *Floor Settings* that detects
what voice is installed for the selected language, with instructions beside it
for downloading something better; and "the only read aloud functionality I
want is to read the text posted by call to Claude in the Record, immediately
after it is pasted."

## What speaks, and where

**A paste by `CLAUDE_ID`, on every phone present, as it lands** —
`useClaudeReadAloud`, mounted in `App.tsx` beside the chimes for their reason:
somebody who walked back to Home is still in the room. It keys on
`ChannelState.clip.id`, which already carries the latest paste in full, so
there is no fetch and no wire change. The first look at a channel is taken as
read, `usePresenceChime`'s rule, and leaving the room stops the voice.

**No switch.** The ask named one behaviour and no preference, so there is
nothing to turn off. If one is wanted, it is a phone's setting rather than the
account's — the voices are installed on the phone — and the card has to say so,
per `HomeSettingsView`'s one-scope paragraph.

**Local, never into the call.** `usesApplicationAudioSession` is left true, so
the synthesizer plays through the session the call configured rather than
reconfiguring it, and `mixToTelephonyUplink` stays false. A phone on its
speaker with its microphone open can still carry the voice into the call —
what the chimes already do. Every phone present reading the same reply at
once is the price of no switch, and the first thing to look at if it grates.

## Which voice

**The app's language, in the phone's region where the phone speaks it**
(`speechLocale`), and among the installed voices the best quality, then the
region, then the name (`bestVoice`). Not the language of the conversation, which
Claude follows and the app does not know: a Spanish conversation read on a
phone set to English is read by an English voice. That is the literal ask, and
the first thing to change if it is wrong.

**A local module, `app/modules/read-aloud`, rather than `expo-speech`.** The
card needs `AVSpeechSynthesisVoice.quality` in all three values; Premium
arrived in iOS 16, and a wrapper that reports only Default and Enhanced draws
the best voice as the worst. Novelty voices are filtered out on iOS 17+. **It
is native, so it reaches a phone only with the next upload**; until then the
card is not drawn and nothing speaks.

## The card

*Read aloud* under *Audio output*, for that card's reason: it is about this
phone and stores nothing. It names the voice in use and its quality, or says
only the basic voice is installed, and gives the path in Settings' own words,
which iOS 26 renamed from *Spoken Content* to *Read & Speak* — chosen by
`Platform.Version`. **The download cannot be started or linked to**: iOS has
no API for either, and `App-prefs:` URLs are private and refused at review. So
the card asks again whenever the app returns to the foreground.

**Unverified on a phone**: the iOS 26 menu name in Spanish (*Leer y hablar*
here) and whether Spanish Settings labels Enhanced *mejorada*. Both are a look
at a phone set to Spanish.
