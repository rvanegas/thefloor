# The track is shareable, and Export becomes Share

2026-09-12. Two halves of one sentence: the thing everybody in a channel is
listening to can now be taken away, and the word for taking something away is
*share* everywhere rather than *export* on recordings and transcripts.

## What was built

**`GET /channels/:id/track`** hands a member the bytes of the channel's current
track, exactly as they were uploaded. Beside it, a `Share track` button on the
shared-audio card, and `shareTrack` in both `app/src/api/download.ts` and its
web twin.

**`Export` is gone from the interface.** The recordings list and the transcript
screen say `Share`; `exportRecording` and `exportTranscript` are
`shareRecording` and `shareTranscript`; `ExportButton` is `ShareButton`; the
privacy policy and the delete-channel warning say *share* where they said
*export*. The vocabulary is now one word for one act, and GLOSSARY.md § *Share*
is its entry.

## Why membership, and nothing else

Every other control on the shared-audio card is governed by the floor and by
presence, because every other control changes what the room hears. Sharing does
not. It is a read — the same argument `RecordingRow`'s `manageable` already
makes about why exporting a recording is not refused to somebody standing
outside a conversation in progress — so the rule that decides *who may change
what plays* has no business deciding who may keep a copy.

So `trackFileFor` asks `isParticipant` and nothing more. Somebody who has
stepped out may still take the file; somebody who was never in the channel gets
404, the same answer as a channel that does not exist and as one with nothing
loaded. Which channels exist, and whether one of them has something on, are
both things only its members should learn.

## The type and the name come back from the server

A recording is a mix this server made, in a format it chose, so
`RECORDING_CONTENT_TYPE` is a constant and the client names the file itself.
**A track is somebody else's file**, and the client that asks for it knows
neither its format nor its extension — `PlaybackTrack.title` has the extension
stripped, deliberately, because it is a title on a screen.

So the route types the response from the file's own extension
(`TRACK_CONTENT_TYPES`, short and audio-only, with `application/octet-stream`
for anything else — a file that saves and does not play, rather than a guess
that plays wrongly) and names it in `content-disposition`. The native client
downloads to a scratch name and renames once the headers are readable, which is
the whole reason that path is shaped differently from the other two. `.mp3` is
the fallback when the header says nothing useful: a file with no extension is
offered to no application at all on iOS, and the picker overwhelmingly yields
mp3.

## What was not renamed

**The wire.** `GET /recordings/:id/export` and
`GET /recordings/:id/transcript/export` keep their paths. A route name is not a
word anybody reads, and renaming one is owed the two-step every wire change is
owed — alias, deploy, ship the client, remove the alias a release later — for
no gain. The new route is additive, so it needs no shim; it does need the
server deployed before a build carrying `Share track` reaches a phone, which is
the ordinary order.

**`findButton` in the test harness**, which matches labels by substring. It
could not tell `Share` from `Share a guest link` or `Share track`, so two
assertions about a closed recording row silently passed against a control at
the other end of the screen. `findExactButton` sits beside it for the cases
where the substring catches somebody else.
