// One SHA-256 standing for every stage of a fixed run of fuzz cases. The
// reference suite computes it from the reference's buffers and CI fails if
// the committed value changes; an engine computes it from the port's. Equal
// digests mean the engine reproduced every bit of every stage of every case.
import { pdqStagesFromPixels } from '../../src/pdq.js';
import { fuzzCase } from './fuzz-cases.js';
import { floatBytes, sha256Hex } from './stages.js';

export interface DigestStages {
  hash: Uint8Array;
  quality: number;
  downsample: Float32Array;
  halfDct: Float32Array;
  dct: Float32Array;
}

// What stands for a case with a side under the minimum, where the port gives
// null and the reference a zero hash.
export const NO_HASH = 'no-hash';

export async function caseDigest(stages: DigestStages | null): Promise<string> {
  if (stages === null) {
    return NO_HASH;
  }
  const parts = [
    floatBytes(stages.downsample),
    floatBytes(stages.halfDct),
    floatBytes(stages.dct),
    Uint8Array.of(stages.quality),
    stages.hash,
  ];
  const bytes = new Uint8Array(parts.reduce((total, part) => total + part.length, 0));
  let at = 0;
  for (const part of parts) {
    bytes.set(part, at);
    at += part.length;
  }
  return sha256Hex(bytes);
}

export async function runDigest(caseDigests: readonly string[]): Promise<string> {
  return sha256Hex(new TextEncoder().encode(caseDigests.join('\n')));
}

export async function portRunDigest(seed: number, cases: number): Promise<string> {
  const digests: string[] = [];
  for (let index = 0; index < cases; index += 1) {
    const c = fuzzCase(seed, index);
    digests.push(await caseDigest(pdqStagesFromPixels(c.pixels, c.width, c.height, c.channels)));
  }
  return runDigest(digests);
}
