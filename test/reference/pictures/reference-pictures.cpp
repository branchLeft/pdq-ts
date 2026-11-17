// Hashes picture files with the reference's own tool path and hands over the
// pixels that path hashed, so the port can be given exactly those pixels.
//
// reference-pictures FILE...
//   stdout, per file: "W H C HEX QUALITY\n" then W*H*C bytes, row-major, RGB
//   interleaved when C is 3; or "SKIP\n" for a file the reference cannot
//   load or whose channel count is neither 1 nor 3.
//
// HEX and QUALITY come from the reference's pdqHash256FromFile: its decode,
// its shrink to 512 x 512 for a picture with a longer side, its hashing. The
// pixels are produced by repeating that function's own load and shrink.
#include <pdq/cpp/common/pdqhashtypes.h>
#include <pdq/cpp/io/pdqio.h>

#include <cstdint>
#include <cstdio>
#include <string>
#include <vector>

using namespace facebook::pdq;

namespace {

// The same constant, and below the same two statements, as pdqio.cpp.
const int DOWNSAMPLE_DIMS = 512;

bool writeOne(const char* filename) {
  cimg_library::CImg<uint8_t> input;
  try {
    input.load(filename);
  } catch (const cimg_library::CImgIOException&) {
    return false;
  }
  // The reference tool exits the process on any other channel count, so
  // such a file is skipped before the tool is asked.
  const int c = input.spectrum();
  if (c != 1 && c != 3) {
    return false;
  }
  hashing::Hash256 hash;
  int quality = 0;
  int area = 0;
  float readSeconds = 0;
  float hashSeconds = 0;
  if (!hashing::pdqHash256FromFile(
          filename, hash, quality, area, readSeconds, hashSeconds)) {
    return false;
  }
  if (input.height() > DOWNSAMPLE_DIMS || input.width() > DOWNSAMPLE_DIMS) {
    input = input.resize(DOWNSAMPLE_DIMS, DOWNSAMPLE_DIMS);
  }
  const int w = input.width();
  const int h = input.height();
  std::vector<uint8_t> px((size_t)w * h * c);
  size_t at = 0;
  for (int y = 0; y < h; y++) {
    for (int x = 0; x < w; x++) {
      for (int k = 0; k < c; k++) {
        px[at++] = input(x, y, 0, k);
      }
    }
  }
  std::printf("%d %d %d %s %d\n", w, h, c, hash.format().c_str(), quality);
  return std::fwrite(px.data(), 1, px.size(), stdout) == px.size();
}

} // namespace

int main(int argc, char** argv) {
  for (int i = 1; i < argc; i++) {
    if (!writeOne(argv[i])) {
      std::printf("SKIP\n");
    }
  }
  return 0;
}
