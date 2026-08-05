import { buildApp } from './app';
import { ConsoleMailer, SesMailer, type Mailer } from './mail';
import { LiveKitMediaServer, type MediaServer } from './media';

const port = Number(process.env.PORT ?? 8787);
const host = process.env.HOST ?? '0.0.0.0';
const dbPath = process.env.DB_PATH ?? './thefloor.db';

/**
 * Accepts any code from anyone, as whoever they claim to be. It exists only
 * because delivery is not yet available for every identifier — sign-in would
 * otherwise be impossible rather than merely insecure.
 *
 * This is not a weakened check; it is the absence of one. Delete it, and the
 * `authBypass` branches it feeds, once every identifier has a transport.
 */
const authBypass = process.env.AUTH_DEV_BYPASS === 'true';

// A config file travelling from a laptop to a server is the realistic way this
// ends up somewhere it must never be, so refuse to start rather than serve.
if (authBypass && process.env.NODE_ENV === 'production') {
  console.error(
    'FATAL: AUTH_DEV_BYPASS is set with NODE_ENV=production.\n' +
      'It accepts any code as valid, which means anyone can sign in as anyone.\n' +
      'Refusing to start.'
  );
  process.exit(1);
}

/**
 * MAIL_FROM must be an address on an SES-verified identity. Without it, codes
 * are printed locally instead of sent, which is fine on a laptop and useless
 * anywhere else.
 */
const mailFrom = process.env.MAIL_FROM;
const mailRegion = process.env.AWS_REGION ?? 'us-west-2';
const mailer: Mailer = mailFrom
  ? new SesMailer({ from: mailFrom, region: mailRegion })
  : new ConsoleMailer();

/**
 * Audio is optional: without LiveKit credentials the whole app still runs and
 * every rule is enforced, there is simply nothing to hear. That keeps the
 * session mechanics testable without a media server.
 */
const liveKitUrl = process.env.LIVEKIT_URL;
const liveKitKey = process.env.LIVEKIT_API_KEY;
const liveKitSecret = process.env.LIVEKIT_API_SECRET;
const media: MediaServer | undefined =
  liveKitUrl && liveKitKey && liveKitSecret
    ? new LiveKitMediaServer({
        url: liveKitUrl,
        apiKey: liveKitKey,
        apiSecret: liveKitSecret,
      })
    : undefined;

const app = buildApp({
  dbPath,
  authBypass,
  mailer,
  media,
  mediaUrl: liveKitUrl,
  logger: true,
});
app.sessions.start();

app.fastify
  .listen({ port, host })
  .then(() => {
    app.fastify.log.info(
      {
        dbPath,
        authBypass,
        mail: mailFrom ? `ses:${mailFrom}` : 'console',
        audio: media ? liveKitUrl : 'none',
      },
      'the floor server listening'
    );
    if (!media) {
      app.fastify.log.warn(
        'LIVEKIT_URL / LIVEKIT_API_KEY / LIVEKIT_API_SECRET are unset — sessions run with no audio.'
      );
    }
    if (!mailFrom) {
      app.fastify.log.warn(
        'MAIL_FROM is unset — one-time codes are printed to this console, not emailed.'
      );
    }
    if (authBypass) {
      app.fastify.log.warn(
        { host, port },
        'AUTHENTICATION IS DISABLED (AUTH_DEV_BYPASS). Any code signs in as any identifier. ' +
          'Do not expose this to a network you do not control.'
      );
      if (host !== '127.0.0.1' && host !== 'localhost') {
        app.fastify.log.warn(
          { host },
          'Bypass is on and the server is bound beyond loopback — anyone who can reach this port can sign in as anyone. Set HOST=127.0.0.1 unless you intend that.'
        );
      }
    }
  })
  .catch((error) => {
    app.fastify.log.error(error);
    process.exit(1);
  });

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    app.sessions.stop();
    app.fastify.close().finally(() => process.exit(0));
  });
}
