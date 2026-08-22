import { readFileSync } from 'node:fs';
import { buildApp } from './app';
import { ConsoleMailer, SesMailer, type Mailer } from './mail';
import { LiveKitMediaServer, type MediaServer } from './media';
import { ApnsPusher, ConsolePusher, type Pusher } from './push';
import { deployed, MIN_SUPPORTED_BUILD } from './release';
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
 * channel mechanics testable without a media server.
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
 * Reading is a separate privilege from writing, and this holds both — each on
 * the credential that should have it.
 *
 * Reads use the server's own credential chain, so a leak of the key that
 * travels to LiveKit cannot retrieve anyone's conversations. Writes — which is
 * mixing, this server's only reason to put anything in the bucket itself — use
 * the PutObject-only key above, the same one `media.ts` already stores the
 * playback stem with. Nothing is widened by this: `thefloor-server` stays
 * `s3:GetObject` and nothing else.
 *
 * With a bucket but no key, mixing fails and every recording falls back to
 * being encoded on demand, which is what the server did before mixes existed.
 */
const store = s3Bucket
  ? new S3RecordingStore(
      s3Bucket,
      process.env.RECORDINGS_REGION ?? mailRegion,
      s3Key && s3Secret ? { accessKey: s3Key, secret: s3Secret } : undefined
    )
  : undefined;

/**
 * Notifications, likewise optional: without an APNs key nothing is sent and the
 * in-app path is all there is, which is exactly how the app worked before push
 * existed. That keeps local development free of credentials.
 *
 * APNS_ENV decides which Apple to talk to, and it is the setting most likely to
 * be wrong. A device token minted by a debug build (`expo run:ios`) is valid
 * only against `sandbox`, one from TestFlight only against `production`, and
 * the wrong pairing fails with a bare BadDeviceToken that names nothing about
 * the environment. The default is production because that is what a deployed
 * server is talking to.
 */
const apnsKeyPath = process.env.APNS_KEY_PATH;
const apnsKeyId = process.env.APNS_KEY_ID;
const apnsTeamId = process.env.APNS_TEAM_ID;
const apnsBundleId = process.env.APNS_BUNDLE_ID ?? 'co.rvanegas.thefloor';
const apnsEnv =
  process.env.APNS_ENV === 'sandbox' ? 'sandbox' : 'production';
const pusher: Pusher | undefined =
  apnsKeyPath && apnsKeyId && apnsTeamId
    ? new ApnsPusher({
        key: readFileSync(apnsKeyPath, 'utf8'),
        keyId: apnsKeyId,
        teamId: apnsTeamId,
        bundleId: apnsBundleId,
        environment: apnsEnv,
      })
    : new ConsolePusher();

/**
 * The one address App Review can sign in as. Both halves are required — an
 * address with no code, or a code with no address, configures nothing — so a
 * half-filled .env leaves every code random rather than leaving one account
 * open with a value somebody guessed at.
 *
 * Publish the pair in the review notes and treat it as public. Point it at an
 * account holding demo data and nothing else.
 */
const reviewIdentifier = process.env.REVIEW_IDENTIFIER;
const reviewCode = process.env.REVIEW_CODE;
const review =
  reviewIdentifier && reviewCode
    ? { identifier: reviewIdentifier, code: reviewCode }
    : undefined;

/**
 * Donations, which are optional in both halves and independently so.
 *
 * KOFI_URL is what the app is told to open; unset, it offers nothing, and that
 * is also how the donate link is withdrawn — a restart rather than a new build,
 * which matters because the App Store guideline permitting an external payment
 * link at all is under appeal.
 *
 * KOFI_VERIFICATION_TOKEN is from More -> API -> Webhooks -> Advanced on Ko-fi,
 * and is the only thing standing between that endpoint and anyone who can post
 * to it. Unset, deliveries are refused rather than trusted.
 */
const kofiUrl = process.env.KOFI_URL;
const kofiVerificationToken = process.env.KOFI_VERIFICATION_TOKEN;
const kofi =
  kofiUrl || kofiVerificationToken
    ? { url: kofiUrl, verificationToken: kofiVerificationToken }
    : undefined;

const app = buildApp({
  dbPath,
  review,
  kofi,
  contactEmail: process.env.CONTACT_EMAIL,
  // Where a build below MIN_SUPPORTED_BUILD is sent. Configuration rather than
  // a constant because the App Store id is not known in this repository, and
  // because the client that reads it cannot be given a new one. See
  // BuildOptions.updateUrl.
  updateUrl: process.env.APP_STORE_URL,
  mailer,
  media,
  mediaUrl: liveKitUrl,
  store,
  pusher,
  logger: true,
});
app.channels.start();

app.fastify
  .listen({ port, host })
  .then(() => {
    app.fastify.log.info(
      {
        dbPath,
              mail: mailFrom ? `ses:${mailFrom}` : 'console',
        audio: media ? liveKitUrl : 'none',
        recordings: storage ? `s3://${storage.bucket}` : 'not configured',
        push: apnsKeyPath ? `apns:${apnsEnv}` : 'console',
        // Logged because an account whose code never changes is worth being
        // able to see from the outside, rather than having to read .env to
        // find out whether one is open.
        review: review ? review.identifier : 'none',
        donations: kofiVerificationToken ? 'ko-fi' : 'not configured',
        // The first line in the journal after a restart is where somebody
        // looks when a deploy is in doubt, and until now it could not say
        // which deploy it was.
        commit: deployed()?.commit ?? 'local',
        minBuild: MIN_SUPPORTED_BUILD,
      },
      'the floor server listening'
    );
    if (kofiUrl && !kofiVerificationToken) {
      app.fastify.log.warn(
        'KOFI_URL is set without KOFI_VERIFICATION_TOKEN — the app will offer the link, but every donation Ko-fi reports will be refused and nothing recorded.'
      );
    }
    if (!media) {
      app.fastify.log.warn(
        'LIVEKIT_URL / LIVEKIT_API_KEY / LIVEKIT_API_SECRET are unset — channels run with no audio.'
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
    if (!apnsKeyPath) {
      app.fastify.log.warn(
        'APNS_KEY_PATH / APNS_KEY_ID / APNS_TEAM_ID are unset — notifications are printed to this console, so nothing reaches a closed app.'
      );
    }
  })
  .catch((error) => {
    app.fastify.log.error(error);
    process.exit(1);
  });

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    app.channels.stop();
    app.fastify.close().finally(() => process.exit(0));
  });
}
