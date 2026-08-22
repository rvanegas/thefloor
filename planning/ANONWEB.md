# Anonymous web access

A person with no account joins one channel from a browser, is heard, and
leaves nothing behind.

Specified 2026-08-12. Not started. Delete this file when it ships, as
PLAN-bluetooth-speakers.md was — what survives it belongs in DECISIONS.md.

---

## What it is

- **A guest opens a link** and lands in one channel. No Home, no contacts, no
  account, nothing to sign up for.
- **A member admits them.** The link gets you to the door; somebody inside opens it.
- **Within the channel guests can:** self-mute, claim the floor, step out, copy to and paste from clipboard, see member profiles.
- **Within the channel guests cannot:** play media, record, see, export, or delete recordings, invite, navigate to home or channel settings.
- **GuestView Frame.** The channel is framed by content describing The Floor and this limited access, alongside links to /privacy, /support, "chip in", and the app's page in Apple Store. Also a field and button to set display name. If not used, name assigned as "Anon <number>".
- **Link.** Valid until channel is emptied of present members. Can be used by any number of guests any number of times.
- **Administration** Link can be explicitly revoked by members. They can also remove guests from the channel. Removing a guest implicitly revokes the link, since they could otherwise simply return.
- **Reconnections** GuestView page can reconnect and reauthenticate with same display name with a token assigned to it at start of session so that link revocation doesn't make reconnections fragile.

## A guest is captured in the recording

Decided 2026-08-12. A recording is of the conversation, and a guest who was
speaking was in the conversation; leaving them out would leave a hole where
half of an exchange was.

What follows from it:

- **A stem per guest, by the path that already exists.** Capture is per
  identity — `startTrackEgress` against whoever is publishing — so a guest is
  recorded the same way anybody else is, keyed `guest_<id>-001.ogg` under the
  run. Someone admitted mid-run gets a stem starting at their offset, which is
  the mid-run join case already built and tested.
- **The floor still gates them.** Windows are recorded per identity and applied
  when the mix is encoded, so a guest silenced by a member's claim is silent in
  the export for exactly that stretch. Free, and correct, and worth stating
  because it is the one place a guest's audio could otherwise leak past the
  floor.
- **Captured is not the same as entitled.** A guest is not added to the
  recording's access list. Access is channel membership, and a guest has no
  membership and no account to hold one — they are in the recording and can
  never open it.
- **Their name is kept with the recording**, so it can say who was in it. A
  recording naming two people that contains three voices is a lie of omission,
  and the names are frozen at filing time for exactly this reason: an id that
  resolves to nothing is silently dropped, and a guest id resolves to nothing
  by construction.
- **The guest is told, twice.** On the way in, before the microphone can open,
  and continuously while a run is capturing. That is what makes this consent
  rather than a surprise, and it is why `recording` is in `GuestView` at all.

BACKLOG.md records that two-party consent has never been reviewed. This does
not review it — it decides one case inside it, in the direction of telling
people.

---

## The decision the rest follows from: a guest is not a participant

Every guard in `core/channel.ts` is written in terms of `isParticipant`.
`canClaimFloor`, `canControlPlayback`, `canStartRecording`, `canInvite`,
`canSetName`, `canDeleteChannel` — all of them.

So if a guest is *not* a participant, every prohibition in the spec is already
enforced, by code that exists, without a line being changed or a guard being
audited. The alternative — a participant carrying an `isGuest` flag — means
finding every guard and remembering to check it, for ever, including the ones
written after this.

That is the whole design. `ChannelState` grows a second list beside
`participants`, and the rules never learn about it.

```ts
/** Present in the room, in it for nothing else. */
guests: Record<GuestId, {
  name: string;          // what they typed at the door, for the roster
  admittedAt: number;
  maySpeak: boolean;     // false until a member says otherwise
}>;
```

Three consequences to handle deliberately, because they are the places where
"not a participant" is the wrong answer:

- **`present` drives the microphone.** `microphoneNeeded` opens a member's mic
  when somebody else is present. A member alone with a guest must not be
  inaudible, so that function has to count guests. It is already a tested
  function with a comment about exactly this class of mistake.
- **The silencing matrix.** `assertSilence` iterates `state.participants` as
  both speakers and listeners. Guests belong in both directions: a guest must
  be silenced when a member holds the floor, and must hear whoever holds it.
- **`describeChannel` and the roster.** Members should see who is in the room.
  Guests are in the room.

## What a guest is told

