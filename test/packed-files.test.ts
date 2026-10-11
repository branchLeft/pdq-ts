import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// Control: the tarball carries the licence, notice and built entry; the pack
// uses --ignore-scripts, so dist/ must already exist (build runs first).
// Sabotage: drop NOTICE from `files`, or delete dist/: expect red.
const REQUIRED = ['LICENSE', 'NOTICE', 'package.json', 'dist/index.js'];

interface PackResult {
  files: Array<{ path: string }>;
}

describe('packed tarball contents', () => {
  it('packs LICENSE, NOTICE and package.json', () => {
    const out = execFileSync('npm', ['pack', '--dry-run', '--json', '--ignore-scripts'], {
      encoding: 'utf8',
    });
    const packed = (JSON.parse(out) as PackResult[])[0]!.files.map((f) => f.path);
    for (const required of REQUIRED) {
      expect(packed).toContain(required);
    }
  });

  it('names LICENSE and NOTICE in the files array of package.json', () => {
    const manifest = JSON.parse(readFileSync('package.json', 'utf8')) as { files: string[] };
    for (const required of ['LICENSE', 'NOTICE']) {
      expect(manifest.files).toContain(required);
    }
  });
});
