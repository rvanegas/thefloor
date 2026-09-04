# The App Store listing

**Temporary**, in the sense DESCRIPTION.md is temporary: nothing in the repo
holds the listing, which lives in App Store Connect, so this is where the
wording is argued about before somebody pastes it in. Delete it once the
listing carries this text, moving whatever the argument settled into
`decisions/DECISIONS.md`.

**Derived from PROPOSITION.md**, on 2026-09-03, along with MANUAL.md and
ROADMAP.md — the same argument aimed at three audiences. This one is aimed at
the narrowest of them, and the proposition says why: *the listing is not the
top of the funnel, the guest page is*. A stranger reading a listing has to be
persuaded; somebody following a friend's link is already hearing their friends.
So the job of this copy is **to be repeatable by a recommender** rather than
persuasive to cold traffic, and every field below is written to be quotable
rather than complete.

**Its relationship to DESCRIPTION.md.** That file argued the description body
alone and argued it well, against the code rather than against a wish; its
proposal is carried here almost unchanged, because replacing a checked draft
with a fresh one to satisfy a task loses ground. What this file adds is
everything a listing has that a description does not — name, subtitle,
promotional text, keywords, release notes — plus one paragraph the earlier
draft had no reason to consider. When the two disagree, this one is later.

## App name

> The Floor

Unchanged, and 30 characters is not a constraint here. It is the thing the app
is named after and the glossary's first user-facing word.

## Subtitle (30 characters)

> Group voice that never rings

Twenty-eight characters. **The subtitle is where pillar two goes**, because it
is the one claim a person cannot discover from screenshots and the one that
separates this from every other voice app in the store. *Group voice* does the
categorising in two words so the description does not have to open by
explaining what kind of thing this is.

DESCRIPTION.md declined to propose a subtitle because it could not read the
current one — the lookup API does not return it and it is not in the repo. That
is still true. **Read the live subtitle in App Store Connect before replacing
it**, and if it currently carries the categorisation that *Group voice* is
doing here, the description's first line is doing that work twice.

## Promotional text (170 characters)

> It's a group chat, but voice. A channel is a place you drop into rather than
> a call you answer, and nothing about it rings — you come when you can.

**This field is the recommender's sentence**, and it is the one to get right,
because it changes without a review and because it is the form the proposition
predicts will actually travel: *"It's a group chat but voice, and it never
rings you."* The rest is that sentence with its two consequences spelled out.

## Description

> The Floor is for talking with people you already know. Nothing about it
> rings.
>
> A channel is a place rather than a call. It holds up to six people, keeps its
> name and its recordings between conversations, and is still there tomorrow.
> Nobody has to answer it; you drop in, and whoever is there is there — the way
> you drop into a group thread, except that you are talking.
>
> When somebody wants you, you get a notification, the ordinary kind. It does
> not override your ringer, it does not break a Focus mode, and it does not
> demand an answer in the next four seconds. You come when you can, or you
> don't.
>
> You can see where everybody is before you say anything. The list says which
> channels have somebody in them right now, and how long ago somebody was last
> in the others. If a channel is empty, step in anyway and ping whoever you
> wanted — they get a notification saying you are there, and you can carry on
> with whatever you were doing until they arrive.
>
> Conversation is open — everyone can speak. When one person needs to be heard
> properly, they take the floor, and every other microphone stays quiet until
> they give it back. It is a way to finish a thought.
>
> Record a conversation when it is worth keeping. Every voice is captured on
> its own track, so what you get back is clear rather than a scramble, and it
> is named once for everybody. Play it into the channel afterwards and listen
> together, export it, or delete it — anyone in the channel can, not only
> whoever started it.
>
> Nobody can reach you unless you have both agreed. There is no feed, no
> directory, no strangers, and nothing to scroll. No advertising, no analytics.

### What changed from DESCRIPTION.md's proposal

**One new paragraph, the fourth, and nothing else is touched.** That draft
carried the three pillars; the proposition names a fourth thing the copy has to
answer, and calls it the real objection. **A message survives the recipient's
absence and a room does not** — so a listing that says "drop in, whoever is
there is there" has described an empty room to anybody who thinks about it for
a second, and the app's answer to that is presence, recency of presence, and
the ping. None of it is visible in a screenshot either.

The paragraph is also where the app's oddest virtue is stated: **stepping into
an empty channel does not take the device over**, so waiting costs nothing.
That is non-interruption pointed at the person *using* the app rather than the
person being reached, and no telephone call has ever offered it.

It is placed fourth, immediately after notifications, because the two are one
argument — the notification is what comes back, and the ping is what sends it.

### What is deliberately not in it

- **"One person speaks at a time."** It describes a different app. The floor is
  a claim somebody makes when they need to finish a thought, and conversation
  is open by default. This sentence is currently live in `support.ts`,
  `landing.ts` and `privacy.ts`; ROADMAP.md § *Say the same thing everywhere*
  is about that, and the listing must not join them.
- **Discord, or any other app by name.** It invites a 4.1 rejection and reads
  as positioning rather than describing. "Nothing rings" is the same sentence
  to the audience that would have understood the comparison.
- **Anything unshipped.** No open channels, no personal invite link, no
  alarm-by-permission. Every sentence above is checkable against `push.ts`,
  `support.ts`, `core/constants.ts` or the floor rules in `core/`.
- **Guests, watch party, transcripts and the clipboard.** All shipped, all
  absent. A listing that lists everything reads as a feature comparison, which
  is the ground this app loses on; the manual is where the rest lives, and
  MANUAL.md is that.

## Keywords (100 characters, comma-separated, no spaces)

> voice,group,channel,talk,friends,call,no
> ring,intercom,walkie,podcast,record,transcript,private

Ninety-five characters. **The bets are `no ring` and `intercom`.** Somebody
searching either has the complaint this app is built on and does not yet know
that anything answers it. `walkie` and `intercom` catch the mental model people
reach for when they describe it to somebody else; `podcast`, `record` and
`transcript` catch the recording half, which is the reason a search happens at
all for some people.

Nothing here names a competitor, which is the same 4.1 exposure as naming one
in the body.

## What's New (version 1.3.2)

Left to whoever cuts the train, and it is a release-time decision like the
version string. **The one standing rule** is that release notes are not
re-engagement copy — they say what changed for somebody already using the app,
and they never say that a channel misses you.

## Category

The live listing has **primary Utilities, secondary Social Networking**;
MEMORY.md says the secondary is unset and should be Utilities. **Check it
against App Store Connect and settle it there rather than here**, and say so at
the next `bin/submit-ios`.

Utilities is the right primary on the thesis: this is a tool that does one
thing to your day rather than a place to spend the day. Social Networking as
the secondary is defensible and slightly off-argument — there is no feed, no
directory and no strangers, which is most of what that category names — but a
secondary is a discovery surface rather than a claim, and being findable by
people looking for a way to talk to their friends is worth more than the
purity.
