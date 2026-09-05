import { connect, constants, type ClientHttp2Session } from 'node:http2';
import { createPrivateKey, sign, type KeyObject } from 'node:crypto';

import { PRESENCE_LIFETIME_MS } from '../../core/constants';
import { ANDROID_CHANNEL_IDS } from '../../core/notifications';
import type {
  NotificationAlert,
  NotificationKind,
} from '../../core/notifications';

/**
 * Re-exported rather than defined here, where it was written until 2026-08-26.
 * The app needs it too — Home's "stepped in" mark fades on this window — and a
 * constant both ends must agree on belongs in `core`. Every existing importer
 * of it from this module keeps working.
 */
export { PRESENCE_LIFETIME_MS } from '../../core/constants';

/**
 * How long a change to who belongs to a channel stays worth delivering.
 *
 * Long, because what these announce does not stop being true. Being asked into
 * a channel **makes you a participant immediately** — `dispatch` says so where
 * it refuses everybody else — so the notification reports a state the server is
 * still holding when the phone comes back, rather than a moment that has
 * passed. A presence announcement delivered late is a lie; an invitation
 * delivered late is merely late.
 *
 * **Thirty days rather than never, because APNs has no never.**
 * `apns-expiration` is a timestamp, and its one special value is 0, which means
 * the opposite of what is wanted here — attempt once, store nothing. So a
 * far-future date is the only way to say "keep trying", and thirty days is past
 * the point where a phone that has been off that long makes the invitation
 * stale on its own account.
 */
export const PARTICIPATION_LIFETIME_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * The stack that somebody asking for you lands in.
 *
 * Shared by `invited` and `pinged` across every channel, which is the seam this
 * app turned out to want and is not the one the rest of this file is organised
 * around: those are the ones where **a person did something aimed at you** —
 * added you to a channel, or called you into one. `arrived` is the only one that is merely the room
 * reporting its own state, and it keeps a stack per channel.
 *
 * So a phone shows at most two kinds of pile: somebody wants you, and this
 * room is busy. Reading a lock screen becomes one question rather than one per
 * channel.
 *
 * Not a channel id, deliberately, and it is worth saying why the cross-channel
 * mixing is the point rather than the cost. Being asked for is about the
 * asking; which room it was in is what you find out by tapping. A pile per
 * channel would answer "where" first and "is anybody asking" not at all.
 */
export const ASKING_THREAD = 'asking-for-you';

/**
 * Delivery of notifications to a device whose app is not running.
 *
 * Kept behind an interface for the same reasons `Mailer` is: the transport is
 * the only thing that needs credentials, local development should not need
 * any, and tests should be able to assert what would have been sent without a
 * network. Android will arrive later as a second implementation rather than a
 * rewrite of the callers.
 */
export interface PushMessage {
  title: string;
  body: string;
  /**
   * Where a tap should land.
   *
   * Also the collapse key and the thread key, so repeated activity in one
   * channel replaces its predecessor on the lock screen instead of stacking.
   */
  channelId: string;
  /**
   * What this replaces on the lock screen, or null if it replaces nothing.
   *
   * APNs shows one notification per collapse key and discards the rest — and
   * *replaces* one already sitting on the lock screen, not merely one still in
   * flight. So this decides what a new notification destroys.
   *
   * **Two keys per channel, drawn on what stays true**, which is the same seam
   * the lifetimes use and deliberately not the one the rest of this file is
   * organised around. `channelId` carries presence, where a room that fills and
   * empties all evening should leave one line rather than nine: the later
   * notification is a better version of the earlier one, being the same room,
   * later. `${channelId}:you` carries the two that change who *belongs* to a
   * channel, and nothing about the room may overwrite those.
   *
   * **They shared one key until 2026-08-22, and an arrival could destroy an
   * invitation.** Somebody was invited to a channel, and ten minutes later
   * somebody else stepped into it — same key, so the lock screen stopped
   * reading "Alice invited you to Standup" and started reading "Standup —
   * Carol stepped in". The only notification telling that person they had been
   * added to a channel was overwritten by one that expires in five minutes and
   * says something else. That is the same defect as collapsing pings together,
   * one rung down: a notification that stays true discarded by one that does
   * not.
   *
   * Only `invited` uses the second key now. It shared it with `started` until
   * the two were folded together — a pair safe to collapse into each other for
   * the same reason they were safe to merge outright: being invited to a
   * channel you were just added to does not happen.
   *
   * **Null for a ping, and that is the whole of the rule.** Each one carries
   * words somebody chose, so no two are versions of each other and there is
   * nothing a later one is entitled to say on an earlier one's behalf. A
   * collapse key here would discard a sentence a person wrote to somebody —
   * quietly, at Apple, after this server had reported success.
   *
   * Null rather than a key made unique per send, though the two behave alike.
   * A unique key is a collapse key that has been arranged never to collide,
   * which reads as an accident waiting to be tidied up; omitting the header is
   * how APNs is told, in its own vocabulary, that this notification stands on
   * its own. Grouping is untouched by any of this and is `threadId` below —
   * a ping stands alone *and* stacks with everything else asking for you,
   * which is only a contradiction if the two headers are confused for one.
   */
  collapseKey: string | null;
  /**
   * Which stack this joins in Notification Center.
   *
   * **Grouping, which is not replacing**, and the two are easy to conflate
   * because both take a string and both make a lock screen shorter. A collapse
   * key destroys what it lands on; a thread id gathers notifications into one
   * expandable pile and keeps every one of them. Nothing is ever lost here,
   * which is why this one can be shared freely where `collapseKey` cannot.
   *
   * `ASKING_THREAD` for the ones where somebody did something aimed at you,
   * whatever channel they did it in. The channel's own id for `arrived`, which
   * is the room talking about itself and belongs with the rest of that room.
   *
   * A tap still lands on the right channel either way: that comes from
   * `channelId` in the payload, which is a different thing again from both of
   * these.
   */
  threadId: string;
  /**
   * How long APNs should keep trying before discarding this undelivered.
   *
   * Carried per message rather than fixed by the transport, because they do not
   * decay alike and that difference is the point: two of them report who
   * *belongs* to a channel, which stays true, while the other two report that
   * somebody wants you there now, which does not. The constructors below choose
   * it; nothing else should have an opinion.
   */
  lifetimeMs: number;
  /**
   * Which of the four this is, as `notifications` below names them.
   *
   * Carried because the recipient's setting for this channel decides how it
   * arrives, and the setting is expressed per kind — a person who wants only
   * pings to make a sound is drawing a line between kinds, so something has to
   * know which side of it a given notification falls on. It is the only field
   * here that is about the notification's *identity* rather than its delivery.
   *
   * How loudly it actually arrives is not on this type at all. It is
   * `NotificationAlert`, resolved per recipient at the moment of sending,
   * because the same notification is delivered audibly to one person and
   * passively to another and there is no one answer to write down here.
   */
  kind: NotificationKind;
  /**
   * Whether this may reach somebody who is already holding a live socket.
   *
   * False for everything the channel says about itself. Those are duplicates
   * when the app is open — the socket has already put the arrival on screen
   * and the channel in the Home list — so a notification would be a second
   * copy of what somebody is looking at.
   *
   * True for a ping, and only for a ping, since 2026-08-22. It is the one
   * nobody's client can have already shown, because a person composed it and
   * aimed it, and being in the app is not evidence of having seen it. Somebody
   * pressed a button expecting a phone to buzz; the seam this rides on is the
   * same one the collapse key uses, which is the point — *who decided to send
   * it* turns out to decide both what may overwrite it and who it may reach.
   *
   * It travels in the payload as well as governing the send, because the app
   * makes the same decision again at the other end: `setNotificationHandler`
   * suppresses the banner for a foregrounded app, and a ping that arrives
   * silently into Notification Center has been delivered without being
   * received.
   */
  reachesInApp: boolean;
}