**Not `ChannelView`.** It carries the description, the floor timeline, the
recording state, the playback state and — since today — the channel's
recordings. Sending that to a stranger and hiding it in the client is the same
mistake as a greyed-out button that the server does not enforce.

A guest gets its own projection, and it is small:

```ts
interface GuestView {
  channelName: string | null;      // or the roster fallback, as members see
  others: PublicAccount[];         // names only
  mic: 'listening' | 'requested' | 'open' | 'refused';
  recording: boolean;              // a run is capturing, and they are in it
}
```

`mic` is the one thing beyond "the other users" that has to be on screen. A
person needs to know whether they are being heard — silently withholding that
is how somebody talks into a room that cannot hear them, or worse, assumes they
are muted when they are not.

---

## Admission

1. **A member mints a link** from the channel screen. The server issues a
   capability — not an account, not a session — scoped to one channel:
   `POST /channels/:id/guest-links` → `https://thefloor.rvanegas.co/g/<token>`.
2. **The guest opens it**, types a name, and knocks: `POST /g/<token>/knock`.
3. **Members present see the knock** in the channel screen, with the name, and
   accept or reject. The reducer holds pending knocks so every member sees the
   same thing and one answer settles it. Knock should manifest with haptics to 
   present members and guests.
4. **On accept**, the server mints a LiveKit token for identity `guest_<id>`
   with `canPublish: false`, and the page joins the room.

Rules that need to exist from the first version, because each is a door that
cannot be closed afterwards:

- **No admission without a member present.** Nobody to accept means nobody
  enters. The page says so rather than hanging.
- **A knock is not a notification.** Members are expected to be there.
- **A guest identity is never an account id.** `guest_` prefix, and the
  `MEDIA_IDENTITY` precedent already establishes that the room holds identities
  that are not people.

## The microphone

Live, without reconnecting: `RoomServiceClient.updateParticipant(room,
identity, undefined, { canPublish: true })`. Verified present in the installed
server SDK.

- The guest's LiveKit token starts `canPublish: false`, so the grant is the
  only thing that can make them audible. A client cannot talk its way past it.
- The request and the answer travel over the existing channel actions, so
  members' screens stay in step through the same fan-out as everything else.
- **Revoking is the same call.** A guest who is a problem is silenced by a
  member in one tap, without ejecting them mid-sentence — and ejecting is
  `removeParticipant`, which the room service also has.

---

## The page

The smallest thing that works: one HTML file and one script, served from the
existing box.

- **`livekit-client` runs in browsers** and is already a dependency of the app.
  It ships an ESM bundle, so the page can import it directly.
- **Serving it**: Caddy is already in front and can `file_server` a directory
  without the server learning to serve static files or gaining
  `@fastify/static`. The API stays where it is.
- **Building it**: an `esbuild` step producing one bundle. Where it runs is the
  open question — `bin/deploy` currently syncs and reinstalls, with no build
  step at all, and `tsx` runs TypeScript directly in production precisely to
  keep it that way. Either the deploy grows a build step, or the bundle is
  committed. Prefer the build step: a committed bundle is a compiled artefact
  that will drift from its source and nobody will notice.
- **Mobile browsers need a gesture** before audio starts, and `getUserMedia`
  before a microphone. Both are ordinary; both need the page to say what it is
  asking for and why.

## What the app gains

Little, deliberately. On the channel screen:

- **Invite a guest** — mints a link and hands it to the share sheet.
- **A knock** — a name and two buttons, in the same place invites already
  appear.
- **The roster shows guests** as guests, with a control to grant, revoke or
  eject.

Outstanding links belong in channel settings, beside the other things about the
channel rather than about the conversation.

---

## The database model

**Built 2026-08-22**, and the only part of this file that exists: the two
tables are in `server/src/db.ts`, the rules about them are `server/src/guests.ts`
and `server/__tests__/guests.test.ts`, and `ChannelRegistry` owns a `Guests` and
calls it on the three transitions named below. Nothing above this layer knows
what a guest is yet — the reducer has no `guests`, there is no link route and no
page — so what is here admits nobody to anything.

Almost nothing about a guest outlives the process, and the exceptions are the
whole design. Three facts do: **the link**, because it is handed to people who
open it later; **the seat**, because a guest who has been admitted must be able
to come back without knocking again; and **the name**, because a recording that
captured them has to be able to say who was in it. Everything else about a
guest — presence, their track, what the room has been told about silencing them,
an unanswered knock — is volatile, in exactly the class as `present` and for the
same reason. See STATES.md.

Two tables, and no row in `accounts` ever.

