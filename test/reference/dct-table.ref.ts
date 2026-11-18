import { execFileSync } from 'node:child_process';
import { basename } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DCT_MATRIX_BITS } from '../../src/dct-table.js';
import { driverBuilds } from './driver.js';

describe('the pinned DCT matrix against the built reference', () => {
  it.each(driverBuilds('reference-dct-table').map((path) => [basename(path), path] as const))(
    '%s holds the same 1,024 float32 bit patterns',
    (_name, path) => {
      const words = execFileSync(path, { encoding: 'utf8' }).trim().split('\n');
      expect(words).toHaveLength(1024);
      const reference = words.map((word) => Number.parseInt(word, 16));
      expect(reference).toEqual([...DCT_MATRIX_BITS]);
    },
  );
});