/**
 * The notifications this server sends, each with a name.
 *
 * There were three for a long time and none of them was called anything: each
 * was a title and a body composed at the point it was sent, two of them in
 * `create` and `dispatch` and the third four hundred lines away in
 * `announceActive`. Nothing was wrong with that except that there was no way
 * to *refer* to one — a question about a whole class of them had to be asked
 * about a fragment of prose, and answering it meant finding every site that
 * happened to compose the same sentence.
 *
 * The names are words the code already used rather than new coinages.
 * `invited` is the first word of the body it sends, so the name and the
 * sentence on the lock screen cannot drift apart; `arrived` is what
 * `announceActive` already calls the person walking in.
 *
 * - `invited` — somebody added you to a channel: one already under way, or one
 *   that did not exist until they made it with you. Those were two
 *   notifications until 2026-08-22 and are one now; see the constructor.
 * - `arrived` — somebody stepped into a channel you already belong to. Nobody
 *   is asking for you; the room simply has someone in it.
 * - `pinged` — somebody in a channel asked for you by name, in their own words.
 *   The only one a person sits down and decides to send.
 *
 * **Two seams, and they do not fall in the same place**, which is why the names
 * earn their keep rather than merely tidying.
 *
 * By *what stays true*: `invited` changes who belongs to a channel and goes on
 * being true while a phone is off, so it gets a month. `arrived` and `pinged`
 * both say come now, which stops being worth saying almost at once, so they
 * get five minutes.
 *
 * By *who decided to send it*: `pinged` is the only one a person composed. The
 * others are the channel reporting on itself, which is what lets them
 * overwrite one another on the lock screen — one line about a room that filled
 * and emptied all evening is a mercy. That is not safe for something somebody
 * typed and aimed, so `pinged` collapses into nothing and nothing collapses
 * into it.
 *
 * That second seam decides two things rather than one, which is what makes it
 * worth having found. What may overwrite a notification and who a notification
 * may reach turn out to be the same question asked twice: the automatic
 * ones are safe to overwrite *because* they are the channel repeating itself,
 * and for that same reason they are withheld from anybody whose socket has
 * already drawn what they describe, and — at the default level — for that same
 * reason again they arrive without a sound. A ping is none of those, so it
 * overwrites nothing, it is delivered whether or not the app is open, and it
 * is the one that makes a noise.
 *
 * **Two fields rather than one `isPing`, and that is not an oversight.**
 * `collapseKey` and `reachesInApp` agree today because one distinction happens
 * to govern both, but each answers a different question — what may be
 * discarded, and what would be a duplicate — and the answers are not bound to
 * stay together. A notification that ought to arrive quietly and never be
 * overwritten is easy to imagine; the fields can say that and a predicate
 * cannot.
 *
 * **Loudness left this type on 2026-08-22 and is the reason `kind` arrived.**
 * It sat here as `audible: boolean` for exactly as long as it was a property
 * of the notification. Once each person could set a level per channel it
 * stopped being one: the same arrival is audible to somebody who asked for
 * everything and passive to somebody who did not, so there is no value a
 * constructor could honestly write down. `kind` says which of the four this
 * is; `alertFor` in core turns that plus the recipient's level into how it
 * lands; and the answer travels as an argument to `send` rather than as a
 * field, because it describes one delivery to one person.
 *
 * Cut the set either way and the members swap sides. That is the argument for
 * naming them rather than sorting them into two piles once.
 *
 * They compose messages and send nothing. Deciding that somebody should be
 * told remains the registry's, exactly as before.
 */
