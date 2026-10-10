# Free transcription minutes a week, shared with the live transcript

Asked for on 2026-10-10: retire `TRANSCRIBE_IDENTIFIER`, mark Rochelle, Golf
and Todd unlimited, and turn "one free transcript" into a weekly allowance that
covers the live transcript too. The allowance was then specified as **sixty
minutes, shared, a calendar week** rather than one instance of each.

**The unit is the provider's billed minute.** A recording costs its length
times its stems, the upper bound `transcripts.billed_ms` already starts at; a
live session costs how long it was open, which is what streaming bills by. One
number for both is what lets them share an allowance at all. The batch spend is
not corrected down when the jobs land: the allowance is a ceiling and is spent
as one.

**The ledger is its own table, `transcript_usage`**, for the reason the old
free use lived on the account: transcript rows are swept, so a sum taken from
them hands minutes back after a deletion. A recording's row is written at the
request, so a pending one holds its minutes, and deleted only on failure. The
old `free_transcript_id`/`_at` columns are left in place, unread, so a rollback
finds them.

**The week is Monday 00:00 UTC**, one instant for everybody — the server knows
nobody's time zone, and a rolling seven days was offered and declined.

**Live is billed to whoever switched Text on** without the mark, carried on
the channel state as `liveTranscriptionPaidBy` so that a restart mid-sitting
does not move the bill to the house. Each stream records its payer when it
opens, because the switching-off that closes it has already cleared the state.
A poll every five seconds switches the text off once the payer's week — closed
sessions plus what is open now — is spent; Text already ends with the sitting,
so a free run never outlasts the one it began in. Switching off is open to
anybody who may change what the channel keeps, minutes or none.

**Not built:** *Record automatically*'s Text for free accounts. A sitting that
begins with the text on was begun by nobody, so there is nobody to bill; it
stays the house's, with its own wire flag `mayAutoTranscribe`. Nor a notice
when the minutes run out mid-sitting — the text stops, and the refusal on the
next attempt says why and when they come back.

**What old builds see.** The refusal sentences are the server's and are right
everywhere on deploy. The confirmation before a batch request is the app's: a
build from before this reads `spendsFreeUse` alone and still says "your one
free transcript", which overstates the stakes rather than understating them;
`freeMinutes` is what a new build quotes. An old build also offers *Record
automatically*'s Text to anybody with `mayTranscribeLive`, and the server
answers it with the 404 it always gave an account without the mark.
