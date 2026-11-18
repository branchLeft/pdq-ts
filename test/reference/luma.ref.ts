import { basename } from 'node:path';
import { describe, expect, it } from 'vitest';
import { lumaFromRgb } from '../../src/pdq.js';
import { driverBuilds } from './driver.js';
import { firstBitDifference, referenceLuma } from './protocol.js';

const builds = driverBuilds('reference-stages').map((path) => [basename(path), path] as const);

// Luma is a function of one pixel, and a pixel is one of 256^3 values, so
// this stage can be checked for every input there is rather than sampled.
describe.each(builds)('luma for all 16,777,216 RGB values against %s', (_name, driver) => {
  it.each(Array.from({ length: 16 }, (_unused, slab) => slab))(
    'red %i * 16 to + 15, every green and blue',
    (slab) => {
      const count = 16 * 256 * 256;
      const rgb = new Uint8Array(count * 3);
      let at = 0;
      for (let r = slab * 16; r < slab * 16 + 16; r += 1) {
        for (let g = 0; g < 256; g += 1) {
          for (let b = 0; b < 256; b += 1) {
            rgb[at] = r;
            rgb[at + 1] = g;
            rgb[at + 2] = b;
            at += 3;
          }
        }
      }
      const expected = referenceLuma(driver, rgb, count);
      expect(firstBitDifference(lumaFromRgb(rgb, count), expected)).toBe(-1);
    },
  );
});
