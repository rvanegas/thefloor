export type UserId = string;

/**
 * A guest's identity: `guest_...`, minted by the server, never an account id.
 *
 * The same type as `UserId` on purpose rather than by omission. A guest id
 * appears wherever an identity does — the floor's holder, `selfMuted`, a
 * recording's stems — and giving it a nominal type would mean widening every
 * one of those to a union, which is a large edit in service of a distinction
 * the rules already make by asking `isParticipant`. What separates a guest
 * from a member is which list they are in, and that is checkable at runtime;
 * see core/guests.ts.
 */
export type GuestId = string;

/**
 * Somebody in the room with no account, admitted by a member.
 *
 * Held beside `participants` rather than in it, which is the decision the rest
 * of the guest design follows from: every guard is written in terms of
 * `isParticipant`, so a guest is refused everything by construction and the
 * few things they *may* do are granted one at a time, in writing.
 *
 * Membership of `ChannelState.guests` means present. A guest who steps out,
 * whose grace period runs out, or who is ejected is removed from it — their
 * seat outlives that in the database, which is what lets them come back.
 */
export interface Guest {
  id: GuestId;
  /** What they typed at the door, or the `Anon <n>` they were given. */
  name: string;
  admittedAt: number;
  /**
   * Whether a member has granted them the microphone. False until one does,
   * and enforced on the media plane by the publish grant rather than here —
   * this is the record of what was granted, not the grant.
   */
  maySpeak: boolean;
  /**
   * Whether they have asked to speak, and what came of it.
   *
   * `'refused'` is kept rather than collapsed back to `'none'` because the two
   * are different things to be told: one is a question nobody has answered and
   * the other is a question that was answered no. A page that showed the same
   * thing for both would leave somebody waiting for a reply they have already
   * had.
   *
   * Reset to `'none'` by a grant, so that withdrawing the microphone later
   * leaves them able to ask again rather than reading as refused.
   */
  request: 'none' | 'asking' | 'refused';
}

/**
 * Somebody at the door, waiting for a member to answer.
 *
 * Volatile, like `present`: a knock is a live conversation between a page and
 * whoever is looking at the channel, and a process that dies mid-knock leaves
 * a page that knocks again. Held in the reducer so that every member sees the
 * same queue and one answer settles it.
 */
export interface Knock {
  /** Minted by the server, as `runId` and a clip's id are. */
  id: string;
  name: string;
  at: number;
}

export interface FloorState {
  /** Who holds the floor right now, or null if nobody does. */
  holder: UserId | null;
  /** When the current claim started. Null iff `holder` is null. */
  claimedAt: number | null;
  /** Who made the most recent claim, whether or not it is still active. */
  /**
   * When each user last claimed. The claim delay is derived from the ordering
   * this gives, so there is nothing else to keep in step with it.
   *
   * Absent means never claimed, which counts as having spoken longest ago —
   * so anyone who has not taken a turn is always among those who may claim
   * immediately.
   */
  lastClaimedAt: Record<UserId, number>;
  /** When the most recent claim ended. Null while a claim is active. */
  lastReleasedAt: number | null;
}

/**
 * There is no 'stopped'. A stopped run is simply over, and the channel returns
 * to idle so another can begin — which is what makes several recordings in one
 * channel possible. What was captured is described by `lastRecording`, and the
 * recording itself is by then a row of its own.
 *
 * Dropping the state rather than keeping it as a transient is deliberate: it
 * makes "`runId` is non-null exactly while a run is in progress" total, and it
 * made the compiler point at every place that assumed otherwise.
 */
export type RecordingStatus = 'idle' | 'recording' | 'paused';

