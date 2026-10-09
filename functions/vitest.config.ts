import { defineConfig } from 'vitest/config';
export default defineConfig({ test: {
  environment: 'node',
  include: ['src/**/*.test.ts'],
  testTimeout: 60000,
  hookTimeout: 60000,
  fileParallelism: false,
  ...(process.env.FUNCTIONS_TEST_NAME_PATTERN
    ? { testNamePattern: process.env.FUNCTIONS_TEST_NAME_PATTERN }
    : {}),
} });
