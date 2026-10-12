// Generates every PDQ test picture from the formulas below and a fixed seed, so
// none is a photograph. `node generate.ts` writes them; `--verify` checks the
// committed lossless files decode to the generated pixels. Expected hashes come
// from `record-reference.mjs` (see README.txt), not from this script.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import zlib from 'node:zlib';
import sharp, { type Sharp } from 'sharp';

const HERE = path.dirname(fileURLToPath(import.meta.url));

// One seed for the whole set; each picture derives its own from it.
export const SEED = 20261011;

export interface PictureSpec {
  file: string;
  width: number;
  height: number;
  channels: 1 | 3;
  pixels: Buffer;
  encode: (img: Sharp) => Sharp;
  // Applied to the encoded bytes: used to add a colour profile tag without
  // touching a pixel (an encoder that attaches a profile converts to it).
  post?: (encoded: Buffer) => Promise<Buffer>;
  lossless: boolean;
  note?: string;
  sourceWidth?: number;
  sourceHeight?: number;
}

type Rgb = readonly [number, number, number];

// Reads an array element that the loops below keep in range. An index outside
// the array is a bug in this file and is reported, not defaulted.
function at(values: ArrayLike<number>, index: number): number {
  const value = values[index];
  if (value === undefined) {
    throw new RangeError(`generate: index ${index} out of range`);
  }
  return value;
}

function lcg(seed: number): () => number {
  let state = (SEED ^ seed) >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state >>> 24;
  };
}

function clamp(v: number): number {
  return v < 0 ? 0 : v > 255 ? 255 : Math.round(v);
}

function rgb(
  width: number,
  height: number,
  fn: (u: number, v: number, x: number, y: number) => Rgb,
): Buffer {
  const px = Buffer.alloc(width * height * 3);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const [r, g, b] = fn(x / width, y / height, x, y);
      const o = (y * width + x) * 3;
      px[o] = clamp(r);
      px[o + 1] = clamp(g);
      px[o + 2] = clamp(b);
    }
  }
  return px;
}

// Smooth colour gradients, a disc, a rectangle and a diagonal band, with a
// little seeded noise so JPEG and PNG have something to do.
export function sceneGradientShapes(width: number, height: number, noiseAmplitude = 4): Buffer {
  const noise = lcg(1);
  return rgb(width, height, (u, v) => {
    let r = 40 + 170 * u;
    let g = 60 + 120 * v;
    let b = 210 - 110 * (u + v) * 0.5;
    const du = u - 0.3;
    const dv = (v - 0.4) * (height / width);
    if (du * du + dv * dv < 0.04) {
      r += 60;
      g += 50;
      b -= 40;
    }
    if (u > 0.6 && u < 0.85 && v > 0.55 && v < 0.8) {
      r *= 0.45;
      g *= 0.45;
      b *= 0.6;
    }
    if (Math.abs(u - v * 0.8 - 0.1) < 0.03) {
      r = 235;
      g = 235;
      b = 235;
    }
    const n = (noise() % (2 * noiseAmplitude + 1)) - noiseAmplitude;
    return [r + n, g + n, b + n];
  });
}

// Concentric rings and stripes: a different picture, with unrelated structure.
export function sceneRingsStripes(width: number, height: number): Buffer {
  return rgb(width, height, (u, v) => {
    const du = u - 0.62;
    const dv = (v - 0.35) * (height / width);
    const ring = Math.sin(Math.sqrt(du * du + dv * dv) * 70);
    const stripe = Math.sin((u * 9 - v * 5) * Math.PI);
    return [128 + 100 * ring, 120 + 90 * stripe, 140 - 80 * ring * stripe];
  });
}

const PALETTE: ReadonlyArray<Rgb> = [
  [240, 240, 240],
  [20, 30, 90],
  [200, 40, 40],
  [40, 160, 80],
  [240, 190, 30],
  [120, 60, 160],
  [30, 30, 30],
  [90, 190, 220],
];

