jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

// Error tracking is off in tests (no DSN); the native SDK can't load under Jest.
jest.mock('@sentry/react-native', () => ({
  init: jest.fn(),
  wrap: (c) => c,
  setUser: jest.fn(),
  setTag: jest.fn(),
  setTags: jest.fn(),
  withScope: jest.fn(),
  captureException: jest.fn(),
  captureMessage: jest.fn(),
}));