```sql
-- A capability to knock at one channel's door. Not a credential: holding it
-- gets you as far as asking, and a member present has to say yes. See below
-- for why it is stored in the clear when every other token here is hashed.
CREATE TABLE IF NOT EXISTS guest_links (
  token       TEXT PRIMARY KEY,
  channel_id  TEXT NOT NULL REFERENCES channels(id),
  created_by  TEXT NOT NULL REFERENCES accounts(id),
  created_at  INTEGER NOT NULL,
  -- Set when a member revokes it, when a guest admitted through it is
  -- ejected, when the channel empties of present members, and when the
  -- channel is deleted. Null means live. Rows are kept revoked rather than
  -- deleted so settings can say a link existed and stopped working.
  revoked_at  INTEGER,
  revoked_by  TEXT REFERENCES accounts(id)
);
CREATE INDEX IF NOT EXISTS guest_links_channel ON guest_links(channel_id);

-- One admitted guest. The row is written on accept, never on knock: an
-- unanswered knock is a live conversation between a page and a screen, and
-- if the process dies mid-knock the page knocks again, which is what it
-- would do anyway.
CREATE TABLE IF NOT EXISTS guest_sessions (
  -- guest_<...>. The LiveKit identity, the key in the recording's stems, the
  -- account_id on its usage spans, and the key in participant_names. One id
  -- in four places and no mapping table anywhere.
  id           TEXT PRIMARY KEY,
  channel_id   TEXT NOT NULL REFERENCES channels(id),
  -- Which link admitted them. Ejecting a guest implicitly revokes the link
  -- they came through, and this is how that revocation knows which one.
  link_token   TEXT,
  -- The reconnection credential, hashed as tokens and otp_codes are. This one
  -- is a credential: it re-enters a seat without anybody being asked again.
  secret_hash  TEXT NOT NULL,
  -- What they typed at the door, or the assigned "Anon <n>".
  display_name TEXT NOT NULL,
  admitted_at  INTEGER NOT NULL,
  admitted_by  TEXT NOT NULL REFERENCES accounts(id),
  -- Whether a member has granted the microphone: 1 or 0, durable, and it has
  -- to be. See below.
  may_speak    INTEGER NOT NULL DEFAULT 0,
  ejected_at   INTEGER,
  last_seen_at INTEGER NOT NULL,
  -- last_seen_at + the session TTL, refreshed while they are here. A page
  -- left open overnight in an empty channel is not a standing seat.
  expires_at   INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS guest_sessions_channel ON guest_sessions(channel_id);
```

Both are new tables in `SCHEMA` and nothing goes in `migrate()`. There are no
guests before there are guests, so there is nothing to backfill and no column
whose null means something historical — which is the first time that has been
true of anything added to this database.

### Two tokens, stored differently, and the difference is the point

The link is **not** a credential and is stored in the clear. What it buys is
the right to ask; a member present has to accept, and what they accept is a
name typed by a stranger. A copy of this database therefore buys the ability
to knock, which is a nuisance rather than an entry.

What it buys us is that a link can be **shared again**. Hash it and the app can
show it once, at minting, and never again — after which "send it to Dana too"
means minting a second link, and every extra link is another thing somebody has
to remember to revoke. The escape hatch is one column: if this is ever judged
wrong, `token` becomes `token_hash`, minting returns the only plaintext copy
that will exist, and settings lists links rather than showing them.

The session secret is the opposite and is hashed. It skips the knock — that is
its entire purpose, so that revoking a link does not strand somebody who was
already let in — so it is a seat, and a seat is stored the way `tokens` are.

### `may_speak` is durable, and this is not a nicety

The guest's LiveKit token is minted `canPublish: false` and the grant is a live
`updateParticipant`. **LiveKit is a separate process on this box**, so a restart
of the Node server does not close the room or take the grant back: a guest who
was granted speech is still publishing while this process boots. If the
permission were volatile, the restored state would say "not speaking" about
somebody the room is currently carrying — which is the disagreement
`reconcileSilence` exists to catch, arriving by a second route. Read it back at
`restore()` and the two agree.

### The guests map is a projection, not a second copy

`ChannelState.guests` is **not** in `durableOf`. The tables are the authority
for who was admitted, what they are called and whether they may speak;
`restore()` rebuilds the map from `guest_sessions` for each revived channel. The
alternative writes `may_speak` in two places that are updated by different code
paths at different rates — `persistChannel` compares and writes the whole blob
on every commit, a grant is one row and one call — and two durable copies of one
permission is how a guest comes back muted on one side and audible on the other.

### "Valid until the channel is emptied" is an event, not a query

