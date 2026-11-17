// Deterministic pixel buffers for the exactness tests. The same function
// produces the inputs the C++ reference is run on, so the recorded values
// line up.
import type { Channels } from '../../src/index.js';

export type PixelKind = 'blocks' | 'flat' | 'noise' | 'bilevel' | 'gradient';

export interface PixelSpec {
  width: number;
  height: number;
  channels: Channels;
  seed: number;
  kind: PixelKind;
}

export interface PixelCase extends PixelSpec {
  name: string;
  expectedHex: string;
  expectedQuality: number;
}

function lcg(seed: number): () => number {
  let state = seed >>> 0;
  return (): number => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state >>> 24;
  };
}

// The gradient kind: a ramp across, a steeper one per channel down, wrapping
// at 256.
function gradientByte(x: number, y: number, k: number, spec: PixelSpec): number {
  const across = Math.floor((x * 255) / Math.max(1, spec.width - 1));
  const down = Math.floor((y * 255) / Math.max(1, spec.height - 1));
  return (across + (k + 1) * down + spec.seed) & 255;
}

// `blocks` is blocky content plus low-amplitude noise, so the DCT is not
// degenerate; `flat` is one value everywhere; `noise` is uniform bytes;
// `bilevel` is only 0 and 255; `gradient` is a smooth ramp that wraps.
export function syntheticPixels(spec: PixelSpec): Uint8Array {
  const { width, height, channels, seed, kind } = spec;
  const pixels = new Uint8Array(width * height * channels);
  if (kind === 'flat') {
    pixels.fill(seed & 255);
    return pixels;
  }
  const noise = lcg(seed);
  let at = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      for (let k = 0; k < channels; k += 1) {
        let value: number;
        if (kind === 'blocks') {
          const block = (Math.floor(x / 9) * 37 + Math.floor(y / 7) * 91 + k * 50) & 255;
          value = block ^ (noise() & 15);
        } else if (kind === 'noise') {
          value = noise();
        } else if (kind === 'bilevel') {
          value = noise() < 128 ? 0 : 255;
        } else {
          value = gradientByte(x, y, k, spec);
        }
        pixels[at] = value;
        at += 1;
      }
    }
  }
  return pixels;
}
