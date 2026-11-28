/**
 * Wave 132 — 순수 ES2017 동기 FIPS 180-4 SHA-256 및 키 순서 무관 결정론 JSON 정규화.
 * 호스트 WebCrypto·Node crypto·TextEncoder에 의존하지 않는다.
 */

import { ForensicWatermarkError } from "./forensic-watermark-types";

const HEX_DIGITS = "0123456789abcdef";

const SHA256_ROUND_CONSTANTS = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

/** 순수 ES2017 UTF-8 인코더(서로게이트 쌍 지원). */
export function encodeUtf8Pure(text: string): Uint8Array {
  const bytes: number[] = [];
  for (let i = 0; i < text.length; i += 1) {
    let cp = text.charCodeAt(i);
    if (cp >= 0xd800 && cp <= 0xdbff && i + 1 < text.length) {
      const low = text.charCodeAt(i + 1);
      if (low >= 0xdc00 && low <= 0xdfff) {
        cp = ((cp - 0xd800) << 10) + (low - 0xdc00) + 0x10000;
        i += 1;
      }
    }
    if (cp <= 0x7f) {
      bytes.push(cp);
    } else if (cp <= 0x7ff) {
      bytes.push(0xc0 | (cp >> 6), 0x80 | (cp & 0x3f));
    } else if (cp <= 0xffff) {
      bytes.push(0xe0 | (cp >> 12), 0x80 | ((cp >> 6) & 0x3f), 0x80 | (cp & 0x3f));
    } else {
      bytes.push(
        0xf0 | (cp >> 18),
        0x80 | ((cp >> 12) & 0x3f),
        0x80 | ((cp >> 6) & 0x3f),
        0x80 | (cp & 0x3f),
      );
    }
  }
  return new Uint8Array(bytes);
}

/** 바이트 배열을 소문자 16진수 문자열로 변환한다. */
export function bytesToHexLower(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i += 1) {
    const b = bytes[i];
    out += HEX_DIGITS[b >>> 4] + HEX_DIGITS[b & 0x0f];
  }
  return out;
}

/** 순수 ES2017 동기 FIPS 180-4 SHA-256 (32바이트 출력). */
export function sha256Bytes(input: Uint8Array | string): Uint8Array {
  const data = typeof input === "string" ? encodeUtf8Pure(input) : input;
  const byteLen = data.length;
  const totalLen = Math.ceil((byteLen + 9) / 64) * 64;
  const padded = new Uint8Array(totalLen);
  padded.set(data, 0);
  padded[byteLen] = 0x80;

  const view = new DataView(padded.buffer);
  view.setUint32(totalLen - 8, Math.floor((byteLen * 8) / 0x100000000), false);
  view.setUint32(totalLen - 4, (byteLen * 8) >>> 0, false);

  let h0 = 0x6a09e667;
  let h1 = 0xbb67ae85;
  let h2 = 0x3c6ef372;
  let h3 = 0xa54ff53a;
  let h4 = 0x510e527f;
  let h5 = 0x9b05688c;
  let h6 = 0x1f83d9ab;
  let h7 = 0x5be0cd19;

  const w = new Uint32Array(64);
  for (let offset = 0; offset < totalLen; offset += 64) {
    for (let i = 0; i < 16; i += 1) {
      w[i] = view.getUint32(offset + i * 4, false);
    }
    for (let i = 16; i < 64; i += 1) {
      const w15 = w[i - 15];
      const w2 = w[i - 2];
      const s0 = ((w15 >>> 7) | (w15 << 25)) ^ ((w15 >>> 18) | (w15 << 14)) ^ (w15 >>> 3);
      const s1 = ((w2 >>> 17) | (w2 << 15)) ^ ((w2 >>> 19) | (w2 << 13)) ^ (w2 >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
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
      const sigma1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7));
      const ch = (e & f) ^ (~e & g);
      const temp1 = (h + sigma1 + ch + SHA256_ROUND_CONSTANTS[i] + w[i]) >>> 0;
      const sigma0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10));
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (sigma0 + maj) >>> 0;

      h = g;
      g = f;
      f = e;
      e = (d + temp1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) >>> 0;
    }

    h0 = (h0 + a) >>> 0;
    h1 = (h1 + b) >>> 0;
    h2 = (h2 + c) >>> 0;
    h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0;
    h5 = (h5 + f) >>> 0;
    h6 = (h6 + g) >>> 0;
    h7 = (h7 + h) >>> 0;
  }

  const digest = new Uint8Array(32);
  const outView = new DataView(digest.buffer);
  outView.setUint32(0, h0, false);
  outView.setUint32(4, h1, false);
  outView.setUint32(8, h2, false);
  outView.setUint32(12, h3, false);
  outView.setUint32(16, h4, false);
  outView.setUint32(20, h5, false);
  outView.setUint32(24, h6, false);
  outView.setUint32(28, h7, false);
  return digest;
}

/** 순수 ES2017 동기 FIPS 180-4 SHA-256 (소문자 64자리 16진수). */
export function sha256Hex(input: Uint8Array | string): string {
  return bytesToHexLower(sha256Bytes(input));
}

/** 키 순서와 무관한 결정론적 정규화 JSON 직렬화(비유한 숫자 fail-closed). */
export function canonicalizeJsonForHash(value: unknown): string {
  if (value === null) return "null";
  const kind = typeof value;
  if (kind === "boolean") return value ? "true" : "false";
  if (kind === "number") {
    if (!Number.isFinite(value as number)) {
      throw new ForensicWatermarkError(
        "NON_FINITE_PARAMETER",
        "정규화 매니페스트 JSON에 비유한 숫자를 포함할 수 없습니다.",
      );
    }
    return JSON.stringify(Object.is(value, -0) ? 0 : (value as number));
  }
  if (kind === "string") return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalizeJsonForHash(item)).join(",")}]`;
  }
  if (kind === "object") {
    const record = value as Record<string, unknown>;
    const keys = Object.keys(record)
      .filter((k) => record[k] !== undefined)
      .sort();
    const entries = keys.map((k) => `${JSON.stringify(k)}:${canonicalizeJsonForHash(record[k])}`);
    return `{${entries.join(",")}}`;
  }
  throw new ForensicWatermarkError(
    "INVALID_MANIFEST_INPUT",
    `매니페스트 직렬화에서 지원하지 않는 타입입니다: ${kind}`,
  );
}
