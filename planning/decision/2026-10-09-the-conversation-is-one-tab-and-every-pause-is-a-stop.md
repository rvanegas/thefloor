# The conversation is one tab, and every pause is a stop

The channel screen had seven tabs the day the live transcript shipped, and
Rodrigo found it unattractive. **Recordings and Transcript became one tab,
*Conversation*, in Listen's old place**: People, Clipboard, Invite,
Conversation, Listen, Watch, the same six always.

**Why those two.** STYLE.md already said the Transcribing pill spends the
recording's red because what you say being kept is one meaning whether it is
kept as audio or as text; the tabs were the only place the app treated them as
two. Transcript was also the one tab that came and went, and
`task/keep-the-transcript-and-let-the-audio-go.md` moves the two together
anyway. Invite into People and Listen with Watch were the alternatives, and both
were weaker: Invite was split out deliberately on 2026-09-12, and Watch's two
shapes make it the most expensive tab to merge.

**Why that name.** A channel may keep the conversation as audio, text, both or
neither, so neither *Recordings* nor *Transcript* covers it. *History* and
*Archive* were rejected because they invite tracking past clipboard and watch
values, *Minutes* because "This takes a few minutes" is said on this very tab,
and *Proceedings* because it was too formal. *Conversation* was briefly ruled
out on the grounds that the glossary owned it. It did not: the word was used as
plain English for the live room, and the strings already used it for the kept
thing — "What was this conversation?", "Publish this conversation?". It is
named for what the two forms are a record of.

**Every pause is a stop**, by Rodrigo's call the same day. The transport is
Record and Pause, and Pause sends `STOP_RECORDING`, so the next Record begins a
new recording. A conversation recorded in stretches is therefore several
recordings, and **they are folded into the transcript as segments**, each at
the moment it began, with its card's Share as the download. The tab is one
timeline, oldest at the top, as `task/the-channel-is-one-long-conversation.md`
asks, and the transport sits under it, with the tab opening at its foot.
Putting the transport on top would have scrolled it away on every open, since
a timeline that follows its newest line opens at the bottom.

**Client-only, deliberately.** Core and the server still honour
`PAUSE_RECORDING` and `RESUME_RECORDING`, because builds in people's hands
send them. A run one of those builds paused shows Resume, and Pause ends it.
There is no wire change and so no SHIMS.md entry. Retiring the paused state from
`core/` is possible once the floor passes this build, and is not needed for
anything.

**Left as it was:** a recording's own transcript is still opened from its
card, and the search over those transcripts stays at the top of the tab. Six
captions across a pane of 480 to about 510 points truncate *Conversation*, as
they already truncated Spanish *Portapapeles*; `layout.ts` § `MIN_SEGMENT` says
why the number was not raised.
