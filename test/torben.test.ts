import { describe, expect, it } from 'vitest';
import { torben } from '../src/pdq.js';

// The hash only ever takes the median of 256 values, and for an even count
// one of torben's three exits cannot be reached. These cases reach all three
// (the third needs an odd count) and state the value the reference's routine
// returns for each; test/reference/median.ref.ts compares with the reference
// itself over 900 arrays.
describe('torben', () => {
  it.each([
    ['exit one: the largest value below the guess', [1, 2, 9], 2],
    ['exit two: the guess itself', [1, 5, 9], 5],
    ['exit three: the smallest value above the guess', [1, 8, 9], 8],
    ['an even count takes the lower middle value', [4, 1, 3, 2], 2],
    ['all equal', [7, 7, 7, 7, 7], 7],
    ['a single value', [3], 3],
    ['ties around the middle', [0, 0, 1, 1, 1, 2, 2], 1],
  ] as const)('%s', (_name, values, median) => {
    expect(torben(Float32Array.from(values))).toBe(median);
  });
});
