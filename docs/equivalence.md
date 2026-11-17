# Equivalence with the reference

This note says exactly what `pdq-ts` computes, what it is compared with, why the two agree, how that is checked on every change, and where the agreement stops.

## The claim

> For every 8-bit grey or RGB pixel array with both sides at least 5 pixels and fewer than 2^31 pixels in all, `pdqFromPixels` returns the same 256-bit hash and the same quality as the hashing core of facebook/ThreatExchange `pdq/cpp` at the commit named in `NOTICE`, when that C++ is evaluated in IEEE-754 single precision without fused multiply-add. Every intermediate float32 value is the same too: the 64 x 64 downsample, the 16 x 64 half-transformed buffer and the 16 x 16 DCT output.

The claim rests on an argument (each floating-point operation in the reference has one counterpart in the port, rounded at the same point) and on tests that compare bit patterns against a build of the reference on every pull request. It is not a machine-checked proof.

## What "the reference" means

The same C++ source gives different floats under different compiler settings, so "the reference" has to name them.

| Item | Value |
| --- | --- |
| Source | facebook/ThreatExchange, `pdq/cpp`: `hashing/pdqhashing.cpp`, `hashing/torben.cpp`, `downscaling/downscaling.cpp`, `common/pdqhashtypes.cpp` |
| Commit | the one on the `PROVENANCE` line of `NOTICE` |
| Arithmetic | IEEE-754 binary32, round to nearest even, each operation rounded on its own (`FLT_EVAL_METHOD` 0) |
| Flags | `-std=c++17 -ffp-contract=off -fno-fast-math -fno-unsafe-math-optimizations` (`tools/build-reference.mts`) |
| Builds compared in CI | gcc and clang, Linux x64 and arm64, each at `-O2` and `-O0`: eight builds |

All eight builds agree with each other bit for bit on everything compared here.

A build that lets the compiler contract `a * b + c` into one fused operation rounds once where the source rounds twice. Compilers do this by default on arm64, and on x64 when the target has FMA. Such a build of the same commit differs from the strict build, and from this port: built with `-ffp-contract=fast` on arm64, it fails 42 of the 44 fixed stage comparisons and the luma comparison. The differences are in last digits, and they reach the hash only when a coefficient sits next to the median, which is why they are rare in hashes and common in buffers.

## Why computing in doubles is exact

JavaScript numbers are binary64. The port keeps every float32 value in a `Float32Array` or passes it through `Math.fround`, and never applies two operations before rounding.

**Lemma.** For float32 values `a` and `b` and an operation among `+ - * /`, rounding the binary64 result to float32 gives the correctly rounded float32 result: `fround(a op b)` is exactly the C++ `float` operation.

For `*` the binary64 product of two 24-bit significands is exact, so there is one rounding. For `+`, `-` and `/` there are two roundings, and two roundings to nearest equal one whenever the wider format has at least 2p + 2 bits for a p-bit target (Figueroa, "When is double rounding innocuous?", 1995). Here 53 is at least 2 * 24 + 2.

Integers that enter float operations (a pixel value up to 255, a window size, which stays below 2^24 for any picture inside the claim, and the constants 100, 255 and 2) are exactly representable as float32, so converting them is not a rounding.

`Math.fround`, `Math.floor`, `Math.trunc`, `Math.abs` and `Math.min` are exactly specified by ECMAScript. No other `Math` function appears in `src/`, and `test/no-transcendentals.test.ts` keeps it so.

## Stage by stage

Each row is one stage. "Rounded" lists every point at which a float32 rounding happens; the port has an `fround` or a `Float32Array` store at each, and nowhere else.

| Stage | Reference | Port (`src/pdq.ts`) | Rounded |
| --- | --- | --- | --- |
| Luma from RGB | `fillFloatLumaFromRGB`: `float y = cR * r + cG * g + cB * b` with `float` coefficients 0.299, 0.587, 0.114 | `lumaFromRgb`: `fround(fround(fround(cR * r) + fround(cG * g)) + fround(cB * b))` | three products, two sums |
| Luma from grey | `fillFloatLumaFromGrey`: `(float) p` | `lumaFromGrey` | none (exact) |
| Window size | `computeJaroszFilterWindowSize`: `(n + 127) / 128` in `int` | `jaroszWindow` | none (integers) |
| Box filter | `box1DFloat`: `sum += x`, `sum -= x`, `out = sum / n` in four phases | `box1D`: the same four phases, `sum = fround(sum + x)`, `sum = fround(sum - x)`, `fround(sum / n)` | every add, subtract and divide, separately |
| Two passes, rows then columns | `jaroszFilterFloat` | `downscaleTo64` | as above |
| Decimation | `decimateFloat`: `(int)(((i + 0.5) * rows) / 64)` in `double` | `Math.floor(((i + 0.5) * rows) / 64)` | none in float32; the binary64 operations are the same in both |
| 64 x 64 input | copied, no blur | used as it is, no blur | none |
| Quality | `pdqImageDomainQualityMetric`: `int d = ((u - v) * 100) / 255`, sum of absolute values, `/ 90`, at most 100 | `gradient`, `qualityOf`: `trunc(fround(fround(fround(u - v) * 100) / 255))` | subtract, multiply, divide |
| DCT matrix | `dct_matrix_64`: `scale * cos(angle)` in `double`, stored as `float` | 1,024 pinned float32 bit patterns in `src/dct-table.ts` | see below |
| DCT | `dct64To16`: `sum += d * a` for k from 0 to 63, twice | `dct64To16`: `sum = fround(sum + fround(d * a))`, k ascending | each product, each sum |
| Median | `torben`: `guess = (min + max) / 2`, comparisons | `torben`: `fround(fround(min + max) / 2)`, the same comparisons and tie rule | add, halve |
| Bits | `pdqBuffer16x16ToBits`: bit `16 i + j` set when the value is greater than the median | `bitsToBytes` | none |
| Text order | `Hash256::format`: 16-bit words 15 down to 0 | bytes in that order | none |

