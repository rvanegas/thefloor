import { connect, constants, type ClientHttp2Session } from 'node:http2';
import { createPrivateKey, sign, type KeyObject } from 'node:crypto';

/**
 * How long a presence announcement stays worth delivering.
 *
 * "Somebody is here now" is false within minutes, and Apple will hold an
 * undeliverable push for as long as it is allowed to. Five minutes is roughly
 * how long it stays true that walking over to your phone would let you join
 * the conversation being announced.
 */
export const PRESENCE_LIFETIME_MS = 5 * 60 * 1000;

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
   * APNs shows one notification per collapse key and discards the rest, so this
   * decides what a new one overwrites. `channelId` for everything a channel
   * does by itself, which is the point — a room that fills and empties all
   * evening leaves one line rather than nine. Automatic traffic may overwrite
   * automatic traffic, because the later line is a better version of the
   * earlier one: it reports the same room, later.
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
   * its own. They still group in Notification Center, which is `thread-id` and
   * is unaffected.
   */
  collapseKey: string | null;
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
   * Whether this makes a sound and a vibration, or arrives quietly.
   *
   * `aps.sound` is per-notification and provider-chosen: present, and iOS
   * plays the alert tone and vibrates; omitted, and the same notification
   * lands as a silent banner. That is the whole of the control worth having —
   * `interruption-level` sits above it and is deliberately not used here.
   * `time-sensitive` would pierce a Focus mode and needs a capability on the
   * app, and `critical` overrides the ring switch and needs an entitlement
   * Apple grants by hand. **Neither is ours to claim.** Somebody who has put
   * their phone in a Focus mode has said something, and a conversation app is
   * not entitled to talk over it.
   *
   * False for everything the channel says about itself, since 2026-08-22.
   * Those report that something happened somewhere, and a phone that makes a
   * noise every time a room fills and empties is one that gets its
   * notifications turned off entirely — at which point the ping goes with
   * them. **The quiet ones are what buy the loud one its credibility.**
   *
   * True for a ping alone, which is a person asking for you by name and the
   * only one worth interrupting anybody for.
   */
  audible: boolean;
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
 * `started` and `invited` are the first word of the body each one sends, so
 * the name and the sentence on the lock screen cannot drift apart; `arrived`
 * is what `announceActive` already calls the person walking in.
 *
 * - `started` — somebody opened a channel with you. It did not exist a moment
 *   ago, and you are being asked into it.
 * - `invited` — somebody asked you into a channel already under way. Since an
 *   unnamed channel widens in place rather than moving the conversation, this
 *   is now the only way anybody joins one in progress.
 * - `arrived` — somebody stepped into a channel you already belong to. Nobody
 *   is asking for you; the room simply has someone in it.
 * - `pinged` — somebody in a channel asked for you by name, in their own words.
 *   The only one a person sits down and decides to send.
 *
 * **Two seams, and they do not fall in the same place**, which is why the names
 * earn their keep rather than merely tidying.
 *
 * By *what stays true*: `started` and `invited` change who belongs to a channel
 * and go on being true while a phone is off, so they get a month. `arrived` and
 * `pinged` both say come now, which stops being worth saying almost at once, so
 * they get five minutes.
 *
 * By *who decided to send it*: `pinged` is the only one a person composed. The
 * other three are the channel reporting on itself, which is what lets them
 * overwrite one another on the lock screen — one line about a room that filled
 * and emptied all evening is a mercy. That is not safe for something somebody
 * typed and aimed, so `pinged` collapses into nothing and nothing collapses
 * into it.
 *
 * That second seam decides two things rather than one, which is what makes it
 * worth having found. What may overwrite a notification and who a notification
 * may reach turn out to be the same question asked twice: the three automatic
 * ones are safe to overwrite *because* they are the channel repeating itself,
 * and for that same reason they are withheld from anybody whose socket has
 * already drawn what they describe, and for that same reason again they arrive
 * without a sound. A ping is none of those, so it overwrites nothing, it is
 * delivered whether or not the app is open, and it is the one that makes a
 * noise.
 *
 * **Three fields rather than one `isPing`, and that is not an oversight.**
 * They agree today because one distinction happens to govern all three, but
 * each is answering a different question — what may be discarded, what would
 * be a duplicate, and what is worth interrupting somebody for — and the
 * answers are not bound to stay together. A notification that ought to arrive
 * quietly and never be overwritten is easy to imagine; the fields can say that
 * and a predicate cannot. Collapsing them would also put the reasoning
 * somewhere no constructor can see it.
 *
 * Cut the set either way and the members swap sides. That is the argument for
 * naming them rather than sorting them into two piles once.
 *
 * They compose messages and send nothing. Deciding that somebody should be
 * told remains the registry's, exactly as before.
 */
