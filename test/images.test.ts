import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { hammingDistance, pdqFromPixels, toHex } from '../src/index.js';
import type { Channels, PdqResult } from '../src/index.js';

// sharp is a devDependency, used here only to decode the generated pictures.
// The package itself takes pixels and decodes nothing.
interface PictureEntry {
  file: string;
  format: string;
  width: number;
  height: number;
  channels: Channels;
  lossless: boolean;
  sha256: string;
  referenceHex: string;
  referenceQuality: number;
}

interface PictureManifest {
  reference: { commit: string };
  pictures: PictureEntry[];
}

function fixture(file: string): string {
  return join(__dirname, 'fixtures', 'pdq-generated', file);
}

const manifest = JSON.parse(readFileSync(fixture('manifest.json'), 'utf8')) as PictureManifest;

// The reference's tolerances, from its README: decoded images at quality 80
// or more are within distance 10 of the reference's own hash; a distance of
// 31 or less is its suggested starting point for "the same picture".
const REFERENCE_TOLERANCE = 10;
const REFERENCE_QUALITY_FLOOR = 80;
const MATCH_DISTANCE = 31;
// The reference shrinks anything with a side over this before hashing; a
// decoder does that, this package does not.
const REFERENCE_SIDE = 512;

async function hashOf(bytes: Uint8Array, channels: Channels = 3): Promise<PdqResult> {
  const { data, info } = await sharp(bytes)
    .removeAlpha()
    .toColourspace(channels === 1 ? 'b-w' : 'srgb')
    .raw({ depth: 'uchar' })
    .toBuffer({ resolveWithObject: true });
  const result = pdqFromPixels(data, info.width, info.height, info.channels as Channels);
  expect(result).not.toBeNull();
  return result!;
}

function picture(file: string): Uint8Array {
  return readFileSync(fixture(file));
}

describe('the generated pictures', () => {
  it('are the files the manifest recorded', () => {
    expect(manifest.pictures).toHaveLength(16);
    for (const entry of manifest.pictures) {
      const sha = createHash('sha256').update(picture(entry.file)).digest('hex');
      expect(sha, entry.file).toBe(entry.sha256);
    }
  });

  it('name the reference commit', () => {
    expect(manifest.reference.commit).toBe('bd0108ff1745135a421856586d19d820dd62c6de');
  });
});

// Lossless pictures of 512 px or less decode to exactly the pixels the
// reference was given, so the hash must be identical. The others (lossy, or
// over 512 px where the reference shrinks first) get the reference's own
// tolerance when its quality is high enough for that to be meaningful.
describe('decoded generated pictures against the reference', () => {
  const exact = manifest.pictures.filter(
    (e) => e.lossless && Math.max(e.width, e.height) <= REFERENCE_SIDE,
  );
  const approximate = manifest.pictures.filter(
    (e) => !e.lossless && Math.max(e.width, e.height) <= REFERENCE_SIDE,
  );

  it('has exact cases of both quality marks and approximate ones', () => {
    expect(exact.length).toBeGreaterThanOrEqual(10);
    expect(approximate.length).toBeGreaterThanOrEqual(2);
    const qualities = exact.map((e) => e.referenceQuality);
    expect(qualities.some((q) => q < 49)).toBe(true);
    expect(qualities.some((q) => q >= REFERENCE_QUALITY_FLOOR)).toBe(true);
  });

  it.each(exact.map((e) => [e.file, e] as const))('%s is identical', async (_file, entry) => {
    const result = await hashOf(picture(entry.file), entry.channels);
    expect(toHex(result.hash)).toBe(entry.referenceHex);
    expect(result.quality).toBe(entry.referenceQuality);
  });

  it.each(approximate.map((e) => [e.file, e] as const))(
    '%s is within the reference tolerance',
    async (_file, entry) => {
      expect(entry.referenceQuality).toBeGreaterThanOrEqual(REFERENCE_QUALITY_FLOOR);
      const result = await hashOf(picture(entry.file), entry.channels);
      const reference = Uint8Array.from(Buffer.from(entry.referenceHex, 'hex'));
      expect(hammingDistance(result.hash, reference)).toBeLessThanOrEqual(REFERENCE_TOLERANCE);
    },
  );
});

describe('control cases: the same picture, and a different one', () => {
  it('a resized, recompressed copy is a different file within the match distance', async () => {
    const original = picture('scene-a-480x360.jpg');
    const copy = picture('scene-a-small-240x180.jpg');
    expect(Buffer.from(copy).equals(Buffer.from(original))).toBe(false);
    const distance = hammingDistance((await hashOf(original)).hash, (await hashOf(copy)).hash);
    expect(distance).toBeLessThanOrEqual(MATCH_DISTANCE);
  });

  it('a copy resized and re-encoded here is within the match distance of the large original', async () => {
    const original = picture('scene-a-large-1280x960.jpg');
    const copy = await sharp(original).resize(420).jpeg({ quality: 50 }).toBuffer();
    const distance = hammingDistance((await hashOf(original)).hash, (await hashOf(copy)).hash);
    expect(distance).toBeLessThanOrEqual(MATCH_DISTANCE);
  });

  it('the same picture as PNG and as a lossless re-encode is at distance 0', async () => {
    const png = picture('scene-a-256x192.png');
    const webp = await sharp(png).webp({ lossless: true }).toBuffer();
    expect(hammingDistance((await hashOf(png)).hash, (await hashOf(webp)).hash)).toBe(0);
  });

  it('an unrelated picture is further than the match distance', async () => {
    const original = (await hashOf(picture('scene-a-480x360.jpg'))).hash;
    for (const other of ['scene-b-256x192.png', 'scene-c-256x192.gif']) {
      const distance = hammingDistance(original, (await hashOf(picture(other))).hash);
      expect(distance, other).toBeGreaterThan(MATCH_DISTANCE);
    }
  });
});
