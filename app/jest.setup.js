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
  addNotificationResponseReceivedListener: jest.fn(() => ({
    remove: jest.fn(),
  })),
}));

jest.mock('expo-device', () => ({ isDevice: false }));

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
