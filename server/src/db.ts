import { DatabaseSync } from 'node:sqlite';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * SQLite via Node's built-in driver, so the server has no native dependencies
 * and its build artifact is portable across architectures. The surface used
 * here is small and deliberately boring; swapping in better-sqlite3 later means
 * changing this file and nothing else.
 */

export interface AccountRow {
  id: string;
  identifier: string;
  display_name: string;
  created_at: number;
  /**
   * When this person last held a live socket — written as they connect, as
   * they speak, and as they go. Null for an account that has not connected
   * since the column existed.
   */
  last_seen_at: number | null;
  /**
   * The iOS build they last connected from, or null when they last connected
   * from one that does not report it. Absent is not "unknown" in the useless
   * sense — it is a bound, meaning at or below the first build that sends the
   * header, and it stays that until the account connects again.
   */
  last_build: number | null;
  /**
   * Forces the donate link visible (1) or hidden (0), overriding what the
   * device's region suggests. Null — the default for everyone — means decide
   * automatically. See region.ts for why the automatic answer needs an
   * override at all.
   */
  donations_allowed: number | null;
  /**
   * Whether this account sees the diagnostic panel: 1 for yes, null or 0 for
   * no. Nobody has it by default, and it is set by hand — `bin/db --write` —
   * because it is not a preference and there is no screen that offers it.
   *
   * It gates a *read-only* display of the iOS audio session's intended and
   * actual configuration. Nothing about it grants a permission, so the worst
   * a wrongly-set flag can do is clutter one person's channel screen. See
   * `app/src/ui/AudioDebugPanel.tsx`.
   */
  debug: number | null;
  /**
   * Who invited this person, or null when nobody did — they signed up on their
   * own, or their invitation had expired by the time they got round to it.
   *
   * Written once, when the account is created, and never again: it is a fact
   * about how somebody arrived, not a relationship that can be revised. See
   * `Accounts.resolveInvitesFor`, which is the only writer.
   */
  invited_by: string | null;
  /**
   * Whether this account may see the invitation standings: 1 for yes, null or
   * 0 for no. Nobody has it by default and there is no screen that grants it —
   * it is set by hand, `bin/db --write`, exactly like `debug` above and for a
   * related reason. What it reveals is other people's names against a number,
   * which is the one thing this service otherwise promises not to publish.
   */
  leaderboard: number | null;
  /**
   * Whether this account may transcribe without limit: 1 for yes, null or 0
   * for no. Set by hand — `bin/db --write` — like `debug` and `leaderboard`,
   * and unlike either of those it is the only flag here that licenses
   * spending. Everybody else gets the one free transcript the two columns
   * below record.
   */
  transcripts_unlimited: number | null;
  /**
   * The recording whose transcript spent this account's one free use, or null
   * while it is unspent.
   *
   * **On the account rather than counted from `transcripts`**, and that is the
   * whole point of it: transcript rows are swept — a transcript deleted on its
   * own goes `TRANSCRIPT_DELETED_RETENTION_MS` later, and a swept recording
   * takes its transcript with it — so a count derived from `requested_by`
   * hands the credit back weeks after it was spent, and "delete it and wait"
   * becomes the way round the limit.
   *
   * Written when the transcript is *asked for*, so one in flight holds the
   * credit and nobody can start five at once. Cleared only if that same
   * transcript fails, which is why it holds the id and not a boolean: a
   * failure returns the use because it produced nothing, and a success that
   * was later deleted does not, because it produced something.
   */
  free_transcript_id: string | null;
  /** When that free use was spent. Null exactly when the id above is. */
  free_transcript_at: number | null;
  /**
   * Where this person can be reached elsewhere, canonically — see
   * `core/im.ts`. Null until they type one, and null again the moment they
   * clear the field: there is no history here, a handle being a way to reach
   * somebody today rather than a record of how they once could be.
   */
  im_whatsapp: string | null;
  im_telegram: string | null;
  im_signal: string | null;
  /**
   * The colour scheme this person chose, or null for everybody who has never
   * chosen one — which reads as `system`, the default in
   * `core/settings.ts`.
   *
   * **Null rather than a stored `'system'`**, on the reasoning
   * `NotificationPreferences` states at length: a row saying the default and
   * no row at all mean the same thing today and would stop meaning the same
   * thing the day the default moves, at which point everybody who had opened
   * the screen and left it alone would be pinned to the old arrangement with
   * no way to tell them apart from the people who meant it.
   */
  appearance: string | null;
  /**
   * Whether tapping a channel on Home steps into it: 1 for yes, 0 for no,
   * null for never having said — which reads as the default, and the default
   * is on. Null and 1 therefore mean the same thing today, for the reason
   * above.
   */
  tap_to_step_in: number | null;
  /**
   * Whether the channel screen repeats its footer's three controls as cards
   * further down: 1 for yes, 0 for no, null for never having said. The
   * default is on, so null and 1 mean the same thing today — for the reason
   * above, which is why the untouched case is still stored as null.
   */
  control_cards: number | null;
}

export interface ContactRow {
  a_id: string;
  b_id: string;
  state: 'pending' | 'accepted';
  requester_id: string;
  created_at: number;
}

export interface DeviceTokenRow {
  token: string;
  account_id: string;
  platform: 'ios' | 'android';
  created_at: number;
  last_seen_at: number;
  /** The session that registered it, hashed. Null for a row that predates it. */
  session_hash: string | null;
}

export interface ChannelNotificationLevelRow {
  account_id: string;
  channel_id: string;
  level: 'low' | 'medium' | 'high';
  set_at: number;
}

export interface GuestLinkRow {
  token: string;
  channel_id: string;
  created_by: string;
  created_at: number;
  /** Null while the link is live. */
  revoked_at: number | null;
  /** Null when nobody revoked it — the channel emptying is not a person. */
  revoked_by: string | null;
}

export interface GuestSessionRow {
  /**
   * `guest_...`. The LiveKit identity, the key of their stem in a recording,
   * the `account_id` of their usage spans, and their key in
   * `participant_names`. One id in four places, and no mapping table.
   */
  id: string;
  channel_id: string;
  /** Which link admitted them; null once that link's row is gone. */
  link_token: string | null;
  /** The reconnection secret, hashed as `tokens` and `otp_codes` are. */
  secret_hash: string;
  /**
   * Their account's name if they knocked with a session, otherwise what they
   * typed at the door, otherwise the `Guest <n>` they were given. Theirs to
   * change afterwards, and a change here is to the seat alone — the account,
   * if there is one, is untouched.
   */
  display_name: string;
  /** The account behind the seat, or null for somebody with no session. */
  account_id: string | null;
  admitted_at: number;
  admitted_by: string;
  /** 1 once a member has granted the microphone. Durable; see guests.ts. */
  may_speak: number;
  /** When a member removed them. Null means they were not thrown out. */
  ejected_at: number | null;
  last_seen_at: number;
  /**
   * When the seat stops being one. Refreshed while they are here, and set to
   * the moment the channel empties of present members. In the past means the
   * secret no longer reconnects; the row stays regardless, because a recording
   * may still need the name. See `Guests.forgetChannel`.
   */
  expires_at: number;
}

export interface RecordingRow {
  id: string;
  channel_id: string;
  initiator_id: string;
  invitee_id: string;
  /** JSON: string[] — every participant of the recorded channel, in order. */
  participants: string | null;
  /**
   * JSON: { [id]: displayName } — what each of them was called at the moment
   * the run was filed.
   *
   * The ids alone are not enough to label a recording that outlives things.
   * Resolving them live means an old recording relabels itself when somebody
   * renames themselves, and — worse — an id that no longer resolves is
   * silently dropped, so a recording of two people can come to read as though
   * nobody else was there. Null on rows written before this existed, which
   * fall back to resolving live.
   */
  participant_names: string | null;
  /**
   * What the recording is called: decided when the run stopped, the same for
   * everybody in it, never recomputed. Null on rows written before it existed,
   * which fall back to a label derived at read time — the old behaviour, and
   * viewer-relative, because there is nothing recorded to do better with.
   */
  name: string | null;
  started_at: number;
  duration_ms: number;
  s3_key: string;
  segment_keys: string | null;
  /**
   * JSON: { [identity]: Array<{ key, startMs }> } — each participant's
   * segments in order, with where in the recorded audio each begins. Rows
   * written before mid-channel joins existed hold { [identity]: string[] };
   * the export accepts both.
   */
  stems: string | null;
  /** JSON: Array<{ identity, fromMs, toMs }> — when each party was silenced. */
  floor_timeline: string | null;
  /**
   * Where the mixed recording stands: `'pending'` while it is being made,
   * `'ready'` once it is in the bucket, `'unmixed'` when there is not one and
   * nothing is going to make one without being asked.
   *
   * A pending recording is shown to nobody — see `recordingsFor`. The other two
   * are both displayable, which is the distinction that matters: `'unmixed'`
   * covers rows written before mixes existed and runs whose mix failed, and
   * both of those still export, by encoding on demand exactly as every
   * recording used to.
   *
   * Null on a row that is still capturing, and on legacy rows until the
   * migration backfills them.
   */
  mix_state: string | null;
  /** Null while the run is still capturing; restore() finalizes strays. */
  ended_at: number | null;
  /** Why the run ended early, when it did not end by anyone's choice. */
  failure: string | null;
  /** When its channel was deleted. Null until then; the sweep reads it. */
  deleted_at: number | null;
}

