// Exact arithmetic on IEEE-754 values with BigInt, for the tests that prove
// rather than sample. A value is held as an integer count of 2^-FRACTION_BITS.

export const FRACTION_BITS = 320n;
const ONE = 1n << FRACTION_BITS;

export function float32FromBits(bits: number): number {
  const view = new DataView(new ArrayBuffer(4));
  view.setUint32(0, bits);
  return view.getFloat32(0);
}

export function bitsFromFloat32(value: number): number {
  const view = new DataView(new ArrayBuffer(4));
  view.setFloat32(0, value);
  return view.getUint32(0);
}

// A finite double as mantissa * 2^exponent, exactly.
export function decompose(value: number): { mantissa: bigint; exponent: bigint } {
  const view = new DataView(new ArrayBuffer(8));
  view.setFloat64(0, value);
  const raw = view.getBigUint64(0);
  const negative = raw >> 63n === 1n;
  const biased = (raw >> 52n) & 0x7ffn;
  const fraction = raw & ((1n << 52n) - 1n);
  if (biased === 0x7ffn) {
    throw new RangeError('decompose: value is not finite');
  }
  const magnitude = biased === 0n ? fraction : fraction | (1n << 52n);
  const exponent = (biased === 0n ? 1n : biased) - 1075n;
  return { mantissa: negative ? -magnitude : magnitude, exponent };
}

// Exact for any double whose lowest set bit is at or above 2^-FRACTION_BITS.
export function toFixed(value: number): bigint {
  const { mantissa, exponent } = decompose(value);
  const shift = FRACTION_BITS + exponent;
  if (shift < 0n) {
    throw new RangeError('toFixed: value needs more fraction bits than are kept');
  }
  return mantissa << shift;
}

export function mulFixed(a: bigint, b: bigint): bigint {
  return (a * b) >> FRACTION_BITS;
}

// Cosine by its Taylor series. For |x| < 64 the result is within 2^-200 of
// the true cosine: there are fewer than 400 terms, each step truncates by at
// most two units of 2^-320, and no term outgrows an earlier one by over 2^93.
export function cosFixed(x: bigint): bigint {
  const square = mulFixed(x, x);
  let term = ONE;
  let sum = ONE;
  for (let n = 1n; term !== 0n; n += 1n) {
    term = -mulFixed(term, square) / ((2n * n - 1n) * (2n * n));
    sum += term;
  }
  return sum;
}
