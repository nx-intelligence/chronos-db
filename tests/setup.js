// Jest setup file
// This file runs before each test file

// Increase timeout for integration tests
jest.setTimeout(30000);

// Suppress console warnings for cleaner test output
const originalConsoleWarn = console.warn;
console.warn = (...args) => {
  // Suppress specific warnings that are expected in tests
  if (args[0] && typeof args[0] === 'string' && args[0].includes('MODULE_TYPELESS_PACKAGE_JSON')) {
    return;
  }
  originalConsoleWarn(...args);
};
