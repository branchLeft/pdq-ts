import { describe, expect, it } from 'vitest';
import { DCT_COLS, DCT_MATRIX_BITS, DCT_ROWS } from '../src/dct-table.js';
import {
  bitsFromFloat32,
  cosFixed,
  decompose,
  float32FromBits,
  FRACTION_BITS,
  mulFixed,
  toFixed,
} from './helpers/exact.js';

// The reference's expression for entry (i, j):
//   float scale = sqrt(2.0 / 64);
//   float entry = scale * cos((pi / 2.0 / 64) * (i + 1) * (2 * j + 1));
// Everything but the cosine is a single IEEE-754 operation, the same in any
// conforming build. The cosine is the C library's and may differ in its last
// digits between libraries.
function angle(i: number, j: number): number {
  return (Math.PI / 2.0 / DCT_COLS) * (i + 1) * (2 * j + 1);
}

// How far a build's double product scale * cos(angle) can sit from the true
// product: a cosine wrong by k units in its last place moves it by under
// 0.18 * k * 2^-53, and rounding the product adds under 2^-56. 2^-50 covers
// any cosine wrong by up to 40 units in the last place; C libraries promise
// under one.
const TOLERANCE = 1n << (FRACTION_BITS - 50n);

describe('the pinned DCT matrix', () => {
  it('has 16 x 64 entries, each a float32 bit pattern', () => {
    expect(DCT_ROWS).toBe(16);
    expect(DCT_COLS).toBe(64);
    expect(DCT_MATRIX_BITS).toHaveLength(1024);
    for (const bits of DCT_MATRIX_BITS) {
      expect(Number.isInteger(bits) && bits >= 0 && bits <= 0xffffffff).toBe(true);
    }
  });

  it('uses a scale factor that is the correctly rounded square root of 2/64', () => {
    // d is correctly rounded when 1/32 lies strictly between the squares of
    // the midpoints either side of d: (2m -+ 1)^2 * 2^(2e - 2).
    const root = Math.sqrt(2.0 / DCT_COLS);
    const { mantissa, exponent } = decompose(root);
    const target = 1n << (-2n * exponent + 2n - 5n);
    expect((2n * mantissa - 1n) ** 2n < target).toBe(true);
    expect((2n * mantissa + 1n) ** 2n > target).toBe(true);
    expect(bitsFromFloat32(root)).toBe(0x3e3504f3);
  });

  it('is what every build of the reference must compute, whatever its cosine', () => {
    // For each entry: the true value of scale * cos(angle), widened by the
    // tolerance, lies strictly inside the range of reals that round to the
    // pinned float32. So no accurate cosine can produce any other float32.
    const scale = toFixed(Math.fround(Math.sqrt(2.0 / DCT_COLS)));
    let tightest = 1n << FRACTION_BITS;
    for (let i = 0; i < DCT_ROWS; i += 1) {
      for (let j = 0; j < DCT_COLS; j += 1) {
        const bits = DCT_MATRIX_BITS[i * DCT_COLS + j]!;
        const exact = mulFixed(scale, cosFixed(toFixed(angle(i, j))));
        const negative = bits >>> 31 === 1;
        expect(exact < 0n).toBe(negative);
        const magnitude = negative ? -exact : exact;
        const pinnedBits = bits & 0x7fffffff;
        const pinned = toFixed(float32FromBits(pinnedBits));
        const below = toFixed(float32FromBits(pinnedBits - 1));
        const above = toFixed(float32FromBits(pinnedBits + 1));
        const roomBelow = 2n * (magnitude - TOLERANCE) - (pinned + below);
        const roomAbove = pinned + above - 2n * (magnitude + TOLERANCE);
        expect(roomBelow > 0n && roomAbove > 0n).toBe(true);
        if (roomBelow < tightest) tightest = roomBelow;
        if (roomAbove < tightest) tightest = roomAbove;
      }
    }
    expect(tightest > 0n).toBe(true);
  });

  it("equals the reference's expression evaluated with this engine's cosine", () => {
    const scale = Math.fround(Math.sqrt(2.0 / DCT_COLS));
    for (let i = 0; i < DCT_ROWS; i += 1) {
      for (let j = 0; j < DCT_COLS; j += 1) {
        const computed = bitsFromFloat32(scale * Math.cos(angle(i, j)));
        expect(computed).toBe(DCT_MATRIX_BITS[i * DCT_COLS + j]);
      }
    }
  });
});
