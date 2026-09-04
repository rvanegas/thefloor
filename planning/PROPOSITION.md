# What The Floor is for

**Temporary, in the way an argument is temporary.** This is the value
proposition worked out in conversation on 2026-09-03, starting from
`TASKS.md` § *App Description* and UNINTERRUPTED.md. It is reasoning about
things that are mostly built and one or two that are not, and none of it has
been decided. When it is — when the listing carries this argument and the two
open questions at the end have answers — the durable half moves to
`decisions/DECISIONS.md` and this file goes. DESCRIPTION.md is its sibling and
holds the copy itself; this file holds why the copy says what it says.

Written from Rodrigo's own account of what motivated the app, so the first
person in the evidence below is his. What is attributed to the code has been
checked against the code and is cited.

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
modes, and — on this app's own reckoning — the two APNs interruption levels
above the default that exist to *pierce* those. Those are not six inventions.
They are six patches on one category error, and the fact that the mute switch
earned dedicated hardware on a device with four buttons says how large the
error is.

**The verdict is already in, and it is that the ring is switched off.** Silent
with vibration is the standing posture of a great many people, Rodrigo
included — and not because vibration is a preferred summons but because it is
the only other option offered. A feature most of its users disable is not a
feature they tolerate. It is one they have already rejected and lacked a way
to say so.

**Texting won on intrusiveness, not on convenience.** This is the load-bearing
claim, because it is the one that says the market has already voted. Text
became the primary channel in large part because it does not seize the
recipient. We do not ring somebody to have them read an email. We do not
interrupt a dinner or a meeting to deliver something that could wait.

**Business already migrated and consumer telephony did not.** A meeting is now
a Meet or a Zoom, invited by email or by a thread, joined at a time. Voice
there is initiated asynchronously and attended synchronously — which is
exactly the split this app is making — and nobody thinks of it as exotic. It
simply never reached the phone call between friends.

**And the metaphor is what held it back.** Telephony stayed committed to
dialpads and handsets, and the piece of the skeuomorph that actually persists
is not the handset but the summons: the assumption that initiating voice means
compelling immediate attention.

## What the ring actually buys, which is not voice

The ring does not buy voice. **It buys synchrony** — and texting proved the
two were separable. Delivery does not require the recipient's *now*; most
conversation does not either.

Which names the missing thing precisely. **Voice has no "later."** Answer or
decline, green or red, a binary with no third option. Every text message has a
waiting state built into it and no telephone call ever has. The Floor's move,
stated at its narrowest, is to give voice a waiting state.

## The three pillars are one principle at three scales

UNINTERRUPTED.md lists three ways the app supports non-interruption — claim
the floor, no alarm on calls, no trolls. They read as three features and they
are not. They are **consent at three scales**: who may reach you at all, how
loudly they may, and who may speak right now. Telephony left all three
undefended — anyone with the number can make your pocket ring, and inside the
call whoever is loudest wins the conversation.

1. **Who may reach you.** Contact is mutual and by invitation. No directory,
   no search for strangers, no way to be added to anything without saying yes.
2. **How loudly.** There is no CallKit and no VoIP push in this app at all. An
   invitation is an ordinary banner; `push.ts` omits `sound` unless the
   notification was meant to be audible, and deliberately never claims
   `time-sensitive` or `critical`, the two rungs that pierce a Focus mode and
   the ring switch.
3. **Who speaks.** Conversation is open by default; the floor is a claim
   somebody makes when they need to finish a thought, and it is enforced on
   the server against the tracks the room is actually carrying. **Note what
   this is not** — "one person speaks at a time" as the standing rule
   describes a different app, and a description saying it would be wrong.

The floor's motivation is the same as the ring's, one level in: the
overtalking that degrades a debate is intrusion, and the fix is a boundary
rather than a moderator.

## Loudness is the recipient's property, and the code already enforces it

This is the principle that keeps the pitch from being undone later, and it was
built before it was named. In `push.ts`, `alert` is an **argument to `send`
rather than a field on the message**, and the stated reason is that "one
arrival is audible to the person who asked to hear everything and passive to
the person who did not." The sender cannot declare urgency. Structurally
cannot.

That matters because every urgent flag in the history of messaging has been
overclaimed by senders until it meant nothing. **If The Floor ever gains an
alarm, it has to arrive as a permission a recipient grants a specific person,
never a mode a caller selects** — and it has to be scarce by construction
rather than by etiquette, because the moment an alarm is an ordinary option
the expectation of answering returns with it, and the expectation is the
product.

## The emergency objection, and the answer

*Should one not be able to sound the alarm in an emergency?*

**Emergencies are rare and normal usage should not be patterned after them** —
which is, precisely, the error being diagnosed. The dialer is still installed;
this app takes the other ninety-five percent. Should The Floor ever need to
cover the case itself, the constraint above is what it has to satisfy.

