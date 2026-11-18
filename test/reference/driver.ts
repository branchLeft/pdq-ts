import { readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

// The directory tools/build-reference.mts wrote the reference drivers to. The
// reference suite must fail, not skip, when it is missing: a skipped
// comparison would read as a passed one.
export function referenceBinDir(): string {
  const dir = process.env['PDQ_REFERENCE_BIN'];
  if (dir === undefined || dir === '') {
    throw new Error('PDQ_REFERENCE_BIN must name the directory of built reference drivers');
  }
  return resolve(dir);
}

// Every build of one driver in the directory: the plain name and any
// suffixed variants (another optimisation level, another compiler).
export function driverBuilds(name: string): string[] {
  const dir = referenceBinDir();
  const builds = readdirSync(dir)
    .filter((file) => file === name || file.startsWith(`${name}-`))
    .sort()
    .map((file) => join(dir, file));
  if (builds.length === 0) {
    throw new Error(`no build of ${name} in ${dir}`);
  }
  return builds;
}
