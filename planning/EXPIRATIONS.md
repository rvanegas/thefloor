# What expires, and when

Standing reference, not deferred work. Every deadline in this system that is
measured in days: what it is for, what it is *not* for, and which ones are
published promises that cannot be changed quietly. Written 2026-08-27 from a
sweep of the constants; the code is the authority and the line numbers here
will drift, so grep the constant name rather than trusting the reference.

There are six: one week-long and five thirty-day. **The point of this file is
that they are six separate numbers rather than one number used six times.**
Five of them landing on thirty days is a coincidence of six separate
judgements, not a derivation from each other, and one pair has already been
pulled apart — `USAGE_RETENTION_MS` was seven days until 2026-08-19, and the
day it moved is the day a single constant stopped being able to serve two
promises. So each entry below says what its own argument was, and tidying them
into one shared `RETENTION_MS` would be collapsing arguments that have already
been shown to diverge.

## The one seven-day window

**`DELETED_RETENTION_MS`**, `core/constants.ts`. How long a deleted channel and
its recordings survive the tap that deleted them, before the hourly sweep drops
the rows and the objects in the bucket.

It is **not an undo.** The channel is unreachable the instant it goes — there
are no members left to reach it — and nothing in the app can bring it back.
What the week buys is that a mistake is still recoverable *by hand*, the rows
being marked rather than gone. It lives in `core/` because the client states it
in the delete confirmation, and a warning that disagrees with what the server
does is worse than no warning. The privacy page states it too.

## The five thirty-day windows

**`TRANSCRIPT_DELETED_RETENTION_MS`**, `core/constants.ts`. A transcript
deleted *on its own*. Longer than the recording's week deliberately: deleting a
recording by mistake is unmistakable, because the conversation vanishes from
every list, where deleting a transcript leaves the recording exactly where it
was and the mistake can go unnoticed for far longer. A transcript whose
*recording* is deleted goes with the recording on the seven-day clock instead —
it belongs to the conversation rather than the other way round.

**`USAGE_RETENTION_MS`**, `core/constants.ts`. The horizon past which nobody is
entitled to know what anybody did: minutes with the microphone open, bytes
downloaded, who shared a channel with whom. It is what makes the meter a
rolling window rather than a history, so "how much has this account ever used"
is unanswerable by construction. Moved here from seven days on 2026-08-19,
because a week cannot show a month's shape and the questions it exists to
answer are about growth. **Not a reuse of `DELETED_RETENTION_MS`** — that one
is a recovery window for a mistake, this one is a privacy horizon, and the two
must not be made to move together.

**`INVITE_TTL_MS`**, `server/src/accounts.ts`. How long a contact request sent
to an address with no account waits for that address to sign up. There has to
be a deadline because an invite resolves the *first* time its address signs in
and nothing else ever removes one: without it, somebody joining years from now
is handed a request from a stranger, dated before they had heard of the app —
the feature working exactly as designed and not what anyone would expect.
Thirty rather than ninety also clears a mistyped address out of the sender's
list while they might still remember sending it. `bin/invites` prints the
countdown.

**`PARTICIPATION_LIFETIME_MS`**, `server/src/push.ts`. The `apns-expiration` on
invitation and ping pushes. **Thirty days rather than never, because APNs has
no never** — the header is a timestamp whose one special value is 0, which
means attempt once and store nothing, the opposite of what is wanted. So a
far-future date is the only way to say "keep trying". It is safe to keep trying
because being asked into a channel makes you a participant immediately, so the
notification reports a state the server is still holding when the phone comes
back. Presence announcements deliberately do not get this: **a presence
announcement delivered late is a lie; an invitation delivered late is merely
late.**

**`BUILD_WINDOW_MS`**, `server/src/app.ts`. How far back `/healthz`'s
`oldestBuild` and `silentBuilds` look. Chosen against TestFlight's ninety-day
expiry: long enough that somebody who uses the app occasionally still counts,
short enough that a phone abandoned two months ago stops holding the
compatibility floor down for ever. The only one of the six that is a
measurement window rather than a deletion.

## The neighbours, which are easy to conflate

`TOKEN_TTL_MS` is ninety days — a session token, not a retention rule.
`WATCH_TOKEN_TTL_MS` and `GUEST_SESSION_TTL_MS` are six hours each.
`WAITING_WINDOW_MS` is fifteen minutes. None of these is a promise about
deleting anything.

## Three of them are published promises, and only two are guarded

`DELETED_RETENTION_MS`, `TRANSCRIPT_DELETED_RETENTION_MS` and
`USAGE_RETENTION_MS` are stated as numbers on the privacy page, which restates
them in `server/src/privacy.ts` as `RETENTION_DAYS`,
`TRANSCRIPT_RETENTION_DAYS` and `USAGE_RETENTION_DAYS`. They are restated
rather than imported on purpose: lengthening a retention must not silently
lengthen what the page claims, because somebody has to re-read the prose around
the number and decide whether the promise still sounds honest at the new one,
which is not a thing an interpolation can do. **Changing any of the three moves
`PRIVACY_UPDATED` in the same commit.**

What stops the restatement drifting is `privacy.test.ts` — **for two of the
three.** It computes the day counts from `USAGE_RETENTION_MS` and
`TRANSCRIPT_DELETED_RETENTION_MS` and asserts the page contains them, so moving
either constant without the page fails the suite. The seven-day one is not
guarded that way: the page says `7 days later` as a literal and the test
asserts that same literal, so **`DELETED_RETENTION_MS` can be changed and the
published promise will go on saying seven days with a green suite.** The client
copy is safe — `ChannelSettingsView` derives its wording from the constant — so
the failure mode is specifically the app and the policy disagreeing.

## What has no expiry at all, which is the surprise

**Nothing in S3 expires by age.** There is no bucket lifecycle rule, and
nothing in `bin/provision` ever creates one. The only deletion path is a person
deleting a channel or recording, which starts the seven-day clock above; a
recording nobody deletes lives for ever, by design.

Two consequences, measured against production on 2026-08-27, when the bucket
held 206 objects and 271 MB:

- **167 of those objects, 29 MB, were orphans that no sweep will ever touch** —
  40 from before the Session → Channel rename, 66 egress `.json` manifests that
  `objectKeysOf` has never included, and 61 `.ogg` under `rec_` ids that no
  longer have a row.
- That last group is BACKLOG item 7, confirmed. `S3RecordingStore.delete` fires
  `DeleteObject` unawaited and swallows the rejection, so `sweepDeleted`'s
  `emptied` flag cannot go false for an async denial — it counts the objects
  gone and drops the row. The box's default credential chain is
  `AWS_ACCESS_KEY_ID`, which is `thefloor-server`, holding `s3:GetObject` and
  no delete. So audio outlives the row that identifies it, which is the one
  ordering `sweepDeleted`'s comments say it exists to prevent, and the sweep
  reports success either way.

Neither is fixed. The decision is whether `thefloor-server` gains
`s3:DeleteObject` or `delete` starts reporting failures rather than absorbing
them; TASKS.md § *Review S3* is where that work is asked for.
