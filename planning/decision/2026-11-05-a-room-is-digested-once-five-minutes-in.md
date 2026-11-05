# A room is digested once, five minutes in

Rodrigo's ask, 2026-11-05: if a room has been transcribing for five minutes
from its beginning, the channel's members who are not present are sent a
notification carrying an AI-written digest of the conversation so far, based
on the transcript — once per room. Built the same day as `server/src/digest.ts`.

**"Its beginning" is the room's first transcribed line**, Rodrigo's
correction the same day: the earliest moment in the room after which the
*live transcript* recorded something said — that line's `start_at` — with no
limit on how long after the room opened, and no minimum of people present.
The first build had read it as the transcript listening within ten seconds
of the room opening, which passed over a room whose text was switched on a
minute in; that limit is gone.

**And the transcript must have continued the full five minutes**, his second
condition: paused, switched off or emptied out after the first line, and the
room is passed over rather than waited on. A stop before anything was said
does not count, since nothing had begun. The first line is found on the tick,
after its turn is written, so a stop is remembered by time and judged
against the line's `start_at` once it is known — a stop between a turn
beginning and its being written still counts. A room resumed inside
`ROOM_DEPARTURE_MS` is the same room, so it is not digested twice; a restart
ends the room and the transcript, so nothing is persisted.

What is read is every live line in the room. A room in which nothing was
transcribed asks nobody. The recipients are worked out when Claude answers,
not when it was asked, so somebody who stepped in meanwhile is not sent it:
members not `present`, which takes in the *nearby*. Guests have no phone to
send to.

**Sonnet 5.5 at low effort**, as the channel-digest task chose; at most fifty
words, plain text, in the language spoken, clipped at 600 characters whatever
comes back. Each request is a row in `claude_usage`, grade `digest`, with no
account: the house pays, as it does for the transcript it reads. Without
`ANTHROPIC_API_KEY` nothing is attached.

**A fifth notification kind, `digest`,** because the existing four each fail
it somewhere. On `arrived`'s collapse key the next arrival would replace a
paragraph about the conversation with a line about who walked in, and the
app's sweeps — every arrival on foreground, a channel's on opening it — would
clear the only copy of words nobody had read. So it has its own key,
`${channelId}:digest`, reaches an open app as a ping does (nothing in the app
shows it), is swept by neither, and lasts an hour. At every level it lands as
an arrival does, and it is not subject to the arrivals' pause. Older builds
read `kind` loosely and treat it as a kind they do not sweep, so no shim.

**The privacy page said Claude "never speaks on its own"**, which this makes
false wherever a live transcript can run; a paragraph inside Claude's section
now names the exception, with its own date.

**Not decided here, left open:** whether a member can switch digests off per
channel beyond the notification level; whether the digest is kept and shown
in the *Record*, which is the per-call digest of
`task/a-digest-of-each-call-and-of-the-channel.md`; and the consent question
both that task and `task/catch-up-when-stepping-into-a-conversation-under-way.md`
raise, of reading what was said before you were there — answered here, for
members, by the ask itself.
