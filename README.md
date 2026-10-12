# pdq-ts

A TypeScript port of the PDQ perceptual hash, from the reference code that Meta Platforms, Inc. published in facebook/ThreatExchange. It hashes raw pixels, or image bytes with an optional decoder, to 256-bit hashes, and compares hashes by Hamming distance.

## Usage

The package root is `pdq-ts`. Its entry points:

- `pdqFromPixels(pixels, width, height, channels)`: hashes 8-bit raw pixels, row-major, with 1 or 3 channels. Returns `{ hash, quality }`, or `null` when a side is under 5 pixels. It needs no decoder.
- `pdqHashOfImage(bytes, options?)`: decodes image bytes and returns `{ hash, quality, reason }`. It does not reject. When `hash` is `null`, `reason` says why (see Limits).
- `hammingDistance(a, b)`: the number of differing bits of two 32-byte hashes, from 0 to 256.
- `hammingNorm(hash)`: the number of set bits of one hash, from 0 to 256.
- `PDQ_MATCH_DISTANCE_THRESHOLD` (31) and `PDQ_QUALITY_THRESHOLD` (50): Meta's suggested thresholds. A match is a distance of 31 or less. A hash with quality below 50 is discarded.
- `toHex(hash)` and `fromHex(text)`: the hash as 64 lowercase hexadecimal characters, and back.
- `pdqDihedralFromPixels(pixels, width, height, channels)`: eight hashes of the 16 x 16 DCT block, one for each dihedral variant, each thresholded on its own median.
- `pdqFloatFromPixels(pixels, width, height, channels)`: the 256 DCT values before thresholding.

```js
import { pdqFromPixels, toHex } from 'pdq-ts';

// pixels: a Uint8Array of 64 * 64 * 3 bytes
const result = pdqFromPixels(pixels, 64, 64, 3);
if (result !== null) {
  console.log(toHex(result.hash), result.quality);
}
```

```js
import { readFileSync } from 'node:fs';
import { pdqHashOfImage, toHex } from 'pdq-ts';

const { hash, quality, reason } = await pdqHashOfImage(readFileSync('picture.jpg'));
console.log(hash === null ? `no hash: ${reason}` : toHex(hash), quality);
```

`pdqHashOfImage` decodes with `sharp`, an optional peer dependency (`^0.35.3`). Without it, every input that is not rejected as not bytes, empty or too large gets `reason: 'decoder-unavailable'`, and `decoderLoadError()` returns the load error. The pixel functions do not use `sharp`.

## Limits

Every `reason` means there is no hash. None of them is a verdict that a picture is safe. A caller that releases on `not-an-image` alone must also hold the other reasons.

- Formats: JPEG, PNG, WebP, GIF, TIFF and HEIF are decoded. Any other format, including vector and document formats, gives `not-an-image`.
- Size: bytes over 64 MiB (`MAX_IMAGE_BYTES`) give `too-large`, and so does a picture of more than 64,000,000 pixels (`MAX_IMAGE_PIXELS`). Both bounds can be set in `options`. A side under 5 pixels gives `too-small`.
- A picture with a side over 512 pixels is shrunk to a 512 x 512 square, ignoring its aspect ratio, by nearest neighbour (`REFERENCE_SIDE`).
- The hash is of the stored pixels. No orientation is applied, no embedded colour profile is read, and alpha is dropped.
- The hash is not the reference's photo-hasher output for: 16-bit PNG; RGBA, grey with alpha, and CMYK (CMYK is converted to sRGB); animated pictures and multi-page files (the first frame or page only). A flat picture has quality 0 and a hash that is rounding noise.
- Dihedral hashes are not exactly rotation-invariant (Meta's own note, see Provenance).
- The pixel core takes decoded pixels and holds no index, no video handling and no image decoding.

## Licence

BSD-3-Clause. See [LICENSE](LICENSE) and [NOTICE](NOTICE).

## Provenance

| Item                             | Value                                                                                                                                                                                                   |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Licence                          | BSD-3-Clause                                                                                                                                                                                            |
| Upstream                         | facebook/ThreatExchange                                                                                                                                                                                 |
| Upstream source commit           | `bd0108ff1745135a421856586d19d820dd62c6de`                                                                                                                                                              |
| Upstream licence file            | `LICENSE` at that commit                                                                                                                                                                                |
| Upstream copyright line          | Copyright (c) Meta Platforms, Inc. and affiliates.                                                                                                                                                      |
| Known limit                      | dihedral hashes are not exactly rotation-invariant (Meta's own note)                                                                                                                                    |
| This repository's copyright line | Copyright (c) 2026 branchLeft                                                                                                                                                                           |
| Hex text form                    | Meta: `pdq/cpp/common/pdqhashtypes.cpp` (sixteen `%04hx` words, most significant first). Ours: `toHex` and `fromHex` in `src/hash-text.ts` (64 lowercase characters, strict)                            |
| Hamming distance                 | Meta: bit difference count of two 256-bit hashes (`pdq/README.md`). Ours: `hammingDistance` in `src/distance.ts`, 0 to 256                                                                              |
| Hamming norm                     | Meta: set bit count of one hash (`pdq/README.md`). Ours: `hammingNorm` in `src/distance.ts`, 0 to 256                                                                                                   |
| Match distance threshold         | Meta: `python-threatexchange/threatexchange/signal_type/pdq/pdq_utils.py`, `PDQ_CONFIDENT_MATCH_THRESHOLD = 31`, match when distance <= 31. Ours: `PDQ_MATCH_DISTANCE_THRESHOLD` in `src/thresholds.ts` |
| Quality threshold                | Meta: `python-threatexchange/threatexchange/signal_type/pdq/signal.py`, `QUALITY_THRESHOLD = 50`, quality below 50 discarded. Ours: `PDQ_QUALITY_THRESHOLD` in `src/thresholds.ts`                      |

| Part                                                    | Owner                               |
| ------------------------------------------------------- | ----------------------------------- |
| PDQ hashing algorithm and its reference notice          | Meta Platforms, Inc. and affiliates |
| TypeScript packaging, tests, build and CI configuration | branchLeft                          |

## Coverage

Unit tests are in `test/` and run under vitest (`pnpm test`). The byte-array vectors in `test/fixtures/pixel-cases.json` and `test/fixtures/dihedral-cases.json` were recorded from Meta's reference code (`test/fixtures/README.txt`). The test pictures are generated, not taken from the reference (`test/fixtures/pictures/README.txt`).

## Status

Not published. The package is marked `private` until the release step.

## Development

Node is pinned in `.nvmrc`. pnpm is pinned in `package.json` (`packageManager`). Install with `pnpm install --frozen-lockfile`. CI runs these, in this order:

- `pnpm run typecheck`
- `pnpm run format`
- `pnpm run lint`
- `pnpm run build`
- `pnpm run test`

`pnpm run prepack` builds `dist/`. The pre-commit hooks in `.pre-commit-config.yaml` run prettier, eslint and vitest.