export const notifications = {
  /**
   * You have been added to a channel, whether or not it existed a moment ago.
   *
   * `channelName` is null when the channel has none, which is the ordinary
   * case: a channel is named only if somebody has bothered to.
   *
   * **This covers creation too, since 2026-08-22.** There was a fourth
   * notification, `started`, for the channel that did not exist until somebody
   * made it with you — and by the end of the day it differed from this one in
   * nothing a rule could see. Same collapse key, same thread, same month-long
   * lifetime, the same alert at every level, swept by neither. What remained
   * was one sentence, and a channel is never named at creation, so the
   * sentence it would have used is the one this already sends when there is no
   * name: *Invited you to a channel.* Two kinds that no rule separates are one
   * kind with two bodies, and this had the two bodies already.
   *
   * Titled with the person rather than the channel, which is the other half of
   * why it can absorb the case: at creation there is no name to use, and the
   * one thing the recipient wants to know is who is asking.
   */
  invited(
    inviter: string,
    channelName: string | null,
    channelId: string
  ): PushMessage {
    return {
      kind: 'invited',
      title: inviter,
      body: channelName
        ? `Invited you to ${channelName}.`
        : 'Invited you to a channel.',
      channelId,
      // Membership, which nothing about the room may overwrite. See the field.
      collapseKey: `${channelId}:you`,
      threadId: ASKING_THREAD,
      lifetimeMs: PARTICIPATION_LIFETIME_MS,
      reachesInApp: false,
    };
  },

  /**
   * Somebody stepped into a channel you belong to and were not in.
   *
   * `channelName` is what that one recipient calls it — an unnamed channel is
   * named after whoever else is in it, so there is no single answer and the
   * caller has to have resolved it already.
   */
  arrived(
    channelName: string,
    whoArrived: string,
    channelId: string
  ): PushMessage {
    return {
      kind: 'arrived',
      title: channelName,
      body: `${whoArrived} stepped in.`,
      channelId,
      collapseKey: channelId,
      // The one that stacks with its own room rather than with the people
      // asking for you, because that is what it is about.
      threadId: channelId,
      lifetimeMs: PRESENCE_LIFETIME_MS,
      reachesInApp: false,
    };
  },

  /**
   * Somebody in a channel asked for one particular absent person by name.
   *
   * The only one of the four a person decides to send. The other three are the
   * channel reporting on itself, which is why they may overwrite one another
   * freely; this one was typed and aimed, and is the reason `collapseKey` is a
   * field rather than a constant in the transport.
   *
   * **It is delivered whether or not the recipient has the app open**, which
   * the other three are not, and which this one was not until 2026-08-22. It
   * was withheld on the reasoning that the in-app path for a ping was being
   * built, and that routing a lock-screen notification into a foregrounded app
   * would be a workaround with a short life. What that missed is that the
   * in-app path had *not* been built, so withholding meant nothing happened at
   * all: somebody stepped out of a channel, was pinged, and never learned it,
   * while the log said `push skipped`, `all reachable in-app` and the sender
   * was told it had worked. Holding a socket is evidence that a duplicate
   * would be visible. It is not evidence that anybody has been told.
   *
   * The five-minute window is what makes this safe to say plainly. It bounds
   * *sending* rather than delivery, so a ping the server accepts is a ping that
   * arrives and the sender is never misled. Before this, the window was spent
   * on notifications nobody received: the run of refusals that followed one
   * undelivered ping was the feature working exactly as written.
   *
   * Titled with the channel and not the sender, unlike `invited`. That one
   * announces a channel you may not know exists, so the person is the useful
   * half; this arrives about a channel you are already a member of, and what
   * you want to know first is where you are being called to. The sender leads
   * the body instead.
   *
   * `text` is optional and is the sender's own words. Without it the ping still
   * says something worth saying — somebody wants you there — so an empty
   * composer is a usable ping rather than a refused one.
   *
   * It keeps the presence lifetime: a summons is not an invitation. Being asked
   * to come now stops being actionable at about the speed "somebody is here"
   * does, and a ping surfacing tomorrow about a conversation that ended is
   * worse than one that quietly lapsed.
   */
  pinged(
    channelName: string,
    sender: string,
    text: string | null,
    channelId: string
  ): PushMessage {
    return {
      kind: 'pinged',
      title: channelName,
      // The sender's name leads either way, so the two forms read alike and a
      // ping with words is recognisably the same thing as one without.
      body: text ? `${sender}: ${text}` : `${sender} is asking for you.`,
      channelId,
      // Replaces nothing, and is replaced by nothing. Every other notification
      // here is the channel restating itself and may be overwritten by a later
      // restatement; a ping is a sentence somebody wrote. See the field.
      collapseKey: null,
      // Stands alone, and stacks with everything else asking for you. The
      // headers are independent; see `threadId`.
      threadId: ASKING_THREAD,
      lifetimeMs: PRESENCE_LIFETIME_MS,
      // The only one of the four that is delivered to a phone whose app is
      // open. See the field.
      reachesInApp: true,
    };
  },
};

