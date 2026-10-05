# Open channels, and the knock that becomes a request to speak

Item 5 of planning/PROPOSITION.md's roadmap, carried out of
`a-channel-with-an-owner-that-anyone-with-its-link-can-join.md` when that task
shipped as the *community* on 2026-10-04 — see
`decision/2026-10-04-a-community-is-a-channel-with-an-owner.md`. The community
answered a different ask: its door makes **members**, and this one is about
**listeners**, so none of what follows was built. *Open channel* stays this
item's word, and a community is not one: keep the two apart in GLOSSARY.md
when this is built.

**What the guest tier already produces is the panel shape**: six who can hold
the floor, plus an audience with revocable microphones. And the elegance worth
protecting is that **the six are the moderators, structurally, without anybody
being an administrator** — a guest is refused by every rule written in terms of
membership without anybody having to say so, and may be granted a microphone
while still being unable to claim the floor, because a claim is not permission
to speak but a demand that everybody else be silent, and a stranger does not
get to mute the people who let them in.

**The thing that breaks at audience scale is the door.** The knock is the right
gate for a private conversation and the wrong one for a talk with an audience,
where a member ends up answering the door all evening instead of speaking.

**So: members may declare a channel open.** In an open channel anybody holding
the guest link listens without being admitted, and **the knock changes its
meaning — it is no longer a request to enter but a request to speak**, which is
the scarce thing. That request is available only while fewer than two guests
hold microphones, **so the ceiling is enforced by the door rather than by
whoever is hosting.** Two is chosen for the reason six is: it is the number past which a
panel stops being a conversation.

**The two-guest ceiling shipped on 2026-09-21, ahead of the open channel it was
written for**, along with a cap of forty guests. What is built enforces it at
the guest's *ask* — `canRequestSpeech` — which is this paragraph's own
reasoning applied to the door that exists today. So what remains unbuilt here
is the open channel and the knock changing meaning, not the number. See
`decision/2026-09-21-asking-somebody-in-as-a-guest.md`.

**What to watch.** The floor was designed to arbitrate among peers with
symmetric rights, and an audience is asymmetric by construction. The knock and
the admission are the only things standing where administration would otherwise
go, so **every problem this raises that looks like it wants a moderator should
first be tried as a boundary** — that is the fifth constraint, and this item is
where it will be tested hardest.

**Also unresolved, and worth naming before building:** a guest link currently
stops working once the channel is empty of members. An open channel is still a
channel and inherits that, which is right — but it means an announced talk
cannot have its link circulated in advance any more than a private one can.
That was the gap ROADMAP.md's item 4 was about, since answered by the invite link.
