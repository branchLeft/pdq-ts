import { defineConfig } from 'vitest/config';

// The suite that compares the port with a built copy of the reference. It
// needs PDQ_REFERENCE_BIN (see test/reference/README.md) and is not part of
// `pnpm test`.
export default defineConfig({
  test: {
    include: ['test/reference/**/*.ref.ts'],
    passWithNoTests: false,
  },
});
