// Records the reference's dihedral hashes and float DCT output for the pixel
// cases, by running the driver built from test/fixtures (see its README).
// Usage: node test/helpers/record-dihedral-cases.mjs <path-to-driver-binary>
// Writes nothing unless the control check against pixel-cases.json passes.
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), '..', 'fixtures');
const DRIVER = process.argv[2];
if (!DRIVER) {
  console.error('usage: record-dihedral-cases.mjs <path-to-driver-binary>');
  process.exit(2);
}

// Reference order of the eight dihedral outputs, as the function's parameters
// are declared in pdqhashing.h (pdqDihedralHash256esFromFloatLuma).
const DIHEDRAL_ORDER = [
  'Original',
  'Rotate90',
  'Rotate180',
  'Rotate270',
  'FlipX',
  'FlipY',
  'FlipPlus1',
  'FlipMinus1',
];

function lcg(seed) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state >>> 24;
  };
}

// Mirrors syntheticPixels() in pdq-pixels.ts line for line; the control check
// at the end proves the mirror.
function syntheticPixels({ width, height, channels, seed, kind }) {
  const pixels = Buffer.alloc(width * height * channels);
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

const manifest = JSON.parse(readFileSync(join(FIXTURES, 'pixel-cases.json'), 'utf8'));
const cases = manifest.pixelCases;

const input = Buffer.concat(
  cases.flatMap((c) => [Buffer.from(`${c.width} ${c.height} ${c.channels}\n`), syntheticPixels(c)]),
);
const run = spawnSync(DRIVER, [], { input, maxBuffer: 64 * 1024 * 1024 });
if (run.status !== 0) {
  console.error(`driver exited ${run.status}: ${run.stderr?.toString() ?? ''}`);
  process.exit(1);
}
const lines = run.stdout.toString().trimEnd().split('\n');
if (lines.length !== cases.length) {
  console.error(`driver gave ${lines.length} lines for ${cases.length} cases`);
  process.exit(1);
}

const records = cases.map((c, i) => {
  const tokens = lines[i].trim().split(' ');
  const quality = Number(tokens[0]);
  const hashes = tokens.slice(1, 9);
  const floatBits = tokens.slice(9);
  if (hashes.length !== 8 || floatBits.length !== 256) {
    throw new Error(`case ${c.name}: expected 8 hashes and 256 floats`);
  }
  return {
    name: c.name,
    quality,
    dihedral: Object.fromEntries(DIHEDRAL_ORDER.map((label, k) => [label, hashes[k]])),
    floatBits,
  };
});

// Control: the build is right only if Original and quality match the expected
// values already recorded in pixel-cases.json for all cases.
let matched = 0;
cases.forEach((c, i) => {
  const rec = records[i];
  const ok = rec.dihedral.Original === c.expectedHex && rec.quality === c.expectedQuality;
  if (ok) matched += 1;
  else console.error(`MISMATCH ${c.name}: ${rec.dihedral.Original} q=${rec.quality}`);
});
console.log(`control: ${matched} of ${cases.length} cases match expected hash and quality`);
if (matched !== cases.length) {
  console.error('build is wrong (contraction flag or wrong files); nothing written');
  process.exit(1);
}

const out = {
  source: manifest.source,
  note: 'Dihedral hashes and float DCT output printed by the reference (pdqDihedralHash256esFromFloatLuma, pdqFloat256FromFloatLuma) over the byte arrays of pixel-cases.json. floatBits are float32 bit patterns as 8 hex digits, row-major 16x16.',
  dihedralOrder: DIHEDRAL_ORDER,
  cases: records,
};
writeFileSync(join(FIXTURES, 'dihedral-cases.json'), `${JSON.stringify(out, null, 2)}\n`);
console.log(`wrote ${join(FIXTURES, 'dihedral-cases.json')}`);
