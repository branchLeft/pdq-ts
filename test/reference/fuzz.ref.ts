import { basename } from 'node:path';
import { describe, expect, it } from 'vitest';
import { pdqStagesFromPixels } from '../../src/pdq.js';
import { toHex } from '../../src/index.js';
import { describeCase, fuzzCase } from '../helpers/fuzz-cases.js';
import type { FuzzCase } from '../helpers/fuzz-cases.js';
import type { StageBuffers } from '../helpers/stages.js';
import { driverBuilds } from './driver.js';
import { firstBitDifference, referenceStages } from './protocol.js';

// PDQ_FUZZ_SEED and PDQ_FUZZ_CASES choose the run; PDQ_FUZZ_ONLY reruns one
// case of it. Every failure message is a complete reproduction recipe.
function envInteger(name: string, fallback: number): number {
  const text = process.env[name];
  if (text === undefined || text === '') {
    return fallback;
  }
  const value = Number.parseInt(text, 10);
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${name} must be a non-negative integer, got ${text}`);
  }
  return value;
}

const SEED = envInteger('PDQ_FUZZ_SEED', 1) >>> 0;
const CASES = envInteger('PDQ_FUZZ_CASES', 300);
const ONLY = envInteger('PDQ_FUZZ_ONLY', -1 >>> 0);
const BATCH_BYTES = 24 * 1024 * 1024;
const BATCH_CASES = 256;
const MINUTES = 60_000;

const builds = driverBuilds('reference-stages').map((path) => [basename(path), path] as const);

function fail(c: FuzzCase, what: string): never {
  throw new Error(
    `${describeCase(c)}: ${what}\n` +
      `reproduce, with PDQ_REFERENCE_BIN and PDQ_REFERENCE_SOURCE set as test/reference/README.md says: ` +
      `PDQ_FUZZ_SEED=${c.seed} PDQ_FUZZ_ONLY=${c.index} pnpm run test:reference`,
  );
}

function bitsAt(values: Float32Array, index: number): string {
  const bits = new Uint32Array(values.buffer, values.byteOffset, values.length)[index] ?? 0;
  return bits.toString(16).padStart(8, '0');
}

function compareBuffer(c: FuzzCase, stage: string, port: Float32Array, ref: Float32Array): void {
  const at = firstBitDifference(port, ref);
  if (at !== -1) {
    fail(c, `${stage}[${at}] is ${bitsAt(port, at)} in the port, ${bitsAt(ref, at)} in the reference`);
  }
}

function compare(c: FuzzCase, reference: StageBuffers): void {
  const port = pdqStagesFromPixels(c.pixels, c.width, c.height, c.channels);
  if (c.width < 5 || c.height < 5) {
    // The one documented difference: the reference answers a zero hash with
    // quality 0, the port answers null.
    if (port !== null || reference.hex !== '0'.repeat(64) || reference.quality !== 0) {
      fail(c, `below the minimum side: port ${String(port)}, reference ${reference.hex}`);
    }
    return;
  }
  if (port === null) {
    fail(c, 'the port returned null for a hashable size');
  }
  compareBuffer(c, 'downsample', port.downsample, reference.downsample);
  compareBuffer(c, 'halfDct', port.halfDct, reference.halfDct);
  compareBuffer(c, 'dct', port.dct, reference.dct);
  if (port.quality !== reference.quality) {
    fail(c, `quality is ${port.quality} in the port, ${reference.quality} in the reference`);
  }
  if (toHex(port.hash) !== reference.hex) {
    fail(c, `hash is ${toHex(port.hash)} in the port, ${reference.hex} in the reference`);
  }
}

describe.each(builds)('differential fuzzing against %s', (name, driver) => {
  it(
    `seed ${SEED}: ${ONLY === -1 >>> 0 ? `${CASES} cases` : `case ${ONLY} alone`}`,
    () => {
      const indices =
        ONLY === -1 >>> 0 ? Array.from({ length: CASES }, (_unused, i) => i) : [ONLY];
      const tally = new Map<string, number>();
      let batch: FuzzCase[] = [];
      let bytes = 0;
      let megapixels = 0;
      const flush = (): void => {
        const stages = referenceStages(driver, batch);
        batch.forEach((c, i) => compare(c, stages[i]!));
        batch = [];
        bytes = 0;
      };
      for (const index of indices) {
        const c = fuzzCase(SEED, index);
        tally.set(c.shape, (tally.get(c.shape) ?? 0) + 1);
        tally.set(c.content, (tally.get(c.content) ?? 0) + 1);
        megapixels += (c.width * c.height) / 1e6;
        batch.push(c);
        bytes += c.pixels.length;
        if (bytes >= BATCH_BYTES || batch.length >= BATCH_CASES) {
          flush();
        }
      }
      flush();
      const counts = [...tally].map(([key, count]) => `${key} ${count}`).join(', ');
      console.log(
        `fuzz ${name}: seed ${SEED}, ${indices.length} cases, ${megapixels.toFixed(0)} megapixels, ` +
          `no difference. ${counts}`,
      );
      expect(indices.length).toBeGreaterThan(0);
    },
    120 * MINUTES,
  );
});
