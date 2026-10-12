import { describe, expect, it } from 'vitest';
import { pdqFloatFromPixels } from '../src/index.js';
import type { Channels, FloatOutput } from '../src/index.js';
import { syntheticPixels } from './helpers/pdq-pixels.js';
import pixelManifest from './fixtures/pixel-cases.json' with { type: 'json' };
import dihedralManifest from './fixtures/dihedral-cases.json' with { type: 'json' };

// The 256 float values, before thresholding, must match the reference's
// float32 bit patterns exactly. Bits are compared as uint32, never as decimals.

function channelsOf(value: number): Channels {
  if (value === 1 || value === 3) {
    return value;
  }
  throw new Error(`fixture channel count ${value} is not 1 or 3`);
}

function mustFloat(result: FloatOutput | null): FloatOutput {
  if (result === null) {
    throw new Error('expected float output, got null');
  }
  return result;
}

function bitsOf(value: number): number {
  const view = new DataView(new ArrayBuffer(4));
  view.setFloat32(0, value);
  return view.getUint32(0);
}

function pixelSpecFor(name: string) {
  const spec = pixelManifest.pixelCases.find((c) => c.name === name);
  if (spec === undefined) {
    throw new Error(`no pixel case named ${name}`);
  }
  return spec;
}

describe('pdqFloatFromPixels against the C++ reference, on identical byte arrays', () => {
  it.each(dihedralManifest.cases)('$name: 256 float bit patterns and quality', (c) => {
    const spec = pixelSpecFor(c.name);
    const result = mustFloat(
      pdqFloatFromPixels(syntheticPixels(spec), spec.width, spec.height, channelsOf(spec.channels)),
    );
    expect(result.quality).toBe(c.floatQuality);
    expect(result.values).toHaveLength(256);
    expect(c.floatBits).toHaveLength(256);
    for (let k = 0; k < 256; k += 1) {
      const expected = Number.parseInt(c.floatBits[k] ?? '', 16);
      expect(bitsOf(result.values[k] ?? Number.NaN)).toBe(expected);
    }
  });
});

describe('pdqFloatFromPixels inputs', () => {
  it('yields null for a side shorter than the minimum', () => {
    expect(pdqFloatFromPixels(Buffer.alloc(50 * 4), 50, 4, 1)).toBeNull();
  });
});