// Flat colours from an eight-colour palette: exact in a GIF and in lossless
// WebP, so the reference core can be given the very same pixels.
export function sceneFlatShapes(width: number, height: number): Buffer {
  return rgb(width, height, (u, v) => {
    let c = 0;
    if (u > 0.1 && u < 0.45 && v > 0.15 && v < 0.6) c = 1;
    if ((u - 0.7) ** 2 + ((v - 0.35) * (height / width)) ** 2 < 0.03) c = 2;
    if (v > 0.65 && u + v * 0.5 > 0.9 && u < 0.8) c = 3;
    if (u > 0.05 && u < 0.35 && v > 0.7 && v < 0.9) c = 4;
    if (Math.abs(u - 0.5) < 0.02 && v < 0.5) c = 5;
    if (u > 0.82 && v > 0.62 && v - 0.62 < (u - 0.82) * 2) c = 6;
    if (v < 0.08) c = 7;
    const colour = PALETTE[c];
    if (colour === undefined) {
      throw new RangeError(`generate: palette index ${c} out of range`);
    }
    return colour;
  });
}

// One channel, only 0 and 255: a Floyd-Steinberg error-diffusion dither of a
// radial gradient with a bar pattern. Large enough to be shrunk before
// hashing: a two-level picture is the hardest case for a shrink that is not
// the reference's own.
export function sceneBilevel(width: number, height: number): Buffer {
  const level = new Float32Array(width * height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const u = x / width;
      const v = y / height;
      const du = u - 0.5;
      // Mostly large black and white areas, with ramps where the dither shows.
      let l = u * 0.9 + 0.05;
      if ((u - 0.25) ** 2 + ((v - 0.3) * (height / width)) ** 2 < 0.02) l = 1;
      if ((u - 0.7) ** 2 + ((v - 0.35) * (height / width)) ** 2 < 0.03) l = 0;
      if (v > 0.65 && v < 0.9) l = 0.5;
      if (v >= 0.9) l = 0;
      if (du > 0.2 && v > 0.6 && v <= 0.65) l = 1;
      level[y * width + x] = l * 255;
    }
  }
  const px = Buffer.alloc(width * height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = y * width + x;
      const old = at(level, i);
      const out = old >= 128 ? 255 : 0;
      px[i] = out;
      const err = old - out;
      if (x + 1 < width) level[i + 1] = at(level, i + 1) + (err * 7) / 16;
      if (y + 1 < height) {
        if (x > 0) level[i + width - 1] = at(level, i + width - 1) + (err * 3) / 16;
        level[i + width] = at(level, i + width) + (err * 5) / 16;
        if (x + 1 < width) level[i + width + 1] = at(level, i + width + 1) + err / 16;
      }
    }
  }
  return px;
}

export function sceneFlat(width: number, height: number, colour: Rgb): Buffer {
  return rgb(width, height, () => colour);
}

// A horizontal ramp with a vertical sinusoid of the given amplitude: the
// hash's quality metric counts gradients, so amplitude moves it from 0 to 100.
export function sceneContrast(width: number, height: number, amplitude: number): Buffer {
  return rgb(width, height, (u, v) => {
    const wave = Math.sin(v * Math.PI * 14) * amplitude;
    const ramp = (u - 0.5) * amplitude;
    return [128 + wave + ramp, 128 + wave - ramp, 128 - wave];
  });
}

// What the adapter's own tests upload: two unrelated 64 x 64 pictures.
export function sceneAdapterClean(): Buffer {
  return rgb(64, 64, (_u, _v, x, y) => [(x * 4) & 255, (y * 4) & 255, ((x + y) * 2) & 255]);
}

export function sceneAdapterBad(): Buffer {
  return rgb(64, 64, (_u, _v, x, y) => {
    const c = (Math.floor(x / 8) + Math.floor(y / 8)) % 2;
    return c ? [230, 40, 40] : [20, 20, 120 + (x ^ y)];
  });
}

// A Display-P3 ICC profile, read back from a one-pixel picture that libvips
// has tagged with its built-in profile.
export async function displayP3Profile(): Promise<Buffer> {
  const tagged = await sharp({
    create: { width: 1, height: 1, channels: 3, background: '#808080' },
  })
    .withIccProfile('p3')
    .png()
    .toBuffer();
  const { icc } = await sharp(tagged).metadata();
  if (icc === undefined) {
    throw new Error('generate: libvips gave no Display-P3 profile');
  }
  return icc;
}

function pngChunk(type: string, data: Buffer): Buffer {
  const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const head = Buffer.alloc(4);
  head.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(zlib.crc32(body));
  return Buffer.concat([head, body, crc]);
}

// Adds an iCCP chunk straight after IHDR (8-byte signature, then the 25-byte
// IHDR chunk), leaving every other byte, the pixels included, as encoded.
export function tagPng(png: Buffer, profile: Buffer): Buffer {
  const data = Buffer.concat([
    Buffer.from('Display P3', 'latin1'),
    Buffer.from([0, 0]),
    zlib.deflateSync(profile),
  ]);
  return Buffer.concat([png.subarray(0, 33), pngChunk('iCCP', data), png.subarray(33)]);
}

