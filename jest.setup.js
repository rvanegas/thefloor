// SafeAreaProvider measures real insets before rendering children, which never
// happens under the test renderer. The library's own mock supplies fixed insets
// so views render synchronously.
jest.mock('react-native-safe-area-context', () =>
  require('react-native-safe-area-context/jest/mock').default
);
