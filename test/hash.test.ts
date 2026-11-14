import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { HASH_BYTES, hammingDistance, toBase64, toHex } from '../src/index.js';

function hashOfByte(value: number): Uint8Array {
  return new Uint8Array(HASH_BYTES).fill(value);
}

describe('hammingDistance', () => {
  it('is 0 for equal hashes and 256 for complements', () => {
    expect(hammingDistance(hashOfByte(0x5a), hashOfByte(0x5a))).toBe(0);
    expect(hammingDistance(hashOfByte(0x00), hashOfByte(0xff))).toBe(256);
  });

  it('counts each differing bit once', () => {
    const a = hashOfByte(0);
    const b = hashOfByte(0);
    b[0] = 0b1000_0001;
    b[31] = 0b0000_0111;
    expect(hammingDistance(a, b)).toBe(5);
  });

  it('is symmetric', () => {
    const a = Uint8Array.from(randomBytes(HASH_BYTES));
    const b = Uint8Array.from(randomBytes(HASH_BYTES));
    expect(hammingDistance(a, b)).toBe(hammingDistance(b, a));
  });

  it('rejects a value that is not exactly 32 bytes', () => {
    expect(() => hammingDistance(new Uint8Array(31), hashOfByte(0))).toThrow(RangeError);
    expect(() => hammingDistance(hashOfByte(0), new Uint8Array(33))).toThrow(RangeError);
  });
});

describe('toHex', () => {
  it('writes 64 lowercase characters, byte 0 first', () => {
    const hash = hashOfByte(0);
    hash[0] = 0xab;
    hash[31] = 0x0f;
    expect(toHex(hash)).toBe(`ab${'00'.repeat(30)}0f`);
  });

  it('rejects a value that is not exactly 32 bytes', () => {
    expect(() => toHex(new Uint8Array(16))).toThrow(RangeError);
  });
});

describe('toBase64', () => {
  it('is the canonical padded base64 of exactly 32 bytes: 44 characters ending in =', () => {
    const text = toBase64(hashOfByte(0xff));
    expect(text).toHaveLength(44);
    expect(text).toMatch(/^[A-Za-z0-9+/]{43}=$/);
  });

  it('agrees with Node on random hashes and round-trips', () => {
    for (let round = 0; round < 50; round += 1) {
      const bytes = Uint8Array.from(randomBytes(HASH_BYTES));
      const text = toBase64(bytes);
      expect(text).toBe(Buffer.from(bytes).toString('base64'));
      expect(Uint8Array.from(Buffer.from(text, 'base64'))).toEqual(bytes);
    }
  });

  it('rejects a value that is not exactly 32 bytes', () => {
    expect(() => toBase64(new Uint8Array(33))).toThrow(RangeError);
  });
});
