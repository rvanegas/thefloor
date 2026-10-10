# Audio and Text are kept independently

The *Record* tab's two switches were radio style for a day: turning *Audio* on
turned *Text* off, and the reverse. Rodrigo found that switching Audio on and
then Text turned Audio off, and said both should be possible at once. **Since
2026-10-10 each switch moves only its own form**, so either, both or neither
may be on.

**Why it was radio, and why that was a misreading.** `KeepSwitches` cited
`task/keep-the-transcript-and-let-the-audio-go.md` as asking that a channel
keep the conversation *as audio or as text*. It asks something else: that
text be enough by default, and that keeping the audio be something somebody
chooses to do — which is adding it, not swapping to it. The server never
enforced the exclusion, and *Record automatically* already produced both.

**Pause is one hold over the pair.** It holds everything running. While
anything chosen is held it reads *Resume*, and Resume restarts everything
held. A form switched on during a hold, like Text turned on while Audio is
paused, runs at once and the button keeps offering Resume, so one press brings
the pair back level. The alternative was to start the newcomer already held.
That is cheap for text, but for audio it means a recording that begins paused,
an egress started only to be stopped, and core has no such state. It would
also have needed a channel-level hold on the wire, where this needs nothing.

**What went with the radio.** One refusal went: somebody who may not move
*Text* could not turn *Audio* on while the text held, since that would have
turned the text off. That person may now add Audio on the recording's own
rules. Its sentence, `recordRefusedText`, went too, in both languages. Text
is still moved only by the account that pays for it.

**Client-only.** No wire change, no core change and no SHIMS.md entry. Older
builds in people's hands keep their radio behaviour, which only ever turns one
form off.
