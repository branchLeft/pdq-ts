import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const NOTICE = readFileSync(join(__dirname, '..', 'NOTICE'), 'utf8');
const SOURCE = readFileSync(join(__dirname, '..', 'src', 'pdq.ts'), 'utf8');

// The upstream repository's root LICENSE at the commit the port was made
// from. Pinned by hash, so an edited or truncated notice fails here.
const UPSTREAM_LICENSE_SHA256 = '68ecc6aafbd2a205a1077f86127030898f03091b7dae9d9017325a8702d8668f';
const SEPARATOR = '----------------------------------------------------------------\n\n';

describe('the BSD notice for the ported PDQ code', () => {
  it('carries the upstream licence text byte for byte', () => {
    const body = NOTICE.slice(NOTICE.indexOf(SEPARATOR) + SEPARATOR.length);
    expect(createHash('sha256').update(body).digest('hex')).toBe(UPSTREAM_LICENSE_SHA256);
  });

  it('keeps the copyright line, the three conditions and the disclaimer', () => {
    expect(NOTICE).toContain('Copyright (c) Meta Platforms, Inc. and affiliates.');
    expect(NOTICE).toContain('Redistributions of source code must retain the above copyright');
    expect(NOTICE).toContain('Redistributions in binary form must reproduce the above copyright');
    expect(NOTICE).toContain('Neither the name Facebook nor the names of its contributors');
    expect(NOTICE).toContain('THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS');
  });

  it('names the commit the port was made from', () => {
    expect(NOTICE).toContain('bd0108ff1745135a421856586d19d820dd62c6de');
  });

  it('is named by the ported source file, which keeps the copyright line', () => {
    expect(SOURCE).toContain('Copyright (c) Meta Platforms, Inc. and affiliates');
    expect(SOURCE).toContain('NOTICE');
  });
});
