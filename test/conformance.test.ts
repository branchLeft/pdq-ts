import { describe, expect, it } from 'vitest';
import { CHECKS } from './conformance/checks.js';
import { render } from './conformance/main.js';

const MINUTES = 60_000;

// The same checks the conformance bundle runs on Bun, Deno and browsers, run
// here on the engine the unit suite is on.
describe('conformance checks on this engine', () => {
  it.each(CHECKS.map((check) => [check.name, check] as const))(
    '%s',
    async (_name, check) => {
      expect(await check.run()).toEqual([]);
    },
    10 * MINUTES,
  );
});

describe('the conformance report', () => {
  it('shows a failed check and its problems', () => {
    const text = render({
      engine: 'an engine',
      results: [
        { name: 'first', problems: [] },
        { name: 'second', problems: ['something differs'] },
      ],
      failed: 1,
    });
    expect(text.split('\n')).toEqual([
      'engine: an engine',
      'ok   first',
      'FAIL second',
      '       something differs',
      '1 of 2 checks passed',
    ]);
  });
});