## The empty room, which is the real objection

A message survives the recipient's absence. **A room does not.** Asynchrony's
gift is that a text waits, and a channel with nobody in it is silence — so the
room metaphor inherits a cold-start problem the text thread does not have.
Discord escapes it through sheer population; The Floor caps a channel at six
and gates it on mutual contact, deliberately.

**The answer is presence, recency of presence, and the thread.** There is
always notification of presence and a record of when somebody was last there —
Home counts other people, the time under each channel is when somebody *other
than you* was last in it, and channels sort by that; the roster distinguishes
present-and-quiet from gone; `ping` is a notification asking somebody to come,
authorized by contact or shared channel and rate-limited
(`core/channel.ts:812`). Combined with text messaging, synchrony is
established: **the thread decides *when*, and the app supplies *where*.**

That is a better division of labour than building chat, which would put this
app against WhatsApp on their ground and off its own thesis. It has one cost
worth stating: the cold-start moment then lives inside an app nobody here
owns.

**None of this presence machinery is in the listing.** If the pitch is a room
you walk into, ambient knowledge of who is around is what makes it a room
rather than an empty box, and the description currently sells none of it. That
is the concrete gap DESCRIPTION.md was written to close.

## Six, and what the guest tier actually is

**Six is a moderation argument, not a capacity one.** Beyond about that,
absent a moderator, voices collide and the conversation degrades — and these
channels have no administration by design.

The guest views are a lesser membership that can accommodate an arbitrary
number of listeners, and what they produce is **the panel shape**: six who can
hold the floor, plus an audience with revocable microphones. `core/guests.ts`
carries the design in one sentence — a guest is not a participant — so every
guard written in terms of membership refuses them without being told to. A
guest may be granted `maySpeak` and still cannot claim the floor, which was
reversed deliberately on 2026-08-30 on the grounds that a claim is not
permission to speak but a demand that everybody else be silent, and a stranger
does not get to mute the people who let them in.

**So the six are the moderators, structurally, without anybody being an
administrator.** That is the elegant part, and it is worth protecting. The
thing to watch is that the floor was designed to arbitrate among peers with
symmetric rights, and an audience is asymmetric by construction; the knock and
the admission are currently the only things standing where administration
would otherwise go.

## Growth, where the choice is narrower than it looks

The question being debated is virality from an initial core versus copy and
digital marketing as the seed. **The topology decides it.**

**Value accrues per group, not per install.** A single user of this app has
nothing — the proposition requires three to five *specific* people they
already know. So cost-per-install buys individuals with nobody to talk to, and
nearly all of the spend evaporates. One whole book club, band or family is
worth more than fifty scattered downloads. Density beats count.

**The viral primitive is already built and is better than most.** A guest link
is a URL that survives being pasted into the thread where the coordination is
already happening, costs the recipient no install and no account, drops them
into a conversation with people they know, and — since 1.3.1 — converts them
to a contact answered from the guest page itself, with account creation there
if they need one. That is a complete funnel, and it **delivers the experience
before the signup**, which almost nothing in this category manages.

One honest limit: **guest links die with the room.** When the disconnect grace
expires on the last present member, `settleEmpty` revokes every guest link
irreversibly (`core/constants.ts`, `DISCONNECT_GRACE_MS`). A link is therefore
not a durable asset that can be seeded in advance — it is live only while
people are actually there, which is a good security property and a real
constraint on spread. The guest page converts in the moment or not at all.

**So the reframe: the App Store listing is not the top of the funnel, the
guest page is.** A stranger reading a listing has to be persuaded; somebody
opening a guest link is already hearing their friends. Copy is not thereby
wasted — but its job is to be *repeatable by a recommender* rather than
persuasive to cold traffic. "It's a group chat but voice, and it never rings
you." And the guest page's own copy deserves at least the attention the
listing has been getting.

## Two open questions

**Is `ping` sufficient on its own?** If synchrony is established by a text
message sent outside the app, the core initiation loop routes through software
this project does not own, and the ritual is two apps wide. Ping already
exists as the in-app primitive. Whether presence plus recency plus ping is
enough without the thread — and if not, what ping is missing — is decidable
rather than a matter of taste, and the answer determines how much affordance
ping deserves.

**Does the audience tier need anything where administration would go?** Not to
be built before somebody asks for it. But the floor arbitrates among peers,
and the guest tier introduces a party that is not a peer.

## What is deliberately not claimed

- **Discord is not named in any copy**, though it is in the task. Naming
  another app in a listing invites a 4.1 rejection and reads as positioning
  rather than description. The audience this is aimed at does not need the
  comparison spelled out; "nothing rings" is the same sentence to them.
- **No feature is claimed here that is not shipped.** Every statement above is
  checkable against `core/`, `push.ts`, `support.ts` or the live listing.