export interface RecordingState {
  status: RecordingStatus;
  /**
   * This run's id, and the id of the row it will be filed as. Non-null
   * exactly while a run is in progress.
   *
   * Minted by the server rather than the reducer, which has no business
   * generating identifiers, and arrives on the action the way a track does.
   */
  runId: string | null;
  /** When this run started. Survives pause/resume. */
  startedAt: number | null;
  /** Recorded milliseconds accumulated across previous run segments. */
  accumulatedMs: number;
  /** When the current run segment began; null unless status is 'recording'. */
  segmentStartedAt: number | null;
  /**
   * Why capture stopped, when it stopped for a reason nobody asked for.
   *
   * Recording is the one feature where the interface makes a promise about the
   * world rather than about itself — a red dot saying audio is being kept. If
   * capture is not actually running, saying so is not a nicety; someone may be
   * speaking on the strength of that indicator.
   */
  failure: string | null;
}

/**
 * A recording run that is over, kept so the channel can say what it captured.
 *
 * Only the most recent one: the rest are rows in the database and reachable
 * from the home screen, so holding a history here would be a second copy of
 * something already durable.
 */
export interface FinishedRun {
  /** The recording's id, so a client could link straight to it. */
  runId: string;
  startedAt: number;
  endedAt: number;
  durationMs: number;
  /** Set when the run ended for a reason nobody asked for. */
  failure: string | null;
}

/** A file one party supplied for both to listen to. */
export interface PlaybackTrack {
  id: string;
  /** What to call it on screen. Taken from the uploaded file's name. */
  title: string;
  durationMs: number;
}

/**
 * What one person put on the channel's clipboard for the others to take.
 *
 * A channel has *a* clipboard, exactly as a device does: pasting replaces
 * whatever was there. That is the whole of the model, and it is why there is
 * no list, no ordering and nothing to delete individually.
 *
 * The content travels in the state rather than being fetched when somebody
 * copies, which is what MAX_CLIP_LENGTH is sized for. Copying is then a local
 * call that cannot fail for any reason except the device clipboard refusing.
 */
export interface Clip {
  /**
   * Minted by the server, never by the client — the same rule as `runId`.
   *
   * It exists so that a replacement and the thing it replaced are
   * distinguishable, which a screen mid-render otherwise cannot tell.
   */
  id: string;
  authorId: UserId;
  pastedAt: number;
  /**
   * What kind of content this is.
   *
   * One member today, and likely for good: the image half was declined in
   * DECISIONS.md § *The clipboard stays text, and the image half is dropped
   * rather than deferred*. The discriminator stays anyway, because it costs
   * nothing and it is the honest shape of a state that has a kind. If images
   * are ever reconsidered, no reader of this type has to learn that the old
   * shape meant text. An image will not carry
   * its bytes in `text`; it will carry a key and be fetched, for the reason
   * this one is not.
   */
  kind: 'text';
  text: string;
}

export type PlaybackStatus = 'idle' | 'playing' | 'paused';

export interface PlaybackState {
  /** The loaded track, or null when there is none. Null iff status is 'idle'. */
  track: PlaybackTrack | null;
  status: PlaybackStatus;
  /** Position banked at the last transition, in ms into the track. */
  positionMs: number;
  /** When the current run began; null unless status is 'playing'. */
  startedAt: number | null;
  /**
   * Shared, 0..1, applied by the server as it publishes.
   *
   * Shared rather than per-listener because it is part of what the channel
   * sounded like: it is applied to the samples before they are published and
   * encoded, so it reaches both parties and the recording alike. A volume each
   * party set for themselves would be their device's business, invisible here.
   */
  volume: number;
  /**
   * Why playback stopped, when it stopped for a reason nobody asked for.
   *
   * Same reasoning as RecordingState.failure: the interface says audio is
   * playing, and silence that contradicts it needs an explanation rather than
   * leaving the pair to wonder which of them broke it.
   */
  failure: string | null;
}

