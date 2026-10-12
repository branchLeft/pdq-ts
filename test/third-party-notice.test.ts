import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const NOTICE = fs.readFileSync(path.join(ROOT, 'NOTICE'), 'utf8');
const LICENSE = fs.readFileSync(path.join(ROOT, 'LICENSE'), 'utf8');
const SOURCE = fs.readFileSync(path.join(ROOT, 'src', 'pdq-hash.ts'), 'utf8');

// The upstream repository's root LICENSE at the commit the port was made
// from. Pinned by hash, so an edited or truncated notice fails here.
const UPSTREAM_LICENSE_SHA256 = '68ecc6aafbd2a205a1077f86127030898f03091b7dae9d9017325a8702d8668f';
const SEPARATOR = '----------------------------------------------------------------\n\n';
const LICENCE_START = 'Redistribution and use';

describe('the BSD notice for the ported PDQ code', () => {
  it('carries the upstream licence text byte for byte', () => {
    const body = NOTICE.slice(NOTICE.indexOf(SEPARATOR) + SEPARATOR.length);
    expect(crypto.createHash('sha256').update(body).digest('hex')).toBe(UPSTREAM_LICENSE_SHA256);
  });

  it("holds the same licence text as the package's LICENSE, from the first condition on", () => {
    const fromNotice = NOTICE.slice(NOTICE.indexOf(LICENCE_START));
    const fromLicense = LICENSE.slice(LICENSE.indexOf(LICENCE_START));
    expect(fromNotice).toBe(fromLicense);
  });

  it('keeps the copyright line, the three conditions and the disclaimer', () => {
    expect(NOTICE).toContain('Copyright (c) Meta Platforms, Inc. and affiliates.');
    expect(NOTICE).toContain(
      'Redistributions of source code must retain the above copyright notice',
    );
    expect(NOTICE).toContain(
      'Redistributions in binary form must reproduce the above copyright notice',
    );
    expect(NOTICE).toContain('Neither the name Facebook nor the names of its contributors');
    expect(NOTICE).toContain(
      'THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"',
    );
  });

  it('names the commit the port was made from', () => {
    expect(NOTICE).toContain('bd0108ff1745135a421856586d19d820dd62c6de');
  });

  it('is named by the ported source file, which keeps the copyright line', () => {
    expect(SOURCE).toContain('Copyright (c) Meta Platforms, Inc. and affiliates');
    expect(SOURCE).toContain('NOTICE at the package root');
  });
});
