# Decisions

What was built, why it was built that way, and what it cost to find out. Also
what was considered and deliberately not built, which is the half most likely
to be mistaken for an oversight.

This is history rather than work. Nothing here is outstanding; see BACKLOG.md
for that. It is kept because the reasoning is the expensive part and does not
survive anywhere else — a commit message is read once, by whoever is already
looking at the diff, and never again by the person about to make the same
mistake.

**Nothing here is read as a matter of course.** AGENTS.md § *`DECISIONS` is
more than one file* is the rule: this is archaeology, for when a decision in
the code is inexplicable and knowing why would change what you do. The
exception is `deploy-history.md`, which is written to on every deploy.

## One decision, one file

Adopted 2026-09-07, replacing a month of a single append-only volume rolled
over at 2,000 lines — twelve volumes in thirty-one days. **The name is the date
and the title:**

    2026-09-07-the-cap-was-on-the-file-that-was-not-growing.md

with the full title, date suffix and all, as the `#` heading inside. That is
the whole convention. `ls` is the index, the names sort chronologically, and
`grep -l` over the filenames is the cheap way to find an entry before reading
one.

**Why it changed.** The old scheme put every entry at the tail of one file, so
two worktrees landing in the same week conflicted in the same place every time,
and a session that had finished its actual work had to do file surgery to get
its entry in. The surgery went wrong in both directions: an entry was spliced
through the middle of the live volume's preamble on 2026-09-05, and the two
running records were copied forward on each rollover until three volumes held a
`## The deploy history` and two of them were stale. One file per decision makes
both faults impossible rather than discouraged — two branches never touch the
same file, and there is no rollover to perform.

**So there is no cap, no volume, and nothing to roll over.** The 2,000-line
read limit that drove all of it applies to a file, and no single decision comes
close.

## The two running records

`deploy-history.md` is newest-first and grows at the top — **add an entry when
you deploy.** `android-adaptive-icon.md` describes something still unshipped.
Neither is dated in its filename, because neither is a dated entry; both are
edited in place, and **neither is ever copied anywhere.**

## The archive

`archive/` holds the eleven closed volumes, 2026-08-07 to 2026-09-06, in the
shape they were written in. They are frozen: nothing is appended, and nothing
is reformatted. Grep them the way AGENTS.md says to — headings first
(`grep -n '^## ' planning/decisions/archive/*.md`), then the one section.

**Resolving an old-style reference.** Comments in the code cite entries as
`DECISIONS.md § *Some title*`, and always have — often naming `DECISIONS.md`
for an entry that had already moved to a dated volume, so these were never
precise about the container. **The title is the durable half.** To resolve one,
match the title against this directory's filenames first, then against the
archive's headings. There is no need to rewrite the citations, and rewriting
them would churn thirty-odd source files for a filing change.

## On vocabulary

**What this project used to call a session is now a channel**, renamed on
2026-08-10 when it stopped being a short-lived conversation and became a
permanent place. Historical passages in the archive still name types and files
as they were at the time — `SessionView`, `SessionState` — and those are now
`ChannelView` and `ChannelState`. Two other things in this codebase are also
called sessions and are unrelated: the auth session behind a bearer token, and
LiveKit's `AudioSession`. Neither was renamed.

**And `bin/release-ios` is now `bin/upload-ios`**, renamed 2026-08-21 when
*release* was split into five non-overlapping verbs — land, deploy, upload,
submit, release. Passages in the archive name the old script and use *release*
loosely for what is now *upload* or *submit*; read them as written for the
time. See archive § *Five verbs, because release was doing the work of three*.

**And a channel is never called a room.** The word belongs to Clubhouse, and a
product that borrows a competitor's vocabulary invites the comparison it should
be avoiding. The media layer does use it — `closeRoom`, `setSilenced({ room })`,
`issueToken({ room, identity })`, `new Room(...)` in the app — because it is
LiveKit's own term for a LiveKit thing, and none of it reaches a screen. The
test is whether a user could ever read the word: in the code it is the media
plane's vocabulary; in the interface it does not exist.
