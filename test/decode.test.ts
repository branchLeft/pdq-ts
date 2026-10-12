import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import {
  MAX_IMAGE_BYTES,
  REFERENCE_SIDE,
  decoderLoadError,
  pdqFromPixels,
  pdqHashOfImage,
} from '../src/index.js';
import type { DecodeResult, DecodeReason } from '../src/index.js';
import { pictures } from './fixtures/pictures/generate.js';
import manifest from './fixtures/pictures/manifest.json' with { type: 'json' };

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES = path.join(HERE, 'fixtures');
const GENERATED = path.join(FIXTURES, 'pictures');

// The reference's README: a distance of 31 or less is its suggested starting
// point for "the same picture".
const MATCH_DISTANCE = 31;

function distance(a: Uint8Array, b: Uint8Array): number {
  if (a.length !== b.length) {
    throw new RangeError(`distance: lengths ${a.length} and ${b.length} differ`);
  }
  let bits = 0;
  for (let i = 0; i < a.length; i += 1) {
    let x = (a[i] ?? 0) ^ (b[i] ?? 0);
    while (x) {
      bits += x & 1;
      x >>= 1;
    }
  }
  return bits;
}

function picture(file: string): Buffer {
  return fs.readFileSync(path.join(GENERATED, file));
}

function fixture(file: string): Buffer {
  return fs.readFileSync(path.join(FIXTURES, file));
}

function entryFor(file: string) {
  const entry = manifest.pictures.find((e) => e.file === file);
  if (entry === undefined) {
    throw new Error(`manifest has no entry for ${file}`);
  }
  return entry;
}

function hashBytes(result: DecodeResult): Uint8Array {
  if (result.hash === null) {
    throw new Error(`expected a hash, got reason ${result.reason ?? 'none'}`);
  }
  return result.hash;
}

async function hashOf(buffer: Buffer): Promise<Uint8Array> {
  const result = await pdqHashOfImage(buffer);
  expect(result.reason).toBeNull();
  return hashBytes(result);
}

describe('the generated pictures', () => {
  it('are the files the manifest recorded', () => {
    expect(manifest.pictures.length).toBe(17);
    for (const entry of manifest.pictures) {
      const sha = crypto.createHash('sha256').update(picture(entry.file)).digest('hex');
      expect(sha, entry.file).toBe(entry.sha256);
    }
  });

  it('name the reference commit and the generator seed', () => {
    expect(manifest.reference.commit).toBe('bd0108ff1745135a421856586d19d820dd62c6de');
    expect(manifest.generator.seed).toBeGreaterThan(0);
  });

  it('decode, when lossless, to exactly the pixels the generator computes', async () => {
    for (const spec of pictures().filter((s) => s.lossless)) {
      const { data, info } = await sharp(picture(spec.file))
        .removeAlpha()
        .toColourspace(spec.channels === 1 ? 'b-w' : 'srgb')
        .raw({ depth: 'uchar' })
        .toBuffer({ resolveWithObject: true });
      expect([info.width, info.height, info.channels], spec.file).toEqual([
        spec.width,
        spec.height,
        spec.channels,
      ]);
      expect(data.equals(spec.pixels), spec.file).toBe(true);
    }
  });
});

