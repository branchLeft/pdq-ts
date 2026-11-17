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
node tools/build-reference.mts --source "$REF/src" --out "$REF/bin"
PDQ_REFERENCE_BIN="$REF/bin" pnpm run test:reference
```

`build-reference.mts` refuses a checkout that is not at the pinned commit. `--cxx`, `--opt` and `--suffix` build further variants into the same directory; every variant found is compared.

## Files

| File | What it does |
| --- | --- |
| `reference-dct-table.cpp` | Prints the reference's 16 x 64 DCT matrix as float32 bit patterns. |
| `dct-table.ref.ts` | The matrix pinned in `src/dct-table.ts` equals the one each build prints, bit for bit. |

## Regenerating the pinned matrix

```sh
node tools/generate-dct-table.mts "$REF/bin/reference-dct-table"
```

The result must be no change. `test/dct-table.test.ts` proves, without the reference, that no accurate cosine can give a different matrix.
