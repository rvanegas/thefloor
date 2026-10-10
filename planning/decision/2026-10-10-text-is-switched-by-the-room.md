# Text is switched by the room

Rodrigo's rule for `task/record-and-player-controls-access.md`: **the Record
controls belong to the members in the room, and in a community to its owner
alone.** Audio and Pause already followed it, through `canStartRecording`,
`canStopRecording` and the pause guards, each of which asks for presence and
`holdsTheControls`. So did the player, through `mayPutSomethingOn`. **Text
did not.** Its route asked only for channel membership and the
`transcripts_unlimited` mark, so the house account could switch it from
outside the room, and inside a community it did not own.

**`canSetLiveTranscription` in core is now the rule.** It allows somebody
present who holds the controls. Switching Text off also carries Pause's
floor clause, since turning it off cuts off the record in the same way.
It is asked at the route rather than in the reducer, because
`SET_LIVE_TRANSCRIPTION` carries no user, which is how `canLoadTrack` works
too. The mark stays the route's: who pays is not the reducer's to know. The
route refuses with a 403 that says which rule applied. In the app, Text and
Start's half of it ask both.

**No shim.** The only client that could send the request is the house
account's, and an older build sending it from outside the room is refused
with a sentence, which is the intent.
