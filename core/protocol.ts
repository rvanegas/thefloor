import type { NotificationLevel } from './notifications';
import type { ChannelState, Clip, UserId } from './types';

/**
 * The wire contract between the app and the server. It lives in core for the
 * same reason the rules do: two copies would drift, and a drifting protocol
 * fails at runtime rather than at compile time.
 *
 * Note what is absent from every client message: a userId. The server takes
 * the actor from the authenticated connection, never from the payload — the
 * mock let the UI dispatch as either party, and the server must not.
 */

export interface PublicAccount {
  id: UserId;
  displayName: string;
}

/**
 * A person's profile: what they choose to say about themselves.
 *
 * Separate from `PublicAccount` rather than folded into it, because
 * PublicAccount is embedded in every roster, invitation and recording row that
 * crosses the wire, and a bio on each of those would be a paragraph repeated
 * per participant per snapshot to be shown in none of them. A profile is
 * fetched when somebody asks to see one.
 */
export interface ProfileView {
  account: PublicAccount;
  /** Markdown, as typed. Null when they have not written one. */
  bio: string | null;
  /**
   * Whether they are in the app right now, and when they last were — the same
   * two facts `ContactView` carries, with the same meanings and the same
   * reasons for being two rather than one. Read `inApp` first: it is a fact,
   * where subtracting `lastSeenAt` from an advancing clock is an inference
   * that ages badly.
   *
   * **Both are withheld from anybody who is not a contact.** A profile is
   * readable by a contact, by anyone sharing a live channel, and by yourself;
   * availability is for the first of those alone, which is exactly the audience
   * that could already see it when it lived on Home's contact rows. Somebody an
   * acquaintance brought into a conversation gets the bio and nothing about
   * where its author is.
   *
   * Optional therefore twice over: absent for a non-contact, and absent from a
   * server that predates them. A client cannot tell those apart and does not
   * need to — it shows nothing for both.
   */
  inApp?: boolean;
  lastSeenAt?: number | null;
  /**
   * How many people are here because of them: everybody they invited, plus
   * everybody those people invited, all the way down.
   *
   * Not withheld from anybody who may see the profile at all, unlike
   * availability — it is a count and names nobody, so it says nothing about
   * who a person knows, which is the thing a contact list is private about.
   *
   * Optional because a server that predates it sends no such key, and zero is
   * a real answer that must not be confused with an absent one: everybody's
   * first day reads zero, and the client shows the line either way rather than
   * hiding a genuine nought.
   */
  invited?: number;
  /**
   * Who invited them, when that is somebody you would recognise.
   *
   * **Present only when the inviter is you or one of your contacts**, which is
   * the whole of the rule and is enforced by the server rather than filtered
   * for here. Otherwise absent — never a name you have no other way of
   * knowing, and never an id for a client to resolve, since either would turn
   * a profile into a way of learning who a stranger knows.
   *
   * Absent is therefore three things at once: they were not invited by anyone
   * recorded, or they were and you do not know that person, or the server
   * predates the field. A client cannot tell them apart and does not need to —
   * all three mean there is no line to draw.
   */
  invitedBy?: PublicAccount;
  /**
   * Where this person has been in each channel the two of you share.
   *
   * One entry per shared channel, and deliberately nothing that Home already
   * says about those channels — no name, no roster, no occupancy count. Home's
   * `rejoinable` list *is* the set of channels you belong to, so the client has
   * all of that already and joins on `channelId`; what it cannot know from
   * there is the half that is about **this person** rather than about the
   * room. A channel's own `lastPresenceAt` is the maximum across everybody in
   * it, so on a card about one member it answers a question nobody asked: two
   * other people talking all afternoon says nothing about whether the person
   * whose profile this is has ever opened the place.
   *
   * `present` first, and `lastPresentAt` second, for the reason `inApp` comes
   * before `lastSeenAt`: presence is a fact that stays true until an event
   * changes it, where a stamp subtracted from an advancing clock ages by
   * however long the screen has gone without a snapshot. And a present member
   * heartbeats, so their stamp reads as roughly now anyway — which is an
   * inference the flag makes unnecessary rather than one it agrees with.
   *
   * `lastPresentAt` is null when they have never been in that channel, which
   * is an ordinary state rather than a gap: a channel a pair get for becoming
   * contacts has been entered by nobody, and a channel somebody was asked into
   * and has not yet answered has been entered by everybody but them.
   *
   * Not withheld from a non-contact, unlike availability, and the difference is
   * the scope rather than the sensitivity. Availability says where somebody is
   * in the world; this says only whether they have been in a room the reader is
   * themselves a member of — the same fact the reader could have by sitting in
   * it, and about the reader's own channels. Every entry is a channel you both
   * belong to; there is no entry here for a channel you are not in.
   *
   * Optional because a server that predates it sends no such key, and an empty
   * array is a real answer that must not be confused with an absent one: the
   * client falls back to the channel's own idleness for an absent field, and
   * shows no channels at all for an empty one.
   */
  sharedChannels?: SharedChannelView[];
  /**
   * Their sign-in address, when they have chosen to show it to this reader.
   *
   * **Never sent on the strength of the reader's own standing.** Every other
   * field here is decided by who is asking — a contact gets availability, a
   * channel-sharer gets the bio. This one is decided by an act of the person it
   * belongs to, aimed at one named reader, and being their contact is not that
   * act. An address is how somebody reaches you outside this application for
   * ever, and it is the only part of a person here that the app will not hand
   * out on a relationship alone.
   *
   * Absent means it is not being shown, which is also what an older server
   * sends and what somebody who is not a contact gets. The client draws no
   * address for all three, there being nothing to draw.
   */
  email?: string;
  /**
   * Whether **you** are showing **your** address to them — the state of your
   * own button, on their screen.
   *
   * The one field here that is not about the person whose profile this is, and
   * it is named to say so. It belongs on this response rather than on some
   * settings screen because the decision is per person: there is no global
   * "show my email", there is only showing it to somebody, and the place that
   * is true of is their profile.
   *
   * Absent for a non-contact and for an older server, which the client reads as
   * "no such choice to offer here" rather than as false. Offering it and having
   * the server refuse would be the dead affordance this screen avoids
   * everywhere else.
   */
  myEmailShown?: boolean;
}

