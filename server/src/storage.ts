import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';

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
}
