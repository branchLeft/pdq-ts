import { basename } from 'node:path';
import { describe, expect, it } from 'vitest';
import { torben } from '../../src/pdq.js';
import { prng } from '../helpers/fuzz-cases.js';
import { driverBuilds } from './driver.js';
import { firstBitDifference, referenceMedians } from './protocol.js';

const builds = driverBuilds('reference-stages').map((path) => [basename(path), path] as const);

// Arrays of every length from 1 to 300, odd and even, three ways each: all
// distinct, drawn from a handful of values so ties abound, and all equal.
function arrays(): Float32Array[] {
  const next = prng(4);
  const out: Float32Array[] = [];
  for (let n = 1; n <= 300; n += 1) {
    out.push(Float32Array.from({ length: n }, () => (next() - 2 ** 31) / 65536));
    out.push(Float32Array.from({ length: n }, () => (next() % 5) - 2));
    out.push(new Float32Array(n).fill(next() % 7));
  }
  return out;
}

describe.each(builds)('the median against %s', (_name, driver) => {
  it('the port returns the same float32 for 900 arrays of lengths 1 to 300', () => {
    const inputs = arrays();
    const expected = referenceMedians(driver, inputs);
    const actual = Float32Array.from(inputs, (values) => torben(values));
    expect(firstBitDifference(actual, expected)).toBe(-1);
  });
});