/**
 * One interval of one thing being carried, open until it is closed.
 *
 * Spans rather than counters because the request asks for timestamps as well
 * as minutes, and because a counter cannot answer the question the egress cap
 * makes urgent — how many stems were running *at once* — which needs to know
 * when each one overlapped the others.
 */
export interface UsageSpanRow {
  id: string;
  /**
   * `'mic'` — one participant publishing audio.
   * `'listen'` — one participant subscribed to somebody else's audio.
   * `'playback'` — the channel's shared track actually playing.
   * `'egress'` — one recording stem being captured.
   * `'pair'` — two people present in the same channel at the same time.
   * `'participant'` — one WebRTC connection to the SFU, whoever holds it.
   *   The only kind that counts the shared-track participant, and so the only
   *   one whose `account_id` is sometimes an identity rather than an account.
   */
  kind: string;
  /** Null on a span that belongs to the channel rather than to a person. */
  account_id: string | null;
  /**
   * The other party. On `'pair'` that is the second person, ordered against
   * `account_id` by `pairKey` so a pair has one shape however it is asked
   * about. On `'egress'` it is whose stem is being captured, `account_id`
   * being whoever started the recording — the two differ whenever somebody
   * records a conversation they are not the only voice in, which is most of
   * them. Null on every other kind.
   */
  peer_id: string | null;
  channel_id: string;
  /** `'egress'` only: the run, which is also the recordings row. */
  recording_id: string | null;
  started_at: number;
  /** Null while the span is open. closeStrays finalizes ones a restart left. */
  ended_at: number | null;
  /**
   * Which authority wrote it: `'room'` for what LiveKit was asked, `'state'`
   * for what this process knows because it did it.
   *
   * Not a hedge about confidence. The two are used for different streams on
   * purpose, so a `'mic'` row reading `'state'` would mean the poll had stopped
   * running and the meter had fallen back — a defect, and one that should be
   * visible as a defect rather than averaged into a total.
   */
  source: string;
}

/**
 * Bytes this server moved, and for whom.
 *
 * Not spans: a transfer is an event with a size, and giving it a duration
 * would invite somebody to divide one by the other and call it bandwidth.
 */
