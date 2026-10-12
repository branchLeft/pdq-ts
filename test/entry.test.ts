import { describe, expect, it } from 'vitest';
import { HASH_BYTES } from '../src/index.js';

describe('package entry point', () => {
  it('exports the hash length in bytes', () => {
    expect(HASH_BYTES).toBe(32);
  });
});
