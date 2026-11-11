import { HASH_BYTES } from './pdq.js';

const BASE64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function assertHash(hash: Uint8Array, name: string): void {
  if (hash.length !== HASH_BYTES) {
    throw new RangeError(`${name}: a PDQ hash is exactly ${HASH_BYTES} bytes, got ${hash.length}`);
  }
}

function bitCount(byte: number): number {
  let bits = 0;
  for (let x = byte; x !== 0; x >>= 1) {
    bits += x & 1;
  }
  return bits;
}

// Number of differing bits between two hashes, 0 to 256.
export function hammingDistance(a: Uint8Array, b: Uint8Array): number {
  assertHash(a, 'hammingDistance');
  assertHash(b, 'hammingDistance');
  let bits = 0;
  for (let i = 0; i < HASH_BYTES; i += 1) {
    bits += bitCount(a[i]! ^ b[i]!);
  }
  return bits;
}

// The reference's own text form: 64 lowercase hex characters, byte 0 first.
export function toHex(hash: Uint8Array): string {
  assertHash(hash, 'toHex');
  let text = '';
  for (let i = 0; i < HASH_BYTES; i += 1) {
    text += hash[i]!.toString(16).padStart(2, '0');
  }
  return text;
}

// Canonical padded base64 of the 32 bytes: always 44 characters ending in '='.
export function toBase64(hash: Uint8Array): string {
  assertHash(hash, 'toBase64');
  let text = '';
  for (let i = 0; i < HASH_BYTES; i += 3) {
    const b0 = hash[i]!;
    const b1 = i + 1 < HASH_BYTES ? hash[i + 1]! : 0;
    const b2 = i + 2 < HASH_BYTES ? hash[i + 2]! : 0;
    const group = (b0 << 16) | (b1 << 8) | b2;
    text += BASE64_ALPHABET[(group >> 18) & 63]!;
    text += BASE64_ALPHABET[(group >> 12) & 63]!;
    text += i + 1 < HASH_BYTES ? BASE64_ALPHABET[(group >> 6) & 63]! : '=';
    text += i + 2 < HASH_BYTES ? BASE64_ALPHABET[group & 63]! : '=';
  }
  return text;
}
