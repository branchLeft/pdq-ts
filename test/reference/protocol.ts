import { spawnSync } from 'node:child_process';
import type { StageBuffers } from '../helpers/stages.js';

export interface RawPicture {
  width: number;
  height: number;
  channels: number;
  pixels: Uint8Array;
}

const HEX_BYTES = 64;
const FLOATS = [64 * 64, 16 * 64, 16 * 16] as const;
const RECORD_BYTES = HEX_BYTES + 4 + 4 * (FLOATS[0] + FLOATS[1] + FLOATS[2]);

function run(driver: string, mode: string, input: Uint8Array, expectedBytes: number): Buffer {
  const result = spawnSync(driver, [mode], { input, maxBuffer: expectedBytes + 1024 });
  if (result.status !== 0) {
    throw new Error(`${driver} ${mode} exited ${String(result.status)}: ${result.stderr.toString()}`);
  }
  if (result.stdout.length !== expectedBytes) {
    throw new Error(
      `${driver} ${mode} wrote ${result.stdout.length} bytes, not ${expectedBytes}` +
        ` (exit ${String(result.status)}, signal ${String(result.signal)}, stderr: ${result.stderr.toString()})`,
    );
  }
  return result.stdout;
}

function floatsAt(bytes: Buffer, offset: number, count: number): Float32Array {
  const values = new Float32Array(count);
  for (let i = 0; i < count; i += 1) {
    values[i] = bytes.readFloatLE(offset + 4 * i);
  }
  return values;
}

// The reference's stages for each picture, in order.
export function referenceStages(driver: string, pictures: readonly RawPicture[]): StageBuffers[] {
  const parts: Uint8Array[] = [];
  for (const p of pictures) {
    parts.push(Buffer.from(`${p.width} ${p.height} ${p.channels}\n`), p.pixels);
  }
  const out = run(driver, 'hash', Buffer.concat(parts), RECORD_BYTES * pictures.length);
  return pictures.map((_picture, index) => {
    const base = index * RECORD_BYTES;
    const floats = base + HEX_BYTES + 4;
    return {
      hex: out.toString('latin1', base, base + HEX_BYTES),
      quality: out.readInt32LE(base + HEX_BYTES),
      downsample: floatsAt(out, floats, FLOATS[0]),
      halfDct: floatsAt(out, floats + 4 * FLOATS[0], FLOATS[1]),
      dct: floatsAt(out, floats + 4 * (FLOATS[0] + FLOATS[1]), FLOATS[2]),
    };
  });
}

// The reference's luma for `count` RGB triples.
export function referenceLuma(driver: string, rgb: Uint8Array, count: number): Float32Array {
  const input = Buffer.concat([Buffer.from(`${count}\n`), rgb]);
  return floatsAt(run(driver, 'luma', input, 4 * count), 0, count);
}

// The reference's torben median of each array, in order.
export function referenceMedians(driver: string, arrays: readonly Float32Array[]): Float32Array {
  const parts: Uint8Array[] = [];
  for (const values of arrays) {
    const bytes = Buffer.alloc(4 * values.length);
    values.forEach((value, i) => bytes.writeFloatLE(value, 4 * i));
    parts.push(Buffer.from(`${values.length}\n`), bytes);
  }
  return floatsAt(run(driver, 'median', Buffer.concat(parts), 4 * arrays.length), 0, arrays.length);
}

function bitsOf(values: Float32Array): Uint32Array {
  return new Uint32Array(values.buffer, values.byteOffset, values.length);
}

// Index of the first float32 whose bit pattern differs, or -1. Bit patterns,
// not values: -0 and +0 differ, and a NaN equals the same NaN.
export function firstBitDifference(a: Float32Array, b: Float32Array): number {
  if (a.length !== b.length) {
    return Math.min(a.length, b.length);
  }
  const x = bitsOf(a);
  const y = bitsOf(b);
  for (let i = 0; i < x.length; i += 1) {
    if (x[i] !== y[i]) {
      return i;
    }
  }
  return -1;
}
