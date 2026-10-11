import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import { decoderLoadError, pdqHashOfImage } from '../src/index.js';

// A Ghost-style image without the decoder: `sharp` cannot be resolved. The
// dynamic import inside the decoder stage rejects, and the stage must hold
// every image rather than throw.
vi.mock('sharp', () => ({
  get default(): never {
    throw new Error("Cannot find module 'sharp'");
  },
}));

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PNG = fs.readFileSync(path.join(HERE, 'fixtures', 'clean.png'));

describe('an image stage without the decoder', () => {
  it('loads and yields no hash, so every upload is held', async () => {
    expect(await pdqHashOfImage(PNG)).toEqual({
      hash: null,
      quality: null,
      reason: 'decoder-unavailable',
    });
    const failure = await decoderLoadError();
    expect(failure).toBeInstanceOf(Error);
    expect(failure?.message).toMatch(/sharp/);
  });
});
