# A community is a channel with an owner

From the call with Erta on 2026-10-02. She wanted a channel of her own, *Cafe
Products*, for people she meets at events, linked from Substack. Nothing fitted:
a *guest link* dies with the room, an *invitation* names one person, and a
*public channel* means anybody can hear what is in it. This is the other kind of
public — **contents private, door open** — and it shipped as a *community*. The
plan was argued at the prompt and is what this records; the task that asked for
it is deleted in the same change.

## The one bend in the no-admin rule

Every channel here is flat: any member may do anything, and removing somebody
takes two of them. **A community has an owner**, who may remove a member in one
move, delete the community at any size, and alone holds its link. Everybody
else keeps every other privilege. It is bent here and nowhere else because a
community is somebody's project that strangers walk into, and the two-member
rule assumes the members know each other.

**Set only at birth, by the person creating it while they are its only
member** — Rodrigo's answer at the prompt. *Start a community* is the only way
an owner comes to exist; no action adds one to a channel later. So nobody is
ever made subject to an owner they did not walk in under, which is what makes
the bend acceptable at all.

**The owner cannot leave, and cannot be moved against.** Leaving would leave up
to twenty people in a channel whose cap is six and whose rules assume nobody is
in charge, and nothing hands ownership over. Deleting is the owner's way out.
Deleting their account deletes their communities, by the same reasoning.

**Twenty members, not six** (`MAX_COMMUNITY_MEMBERS`, read through
`capacityOf`). The cap is lifted only where there is an owner, which is what
lets every other channel stay without an admin. Past four, the floor's claim
ladder ties everybody at zero; a community accepts that race.

## Two links

Rodrigo's answer at the prompt, in place of waiting on
`collapse-the-three-invitations-into-one`:

- **The community link**, `/j/<code>`, is what gets handed out. It opens an
  instructional page — `server/src/community-page.ts` — with the community's
  name, description and member count, the App Store, the join link, and the
  web app. It accepts nothing by being opened.
- **The join link**, `thefloor://j/<code>`, makes whoever follows it a member
  once they are signed in — **and never a contact**, of the owner or anybody.

It crosses the App Store gap the way the invite link already does: install, come
back, tap. The page names nobody, owner included, since it is meant to be
pasted somewhere public; `server/__tests__/community.test.ts` asserts that
against real display names, the way the directory page's tests do.

**The code is a slug of the name plus forty bits of random suffix.** The slug
alone could not be revoked without renaming the channel, which is why the call's
*built from a slug* and *revoke and reissue* needed both halves. Resetting
mints a new suffix, which revokes both links at once. It is a column rather than
part of the state, since it is looked up by value from an unauthenticated page
and is not a rule core needs. Unknown codes need no budget of their own: they
are refusals, and the excess monitor already counts those for every route.

## Two traps that the code now handles

- **`JOIN` sits above the membership wall in `reduce`**, since its actor is by
  definition not a member yet. It is not in `CLIENT_ACTIONS`: a client that
  could send it would skip the code check entirely.
- **`invitesFor` and `rejoinableFor` are one rule read from opposite ends**, and
  both had to learn about a member who came by the door. Without that, a joiner
  would have seen an invitation "from" whoever first walked in, or, with only
  half the fix, the community on neither list.

## Notifications stay at the default

*Low* was proposed for joiners and dropped at the prompt. A level changes how a
notification arrives, never whether it is sent, so *low* would have hidden the
community going live from the people who joined to hear it. The flood it was
meant to stop is already bounded by the five-minute arrival window. The owner
is told about each join (`notifications.joined`, kind `accepted`), uncollapsed,
since twenty arrivals are twenty facts.

## What was not built

No approval step, no one-use links, no listing on `/podcasts`, no second owner,
no handing ownership over: each is a later answer to a problem a real community
will have to show first. Nothing caps how many members may be **present**: the
box's ceiling of about ten recorded voices is a declared egress cost rather than
a measured one, and lowering it is the first move if a community reaches it —
INFRASTRUCTURE.md § *What the box can carry*. What a refused egress job looks
like to the people in the room is still unknown and is worth finding out on a
test box before a twenty-member room records.

**Older builds** read a community as full at six and ignore `thefloor://j/`,
which is wrong but harmless. Everything on the wire is additive, so no shim was
needed, and a community link should not be handed out until a build that can
follow it is in people's hands.
