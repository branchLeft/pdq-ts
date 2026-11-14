// Deterministic pixel buffers for the exactness test. The same function
// produced the inputs the C++ reference was run on (see
// test/fixtures/pdq-reference/README.txt), so the recorded hashes line up.
import type { Channels } from '../../src/index.js';

export interface PixelCase {
  name: string;
  width: number;
  height: number;
  channels: Channels;
  seed: number;
  kind: 'blocks' | 'flat';
  expectedHex: string;
  expectedQuality: number;
}

type PixelSpec = Pick<PixelCase, 'width' | 'height' | 'channels' | 'seed' | 'kind'>;

function lcg(seed: number): () => number {
  let state = seed >>> 0;
  return (): number => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state >>> 24;
  };
}

// `kind: 'blocks'` is blocky content plus low-amplitude noise, so the DCT is
// not degenerate; `kind: 'flat'` is one value everywhere.
export function syntheticPixels({ width, height, channels, seed, kind }: PixelSpec): Uint8Array {
  const pixels = new Uint8Array(width * height * channels);
  if (kind === 'flat') {
    pixels.fill(seed & 255);
    return pixels;
  }
  const noise = lcg(seed);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      for (let k = 0; k < channels; k += 1) {
        const block = (Math.floor(x / 9) * 37 + Math.floor(y / 7) * 91 + k * 50) & 255;
        pixels[(y * width + x) * channels + k] = block ^ (noise() & 15);
      }
    }
  }
  return pixels;
}
