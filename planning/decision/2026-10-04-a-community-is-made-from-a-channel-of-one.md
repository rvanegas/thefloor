# A community is made from a channel of one, and is never a podcast

Rodrigo's call at the prompt, the same day communities shipped. *Start a
community* sat on Home under *Start a channel*, in the same row shape, and so
read as though a community were something other than a channel — which is
the one thing the design says it is not. The control is now **Make channel
into a community**, on the settings of a channel its viewer is alone in, and
Home has no community row at all.

## Alone, rather than at birth

The first decision, `2026-10-04-a-community-is-a-channel-with-an-owner.md`,
set an owner only at birth so that nobody would be subject to an owner they
did not walk in under. **Being the only member does the same work**: nobody
else belongs, so nobody is placed under anybody, and whoever comes in later —
by an invitation or the join link — comes in knowingly. Somebody who was once
a member and left has no way back but those two, so a channel that used to
hold others is no exception. `canMakeCommunity` in core is the whole of the
rule; `MAKE_COMMUNITY` is the only way an owner exists, and `createChannel`
no longer takes one.

The action carries the name, falling back to the channel's own, and is
refused with neither: a community's page is titled with its name and its link
is read from it. It is not a client action, since the join code has to be
minted alongside — `ChannelRegistry.makeCommunity`, behind
`POST /channels/:id/community`.

**It cannot be undone.** Nothing turns a community back into a flat channel;
the card says so before the press. Build 335's *Start a community* still
works, through a shim — SHIMS.md, gate 336.

## Podcast, community, and never both

The settings screen called a public channel's switch *Public page*, which
stopped being specific the moment a second kind of outward-facing channel
existed. On screen it is now a **podcast** — the glossary's *public channel*,
whose code still says `public` — and each section says what its kind does: a
podcast is a page and a feed for anybody, listed, naming nobody, carrying only
the recordings everybody in them agreed to; a community is a door to the
membership, its contents for its members.

**A channel is at most one of them**, and the server refuses each in the
presence of the other: `setPublic` refuses a community, and `makeCommunity` a
channel that is public. The two promises contradict — a community's
recordings are its members', a podcast's are anybody's once agreed to — and
the screen shows a community why it has no podcast switch, and a podcast of
one why it has no community button, rather than hiding either.

Both keep a name and both are offered the description, since each has a page
found by the one and showing the other.
