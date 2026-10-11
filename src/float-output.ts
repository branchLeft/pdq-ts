// The 16 x 16 DCT output before thresholding, as the reference's
// pdqFloat256FromFloatLuma writes it (output_buffer16x16).

import { assertInput, dctStageFromPixels, MIN_HASHABLE_DIM } from './pdq-hash.js';
import type { Channels } from './pdq-hash.js';

export interface FloatOutput {
  quality: number;
  // 256 values, row-major, in the reference's order. The third-party
  // `pdqhash.compute_float` returns the same values flattened and REVERSED.
  values: Float32Array;
}

// Returns null for a side shorter than the reference minimum, as the core does.
export function pdqFloatFromPixels(
  pixels: Uint8Array,
  width: number,
  height: number,
  channels: Channels,
): FloatOutput | null {
  assertInput(pixels, width, height, channels);
  if (width < MIN_HASHABLE_DIM || height < MIN_HASHABLE_DIM) {
    return null;
  }
  const { quality, block } = dctStageFromPixels(pixels, width, height, channels);
  return { quality, values: block };
}
