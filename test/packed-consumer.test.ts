import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// The consumer check: pack the package for real, unpack the tarball as a
// consumer's node_modules/pdq-ts, and load it by name from separate node
// processes, once with `require` and once with `import()`. The test imports
// nothing from src/, so it sees exactly what a consumer is given: the `main`
// and `exports` maps, the built files, and the names the entry point exposes.
// Like packed-files.test.ts it packs with --ignore-scripts, so dist/ must
// already be built (CI builds before it tests).
//
// Sabotage: point `main` and the `exports` target at a file that is not
// packed, or drop a name from src/index.ts and rebuild: expect red.

const EXPECTED_EXPORTS = [
  'HASH_BYTES',
  'MAX_IMAGE_BYTES',
  'MAX_IMAGE_PIXELS',
  'MIN_HASHABLE_DIM',
  'PDQ_MATCH_DISTANCE_THRESHOLD',
  'PDQ_QUALITY_THRESHOLD',
  'REFERENCE_SIDE',
  'decoderLoadError',
  'fromHex',
  'hammingDistance',
  'hammingNorm',
  'pdqDihedralFromPixels',
  'pdqFloatFromPixels',
  'pdqFromPixels',
  'pdqHashOfImage',
  'toHex',
];

// Not part of the package's own names: what Node adds when `import()` loads a
// CommonJS module (the default export, and the compiler's `__esModule` flag).
const INTEROP_KEYS = new Set(['default', 'module.exports', '__esModule']);

// Run in the consumer's directory. It prints the sorted export names as JSON,
// then proves the hash functions work without the optional decoder installed.
const REQUIRE_SCRIPT = `
const pkg = require('pdq-ts');
const hash = pkg.pdqFromPixels(new Uint8Array(8 * 8 * 3).fill(7), 8, 8, 3);
process.stdout.write(JSON.stringify({
  names: Object.keys(pkg).sort(),
  hashLength: hash === null ? null : hash.hash.length,
  hex: pkg.toHex(hash.hash),
}));
`;

const IMPORT_SCRIPT = `
const pkg = await import('pdq-ts');
const hash = pkg.pdqFromPixels(new Uint8Array(8 * 8 * 3).fill(7), 8, 8, 3);
process.stdout.write(JSON.stringify({
  names: Object.keys(pkg).sort(),
  hashLength: hash === null ? null : hash.hash.length,
  hex: pkg.toHex(hash.hash),
}));
`;

interface Loaded {
  names: string[];
  hashLength: number | null;
  hex: string;
}

let work = '';
let consumer = '';
let installed = '';

function runIn(file: string): Loaded {
  const out = execFileSync(process.execPath, [file], { cwd: consumer, encoding: 'utf8' });
  return JSON.parse(out) as Loaded;
}

beforeAll(() => {
  work = mkdtempSync(path.join(tmpdir(), 'pdq-ts-packed-'));
  const dist = path.join(process.cwd(), 'dist', 'index.js');
  if (!existsSync(dist)) {
    throw new Error('dist/ is not built: run the build before this test');
  }
  const packed = path.join(work, 'packed');
  mkdirSync(packed);
  const out = execFileSync(
    'npm',
    ['pack', '--ignore-scripts', '--json', '--pack-destination', packed],
    { encoding: 'utf8' },
  );
  const filename = (JSON.parse(out) as Array<{ filename: string }>)[0]?.filename;
  if (filename === undefined) {
    throw new Error('npm pack named no tarball');
  }
  consumer = path.join(work, 'consumer');
  installed = path.join(consumer, 'node_modules', 'pdq-ts');
  mkdirSync(installed, { recursive: true });
  // A tarball holds everything under `package/`.
  execFileSync('tar', [
    '-xzf',
    path.join(packed, filename),
    '-C',
    installed,
    '--strip-components=1',
  ]);
  writeFileSync(path.join(consumer, 'package.json'), '{"private": true}\n');
  writeFileSync(path.join(consumer, 'load.cjs'), REQUIRE_SCRIPT);
  writeFileSync(path.join(consumer, 'load.mjs'), IMPORT_SCRIPT);
});

afterAll(() => {
  if (work !== '') {
    rmSync(work, { recursive: true, force: true });
  }
});

describe('the packed tarball, installed as a consumer would have it', () => {
  it('unpacks to the files a consumer needs and nothing from src or test', () => {
    const top = readdirSync(installed).sort();
    expect(top).toEqual(expect.arrayContaining(['LICENSE', 'NOTICE', 'dist', 'package.json']));
    expect(top).not.toContain('src');
    expect(top).not.toContain('test');
    expect(existsSync(path.join(installed, 'dist', 'index.js'))).toBe(true);
    expect(existsSync(path.join(installed, 'dist', 'index.d.ts'))).toBe(true);
  });

  it('loads under require and exposes exactly the named exports', () => {
    const loaded = runIn('load.cjs');
    expect(loaded.names).toEqual(EXPECTED_EXPORTS);
    expect(loaded.hashLength).toBe(32);
  });

  it('loads under import() and exposes the same named exports', () => {
    const loaded = runIn('load.mjs');
    expect(loaded.names.filter((name) => !INTEROP_KEYS.has(name))).toEqual(EXPECTED_EXPORTS);
    expect(loaded.hashLength).toBe(32);
  });

  it('gives the same hash under both loaders', () => {
    expect(runIn('load.mjs').hex).toBe(runIn('load.cjs').hex);
  });
});
