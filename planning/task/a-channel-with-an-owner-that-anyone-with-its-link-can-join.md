# A channel with an owner that anyone with its link can join

From the call with Erta, 2026-10-02, and Rodrigo said he would build it. Erta
wants to run a small community of her own — a product channel, *Cafe
Products*, for people she meets at events — and link to it from Substack. Today
nothing fits: a *guest link* dies with the room, an *invitation* names one
person, and a *public channel* is the podcast sense of public, where anybody
can hear the contents. This is the **other** kind of public, and needs its own
name: **contents private, door open**. Whoever has the link may become a member.

What was agreed on the call:

- **The link is a page, not an invitation.** A permanent URL built from a
  channel slug, describing the channel, with one big call to action that is in
  effect the invite. It does not expire with the room.
- **It has an owner.** Rodrigo bends the no-admin rule for this kind only: the
  owner may remove people and destroy the channel; every other member has every
  other privilege. Erta's would be hers because it is her project.
- **The six-member cap lifts once there is an owner**, to a hard ceiling of
  about twenty "so that it doesn't get crazy". Channels without an owner stay
  small, which is what lets them have no admin.
- **No approval step yet.** Let people in until it is a success; add approval
  later if it is. If a link gets out of hand, revoke it — a way to revoke and
  reissue is the one control it needs from day one — and let the shape of the
  abuse say which door to close.
- **A link is not spent by use.** Erta raised one-use links against
  forwarding; Rodrigo chose open at first.

Check against `backlog/a-standing-door-has-no-lock.md` and
`decision/2026-09-22-a-public-channel-is-findable-rather-than-unlisted.md`
before naming it, and GLOSSARY.md for the word — *public* is taken. Erta
plans to send her first invites early the week of 2026-10-05, so the invite
flow (`collapse-the-three-invitations-into-one.md`) wants to feel right first;
Rodrigo said so on the call.

---

## What the proposition says about it

Item 5 of planning/ROADMAP.md, *Open channels, and the knock that becomes a
request to speak*, carried here on 2026-10-03 when that file was broken up.
It predates this task's framing; where they disagree, this task's opening is
the later word.

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
