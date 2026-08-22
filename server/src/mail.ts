import {
  SESv2Client,
  SendEmailCommand,
  type SESv2ClientConfig,
} from '@aws-sdk/client-sesv2';
import { INVITE_TTL_MS } from './accounts';

/**
 * Everything this server sends to an address rather than to an account. Kept
 * behind an interface because the transport is the only thing standing between
 * the current development bypass and real authentication — and because SMS may
 * arrive later as a second implementation rather than a rewrite of the callers.
 *
 * The two messages are unrelated in purpose and identical in constraint: both
 * go to an address nobody has proved they hold, so neither may carry anything
 * the recipient has not already been told by whoever typed the address in.
 */
export interface Mailer {
  /** Resolves once handed to the transport. Delivery itself is not guaranteed. */
  sendCode(to: string, code: string): Promise<void>;
  /**
   * Asks an address with no account to install the app and find the request
   * that is already waiting for it.
   *
   * `from` is the inviter's display name and deliberately not their address:
   * the recipient never asked to hear from them, and an address is theirs to
   * give out rather than ours. A name is what the app would show anyway.
   */
  sendInvite(to: string, from: string): Promise<void>;
}

/**
 * Where an invited person is told to go, read at send time from the same
 * `APP_STORE_URL` that `/healthz` serves as `updateUrl`.
 *
 * **One address, one setting.** The two readers want the identical string for
 * unrelated reasons — one is telling somebody with no app where to get it, the
 * other is telling somebody with too old an app where to get a newer one — and
 * a second name for it is a second thing to remember to set. It is
 * configuration rather than a constant here for the reason it is there: the id
 * is not in this repository, and see `.env.example`.
 *
 * Unset, the invitation leaves the line out entirely rather than naming a store
 * page that 404s — an email with a broken link reads as a broken app, where one
 * that asks somebody to go looking reads as an app that is not out yet. It was
 * unset everywhere until 1.0.0 was released on 2026-08-19, and this function
 * did not exist until two days after that, so every invitation in between told
 * its recipient the app was not on the App Store when it was.
 */
export function installUrl(): string | null {
  return process.env.APP_STORE_URL || null;
}

export function isEmailAddress(identifier: string): boolean {
  // Deliberately loose. SES is the real validator; this only decides which
  // transport an identifier belongs to.
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(identifier.trim());
}

/**
 * The longest identifier worth storing. 254 is the maximum length of an email
 * address that can actually be delivered to, and no phone number approaches it.
 */
export const MAX_IDENTIFIER_LENGTH = 254;

/*
 * The two below are **deliberately unreachable**, as of 2026-08-15. Nothing in
 * `src/` calls either one.
 *
 * A phone number used to be accepted as the target of a contact request, on the
 * reasoning that sign-in being email-only today should not decide against SMS
 * from the one place with no stake in it. That inverted once an invitation
 * became a message rather than a row: an address the server cannot send to is
 * an invitation that is never delivered and a request the recipient never hears
 * about, so the reserved identifier was costing something real to hold open.
 *
 * They stay because the reasoning that put them here is still sound and will
 * apply again the day there is an SMS transport — at which point `Mailer` grows
 * a sibling, `requestContact`'s validation becomes `isPlausibleIdentifier`
 * again, and this comment goes. Deleting them now would only mean writing the
 * same two regexes back. See planning/DECISIONS.md.
 */

/** Loose on purpose, the way isEmailAddress is: shape rather than reachability. */
export function isPhoneNumber(identifier: string): boolean {
  return /^\+?[0-9][0-9\s().-]{6,19}$/.test(identifier.trim());
}

/**
 * Whether an identifier could name somebody at all, by either transport.
 *
 * What this exists to exclude is the identifier that can never resolve into
 * anybody: a bare word, a sentence, a kilobyte of text. Those become permanent
 * rows in pending_invites, which nothing sweeps.
 */