/**
 * One shared channel, on somebody's profile. See `ProfileView.sharedChannels`
 * for why it carries so little.
 */
export interface SharedChannelView {
  channelId: string;
  /** Whether they are standing in it right now. */
  present: boolean;
  /**
   * When they were last heard from in it, or null for never. Minute-resolution
   * once it has been through the database — see `ChannelState.lastPresentAt`.
   */
  lastPresentAt: number | null;
}

/**
 * One row of the invitation standings: somebody, and how many people are here
 * because of them.
 *
 * Carries `PublicAccount` rather than a bare name so that a row can be tapped
 * through to a profile — which will refuse unless the reader is entitled to
 * it, the same as from anywhere else. Seeing a name in the standings is not
 * itself entitlement to anything.
 */
export interface LeaderboardEntry {
  account: PublicAccount;
  invited: number;
}

export type ContactStatus = 'accepted' | 'outgoing' | 'incoming';

export interface ContactView {
  account: PublicAccount;
  status: ContactStatus;
  /**
   * When they last had the app open, or null when that is not known — an
   * outgoing request, which is an address rather than a person, or somebody
   * who has not connected since the server began recording it.
   *
   * Optional rather than merely nullable, and that is the wire talking: a
   * server that predates the field sends no such key, which is exactly what an
   * installed build meets between its release and the deploy that follows. The
   * server always sets it; the client must survive its absence, and the type
   * is what makes it do so.
   */
  lastSeenAt?: number | null;
  /**
   * Whether they hold a socket right now — the fact `lastSeenAt` was being
   * asked to imply, and could not.
   *
   * The two are not redundant, and the difference is the whole reason this
   * exists. `lastSeenAt` is a number fixed when the server composed the
   * snapshot, so a client subtracting it from its own advancing clock reports
   * the age of the snapshot on top of the real gap. This is a fact, and a
   * fact does not decay: a snapshot saying somebody is in the app is wrong
   * only once they leave, which is an event the server pushes, and one saying
   * they left at T stays true for ever. That is what lets Home refresh on two
   * socket transitions rather than on a timer.
   *
   * Optional for the same wire reason as `lastSeenAt`: a server that predates
   * it sends no such key, which is what an installed build meets between its
   * release and the deploy that follows.
   *
   * Withheld for an outgoing request, exactly as `lastSeenAt` is, and for the
   * same reason: that row is an address rather than a person, and whether
   * anybody is behind it is precisely what must not be revealed.
   */
  inApp?: boolean;
}

