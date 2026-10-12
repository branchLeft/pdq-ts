import { describe, expect, it, vi } from 'vitest';
import { HASH_BYTES, pdqFromPixels } from '../src/index.js';

// The core must not load the decoder. Importing the entry point and running
// the core must never reach `sharp`; the counter proves it, since a module
// factory runs only when the module is first loaded.
const loads = vi.hoisted(() => ({ count: 0 }));

vi.mock('sharp', () => {
  loads.count += 1;
  throw new Error('the core loaded sharp');
});

describe('the core without the decoder', () => {
  it('hashes decoded pixels without loading sharp', () => {
    const width = 16;
    const height = 16;
    const pixels = new Uint8Array(width * height * 3);
    for (let i = 0; i < pixels.length; i += 1) pixels[i] = (i * 13) & 255;
    const result = pdqFromPixels(pixels, width, height, 3);
    expect(result).not.toBeNull();
    expect(result?.hash).toHaveLength(HASH_BYTES);
    expect(loads.count).toBe(0);
  });
});
