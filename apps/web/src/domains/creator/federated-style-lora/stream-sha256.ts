// FIPS 180-4 SHA-256 초기 해시값 · 64라운드 상수 (순수 32비트 정수)
const SHA256_H0 = new Uint32Array([
  0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
]);
const SHA256_K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

function rotr32(value: number, bits: number): number {
  return ((value >>> bits) | (value << (32 - bits))) >>> 0;
}

/** 순수 32비트 정수 연산 기반 결정론적 SHA-256 해시(64자리 소문자 hex, BigInt 미사용). */
export function computeSha256Hex(bytes: Uint8Array): string {
  const byteLength = bytes.length;
  const totalLen = Math.ceil((byteLength + 9) / 64) * 64;
  const padded = new Uint8Array(totalLen);
  padded.set(bytes, 0);
  padded[byteLength] = 0x80;

  const bitLenLow = (byteLength << 3) >>> 0;
  const bitLenHigh = Math.floor(byteLength / 0x20000000) >>> 0;
  const lenOff = totalLen - 8;
  padded[lenOff] = (bitLenHigh >>> 24) & 0xff;
  padded[lenOff + 1] = (bitLenHigh >>> 16) & 0xff;
  padded[lenOff + 2] = (bitLenHigh >>> 8) & 0xff;
  padded[lenOff + 3] = bitLenHigh & 0xff;
  padded[lenOff + 4] = (bitLenLow >>> 24) & 0xff;
  padded[lenOff + 5] = (bitLenLow >>> 16) & 0xff;
  padded[lenOff + 6] = (bitLenLow >>> 8) & 0xff;
  padded[lenOff + 7] = bitLenLow & 0xff;

  let h0 = SHA256_H0[0] ?? 0;
  let h1 = SHA256_H0[1] ?? 0;
  let h2 = SHA256_H0[2] ?? 0;
  let h3 = SHA256_H0[3] ?? 0;
  let h4 = SHA256_H0[4] ?? 0;
  let h5 = SHA256_H0[5] ?? 0;
  let h6 = SHA256_H0[6] ?? 0;
  let h7 = SHA256_H0[7] ?? 0;
  const w = new Uint32Array(64);

  for (let offset = 0; offset < totalLen; offset += 64) {
    for (let i = 0; i < 16; i += 1) {
      const idx = offset + i * 4;
      w[i] = (((padded[idx] ?? 0) << 24) | ((padded[idx + 1] ?? 0) << 16) | ((padded[idx + 2] ?? 0) << 8) | (padded[idx + 3] ?? 0)) >>> 0;
    }
    for (let i = 16; i < 64; i += 1) {
      const w15 = w[i - 15] ?? 0;
      const w2 = w[i - 2] ?? 0;
      const s0 = (rotr32(w15, 7) ^ rotr32(w15, 18) ^ (w15 >>> 3)) >>> 0;
      const s1 = (rotr32(w2, 17) ^ rotr32(w2, 19) ^ (w2 >>> 10)) >>> 0;
      w[i] = ((w[i - 16] ?? 0) + s0 + (w[i - 7] ?? 0) + s1) >>> 0;
    }

    let a = h0;
    let b = h1;
    let c = h2;
    let d = h3;
    let e = h4;
    let f = h5;
    let g = h6;
    let h = h7;

    for (let i = 0; i < 64; i += 1) {
      const S1 = (rotr32(e, 6) ^ rotr32(e, 11) ^ rotr32(e, 25)) >>> 0;
      const ch = ((e & f) ^ ((~e >>> 0) & g)) >>> 0;
      const temp1 = (h + S1 + ch + (SHA256_K[i] ?? 0) + (w[i] ?? 0)) >>> 0;
      const S0 = (rotr32(a, 2) ^ rotr32(a, 13) ^ rotr32(a, 22)) >>> 0;
      const maj = ((a & b) ^ (a & c) ^ (b & c)) >>> 0;
      const temp2 = (S0 + maj) >>> 0;
      h = g; g = f; f = e; e = (d + temp1) >>> 0;
      d = c; c = b; b = a; a = (temp1 + temp2) >>> 0;
    }

    h0 = (h0 + a) >>> 0; h1 = (h1 + b) >>> 0; h2 = (h2 + c) >>> 0; h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0; h5 = (h5 + f) >>> 0; h6 = (h6 + g) >>> 0; h7 = (h7 + h) >>> 0;
  }

  return [h0, h1, h2, h3, h4, h5, h6, h7].map((word) => word.toString(16).padStart(8, "0")).join("");
}

/** UTF-8 문자열의 결정론적 SHA-256 해시를 계산한다. */
export function computeSha256HexFromText(text: string): string {
  return computeSha256Hex(new TextEncoder().encode(text));
}
