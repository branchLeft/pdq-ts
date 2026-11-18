import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { pdqStagesFromPixels } from '../../src/pdq.js';
import { toHex } from '../../src/index.js';
import type { Channels } from '../../src/index.js';
import { driverBuilds, referenceBinDir } from './driver.js';
import { firstBitDifference, referenceStages } from './protocol.js';

// The reference's own test pictures are read from the upstream checkout at
// run time. They are not copied into this repository: they carry no licence
// statement of their own.
function referenceSource(): string {
  const dir = process.env['PDQ_REFERENCE_SOURCE'];
  if (dir === undefined || dir === '') {
    throw new Error('PDQ_REFERENCE_SOURCE must name the upstream checkout, with pdq/data present');
  }
  return resolve(dir);
}

const DATA = join(referenceSource(), 'pdq', 'data');
const FOLDERS = [
  'reg-test-input/dih',
  'reg-test-input/labelme-subset',
  'reg-test-input/exif-rotn',
  'reg-test-input',
  'bridge-mods',
  'misc-images',
] as const;

const files = FOLDERS.flatMap((folder) =>
  readdirSync(join(DATA, folder))
    .filter((name) => /\.(jpg|png)$/.test(name))
    .sort()
    .map((name) => `${folder}/${name}`),
);

interface Picture {
  file: string;
  width: number;
  height: number;
  channels: Channels;
  toolHex: string;
  toolQuality: number;
  pixels: Uint8Array;
}

// The two upstream files the reference tool cannot hash: both have four
// channels, and the tool exits on anything but one or three.
const SKIPPED = ['reg-test-input/pen-and-coaster.png', 'misc-images/c.png'];
const skipped: string[] = [];

function loadPictures(): Picture[] {
  const driver = join(referenceBinDir(), 'reference-pictures');
  const run = spawnSync(driver, files, { cwd: DATA, maxBuffer: 512 * 1024 * 1024 });
  if (run.status !== 0) {
    throw new Error(`reference-pictures exited ${String(run.status)}: ${run.stderr.toString()}`);
  }
  const out = run.stdout;
  const pictures: Picture[] = [];
  let at = 0;
  for (const file of files) {
    const end = out.indexOf(0x0a, at);
    const header = out.toString('latin1', at, end).split(' ');
    at = end + 1;
    if (header[0] === 'SKIP') {
      skipped.push(file);
      continue;
    }
    const [width, height, channels, toolQuality] = [0, 1, 2, 4].map((i) => Number(header[i]));
    if (channels !== 1 && channels !== 3) {
      throw new Error(`${file}: unexpected header ${header.join(' ')}`);
    }
    const bytes = width! * height! * channels;
    pictures.push({
      file,
      width: width!,
      height: height!,
      channels,
      toolHex: header[3]!,
      toolQuality: toolQuality!,
      pixels: out.subarray(at, at + bytes),
    });
    at += bytes;
  }
  if (at !== out.length) {
    throw new Error('reference-pictures wrote more than its records account for');
  }
  return pictures;
}

// "hash,quality,path" lines of the reference's committed regression output.
function publishedHashes(): Map<string, string> {
  const text = readFileSync(
    join(referenceSource(), 'pdq', 'cpp', 'reg_test', 'expected', 'out'),
    'utf8',
  );
  const published = new Map<string, string>();
  for (const match of text.matchAll(/^([0-9a-f]{64}),\d+,\S*\/data\/(\S+\.(?:jpg|png))$/gm)) {
    // A file's first line is its plain hash; a later section lists the same
    // file again with its eight dihedral hashes, which are not ported.
    if (!published.has(match[2]!)) {
      published.set(match[2]!, match[1]!);
    }
  }
  return published;
}

describe("the reference's own test pictures", () => {
  const pictures = loadPictures();
  const stagesDrivers = driverBuilds('reference-stages');

  it('are present and loaded by the reference tool', () => {
    expect(existsSync(DATA)).toBe(true);
    expect(files).toHaveLength(35);
    expect(skipped).toEqual(SKIPPED);
    expect(pictures).toHaveLength(33);
  });

  it.each(pictures.map((p) => [p.file, p] as const))(
    '%s: the port equals the reference tool and every stage of the reference core',
    (_file, p) => {
      const port = pdqStagesFromPixels(p.pixels, p.width, p.height, p.channels);
      expect(port).not.toBeNull();
      // The whole reference tool (its decode, its shrink, its hashing) on the
      // file, against the port on the pixels that tool hashed.
      expect(toHex(port!.hash)).toBe(p.toolHex);
      expect(port!.quality).toBe(p.toolQuality);
      for (const driver of stagesDrivers) {
        const [core] = referenceStages(driver, [p]);
        expect(core!.hex, basename(driver)).toBe(p.toolHex);
        expect(firstBitDifference(port!.downsample, core!.downsample), basename(driver)).toBe(-1);
        expect(firstBitDifference(port!.halfDct, core!.halfDct), basename(driver)).toBe(-1);
        expect(firstBitDifference(port!.dct, core!.dct), basename(driver)).toBe(-1);
      }
    },
  );

  it('the reference tool, as built here, reproduces the hashes upstream published', () => {
    const published = publishedHashes();
    expect(published.size).toBe(8);
    const compared = pictures.filter((p) => published.has(p.file));
    expect(compared.length).toBe(published.size);
    for (const p of compared) {
      expect(p.toolHex, p.file).toBe(published.get(p.file));
    }
  });
});
