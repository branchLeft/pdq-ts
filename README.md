# pdq-ts

PLACEHOLDER_ONE_LINE_DESCRIPTION

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

PLACEHOLDER_COVERAGE_STATEMENT

## Status

Not published. The package is marked `private` until the release step.

## Development

PLACEHOLDER_DEVELOPMENT_NOTES
