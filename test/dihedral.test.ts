import { describe, expect, it } from 'vitest';
import { HASH_BYTES, pdqDihedralFromPixels, pdqFromPixels } from '../src/index.js';
import type { Channels, DihedralResult } from '../src/index.js';
import { syntheticPixels } from './helpers/pdq-pixels.js';
import pixelManifest from './fixtures/pixel-cases.json' with { type: 'json' };
import dihedralManifest from './fixtures/dihedral-cases.json' with { type: 'json' };

// Each of the eight dihedral hashes must equal the reference's (printed by
// pdqDihedralHash256esFromFloatLuma over the same byte arrays). The original
// variant must also equal the plain hash for the same input.

function channelsOf(value: number): Channels {
  if (value === 1 || value === 3) {
    return value;
  }
  throw new Error(`fixture channel count ${value} is not 1 or 3`);
}

function mustDihedral(result: DihedralResult | null): DihedralResult {
  if (result === null) {
    throw new Error('expected dihedral hashes, got null');
  }
  return result;
}

function pixelSpecFor(name: string) {
  const spec = pixelManifest.pixelCases.find((c) => c.name === name);
  if (spec === undefined) {
    throw new Error(`no pixel case named ${name}`);
  }
  return spec;
}

describe('pdqDihedralFromPixels against the C++ reference, on identical byte arrays', () => {
  it('covers all 24 cases', () => {
    expect(dihedralManifest.cases).toHaveLength(24);
  });

  it.each(dihedralManifest.cases)('$name: all eight variants and quality', (c) => {
    const spec = pixelSpecFor(c.name);
    const result = mustDihedral(
      pdqDihedralFromPixels(
        syntheticPixels(spec),
        spec.width,
        spec.height,
        channelsOf(spec.channels),
      ),
    );
    expect(result.quality).toBe(c.quality);
    expect(Buffer.from(result.hashes.original).toString('hex')).toBe(c.dihedral.Original);
    expect(Buffer.from(result.hashes.rotate90).toString('hex')).toBe(c.dihedral.Rotate90);
    expect(Buffer.from(result.hashes.rotate180).toString('hex')).toBe(c.dihedral.Rotate180);
    expect(Buffer.from(result.hashes.rotate270).toString('hex')).toBe(c.dihedral.Rotate270);
    expect(Buffer.from(result.hashes.flipX).toString('hex')).toBe(c.dihedral.FlipX);
    expect(Buffer.from(result.hashes.flipY).toString('hex')).toBe(c.dihedral.FlipY);
    expect(Buffer.from(result.hashes.flipPlus1).toString('hex')).toBe(c.dihedral.FlipPlus1);
    expect(Buffer.from(result.hashes.flipMinus1).toString('hex')).toBe(c.dihedral.FlipMinus1);
  });

  it.each(dihedralManifest.cases)('$name: original equals the plain hash', (c) => {
    const spec = pixelSpecFor(c.name);
    const pixels = syntheticPixels(spec);
    const channels = channelsOf(spec.channels);
    const dihedral = mustDihedral(pdqDihedralFromPixels(pixels, spec.width, spec.height, channels));
    const plain = pdqFromPixels(pixels, spec.width, spec.height, channels);
    if (plain === null) {
      throw new Error('expected a plain hash, got null');
    }
    expect(dihedral.hashes.original).toHaveLength(HASH_BYTES);
    expect(Buffer.from(dihedral.hashes.original).equals(Buffer.from(plain.hash))).toBe(true);
    expect(dihedral.quality).toBe(plain.quality);
  });
});

describe('pdqDihedralFromPixels inputs', () => {
  it('yields null for a side shorter than the minimum', () => {
    expect(pdqDihedralFromPixels(Buffer.alloc(4 * 50 * 3), 4, 50, 3)).toBeNull();
  });
});
