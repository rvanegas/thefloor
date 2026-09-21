import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  MAX_ARTWORK_SIDE,
  MIN_ARTWORK_SIDE,
  readArtwork,
} from '../src/artwork';

/**
 * Reading a width and a height out of two file formats, and refusing on the
 * spot what a directory would refuse after a review.
 *
 * **The images are real, made by ffmpeg**, which is already a dependency of
 * every other media test here. Hand-built headers would test this parser
 * against the author's understanding of PNG rather than against PNG, and the
 * JPEG walk in particular is the kind of code that passes a synthetic fixture
 * and fails on the first file an encoder actually wrote — a real one has the
 * tables and padding the walk exists to step over.
 */

let dir: string;

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'thefloor-artwork-'));
});

afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

/** A solid rectangle, in whichever format the extension names. */
async function image(
  name: string,
  width: number,
  height: number,
  extra: string[] = []
): Promise<Buffer> {
  const path = join(dir, name);
  await new Promise<void>((resolve, reject) => {
    const child = spawn('ffmpeg', [
      '-v', 'error', '-f', 'lavfi',
      '-i', `color=c=teal:s=${width}x${height}`,
      '-frames:v', '1', ...extra, '-y', path,
    ]);
    child.on('error', reject);
    child.on('close', (code) =>
      code === 0 ? resolve() : reject(new Error(`ffmpeg exited ${code}`))
    );
  });
  return readFile(path);
}

describe('what a cover may be', () => {
  it('reads a square PNG at the bottom of the range', async () => {
    const bytes = await image('ok.png', MIN_ARTWORK_SIDE, MIN_ARTWORK_SIDE);
    const read = readArtwork(bytes);
    expect(read).toEqual({
      ok: true,
      artwork: {
        contentType: 'image/png',
        width: MIN_ARTWORK_SIDE,
        height: MIN_ARTWORK_SIDE,
      },
    });
  }, 60_000);

  /**
   * The format with no fixed offset: the size sits after however many tables
   * and comments the encoder wrote, so this is the case the segment walk
   * exists for. Getting it wrong reads a Huffman table's length as a height.
   */
  it('reads a square JPEG, walking past whatever the encoder wrote', async () => {
    const bytes = await image('ok.jpg', 2000, 2000);
    const read = readArtwork(bytes);
    expect(read.ok).toBe(true);
    if (!read.ok) return;
    expect(read.artwork).toEqual({
      contentType: 'image/jpeg',
      width: 2000,
      height: 2000,
    });
  }, 60_000);

  it('refuses one that is not square, and says what it measured', async () => {
    const read = readArtwork(await image('wide.png', 1600, 1400));
    expect(read.ok).toBe(false);
    if (read.ok) return;
    expect(read.error).toContain('square');
    expect(read.error).toContain('1600×1400');
  }, 60_000);

  it('refuses one that is too small, and names the bound', async () => {
    const read = readArtwork(await image('small.png', 600, 600));
    expect(read.ok).toBe(false);
    if (read.ok) return;
    expect(read.error).toContain(String(MIN_ARTWORK_SIDE));
    expect(read.error).toContain('600');
  }, 60_000);

  it('refuses one that is too large', async () => {
    const read = readArtwork(
      await image('huge.png', MAX_ARTWORK_SIDE + 200, MAX_ARTWORK_SIDE + 200)
    );
    expect(read.ok).toBe(false);
    if (read.ok) return;
    expect(read.error).toContain(String(MAX_ARTWORK_SIDE));
  }, 60_000);

  /**
   * The trap planning/RELEASING.md records for the app icon, arriving where
   * it can be caught: Apple rejects a cover with an alpha channel at upload,
   * with a message that does not mention alpha. A sentence here costs a file
   * picker; the other way costs a review cycle.
   */
  it('refuses a PNG with transparency, and says what to do instead', async () => {
    const bytes = await image('alpha.png', 1500, 1500, [
      '-pix_fmt', 'rgba',
    ]);
    const read = readArtwork(bytes);
    expect(read.ok).toBe(false);
    if (read.ok) return;
    expect(read.error).toContain('transparent');
    expect(read.error).toContain('JPEG');
  }, 60_000);

  it('refuses something that is not an image at all', () => {
    const read = readArtwork(Buffer.from('this is not a picture'));
    expect(read.ok).toBe(false);
    if (read.ok) return;
    expect(read.error).toContain('JPEG or a PNG');
  });

  it('refuses an empty buffer rather than throwing on it', () => {
    expect(readArtwork(Buffer.alloc(0)).ok).toBe(false);
  });

  /**
   * A truncated file is what a cancelled upload looks like, and the parser
   * reads fixed offsets — so this is the shape that would throw rather than
   * refuse if any of those reads were unguarded.
   */
  it('refuses a truncated PNG rather than throwing on it', async () => {
    const bytes = await image('cut.png', 1500, 1500);
    expect(readArtwork(bytes.subarray(0, 12)).ok).toBe(false);
    expect(readArtwork(bytes.subarray(0, 4)).ok).toBe(false);
  }, 60_000);
});
