# The chime has no volume because of the path, probably

Two fixes shipped for a quiet chime on 2026-09-15 and neither changed anything.
This is the measurement that should have come first, and what it rules out.

**The renderer was compiled and run on its own**, outside the app, off the
phone: `renderChime`'s body lifted verbatim into a standalone binary. The file
is well formed, the lead-in is genuinely in it — 15876 frames, 7938 of silence
then two 3969-frame notes — and the peak sweep spans a real **15dB**, −15.7
dBFS at the shipping 0.18 rising to −0.8 dBFS at full scale.

**That measurement and the ear cannot both be about the same signal path.** The
samples differ by 15dB and a phone reports all five as much the same, and as
very quiet. So whatever is flattening them is downstream of everything this
repository renders, and no amplitude, envelope or lead-in can reach it. Both
earlier fixes were aimed upstream of the problem.

**`AudioServicesPlaySystemSound` takes a sound id and nothing else.** No gain
argument in the signature, and what it plays goes out the alert path — a level
this app does not set and cannot read, and which is not the volume slider a
person sees while an app is open. That is a fine bargain for a cue that only has
to be *noticed*, which is what `vibrate` needs, and it is the wrong one for a
cue that has to be *heard*.

**The alternative was ruled out on a premise that does not hold.** The comment
above `chime` said `AVAudioPlayer` configures `AVAudioSession` itself, which
would make it a fourth writer to the process-wide configuration
POSTMORTEM-echo.md is about — a serious objection, and true of `expo-audio`,
which does manage the session. It is not true of the bare player:
`AVAudioPlayer.h` carries no category and no activation API, reads
`channelAssignments` off the session and observes interruptions, and that is the
whole of its contact with it. It plays into the session this app already holds,
and it has `volume`, "nominal range … 0.0 to 1.0". The objection was carried
across from one class to the other without being checked, and it cost the one
path with a gain knob.

**So the lab gets a path chip, and it is the first row on the screen.** Two
taps, system against player, settle whether the quiet is the file or the
delivery. **This entry claims the measurement and not the conclusion** — what is
established is that the samples are correct and the alert path has no gain;
whether the media path is audibly louder on a phone is the thing being asked,
and it is asked on a phone because that is the only room this cue plays in.

**If player wins, the choice that follows is not about loudness.** A cue on the
media path is a cue that ducks or interrupts, and what a presence chime is
allowed to do to somebody's podcast is a different question from how loud it is.
That one is not settled here.

**The lead-in from this morning stays for now, at 180ms, unfalsified rather than
vindicated.** It changed nothing, which is weak evidence against it and no
evidence at all if the path was swallowing everything regardless. It is a dial
in the lab with zero on the row; when the path question is answered, that is
when it is worth asking again, and it comes out if it cannot earn its sixth of a
second.