export interface InviteView {
  channelId: string;
  from: PublicAccount;
  createdAt: number;
  /**
   * What the channel is called, if anyone has named it — and who else is in
   * it, so an unnamed one can be described the way every other list describes
   * one.
   *
   * Without these an invitation could only say who sent it, and two from the
   * same person were the same banner twice with no way to tell which was
   * which. Optional, so a server that predates them leaves a client with the
   * old text rather than a broken screen.
   */
  name?: string | null;
  others?: PublicAccount[];
  /**
   * How many people are in the channel right now.
   *
   * The banner said somebody "is waiting in a channel" whatever the truth of
   * it, so an invitation to an empty room summoned you to nobody. An
   * invitation outlives the moment it was sent; what it cannot do is keep
   * claiming that moment is still happening.
   */
  presentCount?: number;
  /**
   * The most recent moment anybody was in the channel — see `lastPresenceAt`
   * in core/channel.ts. What Home measures idleness from, and orders on.
   *
   * Optional for the wire's sake: a server that predates it sends no such key,
   * and a client meeting that shows no idleness rather than inventing one.
   */
  lastPresenceAt?: number;
}

export interface RejoinableView {
  channelId: string;
  /** The channel's name, if anyone has given it one. */
  name: string | null;
  /** The other participants, in channel order. */
  others: PublicAccount[];
  /** How many participants are currently present. */
  presentCount: number;
  createdAt: number;
  /** The last entry or exit. Ordering reads `lastPresenceAt` instead. */
  lastActiveAt: number;
  /**
   * The most recent moment anybody was in the channel — see `lastPresenceAt`
   * in core/channel.ts. What Home measures idleness from, and orders on.
   *
   * Not `lastActiveAt`, which moves only on an entry or an exit and so freezes
   * for the whole of a conversation. This one is kept fresh by the heartbeat,
   * so it is the same measure whether the room emptied an hour ago or somebody
   * is sitting in it now.
   *
   * Optional for the wire's sake: a server that predates it sends no such key,
   * and a client meeting that falls back to `lastActiveAt`, which is the same
   * answer for every channel nobody is in — the only ones the idleness line is
   * shown for.
   */
  lastPresenceAt?: number;
  /**
   * Whether anybody has ever been in it — false only for a channel nobody has
   * set foot in, which since contacts came to guarantee a one-to-one channel
   * per pair is a shape that exists in numbers.
   *
   * It is what stops those channels lying. `lastPresenceAt` for one of them is
   * the moment it was created, so without this a channel nobody has ever
   * entered reads as having been used then — and, worse, sorts to the top of
   * Home as the freshest thing there. The client says "Not used yet" instead
   * and sinks it to the bottom of its section.
   *
   * Optional for the wire's sake, and absent means true: every channel an older
   * server sends is one somebody had been present in, that having been the test
   * for appearing in this list at all.
   */
  everUsed?: boolean;
}

