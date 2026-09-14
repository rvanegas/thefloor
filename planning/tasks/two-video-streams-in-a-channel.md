# Two Video Streams In A Channel

A channel that can carry video, capped at **two publishers at once** — not six,
and not a per-person toggle that six people can happen to turn on. The cap is
the feature, and the number two is chosen rather than incidental: see below.

**Start by reading `decisions/` § *The Floor carries no video*.**
That decision is deliberate and load-bearing, and AGENTS.md singles it out as
the one people misread. This entry is not a claim it was wrong; it is a request
to price what changing it would cost and to say plainly which parts of it still
hold. A watch party in particular must go on carrying no video — it shares a
position and a clock, and nothing here should turn that into a frame this app
decodes.

**Why two, which is the whole design.** The SFU forwards video without decoding
it, so the cost is fan-out: n publishers in a channel of six subscribers is
6(n−1) downstream streams. One publisher is 5, two is 10, six is 30. Two also
happens to be the shape of the thing people would actually want — showing
somebody something, or two people talking face to face while the other four
listen — so the cap is not merely a budget, and should not be presented as one.

**The constraint that decides it is transfer, not CPU.** MIGRATION.md says
bandwidth "is not the constraint and is unlikely to become one", and that
sentence is about Opus. It stops being true here. The box's 3 TB/month is some
27,000 channel-hours of audio; at 360p two-publisher video it is on the order
of a thousand, and 720p roughly a third of that. Those figures are arithmetic
from the audio profile and have never been measured — **measuring them is part
of this task**, with LiveKit's load tester and `livekit-server` CPU rather than
memory, since every Lightsail bundle up to $44 has the same 2 vCPU and memory
is the one thing a bigger box would buy.

**Recording is the part that does not fit and should probably be refused.**
`track_cpu_cost: 0.15` in `/etc/livekit/egress.yaml` was tuned so six audio
stems fit in 2 vCPU. A composited video job is roughly a core. Two video
publishers plus six audio stems does not fit, and the failure mode is egress
declining a job rather than anything saying why. The likely answer is that a
channel carrying video refuses to record, the way a watch party already does —
which is a rule `core/` can state, not a server-side apology.

Open questions this needs answers to before anything is built:

- **What the floor means when there is video.** Claiming the floor withholds
  every other microphone. Does it withhold cameras? STATES.md is where the
  answer has to live either way, and getting this wrong is how the app ends up
  with two states that disagree about who is visible.
- **What App Review is told.** The 1.3.1 notes say "this app never fetches,
  decodes, stores or shows a frame". That sentence becomes false, and the
  Guideline 1.2 argument — no discovery, nobody found — is not affected but the
  UGC picture is: video is content, and any member can already delete any
  recording. Whoever ships this writes the new paragraph.
- **Whether it is worth a second box first.** DECISIONS argues for a $7 media
  instance when a deploy audibly interrupts a call. Video is the thing most
  likely to make that true, and splitting first would make this measurable
  without putting live conversations behind the experiment.
