/**
 * The microphone permission, which on Android has to be held *before* the
 * foreground service starts rather than merely by the time the microphone
 * opens. `callService.test.tsx` covers what the audio hook does with the
 * answer; this covers the answer.
 *
 * `react-native` is mocked wholesale rather than through its own jest preset
 * because `Platform.OS` is the input to two of these cases, and the preset's is
 * fixed at `ios`.
 */

// Prefixed `mock` because jest hoists the factory above these declarations and
// permits it to reach only names that say they are part of a mock.
const mockCheck = jest.fn();
const mockRequest = jest.fn();
const mockPlatform = { OS: 'android' };

jest.mock('react-native', () => ({
  Platform: mockPlatform,
  PermissionsAndroid: {
    check: (...args: unknown[]) => mockCheck(...args),
    request: (...args: unknown[]) => mockRequest(...args),
    PERMISSIONS: { RECORD_AUDIO: 'android.permission.RECORD_AUDIO' },
    RESULTS: { GRANTED: 'granted', DENIED: 'denied', NEVER: 'never_ask_again' },
  },
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { ensureMicPermission } = require('../micPermission') as {
  ensureMicPermission: () => Promise<boolean>;
};

describe('the microphone permission', () => {
  beforeEach(() => {
    mockPlatform.OS = 'android';
    mockCheck.mockReset();
    mockRequest.mockReset();
  });

  it('asks when it is not already held, and reports the grant', async () => {
    mockCheck.mockResolvedValue(false);
    mockRequest.mockResolvedValue('granted');

    await expect(ensureMicPermission()).resolves.toBe(true);
    expect(mockRequest).toHaveBeenCalledWith('android.permission.RECORD_AUDIO');
  });

  it('reports a refusal rather than throwing', async () => {
    mockCheck.mockResolvedValue(false);
    mockRequest.mockResolvedValue('denied');

    await expect(ensureMicPermission()).resolves.toBe(false);
  });

  /**
   * A permanent refusal resolves without showing anything, so it is not a
   * dialog on every channel — but it is still `false`, and the channel it
   * declines the service for still works on screen.
   */
  it('treats a permanent refusal as a refusal', async () => {
    mockCheck.mockResolvedValue(false);
    mockRequest.mockResolvedValue('never_ask_again');

    await expect(ensureMicPermission()).resolves.toBe(false);
  });

  it('does not ask again once it is held', async () => {
    mockCheck.mockResolvedValue(true);

    await expect(ensureMicPermission()).resolves.toBe(true);
    expect(mockRequest).not.toHaveBeenCalled();
  });

  /**
   * iOS raises its own prompt when the track opens and gates nothing on holding
   * the permission in advance, so asking here would be a second dialog for a
   * permission it is about to ask for itself.
   */
  it('asks nothing at all off Android', async () => {
    mockPlatform.OS = 'ios';

    await expect(ensureMicPermission()).resolves.toBe(true);
    expect(mockCheck).not.toHaveBeenCalled();
    expect(mockRequest).not.toHaveBeenCalled();
  });

  /** Never throws: a bridge that refuses to answer is a refusal. */
  it('answers false when the ask itself fails', async () => {
    mockCheck.mockRejectedValue(new Error('no bridge'));

    await expect(ensureMicPermission()).resolves.toBe(false);
  });
});
