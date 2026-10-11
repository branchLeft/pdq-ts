# pdq-ts

One responsibility: perceptual hashing (the PDQ algorithm) as a TypeScript package.

- The core holds no index, no video handling and no image decoding (PRIN-5). Callers bring decoded pixels or bytes; this package returns hashes.
- Licence: BSD-3-Clause for everything in this repository. Meta's notice and licence travel with the code: `LICENSE` and `NOTICE` must stay in the repository and in the packed tarball.
- `"private": true` stays until the release step. Nothing publishes before then.
- The package and the repository are named `pdq-ts` (unscoped).
