import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';

/**
 * Access to the recordings bucket, from the server's side of it.
 *
 * Reading is deliberately not the credential handed to LiveKit: that one is
 * PutObject-only and cannot read the bucket back, so a leak of the key that
 * travels to a third party cannot be used to retrieve anyone's conversations.
 * Reading is the server's own privilege, from its own credential chain — an
 * instance role in production, a local profile in development.
 *
 * Writing is the other way round, and uses the PutObject-only key rather than
 * the server's own. That key is already on the box and already used to write
 * this bucket — `media.ts` puts the playback stem with it — so nothing is
 * widened by mixing here too, and `thefloor-server` stays `s3:GetObject` and
 * nothing else, which planning/CREDENTIALS.md says it should.
 */
export interface RecordingStore {
  get(key: string): Promise<Buffer>;
  /**
   * Stores an object, replacing whatever was there. Awaited, unlike `delete`:
   * the caller is making something a later read depends on.
   */
  put(key: string, data: Buffer): Promise<void>;
  /**
   * Removes an object. Fire-and-forget by design: the sweep that calls this
   * runs on a timer with nobody waiting, and a failure leaves the row in place
   * to be retried on the next one.
   */
  delete(key: string): void;
}

/** The PutObject-only key, when this server has been given one. */
export interface WriteCredentials {
  accessKey: string;
  secret: string;
}

export class S3RecordingStore implements RecordingStore {
  private client: S3Client;
  /**
   * A second client, on the narrow key, or none — in which case this store can
   * be read and not written, which is exactly what the server was before it
   * mixed anything.
   */
  private writer: S3Client | null;

  constructor(
    private bucket: string,
    region: string,
    write?: WriteCredentials
  ) {
    this.client = new S3Client({ region });
    this.writer = write
      ? new S3Client({
          region,
          credentials: {
            accessKeyId: write.accessKey,
            secretAccessKey: write.secret,
          },
        })
      : null;
  }

  async put(key: string, data: Buffer): Promise<void> {
    if (!this.writer) {
      throw new Error('No credentials for writing to the recordings bucket.');
    }
    await this.writer.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: data,
        ContentType: 'audio/ogg',
      })
    );
  }

  async get(key: string): Promise<Buffer> {
    const response = await this.client.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: key })
    );
    const body = response.Body;
    if (!body) throw new Error(`Empty object: ${key}`);
    const chunks: Buffer[] = [];
    for await (const chunk of body as AsyncIterable<Uint8Array>) {
      chunks.push(Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  }

  delete(key: string): void {
    // Unawaited, and the rejection is swallowed here rather than left to
    // become an unhandled rejection that takes the process down. The sweep
    // only removes a row once every object it names has gone, so a failure
    // here costs one more week of storage and is retried, which is the safe
    // direction: the alternative is an object no row can identify.
    void this.client
      .send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }))
      .catch(() => {});
  }
}

/** Serves objects from memory. For tests. */
export class MemoryRecordingStore implements RecordingStore {
  constructor(private objects: Map<string, Buffer> = new Map()) {}

  async put(key: string, data: Buffer): Promise<void> {
    this.objects.set(key, data);
  }

  async get(key: string): Promise<Buffer> {
    const found = this.objects.get(key);
    if (!found) throw new Error(`No such object: ${key}`);
    return found;
  }

  delete(key: string): void {
    this.objects.delete(key);
  }

  /** What the sweep left behind, for tests to assert on. */
  keys(): string[] {
    return [...this.objects.keys()];
  }
}

/**
 * How long to keep asking for a stem that is not there yet, and how often.
 *
 * Mixing when a run ends puts this code far closer to the egress than exporting
 * on demand ever was. `stopEgress` resolves when LiveKit has accepted the stop,
 * not when the object has been uploaded, so the first read after a run ends
 * will often find nothing for a few seconds — for a long recording, longer.
 * Ten minutes of patience costs a pending row and nothing else; giving up early
 * files a recording as unmixable while its audio was still in flight.
 */
const OBJECT_WAIT_MS = 10 * 60 * 1000;
const OBJECT_POLL_MS = 2_000;

/**
 * Fetches an object, waiting for it to appear.
 *
 * Deliberately patient about every failure rather than only about a missing
 * key. S3 reports a not-yet-written object as a 404, but a read that lost a
 * race with the upload can fail in other ways, and none of them are worth
 * telling apart when the answer is the same: ask again shortly. Whatever the
 * last attempt threw is what propagates once the deadline passes, so the log
 * still says what actually went wrong.
 */
export async function getWhenReady(
  store: Pick<RecordingStore, 'get'>,
  key: string,
  options: {
    now?: () => number;
    sleep?: (ms: number) => Promise<void>;
    waitMs?: number;
  } = {}
): Promise<Buffer> {
  const now = options.now ?? Date.now;
  const sleep =
    options.sleep ??
    ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const deadline = now() + (options.waitMs ?? OBJECT_WAIT_MS);

  for (;;) {
    try {
      return await store.get(key);
    } catch (error) {
      if (now() >= deadline) throw error;
      await sleep(OBJECT_POLL_MS);
    }
  }
}
