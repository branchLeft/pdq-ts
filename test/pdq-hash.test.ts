import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { HASH_BYTES, MIN_HASHABLE_DIM, pdqFromPixels } from '../src/index.js';
import type { Channels, PdqResult } from '../src/index.js';
import { syntheticPixels } from './helpers/pdq-pixels.js';

// The package compiles to CommonJS, where JSON import attributes are not
// allowed, so the vectors are read at runtime from the package root.
interface PixelCase {
  name: string;
  width: number;
  height: number;
  channels: number;
  seed: number;
  kind: string;
  expectedHex: string;
  expectedQuality: number;
}
interface Manifest {
  pixelCases: PixelCase[];
}
const manifest: Manifest = JSON.parse(readFileSync('test/fixtures/pixel-cases.json', 'utf8'));

// The reference's correctness test, first half: the same byte arrays must give
// the same hash in the C++ reference and in this port. The expected values
// come from the reference's hashing core (hashing/pdqhashing.cpp,
// downscaling/downscaling.cpp); test/fixtures/README.txt says how to redo them.

function mustHash(result: PdqResult): NonNullable<PdqResult> {
  if (result === null) {
    throw new Error('expected a hash, got null');
  }
  return result;
}

function channelsOf(value: number): Channels {
  if (value === 1 || value === 3) {
    return value;
  }
  throw new Error(`fixture channel count ${value} is not 1 or 3`);
}

describe('pdqFromPixels against the C++ reference, on identical byte arrays', () => {
  it('has a meaningful set: every shape and both channel layouts', () => {
    expect(manifest.pixelCases.length).toBeGreaterThanOrEqual(20);
    expect(new Set(manifest.pixelCases.map((c) => c.channels))).toEqual(new Set([1, 3]));
    expect(manifest.pixelCases.some((c) => c.width === 64 && c.height === 64)).toBe(true);
    expect(manifest.pixelCases.some((c) => c.kind === 'flat')).toBe(true);
  });

  it.each(manifest.pixelCases)('$name', (c) => {
    const result = mustHash(
      pdqFromPixels(syntheticPixels(c), c.width, c.height, channelsOf(c.channels)),
    );
    expect(result.hash).toHaveLength(HASH_BYTES);
    expect(Buffer.from(result.hash).toString('hex')).toBe(c.expectedHex);
    expect(result.quality).toBe(c.expectedQuality);
  });
});

describe('pdqFromPixels inputs', () => {
  it('yields no hash for a side shorter than the reference minimum, never a zero hash', () => {
    const small = MIN_HASHABLE_DIM - 1;
    expect(pdqFromPixels(Buffer.alloc(small * 50 * 3), small, 50, 3)).toBeNull();
    expect(pdqFromPixels(Buffer.alloc(50 * small), 50, small, 1)).toBeNull();
  });

  it('hashes the smallest size the reference accepts', () => {
    const pixels = syntheticPixels({ width: 5, height: 5, channels: 3, seed: 9, kind: 'blocks' });
    expect(mustHash(pdqFromPixels(pixels, 5, 5, 3)).hash).toHaveLength(HASH_BYTES);
  });

  it('is deterministic', () => {
    const c = { width: 90, height: 70, channels: 3, seed: 5, kind: 'blocks' };
    const a = mustHash(pdqFromPixels(syntheticPixels(c), 90, 70, 3));
    const b = mustHash(pdqFromPixels(syntheticPixels(c), 90, 70, 3));
    expect(Buffer.from(a.hash).equals(Buffer.from(b.hash))).toBe(true);
  });

  it('does not modify the pixel buffer it is given', () => {
    const c = { width: 80, height: 80, channels: 3, seed: 6, kind: 'blocks' };
    const pixels = syntheticPixels(c);
    const before = Buffer.from(pixels);
    pdqFromPixels(pixels, 80, 80, 3);
    expect(pixels.equals(before)).toBe(true);
  });

  // Reflect.apply passes the out-of-type values through at run time, so the
  // RangeError guards are exercised without a cast.
  it.each([
    ['two channels', Buffer.alloc(100), 5, 5, 2],
    ['four channels', Buffer.alloc(200), 5, 5, 4],
    ['a zero width', Buffer.alloc(100), 0, 5, 3],
    ['a fractional height', Buffer.alloc(100), 5, 5.5, 3],
    ['a buffer shorter than the dimensions say', Buffer.alloc(10), 5, 5, 3],
  ])('rejects %s', (_name, pixels, width, height, channels) => {
    expect(() =>
      Reflect.apply(pdqFromPixels, undefined, [pixels, width, height, channels]),
    ).toThrow(RangeError);
  });
});
