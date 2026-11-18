import { readFileSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import manifest from '../fixtures/pdq-reference/engine-digest.json';
import { caseDigest, NO_HASH, portRunDigest, runDigest } from '../helpers/engine-digest.js';
import { fuzzCase } from '../helpers/fuzz-cases.js';
import { driverBuilds } from './driver.js';
import { referenceStages } from './protocol.js';

const FIXTURE = join(__dirname, '..', 'fixtures', 'pdq-reference', 'engine-digest.json');
const UPDATE = process.env['PDQ_REFERENCE_UPDATE'] === '1';
const MINUTES = 60_000;

const builds = driverBuilds('reference-stages').map((path) => [basename(path), path] as const);

function bytesOfHex(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i += 1) {
    bytes[i] = Number.parseInt(hex.slice(2 * i, 2 * i + 2), 16);
  }
  return bytes;
}

// The digest other engines must reproduce (test/conformance/checks.ts) is
// taken from the reference's buffers here, never from the port's.
describe.each(builds)('the engine digest against %s', (_name, driver) => {
  it(
    `seed ${manifest.seed}, ${manifest.cases} cases: the reference gives the committed digest`,
    async () => {
      const digests: string[] = [];
      for (let index = 0; index < manifest.cases; index += 1) {
        const c = fuzzCase(manifest.seed, index);
        const [stages] = referenceStages(driver, [c]);
        if (c.width < 5 || c.height < 5) {
          expect(stages!.hex).toBe('0'.repeat(64));
          digests.push(NO_HASH);
        } else {
          digests.push(await caseDigest({ ...stages!, hash: bytesOfHex(stages!.hex) }));
        }
      }
      const sha256 = await runDigest(digests);
      if (UPDATE) {
        writeFileSync(FIXTURE, `${JSON.stringify({ ...manifest, sha256 }, null, 2)}\n`);
      }
      const committed = JSON.parse(readFileSync(FIXTURE, 'utf8')) as { sha256: string };
      expect(sha256).toBe(committed.sha256);
    },
    30 * MINUTES,
  );
});

describe('the engine digest from the port', () => {
  it(
    'is the committed digest on this engine',
    async () => {
      const committed = JSON.parse(readFileSync(FIXTURE, 'utf8')) as { sha256: string };
      expect(await portRunDigest(manifest.seed, manifest.cases)).toBe(committed.sha256);
    },
    30 * MINUTES,
  );
});
