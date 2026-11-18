import { readFileSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import pixelManifest from '../fixtures/pdq-reference/pixel-cases.json';
import { syntheticPixels } from '../helpers/pdq-pixels.js';
import { RECORDED_SPECS, STAGE_SPECS } from '../helpers/stage-specs.js';
import { portStages, recordOf } from '../helpers/stages.js';
import type { StageBuffers, StageRecord } from '../helpers/stages.js';
import { driverBuilds } from './driver.js';
import { firstBitDifference, referenceStages } from './protocol.js';

const FIXTURE = join(__dirname, '..', 'fixtures', 'pdq-reference', 'stage-cases.json');
// Set to rewrite the committed records from the reference build in hand.
const UPDATE = process.env['PDQ_REFERENCE_UPDATE'] === '1';

const builds = driverBuilds('reference-stages').map((path) => [basename(path), path] as const);

function stagesFrom(driver: string): StageBuffers[] {
  // One picture per run keeps the largest input (12 megapixels) the only
  // large thing in memory.
  return STAGE_SPECS.map((spec) => {
    const picture = { ...spec, pixels: syntheticPixels(spec) };
    const [stages] = referenceStages(driver, [picture]);
    return stages!;
  });
}

describe.each(builds)('the fixed cases against %s', (_name, driver) => {
  const reference = stagesFrom(driver);

  it.each(STAGE_SPECS.map((spec, index) => [spec.name, spec, index] as const))(
    '%s: the port matches every stage bit for bit',
    (_caseName, spec, index) => {
      const expected = reference[index]!;
      const actual = portStages(spec);
      expect(firstBitDifference(actual.downsample, expected.downsample)).toBe(-1);
      expect(firstBitDifference(actual.halfDct, expected.halfDct)).toBe(-1);
      expect(firstBitDifference(actual.dct, expected.dct)).toBe(-1);
      expect(actual.quality).toBe(expected.quality);
      expect(actual.hex).toBe(expected.hex);
    },
  );

  it('reproduces the hand-recorded hashes and qualities of pixel-cases.json', () => {
    RECORDED_SPECS.forEach((spec, index) => {
      const recorded = pixelManifest.pixelCases[index]!;
      expect(recorded.name).toBe(spec.name);
      expect(reference[index]!.hex).toBe(recorded.expectedHex);
      expect(reference[index]!.quality).toBe(recorded.expectedQuality);
    });
  });

  it('regenerates stage-cases.json with no change', async () => {
    const cases: StageRecord[] = [];
    for (const [index, spec] of STAGE_SPECS.entries()) {
      cases.push(await recordOf(spec, reference[index]!));
    }
    const regenerated = `${JSON.stringify(
      {
        source: pixelManifest.source,
        note: 'Written by test/reference/stages.ref.ts from a build of the reference. Do not edit by hand.',
        cases,
      },
      null,
      2,
    )}\n`;
    if (UPDATE) {
      writeFileSync(FIXTURE, regenerated);
    }
    expect(regenerated).toBe(readFileSync(FIXTURE, 'utf8'));
  });
});
