module.exports = {
  testEnvironment: 'jsdom',
  testMatch: ['**/tests/security/**/*.test.ts'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
};
