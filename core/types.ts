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
 * Somebody holding a seat in a channel they are not a member of.
 *
 * **Not "somebody with no account"**, which is what this said until
 * 2026-09-16 and what `GLOSSARY.md` said with it. A seat may carry an account
 * — see `accountId` — and since the three asks came apart it may carry a
 * *contact of somebody in the room* and still be a seat. Having an account
 * and belonging to a channel are two facts, and this type is about the second
 * one only.
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
/**
 * A seat somebody has been offered and not yet taken up.
 *
 * **Deliberately smaller than `Guest`**, and the difference is what has not
 * happened. There is no `maySpeak` — nobody grants a microphone to somebody
 * who is not here; no `request`, no `asks`, no `invites` — the three asks are
 * put to a guest in the room; no `admittedAt`, the seat having admitted
 * nobody. What is left is who was asked, by whom, and until when.
 *
 * `id` is the `guest_sessions` row's id, which is the id the seat will carry
 * if it is taken up — so `GUEST_ENTERED` can convert rather than add, and the
 * ceiling never counts one person twice.
 */
export interface InvitedGuest {
  id: GuestId;
  /** The account's display name, an invitation only reaching a contact. */
  name: string;
  /**
   * The account behind the offer, which is never absent here.
   *
   * A guest *link* may reach anybody, which is why `Guest.accountId` is
   * optional; an invitation is held to the test `INVITE` is held to and can
   * only be sent to a contact. So this is the one place where the account is
   * the whole of the identity.
   */
  accountId: UserId;
  /** The member who asked them, for the row that says so. */
  invitedBy: UserId;
  invitedAt: number;
  /**
   * When the offer stops counting against the room's forty.
   *
   * **Read rather than swept**, which is what keeps this out of the reducer's
   * way: `core/` has no clock, every count here takes `now`, and an expiry
   * that has passed is simply not counted. The alternative — a timer raising
   * a prune action — leaves the ceiling held by ghosts on the day it does not
   * fire. The server still drops the entry when it next writes one, so the
   * map does not grow without bound.
   */
  expiresAt: number;
}

