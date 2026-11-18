import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// ECMAScript requires an exact result from these and from no other Math
// function the port could be tempted to use: fround, floor, trunc, abs and
// min are exactly specified, where cos, sin, sqrt, pow and the rest are
// "implementation-approximated". Nothing outside this list may appear in src/.
const EXACT_MATH = new Set(['fround', 'floor', 'trunc', 'abs', 'min']);

const SRC = join(__dirname, '..', 'src');

// What a source text does that the port must not: an inexact Math member, a
// computed member, Math passed around whole, the exponent operator, or a
// text-to-number conversion.
function violations(text: string): string[] {
  const found: string[] = [];
  for (const match of text.matchAll(/\bMath\s*(?:\??\.\s*(\w+)|\??\.?\s*\[)/g)) {
    const member = match[1];
    if (member === undefined) {
      found.push('Math[computed]');
    } else if (!EXACT_MATH.has(member)) {
      found.push(`Math.${member}`);
    }
  }
  if (/\bMath\b(?!\s*\??\.|\s*\[)/.test(text)) {
    found.push('Math used whole');
  }
  if (/\*\*/.test(text)) {
    found.push('exponent operator');
  }
  if (/\bparseFloat\b|\bNumber\s*\(/.test(text)) {
    found.push('text-to-number conversion');
  }
  return found;
}

describe('the scan for inexact arithmetic', () => {
  it.each([
    ['a plain call', 'const x = Math.cos(1);', ['Math.cos']],
    ['spacing and a line break', 'const x = Math\n  . sqrt (2);', ['Math.sqrt']],
    ['optional chaining', 'const x = Math?.sin(1);', ['Math.sin']],
    ['a computed member', "const x = Math['c' + 'os'](1);", ['Math[computed]']],
    ['an alias of the whole object', 'const M = Math; M.cos(1);', ['Math used whole']],
    ['destructuring', 'const { cos } = Math;', ['Math used whole']],
    ['the exponent operator', 'const x = 2 ** 0.5;', ['exponent operator']],
    ['parsing a number', "const x = parseFloat('0.1');", ['text-to-number conversion']],
    ['an alias of one inexact member', 'const c = Math.cos;', ['Math.cos']],
  ])('catches %s', (_name, text, expected) => {
    expect(violations(text)).toEqual(expected);
  });

  it('accepts the exact functions, aliased or not', () => {
    expect(violations('const f = Math.fround; Math.floor(1); Math.trunc(Math.abs(-1));')).toEqual([]);
  });
});

describe('the shipped source', () => {
  const files = readdirSync(SRC).filter((name) => name.endsWith('.ts'));

  it('is the set of files this test knows about', () => {
    expect(files.sort()).toEqual(['dct-table.ts', 'hash.ts', 'index.ts', 'pdq.ts']);
  });

  it.each(files)('%s does no inexact arithmetic', (name) => {
    expect(violations(readFileSync(join(SRC, name), 'utf8'))).toEqual([]);
  });
});