export const notifications = {
  /** A channel has just been started, and you are one of the invitees. */
  started(initiator: string, channelId: string): PushMessage {
    // Titled with whoever asked rather than with the channel: a channel is
    // never named at creation, so every perspective-dependent fallback would
    // reduce to the roster anyway, and the one thing the recipient wants to
    // know is who is asking.
    return {
      title: initiator,
      body: 'Started a channel with you.',
      channelId,
      collapseKey: channelId,
      lifetimeMs: PARTICIPATION_LIFETIME_MS,
      audible: false,
      reachesInApp: false,
    };
  },

  /**
   * You have been asked into a channel that already exists.
   *
   * `channelName` is null when the channel has none, which is the ordinary
   * case: a channel is named only if somebody has bothered to.
   */
  invited(
    inviter: string,
    channelName: string | null,
    channelId: string
  ): PushMessage {
    return {
      title: inviter,
      body: channelName
        ? `Invited you to ${channelName}.`
        : 'Invited you to a channel.',
      channelId,
      collapseKey: channelId,
      lifetimeMs: PARTICIPATION_LIFETIME_MS,
      audible: false,
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
      title: channelName,
      body: `${whoArrived} stepped in.`,
      channelId,
      collapseKey: channelId,
      lifetimeMs: PRESENCE_LIFETIME_MS,
      audible: false,
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
   * Titled with the channel and not the sender, unlike `started` and `invited`.
   * Those announce a channel you may not know exists, so the name is the useful
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
      title: channelName,
      // The sender's name leads either way, so the two forms read alike and a
      // ping with words is recognisably the same thing as one without.
      body: text ? `${sender}: ${text}` : `${sender} is asking for you.`,
      channelId,
      // Replaces nothing, and is replaced by nothing. Every other notification
      // here is the channel restating itself and may be overwritten by a later
      // restatement; a ping is a sentence somebody wrote. See the field.
      collapseKey: null,
      lifetimeMs: PRESENCE_LIFETIME_MS,
      // The only one that makes a sound. See the field.
      audible: true,
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
  send(tokens: string[], message: PushMessage): Promise<PushResult[]>;
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

  async send(tokens: string[], message: PushMessage): Promise<PushResult[]> {
    if (tokens.length === 0) return [];
    return Promise.all(tokens.map((token) => this.sendOne(token, message)));
  }

  /** Releases the connection. Called when the server shuts down. */
  close(): void {
    this.session?.close();
    this.session = null;
  }

  private async sendOne(
    token: string,
    message: PushMessage
  ): Promise<PushResult> {
    const payload = JSON.stringify({
      aps: {
        alert: { title: message.title, body: message.body },
        // Omitted rather than set to something silent: there is no quiet
        // sound, and an absent key is how APNs is told to deliver the banner
        // without the tone or the vibration that goes with it.
        ...(message.audible ? { sound: 'default' } : {}),
        // Grouping, not replacing: everything about one channel stacks
        // together in Notification Center whatever its collapse key.
        'thread-id': message.channelId,
      },
      channelId: message.channelId,
      // Read by the app to decide whether to show a banner over itself. Sent
      // as the same word the server filtered on, so the two ends cannot come
      // to different conclusions about what this notification is for.
      reachesInApp: message.reachesInApp,
    });

    try {
      const { status, reason } = await this.request(token, message, payload);
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
    payload: string
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
        'apns-priority': '10',
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

/** Prints what would have been sent. For local work without an APNs key. */
export class ConsolePusher implements Pusher {
  constructor(private log: (message: string) => void = console.log) {}

  async send(tokens: string[], message: PushMessage): Promise<PushResult[]> {
    this.log(
      `\n  ── push to ${tokens.length} device(s): ` +
        `${message.title} — ${message.body} (${message.channelId}) ──\n`
    );
    return tokens.map((token) => ({ token, status: 200, dead: false }));
  }
}

/** Records what would have been sent. For tests. */
export class MemoryPusher implements Pusher {
  readonly sent: Array<{ tokens: string[]; message: PushMessage }> = [];
  /** Tokens to report as dead on the next send, so pruning can be tested. */
  dead = new Set<string>();

  async send(tokens: string[], message: PushMessage): Promise<PushResult[]> {
    this.sent.push({ tokens, message });
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
}