export interface ChannelState {
  id: string;
  /**
   * The LiveKit room this channel's audio flows through. `room` is the media
   * plane's word for a media thing and never appears in the interface, which
   * only ever says channel.
   *
   * It is the channel id for everything made since conversations stopped
   * moving between channels, and the field could in principle go. It does not,
   * because rows written while they did move are still on disk: a destination
   * inherited this from the channel people walked out of, so that the room name
   * never changed under a live connection, and the channel left behind took a
   * fresh one. Restoring either as its own id would put whoever walks in now
   * into a room somebody else is still holding tokens for.
   */
  mediaRoom: string;
  /**
   * What the participants call this channel, or null when nobody has named
   * it. A name is never required: display falls back to `describeChannel`
   * over the roster.
   *
   * The two are not the same kind of thing, though, and the interface says so.
   * A name is one string every member reads and can therefore say to another
   * member. The fallback is a *description*, written from one viewer's side —
   * you see "Dana Chu", she sees your name — so it is rendered in muted italic
   * rather than dressed as a name that everybody shares.
   */
  name: string | null;
  /**
   * A description of what the channel is for, as Markdown, or null when nobody
   * has written one.
   *
   * Stored as its source rather than as anything parsed: the markup is what a
   * person typed and what they will see when they edit it again, and rendering
   * is the client's business. Only inline formatting is meaningful — this sits
   * in a header, not in a document.
   */
  description: string | null;
  /** The user who created the channel. */
  initiator: UserId;
  /**
   * Everyone who belongs to this channel — the initiator first, then the rest
   * in the order they were invited. Grows on INVITE and shrinks only on
   * LEAVE_CHANNEL. Capped at MAX_CHANNEL_PARTICIPANTS.
   *
   * Membership is not presence. Stepping out empties your place in `present`
   * and leaves this untouched; only leaving the channel outright removes you
   * from here, and the channel ends when the last person does.
   */
  participants: UserId[];
  /**
   * Who invited each participant. Absent for the initiator. This is what an
   * invitation shows as its sender — "X is waiting in a channel" should name
   * whoever actually asked, not whoever happened to create the channel.
   */
  invitedBy: Record<UserId, UserId>;
  createdAt: number;
  /**
   * The last time anybody entered or left the channel — set on creation, on
   * every entry, and again when somebody steps out, so it freezes at the
   * moment a channel emptied.
   *
   * It says nothing about a channel that is occupied now, and this comment
   * used to claim that it did — that it "reads as now for one still occupied"
   * — which nothing here has ever done. There is no write between an entry and
   * an exit, so an hour of conversation moves it not at all. Whoever orders on
   * it must ask about occupancy separately; `RejoinableView.presentCount`
   * carries that, and `orderChannels` in the app is where the two are put
   * together.
   *
   * Existing because `createdAt` is no use for ordering once channels are
   * permanent: a channel opened months ago and used every day would sink to
   * the bottom of the list under whatever was opened most recently and
   * abandoned.
   */
  lastActiveAt: number;
  status: 'active' | 'ended';
  /**
   * When the last member left, or null while the channel exists. There is
   * exactly one way a channel ends, so nothing records a reason.
   */
  endedAt: number | null;
  /**
   * Users currently in the channel — able to hear and be heard. A subset of
   * `participants`, and the thing stepping out changes.
   */
  present: UserId[];
  /**
   * Users who have entered at least once. What distinguishes a channel
   * somebody has opened from one they were merely added to, which is how an
   * invitation is expressed now that there is no separate invite object.
   */
  everPresent: UserId[];
  /**
   * Everybody in the room without an account, by id.
   *
   * Volatile — it describes who is here, not what the channel is, and the
   * durable half is the `guest_sessions` table. A restart brings the channel
   * back with nobody in it, guests included, and their pages reconnect on
   * their own with the secret each was given.
   */
  guests: Record<GuestId, Guest>;
  /**
   * Who is at the door, oldest first. Volatile, and empty almost always.
   */
  knocks: Knock[];
  floor: FloorState;
  /**
   * Keyed by anybody in the room, guests included. A guest's own mute is
   * theirs exactly as a member's is: the publish grant decides whether they
   * *may* speak, and this decides whether they are.
   */
  selfMuted: Record<UserId, boolean>;
  recording: RecordingState;
  /** The most recent run that has finished, or null if none has. */
  lastRecording: FinishedRun | null;
  playback: PlaybackState;
  /** What is on the channel's clipboard, or null when nothing is. */
  clip: Clip | null;
  /**
   * When each present user's last connection dropped. Absent means connected.
   *
   * Connectivity and presence are deliberately separate. A socket that drops
   * and returns changes nothing about who is in the channel; only staying gone
   * past DISCONNECT_GRACE_MS removes anyone. Without that separation a moment's
   * bad signal reads as leaving, and — worse — a socket dying after its
   * replacement has already connected can evict someone who is demonstrably
   * back.
   */
  /**
   * Everyone whose presence expired rather than being given up.
   *
   * A departure somebody chose and a connection that ran out of grace leave
   * the same absence behind, and the roster used to describe them with the
   * same words. This is the difference, and it is one bit because that is all
   * the difference there is: *how long* is `idleMs`, the same clock either
   * way, and how long it stays worth saying is WAITING_WINDOW_MS. Read through
   * `isWaiting`, which applies the window; membership here alone outlives it.
   *
   * Volatile, like `present` and `disconnectedAt` and for the same reason: it
   * describes a process rather than a channel, and a restart that dropped
   * everybody's socket is not evidence that any of them were waiting for
   * anything.
   */
  waiting: UserId[];
  disconnectedAt: Partial<Record<UserId, number>>;
  /**
   * The last evidence that each user was in this channel — refreshed by
   * STILL_HERE while they are here, and stamped a final time on the way out by
   * every route out there is.
   *
   * **It records an observation, not an event**, and that distinction is the
   * whole design. It used to be written only by `stepOut`, which made it a
   * claim about a departure — so it could answer only for people who had left
   * deliberately, and it went badly wrong for everyone else. A user present
   * when the process died had no departure to stamp, and if they had stepped
   * out *earlier in the channel's life* the durable projection still carried
   * that old moment, which a restart then un-gated: the screen reported
   * somebody who had been talking a second ago as having left three days
   * earlier. Evidence cannot fail that way. An older observation is only ever
   * replaced by a newer one, and no reading of it depends on presence having
   * been dropped for the right reason.
   *
   * What it answers is "are you there", which is a question a force-quit, a
   * dead battery and a deploy all answer the same way: nothing has been heard
   * since. That the last thing heard was a heartbeat rather than a goodbye is
   * not a difference anybody on the other end can act on.
   *
   * Absent means nothing has ever been heard from them here — they have never
   * been present. Nothing is invented for a restart: the stamp a restart
   * leaves behind is the last heartbeat before it, which was true when it was
   * written and stays true.
   *
   * Durable, unlike `present` and `disconnectedAt`. When somebody was last in
   * a channel is a fact about the channel rather than about the process
   * serving it. The server persists it at minute resolution — see
   * `durableOf` — so a heartbeating conversation does not rewrite a row every
   * five seconds to move a number nobody can see change.
   */
  lastPresentAt: Partial<Record<UserId, number>>;
}

