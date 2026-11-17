// Runs the reference over raw pixels and writes every stage it computes, as
// the bytes it holds, so a comparison can be bit for bit.
//
// reference-stages hash
//   stdin, per record: "W H C\n" then W*H*C bytes (C is 1 grey or 3 RGB).
//   stdout, per record, RECORD_BYTES bytes: the 64 hex characters of the
//   hash, the quality as int32, then the float32 buffers 64x64 (downsample),
//   16x64 (half-transformed) and 16x16 (DCT output), row-major.
//
// reference-stages luma
//   stdin, per record: "N\n" then N RGB triples.
//   stdout, per record: N float32 luma values.
//
// reference-stages median
//   stdin, per record: "N\n" then N float32 values.
//   stdout, per record: the one float32 the reference's torben returns.
//
// Numbers are written in the machine's byte order; every supported target is
// little-endian, and main() refuses to run on one that is not.
#include <pdq/cpp/common/pdqhashtypes.h>
#include <pdq/cpp/downscaling/downscaling.h>
#include <pdq/cpp/hashing/pdqhashing.h>
#include <pdq/cpp/hashing/torben.h>

#include <cstdint>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <string>
#include <vector>

using namespace facebook::pdq;

namespace {

bool readExact(void* into, size_t bytes) {
  return bytes == 0 || std::fread(into, 1, bytes, stdin) == bytes;
}

void writeExact(const void* from, size_t bytes) {
  if (bytes != 0 && std::fwrite(from, 1, bytes, stdout) != bytes) {
    std::exit(3);
  }
}

int hashMode() {
  int w, h, c;
  while (std::scanf("%d %d %d", &w, &h, &c) == 3) {
    std::fgetc(stdin);
    if (w < 1 || h < 1 || (c != 1 && c != 3)) {
      return 2;
    }
    std::vector<uint8_t> px((size_t)w * h * c);
    if (!readExact(px.data(), px.size())) {
      return 2;
    }
    std::vector<float> b1((size_t)w * h), b2((size_t)w * h);
    // The same luma fill the reference's own image loader calls.
    if (c == 3) {
      downscaling::fillFloatLumaFromRGB(
          px.data(), px.data() + 1, px.data() + 2, h, w, 3 * w, 3, b1.data());
    } else {
      downscaling::fillFloatLumaFromGrey(px.data(), h, w, w, 1, b1.data());
    }
    static float b64[64][64], b1664[16][64], b1616[16][16];
    std::memset(b64, 0, sizeof b64);
    std::memset(b1664, 0, sizeof b1664);
    std::memset(b1616, 0, sizeof b1616);
    hashing::Hash256 hash;
    int quality = 0;
    hashing::pdqHash256FromFloatLuma(
        b1.data(), b2.data(), h, w, b64, b1664, b1616, hash, quality);
    const std::string hex = hash.format();
    if (hex.size() != 64) {
      return 4;
    }
    const int32_t quality32 = quality;
    writeExact(hex.data(), 64);
    writeExact(&quality32, sizeof quality32);
    writeExact(b64, sizeof b64);
    writeExact(b1664, sizeof b1664);
    writeExact(b1616, sizeof b1616);
  }
  return 0;
}

int lumaMode() {
  int n;
  while (std::scanf("%d", &n) == 1) {
    std::fgetc(stdin);
    if (n < 1) {
      return 2;
    }
    std::vector<uint8_t> px((size_t)n * 3);
    if (!readExact(px.data(), px.size())) {
      return 2;
    }
    std::vector<float> luma((size_t)n);
    downscaling::fillFloatLumaFromRGB(
        px.data(), px.data() + 1, px.data() + 2, 1, n, 3 * n, 3, luma.data());
    // pdqhashing.cpp carries a second copy of the luma fill; the two must
    // agree or "the reference's luma" is not one thing.
    std::vector<float> second((size_t)n);
    hashing::fillFloatLumaFromRGB(
        px.data(), px.data() + 1, px.data() + 2, 1, n, 3 * n, 3, second.data());
    if (std::memcmp(luma.data(), second.data(), (size_t)n * sizeof(float)) != 0) {
      return 5;
    }
    writeExact(luma.data(), (size_t)n * sizeof(float));
  }
  return 0;
}

int medianMode() {
  int n;
  while (std::scanf("%d", &n) == 1) {
    std::fgetc(stdin);
    if (n < 1) {
      return 2;
    }
    std::vector<float> values((size_t)n);
    if (!readExact(values.data(), (size_t)n * sizeof(float))) {
      return 2;
    }
    const float median = hashing::torben(values.data(), n);
    writeExact(&median, sizeof median);
  }
  return 0;
}

} // namespace

int main(int argc, char** argv) {
  const uint32_t probe = 1;
  uint8_t first;
  std::memcpy(&first, &probe, 1);
  if (first != 1 || sizeof(float) != 4) {
    return 6;
  }
  const std::string mode = argc > 1 ? argv[1] : "";
  if (mode == "hash") {
    return hashMode();
  }
  if (mode == "luma") {
    return lumaMode();
  }
  if (mode == "median") {
    return medianMode();
  }
  std::fprintf(stderr, "usage: reference-stages hash|luma|median\n");
  return 64;
}
