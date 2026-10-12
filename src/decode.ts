// The optional image-decoder stage: bytes in, PDQ hash out. Ported from the
// decoder stage of the adapter this package was split from.
// The core (pdq-hash.ts) takes decoded pixels and never loads a decoder; this
// file is the only place that does, and it loads it on first use.

import { at, MIN_HASHABLE_DIM, pdqFromPixels } from './pdq-hash.js';
import type sharpType from 'sharp';
import type { SharpOptions } from 'sharp';

// Bounds on what is decoded. Nothing here is a verdict: bytes over a bound
// get no hash and are therefore never allowed on that basis.
export const MAX_IMAGE_BYTES = 64 * 1024 * 1024;
// The shrink to REFERENCE_SIDE reads the full-resolution pixels, so this is a
// memory bound: the decoded picture is held at 1 or 3 bytes per pixel, which
// is at most 192 MB at this value.
export const MAX_IMAGE_PIXELS = 64_000_000;
// The reference shrinks anything with a side over this to a square of this
// size before hashing, ignoring the aspect ratio. It uses CImg's nearest
// neighbour, which reads source column floor(x * width / REFERENCE_SIDE) for
// output column x, and the same for rows. So does this package, over the
// full-resolution decoded pixels. libvips' own nearest kernel maps pixel
// centres instead and is not the same, and a smooth filter is further away
// still (test/fixtures/pictures records the reference's hash of each picture).
export const REFERENCE_SIDE = 512;

// Raster formats the hash is defined for. Vector and document formats are
// not pictures a perceptual hash of pixels can stand for.
const RASTER_FORMATS: ReadonlySet<string> = new Set(['jpeg', 'png', 'webp', 'gif', 'tiff', 'heif']);

export type DecodeReason =
  | 'empty'
  | 'too-large'
  | 'not-an-image'
  | 'too-small'
  | 'decoder-unavailable';

// `hash` is the 32 PDQ bytes, or null with a `reason` when these bytes have no
// hash. `quality` is the reference's quality for a hash, and null when there
// is no hash: a flat picture has a hash with quality 0, which is not the same.
export interface DecodeResult {
  hash: Uint8Array | null;
  quality: number | null;
  reason: DecodeReason | null;
}

type SharpFactory = typeof sharpType;

// Loaded on first use, never at import time: a module that threw while its
// host loaded it would stop the host starting. A missing decoder instead
// yields no hash for every image, which holds them all, and says so.
let decoder: SharpFactory | null = null;
let decoderFailure: Error | null = null;

async function loadDecoder(): Promise<SharpFactory | null> {
  if (decoder !== null) {
    return decoder;
  }
  if (decoderFailure !== null) {
    return null;
  }
  try {
    const loaded = await import('sharp');
    decoder = loaded.default;
  } catch (err) {
    decoderFailure = err instanceof Error ? err : new Error(String(err));
  }
  return decoder;
}

// The error that stopped the decoder loading, or null when it is available.
export async function decoderLoadError(): Promise<Error | null> {
  await loadDecoder();
  return decoderFailure;
}

// The reference's shrink (CImg resize, nearest neighbour, to REFERENCE_SIDE
// square): output column x reads source column floor(x * width / SIDE), and
// the same for rows. Also used to enlarge a side shorter than SIDE when the
// other is over it, as the reference does. The products stay far below 2^53,
// and dividing by SIDE (a power of two) is exact, so the floor is exact.
function nearestToSquare(
  data: Uint8Array,
  width: number,
  height: number,
  channels: 1 | 3,
): Uint8Array {
  const columns = new Uint32Array(REFERENCE_SIDE);
  for (let x = 0; x < REFERENCE_SIDE; x += 1) {
    columns[x] = Math.floor((x * width) / REFERENCE_SIDE);
  }
  const out = new Uint8Array(REFERENCE_SIDE * REFERENCE_SIDE * channels);
  let o = 0;
  for (let y = 0; y < REFERENCE_SIDE; y += 1) {
    const row = Math.floor((y * height) / REFERENCE_SIDE) * width;
    for (let x = 0; x < REFERENCE_SIDE; x += 1) {
      const from = (row + at(columns, x)) * channels;
      for (let k = 0; k < channels; k += 1) {
        out[o] = at(data, from + k);
        o += 1;
      }
    }
  }
  return out;
}

function none(reason: DecodeReason): DecodeResult {
  return { hash: null, quality: null, reason };
}

// Never rejects.
export async function pdqHashOfImage(
  image: Uint8Array,
  options?: { maxBytes?: number; maxPixels?: number },
): Promise<DecodeResult> {
  const maxBytes = options?.maxBytes ?? MAX_IMAGE_BYTES;
  const maxPixels = options?.maxPixels ?? MAX_IMAGE_PIXELS;
  if (image.byteLength === 0) {
    return none('empty');
  }
  if (image.byteLength > maxBytes) {
    return none('too-large');
  }
  const sharp = await loadDecoder();
  if (sharp === null) {
    return none('decoder-unavailable');
  }

  const inputOptions: SharpOptions = {
    limitInputPixels: maxPixels,
    failOn: 'error',
    sequentialRead: true,
  };
  try {
    // Header only, so the pixel bound is applied here by hand and a picture
    // over it is told apart from bytes that are not a picture.
    const meta = await sharp(image, { ...inputOptions, limitInputPixels: false }).metadata();
    if (!RASTER_FORMATS.has(meta.format ?? '')) {
      return none('not-an-image');
    }
    const { width, height } = meta;
    if (!width || !height) {
      return none('not-an-image');
    }
    if (width * height > maxPixels) {
      return none('too-large');
    }
    if (width < MIN_HASHABLE_DIM || height < MIN_HASHABLE_DIM) {
      return none('too-small');
    }

    // No orientation is applied and transparency is dropped (a pixel's
    // colour is hashed without its alpha). The picture is decoded at full
    // resolution and shrunk below by the reference's own index rule.
    const grey = meta.space === 'b-w' || meta.space === 'grey16';
    const { data, info } = await sharp(image, inputOptions)
      .removeAlpha()
      .toColourspace(grey ? 'b-w' : 'srgb')
      .raw({ depth: 'uchar' })
      .toBuffer({ resolveWithObject: true });
    if (info.channels !== 1 && info.channels !== 3) {
      return none('not-an-image');
    }

    const shrink = info.width > REFERENCE_SIDE || info.height > REFERENCE_SIDE;
    const result = shrink
      ? pdqFromPixels(
          nearestToSquare(data, info.width, info.height, info.channels),
          REFERENCE_SIDE,
          REFERENCE_SIDE,
          info.channels,
        )
      : pdqFromPixels(data, info.width, info.height, info.channels);
    if (result === null) {
      return none('too-small');
    }
    return { hash: result.hash, quality: result.quality, reason: null };
  } catch {
    return none('not-an-image');
  }
}