/** What one address's send did, for the caller to log. */
export interface PushResult {
  token: string;
  /** The HTTP status Apple answered with, or 0 if nothing was reached. */
  status: number;
  /** Apple's machine-readable refusal, when it gave one. */
  reason?: string;
  /** Why the request never completed, when it did not. */
  error?: string;
  /** Whether this address should be forgotten. */
  dead: boolean;
}

export interface Pusher {
  /**
   * Sends to every address given.
   *
   * Resolves to what happened per address. It never rejects: a notification is
   * a courtesy, and nothing upstream should fail because a push did.
   *
   * **It reports rather than swallows.** The first version returned only the
   * dead tokens and caught everything else, which meant APNs could refuse
   * every notification and leave no trace anywhere — the failure looked
   * identical to nothing having been sent, and cost an evening to tell apart.
   */
  /**
   * `alert` is a property of this *delivery* rather than of the message, which
   * is why it is an argument and not a field. One arrival is audible to the
   * person who asked to hear everything and passive to the person who did not,
   * and both are the same notification — so the tokens passed here are the
   * ones that share an answer, and a caller with two answers makes two calls.
   */
  send(
    tokens: string[],
    message: PushMessage,
    alert: NotificationAlert
  ): Promise<PushResult[]>;
}

/**
 * Reaching people from code that must not know how notifications work.
 *
 * `ChannelRegistry` decides *that* something is worth telling somebody about;
 * it has no business knowing about device tokens, Apple, or who happens to
 * have the app open. The same separation `HomeNotifier` makes for the socket
 * layer, and for the same reason: created before the pieces it needs exist,
 * so it starts as a no-op and is filled in once they do.
 */
export interface PushNotifier {
  notify: (userIds: string[], message: PushMessage) => void;
}

export function createPushNotifier(): PushNotifier {
  return { notify: () => {} };
}

export interface ApnsPusherOptions {
  /** Contents of the `.p8`, as downloaded. */
  key: string;
  /** The Key ID from the developer portal. */
  keyId: string;
  /** The Team ID the key belongs to. */
  teamId: string;
  /** The app's bundle identifier, which APNs calls the topic. */
  bundleId: string;
  /**
   * Which APNs to talk to.
   *
   * `sandbox` for anything built by `expo run:ios`, `production` for TestFlight
   * and the App Store. **A device token minted under one is refused outright by
   * the other**, and the refusal is an unadorned `BadDeviceToken` that says
   * nothing about the environment being the cause.
   */
  environment: 'sandbox' | 'production';
}

const HOSTS = {
  production: 'https://api.push.apple.com',
  sandbox: 'https://api.sandbox.push.apple.com',
} as const;

/**
 * Apple rejects a provider token older than an hour, and throttles a provider
 * that mints them more often than every twenty minutes. Fifty minutes sits
 * clear of both.
 */
const JWT_TTL_MS = 50 * 60 * 1000;

/** How long to wait for one notification before giving up on it. */
const REQUEST_TIMEOUT_MS = 10_000;

export class ApnsPusher implements Pusher {
  private privateKey: KeyObject;
  private host: string;
  private session: ClientHttp2Session | null = null;
  private jwt: { token: string; mintedAt: number } | null = null;

  constructor(
    private options: ApnsPusherOptions,
    private now: () => number = Date.now
  ) {
    this.privateKey = createPrivateKey(options.key);
    this.host = HOSTS[options.environment];
  }

  async send(
    tokens: string[],
    message: PushMessage,
    alert: NotificationAlert
  ): Promise<PushResult[]> {
    if (tokens.length === 0) return [];
    return Promise.all(
      tokens.map((token) => this.sendOne(token, message, alert))
    );
  }

  /** Releases the connection. Called when the server shuts down. */
  close(): void {
    this.session?.close();
    this.session = null;
  }

  private async sendOne(
    token: string,
    message: PushMessage,
    alert: NotificationAlert
  ): Promise<PushResult> {
    const payload = JSON.stringify({
      aps: {
        alert: { title: message.title, body: message.body },
        // Omitted rather than set to something silent: there is no quiet
        // sound, and an absent key is how APNs is told to deliver the banner
        // without the tone or the vibration that goes with it.
        ...(alert === 'audible' ? { sound: 'default' } : {}),
        // Only ever the rung *below* the default, and only when asked for.
        // `active` is what an omitted key already means, and the two rungs
        // above it — `time-sensitive` and `critical` — pierce a Focus mode and
        // the ring switch, need entitlements, and are not this app's to claim.
        ...(alert === 'passive' ? { 'interruption-level': 'passive' } : {}),
        // Grouping, not replacing, and chosen per kind: the ones that mean
        // somebody is asking for you share one stack across every channel,
        // and an arrival stacks with its own room. See `threadId`.
        'thread-id': message.threadId,
      },
      channelId: message.channelId,
      // Read by the app to decide whether to show a banner over itself. Sent
      // as the same word the server filtered on, so the two ends cannot come
      // to different conclusions about what this notification is for.
      reachesInApp: message.reachesInApp,
      // And how loudly it was meant to arrive, which the app needs for the
      // same decision: a passive ping is one somebody asked not to be
      // interrupted by, and putting a banner over the app they are holding
      // would be exactly the interruption they declined.
      alert,
      // Which of the four, so the app can tidy up after them. iOS never
      // expires a notification it has already delivered — `apns-expiration`
      // bounds retrying, not display — so an arrival announcing a room that
      // emptied hours ago sits there until something removes it, and only the
      // app can. Removing the right ones means telling them apart, and a
      // notification is otherwise opaque to the phone that is holding it.
      kind: message.kind,
    });

    try {
      const { status, reason } = await this.request(
        token,
        message,
        payload,
        alert
      );
      return { token, status, reason, dead: isDeadToken(status) };
    } catch (error) {
      // A transport failure says nothing about the token, so the row stays.
      return {
        token,
        status: 0,
        error: error instanceof Error ? error.message : String(error),
        dead: false,
      };
    }
  }

