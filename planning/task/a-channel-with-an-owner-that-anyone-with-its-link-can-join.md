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

---

## The plan

Written 2026-10-04 from a read of the code, against the agreement above, and
revised the same day with Rodrigo's answers at the prompt — the name, the
default notification level for everybody, ownership only at birth, and the
two links. What is left open is at the end.

### What it is called

*Public* is the podcast page and *open channel* is item 5's audience sense
above, which may still be built; *host* is the *cohort host*; *invite link* is
`/i/<username>`. Settled: **a community** — Erta's own word for it, and
*comunidad* in Spanish with no collision — whose **owner** started it, joined
through its **community link**, which opens its **community page**, from which
its **join link** makes you a member. *Owner* has no gender-neutral Spanish
noun (*dueño/dueña*); the Spanish half wants settling when the glossary entry
is written. GLOSSARY.md gets *Community*, *Owner*, *Community link*, *Community
page* and *Join link* in the commit that introduces them, list and entries
both, and *Member* notes that a community's members are not one another's
contacts.

### The model

- **`ChannelState.owner?: UserId`**, in `core/types.ts`. In the state blob
  rather than a column, because every rule below is a guard in `core/` and
  `core/` sees only `ChannelState`. Absent on every channel that exists today.
- **`channels.join_code TEXT`**, unique where not null: the whole last path
  segment, `cafe-products-k3x9` — a slug of the name for the reader and a
  random suffix for the lock. **Revoking mints a new suffix**; turning the door
  off sets it null. The slug alone cannot be revoked without renaming the
  channel, which is why the agreement's "built from a slug" and "revoke and
  reissue" need both halves. Renaming the channel does not change the code.
- **A community is a channel with an owner**, and the owner is set **only at
  creation, while the creator is still its only member** — settled at the
  prompt. *Start a community* from Home makes one; a channel that has ever
  held a second member can never become one. That keeps the bend in the
  no-admin rule from ever landing on somebody who joined a flat channel —
  nobody becomes subject to an owner they did not walk in under.

### The rules, in `core/`

- **`capacityOf(state)`** — `MAX_COMMUNITY_MEMBERS` (20, new, beside
  `MAX_CHANNEL_PARTICIPANTS` in `constants.ts`) with an owner, six without.
  It replaces the bare constant at `core/channel.ts:116` and `:1083`,
  `server/src/channels.ts:1266`, `:1921` and `:7356`, and
  `app/src/ui/channelCards.tsx:1018`, `:1126` and `:1277`. The constant's
  comment, which says beyond four everybody ties at zero and races, gets the
  sentence saying a community accepts that race.
- **`JOIN`** — `{ type: 'JOIN'; userId }`, guarded by `canJoin`: active, has an
  owner, not already a member, under capacity. Whether the code is right is the
  server's to check before dispatching, as contacts are for `INVITE`. Writes no
  `invitedBy`: nobody asked them.
- **The owner removes in one move.** `MOVE_TO_REMOVE` by the owner carries at
  once, so the removal notice, the card and the server path at
  `channels.ts:2104` are reused untouched. Motions among other members keep
  needing two, as everywhere. **Nobody may move against the owner.**
- **`canDeleteChannel`** — the owner at any roster size, besides the last
  member as now. The confirmation names what goes: every recording, for every
  member.
- **The owner cannot leave**, only delete. Leaving would leave twenty people
  in a channel whose cap is six and whose rules assume nobody is in charge.
- **The door belongs to the owner**: `canSetJoinCode` is the owner alone.

### The server

- **Two links, settled at the prompt**, and the second is the one that does
  anything:
  - **The community link**, `https://…/j/<code>` — what the owner hands out
    and Substack carries. It opens the **community page**, which is
    instructional and accepts nothing by being opened.
  - **The join link**, `thefloor://j/<code>` — drawn on that page, and what
    makes whoever follows it a member once they are signed in. **Membership
    only, never a contact**: nobody is asked to be the owner's contact, or
    anybody's.
- **`GET /j/:code`**, the community page, unauthenticated, built on
  `invite.ts`'s page, whose shape is already this one: the channel's name,
  description and cover art if it has one, how many members it has; the App
  Store listing; the join link, with the sentence that says to come back and
  tap it once the app is installed; and **the web app as the alternative**,
  through `/open` with the code written into the tab the way `acceptScript`
  writes the invitation, so a browser that signs in is joined too. **No member
  is named** — the same boundary the directory page's tests assert, and
  asserted the same way. An unknown or revoked code gets the same page as each
  other. Not listed on `/podcasts`, which is for contents.
- **This is how the install gap is crossed**, and it does not wait on
  `collapse-the-three-invitations-into-one.md` — settled at the prompt. It is
  the gap the invite link already crosses the same way, and whatever that task
  settles can later be applied to both.
