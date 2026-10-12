import { describe, expect, it } from 'vitest';
import { hammingDistance, hammingNorm } from '../src/index.js';

// Independent oracle: a naive loop over every bit position, reading one bit
// at a time. It shares no code or table with the source.
function oracleSetBits(hash: Uint8Array): number {
  let count = 0;
  for (const byte of hash) {
    for (let bit = 0; bit < 8; bit++) {
      if (((byte >> bit) & 1) === 1) {
        count++;
      }
    }
  }
  return count;
}

function oracleDistance(a: Uint8Array, b: Uint8Array): number {
  let count = 0;
  for (let i = 0; i < a.length; i++) {
    for (let bit = 0; bit < 8; bit++) {
      if ((((a[i] ?? 0) >> bit) & 1) !== (((b[i] ?? 0) >> bit) & 1)) {
        count++;
      }
    }
  }
  return count;
}

// A fixed, non-trivial 32-byte pattern.
function pattern(): Uint8Array {
  const hash = new Uint8Array(32);
  for (let i = 0; i < 32; i++) {
    hash[i] = (i * 37 + 11) & 0xff;
  }
  return hash;
}

// Flip exactly k bits, at global bit positions 0..k-1 (byte = p >> 3, bit = p & 7).
function flipFirstBits(hash: Uint8Array, k: number): Uint8Array {
  const out = Uint8Array.from(hash);
  for (let p = 0; p < k; p++) {
    const index = p >> 3;
    out[index] = ((out[index] ?? 0) ^ (1 << (p & 7))) & 0xff;
  }
  return out;
}

describe('hammingDistance', () => {
  it('is zero between a hash and itself', () => {
    const x = pattern();
    expect(hammingDistance(x, x)).toBe(0);
  });

  it('is 256 between a hash and its bitwise complement', () => {
    const x = pattern();
    const notX = Uint8Array.from(x, (byte) => byte ^ 0xff);
    expect(hammingDistance(x, notX)).toBe(256);
  });

  it('is symmetric', () => {
    const x = pattern();
    const y = flipFirstBits(x, 13);
    expect(hammingDistance(x, y)).toBe(hammingDistance(y, x));
  });

  it.each([1, 7, 8, 31, 32, 255])('counts exactly %i flipped bits, matching the oracle', (k) => {
    const x = pattern();
    const y = flipFirstBits(x, k);
    expect(hammingDistance(x, y)).toBe(k);
    expect(oracleDistance(x, y)).toBe(k);
  });

  it('agrees with the oracle on unrelated hashes', () => {
    const x = pattern();
    const y = Uint8Array.from({ length: 32 }, (_, i) => (i * 91 + 3) & 0xff);
    expect(hammingDistance(x, y)).toBe(oracleDistance(x, y));
  });

  it('refuses a hash that is not 32 bytes', () => {
    expect(() => hammingDistance(new Uint8Array(31), new Uint8Array(32))).toThrow(RangeError);
    expect(() => hammingDistance(new Uint8Array(32), new Uint8Array(33))).toThrow(RangeError);
  });
});

describe('hammingNorm', () => {
  it('is zero for the all-zero hash', () => {
    expect(hammingNorm(new Uint8Array(32))).toBe(0);
  });

  it('is 256 for the all-one hash', () => {
    expect(hammingNorm(new Uint8Array(32).fill(0xff))).toBe(256);
  });

  it('matches the oracle on a non-trivial hash', () => {
    const x = pattern();
    expect(hammingNorm(x)).toBe(oracleSetBits(x));
  });

  it('equals the distance from the all-zero hash', () => {
    const x = pattern();
    expect(hammingNorm(x)).toBe(hammingDistance(x, new Uint8Array(32)));
  });

  it('refuses a hash that is not 32 bytes', () => {
    expect(() => hammingNorm(new Uint8Array(0))).toThrow(RangeError);
  });
});
