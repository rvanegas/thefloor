/**
 * A public channel's cover image: what it must be, and how to tell.
 *
 * **Apple's requirements, enforced here rather than discovered later.** A feed
 * without artwork is not listed at all, and one whose artwork is the wrong
 * shape is rejected at submission — by which point somebody has waited on a
 * review to be told. So the upload refuses on the spot, in the words of the
 * rule it is enforcing.
 *
 * The rules are Apple's and not ours: square, between 1400 and 3000 pixels a
 * side, JPEG or PNG, RGB. Everything else about this file is the arithmetic
 * of reading a width and a height out of two file formats.
 *
 * **No image library, deliberately.** Both headers are a fixed handful of
 * bytes at a known place, this reads nothing else about the file, and it
 * never decodes a pixel — so the dependency would buy nothing and would be a
 * parser with a decade of CVEs pointed at bytes strangers upload. What it
 * cannot do is verify the rest of the file is a valid image, which is
 * deliberate too: a corrupt image is the uploader's problem, and every viewer
 * of the page will decode it with far better parsers than this one.
 */

/** Apple's bounds, both inclusive. */
export const MIN_ARTWORK_SIDE = 1400;
export const MAX_ARTWORK_SIDE = 3000;

/**
 * The most a cover may weigh.
 *
 * A 3000×3000 JPEG at sensible quality is comfortably under this, and the
 * limit exists so that the route's `bodyLimit` has a number rather than
 * because anybody has met it.
 */
export const MAX_ARTWORK_BYTES = 12 * 1024 * 1024;

export interface Artwork {
  contentType: 'image/png' | 'image/jpeg';
  width: number;
  height: number;
}

/**
 * Reads an uploaded cover, or says in one sentence why it is not one.
 *
 * The refusals are phrased to be shown to the person who chose the file —
 * they name the rule and the actual measurement, because "that image is the
 * wrong size" sends somebody back to a file picker with nothing to go on.
 */
export function readArtwork(
  bytes: Buffer
): { ok: true; artwork: Artwork } | { ok: false; error: string } {
  const measured = measurePng(bytes) ?? measureJpeg(bytes);
  if (!measured) {
    return {
      ok: false,
      error: 'Cover art has to be a JPEG or a PNG.',
    };
  }
  if ('error' in measured) return { ok: false, error: measured.error };

  const { width, height } = measured;
  if (width !== height) {
    return {
      ok: false,
      error: `Cover art has to be square, and that one is ${width}×${height}.`,
    };
  }
  if (width < MIN_ARTWORK_SIDE || width > MAX_ARTWORK_SIDE) {
    return {
      ok: false,
      error:
        `Cover art has to be between ${MIN_ARTWORK_SIDE} and ` +
        `${MAX_ARTWORK_SIDE} pixels square, and that one is ${width}.`,
    };
  }
  return { ok: true, artwork: measured };
}

const PNG_SIGNATURE = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);

/**
 * A PNG's dimensions, from IHDR — which the format requires to be the first
 * chunk, so its position is fixed rather than searched for.
 *
 * **Alpha is refused, and this is the one rule here that is ours as much as
 * Apple's.** Apple asks for RGB; a cover with transparency is also the exact
 * trap planning/RELEASING.md records for the app icon, where it is rejected
 * at upload with a message that does not mention alpha. Catching it at the
 * file picker costs a sentence; catching it at submission costs a review
 * cycle. Colour types 4 and 6 are the two that carry an alpha channel.
 */
function measurePng(
  bytes: Buffer
): Artwork | { error: string } | null {
  if (bytes.length < 26 || !bytes.subarray(0, 8).equals(PNG_SIGNATURE)) {
    return null;
  }
  if (bytes.subarray(12, 16).toString('latin1') !== 'IHDR') {
    return { error: 'That PNG is malformed — it has no header.' };
  }
  const colourType = bytes[25];
  if (colourType === 4 || colourType === 6) {
    return {
      error:
        'Cover art cannot have a transparent background. Save it as a JPEG, ' +
        'or flatten the PNG onto a solid colour.',
    };
  }
  return {
    contentType: 'image/png',
    width: bytes.readUInt32BE(16),
    height: bytes.readUInt32BE(20),
  };
}

/**
 * A JPEG's dimensions, by walking its segments to the frame header.
 *
 * Unlike PNG there is no fixed offset: a JPEG is a sequence of marker
 * segments and the one carrying the size — a start-of-frame — sits after
 * however many tables, comments and EXIF blocks the encoder wrote. So this
 * walks, which is the whole of the complexity here.
 *
 * Every SOF marker in the `0xC0`–`0xCF` range carries the same header shape,
 * except the four that are not frames at all: `0xC4` defines Huffman tables,
 * `0xC8` is a JPEG extension, and `0xCC` defines arithmetic coding
 * conditioning. Missing that exclusion is the classic way this function is
 * written wrong, and it reads a table's length as a picture's height.
 */
function measureJpeg(bytes: Buffer): Artwork | { error: string } | null {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;

  let offset = 2;
  while (offset + 3 < bytes.length) {
    // Segments are padded with 0xFF bytes, which are skipped rather than
    // treated as a marker of their own.
    if (bytes[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    const marker = bytes[offset + 1];
    if (marker === 0xff) {
      offset += 1;
      continue;
    }
    // Standalone markers: no length, nothing to skip.
    if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd9)) {
      offset += 2;
      continue;
    }
    const length = bytes.readUInt16BE(offset + 2);
    if (length < 2) return { error: 'That JPEG is malformed.' };

    const isFrame =
      marker >= 0xc0 &&
      marker <= 0xcf &&
      marker !== 0xc4 &&
      marker !== 0xc8 &&
      marker !== 0xcc;
    if (isFrame) {
      if (offset + 9 > bytes.length) return { error: 'That JPEG is malformed.' };
      return {
        contentType: 'image/jpeg',
        // Height precedes width in a start-of-frame header, which is the
        // other way round from PNG and is worth reading twice.
        height: bytes.readUInt16BE(offset + 5),
        width: bytes.readUInt16BE(offset + 7),
      };
    }
    offset += 2 + length;
  }
  return { error: 'That JPEG has no image in it.' };
}

/** Where a channel's cover lives, beside the recordings it is the cover for. */
export function artworkKeyFor(channelId: string): string {
  return `${channelId}/artwork`;
}