- **`POST /channels/join { code }`** → `JOIN`, answering `{ channelId }`.
  Refusals: `unknown` (also revoked), `full`, `already`. An unknown answer is
  a code lookup, so it goes through `excess.flagUnbudgeted` as
  `/contacts/invite/accept` does; the random suffix is what makes guessing it
  uninteresting.
- **`POST /channels/:id/join-code`** mints or rotates, **`DELETE`** turns the
  door off; owner only, refused out loud.
- **`invitesFor` must skip a member who came by the door.** It treats any
  member who has never stepped in as invited and credits whoever entered
  first, so without this a joiner's Home says *invitation from* a stranger.
  The test: no `invitedBy` entry, and the channel has an owner.
- **Joining does not make anybody a contact.** Sharing a channel already
  opens the narrowed profile at `GET /profiles/:id`, and pings already
  require a contact; both are right as they stand for twenty strangers.
- **`tellTheInviter`'s counterpart**: the owner gets a push when somebody
  joins, at their notification level for the channel.
- **Everybody keeps the default level, *medium***, whoever joins by the link
  included — settled at the prompt, after *low* had been proposed for them.
  Levels change how a notification arrives, never whether it is sent, and
  *low* would make every one passive: a joiner would not see the community go
  live, which is the one thing they joined to hear. The flood it was meant to
  stop is already bounded — an arrival reaches only members who are not in the
  room, at most once per channel per five minutes (`ANNOUNCE_INTERVAL_MS`),
  and silently at *medium* — and the ping it would have quietened needs a
  contact, which joining does not make. If arrivals in a big community ever
  are a nuisance, that window is the lever, not the level.

### The app

- **The join link** handled where `thefloor://i/` is (`useInviteLink.ts`),
  held across sign-in the same way, then `POST /channels/join` and straight
  into the channel. The web app takes the code up from the tab the same way.
- **Channel settings, owner only**: the community link (never the join link,
  which is the page's to offer), *Share*, *Reset link* (with the sentence that
  the old one stops working — both links, being one code), *Turn off the
  link*.
- **People tab**: *Owner* beside one name; the owner's remove on a member row
  is a single confirmation rather than a motion; nobody else sees remove on
  the owner's row.
- **Capacity copy** in `channelCards.tsx` reads from `capacityOf`.

### Compatibility

Additive on the wire — `owner` on the snapshot, `JOIN`, a channel past six — so
the server may go first and nothing needs a shim. **An older build is wrong
but harmless**: it computes *full* at six, so it hides invite controls in a
community past that, and it ignores `thefloor://j/`. Erta's arrivals are new
installs and get the build that has it. Server and build ship together for
that reason, and the page should not be handed out until both are out.

### Order

1. `core/`: `owner`, `capacityOf`, `JOIN`, the owner's guards, with tests
   beside the removal and delete tests they amend.
2. Server: `join_code` column, the three routes, `invitesFor`, the page, with
   the page's privacy tests.
3. App: the deep link, settings, the People tab, the copy; GLOSSARY.md and
   STYLE.md in the same commits.
4. A decision file when it ships, carrying why the no-admin rule bends here
   and only here.

### What it deliberately does not do

No approval step, no one-use links, no listing, no second owner, no handing
ownership over — each is a later answer to a problem a real community will
have shown. And it does nothing for item 5's audience above: a community's
door makes members, not listeners.

### Recording twenty, which is a setting rather than a wall

A microphone is open for everybody stepped in, and a recording makes one
egress job per open microphone. **Egress rations itself by bookkeeping, not by
measurement**: each job declares a CPU cost, and a job is refused once the
declared costs would pass what egress believes the box's two vCPUs offer.
`track_cpu_cost: 0.15`, set in `bin/provision-livekit`, is where the *about
ten* comes from. The default of 1 assumes a job rendering video in a headless
browser; ours copies Opus that is already published into a file, with no
transcode, so its real cost has never been measured and is very likely well
under what is declared. The ceiling is also **the whole box's**, across every
channel, not one channel's.

So the first move if a community ever records more than ten people at once is
lowering that figure, which INFRASTRUCTURE.md already names as the first move.
MIGRATION.md has why a bigger box would not help: the budget is set by the
declared costs, not by memory. **Nothing in this plan caps presence or refuses
a recording for it**; `bin/usage peak` counts concurrent egress jobs and is
what will say when it is close. What is unknown is what a refused job looks
like to the people in the room — whether the run fails out loud or silently
records fewer stems. That is worth finding out before a twenty-member room
records, and is cheap to find out by lowering the budget on a test box.

### Still open

- **Who may reset the link** — proposed the owner alone, as a control on the
  door like removal; the call said only that one is needed.
- **The owner cannot leave, only delete**, and nothing hands ownership over.
  Proposed as above; it is the one rule here Erta will meet if she ever wants
  to step back.
