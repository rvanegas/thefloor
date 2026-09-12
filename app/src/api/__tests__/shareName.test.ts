/**
 * What a shared file is called on disk.
 *
 * A named channel lends its name to every recording made in it, so the name
 * alone does not identify a file — several would collide in the share sheet
 * and in whatever folder they land in. When it ended is what tells them apart.
 *
 * A track is the exception and has its own § below: that file is somebody
 * else's, it arrives with a name they chose, and the only thing this side
 * decides is the extension — which it has to be told.
 */

const downloads: string[] = [];
const moves: Array<{ from: string; to: string }> = [];
const shared: Array<{ uri: string; dialogTitle?: string; mimeType?: string }> =
  [];

/** What `downloadAsync` reports back, which a track's name depends on. */
let mockHeaders: Record<string, string> = {};

jest.mock('expo-file-system/legacy', () => ({
  cacheDirectory: 'file:///cache/',
  makeDirectoryAsync: jest.fn(async () => {}),
  deleteAsync: jest.fn(async () => {}),
  moveAsync: jest.fn(async ({ from, to }: { from: string; to: string }) => {
    moves.push({ from, to });
  }),
  downloadAsync: jest.fn(async (_url: string, target: string) => {
    downloads.push(target);
    return { uri: target, status: 200, headers: mockHeaders };
  }),
}));

jest.mock('expo-sharing', () => ({
  isAvailableAsync: jest.fn(async () => true),
  shareAsync: jest.fn(
    async (
      uri: string,
      options: { dialogTitle?: string; mimeType?: string }
    ) => {
      shared.push({
        uri,
        dialogTitle: options?.dialogTitle,
        mimeType: options?.mimeType,
      });
    }
  ),
}));

function load() {
  jest.resetModules();
  process.env.EXPO_PUBLIC_API_URL = 'http://test.local';
  return require('../download') as typeof import('../download');
}

/** 2026-08-11 14:37 local, whatever timezone this runs in. */
const ENDED = new Date(2026, 7, 11, 14, 37, 5).getTime();

beforeEach(() => {
  downloads.length = 0;
  moves.length = 0;
  shared.length = 0;
  mockHeaders = {};
});

describe('a shared recording’s filename', () => {
  it('carries the name and when the recording ended', async () => {
    const { shareRecording } = load();
    await shareRecording('token', 'rec_1', 'Thursday rehearsal', ENDED);
    expect(downloads[0]).toBe(
      'file:///cache/exports/The Floor — Thursday rehearsal — 2026-08-11 1437.ogg'
    );
  });

  it('separates two recordings that share a name', async () => {
    const { shareRecording } = load();
    await shareRecording('token', 'rec_1', 'Thursday rehearsal', ENDED);
    await shareRecording('token', 'rec_2', 'Thursday rehearsal', ENDED + 3_600_000);
    expect(new Set(downloads).size).toBe(2);
  });

  it('strips what a filename cannot carry, keeping the stamp', async () => {
    const { shareRecording } = load();
    await shareRecording('token', 'rec_1', 'Bob / Alice: "notes"', ENDED);
    expect(downloads[0]).toBe(
      'file:///cache/exports/The Floor — Bob  Alice notes — 2026-08-11 1437.ogg'
    );
  });

  it('falls back rather than producing a nameless file', async () => {
    const { shareRecording } = load();
    await shareRecording('token', 'rec_1', '///', ENDED);
    expect(downloads[0]).toContain('The Floor — channel — 2026-08-11 1437.ogg');
  });
});

describe('a shared track’s filename', () => {
  it('keeps the title and takes the extension from the server', async () => {
    mockHeaders = {
      'content-type': 'audio/mp4',
      'content-disposition': 'attachment; filename="track.m4a"',
    };
    const { shareTrack } = load();
    await shareTrack('token', 'chan_1', 'Kind of Blue');

    // Downloaded to a scratch name, because nothing about the file is known
    // until the response is — and renamed once it is.
    expect(downloads[0]).toBe('file:///cache/exports/track.download');
    expect(moves[0]).toEqual({
      from: 'file:///cache/exports/track.download',
      to: 'file:///cache/exports/Kind of Blue.m4a',
    });
    expect(shared[0].uri).toBe('file:///cache/exports/Kind of Blue.m4a');
    // Handed over under the type the server gave it, so the share sheet offers
    // the applications that can actually open it.
    expect(shared[0].mimeType).toBe('audio/mp4');
  });

  it('assumes the picker’s usual format when told nothing', async () => {
    const { shareTrack } = load();
    await shareTrack('token', 'chan_1', 'Kind of Blue');
    // A file with no extension at all is offered to nothing on iOS, which is
    // worse than a guess that names the format most of these are in.
    expect(moves[0].to).toBe('file:///cache/exports/Kind of Blue.mp3');
  });

  it('folds header case, which the platform does not', async () => {
    mockHeaders = {
      'Content-Disposition': 'attachment; filename="track.WAV"',
    };
    const { shareTrack } = load();
    await shareTrack('token', 'chan_1', 'Kind of Blue');
    expect(moves[0].to).toBe('file:///cache/exports/Kind of Blue.wav');
  });

  it('falls back rather than producing a nameless file', async () => {
    const { shareTrack } = load();
    await shareTrack('token', 'chan_1', '///');
    expect(moves[0].to).toBe('file:///cache/exports/track.mp3');
  });
});
