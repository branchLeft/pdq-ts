import { defineConfig } from 'vitest/config';

// The control for the coverage gate: the same thresholds, over one fully
// covered source file plus one
// file that no test executes. This run must fail. Only the quick tests run:
// what is under test here is the gate, not the port.
export default defineConfig({
  test: {
    include: ['test/hash.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/hash.ts', 'test/coverage-control/unreached.ts'],
      reporter: ['text'],
      thresholds: { statements: 100, branches: 100, functions: 100, lines: 100 },
    },
  },
});