  private request(
    token: string,
    message: PushMessage,
    payload: string,
    alert: NotificationAlert
  ): Promise<{ status: number; reason?: string }> {
    return new Promise((resolve, reject) => {
      const stream = this.connection().request({
        [constants.HTTP2_HEADER_METHOD]: 'POST',
        [constants.HTTP2_HEADER_PATH]: `/3/device/${token}`,
        authorization: `bearer ${this.authToken()}`,
        'apns-topic': this.options.bundleId,
        'apns-push-type': 'alert',
        // Delivered immediately. The alternative, 5, lets iOS batch for
        // battery, which is the wrong trade for an announcement that expires
        // in five minutes.
        //
        // Except for a passive announcement about the room, where 5 is the
        // honest header: somebody who set this channel to arrive quietly is
        // not owed a radio waking for the news that it filled up.
        //
        // **Never for a ping, whatever level it is arriving at**, and the
        // exception was missing for an hour. Priority 5 lets iOS defer
        // delivery while the five-minute expiry keeps running, so the two
        // compound: the phone least likely to be awake belongs to the person
        // who turned the channel down, and the outcome is not a quiet ping but
        // no ping and no record that one was sent. `low` says do not interrupt
        // me. It does not say throw away what people write to me — and the
        // difference between quieting something and losing it is the whole of
        // why a ping does not collapse either.
        'apns-priority':
          alert === 'passive' && message.kind !== 'pinged' ? '5' : '10',
        // Omitted entirely when the message replaces nothing. APNs has no
        // value meaning "collapse with nothing" — the absence of the header is
        // how that is said, and a key invented to be unique would say it by
        // arithmetic instead.
        ...(message.collapseKey === null
          ? {}
          : { 'apns-collapse-id': message.collapseKey }),
        // Whose window the message brought with it. Never zero, which APNs
        // reads as "attempt once and store nothing" rather than as "no
        // expiry" — the two are easy to conflate and mean opposite things.
        'apns-expiration': String(
          Math.floor((this.now() + message.lifetimeMs) / 1000)
        ),
      });

      let status = 0;
      let body = '';
      stream.setEncoding('utf8');
      stream.setTimeout(REQUEST_TIMEOUT_MS, () => {
        stream.close();
        reject(new Error('APNs request timed out'));
      });
      stream.on('response', (headers) => {
        status = Number(headers[constants.HTTP2_HEADER_STATUS]) || 0;
      });
      stream.on('data', (chunk: string) => {
        body += chunk;
      });
      stream.on('error', reject);
      stream.on('end', () => {
        let reason: string | undefined;
        try {
          reason = body ? (JSON.parse(body).reason as string) : undefined;
        } catch {
          reason = undefined;
        }
        resolve({ status, reason });
      });
      stream.end(payload);
    });
  }

  /**
   * The HTTP/2 session, opened on first use and reused after.
   *
   * One session per notification would be slow and is something Apple
   * throttles; it expects a provider to hold a connection open. Cleared on
   * close so the next send reconnects rather than writing into a dead session.
   */
  private connection(): ClientHttp2Session {
    if (this.session && !this.session.closed && !this.session.destroyed) {
      return this.session;
    }
    const session = connect(this.host);
    session.on('error', () => {
      if (this.session === session) this.session = null;
    });
    session.on('close', () => {
      if (this.session === session) this.session = null;
    });
    this.session = session;
    return session;
  }

  /** The provider authentication token, minted at most every fifty minutes. */
  private authToken(): string {
    const now = this.now();
    if (this.jwt && now - this.jwt.mintedAt < JWT_TTL_MS) return this.jwt.token;
    const token = mintProviderToken(
      this.privateKey,
      this.options.keyId,
      this.options.teamId,
      now
    );
    this.jwt = { token, mintedAt: now };
    return token;
  }
}

/**
 * Whether Apple's answer means this address should be forgotten.
 *
 * **410 Unregistered, and only that.** It is the one unambiguous way Apple says
 * "this install is gone", so the row is a dead address and keeping it costs a
 * round trip on every future send.
 *
 * 400 `BadDeviceToken` is deliberately *not* included, though it reads like it
 * should be. Apple returns it both for a token that never existed and for a
 * perfectly good token presented to the wrong environment — verified against
 * the real service, where production accepted a token that sandbox refused with
 * exactly this. Pruning on it would turn one wrong `APNS_ENV` into every device
 * in the database being forgotten, and every person having to relaunch the app
 * before they could be reached again. A misconfiguration should cost delivery
 * until it is fixed, not data.
 */
export function isDeadToken(status: number): boolean {
  return status === 410;
}

