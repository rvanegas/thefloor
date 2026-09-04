# The roadmap the proposition obliges

**Standing for as long as PROPOSITION.md stands**, and derived from it on
2026-09-03 with LISTING.md and MANUAL.md. That file says a pitch which cannot
also be read as a roadmap is only a slogan, and its last third is direction
rather than description. **This is that third, lifted out and ordered** — the
work the argument commits the app to, with what each piece would have to
satisfy and how anybody would know it was done.

**It is not TASKS.md, and it does not outrank it.** TASKS.md is the roadmap:
everything known and wanted, features and audits and questions alike, and it is
where work is picked up from. This file is narrower and differently sourced —
only what the *proposition* obliges, which is a handful of things, ordered by
the argument rather than by cost or by when somebody thought of them. Items
here mostly have no TASKS entry yet; **the way this file gets used is by
opening one of these and writing the corresponding TASKS entry**, at which
point the entry is the request and this stays as the reasoning behind it. Where
an entry already exists it is named below.

**The ordering is the proposition's, not a schedule.** First the thing without
which the central loop does not close, then the cheapest correction to the
worst observed failure, then the question whose answer decides how much of the
rest is even shaped right. Growth and the panel shape come after, because both
are elaborations of a loop that has to work first.

---

## 1. Make the notification permission survivable

**Why it is first.** Because there is no ring and no call interface, every
synchrony this app establishes travels as an ordinary notification. An
invitation, a knock, a ping: all banners. **The app without the permission is
not a degraded version of itself — its central loop does not close**, and it
fails silently, which is worse. Somebody pings a contact, sees the ping
accepted, and waits for a person who will never learn they were wanted. That
gets attributed to the app.

And the permission is asked for in the worst climate imaginable. **Habitually
declining notifications from a newly installed, unfamiliar app is a rational
habit**, because that permission is routinely spent on manufactured engagement
— and the user who learned that lesson best is exactly the user this app is
for. So the ask has to be argued rather than raised.

**Three pieces, none of them large.**

**a. The request carries the argument, not the platform's bare prompt.** A
pre-prompt ahead of the system dialog, saying what the permission will *not* be
used for, in the three claims the rest of the app already honours:
notifications here are sent by people rather than by the app; they never sound
unless the recipient asked that they sound; and there is no re-engagement
traffic of any kind. MANUAL.md § *Notifications, and why we are asking for the
permission* is the long form of this and is where the wording should be drawn
from.

**b. Pinging somebody whose notifications are off says so at the point of
pinging** — before the ping, not after it. This is the piece that converts a
silent failure into a visible one, and it is the highest-value third of the
three. It needs the server to know the state, which is a fact about
`device_tokens` rather than about the app; BACKLOG.md § *Sessions cannot be
listed, only ended wholesale* is adjacent, noting that a session and a
notification permission are separately recorded and can disagree. **Establish
what the server can actually tell** — a device with no token, a token that has
gone stale, and a permission explicitly refused are not the same state, and
saying "their notifications are off" about the wrong one is a new silent
failure rather than a fix for the old one.

**c. A profile shows the standing state.** On somebody else's: this person is
not receiving notifications. On your own: that you are not, with the
consequence spelled out rather than named — not a settings row that says *off*,
but a sentence saying what will happen to you because of it.

**Done looks like:** a person who declines can find out that they declined
without being told by a friend, and a person who pings somebody unreachable
learns it before waiting rather than after.

**Adjacent, and not this:** BACKLOG.md § *Notifications do not ring — they are
alerts* catalogues the larger delivery machinery — PushKit, CallKit, Time
Sensitive. **Most of that list is off-thesis and should stay unbuilt.** Time
Sensitive in particular is precisely the escalation the proposition forbids a
sender to claim, and its presence in a backlog as "smaller things left on the
table" is the pressure this document exists to resist. See § *What decides
anything not on this list*, first constraint.

## 2. Teach the habit at the empty channel

**The failure is observed and is not a bug in anything.** Somebody steps into
an empty channel, pings, and then puts the phone away as though a call were
coming — out of reach, unattended, in the posture that is safe only when what
is coming is an alarm that will find you anywhere. Nothing is coming that
loudly. The answer arrives as a banner, and a banner does not fetch somebody
who has stopped being reachable.

