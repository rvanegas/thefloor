import {
  SESv2Client,
  SendEmailCommand,
  type SESv2ClientConfig,
} from '@aws-sdk/client-sesv2';

/**
 * Delivery of one-time codes. Kept behind an interface because the transport is
 * the only thing standing between the current development bypass and real
 * authentication — and because SMS will arrive later as a second implementation
 * rather than a rewrite of the callers.
 */
export interface Mailer {
  /** Resolves once handed to the transport. Delivery itself is not guaranteed. */
  sendCode(to: string, code: string): Promise<void>;
}

export function isEmailAddress(identifier: string): boolean {
  // Deliberately loose. SES is the real validator; this only decides which
  // transport an identifier belongs to.
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(identifier.trim());
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
}

/** Prints the code instead of sending it. For local work without SES. */
export class ConsoleMailer implements Mailer {
  constructor(private log: (message: string) => void = console.log) {}

  async sendCode(to: string, code: string): Promise<void> {
    this.log(`\n  ── one-time code for ${to}: ${code} ──\n`);
  }
}

/** Records what would have been sent. For tests. */
export class MemoryMailer implements Mailer {
  readonly sent: Array<{ to: string; code: string }> = [];

  async sendCode(to: string, code: string): Promise<void> {
    this.sent.push({ to, code });
  }

  lastCodeFor(to: string): string | undefined {
    return [...this.sent].reverse().find((m) => m.to === to)?.code;
  }
}