/**
 * The JWT APNs accepts in place of a certificate.
 *
 * **The signature must be raw `r||s`, not DER.** Node's default ECDSA encoding
 * is DER, which APNs answers with a bare `InvalidProviderToken` naming nothing
 * about the encoding — the single most common way a hand-written APNs sender
 * fails, and the reason this is exported rather than buried: it is worth an
 * assertion that does not need a round trip to Apple.
 * `dsaEncoding: 'ieee-p1363'` is what makes it the 64 bytes JWS specifies.
 *
 * The claims are the same whether the key is team-scoped or bound to one
 * topic. Scoping is enforced by Apple against the key; the topic itself
 * travels in the `apns-topic` header.
 */
export function mintProviderToken(
  key: KeyObject,
  keyId: string,
  teamId: string,
  now: number
): string {
  const header = base64url(JSON.stringify({ alg: 'ES256', kid: keyId }));
  const claims = base64url(
    JSON.stringify({ iss: teamId, iat: Math.floor(now / 1000) })
  );
  const signature = sign('sha256', Buffer.from(`${header}.${claims}`), {
    key,
    dsaEncoding: 'ieee-p1363',
  });
  return `${header}.${claims}.${signature.toString('base64url')}`;
}

function base64url(value: string): string {
  return Buffer.from(value).toString('base64url');
}

export interface FcmPusherOptions {
  /** The Firebase project the app belongs to, which names the send endpoint. */
  projectId: string;
  /** The service account's address, which is the JWT's issuer and subject. */
  clientEmail: string;
  /** Its PEM private key, as it appears in the downloaded JSON. */
  privateKey: string;
}

/** Where an access token is exchanged for, and what is sent through. */
const FCM_TOKEN_HOST = 'https://oauth2.googleapis.com/token';
const FCM_SEND_HOST = 'https://fcm.googleapis.com';

/** The one scope this needs. Narrow deliberately; it can only send. */
const FCM_SCOPE = 'https://www.googleapis.com/auth/firebase.messaging';

/**
 * Google issues an hour, and this refreshes at fifty minutes on `JWT_TTL_MS`'s
 * reasoning — clear of the expiry, and not so often that the exchange shows up
 * in the cost of sending.
 */
const FCM_TOKEN_TTL_MS = 50 * 60 * 1000;

/**
 * The longest `ttl` FCM accepts: four weeks, in seconds.
 *
 * **`PARTICIPATION_LIFETIME_MS` is thirty days and so exceeds it**, which is
 * not an oversight in either place. Thirty days is an APNs-shaped number —
 * chosen because `apns-expiration` has no value meaning "keep trying" and a
 * far-future date is the only way to say it — and it stays thirty days because
 * that reasoning is still right for Apple. Google simply has a smaller
 * ceiling, so the clamp is this transport's business rather than a reason to
 * move the constant.
 *
 * Unclamped this is not a quiet loss of two days: FCM rejects the whole
 * message with `INVALID_ARGUMENT`, so **every invitation to an Android device
 * would fail**, and it would fail identically to a malformed token.
 */
const FCM_MAX_TTL_SECONDS = 4 * 7 * 24 * 60 * 60;

/**
 * The second sender, for Android.
 *
 * **A sibling of `ApnsPusher` rather than a generalisation of it**, which is
 * what this file said would happen when it was written: "Android will arrive
 * later as a second implementation rather than a rewrite of the callers." The
 * two share the `Pusher` interface and `PushMessage` and nothing else, because
 * almost nothing else *is* shared — the transport, the authentication, the
 * message shape and the meaning of every failure code all differ. A common
 * base class would have one honest method on it and a great deal of
 * `if (apns)`.
 *
 * **The authentication is the difference worth knowing before reading the
 * code.** APNs takes a JWT this server signs and uses it directly as the
 * bearer: no round trip, and the key never leaves the process. Google will not
 * take a self-signed assertion as a credential — it must be exchanged at
 * `oauth2.googleapis.com` for an access token, which is what the send then
 * carries. So there is a network call in the authentication path that has no
 * APNs counterpart, and it is cached for the same reason APNs's JWT is: to
 * keep it off the per-notification path.
 *
 * `fetch` rather than a client library, on the same reasoning that produced a
 * hand-written APNs provider — see DECISIONS § *Direct APNs rather than Expo's
 * push service*. `firebase-admin` would bring a large dependency to compose a
 * JSON object and sign a JWT, and its `sendEach` is a client-side loop over
 * exactly the request made below, since FCM v1 has no multicast.
 */
export class FcmPusher implements Pusher {
  private privateKey: KeyObject;
  private accessToken: { token: string; mintedAt: number } | null = null;
  private pending: Promise<string> | null = null;

  constructor(
    private options: FcmPusherOptions,
    private now: () => number = Date.now,
    /** Injected so the tests can watch what would go to Google. */
    private fetchImpl: typeof fetch = fetch
  ) {
    // Service-account JSON carries the newlines escaped. A key that arrives
    // through an environment variable has usually lost them a second time,
    // and `createPrivateKey` rejects it with nothing that names the cause.
    this.privateKey = createPrivateKey(options.privateKey.replace(/\\n/g, '\n'));
  }

  async send(
    tokens: string[],
    message: PushMessage,
    alert: NotificationAlert
  ): Promise<PushResult[]> {
    if (tokens.length === 0) return [];
    // **Once, before the fan-out, rather than inside it.** APNs has nothing
    // here — its bearer is minted locally — but this one is a network call,
    // and asking for it per address would open a second exchange for every
    // device the first send is still waiting on.
    //
    // A failure here is not a failure of any address, so it reports the same
    // shape a transport error does and prunes nothing: this is exactly the
    // case where a bad credential must not be mistaken for dead tokens.
    let bearer: string;
    try {
      bearer = await this.authToken();
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      return tokens.map((token) => ({
        token,
        status: 0,
        error: reason,
        dead: false,
      }));
    }
    return Promise.all(
      tokens.map((token) => this.sendOne(bearer, token, message, alert))
    );
  }

