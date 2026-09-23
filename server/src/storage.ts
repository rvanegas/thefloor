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
   * One byte range of an object, and how long the whole object is.
   *
   * Added for published episodes and wanted by nothing else. A podcast client
   * is not a browser: Apple's crawler and most players issue byte-range
   * requests and expect a `206` with a `Content-Range`, and several will not
   * let a listener seek at all without one. `get` buffers the whole object,
   * which is right for an export somebody asked for and wrong for a file
   * strangers stream.
   *
   * `end` is inclusive, as it is in HTTP, so that the route can pass what
   * arrived through without an off-by-one in the translation.
   */
  getRange(
    key: string,
    start: number,
    end: number
  ): Promise<{ data: Buffer; totalBytes: number }>;
  /**
   * Stores an object, replacing whatever was there.
   *
   * `contentType` defaults to the recording type, which is what every caller
   * but publication wants. A published episode is AAC and must say so: S3
   * serves back what it was told, and a feed enclosure whose type is wrong is
   * one some clients refuse to play.
   */
  put(key: string, data: Buffer, contentType?: string): Promise<void>;
  /**
   * Removes an object, and **rejects if it did not go**.
   *
   * This returned `void` and swallowed its own rejection until 2026-09-23,
   * which read as fire-and-forget and was in fact the sweep's central bug: the
   * caller could not tell a delete that happened from one that was refused, so
   * `sweepDeleted` dropped the row either way and left audio no row could
   * identify. `thefloor-server` turned out to hold no `s3:DeleteObject` at all,
   * so *every* delete had been failing silently.
   *
   * Nobody is waiting on any single key — the sweep runs on a timer — but the
   * sweep must know, so the awaiting happens there rather than here.
   */
  delete(key: string): Promise<void>;
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

  async put(
    key: string,
    data: Buffer,
    contentType = 'audio/ogg'
  ): Promise<void> {
    if (!this.writer) {
      throw new Error('No credentials for writing to the recordings bucket.');
    }
    await this.writer.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: data,
        ContentType: contentType,
      })
    );
  }

  /**
   * One range, by asking S3 for it rather than fetching the object and
   * slicing — which is the entire point: the bytes this box never reads are
   * bytes it never pays for in memory, and an episode is megabytes served to
   * strangers.
   *
   * `ContentRange` comes back as `bytes <start>-<end>/<total>`; the total is
   * what the caller needs and is not otherwise knowable without a HEAD.
   */
  async getRange(
    key: string,
    start: number,
    end: number
  ): Promise<{ data: Buffer; totalBytes: number }> {
    const response = await this.client.send(
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Range: `bytes=${start}-${end}`,
      })
    );
    const body = response.Body;
    if (!body) throw new Error(`Empty object: ${key}`);
    const chunks: Buffer[] = [];
    for await (const chunk of body as AsyncIterable<Uint8Array>) {
      chunks.push(Buffer.from(chunk));
    }
    const total = Number(response.ContentRange?.split('/')[1]);
    return {
      data: Buffer.concat(chunks),
      totalBytes: Number.isFinite(total)
        ? total
        : start + chunks.reduce((n, c) => n + c.length, 0),
    };
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

  async delete(key: string): Promise<void> {
    // The rejection reaches the caller. The sweep only removes a row once
    // every object it names has gone, so a failure here costs one more week of
    // storage and is retried, which is the safe direction: the alternative is
    // an object no row can identify. That guarantee is only real if the
    // failure is visible, which until 2026-09-23 it was not.
    await this.client.send(
      new DeleteObjectCommand({ Bucket: this.bucket, Key: key })
    );
  }
}

/** Serves objects from memory. For tests. */
export class MemoryRecordingStore implements RecordingStore {
  /**
   * Keys whose deletion is refused, standing in for the `AccessDenied` the
   * real bucket returns. A test needs this to reach the sweep's held-back
   * path, which no test could exercise while `delete` swallowed its failures.
   */
  private undeletable = new Set<string>();

  constructor(private objects: Map<string, Buffer> = new Map()) {}

  /** Makes `delete` reject for these keys, as a denied policy does. */
  refuseDeleting(...keys: string[]): void {
    for (const key of keys) this.undeletable.add(key);
  }

  async put(key: string, data: Buffer): Promise<void> {
    this.objects.set(key, data);
  }

  async get(key: string): Promise<Buffer> {
    const found = this.objects.get(key);
    if (!found) throw new Error(`No such object: ${key}`);
    return found;
  }

  async getRange(
    key: string,
    start: number,
    end: number
  ): Promise<{ data: Buffer; totalBytes: number }> {
    const found = await this.get(key);
    return {
      data: found.subarray(start, end + 1),
      totalBytes: found.length,
    };
  }

  async delete(key: string): Promise<void> {
    if (this.undeletable.has(key)) {
      throw new Error(`AccessDenied: ${key}`);
    }
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
