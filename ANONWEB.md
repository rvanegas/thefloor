# Anonymous web access

A person with no account joins one channel from a browser, is heard, and
leaves nothing behind.

Specified 2026-08-12. Not started. Delete this file when it ships, as
PLAN-bluetooth-speakers.md was — what survives it belongs in DECISIONS.md.

---

## What it is

- **A guest opens a link** and lands in one channel. No Home, no contacts, no
  account, nothing to sign up for.
- **A member admits them.** The link gets you to the door; somebody inside
  opens it.
- **The microphone is a second permission.** A guest arrives able to listen. To
  speak they ask, and a member accepts or rejects.
- **They can do nothing else.** No floor claim, no media playback, no
  recording, no seeing or exporting recordings.
- **They see only the other users.** Names, and who is there. Not the
  description, not the recordings, not what is playing.

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
   same thing and one answer settles it.
4. **On accept**, the server mints a LiveKit token for identity `guest_<id>`
   with `canPublish: false`, and the page joins the room.

Rules that need to exist from the first version, because each is a door that
cannot be closed afterwards:

- **A link expires.** An hour is enough for "join me now"; a link that works
  next month is a stranger in a private conversation. Revocable explicitly, and
  listed on the channel screen so a member can see what is outstanding.
- **No admission without a member present.** Nobody to accept means nobody
  enters. The page says so rather than hanging.
- **A knock is not a notification.** Out of scope: the member who sent the link
  is expected to be there. Push for knocks is a want, not a requirement, and
  BACKLOG.md is the place for it.
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

## The floor, and a guest

A guest is a non-holder, always. While a member holds the floor the guest is
withheld from everyone, exactly as any other non-holder is — one line in the
matrix, not a new rule. While nobody holds it, a guest with a granted
microphone is heard by everyone.

They cannot claim it, because claiming is guarded on `isParticipant`, which
they are not. Nothing to write.

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
2. **Server**: links, knocks, guest tokens, `updateParticipant`, the silencing
   matrix, `GuestView`. Testable end to end without a browser.
3. **The page**: join, listen, request, speak.
4. **The app**: mint, admit, grant, eject.

One and two are the substance and are fully testable. Three is the part this
project has no way to test — there is no browser in the suite and no plan to
add one — so it wants to be as thin as it can be, with every decision that
could be made in step two made there instead.
