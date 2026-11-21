# Speech is in the language of its own text

Changed 2026-11-21, after Rodrigo found a Spanish library document read aloud
in *Listen* by the English voice. **A channel has no language**, he said, and
treating it as having one is not a good idea. What AssemblyAI is asked to
speak is now settled by the text being spoken: a document's own words, a
reply's own words.

**What it replaces.** The 2026-11-13 decision (*Claude's reply is spoken into
the room by Pro voices*, § *The language*) spoke a reply in the language
AssemblyAI detected for the channel's first finished transcript, then the
asker's app language, then English. It also turned down guessing from the
reply's text. The 2026-11-20 reading feature reused that rule as it stood. In
a channel that had first been heard in English, or that had no transcript
while the presser's app was in English, a Spanish document came out in the
English voice, and nothing on screen said why.

**The rule now** (`speechLanguage` in channels.ts):

1. **The text's own language**, from `textLanguage` in core/speech.ts. It
   counts common words that mark one of AssemblyAI's six languages and that
   the others seldom use; words two languages share are left out. A language
   needs at least five such words, and at least twice the next language's
   count, to win.
2. Otherwise **the asker's app language**, as sent with the press, else the
   account's.
3. Otherwise **English**.

A short reply ("Sí.") has too few marker words to settle anything and falls
back to the asker's language. That is the same answer the old rule gave in a
channel with no transcript.

**What changes completely.** `Transcripts.firstLanguage` and the
`ClaudeSpeech.firstLanguage` hook are removed, not kept as a fallback, because
nothing installed reads them. Nothing on the wire changes, so the change needs
no shim. Readings kept from before were made under the old rule and stay as
they were. A reading's hash includes its language, so the next press of a
Spanish document that had come out in English synthesises it again in
Spanish, once, and pays for those characters again. The English copy expires
with the month like any other reading.

**Not done.** No library was added. A word-count scorer over six languages is
a few dozen lines with no dependencies, it lives in `core/` where both ends
can use it, and it is sure enough for whole documents and for replies of a
paragraph. The app's iOS `NLLanguageRecognizer` (`detectLanguage`) stays
where it was, choosing a phone's *Standard voice*. The server cannot call it,
and it answers a different question.
