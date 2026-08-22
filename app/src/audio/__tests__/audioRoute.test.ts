import {
  onRouteChange,
  routeLine,
  routeSnapshot,
  setAllowHapticsDuringRecording,
  vibrate,
} from '../../../modules/audio-route';

/**
 * The route reader is a *local* native module, so it is absent under jest,
 * absent on Android, and absent in any build where autolinking did not pick it
 * up. It is also loaded on the path that carries live audio.
 *
 * So the property worth pinning is not what it reads — no test can produce a
 * Bluetooth route — but that every one of those absences costs a diagnostic
 * line rather than a call.
 */

describe('when the native module is not there, which is the case under test', () => {
  it('reads as null rather than throwing', () => {
    expect(() => routeSnapshot()).not.toThrow();
    expect(routeSnapshot()).toBeNull();
  });

  it('subscribes to nothing and unsubscribes safely', () => {
    const listener = jest.fn();
    let stop!: () => void;
    expect(() => {
      stop = onRouteChange(listener);
    }).not.toThrow();
    expect(() => stop()).not.toThrow();
    expect(listener).not.toHaveBeenCalled();
  });

  it('says so on screen rather than rendering an empty line', () => {
    expect(routeLine(null)).toBe('route unreadable');
  });

  /**
   * The one write in this module, and it is on the session path rather than
   * the panel path — `applyConfiguration` awaits it at every configuration
   * edge. A rejection there would be an unhandled one inside a live call, for
   * the sake of a cue that is an extra.
   */
  it('answers false for the haptics permission rather than rejecting', async () => {
    await expect(setAllowHapticsDuringRecording(true)).resolves.toBe(false);
  });

  /**
   * False is what `useSilencedNudge` reads as "fall back to `expo-haptics`",
   * so this is not merely an absence being tolerated — it is the branch that
   * keeps a cue on Android and on any build older than the Swift beside it.
   */
  it('says the vibration did not play rather than throwing', () => {
    expect(vibrate()).toBe(false);
  });
});

describe('routeLine', () => {
  const route = {
    outputs: ['BluetoothA2DP(AirPods Pro)'],
    inputs: ['MicrophoneBuiltIn(iPhone Microphone)'],
    sampleRate: 48000,
    category: 'AVAudioSessionCategoryPlayAndRecord',
    mode: 'AVAudioSessionModeVideoChat',
  };

  // The sample rate is the whole reason this exists: 44.1/48k is A2DP and
  // 16k (sometimes 8) is the hands-free profile, so a rate that halves across
  // a mute is a profile handover with nothing left to judge by ear.
  it('leads with the output port and carries the sample rate', () => {
    const line = routeLine(route);
    expect(line).toContain('BluetoothA2DP(AirPods Pro)');
    expect(line).toContain('sr=48000');
  });

  it('rounds the rate, which arrives as a double', () => {
    expect(routeLine({ ...route, sampleRate: 16000.000001 })).toContain(
      'sr=16000'
    );
  });

  // Only present on a change event, and it is the field that separates a
  // profile handover from a session being deactivated and reactivated.
  it('carries the reason when there is one, and omits it otherwise', () => {
    expect(routeLine(route)).not.toContain('why=');
    expect(routeLine({ ...route, reason: 'categoryChange' })).toContain(
      'why=categoryChange'
    );
  });
});
