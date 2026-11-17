// The fixed inputs whose every stage is compared with the reference. The
// first 24 are the hand-recorded cases of pixel-cases.json, kept so their
// values can be seen to survive regeneration; the rest are the edges those
// did not reach.
import type { Channels } from '../../src/index.js';
import pixelManifest from '../fixtures/pdq-reference/pixel-cases.json';
import type { PixelKind, PixelSpec } from './pdq-pixels.js';

export interface StageSpec extends PixelSpec {
  name: string;
}

function spec(
  kind: PixelKind,
  width: number,
  height: number,
  channels: Channels,
  seed: number,
): StageSpec {
  const label = kind === 'flat' ? `flat${seed}` : kind;
  return { name: `${label}-${width}x${height}x${channels}`, width, height, channels, seed, kind };
}

function channelsOf(value: number): Channels {
  if (value !== 1 && value !== 3) {
    throw new Error(`fixture channel count ${value} is not 1 or 3`);
  }
  return value;
}

function kindOf(value: string): PixelKind {
  if (value !== 'blocks' && value !== 'flat') {
    throw new Error(`fixture kind ${value} is not one pixel-cases.json may hold`);
  }
  return value;
}

export const RECORDED_SPECS: readonly StageSpec[] = pixelManifest.pixelCases.map((c) => ({
  name: c.name,
  width: c.width,
  height: c.height,
  channels: channelsOf(c.channels),
  seed: c.seed,
  kind: kindOf(c.kind),
}));

export const EDGE_SPECS: readonly StageSpec[] = [
  // Saturated and extreme flat input.
  spec('flat', 64, 64, 1, 255),
  spec('flat', 100, 80, 3, 255),
  spec('flat', 5, 5, 3, 255),
  spec('flat', 5, 5, 1, 0),
  spec('bilevel', 300, 200, 1, 31),
  spec('bilevel', 64, 64, 3, 32),
  // The smallest side the reference accepts, against a long one.
  spec('noise', 5, 2000, 3, 33),
  spec('noise', 2000, 5, 1, 34),
  spec('noise', 5, 5, 1, 35),
  // Either side of the 64 x 64 shortcut.
  spec('noise', 64, 64, 3, 36),
  spec('noise', 65, 64, 1, 37),
  spec('noise', 64, 65, 3, 38),
  spec('noise', 63, 64, 1, 39),
  // Where the box-filter window steps from 1 to 2.
  spec('noise', 128, 129, 3, 40),
  spec('noise', 129, 128, 1, 41),
  // Smooth content: long runs of nearly equal sums in the running filter.
  spec('gradient', 640, 480, 3, 42),
  spec('gradient', 1000, 1000, 1, 43),
  spec('gradient', 64, 64, 1, 44),
  // Large pictures: windows of 17 by 13 and of 32 by 24, running sums over
  // thousands of terms.
  spec('noise', 2049, 1537, 3, 45),
  spec('blocks', 4032, 3024, 1, 46),
];

export const STAGE_SPECS: readonly StageSpec[] = [...RECORDED_SPECS, ...EDGE_SPECS];
