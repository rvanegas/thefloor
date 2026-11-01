# A shared text says where and when

A segment's shared text — the download, and the copy a browser without Web
Share falls back to — **opens with `The Floor — <channel>` and dates itself
`yyyy-mm-dd`**, where it opened with the log's day alone, `Fri, Oct 30`.
`formatSegmentText` in RecordTab.tsx.

The day without a year, and the channel only in the download's filename, meant
that a copy pasted somewhere or a file renamed no longer said which
conversation it was. That is exactly what happens on the way into Rodrigo's
mdc library, whose `mdc import` turns these into chats: it takes the date
from this line, and the channel as what the chat's title is to be told apart
from, and reads a file from before this change by its filename. **ISO rather than the log's words** because it
reads the same in English and Spanish, and so the importer parses one form
rather than every locale's; the hours stay in the reader's language. A speaker
the text could not name is *Someone* there, as `claude.ts` already writes it,
where it printed `null`.

**Not done here: a title of each segment's own.** The channel's name is not
unique — every sitting in one channel shares it — and a title made by Claude
from the text was proposed. Made here it would send every kept transcript to
Anthropic, where `/privacy` says that happens only on a press of *Ask Claude*,
and charge the channel for every segment. **Rodrigo chose to have mdc make it
instead**: `mdc import` asks its index model, from what was said, and asks
again in the same exchange when the library already has that title. So
nothing here changes about who sees a transcript, only what imports one pays,
and the *Record* log still names a segment by its hours.
