// Runs the reference's dihedral, plain-hash and float-output functions over raw
// pixel buffers (see README.txt). Input on stdin per record: "W H C\n" then
// W*H*C raw bytes. Output per record, one line: the dihedral quality, then the
// eight dihedral hashes in the reference's order (Original, Rotate90,
// Rotate180, Rotate270, FlipX, FlipY, FlipPlus1, FlipMinus1, hex), then the
// plain hash (hex) and its quality, then the float path's quality, then the
// 256 float DCT values of the 16x16 output in row-major order, each as the 8
// hex digits of its float32 bit pattern. The three functions are separate
// reference entry points: at exactly 64 x 64 the plain and float ones skip the
// blur and the dihedral one does not, so their qualities and hashes can differ.
#include <pdq/cpp/common/pdqhashtypes.h>
#include <pdq/cpp/downscaling/downscaling.h>
#include <pdq/cpp/hashing/pdqhashing.h>
#include <cstdint>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <vector>
using namespace facebook::pdq;

namespace {

// Same luma fill as reference-pixels-driver.cpp.
void fillLuma(std::vector<uint8_t>& px, int w, int h, int c, float* out) {
  if (c == 3) {
    downscaling::fillFloatLumaFromRGB(px.data(), px.data() + 1, px.data() + 2, h, w, 3 * w, 3, out);
  } else {
    downscaling::fillFloatLumaFromGrey(px.data(), h, w, w, 1, out);
  }
}

}  // namespace

int main() {
  int w, h, c;
  while (scanf("%d %d %d", &w, &h, &c) == 3) {
    fgetc(stdin);
    std::vector<uint8_t> px((size_t)w * h * c);
    if (fread(px.data(), 1, px.size(), stdin) != px.size()) return 2;

    // Dihedral hashes. Each call gets a freshly filled luma buffer, because the
    // reference filters its input buffers in place.
    std::vector<float> b1((size_t)w * h), b2((size_t)w * h);
    fillLuma(px, w, h, c, b1.data());
    float b64[64][64], b1664[16][64], b1616[16][16], aux1616[16][16];
    hashing::Hash256 hO, h90, h180, h270, hFX, hFY, hP1, hM1;
    int quality = 0;
    hashing::pdqDihedralHash256esFromFloatLuma(
        b1.data(), b2.data(), h, w, b64, b1664, b1616, aux1616,
        &hO, &h90, &h180, &h270, &hFX, &hFY, &hP1, &hM1, quality);
    printf("%d %s %s %s %s %s %s %s %s", quality, hO.format().c_str(), h90.format().c_str(),
           h180.format().c_str(), h270.format().c_str(), hFX.format().c_str(),
           hFY.format().c_str(), hP1.format().c_str(), hM1.format().c_str());

    // Plain hash: fresh luma again.
    fillLuma(px, w, h, c, b1.data());
    hashing::Hash256 hPlain;
    int qualityPlain = 0;
    hashing::pdqHash256FromFloatLuma(b1.data(), b2.data(), h, w, b64, b1664, b1616, hPlain,
                                     qualityPlain);
    printf(" %s %d", hPlain.format().c_str(), qualityPlain);

    // Float DCT output: fresh luma again, then the 16x16 float buffer.
    fillLuma(px, w, h, c, b1.data());
    float out1616[16][16];
    int qualityF = 0;
    hashing::pdqFloat256FromFloatLuma(b1.data(), b2.data(), h, w, b64, b1664, out1616, qualityF);
    printf(" %d", qualityF);
    for (int i = 0; i < 16; i++) {
      for (int j = 0; j < 16; j++) {
        uint32_t bits;
        std::memcpy(&bits, &out1616[i][j], sizeof bits);
        printf(" %08x", bits);
      }
    }
    printf("\n");
  }
  return 0;
}
