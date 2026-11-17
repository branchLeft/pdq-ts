import { describe, expect, it } from 'vitest';
import { DCT_COLS, DCT_MATRIX_BITS, DCT_ROWS } from '../src/dct-table.js';
import { engineCosineProblems, marginProblems, scaleProblems } from './helpers/dct-proof.js';

describe('the pinned DCT matrix', () => {
  it('has 16 x 64 entries, each a float32 bit pattern', () => {
    expect(DCT_ROWS).toBe(16);
    expect(DCT_COLS).toBe(64);
    expect(DCT_MATRIX_BITS).toHaveLength(1024);
    for (const bits of DCT_MATRIX_BITS) {
      expect(Number.isInteger(bits) && bits >= 0 && bits <= 0xffffffff).toBe(true);
    }
  });

  it('uses a scale factor that is the correctly rounded square root of 2/64', () => {
    expect(scaleProblems()).toEqual([]);
  });

  it('is what every build of the reference must compute, whatever its cosine', () => {
    expect(marginProblems()).toEqual([]);
  });

  it("equals the reference's expression evaluated with this engine's cosine", () => {
    expect(engineCosineProblems()).toEqual([]);
  });

  it('the proof rejects a matrix with one entry one unit in the last place away', () => {
    const wrong = [...DCT_MATRIX_BITS];
    wrong[517] = wrong[517]! + 1;
    expect(marginProblems(wrong)).toEqual([
      'entry (8, 5) is not the only float32 an accurate cosine can give',
    ]);
    expect(engineCosineProblems(wrong)).toHaveLength(1);
  });
});
