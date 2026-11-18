# Reference suite

These tests compare the port with a built copy of the reference: facebook/ThreatExchange, directory `pdq/cpp`, at the commit `NOTICE` names. CI runs them on every pull request. `pnpm test` does not, because it needs a C++ compiler and the upstream checkout.

## What "the reference" means

The C++ source evaluated as IEEE-754 single precision, one operation at a time. `tools/build-reference.mts` holds the flags: `-ffp-contract=off` (no fused multiply-add), `-fno-fast-math`, `-fno-unsafe-math-optimizations`. A build of the same source that fuses a multiply and an add into one operation rounds once where this one rounds twice, and can differ from this build, and from the port, in rare bits.

## Run it

```sh
REF="$(mktemp -d)"
git init "$REF/src"
git -C "$REF/src" fetch --depth 1 https://github.com/facebook/ThreatExchange.git "$(sed -n 's/^PROVENANCE: facebook\/ThreatExchange at \([0-9a-f]*\) .*/\1/p' NOTICE)"
git -C "$REF/src" checkout FETCH_HEAD
node tools/build-reference.mts --source "$REF/src" --out "$REF/bin" --pictures
PDQ_REFERENCE_BIN="$REF/bin" PDQ_REFERENCE_SOURCE="$REF/src" pnpm run test:reference
```

`--pictures` also builds the driver that loads picture files as the reference's own tool does. It needs the libjpeg and libpng headers (`libjpeg-dev` and `libpng-dev` on Debian and Ubuntu; with Homebrew, set `CPATH` and `LIBRARY_PATH` to its `include` and `lib`).

`build-reference.mts` refuses a checkout that is not at the pinned commit. `--cxx`, `--opt` and `--suffix` build further variants into the same directory; every variant found is compared.

## Files

| File | What it does |
| --- | --- |
| `reference-dct-table.cpp` | Prints the reference's 16 x 64 DCT matrix as float32 bit patterns. |
| `dct-table.ref.ts` | The matrix pinned in `src/dct-table.ts` equals the one each build prints, bit for bit. |
| `reference-stages.cpp` | Runs the reference over raw pixels and writes the hash, the quality and the float32 buffers of every stage as bytes. A second mode writes luma for RGB triples. |
| `stages.ref.ts` | For the fixed cases of `test/helpers/stage-specs.ts`: the port's 64 x 64 downsample, 16 x 64 and 16 x 16 DCT buffers, quality and hash equal the reference's bit for bit, and regenerating `test/fixtures/pdq-reference/stage-cases.json` changes nothing. |
| `luma.ref.ts` | Luma for all 16,777,216 RGB values equals the reference's bit for bit. This stage is checked for every input that exists. |
| `median.ref.ts` | The port's median routine equals the reference's `torben` on 900 arrays of lengths 1 to 300, with and without ties. |
| `engine-digest.ref.ts` | One SHA-256 over every stage of 500 fuzz cases, taken from the reference's buffers, equals the committed `engine-digest.json`. Other engines must reproduce it from the port (`test/conformance/`). |
| `pictures/reference-pictures.cpp` | Hashes picture files with the reference's whole tool path (its decode, its shrink to 512 x 512, its hashing) and writes the pixels that path hashed. |
| `pictures.ref.ts` | For the 33 JPEG and PNG pictures in the reference's own `pdq/data` that its tool can load: the port, given those pixels, returns the tool's hash and quality and matches every stage of the reference core; and the tool as built here reproduces the eight hashes upstream publishes in `pdq/cpp/reg_test/expected/out`. The pictures are read from the upstream checkout and are not stored in this repository. |
| `fuzz.ref.ts` | Differential fuzzing: seeded pictures from `test/helpers/fuzz-cases.ts` through the reference and the port, every stage compared bit for bit. |

## Fuzzing

`PDQ_FUZZ_SEED` (default 1) and `PDQ_FUZZ_CASES` (default 300) choose the run. Case `n` of a seed is a pure function of the two numbers. Shapes: sides of 5 to 9, sides under the minimum, 62 to 66, within 2 of a multiple of 64 or 128, 5 to 8 by up to 3000, and up to 4096. Content: noise, flat 0 and 255, bilevel, the extremes 0, 1, 254 and 255, near-flat, gradients, stripes, checkerboards, sparse, blocks and halves.

CI runs 4,000 cases per reference build on every pull request, seeded with the run's id, and 40,000 nightly. A failure names the case, the stage, the index and both bit patterns, and prints the command that reruns that one case:

```sh
PDQ_FUZZ_SEED=<seed> PDQ_FUZZ_ONLY=<case> PDQ_REFERENCE_BIN="$REF/bin" pnpm run test:reference
```

For a side under 5 the reference returns a zero hash with quality 0 and the port returns `null`; the fuzzer checks exactly that and nothing else for those cases.

## Regenerating the recorded stages

```sh
PDQ_REFERENCE_UPDATE=1 PDQ_REFERENCE_BIN="$REF/bin" pnpm run test:reference
```

`stage-cases.json` holds, per case, the hash, the quality, all 256 DCT outputs as float32 bit patterns, and a SHA-256 of the bytes of the two larger buffers. `test/stages.test.ts` checks the port against it with no reference present, so the same comparison runs wherever the unit tests do.

## The control

Build the drivers with `-ffp-contract=fast` on arm64 and run this suite against them: the luma check and nearly every stage case fail, while, as `test/fixtures/pdq-reference/README.txt` records, all but one of the 24 hash-only vectors still match. A hash comparison cannot tell those two builds apart; a buffer comparison can.

## Regenerating the pinned matrix

```sh
node tools/generate-dct-table.mts "$REF/bin/reference-dct-table"
```

The result must be no change. `test/dct-table.test.ts` proves, without the reference, that no accurate cosine can give a different matrix.
