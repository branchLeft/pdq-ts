import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { HASH_BYTES, MIN_HASHABLE_DIM, pdqFromPixels, toHex } from '../src/index.js';
import type { Channels } from '../src/index.js';
import { syntheticPixels } from './helpers/pdq-pixels.js';
import type { PixelCase } from './helpers/pdq-pixels.js';

interface PixelManifest {
  source: { repository: string; commit: string };
  pixelCases: PixelCase[];
}

const manifest = JSON.parse(
  readFileSync(join(__dirname, 'fixtures', 'pdq-reference', 'pixel-cases.json'), 'utf8'),
) as PixelManifest;

// The reference's own correctness test, first half: byte arrays given to the
// C++ reference and to this port must give the same hash and quality. The
// expected values were printed by the reference's hashing core over these
// exact arrays; test/fixtures/pdq-reference/README.txt says how to redo it.
describe('pdqFromPixels against the C++ reference, on identical byte arrays', () => {
  it('names the reference commit', () => {
    expect(manifest.source.commit).toBe('bd0108ff1745135a421856586d19d820dd62c6de');
  });

  it('has 24 vectors covering both channel layouts, 64 x 64 and flat input', () => {
    expect(manifest.pixelCases).toHaveLength(24);
    expect(new Set(manifest.pixelCases.map((c) => c.channels))).toEqual(new Set([1, 3]));
    expect(manifest.pixelCases.some((c) => c.width === 64 && c.height === 64)).toBe(true);
    expect(manifest.pixelCases.some((c) => c.kind === 'flat')).toBe(true);
  });

  it.each(manifest.pixelCases.map((c) => [c.name, c] as const))('%s', (_name, c) => {
    const result = pdqFromPixels(syntheticPixels(c), c.width, c.height, c.channels);
    expect(result).not.toBeNull();
    expect(result?.hash).toHaveLength(HASH_BYTES);
    expect(toHex(result!.hash)).toBe(c.expectedHex);
    expect(result?.quality).toBe(c.expectedQuality);
  });
});

describe('degenerate input', () => {
  it('a flat grey image hashes to the all-zero hash with quality 0, as the reference does', () => {
    const result = pdqFromPixels(new Uint8Array(64 * 64).fill(0), 64, 64, 1);
    expect(toHex(result!.hash)).toBe('0'.repeat(64));
    expect(result?.quality).toBe(0);
  });

  it('a flat colour image has quality 0, so a caller can discard it', () => {
    const result = pdqFromPixels(new Uint8Array(200 * 150 * 3).fill(128), 200, 150, 3);
    expect(result?.hash).toHaveLength(HASH_BYTES);
    expect(result?.quality).toBe(0);
  });

  it('yields no hash for a side shorter than the reference minimum, never a zero hash', () => {
    const small = MIN_HASHABLE_DIM - 1;
    expect(pdqFromPixels(new Uint8Array(small * 50 * 3), small, 50, 3)).toBeNull();
    expect(pdqFromPixels(new Uint8Array(50 * small), 50, small, 1)).toBeNull();
  });

  it('hashes the smallest size the reference accepts', () => {
    const spec = { width: 5, height: 5, channels: 3 as Channels, seed: 9, kind: 'blocks' as const };
    expect(pdqFromPixels(syntheticPixels(spec), 5, 5, 3)?.hash).toHaveLength(HASH_BYTES);
  });
});

describe('pdqFromPixels inputs', () => {
  const spec = { width: 90, height: 70, channels: 3 as Channels, seed: 5, kind: 'blocks' as const };

  it('is deterministic', () => {
    const a = pdqFromPixels(syntheticPixels(spec), 90, 70, 3);
    const b = pdqFromPixels(syntheticPixels(spec), 90, 70, 3);
    expect(a).toEqual(b);
  });

  it('does not modify the pixel buffer it is given', () => {
    const pixels = syntheticPixels(spec);
    const before = Uint8Array.from(pixels);
    pdqFromPixels(pixels, 90, 70, 3);
    expect(pixels).toEqual(before);
  });

  it('accepts a Node Buffer, which is a Uint8Array', () => {
    const pixels = syntheticPixels(spec);
    const fromBuffer = pdqFromPixels(Buffer.from(pixels), 90, 70, 3);
    expect(fromBuffer).toEqual(pdqFromPixels(pixels, 90, 70, 3));
  });

  it('reads a sub-view of a larger buffer from its own start', () => {
    const pixels = syntheticPixels(spec);
    const padded = new Uint8Array(pixels.length + 40);
    padded.set(pixels, 20);
    expect(pdqFromPixels(padded.subarray(20, 20 + pixels.length), 90, 70, 3)).toEqual(
      pdqFromPixels(pixels, 90, 70, 3),
    );
  });

  it.each([
    ['a zero width', new Uint8Array(100), 0, 5, 3],
    ['a fractional height', new Uint8Array(100), 5, 5.5, 3],
    ['a negative width', new Uint8Array(100), -5, 5, 3],
    ['a buffer shorter than the dimensions say', new Uint8Array(10), 5, 5, 3],
  ] as const)('rejects %s', (_name, pixels, width, height, channels) => {
    expect(() => pdqFromPixels(pixels, width, height, channels)).toThrow(RangeError);
  });

  it('rejects a channel count that is not 1 or 3 even when typed past the compiler', () => {
    const channels = 4 as Channels;
    expect(() => pdqFromPixels(new Uint8Array(100), 5, 5, channels)).toThrow(RangeError);
  });
});
