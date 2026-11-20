# Read a library document aloud into Listen

Rodrigo, 2026-11-18, on a call with Rochelle (the chat
`2026-11-18-claude-audio-feature-development-and-costs`). She had heard a
noesis chat by having it spoken with `ts speak`, playing the audio into a room
and having The Floor transcribe it again: markdown to speech to text, a
document the library already held. **Asked: when *Ask Claude* finds a document
in the library, a control on it in the *Record* — read this aloud and put it in
*Listen*.**

- **It hangs off the steps a press records**: the line under a reply that
  opens to *Read Mem Architecture Summary*, built 2026-11-20 (`WorkingSteps`,
  `decision/2026-11-20-claude-s-working-is-kept-with-its-reply-and-the-room-is-shown-it.md`). Claude itself cannot do it: it
  does not voice anything, and The Floor has no other view of a library's
  documents, so this is the one place a document appears in the app.
- **Synthesised by the server**, as *Pro* replies are, with the request
  `ts speak` already borrows (`server/src/speech.ts`); spoken in whose voice is
  open.
- **The cost is accepted**: about 50 cents for the chat she heard, by
  Rodrigo's reckoning, and paid from AssemblyAI credit already bought, which he
  counts as "relatively free". Still, it is a press that spends, so who may
  press it (Pro, as *Pro* voices are) and whether a second press reuses the
  first audio are to settle.
- **One of three things Listen would play**, in Rodrigo's words: a line of the
  recording (`tap-a-line-of-the-record-to-hear-it.md`), Claude's reply
  (`play-claude-s-reply-in-listen-and-keep-its-speech-a-month.md`), and this.
  Design them as one way into the player rather than three.

Read GLOSSARY *Read aloud*, *Library* and *Channel tabs*, and STYLE.md before
drawing the control, which needs a Spanish string too.
