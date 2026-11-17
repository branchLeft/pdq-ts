import { describe, expect, it } from 'vitest';
import manifest from './fixtures/pdq-reference/stage-cases.json';
import { EDGE_SPECS, RECORDED_SPECS, STAGE_SPECS } from './helpers/stage-specs.js';
import { portStages, recordOf } from './helpers/stages.js';

// The committed records are the reference's: CI rebuilds the reference and
// fails if regenerating them changes a byte (test/reference/stages.ref.ts).
// This test needs no reference, so it runs on every engine.
describe('every stage of the port against the recorded reference stages', () => {
  it('covers the recorded cases and the edge cases, one record each, in order', () => {
    expect(RECORDED_SPECS).toHaveLength(24);
    expect(EDGE_SPECS.length).toBeGreaterThanOrEqual(20);
    expect(manifest.cases.map((c) => c.name)).toEqual(STAGE_SPECS.map((s) => s.name));
    expect(new Set(manifest.cases.map((c) => c.name)).size).toBe(manifest.cases.length);
  });

  it.each(STAGE_SPECS.map((spec, index) => [spec.name, spec, index] as const))(
    '%s: hash, quality, 64 x 64 downsample, 16 x 64 and 16 x 16 DCT buffers',
    async (_name, spec, index) => {
      const actual = await recordOf(spec, portStages(spec));
      expect(actual).toEqual(manifest.cases[index]);
    },
  );
});
