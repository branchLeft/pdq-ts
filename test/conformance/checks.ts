// The checks every JavaScript engine must pass. They use nothing but the
// language and Web Crypto: no test runner, no file system, no Node API. The
// unit suite runs them under vitest; tools/bundle-conformance.mts bundles
// them into one file that Node, Bun, Deno and browsers run as it is.
import digest from '../fixtures/pdq-reference/engine-digest.json';
import manifest from '../fixtures/pdq-reference/stage-cases.json';
import { engineCosineProblems, marginProblems, scaleProblems } from '../helpers/dct-proof.js';
import { portRunDigest } from '../helpers/engine-digest.js';
import { bitsFromFloat32 } from '../helpers/exact.js';
import { STAGE_SPECS } from '../helpers/stage-specs.js';
import { portStages, recordOf } from '../helpers/stages.js';

export interface Check {
  name: string;
  // Resolves to what is wrong; empty when the check passes.
  run: () => Promise<string[]> | string[];
}

// Math.fround must be IEEE-754 round-to-nearest, ties to even: the whole port
// rests on it. Each row is a double and the float32 bits it must round to.
// Halving is exact, where a power function need not be.
function halved(times: number): number {
  let value = 1;
  for (let i = 0; i < times; i += 1) {
    value /= 2;
  }
  return value;
}

const ROUNDING: ReadonlyArray<readonly [number, number]> = [
  [1 + halved(24), 0x3f800000],
  [1 + halved(24) + halved(50), 0x3f800001],
  [1 + 3 * halved(24), 0x3f800002],
  [0.1, 0x3dcccccd],
  [-0, 0x80000000],
  [halved(150), 0x00000000],
  [halved(149) * 0.75, 0x00000001],
  [16777217, 0x4b800000],
];

function roundingProblems(): string[] {
  return ROUNDING.filter(([value, bits]) => bitsFromFloat32(Math.fround(value)) !== bits).map(
    ([value]) => `Math.fround(${value}) is not correctly rounded`,
  );
}

async function stageProblems(): Promise<string[]> {
  const problems: string[] = [];
  if (manifest.cases.length !== STAGE_SPECS.length) {
    problems.push('the recorded cases and the specs differ in number');
  }
  for (const [index, spec] of STAGE_SPECS.entries()) {
    const actual = await recordOf(spec, portStages(spec));
    const expected = manifest.cases[index];
    for (const key of ['hex', 'quality', 'downsampleSha256', 'halfDctSha256', 'dctBits'] as const) {
      if (actual[key] !== expected?.[key]) {
        problems.push(`${spec.name}: ${key} differs from the reference's`);
      }
    }
  }
  return problems;
}

async function digestProblems(): Promise<string[]> {
  const actual = await portRunDigest(digest.seed, digest.cases);
  return actual === digest.sha256
    ? []
    : [`digest of ${digest.cases} fuzz cases is ${actual}, the reference's is ${digest.sha256}`];
}

export const CHECKS: readonly Check[] = [
  { name: 'Math.fround rounds to nearest, ties to even', run: roundingProblems },
  { name: 'the DCT scale factor is the correctly rounded root', run: scaleProblems },
  { name: 'the pinned DCT matrix is the only one an accurate cosine gives', run: marginProblems },
  { name: "the pinned DCT matrix equals this engine's own cosine", run: engineCosineProblems },
  {
    name: `${STAGE_SPECS.length} recorded cases: every stage equals the reference's`,
    run: stageProblems,
  },
  {
    name: `${digest.cases} fuzz cases: every stage equals the reference's`,
    run: digestProblems,
  },
];
