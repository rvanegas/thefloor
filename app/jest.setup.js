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