export interface Guest {
  id: GuestId;
  /**
   * Their account's display name if they were signed in when they knocked,
   * otherwise what they typed at the door, otherwise the `Guest <n>` they were
   * given. Renameable at any time by whoever holds the seat, which is the only
   * thing that changes it after admission.
   */
  name: string;
  /**
   * The account behind the seat, when the page had a session to offer.
   *
   * **A guest to the channel, not a guest to the app.** Being known confers
   * nothing: they are still absent from `participants`, so every guard written
   * in terms of `isParticipant` refuses them exactly as before. What it changes
   * is what the room calls them, and — since there is somebody to become a
   * contact of — whether the ask below can be answered in one tap.
   *
   * Optional on the wire, like `asks` and like `guests` itself: a client that
   * knows about this will meet a server that does not.
   */
  accountId?: UserId;
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
  /**
   * Which members have asked to keep them as a contact, and what came of each.
   *
   * Being in a channel together is permission to ask somebody to be a contact
   * — the rule `POST /contacts/:id/request` already enforces between members —
   * and this is that rule reaching the one person in the room it could not
   * name, a guest having no account id to address. Keyed by the asker, because
   * two members may each ask and each is owed their own answer.
   *
   * `'refused'` is kept apart from absence for the same reason it is on
   * `request` above: a question answered no is a different thing to be told
   * than one nobody has answered.
   *
   * **`'accepted'` exists since 2026-09-16, and its existence is the whole of
   * this change.** It used to be impossible: accepting wrote the contact *and*
   * the membership in one breath, so the guest left `guests` and the card was
   * gone rather than relabelled. Being somebody's contact and belonging to
   * their channel are now two acts, and this is the state between them — a
   * seat held by somebody the asker knows. The acceptance is still not a
   * reducer action, needing an account, which core has never heard of; the
   * server writes this value the way it writes `accountId`.
   *
   * Optional for the wire's sake; read as `guest.asks ?? {}`.
   */
  asks?: Record<UserId, 'asking' | 'refused' | 'accepted'>;
  /**
   * Which members have asked them to make an account here, and what came of it.
   *
   * **The weaker ask, and the reason it is a second map rather than a second
   * state on `asks`.** A member may want somebody on The Floor without asking
   * to be their contact and without asking them into this channel — an
   * arrival is worth something on its own, and pricing it at a relationship
   * is what the single ask was doing. The two are answered separately, so a
   * guest may hold one, both, or neither from the same member.
   *
   * Offered only against a seat with no `accountId`: an identified seat has
   * answered this already, and a control that asked again would be putting a
   * question that has been settled.
   *
   * There is no `'accepted'` here, and the asymmetry with `asks` above is not
   * an oversight. What acceptance produces is `accountId`, which every reader
   * can see — so a state saying *they said yes* would be a second way to know
   * one thing, and the two could disagree. The map holds the question; the
   * account is the answer.
   *
   * Optional for the wire's sake; read as `guest.invites ?? {}`.
   */
  invites?: Record<UserId, 'asking' | 'refused'>;
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
  /**
   * Whether this run began by itself rather than because somebody pressed
   * Record.
   *
   * **It is on the state rather than only on the action because the people who
   * need the answer are not the one who acted.** Both starts commit the same
   * `START_RECORDING`, so a snapshot is all any device has to go on, and what
   * reads this is `useRecordingChime` — the audible notice that a run has
   * begun, which a hand-started run gets and an automatic one does not. See
   * `decisions/2026-09-17-a-recording-somebody-started-says-so-out-loud.md`.
   *
   * False while idle, and set at the start of every run, so it can never
   * describe the run before last.
   */
  automatic: boolean;
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
  /**
   * The recording this track was loaded from, when it was one rather than an
   * uploaded file.
   *
   * Here so a screen can tell whether what is playing *is* a given recording,
   * which `id` cannot answer — that is minted per load, so playing the same
   * recording twice gives two ids and neither is the recording's. What needs
   * the answer is a transcript line offering to jump: the times are positions
   * in the recording, so they mean something only while that recording is the
   * loaded track.
   */
  recordingId?: string;
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

/**
 * A video everybody is watching, on their own screens.
 *
 * Not a second `PlaybackTrack`, and the difference is what the whole feature
 * rests on: a track is a file this server holds and publishes, and this is a
 * link. Nothing here is ever fetched, decoded, published or stored by The
 * Floor — everybody watches the real player on their own device, with its own
 * audio, which is also why a channel running one refuses to record.
 */
export interface WatchParty {
  /** YouTube's own id, parsed from whatever was pasted. */
  videoId: string;
  /** The URL as given, kept so the interface can hand back exactly that. */
  url: string;
  /**
   * How long it runs. Null until a follower's player says — nothing here ever
   * asks YouTube anything, so this is one of two facts the channel learns
   * from a client rather than deciding.
   */
  durationMs: number | null;
  /**
   * What the video is called, or null until a player has said.
   *
   * **The second fact learnt from a player, and it arrives the same way the
   * first does.** The embed already holds the name of what it is showing —
   * `getVideoData().title` — so a device that is playing the film can report
   * it in the report it was already making. Nothing asks YouTube anything:
   * this is a player describing the video it has, not a request for a
   * description of one.
   *
   * That distinction is the whole of why this exists, the card having gone
   * without a title since 2026-09-18 on the grounds that fetching one would
   * be the first request this project ever made to Google. It still is not
   * one. See decisions/2026-09-20-the-film-says-what-it-is-called.md.
   *
   * Null is the ordinary state for the first seconds of a party and for the
   * whole of one nobody is showing anywhere — a card with no title is what
   * every card looked like before this, so nothing has to stand in for it.
   */
  title: string | null;
}

export type WatchStatus = 'idle' | 'playing' | 'paused';

export interface WatchState {
  /** The video being watched, or null when there is none. Null iff idle. */
  party: WatchParty | null;
  status: WatchStatus;
  /** Position banked at the last transition, in ms into the video. */
  positionMs: number;
  /** When the current run began; null unless status is 'playing'. */
  startedAt: number | null;
  /**
   * Whether the room's microphones are to be withheld **while the video
   * plays**.
   *
   * An intent rather than the state itself, and the distinction is the whole
   * of how this behaves: what is actually withheld at any moment is this
   * *and* `status === 'playing'`, derived by `isPartyMuted` in
   * core/channel.ts. So pausing gives everybody their voice back and resuming
   * takes it away again, with nothing here to keep in step and no transition
   * to write — the same reason `isSilenced` is derived from `floor.holder`
   * rather than stored beside it.
   *
   * That falls out as the behaviour anybody would want: you pause a film to
   * talk about it. It also means the mute ends itself when a video runs out,
   * when the channel empties, and when the party is stopped, because all three
   * leave `status` somewhere other than playing.
   *
   * A property of the room and not of any person, which is the whole reason it
   * lives here rather than as six entries in `selfMuted`. Watching something
   * together is mostly not talking, and every open microphone in a watch party
   * is a microphone pointed at somebody's screen — see DECISIONS.md § *A watch
   * party leaks into the channel through the microphone*.
   *
   * **Deliberately not the same state as a self-mute, in either direction.**
   * Clearing this leaves each person's own mute exactly as they set it, and
   * setting it does not write anybody's. One is the room being quiet for a
   * film; the other is a decision somebody made about their own microphone,
   * and a control that silently discarded the second while doing the first
   * would hand back a live microphone its owner had closed.
   *
   * Nor is it the floor: a claim withholds everybody *but one* and confers
   * control, and this withholds everybody and confers nothing. `isWithheld`
   * in core/channel.ts is where the two are combined.
   */
  mutedAll: boolean;
  /**
   * Whether this run's mute is the one nobody may lift.
   *
   * **Sampled when a run starts, never evaluated continuously.** `WATCH_PLAY`
   * asks whether anybody in the room is watching on the device they are in it
   * on — `watchingHere` below — and if so this run begins muted and stays
   * that way until it is paused. `canUnmuteRoom` is the guard that reads it.
   *
   * Sampling rather than deriving is what stops a voice being cut
   * mid-sentence. Somebody switching to their only device during a playing,
   * unmuted film changes nothing until the film is paused and started again,
   * and at a pause everybody may talk regardless — so the moment enforcement
   * begins is never audible as an interruption. It also means there is no
   * pending state and no second clock: the question is asked at one edge and
   * the answer is written here.
   *
   * The reason it is enforced at all is the audio session. A device that is
   * showing the film cannot both serve it in stereo and hold a microphone
   * open — see `microphoneNeeded` in core/micNeeded.ts, where the exception
   * that stops its capture is written down.
   *
   * False while paused, so that unmuting a paused party is allowed and the
   * next run re-asks the question. Cleared with the party, like everything
   * else here.
   *
   * **And dropped mid-run once nobody is watching here**, which is not a
   * retreat from the sampling above but its other half: enforcement may be
   * *lifted* during a run and may never be *imposed* during one. Everything
   * said above is an argument about imposing — a voice cut off mid-sentence,
   * a button vanishing under a finger — and none of it applies to a room
   * getting its speech back. Handing the film to a television is the case
   * that made this necessary: the run continues, `watchingHere` empties, and
   * without it the room stayed silent and buttonless for the rest of the
   * film. `liftSpentEnforcement` in core/channel.ts is where it happens, and
   * it leaves `mutedAll` alone — the room stays quiet, but somebody can now
   * say otherwise.
   */
  enforced: boolean;
  /**
   * Why the party stopped, when it stopped for a reason nobody asked for.
   *
   * The same reasoning as `PlaybackState.failure`, one screen further out: a
   * transport that says playing while three people are looking at a stopped
   * player needs to say which of those two is the lie.
   */
  failure: string | null;
  /**
   * The films this channel has watched, newest first, the current one excluded.
   *
   * **A list to choose from, which is the whole of what it is for.** A link
   * arrives on a clipboard and then it is gone — somebody who watched half of
   * something on Tuesday has no way back to it on Wednesday but to go and find
   * the video again, and the channel already knows which video it was. So what
   * a party leaves behind when it is replaced or stopped is kept, and starting
   * one from a row here is the same act as pasting the link that made it.
   *
   * **A property of the channel and not of any person**, like `mutedAll` above
   * and for a plainer reason: the thing being remembered is what *we* watched.
   * Everybody in the room saw it, everybody's card offers it back, and an
   * account that carried its own list would be one where the person who pasted
   * the link is the only one who can find it again.
   *
   * Deduplicated by `videoId` and capped at `MAX_WATCH_HISTORY` — see
   * `rememberFilm`, which is the only thing that writes it. Entries are
   * `WatchParty`s because that is what they were: the same id, the same URL as
   * pasted, and whatever the party managed to learn about its length and its
   * name before it ended. A film nobody ever played is remembered nameless,
   * which is the same card the party itself drew.
   *
   * **It survives the party**, and is the one thing in this state that does.
   * `stopParty` returns the initial state for everything else precisely so a
   * mute cannot outlive what it was for; the history is not about the run that
   * has ended, so it is carried across rather than cleared.
   */
  history: WatchParty[];
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
   * The two are not the same kind of thing, though. A name is one string
   * every member reads and can therefore say to another member. The fallback
   * is a *description*, written from one viewer's side — you see "Dana Chu",
   * she sees your name.
   *
   * **The interface stopped drawing that difference on 2026-09-13.** Lists
   * and headers set a description in the same upright body as a name: the
   * muted italic that used to mark one was emphasis landing on the channels
   * with least to say for themselves, and a slant cannot say *this string is
   * not the one the others see* to anybody who has not been told. Where the
   * difference is actionable it is stated instead — the settings field shows
   * the description as its placeholder, so what you could type and what is
   * merely standing in for it are told apart by which one is yours.
   */
  name: string | null;
  /**
   * A description of what the channel is for, or null when nobody has written
   * one. The *notepad*, to a user; see GLOSSARY.md on why the two words
   * differ, which is that renaming this one would be a wire change.
   *
   * **Plain text since 2026-09-13**, held and shown as the characters
   * somebody typed. It was Markdown source until then, rendered by the app to
   * five inline marks; the parser is gone and the marks are characters, so
   * there is no longer any difference between what is stored and what is
   * read. Old builds still render what they receive as Markdown, which is
   * cosmetic and needs no shim.
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
   * Seats that have been offered and not taken up, by the same id the seat
   * will have when it is.
   *
   * **Not folded into `guests`, and that is load-bearing rather than tidy.**
   * Everything that asks who is in the room reads `guests` — `roomOccupants`,
   * `statedIdentities`, `inRoom`, `selfMuted`, and through the last of those
   * the whole mute matrix and what the media plane is told. An invitation is
   * nobody in the room. Merging the two would announce a person who has never
   * connected.
   *
   * **It is here at all so that an invitation occupies what it promises.**
   * Until 2026-09-22 a pending invitation was a `guest_sessions` row and
   * nothing else, by `decisions/2026-09-21-asking-somebody-in-as-a-guest.md`,
   * which kept it out of `participants` — the right outcome reached by a means
   * that also kept it out of every ceiling the reducer enforces. Forty
   * invitations and forty knocks admitted eighty claims on a forty-seat room,
   * and thirty-nine people were turned away one at a time on arrival. A
   * separate field keeps the first property and fixes the second.
   *
   * Volatile in the same way `guests` is: the durable half is the
   * `guest_sessions` row, and the server projects these back after a restart.
   */
  guestInvites?: Record<GuestId, InvitedGuest>;
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
  /**
   * When each person last unmuted **themselves**, for the ones who have since
   * this visit began. Absent means they have not.
   *
   * Read by one thing — `canMuteOther`, which refuses to let anybody else mute
   * somebody inside `SELF_UNMUTE_GRACE_MS` of this stamp. Unmuting yourself is
   * the plainest statement there is that you want to be heard, and this is how
   * long that statement stands against a second hand reaching for the control.
   *
   * **Written only by the person it is about**, which is every unmute there
   * is: `canMuteOther` refuses to open anybody's microphone but the actor's
   * own, so there is no such thing as an unmute performed for somebody. The
   * one exception the field has to exclude is the claimant's automatic unmute
   * on `CLAIM_FLOOR` — a holder is already unmutable while they hold, and on
   * release they are an ordinary member again who has not touched the
   * control.
   *
   * Scoped to the visit exactly as `selfMuted` is: cleared on every departure,
   * removed outright when membership goes. A minute-long window has no meaning
   * carried across a step-out that reset the microphone anyway.
   */
  selfUnmutedAt: Record<UserId, number>;
  /**
   * Whether this channel begins recording of its own accord.
   *
   * A property of the channel rather than of anybody's phone or account: a
   * channel that is kept is kept for everyone in it, and a member who set this
   * on one handset must not find it off on the next. It is shared furniture in
   * the sense the name and the description are, and `canEditChannel` governs
   * it for the same reason — the person changing it has to be in the room.
   *
   * **It decides only how a run begins, never how one continues.** Pause,
   * resume and stop are untouched, and stopping a run that started by itself
   * stops it for good: nothing starts a second one until the room has emptied
   * and filled again. See `autoRecordStarter`, which is the whole of the
   * mechanism, and the latch the server keeps beside it.
   *
   * Absent on a snapshot from a server that predates the field, which the app
   * reads as off — the same thing every channel had before it existed.
   */
  autoRecord: boolean;
  recording: RecordingState;
  /** The most recent run that has finished, or null if none has. */
  lastRecording: FinishedRun | null;
  playback: PlaybackState;
  /**
   * What everybody is watching, on their own screens.
   *
   * Beside `playback` rather than inside it, and mutually exclusive with it:
   * a channel attends to one thing, so starting a party clears the track and
   * loading a track ends the party. See `canStartWatch`.
   */
  watch: WatchState;
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
  /**
   * Who is watching the party on the very device they are in the room on.
   *
   * **A subset of `present`, and the whole of what one device costs.** A
   * screen and a microphone on one device cannot both be served: the film
   * wants a `playback` session in stereo, and an open microphone forces
   * `playAndRecord` under a voice mode, which is mono, ducked and voice
   * processed. So a device that is the screen stops capturing while the film
   * plays — the exception written down in core/micNeeded.ts — and the room's
   * mute is enforced for that run so that nobody is expecting a voice that
   * cannot arrive.
   *
   * **Read through `microphoneNeeded`, never alone.** A guest with no speech
   * grant is in the room, may be watching here, and has no microphone to be a
   * problem; one of those must not quiet a room for nothing. `enforcedFor`
   * in core/channel.ts is the combination, and is the only thing that should
   * ask this question.
   *
   * **Drawn on the roster**, which is not decoration. Between somebody
   * choosing this device and the film next pausing, they are inaudible while
   * the room still believes otherwise — the mirror of the fault `isWithheld`
   * forbids — and saying *watching* beside their name is what makes the
   * silence legible rather than a dropped call.
   *
   * Volatile, like `present` and `waiting` and for the same reason: it
   * describes a process rather than a channel. A restart drops every screen in
   * the world along with the presence it depends on, and `revivedWatch`
   * brings the party back paused with nobody watching, which is true.
   */
  watchingHere: UserId[];
  /**
   * When each *declared* wait was declared, for those that were.
   *
   * `waiting` holds two kinds of absence that used to be told apart by nothing
   * but a comment: a connection that ran out of grace, and a declaration
   * somebody made. The first is measured by `lastPresentAt` and rightly so —
   * the question there is how long it is since any sign of life, and a phone
   * in a pocket gives none. The second is a tap, and a tap is the sign of
   * life. Dating it from the last heartbeat said "Nearby for four minutes"
   * about somebody who had pressed the button a second earlier, and expired
   * their declaration eleven minutes later rather than fifteen.
   *
   * So this is the second clock, and it exists because the two absences answer
   * different questions rather than because one of them was wrong. Read
   * through `nearbyMs`, which picks whichever clock applies; `idleMs` stays
   * what it was, being the answer to *when did we last hear anything* — and
   * since 2026-09-12 a declaration is one of the things heard, stamping
   * `lastPresentAt` because it is an arrival. The two clocks still differ, and
   * where they differ is unchanged: a dropped connection is dated from the
   * last heartbeat and a declaration from itself. What changed is that after a
   * declaration both of them start at the same moment.
   *
   * **Not stamped for an expired connection**, which is the whole distinction:
   * `stepOut` writes this only for `exit: 'nearby'`, and `DECLARE_NEARBY`
   * writes it from outside. Cleared by entering and by every departure that
   * clears `waiting`.
   *
   * **Restamped in place, since 2026-09-13**, when somebody taps the lit
   * *Nearby* rung: the renewal that used to cost two taps. Which means it also
   * arrives on a wait that began without it — a lapsed connection tapped from
   * the rung becomes a declaration, because by then it is one. See
   * `DECLARE_NEARBY` in core/channel.ts.
   *
   * Volatile, exactly as `waiting` is, and for the same reason: it describes
   * a process, and a restart that dropped everybody's socket is not evidence
   * about anybody's intentions. Absent on a snapshot from a server that
   * predates it — see SHIMS.md.
   */
  declaredNearbyAt: Partial<Record<UserId, number>>;
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
   * Declare yourself **nearby**: within reach, one notification away, claiming
   * nothing.
   *
   * **One action for both ways in**, because they are the same statement made
   * from two places. From outside a channel it is *step in nearby*; from
   * inside it is *declare nearby*, which abandons the claim on the audio
   * system and steps you out. The reducer tells them apart by whether you were
   * present, and nothing downstream needs to.
   *
   * **The observer side needs no new field.** *Nearby* is carried by
   * `waiting`, which every client already renders with a ping — so this action
   * is the whole of the wire change, and a build that predates it shows a
   * declared nearby correctly without knowing it exists.
   *
   * Refused to guests by omission from `GUEST_ACTIONS`: a seat has no
   * notification to be one away from.
   */
  | { type: 'DECLARE_NEARBY'; userId: UserId }
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
   * disappeared. See planning/decisions/DECISIONS.md.
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
  /**
   * Turns automatic recording on or off for the channel. Any participant with
   * the room may, exactly as with the name and the description — see
   * `autoRecord` in `ChannelState` for why it is the channel's rather than the
   * person's.
   *
   * It does nothing to a run already going: this action never starts, pauses
   * or stops capture. What it changes is what happens the next time the room
   * fills.
   */
  | { type: 'SET_AUTO_RECORD'; userId: UserId; autoRecord: boolean }
  | { type: 'CLAIM_FLOOR'; userId: UserId }
  | { type: 'RELEASE_FLOOR'; userId: UserId }
  /**
   * Closes or opens a microphone. `userId` is who is asking; `target` is whose
   * microphone, and defaults to the asker — which is every use of this action
   * before 2026-09-07 and still most of them. See `canSetSelfMute` for who may
   * name somebody else.
   */
  | { type: 'SET_SELF_MUTE'; userId: UserId; muted: boolean; target?: UserId }
  /** `runId` is minted by the server; a client cannot name one. */
  | {
      type: 'START_RECORDING';
      userId: UserId;
      runId: string;
      /**
       * Set by the server's `autoRecord` latch and by nothing else. Absent is
       * *by hand*, which is what every client-originated start is: the wire
       * form carries no such field, so a client cannot claim a run was
       * automatic and mute the chime on somebody else's phone.
       */
      automatic?: boolean;
    }
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
   * Starts a watch party on a pasted link, replacing whatever the channel was
   * attending to. The `videoId` arrives parsed rather than being parsed here,
   * so that the app's decision to light the button and the server's decision
   * to accept are made by one function — see `parseYouTubeUrl`.
   */
  | { type: 'START_WATCH'; userId: UserId; videoId: string; url: string }
  | { type: 'STOP_WATCH'; userId: UserId }
  /**
   * The party's transport, gated by `canControlWatch` — the same rule shared
   * playback follows, for the same reason. A claim confers exclusive control
   * of what is attended to, and a video on everybody's second screen is
   * squarely that.
   */
  | { type: 'WATCH_PLAY'; userId: UserId }
  | { type: 'WATCH_PAUSE'; userId: UserId }
  | { type: 'WATCH_SEEK'; userId: UserId; positionMs: number }
  /**
   * Withholds every microphone in the room for the length of the party, or
   * gives them all back. Guarded by `canControlWatch` like the transport, for
   * the same reason: it governs what the channel is attending to.
   *
   * Writes nothing to `selfMuted`. See `WatchState.mutedAll`.
   */
  | { type: 'SET_WATCH_MUTE'; userId: UserId; muted: boolean }
  /**
   * A follower's player says how long the video is.
   *
   * A fact rather than a control, so it is gated by nothing but being in the
   * room: it changes no transport and grants nobody anything. It carries a
   * `userId` all the same, because the socket it arrives on has one and the
   * reducer refuses anybody who is not a participant.
   */
  | {
      type: 'WATCH_READY';
      userId: UserId;
      durationMs: number;
      /**
       * What the player says the video is called, where it can say. Optional
       * because a player that cannot name what it is showing still has a
       * length worth reporting, and because a build older than the field
       * sends the action without it.
       */
      title?: string | null;
    }
  /**
   * This account's device in the room is, or is no longer, the screen.
   *
   * A fact about a device rather than a control over the channel, so it is
   * gated by being in the room and nothing else — it drives no transport and
   * confers nothing. What it does change is whether the next run's mute can be
   * lifted, which is why the reducer keeps it rather than the server keeping
   * it to itself: `WatchState.enforced` is sampled from it.
   *
   * Only ever sent by the connection that holds this account's presence. An
   * instance that is a screen *without* being in the room — the second device,
   * which is the configuration this design prefers — sends nothing, because
   * its microphone was never the problem.
   */
  | { type: 'WATCH_HERE'; userId: UserId; watching: boolean }
  /** Reported, not performed — like PLAYBACK_FAILED: no actor, no guard. */
  | { type: 'WATCH_FAILED'; reason: string }
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
   * A seat has been offered to a contact and not yet taken up.
   *
   * Raised by the server when the `guest_sessions` row is written, the same
   * way `GUEST_ENTERED` is raised when one is walked into — the row is the
   * durable half and the state is the room's picture of it. **The ceiling is
   * checked before the row is written and not here**: refusing at this point
   * would leave a row that nothing in the room knows about, which is the one
   * disagreement this pair exists to prevent.
   *
   * It is also how the projection comes back after a restart, one action per
   * outstanding invitation.
   */
  | { type: 'GUEST_INVITED'; invited: InvitedGuest }
  /**
   * An offer is off the table: taken back by a member, or the row ejected.
   *
   * **Not raised for an expiry**, which needs nothing raised: an invitation
   * past its `expiresAt` stops counting where it is counted, so a room gets
   * its seats back without a timer having to fire. See `guestsPromised`.
   */
  | { type: 'GUEST_INVITE_WITHDRAWN'; guestId: GuestId }
  /**
   * A seat turns out to belong to an account, mid-visit. Raised by the server,
   * which is the only thing that can check a token.
   *
   * **Two ways in, and they are the first two rungs of the ladder**: an
   * anonymous guest accepts a member's ask to make an account, or accepts a
   * contact ask and signs in on the way to answering it. Either way the seat
   * gains a name behind it and nothing else — no membership, no contact, none
   * of the guards in this file reading differently. `accountId`'s own comment
   * is the argument for why being known confers nothing.
   *
   * Separate from the acceptance below because they are separate facts: a
   * seat may be identified with no ask outstanding at all.
   */
  | { type: 'GUEST_IDENTIFIED'; guestId: GuestId; accountId: UserId }
  /**
   * A guest says yes to one member's contact ask. Raised by the server, after
   * the row is written, for the reason the ask itself says: a contact is
   * something an account has.
   *
   * **This used to have nowhere to be recorded.** Acceptance took the guest
   * out of `guests` in the same breath, so there was no card left to relabel.
   * Now it is the third rung and the seat stands: the card reads what came of
   * the ask, and the member has a second control to offer if they want to.
   */
  | { type: 'GUEST_ACCEPTED_CONTACT'; guestId: GuestId; askerId: UserId }
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
   * A member asks a guest to be a contact.
   *
   * The record of the asking, and nothing more: what an acceptance *does* —
   * a contacts row — happens at a route with an authenticated account behind
   * it, since a contact is something an account has and a seat is not one.
   *
   * **It no longer carries a membership with it**, which it did until
   * 2026-09-16. Being asked into the channel is `INVITE`, a second act by a
   * second tap, and the seat stands in between. See `Guest.asks`.
   *
   * Guarded by `canManageGuest`, which is the same entitlement rather than a
   * new one: being a member, in the room with them.
   */
  | { type: 'ASK_GUEST_CONTACT'; userId: UserId; guestId: GuestId }
  /**
   * A guest says no to one member's ask.
   *
   * Kept rather than deleted, so the member is told the difference between an
   * answer and a silence. Says nothing about anybody else's ask.
   */
  | { type: 'REFUSE_CONTACT'; userId: UserId; askerId: UserId }
  /**
   * A member asks an anonymous guest to make an account here.
   *
   * **The weakest of the three asks, and the only one that asks for nothing.**
   * It offers an account and takes no relationship: not a contact, not a
   * membership, not a second question afterwards. What a member gets out of
   * it is somebody on The Floor, which is worth having on its own — and until
   * this existed, the only door into an account from inside a room was the
   * contact ask, which priced an arrival at a relationship.
   *
   * The record of the asking, as its sibling above is. What acceptance *does*
   * is make an account and claim the seat with it, at a route, for the same
   * reason: core has never heard of an account.
   *
   * Guarded by `canManageGuest` like the contact ask, plus the seat having no
   * account — an identified guest has answered this, and asking again would
   * be putting a settled question.
   */
  | { type: 'ASK_GUEST_JOIN'; userId: UserId; guestId: GuestId }
  /**
   * A guest says no to one member's ask that they make an account.
   *
   * Kept for the reason `REFUSE_CONTACT` is kept, and separately from it: a
   * member may have asked both, and one answer is not the other.
   */
  | { type: 'REFUSE_JOIN'; userId: UserId; askerId: UserId }
  /**
   * A guest changes what the room calls them.
   *
   * Always available and needing no guard beyond the seat: the actor comes
   * from the connection, so this can only ever rename its sender. A name here
   * is nobody's property — nothing is unique, nothing is looked up by it — so
   * there is no clash to detect and none is reported.
   */
  | { type: 'SET_GUEST_NAME'; userId: UserId; name: string }
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
   * Somebody retired for inattention: the room published nothing unmuted and
   * played no media for the attention window, so it is defunct and everybody
   * in it is stepped out.
   *
   * **A statement about the room, applied to each person in it** — which is
   * what separates it from `DISCONNECT_EXPIRED`, a statement about one
   * connection. Nobody here lost anything; they simply stopped being a reason
   * for the channel to be described as occupied.
   *
   * It exists because presence is supposed to mean *responsiveness*, and a
   * keep-alive that holds a pocketed phone awake for fifteen minutes makes it
   * stop meaning that. A room of such phones reads as occupied, and
   * `announceActive` fires only on the empty-to-occupied edge — so an occupied
   * ghost room silently swallows every arrival notification anybody would have
   * received. See planning/decisions.
   */
  | { type: 'ATTENTION_EXPIRED'; userId: UserId }
  /**
   * Advances time-driven transitions: floor expiry, a track reaching its end,
   * and a dropped connection outlasting the grace period. Nothing here ends a
   * channel — only its last member leaving does that.
   */
  | { type: 'TICK' };