export interface UsageBytesRow {
  id: string;
  /** `'export' | 'playback-fetch' | 'mix-read' | 'mix-write'` */
  kind: string;
  /** Null when nobody asked for it directly — see the mix kinds. */
  account_id: string | null;
  recording_id: string | null;
  bytes: number;
  at: number;
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS accounts (
  id           TEXT PRIMARY KEY,
  identifier   TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  created_at   INTEGER NOT NULL,
  -- When they last had the app open, to the nearest heartbeat. Null until
  -- they first connect.
  last_seen_at INTEGER,
  -- Which iOS build they last connected from. Null means they have not
  -- connected since the app began saying — which, indefinitely, has to be read
  -- as "something at or below the first build that sends it". See release.ts.
  last_build   INTEGER,
  -- Overrides the guess about whether this person may see the donate link.
  -- Null means decide from what their device reports, which is what everybody
  -- gets until somebody says otherwise; 1 forces it visible and 0 forces it
  -- hidden. It exists because the automatic answer is an approximation of the
  -- App Store storefront and a person who actually knows the truth for one
  -- account should be able to say so without a deploy. See region.ts.
  donations_allowed INTEGER,
  -- Shows this account the audio diagnostic panel. Null for everyone until
  -- somebody sets it by hand; see the row type above for why there is no
  -- screen that does.
  debug INTEGER,
  -- Whose invitation brought this person here, null when none did. One edge
  -- per account, so these rows form a forest, and the credit a profile shows
  -- is the size of the subtree under it. Acyclic by construction: an inviter
  -- had to exist before the account that names them.
  invited_by TEXT REFERENCES accounts(id),
  -- Lets this account see the invitation standings. Null for everyone until
  -- somebody sets it by hand; see the row type above for why there is no
  -- screen that does.
  leaderboard INTEGER,
  -- Lets this account transcribe without limit. Null for everyone until
  -- somebody sets it by hand; the only flag here that licenses spending.
  transcripts_unlimited INTEGER,
  -- The recording whose transcript spent this account's one free use, and
  -- when. Null while unspent. Kept here rather than counted from the
  -- transcripts table, whose rows are swept; see the row type above.
  free_transcript_id TEXT,
  free_transcript_at INTEGER,
  -- Where this person can be reached in the messaging apps they already use,
  -- one column each and null until they say. Stored canonically — the two
  -- phone numbers in international form with the plus, the Telegram username
  -- without its at — because normalisation happens on the way in; see
  -- core/im.ts. Three columns rather than one blob, so that a handle is a
  -- value the database can be asked about rather than a string to parse.
  im_whatsapp  TEXT,
  im_telegram  TEXT,
  im_signal    TEXT,
  -- What this person chose on the Home settings screen, null until they chose
  -- anything. Three of the four settings there; the fourth is about the
  -- headset in somebody's ears rather than about them, and lives on the phone.
  -- See core/settings.ts and the row type above for why the untouched case is
  -- null rather than the default written down.
  appearance     TEXT,
  tap_to_step_in INTEGER,
  control_cards  INTEGER
);

-- One-time codes. The code itself is never stored, only its hash, so a copy of
-- the database does not hand over the ability to sign in as anyone.
CREATE TABLE IF NOT EXISTS otp_codes (
  identifier TEXT PRIMARY KEY,
  code_hash  TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  attempts   INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

-- Bearer tokens, likewise stored hashed.
--
-- A row here is a sign-in, and since 2026-08-24 an account may have several at
-- once. That makes this the nearest thing the server has to a register of
-- devices: it is keyed on the exact credential every path that learns anything
-- about a client already presents, which neither accounts nor device_tokens
-- is. Hence the last two columns.
CREATE TABLE IF NOT EXISTS tokens (
  token_hash TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(id),
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  -- When this session was last heard from, which is not when the *account*
  -- was: accounts.last_seen_at is the maximum across every device somebody
  -- holds, and is what a contact list renders. This one is per device, and is
  -- what bounds the build census to sessions that are actually calling.
  last_seen_at INTEGER,
  -- The build this session last announced, or null if it has never said.
  --
  -- accounts.last_build is the same fact about a person and is still written,
  -- for bin/db and for the write guard in requireAccount. It cannot answer
  -- the census, because one column cannot hold two devices' builds and the
  -- last writer wins — a phone on a current build would mask a tablet below
  -- the floor. See Accounts.buildsSeenSince.
  last_build INTEGER
);
CREATE INDEX IF NOT EXISTS tokens_account ON tokens(account_id);

-- A contact pair is stored once, with a_id < b_id so the pair has a single
-- canonical row regardless of who asked. requester_id records the direction,
-- which is what distinguishes an incoming request from an outgoing one.
CREATE TABLE IF NOT EXISTS contacts (
  a_id         TEXT NOT NULL REFERENCES accounts(id),
  b_id         TEXT NOT NULL REFERENCES accounts(id),
  state        TEXT NOT NULL CHECK (state IN ('pending', 'accepted')),
  requester_id TEXT NOT NULL,
  created_at   INTEGER NOT NULL,
  PRIMARY KEY (a_id, b_id)
);

-- One person letting one other person see their sign-in address.
--
-- Directional, unlike the contacts row, and that is the point: an address is
-- yours to hand out and being somebody's contact is not consent to have it.
-- So the pair is stored as it was meant rather than canonicalised — owner_id
-- gave it, viewer_id may read it, and the reverse row is a separate decision
-- somebody else has to make.
--
-- Nothing outlives the relationship: the pair's rows go both ways when the
-- contact ends, and with the account when it is deleted. What it cannot undo
-- is a reader who has already copied it down, which is what the screen says
-- before anybody taps.
CREATE TABLE IF NOT EXISTS email_reveals (
  owner_id   TEXT NOT NULL REFERENCES accounts(id),
  viewer_id  TEXT NOT NULL REFERENCES accounts(id),
  created_at INTEGER NOT NULL,
  PRIMARY KEY (owner_id, viewer_id)
);

-- A contact request sent to an address with no account yet.
--
-- Requests must be storable whether or not the recipient exists, or the
-- interface answers a question it should not: a real request produces a
-- pending row and an imaginary one produces nothing, which tells anyone who
-- looks whether an address has an account here. Keeping both means every
-- request looks the same — and it lets someone invite a friend before that
-- friend has signed up, which is worth having on its own.
--
-- Resolved into a real contacts row the first time that address signs in.
CREATE TABLE IF NOT EXISTS pending_invites (
  requester_id TEXT NOT NULL REFERENCES accounts(id),
  identifier   TEXT NOT NULL,
  created_at   INTEGER NOT NULL,
  PRIMARY KEY (requester_id, identifier)
);

-- Money somebody gave, voluntarily, toward keeping this running. Nothing is
-- unlocked by it: an account that has never given a penny behaves identically
-- to one that has, which is what keeps this table off every read path in the
-- application.
--
-- Keyed on Ko-fi's transaction id because that is the whole idempotency story.
-- A webhook is retried on any answer they do not like, and INSERT OR IGNORE
-- against this key makes a replay a no-op without a read first.
--
-- account_id is nullable on purpose. Ko-fi's donate link carries no passthrough
-- field, so the account is matched afterwards rather than known at the time,
-- and a donation from somebody with no account here is still a donation. Losing
-- it because it could not be attributed would be the wrong trade in every
-- direction.
--
-- Matching is by address alone, and a donation paid from an address nobody has
-- signed in with is left unattributed rather than guessed at. An earlier
-- version inferred the giver from whoever had most recently tapped Support;
-- that credits the wrong person whenever two people are donating at once, and
-- nothing afterwards would ever reveal it had. An unattributed row is visible
-- and fixable; a confidently wrong one is neither.
CREATE TABLE IF NOT EXISTS donations (
  kofi_transaction_id TEXT PRIMARY KEY,
  account_id   TEXT REFERENCES accounts(id),
  -- 'email' when the payer's address is one we know, 'manual' when somebody
  -- resolved it by hand from Ko-fi's dashboard or a CSV export.
  matched_by   TEXT CHECK (matched_by IN ('email', 'manual')),
  email        TEXT,
  from_name    TEXT,
  message      TEXT,
  -- Integer cents. Ko-fi sends "3.00" as a string; it is parsed straight to
  -- cents rather than through a float, because money in a float is a defect
  -- waiting for a large enough number.
  amount_cents INTEGER NOT NULL,
  currency     TEXT NOT NULL,
  -- Ko-fi's own type field: Donation, Subscription, Shop Order, Commission.
  kind         TEXT NOT NULL,
  is_recurring INTEGER NOT NULL,
  is_public    INTEGER NOT NULL,
  received_at  INTEGER NOT NULL,
  -- Their ISO timestamp, kept verbatim and unparsed beside our own clock, so
  -- the two can be compared if they ever disagree.
  kofi_at      TEXT,
  -- The payload as JSON, minus its verification_token. This is a third party's
  -- shape, which they may extend without telling anyone, so it is kept whole
  -- rather than picked apart — a field that turns out to matter in six months
  -- is recoverable from here rather than lost for every row already written.
  --
  -- The token is stripped because it is a long-lived shared secret: storing it
  -- per row put a copy in the database, in every backup, and in the output of
  -- any query that selected this column. It has already done its work by the
  -- time a row is written.
  --
  -- Null for a row entered by hand. Ko-fi has no read API, so a delivery missed
  -- while this server was down is gone for good unless it is copied out of
  -- their dashboard — and a row typed in from there honestly has no payload.
  -- NOT NULL here would have meant inventing one, which is worse than an
  -- absence that says what it is:
  --
  --   INSERT INTO donations (kofi_transaction_id, account_id, matched_by,
  --     email, amount_cents, currency, kind, is_recurring, is_public,
  --     received_at)
  --   VALUES ('<from the dashboard>', '<acct_...>', 'manual',
  --     '<their address>', 500, 'USD', 'Donation', 0, 1, unixepoch() * 1000);
  raw          TEXT
);
CREATE INDEX IF NOT EXISTS donations_account ON donations(account_id);

-- Channels are held in memory while live; this is the record written when one
-- ends, for history and to anchor recordings.
-- initiator_id/invitee_id predate channels holding more than two people.
-- They are kept (and written with the initiator and first invitee) because
-- dropping a NOT NULL column means rebuilding the table for no gain; the
-- participants JSON is what is read.
CREATE TABLE IF NOT EXISTS channels (
  id           TEXT PRIMARY KEY,
  initiator_id TEXT NOT NULL REFERENCES accounts(id),
  invitee_id   TEXT NOT NULL REFERENCES accounts(id),
  created_at   INTEGER NOT NULL,
  ended_at     INTEGER,
  ended_reason TEXT,
  -- JSON string[]: everyone in the channel, initiator first.
  participants TEXT,
  -- What the participants called it, if they named it. Null means unnamed.
  name TEXT,
  -- The channel's description, as the Markdown source somebody typed. Null
  -- means nobody has written one.
  description TEXT,
  -- The durable projection of the live ChannelState, as JSON, rewritten on
  -- every transition that changes it. One blob rather than a column per field,
  -- because the reducer owns the shape and grows it freely; normalising would
  -- mean a migration per field for a value only ever read whole, at boot.
  -- Null only on rows that predate persistence, all of which are ended.
  state TEXT,
  -- When its last member deleted it. The row and its recordings survive the
  -- mark by a week so that a mistake is recoverable and the foreign key stays
  -- pointing at something; the sweep is what actually removes them. Distinct
  -- from ended_at, which pre-dates deletion existing.
  deleted_at INTEGER
);

-- Where to reach a person when their app is not running: one row per install
-- per account, keyed by the address Apple gave that install.
--
-- The token is stored in the clear, unlike everything in tokens and
-- otp_codes. It is an address rather than a credential — holding it lets you
-- ask Apple to show that device a notification, and nothing else. Hashing it
-- would only make it unusable, since the whole point is to send it back.
--
-- Keyed on the token rather than on (account, device) because that is what
-- makes re-registration an upsert: one phone signing in as somebody else keeps
-- the same token, and the row has to *move* to the new account. A second row
-- would push one person's conversations to another person's lock screen.
CREATE TABLE IF NOT EXISTS device_tokens (
  token        TEXT PRIMARY KEY,
  account_id   TEXT NOT NULL REFERENCES accounts(id),
  platform     TEXT NOT NULL CHECK (platform IN ('ios', 'android')),
  created_at   INTEGER NOT NULL,
  -- Refreshed on every registration, so a device that has stopped checking in
  -- is distinguishable from one that never existed.
  last_seen_at INTEGER NOT NULL,
  -- The session that registered this address, as a hash into tokens.
  --
  -- This is the only join the server has between a push address and a live
  -- socket, and it exists because POST /devices is the one request that
  -- carries both credentials at once: the bearer token in the header and the
  -- APNs token in the body. Nothing else ever sees the two together — a socket
  -- authenticates a session and knows no APNs token, and Apple's token is
  -- minted on the device.
  --
  -- What it buys is suppressing a notification per *address* rather than per
  -- person. While one session per account was enforced, "this person has a
  -- live socket" and "this phone is looking at the screen" were the same
  -- statement; with a tablet signed in they are not, and the person-level test
  -- silences the phone in somebody's pocket on the strength of a tablet in
  -- another room.
  --
  -- Null for a row written before this column existed, and for one whose
  -- session has since been revoked. Both fall back to the person-level test,
  -- which is what the server did for all of them until 2026-08-24 — see the
  -- push notifier in app.ts. Not a foreign key: the session may be revoked
  -- while the address outlives it, and the fallback is what that should mean.
  session_hash TEXT
);
CREATE INDEX IF NOT EXISTS device_tokens_account ON device_tokens(account_id);

-- The credential a watch party's follower page holds, and deliberately not a
-- row in tokens.
--
-- It cannot be a session token, and the reason that remains is the one that
-- was always sufficient: accountForToken would accept it everywhere, so a link
-- pasted into a chat would be a full credential for the account rather than
-- permission to follow one channel on one screen.
--
-- There used to be a second reason, and it is gone rather than weakened.
-- issueToken revoked every other session for the account, so minting one to
-- open a page would have signed the owner's phone out; since 2026-08-24 it
-- revokes nothing. Noted because a reader finding one reason where the file
-- promised two would reasonably wonder which had been forgotten.
--
-- So it names a channel as well as an account, and nothing outside the watch
-- socket ever looks it up. Hashed, like tokens and otp_codes and unlike the
-- guest link below: it re-enters without anybody being asked again, which is
-- what makes it a credential rather than an address.
CREATE TABLE IF NOT EXISTS watch_tokens (
  token_hash TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(id),
  -- ON DELETE CASCADE, like channel_notification_levels and unlike the guest
  -- rows below, which the sweep clears by hand. The difference is that a guest
  -- row carries a name a recording still needs at the end of a run, and this
  -- carries nothing at all once the channel is gone — so there is no ordering
  -- to get right, only a reference that must not make the sweep throw.
  channel_id TEXT NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS watch_tokens_account ON watch_tokens(account_id);

-- A capability to knock at one channel's door, and nothing more. Holding it
-- gets you as far as asking: a member who is present has to accept, and what
-- they accept is a name a stranger typed.
--
-- Stored in the clear, which is the one place this database departs from
-- hashing anything token-shaped, and the departure is the point. tokens and
-- otp_codes are credentials — holding one is being somebody — so a copy of
-- this file must not hand them over. This is an invitation to knock, and
-- storing it legibly is what lets a member share the same link twice rather
-- than mint a second thing they must remember to revoke. If that trade is ever
-- judged wrong it is one column: token becomes token_hash, minting returns the
-- only plaintext copy that will exist, and channel settings lists links rather
-- than showing them.
CREATE TABLE IF NOT EXISTS guest_links (
  token       TEXT PRIMARY KEY,
  channel_id  TEXT NOT NULL REFERENCES channels(id),
  created_by  TEXT NOT NULL REFERENCES accounts(id),
  created_at  INTEGER NOT NULL,
  -- Set when a member revokes it, when a guest admitted through it is ejected,
  -- when the channel empties of present members, and when the channel is
  -- deleted. Null means live. Revoked rows are kept rather than deleted, so
  -- settings can say a link existed and has stopped working.
  revoked_at  INTEGER,
  -- Who revoked it, when a person did. Null when the emptying rule did.
  revoked_by  TEXT REFERENCES accounts(id)
);
CREATE INDEX IF NOT EXISTS guest_links_channel ON guest_links(channel_id);

-- One admitted guest.
--
-- Written on accept and never on knock. An unanswered knock is a live
-- conversation between a page and a screen, and a process that dies mid-knock
-- leaves a page that knocks again, which is what it would do anyway. So a row
-- here means somebody was let in.
--
-- The secret is hashed, unlike the link above, because it is the opposite kind
-- of thing: it re-enters a seat without anybody being asked again. That is its
-- whole purpose — revoking a link must not strand somebody already inside —
-- and it is what makes it a credential.
CREATE TABLE IF NOT EXISTS guest_sessions (
  id           TEXT PRIMARY KEY,
  channel_id   TEXT NOT NULL REFERENCES channels(id),
  -- Which link admitted them. Ejecting a guest implicitly revokes the link
  -- they came through, since they could otherwise simply return, and this is
  -- how that revocation knows which one. Deliberately not a foreign key: a
  -- link is a row somebody may delete, and a session outlives it.
  link_token   TEXT,
  secret_hash  TEXT NOT NULL,
  display_name TEXT NOT NULL,
  -- The account behind the seat, when the page had a session to offer at the
  -- door. A guest to the channel and not to the app: this confers nothing —
  -- they are still absent from the participants list, which is the whole
  -- security model — and only says who the room is talking to.
  --
  -- Not a foreign key for the same reason link_token is not: an account may be
  -- erased, and a seat that outlives one should expire on its own clock rather
  -- than take a constraint failure with it.
  account_id   TEXT,
  admitted_at  INTEGER NOT NULL,
  admitted_by  TEXT NOT NULL REFERENCES accounts(id),
  -- Whether a member has granted the microphone. Durable, and it has to be:
  -- LiveKit is a separate process on this box, so restarting this one does not
  -- take a publish grant back. Forgetting it would bring the channel back
  -- believing a guest silent whom the room is still carrying, which is the
  -- disagreement reconcileSilence exists to catch, arriving by another route.
  may_speak    INTEGER NOT NULL DEFAULT 0,
  ejected_at   INTEGER,
  last_seen_at INTEGER NOT NULL,
  expires_at   INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS guest_sessions_channel
  ON guest_sessions(channel_id);

CREATE TABLE IF NOT EXISTS recordings (
  id           TEXT PRIMARY KEY,
  channel_id   TEXT NOT NULL REFERENCES channels(id),
  initiator_id TEXT NOT NULL,
  invitee_id   TEXT NOT NULL,
  -- JSON string[], as on channels. Membership queries go through json_each.
  participants TEXT,
  started_at   INTEGER NOT NULL,
  duration_ms  INTEGER NOT NULL,
  s3_key       TEXT NOT NULL,
  -- Flat list of every object written, in order. Superseded by stems, which
  -- says whose audio each one is; kept because it is cheap and readable.
  segment_keys TEXT,
  -- JSON { [identity]: string[] }. One isolated stem per participant, because
  -- the floor is applied when the recording is encoded and a mix cannot be
  -- un-mixed. Pausing still splits a stem into segments.
  stems TEXT,
  -- JSON Array<{ identity, fromMs, toMs }>, offsets into the *recorded* audio
  -- rather than wall clock, so paused time is already excluded. This is what
  -- the encoder gates on.
  floor_timeline TEXT,
  -- 'pending', 'ready' or 'unmixed'. The mix is made when the run ends rather
  -- than per request, so that playing and exporting are immediate; until it
  -- exists the recording is shown to nobody, which is what this column is read
  -- for. See RecordingRow.mix_state.
  mix_state TEXT,
  -- Null while the run is still capturing. The row is written when a run
  -- starts and finalized when it ends, which is what lets a run interrupted by
  -- a server restart be recovered — kept, marked failed — instead of leaving
  -- unreferenced audio in the bucket. A null here after a boot means exactly
  -- that, and the registry's restore() finalizes it.
  ended_at INTEGER,
  -- Why the run ended early, when it did not end by anyone's choice.
  failure TEXT,
  -- Set with the channel's, never on its own: a recording belongs to its
  -- channel and is deleted with it. The sweep reads this, and the objects in
  -- the bucket go at the same time.
  deleted_at INTEGER
);
CREATE INDEX IF NOT EXISTS recordings_participants
  ON recordings(initiator_id, invitee_id);

-- What this box actually carried, for the last thirty days and no longer.
--
-- Written so that claims about load stop being reasoned and start being
-- counted: the egress cap of roughly ten simultaneous recorded participants
-- has never been measured against anything, and neither has the sizing
-- argument in planning/MIGRATION.md.
--
-- Nothing reads these tables in code, deliberately. There is no endpoint, no
-- field on the wire and no screen — bin/usage runs the queries against the box
-- from outside. A number nobody can see cannot quietly start deciding things.
-- (No backticks anywhere in this schema: it is a template literal, so one ends
-- it, and the failure is 30 lines of parse errors pointing at the code after.)
--
-- No foreign key to accounts, and that is the one interesting choice here. A
-- span is evidence about a month, not a fact about a person, and it must not
-- become a reason a row elsewhere cannot be removed; deleteAccount clears
-- these explicitly instead, which is what keeps the privacy page's promise
-- that nothing identifying remains.
CREATE TABLE IF NOT EXISTS usage_spans (
  id           TEXT PRIMARY KEY,
  -- 'mic' | 'listen' | 'playback' | 'egress' | 'pair' | 'participant'
  kind         TEXT NOT NULL,
  -- Null on a channel-level span, and on 'participant' it is an identity
  -- rather than an account whenever the shared-track participant holds it.
  account_id   TEXT,
  -- The other party: on 'pair' the second person, ordered against account_id
  -- by pairKey; on 'egress' whose stem it is, where account_id is whoever
  -- started the recording. Null on other kinds. See UsageSpanRow.peer_id.
  peer_id      TEXT,
  channel_id   TEXT NOT NULL,
  -- 'egress' only: the run, which is also the recordings row id.
  recording_id TEXT,
  started_at   INTEGER NOT NULL,
  -- Null while open, exactly as recordings.ended_at is, and for the same
  -- reason: a span interrupted by a restart has to be recoverable rather than
  -- silently absent. See UsageSpanRow.
  ended_at     INTEGER,
  -- 'room' | 'state'. See UsageSpanRow.source.
  source       TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS usage_spans_account
  ON usage_spans(account_id, started_at);
CREATE INDEX IF NOT EXISTS usage_spans_kind ON usage_spans(kind, started_at);
CREATE INDEX IF NOT EXISTS usage_spans_ended ON usage_spans(ended_at);

CREATE TABLE IF NOT EXISTS usage_bytes (
  id           TEXT PRIMARY KEY,
  -- 'export' | 'playback-fetch' | 'mix-read' | 'mix-write'
  kind         TEXT NOT NULL,
  account_id   TEXT,
  recording_id TEXT,
  bytes        INTEGER NOT NULL,
  at           INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS usage_bytes_at ON usage_bytes(at);

-- What a recording says, once somebody has paid to find out.
--
-- Three tables, all hanging off one recording and dying with it: a recording
-- that has been swept must not leave text of the conversation behind, which is
-- the whole of why these carry recording_id rather than standing alone.
--
-- One transcript per recording, which the primary key enforces rather than a
-- rule somebody remembers. This is the first thing in the application that
-- costs money per tap, and a second row for the same recording would be a
-- second charge for an answer we already hold.
CREATE TABLE IF NOT EXISTS transcripts (
  -- ON DELETE CASCADE on all three of these tables, and it is load-bearing
  -- rather than tidy: the sweep really does DELETE a recordings row a week
  -- after it was marked, and with foreign keys on, a row pointing at it would
  -- refuse that delete outright — a recording nobody could finish deleting
  -- because it had once been transcribed. The cascade is the backstop, not the
  -- plan: Transcripts sweeps a recording marked deleted while the row is still
  -- there, so the provider is asked to forget its copy first.
  recording_id TEXT PRIMARY KEY REFERENCES recordings(id) ON DELETE CASCADE,
  -- 'pending' | 'ready' | 'failed'. Ready once every job has settled and at
  -- least one produced something; failed when none did.
  state        TEXT NOT NULL,
  -- Who asked, shown beside the result. Never anonymous: asking sends
  -- everybody's audio to a third party, so it is a thing one member did to a
  -- channel rather than a private read of their own recording.
  requested_by TEXT NOT NULL,
  requested_at INTEGER NOT NULL,
  completed_at INTEGER,
  failure      TEXT,
  -- Which service produced it. Stored rather than assumed, so a transcript
  -- outlives the configuration that made it.
  provider     TEXT NOT NULL,
  -- Channel-milliseconds this transcript cost, summed across its jobs, in the
  -- unit the provider bills in.
  --
  -- Written as an upper bound when the transcript is asked for — the
  -- recording's length times the number of stems, since a stem is rendered
  -- from the start of the recording and so is never longer than it — and
  -- replaced by the sum of the jobs' own measurements as they land. A job that
  -- could not be measured keeps its share of the estimate, so this is never
  -- null and never quietly under-reports: bin/usage would rather over-report a
  -- bill than under-report one.
  billed_ms    INTEGER,
  -- When somebody deleted this transcript on its own, leaving the recording.
  --
  -- A mark rather than a removal, the way a deleted recording is: swept
  -- TRANSCRIPT_DELETED_RETENTION_MS later, and unreachable from the moment it
  -- is set. A transcript deleted with its *recording* never gets one of these
  -- — it goes when the recording's own sweep takes the row.
  deleted_at   INTEGER,
  -- Whether every job in the sum was measured rather than estimated. What it
  -- is for is reading a usage report honestly — a month of estimates and a
  -- month of measurements are not the same number and should not add up as
  -- though they were.
  billed_exact INTEGER NOT NULL DEFAULT 0
);

-- One per speaker, because one stem is one job. Diarisation is asked for
-- inside each of them and never across them: the stems already know whose
-- microphone they were, and two participants are never in the same file.
--
-- Separate jobs are what make a partial failure partial. One stem the provider
-- could not read leaves the rest of the transcript standing, and is the row
-- that says so.
CREATE TABLE IF NOT EXISTS transcript_jobs (
  id           TEXT PRIMARY KEY,
  recording_id TEXT NOT NULL REFERENCES recordings(id) ON DELETE CASCADE,
  -- Whose stem. Never 'media': see MEDIA_IDENTITY.
  identity     TEXT NOT NULL,
  -- The provider's id for the job, null until it has been submitted. **This
  -- column is what makes a restart survivable**: a process that dies between
  -- submitting and storing the text comes back, finds the id, and resumes
  -- polling rather than paying to transcribe the same audio again.
  provider_id  TEXT,
  -- 'pending' | 'ready' | 'failed'
  state        TEXT NOT NULL,
  -- What language detection decided, per speaker — which is a thing per-stem
  -- jobs can answer and one multichannel job could not.
  language     TEXT,
  failure      TEXT,
  -- How much audio this job actually cost, in milliseconds.
  --
  -- Measured rather than assumed, from two sources in order of authority: what
  -- the provider says it processed, which is what they bill on, and failing
  -- that ffprobe over the file we sent, which is exact about our side of it.
  -- Null when neither could answer, and the transcript's total falls back to
  -- an estimate for that job and says so.
  billed_ms    INTEGER
);
CREATE INDEX IF NOT EXISTS transcript_jobs_recording
  ON transcript_jobs(recording_id);

-- The text itself, one row per readable line.
--
-- Lines rather than words: a line is what a person can read, tap and be taken
-- to. Word timings are what line boundaries are made of and are not otherwise
-- useful to anything on screen, so they are not kept.
--
-- **start_ms and end_ms are positions in the recording**, not offsets into a
-- stem, because each stem is rendered with its delays in place. That is what
-- lets a tapped line seek shared playback without arithmetic anywhere.
CREATE TABLE IF NOT EXISTS transcript_lines (
  id           TEXT PRIMARY KEY,
  recording_id TEXT NOT NULL REFERENCES recordings(id) ON DELETE CASCADE,
  -- Denormalised so a channel-wide search is one index scan rather than a join
  -- through recordings on every keystroke. Exactly one writer and no update
  -- path — a recording does not change channel — which is the only kind of
  -- denormalisation worth having.
  channel_id   TEXT NOT NULL,
  identity     TEXT NOT NULL,
  -- Which voice within that one stem, when the provider labelled one. Almost
  -- always a single value for a whole stem, in which case it never reaches a
  -- screen — a "(A)" beside a named participant who was alone on their
  -- microphone is two answers to a question nobody asked. A stem holding more
  -- than one is shown as "Played audio (A)" against "Played audio (B)", and
  -- transcript_voices is where somebody says who those actually were.
  speaker      TEXT,
  start_ms     INTEGER NOT NULL,
  end_ms       INTEGER NOT NULL,
  text         TEXT NOT NULL,
  confidence   REAL
);
CREATE INDEX IF NOT EXISTS transcript_lines_recording
  ON transcript_lines(recording_id, start_ms);
CREATE INDEX IF NOT EXISTS transcript_lines_channel
  ON transcript_lines(channel_id);

-- What somebody said about the voices a transcript came back with.
--
-- **A view over the lines, never an edit of them.** The provider labels each
-- stem's voices independently and is wrong about them often — two labels on
-- one person's microphone is usually a failure to attribute a "Yeah.", not a
-- second speaker in the room. So the answer is a declaration laid over the
-- text: rename a voice, collapse two onto one name, or drop one entirely,
-- with nothing in transcript_lines touched. Getting it wrong costs a tap to
-- put right rather than a second run of a paid transcription, and there is
-- exactly one way to clear a declaration, which is to delete the row.
--
-- **Only the voices somebody has said something about have rows.** Absence is
-- the default naming, which is what makes clearing a delete and means no
-- backfill was needed for the transcripts that existed before this.
--
-- The speaker column is '' rather than NULL for a stem the provider never
-- labelled, so
-- that the primary key means what it says: NULLs do not compare equal in an
-- index, and a nullable key column would let the same voice have two rows and
-- an upsert insert a third. See voiceKey in core/transcript.ts, which is the
-- same decision on the other side of the wire.
CREATE TABLE IF NOT EXISTS transcript_voices (
  recording_id TEXT NOT NULL REFERENCES recordings(id) ON DELETE CASCADE,
  identity     TEXT NOT NULL,
  speaker      TEXT NOT NULL,
  -- What to call it instead. Null when the declaration is only a removal.
  name         TEXT,
  removed      INTEGER NOT NULL DEFAULT 0,
  declared_by  TEXT NOT NULL,
  declared_at  INTEGER NOT NULL,
  PRIMARY KEY (recording_id, identity, speaker)
);

-- How loudly one channel may interrupt one person.
--
-- **Only the people who have changed it have a row.** Absence means
-- DEFAULT_NOTIFICATION_LEVEL, so the table holds the exceptions rather than a
-- row per membership, and setting the default back is a delete. That also
-- means no backfill was needed for the channels that existed before it.
--
-- Not part of the channel's state blob, though it is per channel. That blob is
-- the reducer's, is rewritten whole on every transition, and is the same for
-- everybody; this is one person's preference about a channel, is read on a
-- path the reducer never runs, and must never travel to the other members. A
-- field in the blob would be all three of those things by accident.
--
-- ON DELETE CASCADE on the channel, because a channel that has been swept is
-- one whose settings are meaningless — and the sweep in channels.ts really
-- does DELETE the row, a week after the last member marked it. No cascade is
-- needed on the account side: Accounts.erase anonymises the row in place
-- rather than deleting it, so that reference cannot dangle.
CREATE TABLE IF NOT EXISTS channel_notification_levels (
  account_id TEXT NOT NULL REFERENCES accounts(id),
  channel_id TEXT NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  level      TEXT NOT NULL CHECK (level IN ('low', 'medium', 'high')),
  set_at     INTEGER NOT NULL,
  PRIMARY KEY (account_id, channel_id)
);
`;

export type Db = DatabaseSync;

export function openDb(path: string): Db {
  const db = new DatabaseSync(path);
  db.exec('PRAGMA journal_mode = WAL');
  // Before SCHEMA, deliberately: see renameLegacyTables. Foreign keys are off
  // here (the default), which is what keeps the rename out of the enforcement
  // path; they are turned on immediately afterwards.
  renameLegacyTables(db);
  db.exec('PRAGMA foreign_keys = ON');
  // **Load-bearing for transcript search, and off by default.** A foreign key
  // cascade performs its DELETEs without firing triggers unless this is on —
  // so the sweep that removes a recording would take its transcript lines and
  // leave the search index holding every word of them. A deleted conversation
  // that is still findable by searching for it is a worse failure than a
  // missing index.
  db.exec('PRAGMA recursive_triggers = ON');
  db.exec(SCHEMA);
  addSearchIndex(db);
  migrate(db);
  return db;
}

/**
 * The full-text index over transcript lines, if this build of SQLite has one.
 *
 * External-content: the rows live in `transcript_lines` and this holds only
 * the inverted index, kept level by the two triggers below. Lines are written
 * once and never edited, so there is no update trigger and nothing that could
 * want one.
 *
 * **Optional on purpose.** FTS5 is a compile-time option, and `node:sqlite`'s
 * flags are not something to assume across a Node version — it is present on
 * the box (checked, v22.23.2) and on this laptop, and a machine without it
 * should still run the server rather than fail at boot with a syntax error in
 * a virtual table. Search falls back to a scan there, which at this scale is
 * fine: the index is an optimisation, not the feature.
 */
function addSearchIndex(db: Db): void {
  try {
    db.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS transcript_fts USING fts5(
        text, content='transcript_lines', content_rowid='rowid'
      );
      CREATE TRIGGER IF NOT EXISTS transcript_lines_ai
        AFTER INSERT ON transcript_lines BEGIN
        INSERT INTO transcript_fts(rowid, text) VALUES (new.rowid, new.text);
      END;
      CREATE TRIGGER IF NOT EXISTS transcript_lines_ad
        AFTER DELETE ON transcript_lines BEGIN
        INSERT INTO transcript_fts(transcript_fts, rowid, text)
          VALUES ('delete', old.rowid, old.text);
      END;
    `);
  } catch {
    // No FTS5 here. hasSearchIndex reports it and the query takes the other
    // path; nothing else in the server changes.
  }
}

/** Whether this database got the index above. */
export function hasSearchIndex(db: Db): boolean {
  return !!db
    .prepare(
      "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'transcript_fts'"
    )
    .get();
}

/** Whether a table of this name exists. */
function hasTable(db: Db, name: string): boolean {
  return !!db
    .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?")
    .get(name);
}

function hasColumn(db: Db, table: string, column: string): boolean {
  if (!hasTable(db, table)) return false;
  const columns = db
    .prepare(`PRAGMA table_info(${table})`)
    .all() as Array<{ name: string }>;
  return columns.some((c) => c.name === column);
}

/**
 * Sessions became channels. This renames the tables a pre-existing database
 * still calls by the old names.
 *
 * **It has to run before `SCHEMA`.** Every statement there is
 * `CREATE TABLE IF NOT EXISTS`, so against an un-renamed database it would
 * cheerfully create an empty `channels` table beside the real `sessions` one,
 * after which the rename is impossible and every existing conversation is
 * stranded where nothing will ever look for it.
 *
 * Idempotent, so reopening a database that has already been renamed — or one
 * created fresh under the new names — does nothing.
 */
function renameLegacyTables(db: Db): void {
  if (hasTable(db, 'sessions') && !hasTable(db, 'channels')) {
    db.exec('ALTER TABLE sessions RENAME TO channels');
  }
  if (
    hasColumn(db, 'recordings', 'session_id') &&
    !hasColumn(db, 'recordings', 'channel_id')
  ) {
    db.exec('ALTER TABLE recordings RENAME COLUMN session_id TO channel_id');
  }

  // SQLite rewrites a child's REFERENCES clause when the parent is renamed,
  // so `recordings` should now point at `channels`. Verified against 3.50.4,
  // but asserted rather than assumed: this is the one irreversible step in the
  // migration, and a silent failure here would surface much later as an insert
  // rejected by a foreign key naming a table that no longer exists.
  if (hasTable(db, 'recordings') && hasTable(db, 'channels')) {
    const ddl = db
      .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'recordings'")
      .get() as { sql?: string } | undefined;
    if (ddl?.sql && /REFERENCES\s+"?sessions"?/i.test(ddl.sql)) {
      throw new Error(
        'recordings still references a sessions table after the rename; ' +
          'the database needs rebuilding by hand before this server can run.'
      );
    }
  }
}

/** Additive migrations for databases created before a column existed. */
function migrate(db: Db): void {
  const columns = db
    .prepare('PRAGMA table_info(recordings)')
    .all() as Array<{ name: string }>;
  for (const column of [
    'segment_keys',
    'stems',
    'floor_timeline',
    'participants',
    'participant_names',
    'name',
    'mix_state',
  ]) {
    if (!columns.some((c) => c.name === column)) {
      db.exec(`ALTER TABLE recordings ADD COLUMN ${column} TEXT`);
    }
  }

  const channelColumns = db
    .prepare('PRAGMA table_info(channels)')
    .all() as Array<{ name: string }>;
  for (const column of ['participants', 'name', 'description', 'state']) {
    if (!channelColumns.some((c) => c.name === column)) {
      db.exec(`ALTER TABLE channels ADD COLUMN ${column} TEXT`);
    }
  }

  // Deletion is a mark and a sweep, and the mark is its own column on both
  // tables rather than a reading of `ended_at`. Channels that ended under the
  // old rule — where the last member leaving ended the channel and kept its
  // recordings — are ended and *not* deleted, and inferring one from the other
  // would have the first sweep destroy exactly the recordings that rule
  // promised to keep. Null means "not marked", and every pre-existing row
  // means it.
  for (const [table, columns] of [
    ['channels', channelColumns],
    ['recordings', db.prepare('PRAGMA table_info(recordings)').all() as Array<{ name: string }>],
  ] as const) {
    if (!columns.some((c) => c.name === 'deleted_at')) {
      db.exec(`ALTER TABLE ${table} ADD COLUMN deleted_at INTEGER`);
    }
  }

  // Recording rows written before runs were filed at start were all complete —
  // the old code inserted only finished runs — so they get the end time their
  // duration implies. Gated inside the ADD COLUMN branch, deliberately: run
  // every boot, this UPDATE would stamp a genuinely interrupted run as clean
  // before restore() could mark it failed.
  const recordingColumns = db
    .prepare('PRAGMA table_info(recordings)')
    .all() as Array<{ name: string }>;
  if (!recordingColumns.some((c) => c.name === 'ended_at')) {
    db.exec('ALTER TABLE recordings ADD COLUMN ended_at INTEGER');
    db.exec('ALTER TABLE recordings ADD COLUMN failure TEXT');
    db.exec('UPDATE recordings SET ended_at = started_at + duration_ms');
  }

  const accountColumns = db
    .prepare('PRAGMA table_info(accounts)')
    .all() as Array<{ name: string }>;
  /*
    The bio, dropped on 2026-08-31 along with the screen that showed it.

    Dropped rather than left in place and ignored, which is the choice worth
    saying out loud: what was in this column is Markdown people typed about
    themselves, and there is no second copy of it anywhere. Keeping it would
    mean holding a paragraph about somebody that nothing can show them, edit
    or delete — an unreachable field on a live account, which is exactly what
    the account-deletion path exists to make impossible. So it goes, and the
    migration is one way.

    `ALTER TABLE ... DROP COLUMN` needs SQLite 3.35, which Node 22's built-in
    is well past. Guarded on the column being there, so it runs once.
  */
  if (accountColumns.some((c) => c.name === 'bio')) {
    db.exec('ALTER TABLE accounts DROP COLUMN bio');
  }
  // Null for everyone, which is the only value that could be right: a handle
  // exists here because somebody typed it, and there is nowhere else on this
  // box one could be inferred from.
  if (!accountColumns.some((c) => c.name === 'im_whatsapp')) {
    db.exec('ALTER TABLE accounts ADD COLUMN im_whatsapp TEXT');
    db.exec('ALTER TABLE accounts ADD COLUMN im_telegram TEXT');
    db.exec('ALTER TABLE accounts ADD COLUMN im_signal TEXT');
  }
  // Left null rather than backfilled from `created_at`: an account made a year
  // ago and used this morning would read as a year idle, which is worse than
  // reading as unknown. Everyone's fills in the next time they connect.
  if (!accountColumns.some((c) => c.name === 'last_seen_at')) {
    db.exec('ALTER TABLE accounts ADD COLUMN last_seen_at INTEGER');
  }
  // Null rather than backfilled with anything, and the null is load-bearing:
  // it is the only way to say "connected from a build that did not say", which
  // is every account until the first build that sends it has spread. Guessing
  // `MIN_SUPPORTED_BUILD` here would manufacture exactly the reassurance this
  // column exists to stop being manufactured.
  if (!accountColumns.some((c) => c.name === 'last_build')) {
    db.exec('ALTER TABLE accounts ADD COLUMN last_build INTEGER');
  }
  // Left null for everyone, which is the value that means "decide from the
  // device". Backfilling it either way would be asserting something about
  // where existing accounts are that nobody has established.
  if (!accountColumns.some((c) => c.name === 'donations_allowed')) {
    db.exec('ALTER TABLE accounts ADD COLUMN donations_allowed INTEGER');
  }
  // Null for everyone, which is the value that means no panel. There is no
  // account this should be true of by default — it is turned on for one person
  // at a time, while something is being watched, and turned off after.
  if (!accountColumns.some((c) => c.name === 'debug')) {
    db.exec('ALTER TABLE accounts ADD COLUMN debug INTEGER');
  }
  // Null for every account that predates the column, and deliberately not
  // backfilled. The `pending_invites` row that would have said who invited
  // somebody is deleted the moment it resolves, so for an existing account
  // the answer is simply not recorded anywhere — and reconstructing it from
  // who they became contacts with first would credit whoever happened to be
  // earliest in a table that was never keeping score.
  if (!accountColumns.some((c) => c.name === 'invited_by')) {
    db.exec('ALTER TABLE accounts ADD COLUMN invited_by TEXT REFERENCES accounts(id)');
  }
  // Null for everyone, which is the value that means no standings. There is
  // nobody this should be true of by default: it is the only view in this
  // application that lists people who have not agreed to be listed to you.
  if (!accountColumns.some((c) => c.name === 'leaderboard')) {
    db.exec('ALTER TABLE accounts ADD COLUMN leaderboard INTEGER');
  }
  // Null for everyone, including the account that held TRANSCRIBE_IDENTIFIER
  // before this existed. Marking that one is a deliberate act with a command
  // behind it, not something a migration should infer from an env var it
  // cannot see.
  if (!accountColumns.some((c) => c.name === 'transcripts_unlimited')) {
    db.exec('ALTER TABLE accounts ADD COLUMN transcripts_unlimited INTEGER');
  }
  // Null for every existing account, which means every transcript made before
  // this column existed was free and nobody's allowance is retroactively
  // spent. That is the generous reading and it is the right one: the limit is
  // a rule about what happens next, and charging somebody for a tap that had
  // no limit on it when they made it would be a rule applied backwards.
  // Null for every account that predates the settings crossing the wire, which
  // is every account: until 2026-08-31 both of these were device-local, held in
  // the app's own storage. Nothing is migrated *out* of that storage, and it is
  // not read once a server answer arrives — a backfill would have to guess
  // which of somebody's phones was right, and the phones do not agree by
  // construction. Everybody starts at the default and sets it once more.
  if (!accountColumns.some((c) => c.name === 'appearance')) {
    db.exec('ALTER TABLE accounts ADD COLUMN appearance TEXT');
    db.exec('ALTER TABLE accounts ADD COLUMN tap_to_step_in INTEGER');
  }
  // Its own test rather than a third line in the block above, because the two
  // up there arrived together and this one did not: a database migrated by
  // that block already has `appearance`, so anything added inside it would
  // never run there. One column, one guard, is the only arrangement that
  // survives columns being added on different days.
  if (!accountColumns.some((c) => c.name === 'control_cards')) {
    db.exec('ALTER TABLE accounts ADD COLUMN control_cards INTEGER');
  }
  if (!accountColumns.some((c) => c.name === 'free_transcript_id')) {
    db.exec('ALTER TABLE accounts ADD COLUMN free_transcript_id TEXT');
    db.exec('ALTER TABLE accounts ADD COLUMN free_transcript_at INTEGER');
  }
  // The index is created *here* rather than in SCHEMA, and that is not tidiness.
  // SCHEMA runs before this function, and `CREATE TABLE IF NOT EXISTS accounts`
  // is a no-op against a database that already has the table — so an index on
  // `invited_by` declared up there runs one statement too early on every
  // existing database and fails the whole boot with `no such column`. A column
  // added by migration can only be indexed by migration.
  //
  // The walk goes downwards — everybody this account brought in, then everybody
  // they brought in — so the index is on the edge's tail.
  db.exec(
    'CREATE INDEX IF NOT EXISTS accounts_invited_by ON accounts(invited_by)'
  );

  // Null for every seat that predates it, which is right in the only sense
  // available: a seat admitted before the door could ask was admitted by
  // somebody the server never identified, and there is nothing to look them up
  // by. They keep the name they typed.
  const guestSessionColumns = db
    .prepare('PRAGMA table_info(guest_sessions)')
    .all() as Array<{ name: string }>;
  if (!guestSessionColumns.some((c) => c.name === 'account_id')) {
    db.exec('ALTER TABLE guest_sessions ADD COLUMN account_id TEXT');
  }

  // The session-scoped half of "which device is this", added 2026-08-24 when
  // several sessions per account became ordinary. Every existing row is null
  // and stays null until that session next says something or that device next
  // registers, which is one heartbeat and one launch respectively — and null
  // is the safe reading in both places that consult these: a session with no
  // build is counted as `silent` rather than modern, and an address with no
  // session falls back to the person-level in-app test.
  const tokenColumns = db
    .prepare('PRAGMA table_info(tokens)')
    .all() as Array<{ name: string }>;
  for (const column of ['last_seen_at', 'last_build']) {
    if (!tokenColumns.some((c) => c.name === column)) {
      db.exec(`ALTER TABLE tokens ADD COLUMN ${column} INTEGER`);
    }
  }

  // Which kind of client this sign-in last called from, so the build census can
  // count native installs alone.
  //
  // **NULL means native, and that is the whole design of this column.** Every
  // client already installed will never send the field, because it did not
  // exist when they were built — so the population that can be silent here is
  // exactly the population that is native, and a default of "native" leaves
  // every existing number untouched. Web says what it is; nothing else has to
  // be taught anything. See planning/WEB.md § *The census counts native only*.
  //
  // Deliberately not inferred from `last_build` being null. Absence of a build
  // is web-shaped today — production reports `silentBuilds: 0` — but it is not
  // a safe rule: every native build before 37 is silent too, those installs
  // still exist, and one of them returning would be misfiled as web and
  // dropped from the census. That number's job is to say when a shim may be
  // deleted, and misfiling it to zero would license a deletion that strands a
  // phone.
  if (!tokenColumns.some((c) => c.name === 'last_client')) {
    db.exec('ALTER TABLE tokens ADD COLUMN last_client TEXT');
  }

  const deviceColumns = db
    .prepare('PRAGMA table_info(device_tokens)')
    .all() as Array<{ name: string }>;
  if (!deviceColumns.some((c) => c.name === 'session_hash')) {
    db.exec('ALTER TABLE device_tokens ADD COLUMN session_hash TEXT');
  }

  // Backfill: every session that predates those two columns inherits its
  // account's answer, because until the same day it *was* its account's only
  // session. One session per account was enforced until 2026-08-24, so
  // `accounts.last_seen_at` and `accounts.last_build` are not an approximation
  // of the row below them — they are the same fact, written one level up.
  //
  // **Adding the columns null was not harmless, which is why this exists.**
  // The census reads MIN(last_build) over sessions with a non-null
  // `last_seen_at`, so the deploy that added them emptied it: /healthz went
  // from `oldestBuild: 56` to `oldestBuild: null` with nine unstamped rows
  // behind it. Null is loud and nobody raises a floor on it. What is not loud
  // is the recovery — sessions stamp themselves as their clients reconnect, so
  // for as long as that takes `oldestBuild` is the minimum over whichever
  // phones have opened the app since, which reads like a measurement and is
  // biased upwards. Upwards is the direction that strands installs.
  //
  // And an unstamped session is in neither number: `silentBuilds` counts
  // sessions *present in the window that declined to say*, so the guard rail
  // built to stop `oldestBuild` being trusted while anything is unaccounted
  // for reads zero throughout. A backfill is the only thing that closes that,
  // because it is the only thing that can speak for a phone that has not
  // opened the app yet.
  //
  // Idempotent by the null test rather than by a version marker, and it stays
  // correct if it runs again later: a session that has spoken since has a
  // stamp and is skipped, and one that never has is still best described by
  // the account it belongs to. Accounts that have never held a socket carry
  // null themselves, so their sessions stay null and stay out of the census,
  // which is what they were before this ran.
  db.exec(`UPDATE tokens
              SET last_seen_at = (
                    SELECT a.last_seen_at FROM accounts a WHERE a.id = tokens.account_id
                  ),
                  last_build = (
                    SELECT a.last_build FROM accounts a WHERE a.id = tokens.account_id
                  )
            WHERE last_seen_at IS NULL`);

  // Channels from before persistence whose ended_at is null are ghosts: the
  // old server held live channels in memory only, so a null here means the
  // process died with the channel in it, not that the channel is live.
  // Resurrecting one would put a roster nobody remembers back on their home
  // screens. Live channels always carry a state blob — create() writes it —
  // so "no blob" is what distinguishes a ghost, and makes this idempotent.
  db.exec(`UPDATE channels SET ended_at = created_at
           WHERE ended_at IS NULL AND state IS NULL`);

  // Backfill: every row written before the column existed was a two-party
  // channel, so its roster is exactly the legacy columns. Runs before any
  // query, which is what lets membership checks read participants alone.
  db.exec(`UPDATE channels SET participants = json_array(initiator_id, invitee_id)
           WHERE participants IS NULL`);
  db.exec(`UPDATE recordings SET participants = json_array(initiator_id, invitee_id)
           WHERE participants IS NULL`);

  // Every recording that existed before mixes did has no mix and is not going
  // to grow one on its own. 'unmixed' rather than null because null is what a
  // row still capturing holds, and rather than 'pending' because pending means
  // invisible — backfilling that way would hide the whole history behind a
  // queue of work nobody asked for. They export by encoding on demand, exactly
  // as they always have, and the first export or playback of one stores the
  // mix it made.
  //
  // After the ended_at block above, which is what creates that column on a
  // database old enough not to have it. Safe to run every boot: a live run's
  // ended_at is null, and a finished run always has its state set by fileRun.
  db.exec(`UPDATE recordings SET mix_state = 'unmixed'
           WHERE mix_state IS NULL AND ended_at IS NOT NULL`);
}

export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export function newId(prefix: string): string {
  return `${prefix}_${randomBytes(9).toString('base64url')}`;
}

/**
 * Whether two hashes match, without leaking where they first differ.
 *
 * Here rather than in whichever module needed it first, because there are now
 * two — a sign-in code and a guest's reconnection secret — and a comparison
 * that is only timing-safe in one of them is the kind of asymmetry nobody
 * notices until it is quoted back at them. Anything hashed by `sha256` above
 * is compared by this.
 */
export function hashesEqual(x: string, y: string): boolean {
  const a = Buffer.from(x);
  const b = Buffer.from(y);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * SQLITE_CONSTRAINT_PRIMARYKEY — the row's primary key is already taken.
 *
 * The extended result code is the only reliable discriminator. SQLite reports
 * *every* uniqueness failure with the message "UNIQUE constraint failed: …",
 * so a primary-key collision and a genuine duplicate (a second signup on one
 * email address) are indistinguishable by text. They differ only here:
 * SQLITE_CONSTRAINT_UNIQUE is 2067 and must never be retried, because a fresh
 * key does nothing about the column that actually clashed.
 */
const SQLITE_CONSTRAINT_PRIMARYKEY = 1555;

function isPrimaryKeyCollision(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { errcode?: unknown }).errcode === SQLITE_CONSTRAINT_PRIMARYKEY
  );
}

/**
 * How many keys to try before giving up.
 *
 * A generated key carries 72 bits, so one collision is already beyond
 * plausible and five in a row cannot happen by chance. The cap exists so that
 * a mistake which makes collisions *systematic* — a duplicated RNG seed after
 * a VM snapshot, a mint function that stops varying — fails loudly in
 * milliseconds instead of spinning forever.
 */
const KEY_ATTEMPTS = 5;

/**
 * Inserts a row whose primary key is randomly generated, minting a new key and
 * trying again if that key is somehow already present. Returns the key that
 * succeeded.
 *
 * `insert` must do the insert and nothing else. Anything the caller does with
 * the new key — reading the row back, resolving invitations — belongs after
 * this returns, or a retry would run it more than once.
 *
 * Only a primary-key collision is retried. Every other failure, including a
 * uniqueness violation on some other column and any foreign-key error,
 * propagates unchanged on the first attempt.
 */
export function insertWithUniqueKey<T>(
  mint: () => T,
  insert: (key: T) => void
): T {
  for (let attempt = 1; ; attempt += 1) {
    const key = mint();
    try {
      insert(key);
      return key;
    } catch (error) {
      if (attempt >= KEY_ATTEMPTS || !isPrimaryKeyCollision(error)) throw error;
    }
  }
}

/** Canonical ordering so a pair has one row whichever way round it is asked. */
export function pairKey(x: string, y: string): [string, string] {
  return x < y ? [x, y] : [y, x];
}
