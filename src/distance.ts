import { assertHashBytes } from './hash-text.js';

// Number of set bits in each nibble value 0x0..0xf.
const NIBBLE_BITS: readonly number[] = [0, 1, 1, 2, 1, 2, 2, 3, 1, 2, 2, 3, 2, 3, 3, 4];

function bitsInByte(value: number): number {
  // Both indexes are masked or shifted into 0..15, so the table is never
  // read past its end; the fallback only satisfies the strict index check.
  return (NIBBLE_BITS[value & 0x0f] ?? 0) + (NIBBLE_BITS[value >> 4] ?? 0);
}

// Hamming distance: the number of bit positions where two hashes differ,
// 0 to 256 for two 32-byte hashes.
export function hammingDistance(a: Uint8Array, b: Uint8Array): number {
  assertHashBytes(a);
  assertHashBytes(b);
  let differing = 0;
  for (let i = 0; i < a.length; i++) {
    // The length check above guarantees both indexes are in range.
    differing += bitsInByte((a[i] ?? 0) ^ (b[i] ?? 0));
  }
  return differing;
}

// Hamming norm: the number of set bits in one hash, 0 to 256.
export function hammingNorm(hash: Uint8Array): number {
  assertHashBytes(hash);
  let set = 0;
  for (const byte of hash) {
    set += bitsInByte(byte);
  }
  return set;
}