export interface RecordingView {
  id: string;
  channelId: string;
  /**
   * What to call it. Fixed when the run stopped, identical for everybody who
   * was in it, and never recomputed — so two people can talk about the same
   * recording by the same name.
   */
  name: string;
  /** The other participants of the recorded channel, in channel order. */
  others: PublicAccount[];
  startedAt: number;
  /**
   * When capture stopped. Not `startedAt + durationMs`: a run that was paused
   * ran for longer than it recorded, and this is the wall-clock end.
   */
  endedAt: number;
  durationMs: number;
  /**
   * Whether its mix is still being made, and so whether playing and exporting
   * it are available yet.
   *
   * A finished run is filed, mixed, and only then playable as one file. That
   * takes seconds — five, for a hundred-second run — and recordings in that
   * state used to be withheld from both lists entirely, so what somebody had
   * just made was missing from the screen with nothing to say why. Showing the
   * card and disabling the two actions that need the mix is the honest version:
   * the recording exists, and part of it is not ready.
   *
   * Optional because a server that predates it sends nothing, which reads as
   * false — the same answer it would have given, since such a server never
   * listed a recording that was still mixing.
   */
  mixing?: boolean;
  /**
   * Where its transcript stands, or absent when this server cannot transcribe
   * at all.
   *
   * **Absent and `'none'` are different answers and the difference is what the
   * app runs on.** Absent means no provider is configured, so there is nothing
   * to offer and no button; `'none'` means this server could transcribe this
   * recording and nobody has asked. Collapsing the two — which this field did
   * for about an hour — leaves a server that *can* transcribe looking exactly
   * like one that cannot, right up until the first transcript exists, so the
   * button that would start one never appears.
   *
   * Optional in the way `mixing` is: a build that predates the field ignores
   * it and shows the card exactly as it does now.
   */
  transcript?: {
    state: 'none' | 'pending' | 'ready' | 'failed';
    /**
     * What to name in the confirmation before one is started.
     *
     * On the wire rather than compiled into the app, and named at all rather
     * than left as "a transcription service", because the person tapping is
     * deciding for everybody who was in the room and is owed the same name
     * the privacy policy uses. It travels per recording, which is a few bytes
     * repeated — the alternative is a second thing the app has to fetch and
     * hold, to say one word.
     */
    provider: string;
    /**
     * Whether *this* viewer may start one, for *this* recording.
     *
     * On the wire rather than inferred, because the answer is the server's:
     * everybody gets one free transcript and some accounts are marked for
     * more — it is the first thing here that costs money per tap, and the
     * first whose cost somebody else can incur on your behalf. Reading and
     * searching are never limited, so this says nothing about what may be
     * seen.
     *
     * Per recording rather than per account, since a free use can also be
     * refused for being too much audio.
     *
     * Optional: a server that predates it sends nothing, which reads as
     * permitted — the behaviour such a server had.
     */
    mayRequest?: boolean;
    /**
     * Why not, when `mayRequest` is false — a sentence to show in place of the
     * button.
     *
     * Composed by the server because only the server knows the cap and what
     * this recording would take of it. It is here at all because the refusal
     * is now *temporary and personal* — "you have had yours" — where the rule
     * it replaced was "not you, ever, on this server", which was worth no
     * words and was said by withholding the button in silence.
     */
    requestLimit?: string;
    /**
     * Whether starting one would spend this viewer's single free use.
     *
     * The confirmation says so and offers to cancel, because it is a thing
     * that can only be done once and the app should not let somebody find
     * that out afterwards. False for an account marked unlimited, whose taps
     * spend nothing they will miss.
     *
     * Optional, and absent reads as false: a server that predates this says
     * nothing, and an app that predates it shows the confirmation it always
     * showed.
     */
    spendsFreeUse?: boolean;
    /**
     * Whether this viewer may remove this transcript, or say who its voices
     * were — which is whoever asked for it, plus any unlimited account.
     *
     * Separate from `mayRequest` since 2026-08-25, when they stopped being
     * the same question: everybody may ask for one now, so "may shape the one
     * that exists" is no longer answered by "may make one".
     *
     * Optional: absent reads as permitted, the behaviour a server that
     * predates it had.
     */
    mayRemove?: boolean;
    /**
     * Who asked for it. Shown, always — asking sends everybody's audio to a
     * third party, so it is never anonymous.
     */
    /** Null on `'none'`, since nobody has asked yet. */
    requestedBy: PublicAccount | null;
    failure?: string;
    /**
     * How many speakers produced nothing. A transcript is ready when *any* of
     * them did, so a screen that said only "ready" would present a
     * conversation with somebody missing from it as though it were complete.
     */
    missing?: number;
  };
}

