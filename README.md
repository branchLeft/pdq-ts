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

"The reference" below means the hashing core of facebook/ThreatExchange `pdq/cpp` at the commit above, built in IEEE-754 single precision with no fused multiply-add (`-ffp-contract=off`, no fast-math).

What has been shown, in three strengths:

| Strength | What |
| --- | --- |
| Covered for every possible input | Luma: all 16,777,216 RGB values compared with the reference bit for bit. The DCT matrix: all 1,024 entries compared bit for bit, and a test proves that any accurate cosine gives exactly that table. |
| Bit-identical on every input tested | Hash, quality and three float32 buffers (the 64 x 64 downsample, the 16 x 64 half-transformed buffer, the 16 x 16 DCT output) against a build of the reference, on 44 fixed pictures, 33 of upstream's own test pictures after its tool has decoded and shrunk them, and 4,000 seeded random pictures per build on each pull request (40,000 nightly). No difference has been observed. |
| Argued, not machine-checked | For all 8-bit grey or RGB arrays with both sides at least 5 pixels and fewer than 2^31 pixels: each floating-point operation in the reference has one counterpart in the port, rounded to single precision at the same point. [docs/equivalence.md](docs/equivalence.md) gives the argument stage by stage. It is a written argument; no tool has verified it. |

Not compared element by element: the full-size luma and blurred buffers (luma is covered per pixel instead; of the blurred buffer, the 4,096 samples the downsample keeps are compared), and the individual terms of the quality sum (the quality itself is compared).

Where each check runs:

| Check | Runs on |
| --- | --- |
| Everything above, against a build of the reference | Node 26 on Linux, with the reference built by gcc and by clang, on x64 and on arm64, at `-O2` and `-O0` |
| A smaller bundle with no reference present: `Math.fround` rounding, the DCT-matrix proof, the 44 fixed pictures against recorded reference values, and one digest over every stage of 500 random pictures, taken from the reference | Node 22 (Linux x64), Node 24 (Linux x64 and arm64), Node 26 (Linux arm64, macOS arm64); Bun and Deno (Linux x64 and arm64); Chromium, Firefox and WebKit (Linux x64, Linux arm64, macOS arm64) |

The exhaustive luma comparison, the reference's own pictures and the 4,000-picture fuzz run do not run on Bun, Deno or the browsers. Each of those engines is also given a deliberately wrong bundle on every run and must fail it.

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
