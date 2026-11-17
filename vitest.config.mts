import { defineConfig } from 'vitest/config';

// Every statement and every branch of the shipped source is executed by the
// unit suite, or the coverage run fails.
export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      reporter: ['text'],
      thresholds: { statements: 100, branches: 100, functions: 100, lines: 100 },
    },
  },
});