**Stepping into an empty channel is the moment to say this, and the moment the
app currently says nothing.** Instructional copy there is the cheapest
available correction to a habit imported whole from telephony, and it has three
things to say:

- What comes back is a notification rather than a ring.
- **Leaving the app is fine**; going out of earshot of a banner is not. The
  distinction matters and is easy to get backwards — demanding attention on the
  screen would be the ring's error one step further along, and copy that reads
  as *stay in the app* would have shipped exactly that.
- **Nothing here is going to interrupt what you were already doing.** Walking
  into an empty channel does not seize the device — whatever was playing keeps
  playing, since the app takes the audio only when somebody is actually there
  to be heard. This is the app's strangest virtue and nobody discovers it by
  accident, because no telephone call has ever offered it.

**The vocabulary already exists.** The roster's *nearby* is the state this copy
is asking a person to stay in, and it is named that way precisely so whoever is
still in the channel knows to ping rather than give up. See GLOSSARY.md §
*Nearby / Stepped out*.

**Done looks like:** the empty-channel state is instructional rather than
blank, and MANUAL.md's four-line summary stops being the only place the habit
is taught.

## 3. Settle whether ping is enough on its own

**This is a question, and it is decidable rather than a matter of taste.** It
is third because its answer changes the shape of everything after it.

The app's answer to the empty room is presence, recency of presence, and the
ping, **combined with text messaging in whatever thread the group already
uses** — the thread decides *when*, the app supplies *where*. That is a better
division of labour than building chat, which would put this app against the
messengers on their own ground and off its own thesis.

**But it leaves the core initiation loop routed through software this project
does not own, and the ritual two apps wide.** Ping already exists as the in-app
primitive. **Whether presence plus recency plus ping is enough without the
thread — and if not, what ping is missing — determines how much affordance ping
deserves**, and therefore how much of item 1b and item 2 are pointed at the
right thing.

**How it gets answered:** by observation, not by argument. The meter question
is adjacent — BACKLOG.md § *The meter records microphones, and nobody can count
turns* says the current instrumentation records microphones and cannot count
conversational turns, which means it also cannot presently tell whether a ping
produced an arrival. **The measurable form of this question is: what fraction
of pings are followed by the pinged person stepping in, and within how long.**
A ping that reliably produces an arrival is enough on its own; one that does
not is a notification people are ignoring, and the fix is upstream of any
interface change.

**Do not answer it by building chat.** See § *What decides anything not on this
list*, fourth constraint. If the answer is that ping is insufficient, the
options are to make ping carry more — a reason, a time, a thing to answer — not
to grow a thread inside the app.

## 4. A link that belongs to a person

**The growth item, and the topology decides it.** Value accrues per group
rather than per install: a single user of this app has nothing, since the
proposition requires three to five *specific* people they already know.
Cost-per-install buys individuals with nobody to talk to, and nearly all of
that spend evaporates. **One whole book club, band or family is worth more than
fifty scattered downloads.**

**The viral primitive is already a link and it is a good one.** A guest link
survives being pasted into the thread where the coordination is happening,
costs the recipient no install and no account, and drops them into a
conversation with people they know — **it delivers the experience before the
signup**, which almost nothing in this category manages.

**Its limit is that it dies with the room.** It is live only while people are
actually there, which is a good security property and a real constraint on
spread: the link cannot be seeded in advance, so it converts in the moment or
not at all. Which leaves the ordinary case unserved — **wanting to bring one
specific person onto the app when there is nothing happening right now.**

**So: a second kind of link, belonging to a person rather than to a room.**
Shared from your own profile, durable, and pointing at a sign-in page of this
app's own making rather than at a store page. It carries copy saying what the
app is; it creates an account for whoever follows it; and — the part that makes
it worth having — **it implicitly accepts a contact request to whoever shared
it**, so the new account is not alone the moment it exists. **Installing the
app is the step after that, rather than the price of admission.**

