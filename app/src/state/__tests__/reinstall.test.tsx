import React from 'react';
import { Text } from 'react-native';
import renderer, { act } from 'react-test-renderer';
import { isNewInstall } from '../storage';
import { useNotificationAsk } from '../useNotificationAsk';

/**
 * A reinstall is the one event that takes the notification permission away and
 * leaves the keychain standing, and for two days it made an install
 * permanently unreachable: iOS had never been asked, the keychain said it had,
 * and the screen that would have asked is the one the stale flag suppresses.
 *
 * The defect left no trace on the device — the app simply never appeared in
 * Settings — and was found from the server end, where every notification to
 * that account had been failing `BadDeviceToken` against a token no launch
 * would replace.
 */

const mockKeychain = new Map<string, string>();
let mockMarkerExists = false;
let mockMarkerWrites = 0;

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(async (key: string) => mockKeychain.get(key) ?? null),
  setItemAsync: jest.fn(async (key: string, value: string) => {
    mockKeychain.set(key, value);
  }),
  deleteItemAsync: jest.fn(async (key: string) => {
    mockKeychain.delete(key);
  }),
}));

jest.mock('expo-file-system/legacy', () => ({
  get documentDirectory() {
    return 'file:///container/';
  },
  getInfoAsync: jest.fn(async () => ({ exists: mockMarkerExists })),
  writeAsStringAsync: jest.fn(async () => {
    mockMarkerWrites += 1;
    mockMarkerExists = true;
  }),
}));

// The permission iOS holds, which a reinstall resets to `undetermined` however
// long the keychain has been saying otherwise.
jest.mock('../../push', () => ({
  mayHoldToken: () => true,
  permissionState: jest.fn(async () => 'undetermined'),
  askForPush: jest.fn(async () => null),
}));

/** Renders the hook and reports the one value the screens read. */
function Probe({ report }: { report: (ask: string) => void }) {
  const { ask } = useNotificationAsk({
    token: 'auth',
    somebody: true,
    conversing: false,
    onRegistered: () => {},
  });
  report(ask);
  return <Text>{ask}</Text>;
}

/** Mounts, and lets the keychain reads and the marker check settle. */
async function launch(): Promise<string> {
  let latest = 'none';
  await act(async () => {
    renderer.create(<Probe report={(ask) => (latest = ask)} />);
  });
  return latest;
}

beforeEach(() => {
  mockKeychain.clear();
  mockMarkerExists = false;
  mockMarkerWrites = 0;
});

describe('the marker that dies with the app', () => {
  it('reports a new install once, and never again', async () => {
    await expect(isNewInstall()).resolves.toBe(true);
    await expect(isNewInstall()).resolves.toBe(false);
    expect(mockMarkerWrites).toBe(1);
  });

  it('says no rather than yes when the container cannot be read', async () => {
    const FileSystem = jest.requireMock('expo-file-system/legacy');
    FileSystem.getInfoAsync.mockRejectedValueOnce(new Error('no container'));

    // False is the quiet answer: it leaves an install remembering what it
    // remembers, where a wrong `true` would discard it on every launch.
    await expect(isNewInstall()).resolves.toBe(false);
  });
});

describe('a reinstall on a phone whose keychain outlived the app', () => {
  it('asks, rather than believing a previous install had already asked', async () => {
    mockKeychain.set('thefloor.notifications.pitched', 'true');
    mockKeychain.set('thefloor.notifications.nudgedAt', String(Date.now()));
    mockKeychain.set('thefloor.notifications.launches', '7');
    // Kept across the reinstall, and what makes the explanation due on this
    // launch rather than the next one.
    mockKeychain.set('thefloor.notifications.conversed', 'true');

    expect(await launch()).toBe('pitch');
  });

  it('forgets the previous install rather than the person', async () => {
    mockKeychain.set('thefloor.notifications.pitched', 'true');
    mockKeychain.set('thefloor.notifications.nudgedAt', '123');
    mockKeychain.set('thefloor.notifications.launches', '7');
    mockKeychain.set('thefloor.notifications.conversed', 'true');

    await launch();

    expect(mockKeychain.get('thefloor.notifications.pitched')).toBeUndefined();
    expect(mockKeychain.get('thefloor.notifications.nudgedAt')).toBeUndefined();
    // Counted from this install, so the launch that reinstalled is its first.
    expect(mockKeychain.get('thefloor.notifications.launches')).toBe('1');
    expect(mockKeychain.get('thefloor.notifications.conversed')).toBe('true');
  });

  it('leaves a living install alone, which is every other launch', async () => {
    mockMarkerExists = true;
    mockKeychain.set('thefloor.notifications.pitched', 'true');
    mockKeychain.set('thefloor.notifications.nudgedAt', String(Date.now()));
    mockKeychain.set('thefloor.notifications.launches', '7');

    // Pitched today and not reinstalled: the daily banner is the most that is
    // owed, and the explanation must not open itself a second time.
    expect(await launch()).toBe('none');
    expect(mockKeychain.get('thefloor.notifications.pitched')).toBe('true');
    expect(mockKeychain.get('thefloor.notifications.launches')).toBe('8');
  });
});