/**
 * What the Settings screen is told about donating.
 *
 * Fetched when that screen opens rather than carried on the Home snapshot,
 * which is pushed to every client on every change — the same reasoning that
 * keeps a bio off PublicAccount. Nothing here gates anything: donations are
 * voluntary and unlock nothing, so no other view has any reason to read it.
 */
export interface SupportView {
  /**
   * Where to send somebody who wants to give. Null when donations are not
   * configured, and the screen then offers nothing.
   *
   * Deliberately not a constant in the app: this is what makes withdrawing the
   * donate link a server restart rather than an App Store submission.
   */
  url: string | null;
  /**
   * Their own sign-in address, shown beside the link.
   *
   * A donation is tied back to an account by the address it was paid with, and
   * Ko-fi's link carries no field to put an account id in — so asking somebody
   * to use this address is the cheapest half of attribution by a wide margin.
   */
  identifier: string;
  /** What they have already given. Null when they have given nothing. */
  mine: {
    count: number;
    since: number;
    /** One entry per currency. Two currencies are never added together. */
    totals: Array<{ currency: string; cents: number }>;
  } | null;
}

/** Everything Home renders, pushed as one snapshot. */
export interface HomeView {
  invites: InviteView[];
  rejoinable: RejoinableView[];
  contacts: ContactView[];
  recordings: RecordingView[];
}

/**
 * A channel as the client sees it. `serverNow` accompanies every snapshot so
 * countdowns are computed against the server's clock rather than the device's,
 * which drifts and can be set by the user.
 */
export interface ChannelView {
  channel: ChannelState;
  /**
   * Everything recorded in this channel, newest first, visible to anyone who
   * belongs to it. Recordings live on the channel screen because they belong
   * to the channel: it is what names them, and deleting it deletes them.
   */
  recordings: RecordingView[];
  /**
   * Every participant, the viewer included — the name directory for the ids
   * in `channel.participants`, `present`, `floor.holder` and `selfMuted`.
   */
  participants: PublicAccount[];
  /**
   * When each participant may next be pinged, for the ones who may not be
   * pinged right now. Absent from the map means now.
   *
   * Here rather than on `ChannelState` because the limit is not a channel rule:
   * no reducer knows about it, `core/` has never heard of it, and it is server
   * bookkeeping about who has recently been bothered. It rides on the channel
   * snapshot because that is where the question is asked from, the profile
   * card being reached from inside a channel and the window being per channel
   * and target.
   *
   * Optional so that a client older than the field simply does not see it. It
   * only ever *withdraws* an affordance the server would refuse anyway, so a
   * client that ignores it behaves exactly as it did — it offers the button and
   * is told no, which is what every build up to 55 does.
   */
  pingableAt?: Partial<Record<UserId, number>>;
  /**
   * How loudly this channel may interrupt **the viewer**, and nobody else.
   *
   * One person's own setting, never the roster's. What somebody has chosen to
   * be told about is not a fact about the channel, and a snapshot carrying
   * everybody's would make "has muted this" readable by the people it is about
   * — which is a different feature, and not one anybody asked for.
   *
   * Optional, so a client older than the field simply does not see it. Absent
   * means `DEFAULT_NOTIFICATION_LEVEL`, which is also what the server assumes
   * for anybody who has never touched it, so the missing case and the untouched
   * case agree.
   */
  notificationLevel?: NotificationLevel;
  serverNow: number;
}

/**
 * A channel as a guest sees it, which is deliberately not `ChannelView`.
 *
 * That type carries the description, the floor timeline, the recording state,
 * the playback state and the channel's recordings. Sending all of it to a
 * stranger and hiding the parts they may not have is the same mistake as a
 * greyed-out button the server does not enforce: the information has already
 * left the building. So a guest gets a projection of their own, and it is
 * small.
 *
 * What is in it is what a person in a room needs in order not to be confused
 * about their own situation: what this place is called, who else is here, and
 * whether they are being heard.
 */