The reference unrolls its DCT loops by hand; the order of the additions is unchanged, and the port uses a plain loop in the same order.

No value in the pipeline can be infinite or not-a-number: the inputs are bytes, and every later value is a bounded combination of them.

## The DCT matrix

This is the one place where the reference calls a function that IEEE-754 does not pin down: the C library's cosine. Different libraries may return different last digits.

The port calls no cosine. The matrix is 1,024 constants, generated from a build of the reference by `tools/generate-dct-table.mts`.

`test/dct-table.test.ts` then shows the constants do not depend on which library was used. With exact integer arithmetic it computes the true value of each entry and checks that the whole interval around it, wide enough to cover any cosine wrong by up to 40 units in its last place, rounds to the pinned float32. C libraries are accurate to under one unit. So every build of the reference must hold exactly this matrix, and CI confirms it on the eight builds.

## What is checked on every pull request

| Evidence | Where | Strength |
| --- | --- | --- |
| DCT matrix | `test/dct-table.test.ts`, `test/reference/dct-table.ref.ts` | proof for all entries, plus bit comparison with eight builds |
| Luma | `test/reference/luma.ref.ts` | all 16,777,216 RGB values, bit for bit: every input this stage can receive |
| Median | `test/reference/median.ref.ts` | 900 arrays of lengths 1 to 300 against the reference's routine |
| 44 fixed pictures | `test/reference/stages.ref.ts`, `test/stages.test.ts` | every stage bit for bit; the committed expected values are regenerated from the reference and must not change |
| Fuzzing | `test/reference/fuzz.ref.ts` | 4,000 seeded pictures per build, every stage bit for bit; 40,000 nightly; sides 1 to 4096 |
| Engines | `test/conformance/`, the `engine` and `browsers` jobs | the same bundle on Node 22, 24 and 26, Bun, Deno, Chromium, Firefox and WebKit, x64 and arm64 |
| Coverage | `vitest.config.mts` | 100% of statements and branches of `src/` |

The fixed pictures include the smallest size, 5 x 2000 and 2000 x 5, 63 to 65 pixels either side of the 64 x 64 shortcut, 128 and 129 where the filter window steps, flat 0 and flat 255, bilevel, gradients, and a 12-megapixel picture with windows of 32 and 24.

Each check has been seen to fail when it should: a matrix entry moved by one unit in the last place, the box filter's add and subtract rounded together, and the reference built with contraction. Of the 24 hash-only vectors that predate these checks, one noticed the wrong matrix entry and none noticed the wrong box filter. Matching hashes are weak evidence about the arithmetic; matching buffers are strong evidence.

## What is not ported

| Not ported | Consequence |
| --- | --- |
| Image decoding (the reference uses CImg with libjpeg and libpng) | The package takes decoded 8-bit pixels. Two decoders can give different pixels for the same lossy file, and then different hashes. |
| The reference tool's shrink to 512 x 512 before hashing (`io/pdqio.cpp`) | For a picture with a side over 512 pixels, the reference's `pdq-photo-hasher` hashes shrunk pixels and this package hashes the pixels it is given. The hashes are close, not identical. A caller who needs the tool's hash must apply the same shrink first. |
| Dihedral hashes (the eight rotations and flips) | Not available. |
| Alpha, 16-bit samples, four channels | Rejected with `RangeError`. |
| Video hashing, the index, the Hamming-distance tools other than `hammingDistance` | Not available. |

## Deliberate differences

| Input | Reference | Port |
| --- | --- | --- |
| A side shorter than 5 pixels | all-zero hash, quality 0 | `null` |
| Arguments that cannot describe a picture | undefined behaviour | `RangeError` |
| 2^31 pixels or more | `int` overflow, undefined | not compared; outside the claim |

The fuzzer generates sides under 5 and checks exactly the first row.

## Limits of the evidence

- The argument is written, not machine-checked.
- The reference is compared on Linux x64 and arm64 with gcc and clang. A 32-bit x86 build that uses the x87 unit, or any build with contraction or fast-math, is a different function.
- Engines are compared on Linux and macOS. Windows and big-endian machines are not in the matrix. Nothing in the port depends on byte order: the matrix is stored as bit patterns and both array views over them use the platform's order.
- Fuzzing samples the input space; only luma and the DCT matrix are covered for every possible input.
