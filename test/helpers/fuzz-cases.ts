// Seeded pictures for differential fuzzing. Case `index` of run `seed` is a
// pure function of those two numbers, so one failing case can be rebuilt
// alone, on any engine, from the line the failure prints.
import type { Channels } from '../../src/index.js';

export type FuzzContent =
  | 'noise'
  | 'flat'
  | 'bilevel'
  | 'extremes'
  | 'near-flat'
  | 'gradient'
  | 'stripes'
  | 'checker'
  | 'sparse'
  | 'blocks'
  | 'halves';

export type FuzzShape =
  | 'tiny'
  | 'below-minimum'
  | 'around-64'
  | 'window-step'
  | 'thin'
  | 'small'
  | 'medium'
  | 'large'
  | 'huge';

export interface FuzzCase {
  seed: number;
  index: number;
  shape: FuzzShape;
  content: FuzzContent;
  width: number;
  height: number;
  channels: Channels;
  pixels: Uint8Array;
}

// mulberry32: 32 bits of state, integer operations only, the same sequence
// on every engine.
export function prng(seed: number): () => number {
  let state = seed >>> 0;
  return (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return (t ^ (t >>> 14)) >>> 0;
  };
}

// Shapes are weighted towards the small and the awkward; the weights are
// chosen so an average case is cheap and the expensive shapes still occur.
const SHAPES: ReadonlyArray<readonly [FuzzShape, number]> = [
  ['tiny', 14],
  ['below-minimum', 3],
  ['around-64', 14],
  ['window-step', 12],
  ['thin', 10],
  ['small', 25],
  ['medium', 16],
  ['large', 5],
  ['huge', 1],
];

const CONTENTS: readonly FuzzContent[] = [
  'noise',
  'noise',
  'noise',
  'flat',
  'bilevel',
  'extremes',
  'near-flat',
  'gradient',
  'stripes',
  'checker',
  'sparse',
  'blocks',
  'halves',
];

function weighted(next: () => number): FuzzShape {
  const total = SHAPES.reduce((sum, [, weight]) => sum + weight, 0);
  let pick = next() % total;
  for (const [shape, weight] of SHAPES) {
    if (pick < weight) {
      return shape;
    }
    pick -= weight;
  }
  throw new Error('unreachable: weights exhausted');
}

function between(next: () => number, low: number, high: number): number {
  return low + (next() % (high - low + 1));
}

// A multiple of 128 is where the box-filter window grows by one; a multiple
// of 64 is where the decimation grid lines up with the pixels.
function nearStep(next: () => number): number {
  const base = between(next, 1, 12) * (next() % 2 === 0 ? 128 : 64);
  return Math.max(5, base + between(next, -2, 2));
}

function dimensions(shape: FuzzShape, next: () => number): [number, number] {
  switch (shape) {
    case 'tiny':
      return [between(next, 5, 9), between(next, 5, 9)];
    case 'below-minimum': {
      const short = between(next, 1, 4);
      const other = between(next, 1, 80);
      return next() % 2 === 0 ? [short, other] : [other, short];
    }
    case 'around-64':
      return [between(next, 62, 66), between(next, 62, 66)];
    case 'window-step':
      return [nearStep(next), nearStep(next)];
    case 'thin': {
      const short = between(next, 5, 8);
      const long = between(next, 5, 3000);
      return next() % 2 === 0 ? [short, long] : [long, short];
    }
    case 'small':
      return [between(next, 5, 200), between(next, 5, 200)];
    case 'medium':
      return [between(next, 64, 700), between(next, 64, 700)];
    case 'large':
      return [between(next, 700, 2200), between(next, 700, 2200)];
    case 'huge':
      return [between(next, 2200, 4096), between(next, 2200, 4096)];
  }
}

type Sample = (x: number, y: number, k: number) => number;

function sampler(content: FuzzContent, width: number, height: number, next: () => number): Sample {
  const a = next() & 255;
  const b = next() & 255;
  const period = between(next, 1, 40);
  switch (content) {
    case 'noise':
      return () => next() & 255;
    case 'flat': {
      const value = [0, 255, a][next() % 3]!;
      return () => value;
    }
    case 'bilevel':
      return () => (next() & 1) * 255;
    case 'extremes':
      return () => [0, 1, 254, 255][next() & 3]!;
    case 'near-flat':
      return () => Math.min(255, Math.max(0, a + (next() % 3) - 1));
    case 'gradient':
      return (x, y, k) =>
        (a +
          Math.floor((x * (b + 1)) / Math.max(1, width - 1)) +
          Math.floor((y * (k + 1) * 97) / Math.max(1, height - 1))) &
        255;
    case 'stripes':
      return (x) => (Math.floor(x / period) % 2 === 0 ? a : b);
    case 'checker':
      return (x, y) => ((Math.floor(x / period) + Math.floor(y / period)) % 2 === 0 ? 0 : 255);
    case 'sparse':
      return () => (next() % 97 === 0 ? 255 : 0);
    case 'blocks':
      return (x, y, k) =>
        ((Math.floor(x / 9) * 37 + Math.floor(y / 7) * 91 + k * 50 + a) & 255) ^ (next() & 15);
    case 'halves':
      return (x) => (x * 2 < width ? a : 255 - a);
  }
}

export function fuzzCase(seed: number, index: number): FuzzCase {
  const next = prng((Math.imul(seed >>> 0, 0x9e3779b1) ^ Math.imul(index + 1, 0x85ebca6b)) >>> 0);
  const shape = weighted(next);
  const content = CONTENTS[next() % CONTENTS.length]!;
  const [width, height] = dimensions(shape, next);
  const channels: Channels = next() % 2 === 0 ? 1 : 3;
  const sample = sampler(content, width, height, next);
  const pixels = new Uint8Array(width * height * channels);
  let at = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      for (let k = 0; k < channels; k += 1) {
        pixels[at] = sample(x, y, k);
        at += 1;
      }
    }
  }
  return { seed, index, shape, content, width, height, channels, pixels };
}

export function describeCase(c: FuzzCase): string {
  return `seed ${c.seed} case ${c.index}: ${c.shape} ${c.content} ${c.width}x${c.height}x${c.channels}`;
}
