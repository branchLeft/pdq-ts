// Builds the reference drivers in test/reference/ against a checkout of the
// upstream repository at the commit NOTICE names.
//
// Usage: node tools/build-reference.mts --source <checkout> --out <dir>
//          [--cxx <compiler>] [--opt <level>] [--suffix <text>]
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

function main(): void {
  const { values } = parseArgs({
    options: {
      source: { type: 'string' },
      out: { type: 'string' },
      cxx: { type: 'string', default: 'c++' },
      opt: { type: 'string', default: '-O2' },
      suffix: { type: 'string', default: '' },
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
  for (const file of readdirSync(DRIVERS).filter((name) => name.endsWith('.cpp'))) {
    const target = join(out, `${basename(file, '.cpp')}${values.suffix}`);
    execFileSync(
      values.cxx,
      [
        values.opt,
        ...STRICT_FLAGS,
        '-I',
        source,
        ...REFERENCE_SOURCES.map((path) => join(source, path)),
        join(DRIVERS, file),
        '-o',
        target,
      ],
      { stdio: 'inherit' },
    );
    console.log(`built ${target}`);
  }
}

main();
