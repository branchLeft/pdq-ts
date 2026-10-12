// The eight dihedral variants of the PDQ 16 x 16 DCT block, each thresholded
// on its own median. Translated from the reference's
// pdqDihedralHash256esFromFloatLuma and the dct16OriginalTo* helpers in
// hashing/pdqhashing.cpp (see THIRD-PARTY-LICENSE-ThreatExchange-PDQ.txt).

import { assertInput, at, bitsToBytes, dctStageFromPixels, MIN_HASHABLE_DIM } from './pdq-hash.js';
import type { Channels } from './pdq-hash.js';

const SIDE = 16;

export interface DihedralHashes {
  original: Uint8Array;
  rotate90: Uint8Array;
  rotate180: Uint8Array;
  rotate270: Uint8Array;
  flipX: Uint8Array;
  flipY: Uint8Array;
  flipPlus1: Uint8Array;
  flipMinus1: Uint8Array;
}

export interface DihedralResult {
  quality: number;
  hashes: DihedralHashes;
}

// Reads A (16 x 16, row-major) into B. `transpose` writes B[j][i] for A[i][j]
// (the reference's B[j][i] = ...); otherwise B[i][j]. `negate(i, j)` says
// whether the reference writes -A[i][j] for that element.
function mapBlock(
  a: Float32Array,
  transpose: boolean,
  negate: (i: number, j: number) => boolean,
): Float32Array {
  const b = new Float32Array(SIDE * SIDE);
  for (let i = 0; i < SIDE; i += 1) {
    for (let j = 0; j < SIDE; j += 1) {
      const value = negate(i, j) ? -at(a, i * SIDE + j) : at(a, i * SIDE + j);
      const dest = transpose ? j * SIDE + i : i * SIDE + j;
      b[dest] = value;
    }
  }
  return b;
}

// Each line names the reference helper it translates.
const rotate90 = (a: Float32Array): Float32Array => mapBlock(a, true, (_i, j) => (j & 1) === 0); // dct16OriginalToRotate90
const rotate180 = (a: Float32Array): Float32Array =>
  mapBlock(a, false, (i, j) => ((i + j) & 1) === 1); // dct16OriginalToRotate180
const rotate270 = (a: Float32Array): Float32Array => mapBlock(a, true, (i) => (i & 1) === 0); // dct16OriginalToRotate270
const flipX = (a: Float32Array): Float32Array => mapBlock(a, false, (i) => (i & 1) === 0); // dct16OriginalToFlipX
const flipY = (a: Float32Array): Float32Array => mapBlock(a, false, (_i, j) => (j & 1) === 0); // dct16OriginalToFlipY
const flipPlus1 = (a: Float32Array): Float32Array => mapBlock(a, true, () => false); // dct16OriginalToFlipPlus1
const flipMinus1 = (a: Float32Array): Float32Array =>
  mapBlock(a, true, (i, j) => ((i + j) & 1) === 1); // dct16OriginalToFlipMinus1

// Returns null for a side shorter than the reference minimum, as the core does.
export function pdqDihedralFromPixels(
  pixels: Uint8Array,
  width: number,
  height: number,
  channels: Channels,
): DihedralResult | null {
  assertInput(pixels, width, height, channels);
  if (width < MIN_HASHABLE_DIM || height < MIN_HASHABLE_DIM) {
    return null;
  }
  // The reference's dihedral entry point blurs even a 64 x 64 image.
  const { quality, block } = dctStageFromPixels(pixels, width, height, channels, true);
  return {
    quality,
    hashes: {
      original: bitsToBytes(block),
      rotate90: bitsToBytes(rotate90(block)),
      rotate180: bitsToBytes(rotate180(block)),
      rotate270: bitsToBytes(rotate270(block)),
      flipX: bitsToBytes(flipX(block)),
      flipY: bitsToBytes(flipY(block)),
      flipPlus1: bitsToBytes(flipPlus1(block)),
      flipMinus1: bitsToBytes(flipMinus1(block)),
    },
  };
}
