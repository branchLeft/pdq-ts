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
  it('covers all 28 cases', () => {
    expect(dihedralManifest.cases).toHaveLength(28);
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

  // The reference has three entry points and they are not one function: at
  // exactly 64 x 64 its plain and float paths skip the blur and its dihedral
  // path never does. So "the original variant is the plain hash" holds only
  // where the reference's own recorded values say it does.
  it.each(dihedralManifest.cases)(
    '$name: original is the plain hash exactly as the reference has it',
    (c) => {
      const spec = pixelSpecFor(c.name);
      const pixels = syntheticPixels(spec);
      const channels = channelsOf(spec.channels);
      const dihedral = mustDihedral(
        pdqDihedralFromPixels(pixels, spec.width, spec.height, channels),
      );
      const plain = pdqFromPixels(pixels, spec.width, spec.height, channels);
      if (plain === null) {
        throw new Error('expected a plain hash, got null');
      }
      expect(Buffer.from(plain.hash).toString('hex')).toBe(c.plain.hash);
      expect(plain.quality).toBe(c.plain.quality);
      expect(dihedral.hashes.original).toHaveLength(HASH_BYTES);
      expect(Buffer.from(dihedral.hashes.original).equals(Buffer.from(plain.hash))).toBe(
        c.dihedral.Original === c.plain.hash,
      );
    },
  );

  // Structured 64 x 64 content, where the blur's float rounding reaches the
  // hash (seeded noise hides it, which is why the noise cases never showed
  // it): the reference's dihedral original differs from its plain hash, and
  // so must this port's.
  it.each(['ramp-64x64x3', 'checker-64x64x3'])(
    '%s: the dihedral path blurs a 64 x 64 picture and the plain path does not',
    (name) => {
      const c = dihedralManifest.cases.find((x) => x.name === name);
      if (c === undefined) {
        throw new Error(`no dihedral case named ${name}`);
      }
      expect(c.dihedral.Original, 'the reference itself differs here').not.toBe(c.plain.hash);
      const spec = pixelSpecFor(name);
      const pixels = syntheticPixels(spec);
      const dihedral = mustDihedral(
        pdqDihedralFromPixels(pixels, 64, 64, channelsOf(spec.channels)),
      );
      const plain = pdqFromPixels(pixels, 64, 64, channelsOf(spec.channels));
      expect(Buffer.from(dihedral.hashes.original).toString('hex')).toBe(c.dihedral.Original);
      expect(Buffer.from(plain?.hash ?? []).toString('hex')).toBe(c.plain.hash);
    },
  );
});

describe('pdqDihedralFromPixels inputs', () => {
  it('yields null for a side shorter than the minimum', () => {
    expect(pdqDihedralFromPixels(Buffer.alloc(4 * 50 * 3), 4, 50, 3)).toBeNull();
  });
});
