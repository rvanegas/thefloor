# The App Store description

**Temporary.** A proposed revision of the App Store description for
`App Description` in TASKS.md, written 2026-09-03. Nothing in the repo holds
the listing copy — it lives in App Store Connect — so this file is where the
wording gets argued about before somebody pastes it in. Delete it once the
listing carries this text, moving whatever the argument settled into
`decisions/DECISIONS.md`.

The current text below was read back from the public listing
(`https://itunes.apple.com/lookup?id=6799628190`), which is the only copy
outside App Store Connect and is worth re-reading rather than trusting this
file: it is a snapshot of 1.3.1, released 2026-09-01.

## What the task asked for

`TASKS.md` § *App Description* asks for a description built on UNINTERRUPTED.md
— the three ways the app supports non-interruption — and on a thesis: voice
that has let go of pre-internet telephony and taken the shape of group text
messaging instead, for people who find a phone call rude and a Discord room
fine.

The three, checked against the code rather than taken on trust:

1. **Claim the floor.** Enforced on the server against the tracks the room is
   actually carrying, not merely displayed. **Note what it is not:**
   conversation is open by default and the floor is a claim somebody makes when
   they need to finish a thought. A description saying "one person speaks at a
   time" as the standing rule describes a different app.
2. **No alarm on calls, only notifications.** There is no CallKit and no VoIP
   push here at all. `push.ts` omits `sound` unless the notification was meant
   to be audible, and deliberately never claims `time-sensitive` or `critical`
   — the two levels that pierce a Focus mode and the ring switch. A phone on
   the table does not ring.
3. **No trolls.** Contact is mutual and by invitation. No directory, no search
   for strangers, no way to be added to anything without saying yes.

## What the current description already does

Two of the three, and well. The floor is its second paragraph, said accurately
("Conversation is open — everyone can speak … a way to finish a thought"). The
third is its last paragraph nearly verbatim. Its first two paragraphs already
carry half the thesis: *a channel is a place rather than a call*, *nobody has
to answer it*.

**What is missing is pillar 2, entirely.** Nothing in the listing says that
nothing rings. That is the claim that separates this from every other voice app
in the store, it is the one a person cannot discover from screenshots, and it
is the one the task is really pointing at. The revision is therefore an
insertion and a sharpening rather than a rewrite — the existing copy is better
than a fresh draft would be, and replacing it wholesale to satisfy a task would
lose ground.

## The current text (1.3.1)

> The Floor is for talking with people you already know.
>
> A channel is a place rather than a call. It holds up to six people, keeps its
> name and its recordings between conversations, and is still there tomorrow.
> Nobody has to answer it; you drop in, and whoever is there is there.
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

## The proposal

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

Four changes, and nothing else is touched:

- **A second sentence in the first line.** "Nothing about it rings" is the
  shortest true statement of the whole thesis, and the first line is the only
  part of a listing most people read — the rest is behind **more**.
- **A new third paragraph**, which is pillar 2 said plainly. It is the only
  addition of substance.
- **"the way you drop into a group thread, except that you are talking"**, which
  is the task's analogy, added to the sentence that was already making the
  argument without naming it.
- **"or you don't."** The permission to not answer is the thing the audience
  the task describes is actually looking for, and a paragraph about
  notifications that stops short of saying it has not said it.

## Notes for whoever revises this

- **Discord is not in the text**, though it is in the task. Naming another app
  in a listing invites a 4.1 rejection and reads as positioning against a
  competitor rather than describing this one. The audience the task means does
  not need the comparison spelled out; "nothing rings" is the same sentence to
  them.
- **Nothing here claims a feature that is not shipped.** Every sentence is
  checkable against `support.ts`, `push.ts`, `core/constants.ts` or the floor
  rules in `core/`.
- **The subtitle was not proposed**, because this file cannot read it — the
  lookup API does not return it, and it is not in the repo. Check it in App
  Store Connect before deciding whether it needs to move with this.
- **`landing.ts` and `supportPage` open with a different sentence** — "a small
  application for talking with people you know" — and neither says that nothing
  rings either. If this is adopted, the landing page is the place it matters
  next, since it is the other thing a stranger reads. That is a separate change
  and has not been made.
- **The listing's primary category is Utilities and its secondary is Social
  Networking**, per the same lookup. MEMORY.md says the secondary is still
  unset and should be Utilities; the live listing disagrees on both halves.
