# What The Floor is for

**Standing statement of the value proposition**, not deferred work — though its
last third is direction rather than description, and says so where it turns.
One argument told twice: what the app claims, and what the claim obliges it to
build next. Nothing here is a feature list, and a pitch that cannot also be
read as a roadmap is not a proposition, only a slogan. DESCRIPTION.md is its
sibling and holds the copy; this file holds the argument the copy is drawn
from.

## The thesis, in one sentence

**Telephony took an affordance built for the rare case and applied it to all
traffic.** The ring is an alarm — a demand for attention in the next four
seconds — and it is the default for every call regardless of what the call is
about. The right way to initiate voice should resemble entering a room and
addressing who is there, not sounding an alarm.

Everything below is either evidence for that or a consequence of it.

## The evidence, which is mostly the telephone's own history

**The phone has spent a century building defenses against itself.** The busy
signal, call waiting, the hardware ring/silent switch, Do Not Disturb, Focus
modes — and, above all of those, the escalations a sender can claim in order to
pierce them. Those are not six inventions. They are six patches on one category
error, and the fact that the mute switch earned dedicated hardware on a device
with four buttons says how large the error is.

**The verdict is already in, and it is that the ring is switched off.** Silent
with vibration is the standing posture of a great many people — and not because
vibration is a preferred summons but because it is the only other option
offered. A feature most of its users disable is not a feature they tolerate. It
is one they have already rejected and lacked a way to say so.

**Texting won on intrusiveness, not on convenience.** This is the load-bearing
claim, because it is the one that says the market has already voted. Text
became the primary channel in large part because it does not seize the
recipient. We do not ring somebody to have them read an email. We do not
interrupt a dinner or a meeting to deliver something that could wait.

**Business already migrated and consumer telephony did not.** A meeting is a
video call now, invited by email or by a thread, joined at a time. Voice there
is initiated asynchronously and attended synchronously — which is exactly the
split this app is making — and nobody thinks of it as exotic. It simply never
reached the phone call between friends.

**And the metaphor is what held it back.** Telephony stayed committed to
dialpads and handsets, and the piece of the skeuomorph that actually persists
is not the handset but the summons: the assumption that initiating voice means
compelling immediate attention.

## What the ring actually buys, which is not voice

The ring does not buy voice. **It buys synchrony** — and texting proved the two
were separable. Delivery does not require the recipient's *now*; most
conversation does not either.

Which names the missing thing precisely. **Voice has no "later."** Answer or
decline, green or red, a binary with no third option. Every text message has a
waiting state built into it and no telephone call ever has. The Floor's move,
stated at its narrowest, is to give voice a waiting state.

## Non-interruption is one principle at three scales

The app is usually described as doing three things — you can claim the floor,
nothing rings, and there are no strangers. They read as three features and they
are not. They are **consent at three scales**: who may reach you at all, how
loudly they may, and who may speak right now. Telephony left all three
undefended — anyone with the number can make your pocket ring, and inside the
call whoever is loudest wins the conversation.

1. **Who may reach you.** Contact is mutual and by invitation. No directory, no
   search for strangers, no way to be added to anything without saying yes.
2. **How loudly.** An invitation is an ordinary banner. The app does not
   present itself to the operating system as a telephone call, and it never
   claims the escalations that pierce a Focus mode or the silent switch.
3. **Who speaks.** Conversation is open by default; the floor is a claim
   somebody makes when they need to finish a thought, and it is enforced on the
   audio itself rather than asked of people politely. **Note what this is not**
   — "one person speaks at a time" as the standing rule describes a different
   app, and a description saying it would be wrong.

The floor's motivation is the ring's, one level in: the overtalking that
degrades a debate is intrusion, and the fix is a boundary rather than a
moderator.

## Loudness is the recipient's property

This is the principle that keeps the proposition from being undone later, and
it is structural rather than a matter of restraint: **a sender cannot declare
urgency here.** Whether an arrival makes a sound is a property of the person
receiving it, so one and the same event is audible to somebody who asked to
hear everything and passive to somebody who did not.