export interface GuestView {
  channelId: string;
  /**
   * The channel's name, or the roster description members would see when
   * nobody has named it. Resolved here rather than sent as a null, because a
   * guest has no roster to fall back on.
   */
  channelName: string;
  /** Their own id, name, and standing. */
  you: {
    id: string;
    name: string;
    /**
     * Where their microphone stands, which is the one thing beyond the roster
     * that has to be on screen.
     *
     * `'listening'` — no grant and nothing asked. `'asking'` — asked, nobody
     * has answered. `'refused'` — asked, and a member said no. `'open'` — the
     * microphone is theirs and live. `'muted'` — granted, and they have muted
     * themselves.
     *
     * Silently withholding this is how somebody talks into a room that cannot
     * hear them, or worse, believes themselves muted when they are not.
     */
    mic: 'listening' | 'asking' | 'refused' | 'open' | 'muted';
    /** Whether they hold the floor. */
    holdingFloor: boolean;
    /** Whether somebody else holds it, so they are not being heard. */
    silenced: boolean;
    /** Whether they may claim it right now. */
    canClaimFloor: boolean;
  };
  /**
   * Everybody else in the room: members by name, and any other guests. Names
   * only — no ids that mean anything elsewhere, no bios, no profiles.
   */
  others: Array<{ name: string; kind: 'member' | 'guest'; speaking: boolean }>;
  /**
   * Whether a recording is capturing right now, and therefore capturing them.
   *
   * On screen continuously while it is true, which is half of what makes this
   * consent rather than a surprise; the other half is said on the way in,
   * before the microphone can open.
   */
  recording: boolean;
  /** The channel's clipboard, which a guest may read and replace. */
  clip: Clip | null;
  serverNow: number;
}

/** What the guest page may ask for. The server supplies the actor. */
export type GuestAction =
  | { type: 'STEP_OUT' }
  | { type: 'CLAIM_FLOOR' }
  | { type: 'RELEASE_FLOOR' }
  | { type: 'SET_SELF_MUTE'; muted: boolean }
  | { type: 'REQUEST_SPEECH' }
  | { type: 'PASTE_CLIP'; text: string }
  | { type: 'CLEAR_CLIP' };

/**
 * The guest page's half of its socket.
 *
 * A separate protocol from `ClientMessage` rather than a mode of it, for the
 * same reason `GuestView` is a separate type: what a guest may say is a short
 * list, and a shared union would make it a long list with most of it refused
 * at runtime.
 */
export type GuestClientMessage =
  /** Ask to be let in, having arrived with a link. */
  | { type: 'knock'; name: string }
  | { type: 'action'; action: GuestAction }
  | { type: 'ping' };

export type GuestServerMessage =
  /**
   * The door: this is the channel the link opens, and whether there is
   * anybody inside to answer. `occupied: false` is not a refusal — it is what
   * the page says instead of leaving somebody knocking at an empty room.
   */
  | { type: 'door'; channelName: string; occupied: boolean }
  /** Somebody has been told you are here. */
  | { type: 'knocking' }
  /**
   * You are in. `secret` is the reconnection credential, and this is the only
   * time it exists in the clear — the page keeps it so that a dropped
   * connection, or a deploy, does not mean knocking again.
   */
  | {
      type: 'admitted';
      guestId: string;
      secret: string;
      media: { url: string; token: string } | null;
    }
  /** A member said no, or removed you. */
  | { type: 'refused'; reason: string }
  | { type: 'guest'; view: GuestView }
  /**
   * Your publish grant changed, so the page must open or close the
   * microphone. Carried separately from the view because acting on it is a
   * device operation rather than a re-render.
   */
  | { type: 'speech'; maySpeak: boolean }
  | { type: 'error'; message: string }
  | { type: 'pong'; serverNow: number };

