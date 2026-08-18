import { connect, constants, type ClientHttp2Session } from 'node:http2';
import { createPrivateKey, sign, type KeyObject } from 'node:crypto';

/**
 * Delivery of notifications to a device whose app is not running.
 *
 * Kept behind an interface for the same reasons `Mailer` is: the transport is
 * the only thing that needs credentials, local development should not need
 * any, and tests should be able to assert what would have been sent without a
 * network. Android will arrive later as a second implementation rather than a
 * rewrite of the callers.
 */
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
   * How long APNs should keep trying before discarding this undelivered.
   *
   * Carried per message rather than fixed by the transport, because the three
   * do not decay alike and that difference is the point: two of them report who
   * *belongs* to a channel, which stays true, and one reports who is *standing
   * in* it, which does not. The constructors below choose it; nothing else
   * should have an opinion.
   */
  lifetimeMs: number;
}

/**
 * The three notifications this server sends, each with a name.
 *
 * There have always been exactly three, and until now none of them was called
 * anything: each was a title and a body composed at the point it was sent, two
 * of them in `create` and `dispatch` and the third four hundred lines away in
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
 *
 * **The seam is after the second.** The first two are addressed to the
 * recipient and are answerable — they exist to be acted on. The third is
 * ambient. Nothing distinguishes them today: all three are composed the same
 * way, sent the same way, and collapse against each other on the lock screen
 * because they share a channel. Anything that ought to treat a summons
 * differently from a report — an interruption level, a separate collapse key,
 * a preference somebody can turn off — begins by being able to say which is
 * which, which is what these names are for.
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
      lifetimeMs: PARTICIPATION_LIFETIME_MS,
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
      lifetimeMs: PARTICIPATION_LIFETIME_MS,
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
      lifetimeMs: PRESENCE_LIFETIME_MS,
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
        sound: 'default',
        'thread-id': message.channelId,
      },
      channelId: message.channelId,
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
        'apns-collapse-id': message.channelId,
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