export function isPlausibleIdentifier(identifier: string): boolean {
  const id = identifier.trim();
  if (id.length === 0 || id.length > MAX_IDENTIFIER_LENGTH) return false;
  return isEmailAddress(id) || isPhoneNumber(id);
}

export interface SesMailerOptions {
  from: string;
  region: string;
  /** Overrides the default credential chain. Omit to use the environment. */
  clientConfig?: SESv2ClientConfig;
}

export class SesMailer implements Mailer {
  private client: SESv2Client;

  constructor(private options: SesMailerOptions) {
    this.client = new SESv2Client({
      region: options.region,
      ...options.clientConfig,
    });
  }

  async sendCode(to: string, code: string): Promise<void> {
    await this.client.send(
      new SendEmailCommand({
        FromEmailAddress: this.options.from,
        Destination: { ToAddresses: [to] },
        Content: {
          Simple: {
            Subject: { Data: `${code} is your code for The Floor` },
            Body: {
              Text: {
                Data: [
                  `${code} is your one-time code for The Floor.`,
                  '',
                  'It expires in ten minutes and can be used once.',
                  'If you did not ask to sign in, you can ignore this email.',
                ].join('\n'),
              },
            },
          },
        },
      })
    );
  }

  async sendInvite(to: string, from: string): Promise<void> {
    await this.client.send(
      new SendEmailCommand({
        FromEmailAddress: this.options.from,
        Destination: { ToAddresses: [to] },
        Content: {
          Simple: {
            Subject: { Data: `${from} wants to talk with you on The Floor` },
            Body: { Text: { Data: inviteBody(from) } },
          },
        },
      })
    );
  }
}

/**
 * The one message this server sends to somebody who has never asked it for
 * anything, which is the whole of what makes it delicate.
 *
 * Two rules it is written to. It says who sent it in the first line, because an
 * unattributed invitation is indistinguishable from spam and a recipient who
 * cannot place the name should be able to stop reading there. And it promises
 * that ignoring it is enough — true, since the request resolves only when the
 * address signs up and is swept when it does not, and worth saying out loud so
 * that nobody feels obliged to act in order to make it stop.
 */
function inviteBody(from: string): string {
  const days = Math.round(INVITE_TTL_MS / (24 * 60 * 60 * 1000));
  return [
    `${from} added you as a contact on The Floor, using this email address.`,
    '',
    'The Floor is for talking rather than for calling. You drop into a channel',
    'when you have something to say, and you can see who is around before you',
    'interrupt anybody.',
    '',
    ...(installUrl()
      ? [`Install it here: ${installUrl()}`, '']
      : ['It is not on the App Store yet. This is an invitation to be ready.', '']),
    'Sign in with this address and the request will be waiting for you.',
    '',
    'If the name means nothing to you, ignore this email — nothing happens',
    `until you sign up, and the request expires after ${days} days.`,
  ].join('\n');
}

/** Prints what would have been sent instead of sending it. For local work without SES. */
export class ConsoleMailer implements Mailer {
  constructor(private log: (message: string) => void = console.log) {}

  async sendCode(to: string, code: string): Promise<void> {
    this.log(`\n  ── one-time code for ${to}: ${code} ──\n`);
  }

  async sendInvite(to: string, from: string): Promise<void> {
    this.log(`\n  ── invitation to ${to}, from ${from} ──\n${inviteBody(from)}\n`);
  }
}

/** Records what would have been sent. For tests. */
export class MemoryMailer implements Mailer {
  readonly sent: Array<{ to: string; code: string }> = [];
  readonly invited: Array<{ to: string; from: string; body: string }> = [];

  async sendCode(to: string, code: string): Promise<void> {
    this.sent.push({ to, code });
  }

  async sendInvite(to: string, from: string): Promise<void> {
    this.invited.push({ to, from, body: inviteBody(from) });
  }

  lastCodeFor(to: string): string | undefined {
    return [...this.sent].reverse().find((m) => m.to === to)?.code;
  }
}