// Every generated picture hashes to exactly the reference's hash: its own
// photo hasher for the JPEG and PNG files (the whole pipeline, including its
// shrink of anything over 512 px), its core over the generator's pixels for
// the GIF and WebP. The decoded pixels are the reference's, and the shrink is
// the reference's own nearest-neighbour index rule, so there is no tolerance.
describe('pdqHashOfImage against the reference, on generated pictures', () => {
  it.each(manifest.pictures)('$file', async (entry) => {
    const result = await pdqHashOfImage(picture(entry.file));
    expect(result.reason).toBeNull();
    const mine = hashBytes(result);
    const reference = Buffer.from(entry.referenceHex, 'hex');
    expect(mine).toHaveLength(32);
    expect(result.quality).toBe(entry.referenceQuality);
    expect(distance(mine, reference)).toBe(0);
  });

  it('covers a shrunk picture of each kind: JPEG, PNG and noisy', () => {
    const shrunk = manifest.pictures.filter(
      (e) => Math.max(e.width, e.height) > REFERENCE_SIDE && e.referenceSource === 'photo-hasher',
    );
    expect(shrunk.map((e) => e.format).sort()).toEqual(['jpg', 'jpg', 'png']);
  });

  it('covers every format, a shrunk picture, a flat one and both sides of both quality marks', () => {
    const formats = new Set(manifest.pictures.map((e) => e.format));
    expect(formats).toEqual(new Set(['png', 'jpg', 'gif', 'webp']));
    expect(manifest.pictures.some((e) => Math.max(e.width, e.height) > REFERENCE_SIDE)).toBe(true);
    const qualities = manifest.pictures.map((e) => e.referenceQuality);
    expect(qualities).toContain(0);
    expect(qualities.some((q) => q === 49)).toBe(true);
    expect(qualities.some((q) => q === 54)).toBe(true);
    expect(qualities.some((q) => q === 77)).toBe(true);
    expect(qualities.some((q) => q === 82)).toBe(true);
  });

  it('a picture the reference gives quality 0 hashes to the reference value', async () => {
    const entry = entryFor('flat-64x64.png');
    expect(entry.referenceQuality).toBe(0);
    expect((await pdqHashOfImage(picture(entry.file))).quality).toBe(0);
  });

  it('the photo hasher and the core agree on every lossless picture of 512 px or less', () => {
    const both = manifest.pictures.filter((e) => e.coreOnGeneratorPixelsHex !== undefined);
    expect(both.length).toBeGreaterThanOrEqual(10);
    for (const e of both) {
      expect(e.coreOnGeneratorPixelsHex, e.file).toBe(e.referenceHex);
    }
  });

  // The reference shrinks with CImg's nearest neighbour: output pixel x reads
  // source column floor(x * width / 512), and the same for rows. Doing exactly
  // that over the full-resolution pixels is what pdqHashOfImage does, so a
  // hash computed here by hand is the same, bit for bit.
  it.each(['bilevel-1600x1000.png', 'scene-a-large-1280x960.jpg', 'texture-800x600.jpg'])(
    'shrinks %s by the reference index rule, over the full-resolution pixels',
    async (file) => {
      const entry = entryFor(file);
      const { data, info } = await sharp(picture(file))
        .removeAlpha()
        .toColourspace(entry.channels === 1 ? 'b-w' : 'srgb')
        .raw({ depth: 'uchar' })
        .toBuffer({ resolveWithObject: true });
      const channels = info.channels === 1 ? 1 : 3;
      const shrunk = Buffer.alloc(REFERENCE_SIDE * REFERENCE_SIDE * channels);
      for (let y = 0; y < REFERENCE_SIDE; y += 1) {
        const sy = Math.floor((y * info.height) / REFERENCE_SIDE);
        for (let x = 0; x < REFERENCE_SIDE; x += 1) {
          const sx = Math.floor((x * info.width) / REFERENCE_SIDE);
          for (let k = 0; k < channels; k += 1) {
            shrunk[(y * REFERENCE_SIDE + x) * channels + k] =
              data[(sy * info.width + sx) * channels + k] ?? 0;
          }
        }
      }
      const byHand = pdqFromPixels(shrunk, REFERENCE_SIDE, REFERENCE_SIDE, channels);
      if (byHand === null) {
        throw new Error('hand shrink gave no hash');
      }
      expect(Buffer.from(byHand.hash).toString('hex')).toBe(entry.referenceHex);
      expect(Buffer.from(await hashOf(picture(file))).toString('hex')).toBe(entry.referenceHex);
    },
  );

  it('returns the 32 raw PDQ bytes', async () => {
    const result = await pdqHashOfImage(picture('scene-a-480x360.jpg'));
    expect(hashBytes(result)).toHaveLength(32);
    expect(result.quality).not.toBeNull();
  });
});

describe('control cases: the same picture, and a different one', () => {
  it('the resized and recompressed copy is a different file within the match distance', async () => {
    const original = picture('scene-a-480x360.jpg');
    const copy = picture('scene-a-small-240x180.jpg');
    expect(Buffer.compare(copy, original)).not.toBe(0);
    expect(distance(await hashOf(original), await hashOf(copy))).toBeLessThanOrEqual(
      MATCH_DISTANCE,
    );
  });

  it('a copy resized and recompressed here is within the match distance of the large original', async () => {
    const original = picture('scene-a-large-1280x960.jpg');
    const copy = await sharp(original).resize(420).jpeg({ quality: 50 }).toBuffer();
    expect(Buffer.compare(copy, original)).not.toBe(0);
    expect(distance(await hashOf(original), await hashOf(copy))).toBeLessThanOrEqual(
      MATCH_DISTANCE,
    );
  });

  it('an unrelated picture is further than the match distance', async () => {
    const original = await hashOf(picture('scene-a-480x360.jpg'));
    for (const other of ['scene-b-256x192.png', 'scene-c-256x192.gif', 'bilevel-1600x1000.png']) {
      expect(distance(original, await hashOf(picture(other))), other).toBeGreaterThan(
        MATCH_DISTANCE,
      );
    }
  });

  it('the two fixture images the adapter tests use are not near each other', async () => {
    const clean = await hashOf(fixture('clean.png'));
    const bad = await hashOf(fixture('bad.png'));
    expect(distance(clean, bad)).toBeGreaterThan(MATCH_DISTANCE);
  });
});

