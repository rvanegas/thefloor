// SafeAreaProvider measures real insets before rendering children, which never
// happens under the test renderer. The library's own mock supplies fixed insets
// so views render synchronously.
jest.mock('react-native-safe-area-context', () =>
  require('react-native-safe-area-context/jest/mock').default
);

// expo-notifications registers native listeners at import time and jest-expo's
// shim answers getLastNotificationResponseAsync with a half-built object that
// its own mapper then throws on. Neither is anything a test wants to exercise,
// and importing the real module makes every screen that reaches AppProvider
// depend on a native module that is not there.
jest.mock('expo-notifications', () => ({
  setNotificationHandler: jest.fn(),
  getPermissionsAsync: jest.fn(async () => ({
    granted: false,
    canAskAgain: false,
  })),
  requestPermissionsAsync: jest.fn(async () => ({ granted: false })),
  getDevicePushTokenAsync: jest.fn(async () => ({ type: 'ios', data: '' })),
  getLastNotificationResponseAsync: jest.fn(async () => null),
  // Nothing on the lock screen by default, which is what a fresh install has.
  // The tests that sweep hand back their own list.
  getPresentedNotificationsAsync: jest.fn(async () => []),
  dismissNotificationAsync: jest.fn(async () => {}),
  dismissAllNotificationsAsync: jest.fn(async () => {}),
  addNotificationResponseReceivedListener: jest.fn(() => ({
    remove: jest.fn(),
  })),
}));

jest.mock('expo-device', () => ({ isDevice: false }));

// The clipboard is a native module, and both of its calls are async and return
// something a caller acts on — so the stub answers rather than no-ops. The
// default is *success* with an empty clipboard: a test that cares about either
// failure path overrides it, and the alternative default would make every
// unrelated screen render as though the device were broken.
jest.mock('expo-clipboard', () => ({
  setStringAsync: jest.fn(async () => true),
  getStringAsync: jest.fn(async () => ''),
  hasStringAsync: jest.fn(async () => false),
}));

// The audio SDK reaches native modules at import time — it installs a
// DOMException polyfill and its AudioSession talks to the bridge — so any
// screen importing it would need a device to render under the test renderer.
// Only the route picker is reachable from the UI layer; the rest of this
// package is used inside src/audio, which the suite does not mount.
jest.mock('@livekit/react-native', () => ({
  AudioSession: {
    showAudioRoutePicker: jest.fn(async () => {}),
    setAppleAudioConfiguration: jest.fn(async () => {}),
    startAudioSession: jest.fn(async () => {}),
    stopAudioSession: jest.fn(async () => {}),
    // The Android half of `applyFor`. Same shape as its Apple counterpart
    // above: a promise nobody reads, stubbed so the hook's configure edge runs
    // under the test renderer without a bridge.
    configureAudio: jest.fn(async () => {}),
  },
  // The two Android configurations, inlined for the same reason
  // `AudioEngineMuteMode` is: requiring them from the real module would reach
  // the bridge at import time, which is what this mock exists to avoid.
  // src/audio/session.ts holds these by identity, so the objects must be
  // distinct and stable — two references to one object would make
  // `androidNameOf` unable to tell the states apart. Keep in step with
  // AndroidAudioTypePresets.
  AndroidAudioTypePresets: {
    communication: {
      manageAudioFocus: true,
      audioMode: 'inCommunication',
      audioFocusMode: 'gain',
      audioStreamType: 'voiceCall',
      audioAttributesUsageType: 'voiceCommunication',
      audioAttributesContentType: 'speech',
    },
    media: {
      manageAudioFocus: true,
      audioMode: 'normal',
      audioFocusMode: 'gain',
      audioStreamType: 'music',
      audioAttributesUsageType: 'media',
      audioAttributesContentType: 'unknown',
    },
  },
  registerGlobals: jest.fn(),
  setupIOSAudioManagement: jest.fn(),
  // The audio engine's own mute behaviour, which is native and iOS-only. The
  // enum is inlined rather than required from the real module because that
  // module reaches the bridge at import time, which is what this mock exists
  // to avoid. Keep the values in step with RTCAudioEngineMuteMode.
  AudioEngineMuteMode: {
    Unknown: -1,
    VoiceProcessing: 0,
    RestartEngine: 1,
    InputMixer: 2,
  },
  // The two free delegate slots, which src/audio/engineState.ts registers on to
  // log engine transitions. `willEnableEngine` and `didDisableEngine` are
  // deliberately absent: registering on those *replaces* the SDK's own audio
  // policy, and a mock that offered them would make that mistake testable
  // rather than impossible.
  audioDeviceModuleEvents: {
    setWillStartEngineHandler: jest.fn(),
    setDidStopEngineHandler: jest.fn(),
  },
  AudioDeviceModule: {
    getMuteMode: jest.fn(() => 1),
    setMuteMode: jest.fn(async () => {}),
    // The diagnostic readers in src/audio/engineState.ts. All synchronous
    // native calls, all harmless to stub, and stubbed here so a snapshot taken
    // on the microphone edge does not need the bridge under test.
    isEngineRunning: jest.fn(() => true),
    isPlaying: jest.fn(() => true),
    isRecording: jest.fn(() => true),
    isMicrophoneMuted: jest.fn(() => false),
    isVoiceProcessingEnabled: jest.fn(() => true),
    isVoiceProcessingBypassed: jest.fn(() => false),
    isRecordingAlwaysPreparedMode: jest.fn(() => false),
    getEngineAvailability: jest.fn(() => ({
      isInputAvailable: true,
      isOutputAvailable: true,
    })),
  },
}));
