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

**The language the reply is written in**, which is the conversation's, since
Claude answers in that. Built first on the app's language, and changed the
same day at Rodrigo's word: a Spanish reply on a phone set to English was read
by an English voice.

**Told from the reply's own text, on the phone** — `NLLanguageRecognizer`,
offline and instant, with English and Spanish hinted so a short reply leans to
one of them rather than to Catalan or Portuguese. Below 0.6 confidence
(`LANGUAGE_CONFIDENCE`) — a reply that is mostly a name, a number or a link —
the app's language reads it instead. Rejected: Claude tagging its own
language, which is a prompt change and a parse to answer what the text
already answers; the transcriber's detection, which a channel with no live
transcript does not have and which describes the speech rather than the
reply; and a channel setting, wrong whenever a conversation changes language.

Then the phone's region where the phone speaks that language (`localeFor`),
and among the installed voices the best quality, the region, then the name
(`bestVoice`).

**A local module, `app/modules/read-aloud`, rather than `expo-speech`.** The
card needs `AVSpeechSynthesisVoice.quality` in all three values; Premium
arrived in iOS 16, and a wrapper that reports only Default and Enhanced draws
the best voice as the worst. Novelty voices are filtered out on iOS 17+. **It
is native, so it reaches a phone only with the next upload**; until then the
card is not drawn and nothing speaks.

## The card

*Read aloud* under *Audio output*, for that card's reason: it is about this
phone and stores nothing. **Both English and Spanish**, the app's own first,
since the reply's language decides the voice: a line each naming the voice and
its quality, or saying only the basic voice is installed, and unless both are
Premium the path in Settings' own words,
which iOS 26 renamed from *Spoken Content* to *Read & Speak* — chosen by
`Platform.Version`. **The download cannot be started or linked to**: iOS has
no API for either, and `App-prefs:` URLs are private and refused at review. So
the card asks again whenever the app returns to the foreground.

**Unverified on a phone**: the iOS 26 menu name in Spanish (*Leer y hablar*
here) and whether Spanish Settings labels Enhanced *mejorada*. Both are a look
at a phone set to Spanish.
