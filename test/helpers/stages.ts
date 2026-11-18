// Turning float32 buffers into things that can be compared exactly. Uses only
// what every JavaScript engine provides, so the same checks run anywhere.
import { pdqStagesFromPixels } from '../../src/pdq.js';
import { toHex } from '../../src/index.js';
import { syntheticPixels } from './pdq-pixels.js';
import type { StageSpec } from './stage-specs.js';

// What is recorded for one input: the hash and quality, all 256 DCT outputs
// as float32 bit patterns, and a SHA-256 of each larger buffer's bytes.
export interface StageRecord {
  name: string;
  width: number;
  height: number;
  channels: number;
  seed: number;
  kind: string;
  hex: string;
  quality: number;
  downsampleSha256: string;
  halfDctSha256: string;
  dctBits: string;
}

// The float32 values as bytes, least significant first, on any platform.
export function floatBytes(values: Float32Array): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(values.length * 4);
  const view = new DataView(bytes.buffer);
  for (let i = 0; i < values.length; i += 1) {
    view.setFloat32(i * 4, values[i]!, true);
  }
  return bytes;
}

// Each float32 as the eight hex digits of its bit pattern, concatenated.
export function bitsHex(values: Float32Array): string {
  const view = new DataView(new ArrayBuffer(4));
  let text = '';
  for (let i = 0; i < values.length; i += 1) {
    view.setFloat32(0, values[i]!);
    text += view.getUint32(0).toString(16).padStart(8, '0');
  }
  return text;
}

export async function sha256Hex(bytes: Uint8Array<ArrayBuffer>): Promise<string> {
  const digest = new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', bytes));
  let text = '';
  for (const byte of digest) {
    text += byte.toString(16).padStart(2, '0');
  }
  return text;
}

export interface StageBuffers {
  hex: string;
  quality: number;
  downsample: Float32Array;
  halfDct: Float32Array;
  dct: Float32Array;
}

export async function recordOf(spec: StageSpec, stages: StageBuffers): Promise<StageRecord> {
  return {
    name: spec.name,
    width: spec.width,
    height: spec.height,
    channels: spec.channels,
    seed: spec.seed,
    kind: spec.kind,
    hex: stages.hex,
    quality: stages.quality,
    downsampleSha256: await sha256Hex(floatBytes(stages.downsample)),
    halfDctSha256: await sha256Hex(floatBytes(stages.halfDct)),
    dctBits: bitsHex(stages.dct),
  };
}

export function portStages(spec: StageSpec): StageBuffers {
  const stages = pdqStagesFromPixels(
    syntheticPixels(spec),
    spec.width,
    spec.height,
    spec.channels,
  );
  if (stages === null) {
    throw new Error(`${spec.name}: the port returned no hash`);
  }
  return { ...stages, hex: toHex(stages.hash) };
}