// Adds an APP2 ICC_PROFILE segment straight after SOI and any JFIF APP0.
export function tagJpeg(jpeg: Buffer, profile: Buffer): Buffer {
  let at0 = 2;
  if (jpeg[2] === 0xff && jpeg[3] === 0xe0) {
    at0 = 2 + 2 + jpeg.readUInt16BE(4);
  }
  const payload = Buffer.concat([
    Buffer.from('ICC_PROFILE\0', 'latin1'),
    Buffer.from([1, 1]),
    profile,
  ]);
  const head = Buffer.from([0xff, 0xe2, 0, 0]);
  head.writeUInt16BE(payload.length + 2, 2);
  return Buffer.concat([jpeg.subarray(0, at0), head, payload, jpeg.subarray(at0)]);
}

// The contrast levels. The reference reports quality 0, 24, 49, 54, 77, 82
// and 100 for them: either side of its 49 (discard) and 80 (tolerance) marks.
export const CONTRAST_AMPLITUDES: ReadonlyArray<number> = [4, 8, 12, 13, 17, 18, 22];

// Every picture: file name, how to encode it, and how to get its pixels.
// `lossless` pictures decode to exactly `pixels`, so the reference core can be
// run over the same array; the others are given to its photo hasher as files.
export function pictures(): PictureSpec[] {
  const list: PictureSpec[] = [];
  const add = (spec: PictureSpec): void => {
    list.push(spec);
  };

  const photoLike = sceneGradientShapes(480, 360);
  const photoLikePng = sceneGradientShapes(256, 192);
  add({
    file: 'scene-a-256x192.png',
    width: 256,
    height: 192,
    channels: 3,
    pixels: photoLikePng,
    encode: (img) => img.png({ compressionLevel: 9 }),
    lossless: true,
    note: 'gradients, disc, rectangle, band and seeded noise',
  });
  add({
    file: 'scene-a-480x360.jpg',
    width: 480,
    height: 360,
    channels: 3,
    pixels: photoLike,
    encode: (img) => img.jpeg({ quality: 90, mozjpeg: false }),
    lossless: false,
    note: 'the same picture as a JPEG at quality 90',
  });
  add({
    file: 'scene-a-small-240x180.jpg',
    width: 240,
    height: 180,
    channels: 3,
    pixels: photoLike,
    sourceWidth: 480,
    sourceHeight: 360,
    encode: (img) => img.resize(240, 180, { kernel: 'lanczos3' }).jpeg({ quality: 50 }),
    lossless: false,
    note: 'a resized and recompressed copy of scene-a (half size, JPEG quality 50)',
  });
  const large = sceneGradientShapes(1280, 960);
  add({
    file: 'scene-a-large-1280x960.jpg',
    width: 1280,
    height: 960,
    channels: 3,
    pixels: large,
    encode: (img) => img.jpeg({ quality: 85, mozjpeg: false }),
    lossless: false,
    note: 'over 512 pixels, so it is shrunk before hashing',
  });
  add({
    file: 'texture-800x600.jpg',
    width: 800,
    height: 600,
    channels: 3,
    pixels: sceneGradientShapes(800, 600, 60),
    encode: (img) => img.jpeg({ quality: 50, mozjpeg: false }),
    lossless: false,
    note: 'over 512 pixels, strong seeded noise: the shrinking rule moves its hash by many bits',
  });
  // The same stored pixels, tagged as Display-P3. The reference's decoder
  // reads no profile, so its hash is of the stored pixels whatever the tag;
  // decoding through the profile moves the hash by more than the reference's
  // own 10-bit bound (decode.test.ts asserts that it does).
  const tagged = sceneRingsStripes(160, 120);
  add({
    file: 'p3-tagged-160x120.png',
    width: 160,
    height: 120,
    channels: 3,
    pixels: tagged,
    encode: (img) => img.png({ compressionLevel: 9 }),
    post: async (encoded) => tagPng(encoded, await displayP3Profile()),
    lossless: true,
    note: 'stored pixels tagged with a Display-P3 profile: hashed as stored',
  });
  add({
    file: 'p3-tagged-160x120.jpg',
    width: 160,
    height: 120,
    channels: 3,
    pixels: tagged,
    encode: (img) => img.jpeg({ quality: 90, mozjpeg: false }),
    post: async (encoded) => tagJpeg(encoded, await displayP3Profile()),
    lossless: false,
    note: 'the same stored pixels as a JPEG tagged with a Display-P3 profile',
  });
  add({
    file: 'scene-b-256x192.png',
    width: 256,
    height: 192,
    channels: 3,
    pixels: sceneRingsStripes(256, 192),
    encode: (img) => img.png({ compressionLevel: 9 }),
    lossless: true,
    note: 'unrelated to scene-a',
  });
  const flatShapes = sceneFlatShapes(256, 192);
  add({
    file: 'scene-c-256x192.gif',
    width: 256,
    height: 192,
    channels: 3,
    pixels: flatShapes,
    encode: (img) => img.gif({ colours: 256, dither: 0 }),
    lossless: true,
    note: 'eight flat colours, as a GIF',
  });
  add({
    file: 'scene-c-256x192.webp',
    width: 256,
    height: 192,
    channels: 3,
    pixels: flatShapes,
    encode: (img) => img.webp({ lossless: true }),
    lossless: true,
    note: 'the same eight-colour picture as lossless WebP',
  });
  add({
    file: 'bilevel-1600x1000.png',
    width: 1600,
    height: 1000,
    channels: 1,
    pixels: sceneBilevel(1600, 1000),
    encode: (img) => img.png({ palette: true, colours: 2, compressionLevel: 9 }),
    lossless: true,
    note: 'one bit per pixel; shrunk before hashing',
  });
  add({
    file: 'flat-64x64.png',
    width: 64,
    height: 64,
    channels: 3,
    pixels: sceneFlat(64, 64, [180, 90, 40]),
    encode: (img) => img.png({ compressionLevel: 9 }),
    lossless: true,
    note: 'a single colour: quality 0',
  });
  for (const amplitude of CONTRAST_AMPLITUDES) {
    add({
      file: `contrast-${String(amplitude).padStart(2, '0')}-128x128.png`,
      width: 128,
      height: 128,
      channels: 3,
      pixels: sceneContrast(128, 128, amplitude),
      encode: (img) => img.png({ compressionLevel: 9 }),
      lossless: true,
      note: `contrast amplitude ${amplitude}`,
    });
  }
  return list;
}

