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
there is no fetch. The one wire change is `Clip.voices`, below. The first look at a channel is taken as
read, `usePresenceChime`'s rule, and leaving the room stops the voice.

**No switch.** The ask named one behaviour and no preference, so there is
nothing to turn off. If one is wanted, it is a phone's setting rather than the
account's — the voices are installed on the phone — and the card has to say so,
per `HomeSettingsView`'s one-scope paragraph.

**Local, never into the call, and the session untouched.** Each phone reads to
its own listener. Every phone present reading the same reply at once is the
price of no switch, and the first thing to look at if it grates.

**The synthesizer renders; the call's own engine plays.** Build 395 used
`AVSpeechSynthesizer.speak`, and Rodrigo heard it only in the earpiece while
`CALL` held `defaultToSpeaker`. Build 396 rendered with
`write(_:toBufferCallback:)` and played the file through an `AVAudioPlayer`,
the film chimes' path, which fixed the route and then failed three ways on a
phone: **faint**, **stopping after a few sentences**, and **heard by everybody
else through whoever's microphone was open**. The first and third are one
cause: to the voice processing the call runs, a player in the app is *other
audio*, which iOS ducks, and which the echo canceller cannot remove, its
reference being only what the engine itself plays.

So from build 397 the reply plays on **an `AVAudioPlayerNode` on the main mixer
of LiveKit's own `AVAudioEngine`** (`CallEngine.swift` in
`app/modules/read-aloud`): mixed with the call at its level, and cancelled from
the microphone like the voices beside it. **It therefore never reaches a
recording**, which is track egress of what the microphone sends; on build 396
it could, by the same leak that carried it into the call. The engine is not
public and takes one delegate, which `@livekit/react-native-webrtc` already is,
so its observer class's `configureOutputFromSource`, `willStartEngine`,
`didStopEngine` and `willReleaseEngine` are **replaced at module creation**,
each calling the original first. The engine wires `source → mainMixerNode →
outputNode` itself and then calls `configureOutputFromSource` with the mixer
(`audio_engine_device.mm`, m144, LiveKitWebRTC 144.7559.15) — the moment it
expects the graph to be extended. **A LiveKit upgrade that renames any of them
turns this off rather than breaking anything**: speech falls back to the
player, and the log says which selector was missing. Check that line after
every LiveKit bump. The player remains the path while the engine is not playing
out at all, as alone in a room.

**The stop after a few sentences is not established.** Two accounts fitted and
the code could not choose: `write` ended early, the first empty buffer having
been taken as the end; or the player was stopped when LiveKit restarted the
engine, as it does when somebody takes the floor. Both are now handled rather
than chosen between — a render ends only a quarter of a second after an empty
buffer with nothing following, and the engine stopping mid-sentence is waited
for a second and a half and resumed from the half-second it was in — and both
are reported: **every line the reader writes starts `read-aloud` in the
diagnostics log**, which ships to the server. `empties` above 1 on a
`rendered` line is the first account; `engine stopped during` is the second.

**A sentence at a time**, split by `NLTokenizer`: the first plays while the
rest render, which also takes the second off the time to the first word.

## Which voice

**The asker's**, at Rodrigo's word, from build 397: a press of *Ask Claude*
sends the voice the asker's phone would read each language in (`askerVoices`),
the server carries it onto the reply as `Clip.voices`, and **every phone reads
in it where it has that voice installed**, and in its own choice where it has
not. Identifiers are the same across phones for the same voice, so only an
install is needed. An asker on an older build sends none, and each phone then
reads in its own. What follows is how a phone's own choice is made.

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
and **the voice chosen for it on *Floor Settings***, or else among the
installed voices the best quality, the region, then the name (`bestVoice`).

**The choice is the app's because iOS's cannot be read.** Rodrigo selected
Allison (Enhanced) under Settings › Accessibility and was read to by Aaron,
which sorts first among equals. That selection belongs to Speak Selection and
no public API hands it to an app; `voiceWithLanguage:` promises only "enhanced
quality voice if available". So the card lists the Enhanced and Premium voices
for each language as buttons, where there are two or more, and says the iOS
choice is not shared. **Kept in this phone's keychain**
(`thefloor.readAloud.en`, `.es`), not on the account, since an identifier from
one phone names nothing on another — the second scope *Floor Settings* warns
about, admitted on the card. A chosen voice since deleted falls back to the
rule above.

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
