// Builds the reference drivers in test/reference/ against a checkout of the
// upstream repository at the commit NOTICE names.
//
// Usage: node tools/build-reference.mts --source <checkout> --out <dir>
//          [--cxx <compiler>] [--opt <level>] [--suffix <text>] [--pictures]
//
// The flags are the definition of "the reference" this package is compared
// with: IEEE-754 single precision evaluated one operation at a time. No
// contraction (so no fused multiply-add), no fast-math, and on x86 no x87
// excess precision.
import { execFileSync } from 'node:child_process';
import { mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DRIVERS = join(ROOT, 'test', 'reference');

const STRICT_FLAGS: readonly string[] = [
  '-std=c++17',
  '-ffp-contract=off',
  '-fno-fast-math',
  '-fno-unsafe-math-optimizations',
];

// The reference translation units the drivers link against.
const REFERENCE_SOURCES: readonly string[] = [
  'pdq/cpp/hashing/pdqhashing.cpp',
  'pdq/cpp/hashing/torben.cpp',
  'pdq/cpp/downscaling/downscaling.cpp',
  'pdq/cpp/common/pdqhashtypes.cpp',
];

// The picture driver also needs the reference's image loader, which is CImg
// over libjpeg and libpng. CImg decodes in-process with these two defines;
// without them it would shell out to whatever converter the machine has.
const PICTURE_SOURCES: readonly string[] = ['pdq/cpp/io/pdqio.cpp'];
const PICTURE_FLAGS: readonly string[] = ['-Dcimg_use_jpeg', '-Dcimg_use_png', '-w'];
const PICTURE_LIBS: readonly string[] = ['-ljpeg', '-lpng', '-lz', '-lpthread'];

function pinnedCommit(): string {
  const notice = readFileSync(join(ROOT, 'NOTICE'), 'utf8');
  const match = /^PROVENANCE: facebook\/ThreatExchange at ([0-9a-f]{40}) /m.exec(notice);
  if (match?.[1] === undefined) {
    throw new Error('NOTICE has no PROVENANCE line naming a 40-digit commit');
  }
  return match[1];
}

function checkedOutCommit(source: string): string {
  return execFileSync('git', ['-C', source, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
}

interface Build {
  driver: string;
  extraSources: readonly string[];
  extraFlags: readonly string[];
  libs: readonly string[];
}

function main(): void {
  const { values } = parseArgs({
    options: {
      source: { type: 'string' },
      out: { type: 'string' },
      cxx: { type: 'string', default: 'c++' },
      opt: { type: 'string', default: '-O2' },
      suffix: { type: 'string', default: '' },
      pictures: { type: 'boolean', default: false },
    },
  });
  if (values.source === undefined || values.out === undefined) {
    throw new Error('usage: build-reference.mts --source <checkout> --out <dir> [--cxx <compiler>]');
  }
  const source = resolve(values.source);
  const out = resolve(values.out);
  const pinned = pinnedCommit();
  const actual = checkedOutCommit(source);
  if (actual !== pinned) {
    throw new Error(`reference checkout is at ${actual}, but NOTICE pins ${pinned}`);
  }
  mkdirSync(out, { recursive: true });
  const version = execFileSync(values.cxx, ['--version'], { encoding: 'utf8' }).split('\n')[0];
  console.log(`compiler: ${version ?? 'unknown'}`);
  console.log(`flags: ${values.opt} ${STRICT_FLAGS.join(' ')}`);
  const builds: Build[] = readdirSync(DRIVERS)
    .filter((name) => name.endsWith('.cpp'))
    .map((name) => ({ driver: join(DRIVERS, name), extraSources: [], extraFlags: [], libs: [] }));
  if (values.pictures) {
    builds.push({
      driver: join(DRIVERS, 'pictures', 'reference-pictures.cpp'),
      extraSources: PICTURE_SOURCES,
      extraFlags: PICTURE_FLAGS,
      libs: PICTURE_LIBS,
    });
  }
  for (const build of builds) {
    const target = join(out, `${basename(build.driver, '.cpp')}${values.suffix}`);
    execFileSync(
      values.cxx,
      [
        values.opt,
        ...STRICT_FLAGS,
        ...build.extraFlags,
        '-I',
        source,
        // pdqio includes CImg.h by its bare name.
        '-I',
        join(source, 'pdq', 'cpp'),
        ...[...REFERENCE_SOURCES, ...build.extraSources].map((path) => join(source, path)),
        build.driver,
        '-o',
        target,
        ...build.libs,
      ],
      { stdio: 'inherit' },
    );
    console.log(`built ${target}`);
  }
}

main();