That matters because every urgent flag in the history of messaging has been
overclaimed by senders until it meant nothing. **If The Floor ever gains an
alarm, it has to arrive as a permission a recipient grants a specific person,
never a mode a caller selects** — and it has to be scarce by construction
rather than by etiquette, because the moment an alarm is an ordinary option the
expectation of answering returns with it, and the expectation is the product.

*Should one not be able to sound the alarm in an emergency?* **Emergencies are
rare and normal usage should not be patterned after them** — which is,
precisely, the error being diagnosed. The dialer is still installed; this app
takes the other ninety-five percent. Should The Floor ever need to cover that
case itself, the constraint above is what it has to satisfy.

## Notifications carry the proposition, so the permission is earned

Here is the cost of refusing the alarm. Because there is no ring and no call
interface, **every synchrony this app establishes travels as an ordinary
notification.** An invitation, a knock, a ping: all of them are banners, and a
banner that was never delivered is an invitation nobody declined. The app is
not merely less convenient without the permission — its central loop does not
close.

And the permission is asked for at the worst possible moment in the worst
possible climate. **Habitually declining notifications from a newly installed,
unfamiliar app is a rational habit**, because the permission is routinely spent
on manufactured engagement. A user who has learned that lesson well is exactly
the user this app is for.

So the ask has to be argued rather than raised, and the argument is not "we
need this" but what the permission will *not* be used for. Three things,
concretely, and each is a promise the rest of this document already commits to:
notifications here are sent by people rather than by the app; they never sound
unless the recipient asked that they sound; and there is no re-engagement
traffic of any kind, because an app whose thesis is non-interruption cannot
send a notification to remind you it exists.

**The other side of it is that a decline is invisible to everybody else.**
Somebody pings a contact, sees the ping accepted, and waits for a person who
will never learn they were wanted. That is a silent failure, and it is
attributed to the app rather than to the setting.

*Direction.* Three pieces, none of them large. The permission request carries
copy that makes the argument above rather than the platform's bare prompt.
Pinging somebody whose notifications are off says so at the point of pinging,
before the ping rather than after it. And a profile shows the standing state:
this person is not receiving notifications, and — on your own profile — that
you are not, with the consequence spelled out.

## The empty room, which is the real objection

A message survives the recipient's absence. **A room does not.** Asynchrony's
gift is that a text waits, and a channel with nobody in it is silence — so the
room metaphor inherits a cold-start problem the text thread does not have. The
large chat servers escape it through sheer population; The Floor caps a channel
at six and gates it on mutual contact, deliberately.

**The answer is presence, recency of presence, and the ping.** There is always
notification of presence and a record of when somebody was last there: the
channel list says who is in which room now, and under each channel, when
somebody other than you was last in it. The roster distinguishes
present-and-quiet from gone. A ping is a notification asking a specific person
to come, authorized by contact and rate-limited so it cannot become a drumbeat.
Combined with text messaging in whatever thread the group already uses,
synchrony is established: **the thread decides *when*, and the app supplies
*where*.**

That is a better division of labour than building chat, which would put this
app against the messengers on their ground and off its own thesis. It has one
cost worth stating: the cold-start moment then lives inside an app nobody here
owns.

**It also leaves a question the app has to answer for itself.** If synchrony is
established by a text message sent elsewhere, the core initiation loop routes
through software this project does not own and the ritual is two apps wide.
Ping already exists as the in-app primitive. Whether presence plus recency plus
ping is enough without the thread — and if not, what ping is missing — is
decidable rather than a matter of taste, and the answer determines how much
affordance ping deserves.

### The habit the app has to teach

There is an observed failure that is not a bug in anything. Somebody steps into
an empty channel, pings, and **immediately backgrounds the app** — then waits,
with the familiar low-grade alarm of somebody expecting a call. It works, in
that a notification will come back. But it reproduces the exact posture the app
exists to dissolve, and it is fragile in the way waiting for a call is fragile.

The pattern the app wants is the opposite, and takes one sentence to say: **you
stepped in, so stay in.** The person you pinged does not call you back; they
walk in and you are already there. Whoever arrives first waits, and waiting is
cheap here precisely because nothing is ringing.

