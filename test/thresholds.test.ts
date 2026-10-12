import { describe, expect, it } from 'vitest';
import { PDQ_MATCH_DISTANCE_THRESHOLD, PDQ_QUALITY_THRESHOLD } from '../src/index.js';

describe('suggested thresholds', () => {
  it('match distance is 31 (a match when distance <= 31)', () => {
    expect(PDQ_MATCH_DISTANCE_THRESHOLD).toBe(31);
  });

  it('quality threshold is 50 (a quality below 50 is discarded)', () => {
    expect(PDQ_QUALITY_THRESHOLD).toBe(50);
  });
});