  private async sendOne(
    bearer: string,
    token: string,
    message: PushMessage,
    alert: NotificationAlert
  ): Promise<PushResult> {
    try {
      const response = await this.fetchImpl(
        `${FCM_SEND_HOST}/v1/projects/${this.options.projectId}/messages:send`,
        {
          method: 'POST',
          headers: {
            authorization: `Bearer ${bearer}`,
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            message: fcmMessage(token, message, alert),
          }),
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        }
      );
      const status = response.status;
      if (status === 200) return { token, status, dead: false };
      const reason = await readFcmError(response);
      return { token, status, reason, dead: isDeadFcmToken(status, reason) };
    } catch (error) {
      // A transport failure says nothing about the token, so the row stays.
      return {
        token,
        status: 0,
        error: error instanceof Error ? error.message : String(error),
        dead: false,
      };
    }
  }

  /**
   * The access token, exchanged at most every fifty minutes.
   *
   * **Concurrent callers share one exchange.** Two channels announcing
   * themselves at the same moment on a cold cache would otherwise each open
   * their own, and Google would answer both — burning a round trip and
   * leaving whichever landed second as the cached one. The in-flight promise
   * is cleared on settle, so a failure is retried by the next send rather
   * than remembered.
   */
  private authToken(): Promise<string> {
    const now = this.now();
    if (this.accessToken && now - this.accessToken.mintedAt < FCM_TOKEN_TTL_MS) {
      return Promise.resolve(this.accessToken.token);
    }
    if (this.pending) return this.pending;
    const exchange = this.exchange(now).finally(() => {
      if (this.pending === exchange) this.pending = null;
    });
    this.pending = exchange;
    return exchange;
  }

  private async exchange(now: number): Promise<string> {
    const assertion = mintServiceAccountAssertion(
      this.privateKey,
      this.options.clientEmail,
      now
    );
    const response = await this.fetchImpl(FCM_TOKEN_HOST, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion,
      }).toString(),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!response.ok) {
      // Deliberately not cached, so the next send retries rather than
      // inheriting a failure for fifty minutes.
      throw new Error(`FCM token exchange failed: ${response.status}`);
    }
    const body = (await response.json()) as { access_token?: string };
    if (!body.access_token) throw new Error('FCM token exchange returned no token');
    this.accessToken = { token: body.access_token, mintedAt: now };
    return body.access_token;
  }
}

/**
 * The v1 message body, which is the whole of the mapping from what this server
 * knows to what Google accepts.
 *
 * Exported for the test that reads it, on `apns-headers.test.ts`'s reasoning:
 * this is composed below the line every other test stops at, and two of the
 * decisions in it are silent when wrong.
 *
 * **Everything in `data` crosses as a string, and that is Google's rule rather
 * than a choice here.** FCM's `data` is `map<string, string>` and it refuses a
 * body with anything else in it, so `reachesInApp` — a boolean on the APNs
 * side — arrives at the app as `"true"`. The app reads both forms; see
 * `reachesInApp` in the app's push.ts, which is where getting this wrong shows
 * up, and shows up as every in-app banner silently not appearing.
 */
export function fcmMessage(
  token: string,
  message: PushMessage,
  alert: NotificationAlert
): Record<string, unknown> {
  return {
    token,
    notification: { title: message.title, body: message.body },
    android: {
      // The same rule as `apns-priority`, including the exception. `normal`
      // lets Android hold a message to batch it with the next radio wake,
      // which is the honest setting for news somebody asked to arrive quietly
      // — and never right for a ping, whatever level it arrives at, because
      // deferred delivery against a running expiry loses it outright rather
      // than quieting it. See the `apns-priority` comment for the long form.
      priority:
        alert === 'passive' && message.kind !== 'pinged' ? 'normal' : 'high',
      // Omitted when the message replaces nothing, as the APNs header is, and
      // for the identical reason: a ping carries words somebody chose and no
      // later one is entitled to destroy it.
      ...(message.collapseKey === null
        ? {}
        : { collapse_key: message.collapseKey }),
      // Google takes a duration string rather than a deadline. Seconds, and
      // `0s` means deliver-now-or-discard, which is a value nothing here asks
      // for — every lifetime in this file is minutes at least.
      ttl: `${Math.min(
        Math.floor(message.lifetimeMs / 1000),
        FCM_MAX_TTL_SECONDS
      )}s`,
      notification: {
        // Which of the three channels, and so how loudly this lands. The one
        // key on Android that carries what `sound` and `interruption-level`
        // carry on iOS.
        channel_id: ANDROID_CHANNEL_IDS[alert],
        // **The second half of collapsing, and the half that does the work
        // somebody watching the lock screen would notice.** `collapse_key`
        // above only discards messages still queued *at Google*; it has no
        // effect on a notification already sitting in the tray. What replaces
        // one already shown is the notification's tag. APNs's single
        // `apns-collapse-id` does both jobs, so parity needs both fields, and
        // the two must carry the same value or a channel's presence would
        // stack on screen while collapsing in flight — which is the confusing
        // half-working state rather than an outright bug.
        //
        // Omitted with its partner, so that a ping still collapses with
        // nothing.
        ...(message.collapseKey === null ? {} : { tag: message.collapseKey }),
      },
    },
    data: {
      channelId: message.channelId,
      reachesInApp: String(message.reachesInApp),
      alert,
      kind: message.kind,
    },
    // **`threadId` has no counterpart and is deliberately dropped.** Android
    // groups by an explicit `group` key under a single channel, which is not
    // the seam `ASKING_THREAD` uses — that one gathers across every channel,
    // and the notifications it gathers arrive on three different Android
    // channels, which cannot be grouped together. Sending it as a group key
    // would produce piles that split along loudness, which is worse than the
    // flat list Android gives by default.
  };
}

