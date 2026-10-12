# The Record tab has a transport again

Rodrigo, 2026-10-11: **the logic was distributed between the controls in an
unnatural way.** The *Record* tab had one text button that read *Start*,
*Pause* or *Resume*, beside two switches that each started or stopped their
own form. He restored the transport — Play (or Resume), Pause and Stop, with
only icons — and gave the switches a narrower job.

**The switches select; the transport runs.** In his words, toggles imply
the transport's actions only in a limited way. If both are off, stop. If one
changes while started and at least one stays on, stop and restart — a new
segment. Unlike before, a switch turned on while stopped does not start
anything. So `ChannelState.keep` holds the selection, apart from
`recording` and `liveTranscription`, which say what runs; `keepingOf` reads
*stopped*, *running* or *paused* off those two. STATES.md has the pair.

**Three answers he gave, which decided the rest:**

- **A switch moved while paused changes only what Resume begins.** The
  alternative was to resume at once with the new selection.
- **Each sitting begins with *Record automatically*'s pair selected**, both
  off where neither is set, rather than keeping the last choice. So turning
  that setting on mid-sitting takes effect at the next one. Until now it
  started a run at once in a room that had not recorded.
- **Play with Text selected, by somebody with no minutes, is refused with a
  reason** rather than starting the audio alone, which would leave a switch
  on over a form that is not running.

**How it is built, in the parts not guessable from the code:**

- **Three actions.** `SET_KEEP` (the switches, both at once) and
  `PLAY_KEEPING` (Play or Resume) are route-only, `PUT /channels/:id/keep`
  and `POST /channels/:id/play`, because a text either begins needs a payer:
  the presser, or the house for an unlimited account. Selecting Text while
  nothing runs spends nothing and asks nobody. `STOP_KEEPING` goes over the
  socket. Pause is `PAUSE_RECORDING`, which since 2026-10-10 holds both.
  `PLAY` was taken by the shared track, hence `PLAY_KEEPING`.
- **Play is all or nothing** (`canPlay`): nothing selected, Audio selected
  while it cannot begin (a film loaded, every microphone shut), or Text not
  the room's to switch, and it is refused whole.
- **The play icon is *Start* to a screen reader**, not *Play*, which a
  recording's row and the shared track already say.
- **Older builds keep working**, and the selection follows what they do. A
  hand `START_RECORDING` selects Audio; `SET_LIVE_TRANSCRIPTION` sets Text;
  `STOP_RECORDING` while the text runs deselects Audio.
- **The automatic start reads the selection.** It begins only if Audio is
  still selected, and takes Text with it if Text is (`withText`), so
  automatic Audio and Text still begin together.

**Wire order.** The new app needs the two routes, so **the server deploys
first**. Old builds are untouched by it.