describe('what is hashed', () => {
  async function raw(
    width: number,
    height: number,
    channels: 1 | 3,
    fill: (i: number) => number,
  ): Promise<{
    data: Buffer;
    options: { raw: { width: number; height: number; channels: 1 | 3 } };
  }> {
    const data = Buffer.alloc(width * height * channels);
    for (let i = 0; i < data.length; i += 1) data[i] = fill(i);
    return { data, options: { raw: { width, height, channels } } };
  }

  it('ignores transparency and EXIF orientation: the stored pixels are hashed', async () => {
    const { data, options } = await raw(96, 80, 3, (i) => (i * 7) & 255);
    const plain = await sharp(data, options).jpeg().toBuffer();
    const tagged = await sharp(data, options).jpeg().withMetadata({ orientation: 6 }).toBuffer();
    expect(tagged.equals(plain)).toBe(false);
    expect(hashBytes(await pdqHashOfImage(tagged))).toEqual(hashBytes(await pdqHashOfImage(plain)));

    const rgba = await sharp(data, options).ensureAlpha(0.2).png().toBuffer();
    const rgb = await sharp(data, options).png().toBuffer();
    expect(hashBytes(await pdqHashOfImage(rgba))).toEqual(hashBytes(await pdqHashOfImage(rgb)));
  });

  it('hashes a grey image and its RGB copy to the same hash or within two bits', async () => {
    const grey = await raw(120, 90, 1, (i) => ((i % 120) * 2 + Math.floor(i / 120)) & 255);
    const rgb = Buffer.alloc(120 * 90 * 3);
    for (let i = 0; i < grey.data.length; i += 1) rgb.fill(grey.data[i] ?? 0, i * 3, i * 3 + 3);
    const greyPng = await sharp(grey.data, grey.options).png().toBuffer();
    const rgbPng = await sharp(rgb, { raw: { width: 120, height: 90, channels: 3 } })
      .png()
      .toBuffer();
    expect(distance(await hashOf(greyPng), await hashOf(rgbPng))).toBeLessThanOrEqual(2);
  });

  it('hashes TIFF as well as the formats the generated pictures cover', async () => {
    const source = await sharp(picture('scene-a-256x192.png'))
      .raw()
      .toBuffer({ resolveWithObject: true });
    const options = {
      raw: { width: source.info.width, height: source.info.height, channels: 3 as const },
    };
    const png = await hashOf(await sharp(source.data, options).png().toBuffer());
    const tiff = await hashOf(
      await sharp(source.data, options).tiff({ compression: 'lzw' }).toBuffer(),
    );
    expect(distance(png, tiff)).toBe(0);
  });
});

describe('bytes that are not a hashable image yield no hash', () => {
  const cases: ReadonlyArray<readonly [string, Uint8Array, DecodeReason]> = [
    ['empty bytes', Buffer.alloc(0), 'empty'],
    ['plain text', Buffer.from('hello, this is not a picture'), 'not-an-image'],
    ['random bytes', crypto.randomBytes(4096), 'not-an-image'],
    [
      'an SVG, which is a vector document',
      Buffer.from(
        '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><rect width="40" height="40"/></svg>',
      ),
      'not-an-image',
    ],
    ['a PNG signature and nothing else', Buffer.from('89504e470d0a1a0a', 'hex'), 'not-an-image'],
    [
      'a JPEG cut off after its header',
      picture('scene-a-480x360.jpg').subarray(0, 40),
      'not-an-image',
    ],
  ];
  it.each(cases)('%s', async (_name, bytes, reason) => {
    const result = await pdqHashOfImage(bytes);
    expect(result).toEqual({ hash: null, quality: null, reason });
  });

  it('a picture shorter than the reference minimum has no hash', async () => {
    const tiny = await sharp({
      create: { width: 4, height: 40, channels: 3, background: '#808080' },
    })
      .png()
      .toBuffer();
    expect(await pdqHashOfImage(tiny)).toEqual({
      hash: null,
      quality: null,
      reason: 'too-small',
    });
  });

  it('bytes over the size bound have no hash, and the bound is generous', async () => {
    const png = fixture('clean.png');
    expect(MAX_IMAGE_BYTES).toBeGreaterThan(10 * 1024 * 1024);
    expect(await pdqHashOfImage(png, { maxBytes: png.length - 1 })).toMatchObject({
      hash: null,
      reason: 'too-large',
    });
    expect((await pdqHashOfImage(png, { maxBytes: png.length })).hash).not.toBeNull();
  });

  it('a picture over the pixel bound has no hash, without being decoded', async () => {
    const png = fixture('clean.png');
    expect(await pdqHashOfImage(png, { maxPixels: 64 * 64 - 1 })).toMatchObject({
      hash: null,
      reason: 'too-large',
    });
  });

  it('a huge canvas under both bounds is hashed by shrinking it, not by holding it whole', async () => {
    const wide = await sharp({
      create: { width: 3000, height: 2000, channels: 3, background: '#336699' },
    })
      .png()
      .toBuffer();
    expect((await pdqHashOfImage(wide)).hash).not.toBeNull();
  });
});

describe('with the decoder', () => {
  it('has the decoder in this environment', async () => {
    expect(await decoderLoadError()).toBeNull();
  });
});
