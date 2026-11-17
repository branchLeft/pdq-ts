import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// ECMAScript requires an exact result from these and from no other Math
// function the port could be tempted to use: fround, floor, trunc, abs and
// min are exactly specified, where cos, sin, sqrt, pow and the rest are
// "implementation-approximated". Nothing outside this list may appear in src/.
const EXACT_MATH = new Set(['fround', 'floor', 'trunc', 'abs', 'min']);

const SRC = join(__dirname, '..', 'src');

describe('the shipped source', () => {
  const files = readdirSync(SRC).filter((name) => name.endsWith('.ts'));

  it('is the set of files this test knows about', () => {
    expect(files.sort()).toEqual(['dct-table.ts', 'hash.ts', 'index.ts', 'pdq.ts']);
  });

  it.each(files)('%s uses only exactly specified Math functions', (name) => {
    const text = readFileSync(join(SRC, name), 'utf8');
    const used = [...text.matchAll(/\bMath\s*(?:\.\s*(\w+)|\[)/g)].map((m) => m[1] ?? 'computed');
    expect(used.filter((member) => !EXACT_MATH.has(member))).toEqual([]);
    // Math must not be aliased or destructured, or the scan above is blind.
    const bare = [...text.matchAll(/\bMath\b(?!\s*\.)/g)];
    expect(bare).toHaveLength(0);
  });

  it.each(files)('%s has no exponent operator and no other numeric library call', (name) => {
    const text = readFileSync(join(SRC, name), 'utf8');
    expect(text).not.toMatch(/\*\*/);
    expect(text).not.toMatch(/\bparseFloat\b|\bNumber\s*\(/);
  });
});