export type ChannelAction =
  | { type: 'ENTER'; userId: UserId }
  /**
   * Stop being present: audio unsubscribed, place in `present` given up,
   * membership untouched. Named for its button rather than as LEAVE, because
   * an action still called LEAVE would let every existing call site keep
   * compiling while quietly meaning something far more destructive.
   */
  | { type: 'STEP_OUT'; userId: UserId }
  /**
   * Asks `inviteeId` in. Any current participant may; whether the two are
   * contacts is the server's to check, contacts being a server-side concern
   * the reducer knows nothing about.
   *
   * Adds a participant, whether or not the channel has a name. It did not
   * always: an unnamed channel used to refuse to widen, parking the invitation
   * until the invitee arrived and then moving everybody to the unnamed channel
   * for the wider set. That left every recording behind on a channel nobody was
   * looking at any more, which people reported as their recordings having
   * disappeared. See planning/DECISIONS.md.
   */
  | { type: 'INVITE'; userId: UserId; inviteeId: UserId }
  /**
   * Destroy the channel and everything recorded in it. Only its last member
   * may, there being nobody left to disagree — see `canDeleteChannel`.
   *
   * The rows are marked rather than removed: `recordings.channel_id` is a real
   * foreign key, and a sweep a week later is what actually deletes them and
   * the objects they name. That week is the whole recovery story, and it is
   * only reachable by hand.
   */
  | { type: 'DELETE_CHANNEL'; userId: UserId }
  /**
   * Give up membership: removed from the roster, and the channel disappears
   * from this user's Home. Implies stepping out, necessarily — `present` must
   * never hold someone who is not a participant.
   *
   * Refused to the last member, who has `DELETE_CHANNEL` instead: with
   * recordings belonging to the channel, that tap destroys them, and an action
   * that means "see you later" for everyone else must not quietly mean that.
   *
   * When the last member leaves, the channel ends. That is the only way a
   * channel ends; nobody can destroy one that other people still belong to.
   */
  | { type: 'LEAVE_CHANNEL'; userId: UserId }
  /**
   * Names or renames the channel. Any participant may, at any time — a name
   * is shared furniture, like the track, and carries no floor restriction.
   * An empty or whitespace name clears it back to the roster fallback.
   */
  | { type: 'SET_NAME'; userId: UserId; name: string }
  /**
   * Writes or rewrites the description. Any participant may, like the name:
   * both are shared furniture rather than anybody's property.
   *
   * An empty or whitespace-only value clears it.
   */
  | { type: 'SET_DESCRIPTION'; userId: UserId; description: string }
  | { type: 'CLAIM_FLOOR'; userId: UserId }
  | { type: 'RELEASE_FLOOR'; userId: UserId }
  | { type: 'SET_SELF_MUTE'; userId: UserId; muted: boolean }
  /** `runId` is minted by the server; a client cannot name one. */
  | { type: 'START_RECORDING'; userId: UserId; runId: string }
  | { type: 'PAUSE_RECORDING'; userId: UserId }
  | { type: 'RESUME_RECORDING'; userId: UserId }
  | { type: 'STOP_RECORDING'; userId: UserId }
  /**
   * Capture could not be started or kept running. Not a user action — the
   * media plane reports it — so it carries no userId and no guard.
   */
  | { type: 'RECORDING_FAILED'; reason: string }
  /**
   * Shared playback. All of these are gated by `canControlPlayback`, which
   * hands the floor-holder exclusive control while a claim is active — a claim
   * is about governing what is heard, and this is part of what is heard.
   */
  | { type: 'SET_TRACK'; userId: UserId; track: PlaybackTrack }
  | { type: 'CLEAR_TRACK'; userId: UserId }
  | { type: 'PLAY'; userId: UserId }
  | { type: 'PAUSE'; userId: UserId }
  | { type: 'SEEK'; userId: UserId; positionMs: number }
  | { type: 'SET_VOLUME'; userId: UserId; volume: number }
  /** Reported by the media plane, like RECORDING_FAILED: no actor, no guard. */
  | { type: 'PLAYBACK_FAILED'; reason: string }
  /**
   * Puts something on the channel's clipboard, replacing whatever was there.
   *
   * The whole `Clip` arrives assembled because the server mints its id and
   * stamps its time, as it does for `START_RECORDING`'s `runId`: the wire
   * carries the text and nothing else, and a client naming its own id would
   * be naming something no one else has agreed to.
   *
   * Not gated by the floor, unlike playback. A claim governs what is heard,
   * and this is silent.
   */
  | { type: 'PASTE_CLIP'; userId: UserId; clip: Clip }
  /** Empties the channel's clipboard. */
  | { type: 'CLEAR_CLIP'; userId: UserId }
  /**
   * Somebody with a link is at the door. Raised by the server when a knock
   * arrives over HTTP, so that every member's screen shows the same queue.
   *
   * Carries the whole `Knock` assembled, for the reason `PASTE_CLIP` carries a
   * whole `Clip`: the id and the time are the server's to mint.
   */
  | { type: 'KNOCKED'; knock: Knock }
  /**
   * A member answers. Removing the knock is all this does — admitting is the
   * server's next step, since a guest's id and secret are minted rather than
   * decided, and a rejection has nothing further to do.
   */
  | { type: 'ANSWER_KNOCK'; userId: UserId; knockId: string; accept: boolean }
  /**
   * A guest is in the room: on admission, and again whenever their page
   * reconnects with the secret it was given. Raised by the server, which is
   * the only thing that can check either.
   *
   * Idempotent by construction — the guest is keyed by id, so a reconnection
   * replaces the entry rather than making a second one. `maySpeak` arrives
   * with it because the answer outlives this process and the row is what
   * remembers it.
   */
  | { type: 'GUEST_ENTERED'; guest: Guest }
  /**
   * A guest is out of the room, for a reason nobody has to distinguish here:
   * ejected by a member, expired with their connection, or gone with the last
   * member. A guest leaving of their own accord sends `STEP_OUT` instead, like
   * anybody else.
   */
  | { type: 'GUEST_GONE'; guestId: GuestId }
  /**
   * A guest asks for the microphone.
   *
   * The one thing a guest may do that is addressed to the members rather than
   * to the room. It changes nothing about what they can do — only a member's
   * grant does that — and exists so the asking has somewhere to appear other
   * than a person talking into a channel that cannot hear them.
   */
  | { type: 'REQUEST_SPEECH'; userId: UserId }
  /**
   * A member grants or withdraws a guest's microphone.
   *
   * The state is what the interface reads; the media plane is told separately
   * by the server, which holds the only thing that can actually make somebody
   * audible. Withdrawing is one tap and does not eject: a guest who is a
   * problem stops being audible without being thrown out mid-sentence.
   */
  | { type: 'SET_GUEST_SPEECH'; userId: UserId; guestId: GuestId; maySpeak: boolean }
  /**
   * A member removes a guest. Distinct from withdrawing the microphone, and
   * the difference is that this closes the door they came through — see
   * `Guests.eject`, which revokes the link with them.
   */
  | { type: 'EJECT_GUEST'; userId: UserId; guestId: GuestId }
  /**
   * Transport, not intent: reported by whatever holds the connection rather
   * than performed by anyone. Neither changes presence directly — DISCONNECTED
   * starts the grace clock and CONNECTED cancels it.
   */
  | { type: 'CONNECTED'; userId: UserId }
  | { type: 'DISCONNECTED'; userId: UserId }
  /**
   * Transport again, and the least eventful thing in this union: something was
   * heard from somebody who is present. It changes no rule and enables no
   * control — it moves `lastPresentAt` and nothing else.
   *
   * Reported per channel rather than per person, because presence is per
   * channel: a heartbeat from a socket watching two channels is evidence about
   * whichever of them its owner is actually in, and the reducer's own
   * `isPresent` guard is what draws that line. Merely watching a channel is
   * not being in it, so a spectator's heartbeat stamps nothing — otherwise a
   * departure would be overwritten by the departed person's own screen.
   */
  | { type: 'STILL_HERE'; userId: UserId }
  /**
   * The grace period ran out: the same departure a tap makes, minus the
   * intent. Issued by `TICK` and by nothing else — it is deliberately absent
   * from the server's client-action allowlist.
   *
   * It exists because one rule now distinguishes the two. Stepping out clears
   * your self-mute; losing your connection must not, or a phone that dropped
   * out for a minute would come back with a live microphone its owner had
   * deliberately closed. The reconnect path re-enters by itself, so nobody
   * would be asked first.
   */
  | { type: 'DISCONNECT_EXPIRED'; userId: UserId }
  /**
   * Advances time-driven transitions: floor expiry, a track reaching its end,
   * and a dropped connection outlasting the grace period. Nothing here ends a
   * channel — only its last member leaving does that.
   */
  | { type: 'TICK' };
