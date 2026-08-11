/**
 * What an exported recording is called on disk.
 *
 * A named channel lends its name to every recording made in it, so the name
 * alone does not identify a file — several would collide in the share sheet
 * and in whatever folder they land in. When it ended is what tells them apart.
 */

const downloads: string[] = [];
const shared: Array<{ uri: string; dialogTitle?: string }> = [];

jest.mock('expo-file-system/legacy', () => ({
  cacheDirectory: 'file:///cache/',
  makeDirectoryAsync: jest.fn(async () => {}),
  downloadAsync: jest.fn(async (_url: string, target: string) => {
    downloads.push(target);
    return { uri: target, status: 200 };
  }),
}));

jest.mock('expo-sharing', () => ({
  isAvailableAsync: jest.fn(async () => true),
  shareAsync: jest.fn(async (uri: string, options: { dialogTitle?: string }) => {
    shared.push({ uri, dialogTitle: options?.dialogTitle });
  }),
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
  shared.length = 0;
});

describe('the exported filename', () => {
  it('carries the name and when the recording ended', async () => {
    const { exportRecording } = load();
    await exportRecording('token', 'rec_1', 'Thursday rehearsal', ENDED);
    expect(downloads[0]).toBe(
      'file:///cache/exports/The Floor — Thursday rehearsal — 2026-08-11 1437.ogg'
    );
  });

  it('separates two recordings that share a name', async () => {
    const { exportRecording } = load();
    await exportRecording('token', 'rec_1', 'Thursday rehearsal', ENDED);
    await exportRecording('token', 'rec_2', 'Thursday rehearsal', ENDED + 3_600_000);
    expect(new Set(downloads).size).toBe(2);
  });

  it('strips what a filename cannot carry, keeping the stamp', async () => {
    const { exportRecording } = load();
    await exportRecording('token', 'rec_1', 'Bob / Alice: "notes"', ENDED);
    expect(downloads[0]).toBe(
      'file:///cache/exports/The Floor — Bob  Alice notes — 2026-08-11 1437.ogg'
    );
  });

  it('falls back rather than producing a nameless file', async () => {
    const { exportRecording } = load();
    await exportRecording('token', 'rec_1', '///', ENDED);
    expect(downloads[0]).toContain('The Floor — channel — 2026-08-11 1437.ogg');
  });
});