/** Channel mutations. The server supplies the actor. */
export type ClientAction =
  | { type: 'ENTER' }
  /** Give up presence, keep membership. */
  | { type: 'STEP_OUT' }
  /**
   * Destroy the channel and every recording made in it. Only its last member
   * may — everyone else leaves instead, and the last member cannot.
   */
  | { type: 'DELETE_CHANNEL' }
  /** Give up membership; ends the channel if you were the last member. */
  | { type: 'LEAVE_CHANNEL' }
  /**
   * Brings a contact of the sender into the channel. Carries a contact id
   * rather than the reducer's inviteeId because whether the two are contacts
   * is the server's check to make before the reducer ever sees it.
   */
  | { type: 'INVITE'; contactId: string }
  /** Names or renames the channel; an empty string clears the name. */
  | { type: 'SET_NAME'; name: string }
  /** Writes the channel's Markdown description; an empty string clears it. */
  | { type: 'SET_DESCRIPTION'; description: string }
  | { type: 'CLAIM_FLOOR' }
  | { type: 'RELEASE_FLOOR' }
  | { type: 'SET_SELF_MUTE'; muted: boolean }
  | { type: 'START_RECORDING' }
  | { type: 'PAUSE_RECORDING' }
  | { type: 'RESUME_RECORDING' }
  | { type: 'STOP_RECORDING' }
  /**
   * Shared playback. Loading a track is absent by design — it arrives as an
   * upload over HTTP, and the server dispatches SET_TRACK itself once the file
   * is on disk and its duration is known. A client naming its own track would
   * be naming a file the server has never seen.
   */
  | { type: 'CLEAR_TRACK' }
  | { type: 'PLAY' }
  | { type: 'PAUSE' }
  | { type: 'SEEK'; positionMs: number }
  | { type: 'SET_VOLUME'; volume: number }
  /**
   * Puts text on the channel's clipboard. Carries the text and nothing else:
   * the id, the author and the timestamp are the server's to mint, the same
   * distinction INVITE draws above.
   *
   * Unlike a track, this does not arrive over HTTP. It is small enough to ride
   * in the channel snapshot, so there is nothing on disk for a route to have
   * put there first.
   */
  /**
   * Starts a watch party on a pasted link.
   *
   * Carries the URL as typed and nothing else. The server parses it — with
   * `parseYouTubeUrl`, the same function the app used to decide whether to
   * offer the button — and dispatches the reducer's `START_WATCH` with the id
   * it got, so a client cannot name a video by an id nobody has checked.
   */
  | { type: 'START_WATCH'; url: string }
  | { type: 'STOP_WATCH' }
  | { type: 'WATCH_PLAY' }
  | { type: 'WATCH_PAUSE' }
  | { type: 'WATCH_SEEK'; positionMs: number }
  /**
   * Withholds every microphone in the room for the length of the party, or
   * gives them all back. Distinct from `SET_SELF_MUTE` in both directions:
   * clearing this restores each person's own mute as they set it.
   */
  | { type: 'SET_WATCH_MUTE'; muted: boolean }
  /**
   * A follower's player reporting how long the video is. Sent by the follower
   * page and by nothing else — it is the one action a watch-scoped socket may
   * send, and the only fact about a party that does not originate here.
   */
  | { type: 'WATCH_READY'; durationMs: number }
  | { type: 'PASTE_CLIP'; text: string }
  | { type: 'CLEAR_CLIP' }
  /**
   * Answers somebody at the door. Carries the knock rather than a person,
   * there being no person yet — an id and a secret are minted on acceptance
   * and go to the page that knocked.
   */
  | { type: 'ANSWER_KNOCK'; knockId: string; accept: boolean }
  /** Grants or withdraws a guest's microphone. */
  | { type: 'SET_GUEST_SPEECH'; guestId: string; maySpeak: boolean }
  /** Removes a guest, and revokes the link they came through. */
  | { type: 'EJECT_GUEST'; guestId: string };

export type ClientMessage =
  /** Start receiving Home snapshots. */
  | { type: 'watch.home' }
  /** Start receiving snapshots for one channel. */
  | { type: 'watch.channel'; channelId: string }
  | { type: 'unwatch.channel'; channelId: string }
  | { type: 'channel.action'; channelId: string; action: ClientAction }
  /**
   * Heartbeat. Sent by the client because React Native's WebSocket cannot send
   * protocol-level pings, so a single application-level exchange is what lets
   * *both* ends notice a connection that has died quietly.
   */
  | { type: 'ping' };

