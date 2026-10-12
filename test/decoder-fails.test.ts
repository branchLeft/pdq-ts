import { describe, expect, it, vi } from 'vitest';
import { pdqHashOfImage } from '../src/index.js';

// A decoder that loaded but then fails is not the same as bytes that are not a
// picture. A consumer that releases `not-an-image` and holds everything else
// must hold these: a broken decoder is "decode-failed", never a verdict on
// the bytes. The decoder is replaced here so each failure can be made to happen.
const mode = vi.hoisted(() => ({ value: 'header-unsupported' }));

vi.mock('sharp', () => {
  const failures: Record<string, Error> = {
    'header-unsupported': new Error('Input buffer contains unsupported image format'),
    'header-corrupt': new Error('Input buffer has corrupt header: VipsJpeg: premature end'),
    'header-broken': new Error('vips: out of memory'),
    'pixels-broken': new Error('VipsJpeg: premature end of JPEG image'),
  };
  const pipeline: Record<string, unknown> = {};
  for (const name of ['removeAlpha', 'toColourspace', 'raw', 'resize']) {
    pipeline[name] = () => pipeline;
  }
  pipeline['metadata'] = () => {
    const failure = failures[mode.value];
    if (failure !== undefined && mode.value.startsWith('header-')) {
      return Promise.reject(failure);
    }
    return Promise.resolve({ format: 'png', width: 100, height: 100, space: 'srgb' });
  };
  pipeline['toBuffer'] = () => {
    const failure = failures[mode.value];
    return Promise.reject(failure ?? new Error('unexpected'));
  };
  return { default: () => pipeline };
});

const BYTES = new Uint8Array([1, 2, 3, 4]);

describe('a decoder that loads and then fails', () => {
  it.each([
    ['says the bytes are an unsupported format', 'header-unsupported', 'not-an-image'],
    ['says the header is corrupt', 'header-corrupt', 'not-an-image'],
    ['fails for a reason that is not about the bytes', 'header-broken', 'decode-failed'],
    ['fails while decoding the pixels', 'pixels-broken', 'decode-failed'],
  ])('%s', async (_name, which, reason) => {
    mode.value = which;
    expect(await pdqHashOfImage(BYTES)).toEqual({ hash: null, quality: null, reason });
  });
});
