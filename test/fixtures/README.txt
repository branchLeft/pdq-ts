Byte-array identity cases for the PDQ port (src/pdq-hash.ts).

Source: facebook/ThreatExchange, directory pdq/, commit
bd0108ff1745135a421856586d19d820dd62c6de.

pixel-cases.json holds numeric pixel arrays, produced by
test/helpers/pdq-pixels.ts from fixed seeds, with the hash and quality the
reference hashing core (pdq/cpp/hashing/pdqhashing.cpp,
pdq/cpp/downscaling/downscaling.cpp, pdq/cpp/hashing/torben.cpp) printed for
exactly those bytes. No image file is involved. The reference's own
correctness test asks for this first: the same byte arrays into the reference
and into the port give the same hash.

Rebuild the expected values with reference-pixels-driver.cpp, built against a
checkout of the commit above without floating-point contraction:

  R=<checkout of the commit above>
  clang++ -O2 -ffp-contract=off -std=c++17 -I $R \
    $R/pdq/cpp/hashing/pdqhashing.cpp $R/pdq/cpp/hashing/torben.cpp \
    $R/pdq/cpp/downscaling/downscaling.cpp $R/pdq/cpp/common/pdqhashtypes.cpp \
    reference-pixels-driver.cpp -o pdq-ref-driver

The driver reads records of "WIDTH HEIGHT CHANNELS\n" then the raw bytes and
prints "hex quality" per record. Feed it the arrays from
test/helpers/pdq-pixels.ts (PIXEL_CASES, plus the two flat cases named in
pixel-cases.json). With contraction on (the compiler's default on some
targets) one degenerate case, a flat image whose hash is rounding noise,
differs; no other case does.

Dihedral and float vectors (dihedral-cases.json)

reference-dihedral-driver.cpp extends the driver above. It runs the reference's
pdqDihedralHash256esFromFloatLuma and pdqFloat256FromFloatLuma over the same
pixel arrays. Build it with the same flags and the same four reference files
(no further reference files are needed):

  R=<checkout of the commit above>
  clang++ -O2 -ffp-contract=off -std=c++17 -I $R \
    $R/pdq/cpp/hashing/pdqhashing.cpp $R/pdq/cpp/hashing/torben.cpp \
    $R/pdq/cpp/downscaling/downscaling.cpp $R/pdq/cpp/common/pdqhashtypes.cpp \
    reference-dihedral-driver.cpp -o pdq-dihedral-driver

Each driver output line is: quality, then the eight dihedral hashes in the
reference's order, then 256 float values. The eight hashes, in order, are
Original, Rotate90, Rotate180, Rotate270, FlipX, FlipY, FlipPlus1, FlipMinus1
(the parameter order of pdqDihedralHash256esFromFloatLuma in pdqhashing.h).
Each hash is 64 hex characters, as Hash256::format() prints it.

The 256 float values are the 16x16 DCT output of pdqFloat256FromFloatLuma in
row-major order. Each is written as 8 hex digits of its float32 bit pattern
(memcpy to uint32), so no decimal rounding enters the vectors.

Record the vectors with the recorder, which takes the driver binary and
writes dihedral-cases.json next to this file:

  node test/helpers/record-dihedral-cases.mjs /path/to/pdq-dihedral-driver

Its control check runs first: the driver's Original hash and quality must equal
the expected values in pixel-cases.json for all 24 cases, or nothing is written.
dihedral-cases.json holds, per case, the quality, the dihedral object keyed by
the eight names above (in that order), and floatBits (256 strings).

The reference's licence (BSD) applies to the ported algorithm and its notice
is NOTICE at the package root. The images used elsewhere
in the tests are generated, not taken from the reference: see
pictures/README.txt.
