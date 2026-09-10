*Rodrigo's model for presence. What is built and what is not, as of
2026-09-09 — see `decisions/2026-09-09-attention-is-one-clock.md`.*

**Built:** the attention clock and everything that reads it — any activity in
the app refreshes it, talking never does, one clock per person per channel held
by the server and pushed to every client, and the roster showing it for both
absent states. A device attends what is on its screen and what it is standing
in, so reading Home holds the conversation you are in and nothing else. The *subscribeable* guard is built and is what keeps a silent listener
present.

**Not built:** the *stand by* verb, the state names below (the code still says
present / nearby / stepped out, and the footer says In / Nearby / Out), the two
nearby substates as anything a screen acts on, and `nearby auto` + foregrounding
→ present. That last one wants an argument first: it is the same transition the
ghost-presence bug was, and "opening The Floor" onto Home would re-enter a
channel nobody is looking at. Backgrounding does not end presence in any case —
a capturing process survives, which is why returning finds you still present.

---


Attentive: Any touch interaction with The Floor, such as tapping or scrolling.
Subscribeable: Is there anything to subscribe to, such as another member or the media player.

The attention threshhold is 15m. Inattentive no attention for 15m.

Verbs: step in, step out, stand by
States: present, absent, nearby
Roster display: _none_, away <time>, nearby <time>

Roster may also say "Invited".

Time displayed is attention clock. Same for both "away" and "nearby".

present: in room
absent or nearby: not in room

present + inattentive + nothing subscribeable: transitions to away
nearby + inattentive: transitions to away

nearby has two substates

force quit or another app claims audio: transitions to nearby auto
tapping nearby action: transitions to nearby manual

opening or foregrounding The Floor when nearby auto: transitions to present
