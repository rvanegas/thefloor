import { buildApp } from './app';
import { ConsoleMailer, SesMailer, type Mailer } from './mail';
import { LiveKitMediaServer, type MediaServer } from './media';
import { S3RecordingStore } from './storage';

// Node's own .env loader — no dependency. Resolved against the working
// directory, which npm scripts set to this package. A missing file is not an
// error, so the server still runs from a bare environment (a container, a
// systemd unit) where the variables are supplied directly.
try {
  process.loadEnvFile();
} catch {
  // No .env; environment variables alone decide the configuration.
}

const port = Number(process.env.PORT ?? 8787);
const host = process.env.HOST ?? '0.0.0.0';
const dbPath = process.env.DB_PATH ?? './thefloor.db';

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
/**
 * Recording needs somewhere to write. These credentials are handed to LiveKit
 * with each egress request, so they leave this account — scope the IAM user to
 * PutObject on this one bucket and nothing else.
 */
const s3Bucket = process.env.RECORDINGS_BUCKET;
const s3Key = process.env.RECORDINGS_AWS_ACCESS_KEY_ID;
const s3Secret = process.env.RECORDINGS_AWS_SECRET_ACCESS_KEY;
const storage =
  s3Bucket && s3Key && s3Secret
    ? {
        bucket: s3Bucket,
        region: process.env.RECORDINGS_REGION ?? mailRegion,
        accessKey: s3Key,
        secret: s3Secret,
      }
    : undefined;

const media: MediaServer | undefined =
  liveKitUrl && liveKitKey && liveKitSecret
    ? new LiveKitMediaServer({
        url: liveKitUrl,
        apiKey: liveKitKey,
        apiSecret: liveKitSecret,
        storage,
      })
    : undefined;

/**
 * Reading is a separate privilege from writing. The key above travels to
 * LiveKit and is PutObject-only; this uses the server's own credential chain,
 * so a leak of the third-party key cannot retrieve anyone's conversations.
 */
const store = s3Bucket
  ? new S3RecordingStore(s3Bucket, process.env.RECORDINGS_REGION ?? mailRegion)
  : undefined;

const app = buildApp({
  dbPath,
  mailer,
  media,
  mediaUrl: liveKitUrl,
  store,
  logger: true,
});
app.sessions.start();

app.fastify
  .listen({ port, host })
  .then(() => {
    app.fastify.log.info(
      {
        dbPath,
              mail: mailFrom ? `ses:${mailFrom}` : 'console',
        audio: media ? liveKitUrl : 'none',
        recordings: storage ? `s3://${storage.bucket}` : 'not configured',
      },
      'the floor server listening'
    );
    if (!media) {
      app.fastify.log.warn(
        'LIVEKIT_URL / LIVEKIT_API_KEY / LIVEKIT_API_SECRET are unset — sessions run with no audio.'
      );
    }
    if (media && !storage) {
      app.fastify.log.warn(
        'RECORDINGS_BUCKET / RECORDINGS_AWS_ACCESS_KEY_ID / RECORDINGS_AWS_SECRET_ACCESS_KEY are unset — the UI will offer recording, but nothing will be captured.'
      );
    }
    if (!mailFrom) {
      app.fastify.log.warn(
        'MAIL_FROM is unset — one-time codes are printed to this console, not emailed.'
      );
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
