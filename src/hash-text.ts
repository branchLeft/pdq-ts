import { HASH_BYTES } from './pdq-hash.js';

// Canonical text form of a hash: 64 lowercase hexadecimal characters, the
// bytes of the hash in order. The reference's hex form (pdq/cpp/common/
// pdqhashtypes.cpp) prints sixteen 16-bit words most-significant first with
// lowercase %04hx; for the same hash that is these same 64 characters.

const STRICT_HEX = /^[0-9a-f]{64}$/;

export function assertHashBytes(hash: Uint8Array): void {
  if (hash.length !== HASH_BYTES) {
    throw new RangeError(`a hash is ${HASH_BYTES} bytes, got ${hash.length}`);
  }
}

export function toHex(hash: Uint8Array): string {
  assertHashBytes(hash);
  let text = '';
  for (const byte of hash) {
    text += byte.toString(16).padStart(2, '0');
  }
  return text;
}

export function fromHex(text: string): Uint8Array {
  if (!STRICT_HEX.test(text)) {
    throw new RangeError(
      'hash text must be exactly 64 lowercase hex characters [0-9a-f]: no 0x prefix, no uppercase, no whitespace, no other length',
    );
  }
  const hash = new Uint8Array(HASH_BYTES);
  for (let i = 0; i < HASH_BYTES; i++) {
    hash[i] = parseInt(text.slice(2 * i, 2 * i + 2), 16);
  }
  return hash;
}
