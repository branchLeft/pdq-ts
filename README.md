# pdq-ts

PLACEHOLDER_ONE_LINE_DESCRIPTION

## Licence

BSD-3-Clause. See [LICENSE](LICENSE) and [NOTICE](NOTICE).

## Provenance

| Item | Value |
| --- | --- |
| Licence | BSD-3-Clause |
| Upstream | facebook/ThreatExchange |
| Upstream source commit | `bd0108ff1745135a421856586d19d820dd62c6de` |
| Upstream licence file | `LICENSE` at that commit |
| Upstream copyright line | Copyright (c) Meta Platforms, Inc. and affiliates. |
| This repository's copyright line | Copyright (c) 2026 branchLeft |

| Part | Owner |
| --- | --- |
| PDQ hashing algorithm and its reference notice | Meta Platforms, Inc. and affiliates |
| TypeScript packaging, tests, build and CI configuration | branchLeft |

## Status

Not published. The package is marked `private` until the release step.

## Equivalence with the reference

`pdqFromPixels` implements the pixel-to-hash stage of PDQ: luma, the two-pass box-filter downsample to 64 x 64, the quality metric, the 64-to-16 DCT and the median threshold.

For every 8-bit grey or RGB pixel array with both sides at least 5 pixels and fewer than 2^31 pixels in all, it returns the same 256-bit hash and the same quality as the hashing core of facebook/ThreatExchange `pdq/cpp` at the commit above, when that C++ is evaluated in IEEE-754 single precision without fused multiply-add (`-ffp-contract=off`, no fast-math). Every intermediate float32 value is the same as well.

How that is known:

- Each floating-point operation in the reference has one counterpart in the port, rounded to single precision at the same point. [docs/equivalence.md](docs/equivalence.md) gives the argument stage by stage.
- The DCT matrix is a table of constants, not a call to a cosine, and a test proves that any accurate cosine gives exactly that table.
- On every pull request CI builds the reference with gcc and clang on x64 and arm64 and compares bit patterns, not just hashes: the DCT matrix, luma for all 16,777,216 RGB values, every stage of 44 fixed pictures, and every stage of 4,000 seeded random pictures per build (40,000 nightly).
- The same checks run on Node 22, 24 and 26, Bun, Deno, Chromium, Firefox and WebKit, on x64 and arm64.

What it does not do:

- It does not decode images. It takes decoded pixels.
- It does not apply the reference tool's shrink to 512 x 512. For a picture with a side over 512 pixels, the reference's `pdq-photo-hasher` and this package hash different pixels and give close, not identical, hashes.
- It does not produce the eight dihedral hashes, and it accepts only 8-bit grey or RGB pixels: no alpha, no 16-bit samples.
- For a side shorter than 5 pixels it returns `null`, where the reference returns an all-zero hash with quality 0.
- A build of the reference that fuses multiply and add (the default on some compilers and CPUs) can differ from the strict build, and so from this package, in rare bits.

## Development

Node from `.nvmrc`, pnpm through corepack.

| Command | What it does |
| --- | --- |
| `pnpm install --frozen-lockfile` | Installs the dev dependencies. The package has no runtime dependencies. |
| `pnpm run typecheck` | Type-checks `src/`, `test/` and `tools/`. |
| `pnpm run lint` | ESLint. |
| `pnpm run test` | The unit suite. Needs no C++ compiler. |
| `pnpm run test:coverage` | The unit suite, failing below 100% coverage of `src/`. |
| `pnpm run test:reference` | Compares the port with a build of the reference. [test/reference/README.md](test/reference/README.md) says how to build it. |
| `pnpm run conformance:bundle` | Bundles the cross-engine checks into `conformance-bundle/conformance.js`, which any engine can run. |
| `pnpm run build` | Emits `dist/`. |

`src/dct-table.ts` is generated; change it only by running `tools/generate-dct-table.mts` against a reference build.