Presence does not survive a restart. Evaluating *emptied of present members* as
a query, at boot, would find every channel empty and revoke every outstanding
link at every deploy — a deploy costs presence, not channels, and this rule
must not be the place that stops being true.

So the emptying is a **transition** the registry observes: the last present
member steps out, and that commit stamps `revoked_at` on the channel's live
links and `expires_at = now` on its sessions. A restart empties nothing that
anybody chose to empty and revokes nothing. The guests are disconnected by it
all the same, and their sessions are what let their pages come back — which is
the case the reconnection token was asked for, met by a cause nobody listed.

### Rows die with the channel and nothing else deletes them

An expired or ejected session is **unusable, not absent**. Nothing deletes a
`guest_sessions` row except the channel sweep, which is what removes an ordering
hazard: a guest can leave, and their session expire, while the run that captured
them is still capturing, and `fileRun` needs their name at the end of it. Rows
are tiny and a channel's guests are few; keeping them until the channel goes is
cheaper than a rule about which sweep may run first.

Two consequences to build deliberately:

- **`sweepDeleted` has to clear both tables for a due channel before the
  `DELETE FROM channels`.** That statement is guarded by `NOT EXISTS (SELECT 1
  FROM recordings …)` and by nothing else, so a foreign key from a guest row
  does not skip the channel — it throws, in a sweep, on a timer, an hour after
  anybody did anything.
- **`markDeleted` revokes immediately.** A deleted channel's link stops working
  when it is marked, not a week later when its row goes.

The cost is that a name somebody typed at a door persists for as long as the
channel does. It is in the recording's frozen names regardless, so this adds
nothing that was not already kept — but CREDENTIALS.md and the privacy
page describe what this database holds about people, and a guest is a person.

### What a recording keeps of a guest

`fileRun` already writes `stems` keyed by identity and `participant_names`
frozen at filing time, and a guest needs both. The frozen column is what makes
this work at all: names are resolved live only on legacy rows, and a guest id
resolves to nothing by construction and would be **silently dropped** — which
is the exact failure `participant_names` was added to prevent, in its purest
form.

- **`displayName()` needs a guest branch**, reading `guest_sessions` by id. The
  live channel is not enough: a guest who left mid-run is gone from
  `ChannelState.guests` and is still in the recording.
- **Guests go into `recordings.participants` too**, after the members, so the
  card names everyone who was in the room. This grants nothing — reach is
  `recordingsFor`, which reads `channels.participants` through `json_each` and
  has never read the recording's own list — and `toRecordingView` prefers the
  frozen name, so a guest resolves without an account lookup.
  **That safety is a property of one query and should have a test that says
  so**: a guest id in `recordings.participants`, and `recordingsFor(guestId)`
  returning nothing.

### "Anon 3" needs the rows as much as the recording does

The assigned name is per channel and has to not collide with one already in the
room or one that just left mid-conversation. The number comes from the channel's
`guest_sessions` rows rather than from a live count, which is the second reason
they outlive a disconnect: a guest who leaves and a guest who is ejected both
stop being present, and neither should hand their number to the next arrival.

### Where guest usage lands

`usage_spans.account_id` takes a guest id as it stands — that table has no
foreign key to `accounts`, deliberately, and a guest's microphone minute costs
this box exactly what anybody else's does. `bin/usage` will print `guest_…`
where it prints account ids, unresolvable, which is correct and worth expecting
rather than discovering.

---

## Deliberately not built

- **No guest accounts.** A guest that becomes a row in `accounts` acquires
  contacts, a profile, a display name people can find, and a place in every
  query written since. The capability token is the whole identity.
- **No guest history.** They leave when they close the tab, and the channel
  keeps nothing about them but whatever a recording captured.
- **No web client for members.** This is a door, not a second app. The moment
  it grows Home, it is one.
- **No reuse of `ChannelView`.** See above; it is the difference between
  hiding information and not sending it.

## Order of work

1. **Core**: `guests` in `ChannelState`, knock actions, `microphoneNeeded`,
   and the tests for each. Nothing else can be right if this is wrong.
2. **Server**: the two tables, links, knocks, guest tokens,
   `updateParticipant`, the silencing matrix, `GuestView`. Testable end to end
   without a browser.
3. **The page**: join, listen, request, speak.
4. **The app**: mint, admit, grant, eject.

One and two are the substance and are fully testable. Three is the part this
project has no way to test — there is no browser in the suite and no plan to
add one — so it wants to be as thin as it can be, with every decision that
could be made in step two made there instead.