export type ServerMessage =
  | {
      type: 'hello';
      account: PublicAccount;
      serverNow: number;
      /**
       * Whether this account sees the audio diagnostic panel — the `debug`
       * column on `accounts`, which is null for everybody until somebody sets
       * it by hand.
       *
       * **Here rather than on `PublicAccount`, which is the whole reason this
       * is not one line shorter.** That type is embedded in every roster,
       * invitation and recording row that crosses the wire, so putting it
       * there would tell you which of your contacts is running a diagnostic —
       * a fact about them, broadcast to everyone who can see their name, in
       * service of a panel only they will ever look at. `hello` is the one
       * message that is about you and goes only to you.
       *
       * **Optional, and sent only when true**, which is what lets the server
       * deploy before any client can read it: a build that has never heard of
       * this field is unaffected, and one that has reads absent as false.
       * Nothing is gated on it but a display, so a client that ignores it
       * loses nothing it was entitled to.
       */
      debug?: boolean;
      /**
       * Whether this account may see the invitation standings — the
       * `leaderboard` column on `accounts`, null for everybody until somebody
       * sets it by hand.
       *
       * Here, and optional-when-true, for both of the reasons `debug` above
       * is: it is a fact about you rather than part of the identity every
       * roster carries, and a field a server can start sending before any
       * client reads it.
       *
       * **Unlike `debug`, this one gates more than a display.** The route it
       * unlocks refuses anybody without the column set, so a client that
       * ignored this and asked anyway would be refused — the flag says whether
       * to offer the screen, and the server decides whether to answer it.
       */
      leaderboard?: boolean;
    }
  | { type: 'home'; home: HomeView }
  | { type: 'channel'; view: ChannelView }
  /** The channel ended or is no longer visible to this user. */
  | { type: 'channel.gone'; channelId: string }
  /**
   * The conversation you were in has moved, because somebody was asked into an
   * unnamed channel and arrived. `to` is where the people are now; `from` is
   * still there, still yours, and still holds whatever was recorded in it.
   *
   * Sent instead of `channel.gone` so the app can follow rather than fall back
   * to Home. The audio needs no attention: the destination inherits the room,
   * so a client that switches what it watches and re-renders has already done
   * everything the move requires of it.
   */
  | { type: 'channel.moved'; from: string; to: string }
  /**
   * This session is no longer the one standing anywhere, because another of
   * this account's devices has entered a channel or left the one the account
   * was in.
   *
   * The two are one message because they are one fact from the receiver's
   * side, and because the alternative — telling a session only about arrivals
   * — leaves it believing it is present somewhere the account has left. That
   * belief is not inert: a client re-enters from it on its next connection, so
   * a Step Out on one device is undone by another device reconnecting.
   *
   * An account may hold several sessions at once, but it has one voice and one
   * pair of ears: presence belongs to whichever session entered a channel most
   * recently. The server steps the account out of every *other* channel by
   * itself, and the snapshot says so — what a snapshot cannot say is that two
   * devices are in the *same* channel, since the account is present either
   * way and nothing about the channel has changed. That is the case this
   * exists for, and it is handled the same way as the other so there is one
   * rule rather than two.
   *
   * It names no channel deliberately. What it means is about this session
   * rather than about a room: stop standing wherever you were standing, which
   * a client answers by dropping its audio and forgetting what it would
   * re-enter on a reconnect. Naming a channel would invite a client to check
   * whether it agreed, and a client that disagreed would be the one holding an
   * open microphone.
   *
   * Sent to every session of the account but the one that acted, identified
   * by its token rather than by its socket — a device that is reconnecting
   * briefly has two sockets, and displacing the older of them would let a flap
   * take the room away from the device somebody is holding.
   */
  | { type: 'displaced' }
  | { type: 'error'; message: string; code?: string }
  | { type: 'pong'; serverNow: number };