**What it has to satisfy.** It is the guest link's virtue made independent of
anybody currently being in a room, so it inherits the guest link's constraints
rather than relaxing them: it is still not a directory, it still cannot be used
to reach somebody who has not shared it, and the contact it creates is still
mutual — the sharer consented by sharing. **A link that could be forwarded to
produce a contact with somebody who never shared it is a directory with extra
steps**, and that is the third constraint failing.

**Adjacent:** BACKLOG.md § *Inviting a stranger now sends mail, and nothing
bounds how much* is the same surface and its unbounded half; whatever bounds
that needs, this needs too, and probably first.

## 5. Open channels, and the knock that becomes a request to speak

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
whoever is hosting.** Two is chosen for the reason six is: it is the number
past which a panel stops being a conversation.

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
That is the same gap item 4 is about, and the two should be decided together.

## 6. Say the same thing everywhere

**Not direction from the proposition but a defect the derivation found**, and
the cheapest item here. Two shipped surfaces describe the app as *one person
speaks at a time*, and one of them says it twice:

- `server/src/support.ts` — "one person speaks at a time, by taking the floor"
- `server/src/landing.ts` — the same sentence in the body, and again compressed
  into the standfirst as "Talking with people you know, one at a time"

**The proposition says in terms that this is wrong**: conversation is open by
default, and the floor is a claim somebody makes when they need to finish a
thought. *"One person speaks at a time" as the standing rule describes a
different app, and a description saying it would be wrong.* DESCRIPTION.md
flagged the same sentence as a thing the listing must avoid; the listing avoids
it and these two do not.

**And nothing outside the listing says that nothing rings** — the claim that
separates this app from every other voice app, and the one a person cannot
discover from screenshots. The landing page is where it matters most, since it
is the other thing a stranger reads; `server/src/privacy.ts` shares only the
harmless opening sentence and needs no correction, though it is the third place
the app introduces itself and says nothing about ringing either.

**Done looks like:** one sentence, true, in all four places — listing, landing,
support, privacy — with LISTING.md's first line as the source. This is copy in
`server/src/`, it ships with a deploy rather than a review, and it does not
need to wait for anything above it.

---

## What decides anything not on this list

The proposition's constraints, which are review criteria rather than
aspirations: **anything violating one of these is off the thesis regardless of
how well it tests.** They are reproduced here because a roadmap read without
them is a list of things to build, and half the value of the argument is in
what it refuses.

- **No alarm that a sender can choose.** Loudness is granted by recipients, to
  named people, scarcely. **This is the one that will be under pressure**, and
  it already is — see the Time Sensitive entitlement sitting in BACKLOG.md as a
  small thing left on the table. If The Floor ever gains an alarm it has to
  arrive as a permission a recipient grants a specific person, never a mode a
  caller selects, and it has to be scarce by construction rather than by
  etiquette. The moment an alarm is an ordinary option, the expectation of
  answering returns with it — **and the expectation is the product.**
- **No re-engagement notification, ever.** Not a streak, not a digest, not a
  reminder that a channel misses you. The permission is spent only on people.
  Note that item 1 spends the permission's credibility on this promise;
  breaking it later costs more than it would have cost to break it first.
- **No strangers, and no directory.** Reach is by mutual invitation, and growth
  that requires relaxing this is growth that dismantles the product. Item 4 is
  the one most likely to be built in a way that quietly fails this.
- **Not chat.** Text lives in the threads people already have; the app supplies
  the room. Building a messenger puts this app on the messengers' ground and
  off its own argument. Item 3 is the question that will keep proposing it.
- **No administration inside a channel.** Six peers and a door. **Every problem
  that looks like it wants a moderator should first be tried as a boundary** —
  the floor itself is that principle already applied once, to overtalking.

## What is not here, and why

**Everything in TASKS.md and BACKLOG.md that the proposition is silent about**,
which is most of both files and includes nearly all of the engineering:
Android, the audio-session investigations, the recording and transcript
surface, payments, the watch party. Silence is not disapproval. **The
proposition is an argument about what the app is for, and a great deal of
necessary work is neither required nor forbidden by it** — that work is
prioritised on its own terms, in the files that exist for it.

**And one thing is missing on purpose.** There is no item here for growth
spending, because the topology already answered it: density beats count, the
listing is not the top of the funnel, and the guest page is. Item 4 is the
whole of the growth roadmap the proposition licenses.
