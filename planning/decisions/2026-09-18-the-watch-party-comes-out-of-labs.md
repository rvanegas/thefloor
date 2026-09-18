# The watch party comes out of Labs — 2026-09-18

It went behind Labs on 2026-09-06 as one of the two things that setting hid,
and it comes out today. Transcripts stay: they spend money at AssemblyAI per
use, which is the reason that half of the gate was built and is unchanged. A
party is a link each device plays — nothing is fetched, stored or recorded
here, and nothing about it costs anybody anything.

**A feature nobody can reach is not being tested by anybody**, which is the
whole argument. Labs is a promise that what appears is unfinished but real, and
the watch party stopped being unfinished over the fortnight after it shipped:
the screen switch, the film's own bar as the only transport, the mode that
refuses recording while a film is loaded. What was left of the gate was a
switch two taps away that everybody had to find before the feature existed for
them.

### What it took out

- **The server's refusal.** `START_WATCH` no longer reads the account's
  settings in `Channels.dispatch`; the YouTube-link parse beside it stays,
  since that was never about Labs. `STOP_WATCH` and the transport actions were
  never gated and are untouched.
- **The conditional tab, and the fallback under it.** `ChannelView` built its
  tab list on `app.labs || party` and then corrected the chosen tab when the
  list lost one — a tab bar that gains and loses entries is the footer's
  finger-under-the-thumb problem one control up, and the only reason to
  tolerate it was withholding an experiment. Six fixed tabs now, and `shown`
  went with the gate: every value the state can hold is on the bar.
- **`|| party`, which was the interesting half.** A party is channel state and
  arrives on every snapshot whether the reader asked for the feature or not, so
  somebody without Labs sitting in a channel where one was running still got
  the card, the transport and Stop — otherwise they had a player being driven
  by something they could not reach. That exception is now the ordinary case,
  which is the tidiest way for it to end.

### The submission notes, which is the half that gets forgotten

Nothing in the code points at `planning/submissions/`, and two passages there
stopped being true the moment this landed. Section 3 told a reviewer to turn
Labs on to reach the Watch tab, which is now an instruction to a setting that
does not gate it; the tab is listed with the other five instead. Section 6
opened *"A watch party is behind Labs and carries no video of ours"* and then
made the whole argument — nothing fetched, decoded, stored or republished,
YouTube's own player embedded unmodified — about a feature that was off by
default. **The argument stands on its own merits and now has to**, so the
clause naming Labs is gone and the rest is unchanged. Every submission since
1.2.0 was approved with that clause in it, which makes this a rewrite rather
than a new claim, but it is a claim to Apple about a default-on feature.

The file is 1.5.2's, still the latest in the tree, and was already about 170
characters over the 4,000 `bin/set-review-notes` enforces; this edit leaves it
28 shorter than it found it rather than adding to that.

1.5.0's store screenshots already show the Watch tab — Labs was on when they
were taken — so this release makes them accurate rather than needing them
reshot.

### What it leaves

Labs hides one thing, and the settings card says so rather than naming two.
`labs` itself is unchanged in shape: still an account setting, still off by
default, still enforced at both ends for transcripts — the app draws nothing
when the `transcript` field is absent and the server withholds that field per
reader, which needed no client change on the way in and needs none on the way
out.

**Labs now gates Transcribe alone, which may not be worth a setting**, and that
question is left open here rather than answered: one switch for a list that was
always going to change was the argument for the shape, and a list of one is the
moment to ask, not the moment to act.
