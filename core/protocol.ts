import type { ChannelState, UserId } from './types';

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
  serverNow: number;
}

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
  | { type: 'SET_VOLUME'; volume: number };

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
  | { type: 'error'; message: string; code?: string }
  | { type: 'pong'; serverNow: number };
