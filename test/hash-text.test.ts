import { describe, expect, it } from 'vitest';
import { HASH_BYTES, fromHex, pdqFromPixels, toHex } from '../src/index.js';
import type { Channels } from '../src/index.js';
import { syntheticPixels } from './helpers/pdq-pixels.js';
import manifest from './fixtures/pixel-cases.json' with { type: 'json' };

function channelsOf(value: number): Channels {
  if (value === 1 || value === 3) {
    return value;
  }
  throw new Error(`fixture channel count ${value} is not 1 or 3`);
}

describe('hex text form of a hash', () => {
  it.each(manifest.pixelCases)('round-trips the expected hash of $name', (c) => {
    const bytes = fromHex(c.expectedHex);
    expect(bytes).toHaveLength(HASH_BYTES);
    expect(Buffer.from(bytes).equals(Buffer.from(c.expectedHex, 'hex'))).toBe(true);
    expect(toHex(bytes)).toBe(c.expectedHex);
  });

  it.each(manifest.pixelCases)(
    'prints the hash the port computes for $name as the fixture hex',
    (c) => {
      const result = pdqFromPixels(syntheticPixels(c), c.width, c.height, channelsOf(c.channels));
      if (result === null) {
        throw new Error('expected a hash, got null');
      }
      expect(toHex(result.hash)).toBe(c.expectedHex);
    },
  );

  it('rejects an uppercase hex string', () => {
    expect(() =>
      fromHex('C67396A5398C695AC4F16499C6F1CB72390E96A5C67396A5398C695AC4F1649D'),
    ).toThrow(RangeError);
  });

  it('rejects leading whitespace', () => {
    expect(() =>
      fromHex(' c67396a5398c695ac4f16499c6f1cb72390e96a5c67396a5398c695ac4f1649d'),
    ).toThrow(RangeError);
  });

  it('rejects a trailing newline', () => {
    expect(() =>
      fromHex('c67396a5398c695ac4f16499c6f1cb72390e96a5c67396a5398c695ac4f1649d\n'),
    ).toThrow(RangeError);
  });

  it('rejects a 0x prefix', () => {
    expect(() =>
      fromHex('0xc67396a5398c695ac4f16499c6f1cb72390e96a5c67396a5398c695ac4f1649d'),
    ).toThrow(RangeError);
  });

  it('rejects a string one character short of 64', () => {
    expect(() =>
      fromHex('c67396a5398c695ac4f16499c6f1cb72390e96a5c67396a5398c695ac4f1649'),
    ).toThrow(RangeError);
  });

  it('rejects a string one character over 64', () => {
    expect(() =>
      fromHex('c67396a5398c695ac4f16499c6f1cb72390e96a5c67396a5398c695ac4f1649d0'),
    ).toThrow(RangeError);
  });

  it('rejects a non-hex character', () => {
    expect(() =>
      fromHex('g67396a5398c695ac4f16499c6f1cb72390e96a5c67396a5398c695ac4f1649d'),
    ).toThrow(RangeError);
  });

  it('names the rule in the error message', () => {
    expect(() => fromHex('')).toThrow(/64 lowercase hex characters/);
  });

  it('refuses toHex on a buffer that is not 32 bytes', () => {
    expect(() => toHex(new Uint8Array(31))).toThrow(RangeError);
    expect(() => toHex(new Uint8Array(33))).toThrow(RangeError);
  });
});
