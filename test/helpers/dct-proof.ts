// The checks on the pinned DCT matrix, as functions that return what is
// wrong (nothing, when all is well), so the unit tests and the cross-engine
// conformance run share one implementation.
import { DCT_COLS, DCT_MATRIX_BITS, DCT_ROWS } from '../../src/dct-table.js';
import {
  bitsFromFloat32,
  cosFixed,
  decompose,
  float32FromBits,
  FRACTION_BITS,
  mulFixed,
  toFixed,
} from './exact.js';

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

export const SCALE_BITS = 0x3e3504f3;

// The double square root of 2/64 is correctly rounded when 1/32 lies strictly
// between the squares of the midpoints either side of it:
// (2m -+ 1)^2 * 2^(2e - 2).
export function scaleProblems(): string[] {
  const root = Math.sqrt(2.0 / DCT_COLS);
  const { mantissa, exponent } = decompose(root);
  const target = 1n << (-2n * exponent + 2n - 5n);
  const problems: string[] = [];
  if (!((2n * mantissa - 1n) ** 2n < target && (2n * mantissa + 1n) ** 2n > target)) {
    problems.push('this engine does not round the square root of 2/64 correctly');
  }
  if (bitsFromFloat32(root) !== SCALE_BITS) {
    problems.push('the scale factor is not 0x3e3504f3');
  }
  return problems;
}

// For each entry: the true value of scale * cos(angle), widened by the
// tolerance, must lie strictly inside the range of reals that round to the
// pinned float32. Then no accurate cosine can produce any other float32.
export function marginProblems(bitsTable: readonly number[] = DCT_MATRIX_BITS): string[] {
  const scale = toFixed(float32FromBits(SCALE_BITS));
  const problems: string[] = [];
  for (let i = 0; i < DCT_ROWS; i += 1) {
    for (let j = 0; j < DCT_COLS; j += 1) {
      const bits = bitsTable[i * DCT_COLS + j]!;
      const exact = mulFixed(scale, cosFixed(toFixed(angle(i, j))));
      const negative = bits >>> 31 === 1;
      const magnitude = exact < 0n ? -exact : exact;
      const pinnedBits = bits & 0x7fffffff;
      const pinned = toFixed(float32FromBits(pinnedBits));
      const below = toFixed(float32FromBits(pinnedBits - 1));
      const above = toFixed(float32FromBits(pinnedBits + 1));
      const roomBelow = 2n * (magnitude - TOLERANCE) - (pinned + below);
      const roomAbove = pinned + above - 2n * (magnitude + TOLERANCE);
      if (exact < 0n !== negative || roomBelow <= 0n || roomAbove <= 0n) {
        problems.push(`entry (${i}, ${j}) is not the only float32 an accurate cosine can give`);
      }
    }
  }
  return problems;
}

// The reference's expression evaluated with this engine's own cosine.
export function engineCosineProblems(bitsTable: readonly number[] = DCT_MATRIX_BITS): string[] {
  const scale = float32FromBits(SCALE_BITS);
  const problems: string[] = [];
  for (let i = 0; i < DCT_ROWS; i += 1) {
    for (let j = 0; j < DCT_COLS; j += 1) {
      if (bitsFromFloat32(scale * Math.cos(angle(i, j))) !== bitsTable[i * DCT_COLS + j]) {
        problems.push(`entry (${i}, ${j}) differs from this engine's cosine`);
      }
    }
  }
  return problems;
}