export function adapterPictures(): PictureSpec[] {
  const make = (file: string, pixels: Buffer): PictureSpec => ({
    file,
    width: 64,
    height: 64,
    channels: 3,
    pixels,
    encode: (img) => img.png({ compressionLevel: 9 }),
    lossless: true,
  });
  return [make('clean.png', sceneAdapterClean()), make('bad.png', sceneAdapterBad())];
}

export async function encodeFile(spec: PictureSpec): Promise<Buffer> {
  const width = spec.sourceWidth ?? spec.width;
  const height = spec.sourceHeight ?? spec.height;
  const raw = { raw: { width, height, channels: spec.channels } };
  const base = sharp(spec.pixels, raw);
  const encoded = await spec
    .encode(spec.channels === 1 ? base.toColourspace('b-w') : base)
    .toBuffer();
  return spec.post === undefined ? encoded : spec.post(encoded);
}

async function main(): Promise<void> {
  const verify = process.argv.includes('--verify');
  const outputs: Array<{ spec: PictureSpec; dir: string }> = [
    ...pictures().map((spec) => ({ spec, dir: HERE })),
    ...adapterPictures().map((spec) => ({ spec, dir: path.join(HERE, '..') })),
  ];
  let bad = 0;
  for (const { spec, dir } of outputs) {
    const target = path.join(dir, spec.file);
    if (verify) {
      if (!spec.lossless) continue;
      const { data, info } = await sharp(fs.readFileSync(target), { ignoreIcc: true })
        .removeAlpha()
        .toColourspace(spec.channels === 1 ? 'b-w' : 'srgb')
        .raw({ depth: 'uchar' })
        .toBuffer({ resolveWithObject: true });
      const same =
        info.width === spec.width &&
        info.height === spec.height &&
        info.channels === spec.channels &&
        data.equals(spec.pixels);
      if (!same) bad += 1;
      console.log(same ? 'same ' : 'DIFF ', spec.file);
    } else {
      fs.writeFileSync(target, await encodeFile(spec));
      console.log('wrote', path.relative(HERE, target));
    }
  }
  if (bad) process.exitCode = 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
