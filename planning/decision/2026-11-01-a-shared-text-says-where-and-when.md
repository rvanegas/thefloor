# A shared text says where and when

A segment's shared text — the download, and the copy a browser without Web
Share falls back to — **opens with `The Floor — <channel>` and dates itself
`yyyy-mm-dd`**, where it opened with the log's day alone, `Fri, Oct 30`.
`formatSegmentText` in RecordTab.tsx.

The day without a year, and the channel only in the download's filename, meant
that a copy pasted somewhere or a file renamed no longer said which
conversation it was. That is exactly what happens on the way into Rodrigo's
mdc library, whose `mdc import` turns these into chats: it takes the channel
as the chat's title and the date from this line, and reads a file from before
this change by its filename. **ISO rather than the log's words** because it
reads the same in English and Spanish, and so the importer parses one form
rather than every locale's; the hours stay in the reader's language. A speaker
the text could not name is *Someone* there, as `claude.ts` already writes it,
where it printed `null`.

**Not done: a title of each segment's own.** The channel's name is not unique
— every sitting in one channel shares it — and a title made by Claude from the
text was proposed. It would send every kept transcript to Anthropic, where
`/privacy` says that happens only on a press of *Ask Claude*, so it waits on
that decision.