/**
 * Google's refusal, as a short string for the log.
 *
 * The error body is a nested object where APNs answered with one word, so this
 * reaches for the machine-readable code and falls back to the status rather
 * than logging a paragraph per failed address.
 */
async function readFcmError(response: Response): Promise<string | undefined> {
  try {
    const body = (await response.json()) as {
      error?: {
        status?: string;
        message?: string;
        details?: Array<{ errorCode?: string }>;
      };
    };
    return (
      body.error?.details?.find((detail) => detail.errorCode)?.errorCode ??
      body.error?.status ??
      body.error?.message
    );
  } catch {
    return undefined;
  }
}

/**
 * Whether Google's answer means this address should be forgotten.
 *
 * **A second function rather than a wider `isDeadToken`**, because the two
 * services disagree about what their codes mean and a shared predicate would
 * have to be right about both at once. APNs says gone with 410; FCM says it
 * with `UNREGISTERED`, which arrives as a 404.
 *
 * **`UNREGISTERED` and nothing else**, on exactly `isDeadToken`'s judgement
 * that a misconfiguration should cost delivery until it is fixed, not data.
 * Three refusals read like they belong here and are each excluded for a
 * reason:
 *
 * - **`400 INVALID_ARGUMENT`** is the closest analogue of `BadDeviceToken`,
 *   and is the one that would have done real damage. FCM returns it for a
 *   malformed token *and* for a malformed **message** — the `ttl` ceiling
 *   above is precisely how this server would earn it — so pruning on it means
 *   a bug in our own JSON deletes other people's device rows. The failure
 *   would present as every Android user quietly becoming unreachable, caused
 *   by a constant.
 * - **`403 SENDER_ID_MISMATCH`** is a good token belonging to a different
 *   Firebase project: one wrong `google-services.json` in a build, or the
 *   wrong service account on the box. It is this transport's version of the
 *   sandbox/production trap `isDeadToken`'s comment was written about, and
 *   pruning on it would forget every Android device at once.
 * - **`401`, and `403 THIRD_PARTY_AUTH_ERROR`** are the server's credential
 *   being wrong, and say nothing whatever about the address.
 *
 * `429` and the `5xx`s are retryable and keep the row by falling through.
 */
export function isDeadFcmToken(status: number, reason?: string): boolean {
  return status === 404 && reason === 'UNREGISTERED';
}

/**
 * The assertion Google exchanges for an access token.
 *
 * RS256 against the service account's key, where APNs uses ES256 against a
 * `.p8` — and with none of `mintProviderToken`'s DER trap, since RSA signatures
 * have one encoding. The claims are Google's required set: the scope being
 * asked for, the token endpoint as the audience, and an hour's life, which is
 * the longest it accepts.
 */
export function mintServiceAccountAssertion(
  key: KeyObject,
  clientEmail: string,
  now: number
): string {
  const issued = Math.floor(now / 1000);
  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = base64url(
    JSON.stringify({
      iss: clientEmail,
      sub: clientEmail,
      scope: FCM_SCOPE,
      aud: FCM_TOKEN_HOST,
      iat: issued,
      exp: issued + 3600,
    })
  );
  const signature = sign('sha256', Buffer.from(`${header}.${claims}`), key);
  return `${header}.${claims}.${signature.toString('base64url')}`;
}

/** Prints what would have been sent. For local work without an APNs key. */
export class ConsolePusher implements Pusher {
  constructor(private log: (message: string) => void = console.log) {}

  async send(
    tokens: string[],
    message: PushMessage,
    alert: NotificationAlert
  ): Promise<PushResult[]> {
    this.log(
      `\n  ── push to ${tokens.length} device(s): ` +
        `${message.title} — ${message.body} (${message.channelId}, ${alert}) ──\n`
    );
    return tokens.map((token) => ({ token, status: 200, dead: false }));
  }
}

/** Records what would have been sent. For tests. */
export class MemoryPusher implements Pusher {
  readonly sent: Array<{
    tokens: string[];
    message: PushMessage;
    alert: NotificationAlert;
  }> = [];
  /** Tokens to report as dead on the next send, so pruning can be tested. */
  dead = new Set<string>();

  async send(
    tokens: string[],
    message: PushMessage,
    alert: NotificationAlert
  ): Promise<PushResult[]> {
    this.sent.push({ tokens, message, alert });
    return tokens.map((token) => ({
      token,
      status: this.dead.has(token) ? 410 : 200,
      dead: this.dead.has(token),
    }));
  }

  /** Every message sent to this address, in order. */
  messagesFor(token: string): PushMessage[] {
    return this.sent
      .filter((entry) => entry.tokens.includes(token))
      .map((entry) => entry.message);
  }

  /** How each of them arrived, in the same order. */
  alertsFor(token: string): NotificationAlert[] {
    return this.sent
      .filter((entry) => entry.tokens.includes(token))
      .map((entry) => entry.alert);
  }
}
