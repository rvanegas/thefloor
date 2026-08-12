import {
  DeleteObjectCommand,
  GetObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';

/**
 * Read access to the recordings bucket.
 *
 * Deliberately not the credentials handed to LiveKit: those are PutObject-only
 * and cannot read the bucket back, so a leak of the key that travels to a third
 * party cannot be used to retrieve anyone's conversations. Reading is the
 * server's own privilege, from its own credential chain — an instance role in
 * production, a local profile in development.
 */
export interface RecordingStore {
  get(key: string): Promise<Buffer>;
  /**
   * Removes an object. Fire-and-forget by design: the sweep that calls this
   * runs on a timer with nobody waiting, and a failure leaves the row in place
   * to be retried on the next one.
   */
  delete(key: string): void;
}

export class S3RecordingStore implements RecordingStore {
  private client: S3Client;

  constructor(
    private bucket: string,
    region: string
  ) {
    this.client = new S3Client({ region });
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

  put(key: string, data: Buffer): void {
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
