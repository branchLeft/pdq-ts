// Prints the reference's 16 x 64 DCT matrix as 1,024 float32 bit patterns,
// eight hex digits each, one per line, row-major.
//
// The matrix is private to pdqhashing.cpp, so it is read back through the
// public dct64To16: with A the 64 x 64 identity, the intermediate T = D A is
// D itself. Each T[i][j] is a float sum of 63 products with zero and one
// product with one, so no rounding takes place and the value printed is the
// stored matrix entry exactly, whatever the compiler does with the sum.
#include <pdq/cpp/hashing/pdqhashing.h>

#include <cstdint>
#include <cstdio>
#include <cstring>

int main() {
  static float identity[64][64];
  static float t[16][64];
  static float b[16][16];
  for (int i = 0; i < 64; i++) {
    for (int j = 0; j < 64; j++) {
      identity[i][j] = i == j ? 1.0f : 0.0f;
    }
  }
  facebook::pdq::hashing::dct64To16(identity, t, b);
  for (int i = 0; i < 16; i++) {
    for (int j = 0; j < 64; j++) {
      uint32_t bits;
      std::memcpy(&bits, &t[i][j], sizeof bits);
      std::printf("%08x\n", bits);
    }
  }
  return 0;
}