*Direction.* Stepping into an empty channel is the moment to say it, and the
moment the app currently says nothing. Instructional copy there — what happens
next, and that the way to be found is to remain — is the cheapest available
correction to the habit users import from telephony.

## Six, and what the guest tier is

**Six is a moderation argument, not a capacity one.** Beyond about that, absent
a moderator, voices collide and the conversation degrades — and these channels
have no administration by design.

Guests are a lesser membership that can accommodate an arbitrary number of
listeners, and what they produce is **the panel shape**: six who can hold the
floor, plus an audience with revocable microphones. A guest is not a
participant, so every rule written in terms of membership refuses them without
having to be told to. A guest may be granted a microphone and still cannot
claim the floor, because a claim is not permission to speak but a demand that
everybody else be silent, and a stranger does not get to mute the people who
let them in.

**So the six are the moderators, structurally, without anybody being an
administrator.** That is the elegant part, and it is worth protecting. The
thing to watch is that the floor was designed to arbitrate among peers with
symmetric rights, and an audience is asymmetric by construction; the knock and
the admission are the only things standing where administration would otherwise
go.

*Direction.* The knock is the right gate for a private conversation and the
wrong one for a talk with an audience, where a member ends up answering the
door all evening instead of speaking. So: **members may declare a channel
open.** In an open channel anybody holding the guest link listens without being
admitted, and the knock changes its meaning — it is no longer a request to
enter but a **request to speak**, which is the scarce thing. That request is
available only while fewer than two guests hold microphones, so the ceiling is
enforced by the door rather than by whoever is hosting. Two is chosen for the
reason six is: it is the number past which a panel stops being a conversation.

## Growth, where the choice is narrower than it looks

Virality from an initial core, or copy and paid acquisition as the seed? **The
topology decides it.**

**Value accrues per group, not per install.** A single user of this app has
nothing — the proposition requires three to five *specific* people they already
know. So cost-per-install buys individuals with nobody to talk to, and nearly
all of the spend evaporates. One whole book club, band or family is worth more
than fifty scattered downloads. Density beats count.

**The viral primitive is a link, and it is better than most.** A guest link is
a URL that survives being pasted into the thread where the coordination is
already happening, costs the recipient no install and no account, and drops
them into a conversation with people they know. It **delivers the experience
before the signup**, which almost nothing in this category manages, and the
contact request can be answered from that same page.

**The reframe: the listing is not the top of the funnel, the guest page is.**
A stranger reading a listing has to be persuaded; somebody opening a guest link
is already hearing their friends. Copy is not thereby wasted — but its job is
to be *repeatable by a recommender* rather than persuasive to cold traffic.
"It's a group chat but voice, and it never rings you."

**The limit is that a guest link dies with the room.** It is live only while
people are actually there — a good security property, and a real constraint on
spread, because it means the link cannot be seeded in advance. It converts in
the moment or not at all. Which leaves the ordinary case unserved: wanting to
bring one specific person onto the app when there is nothing happening right
now.

*Direction.* **A second kind of link, belonging to a person rather than to a
room.** Shared from your own profile, durable, and pointing at a sign-in page
of this app's own making rather than at a store page: it carries copy saying
what the app is, creates an account for whoever follows it, and — the part that
makes it worth having — **implicitly accepts a contact request to whoever
shared it**, so the new account is not alone the moment it exists. Installing
the app is the step after that rather than the price of admission. It is the
guest link's virtue, that a real relationship is on the far side of it, made
independent of anybody currently being in a room.

## What this proposition forbids

Constraints, in the sense that anything violating one of these is off the
thesis regardless of how well it tests.

- **No alarm that a sender can choose.** Loudness is granted by recipients, to
  named people, scarcely. This is the one that will be under pressure.
- **No re-engagement notification, ever.** Not a streak, not a digest, not a
  reminder that a channel misses you. The permission is spent only on people.
- **No strangers, and no directory.** Reach is by mutual invitation, and growth
  that requires relaxing this is growth that dismantles the product.
- **Not chat.** Text lives in the threads people already have; the app supplies
  the room. Building a messenger puts this app on the messengers' ground and
  off its own argument.
- **No administration inside a channel.** Six peers and a door. Every problem
  that looks like it wants a moderator should first be tried as a boundary.
