/**
 * Wave 123 — Björn Ottosson 정확한 선형 sRGB → OKLab/OKLCH 변환·유클리드 ΔE 계산기 및
 * 외부 의존성 없는 순수 동기 ES2017 FIPS 180-4 SHA-256 정규 JSON 지문 해시.
 */

import type { OklabCoords, OklchCoords, SrgbTriplet } from "./wardrobe-continuity-types";

const RAD_TO_DEG = 180 / Math.PI;

/** 유한수가 아닌 입력을 안전하게 0으로 치환하고 `[min, max]` 범위로 클램프한다. */
export function clampFiniteNumber(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min;
  }
  if (value < min) {
    return min;
  }
  if (value > max) {
    return max;
  }
  return value;
}

/** IEC 61966-2-1 sRGB 채널(`0..255`)을 선형 광도(`0..1`)로 변환한다. */
export function srgbChannelToLinear(channel255: number): number {
  const s = clampFiniteNumber(channel255, 0, 255) / 255;
  if (s <= 0.04045) {
    return s / 12.92;
  }
  return Math.pow((s + 0.055) / 1.055, 2.4);
}

/**
 * sRGB `[r, g, b]`(`0..255`)를 Björn Ottosson 공식 변환 행렬로 OKLab 좌표로 변환한다.
 * - 순수 검정 `[0, 0, 0]` → `(0, 0, 0)`
 * - 순수 흰색 `[255, 255, 255]` → `(1, 0, 0)`
 */
export function srgbTripletToOklab(srgb: SrgbTriplet): OklabCoords {
  const r = srgbChannelToLinear(srgb[0]);
  const g = srgbChannelToLinear(srgb[1]);
  const b = srgbChannelToLinear(srgb[2]);

  const l = 0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b;
  const m = 0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b;
  const s = 0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b;

  const lCbrt = Math.cbrt(l);
  const mCbrt = Math.cbrt(m);
  const sCbrt = Math.cbrt(s);

  return {
    l: 0.2104542553 * lCbrt + 0.7936177850 * mCbrt - 0.0040720468 * sCbrt,
    a: 1.9779984951 * lCbrt - 2.4285922050 * mCbrt + 0.4505937099 * sCbrt,
    b: 0.0259040371 * lCbrt + 0.7827717662 * mCbrt - 0.8086757660 * sCbrt,
  };
}

/** OKLab 좌표를 극좌표 OKLCH(`L`, `C`, `H°`)로 변환한다. */
export function oklabToOklch(lab: OklabCoords): OklchCoords {
  const l = clampFiniteNumber(lab.l, 0, 1);
  const a = Number.isFinite(lab.a) ? lab.a : 0;
  const b = Number.isFinite(lab.b) ? lab.b : 0;
  const c = Math.sqrt(a * a + b * b);
  let h = c < 1e-7 ? 0 : Math.atan2(b, a) * RAD_TO_DEG;
  if (h < 0) {
    h += 360;
  }
  return { l, c, h: h >= 360 ? 0 : h };
}

/** sRGB `[r, g, b]`(`0..255`)를 OKLCH 좌표로 변환한다. */
export function srgbTripletToOklch(srgb: SrgbTriplet): OklchCoords {
  return oklabToOklch(srgbTripletToOklab(srgb));
}

function roundDecimal(value: number, digits: number): string {
  if (!Number.isFinite(value)) {
    return "0";
  }
  const factor = Math.pow(10, digits);
  const rounded = Math.round(value * factor) / factor;
  return Object.is(rounded, -0) ? "0" : String(rounded);
}

/** OKLCH 좌표를 SVG·CSS 안전 순수 `oklch(L C H)` 문자열로 직렬화한다. */
export function formatOklchCss(oklch: OklchCoords): string {
  const l = clampFiniteNumber(oklch.l, 0, 1);
  const c = clampFiniteNumber(oklch.c, 0, 0.45);
  const h = Number.isFinite(oklch.h) ? ((oklch.h % 360) + 360) % 360 : 0;
  return `oklch(${roundDecimal(l, 4)} ${roundDecimal(c, 4)} ${roundDecimal(h, 2)})`;
}

/** sRGB `[r, g, b]`를 순수 `oklch(L C H)` CSS 문자열로 변환한다. */
export function srgbTripletToOklchCss(srgb: SrgbTriplet): string {
  return formatOklchCss(srgbTripletToOklch(srgb));
}

function isSrgbTriplet(input: SrgbTriplet | OklabCoords): input is SrgbTriplet {
  return Array.isArray(input);
}

/**
 * 두 색상의 유클리드 OKLab 색차 ΔE를 계산한다.
 * sRGB 튜플과 사전 계산된 OKLab 좌표를 자유롭게 혼용할 수 있다.
 */
export function computeOklabDeltaE(
  first: SrgbTriplet | OklabCoords,
  second: SrgbTriplet | OklabCoords,
): number {
  const lab1 = isSrgbTriplet(first) ? srgbTripletToOklab(first) : first;
  const lab2 = isSrgbTriplet(second) ? srgbTripletToOklab(second) : second;
  const dl = lab1.l - lab2.l;
  const da = lab1.a - lab2.a;
  const db = lab1.b - lab2.b;
  const dist = Math.sqrt(dl * dl + da * da + db * db);
  return Number.isFinite(dist) ? dist : 0;
}

const SHA256_K: readonly number[] = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
];

function encodeUtf8Bytes(text: string): Uint8Array {
  const bytes: number[] = [];
  for (let i = 0; i < text.length; i += 1) {
    let cp = text.charCodeAt(i);
    if (cp >= 0xd800 && cp <= 0xdbff && i + 1 < text.length) {
      const next = text.charCodeAt(i + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        cp = 0x10000 + ((cp - 0xd800) << 10) + (next - 0xdc00);
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

function rotr32(v: number, bits: number): number {
  return ((v >>> bits) | (v << (32 - bits))) >>> 0;
}

function hex32(v: number): string {
  return (v >>> 0).toString(16).padStart(8, "0");
}

/** 외부 의존성 없는 순수 동기 ES2017 FIPS 180-4 SHA-256 64자리 소문자 16진수 해시. */
export function computeFips1804Sha256Hex(input: string | Uint8Array): string {
  const raw = typeof input === "string" ? encodeUtf8Bytes(input) : input;
  const byteLen = raw.length;
  const paddedLen = Math.ceil((byteLen + 9) / 64) * 64;
  const buf = new Uint8Array(paddedLen);
  buf.set(raw, 0);
  buf[byteLen] = 0x80;

  const dv = new DataView(buf.buffer);
  dv.setUint32(paddedLen - 8, Math.floor(byteLen / 0x20000000), false);
  dv.setUint32(paddedLen - 4, (byteLen << 3) >>> 0, false);

  let h0 = 0x6a09e667;
  let h1 = 0xbb67ae85;
  let h2 = 0x3c6ef372;
  let h3 = 0xa54ff53a;
  let h4 = 0x510e527f;
  let h5 = 0x9b05688c;
  let h6 = 0x1f83d9ab;
  let h7 = 0x5be0cd19;
  const w = new Uint32Array(64);

  for (let off = 0; off < paddedLen; off += 64) {
    for (let i = 0; i < 16; i += 1) {
      w[i] = dv.getUint32(off + i * 4, false);
    }
    for (let i = 16; i < 64; i += 1) {
      const s0 = (rotr32(w[i - 15], 7) ^ rotr32(w[i - 15], 18) ^ (w[i - 15] >>> 3)) >>> 0;
      const s1 = (rotr32(w[i - 2], 17) ^ rotr32(w[i - 2], 19) ^ (w[i - 2] >>> 10)) >>> 0;
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
      const s1 = (rotr32(e, 6) ^ rotr32(e, 11) ^ rotr32(e, 25)) >>> 0;
      const ch = ((e & f) ^ ((~e >>> 0) & g)) >>> 0;
      const t1 = (h + s1 + ch + SHA256_K[i] + w[i]) >>> 0;
      const s0 = (rotr32(a, 2) ^ rotr32(a, 13) ^ rotr32(a, 22)) >>> 0;
      const maj = ((a & b) ^ (a & c) ^ (b & c)) >>> 0;
      const t2 = (s0 + maj) >>> 0;

      h = g;
      g = f;
      f = e;
      e = (d + t1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (t1 + t2) >>> 0;
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

  return `${hex32(h0)}${hex32(h1)}${hex32(h2)}${hex32(h3)}${hex32(h4)}${hex32(h5)}${hex32(h6)}${hex32(h7)}`;
}

/** 객체 키 순서와 `undefined` 필드에 무관한 정규 JSON 문자열을 생성한다. */
export function canonicalizeJsonForHash(value: unknown): string {
  if (value === null) {
    return "null";
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      return "null";
    }
    return Object.is(value, -0) ? "0" : String(value);
  }
  if (typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    const items = value.map((item) =>
      item === undefined ? "null" : canonicalizeJsonForHash(item),
    );
    return `[${items.join(",")}]`;
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj)
    .filter((key) => obj[key] !== undefined)
    .sort();
  const pairs = keys.map((key) => `${JSON.stringify(key)}:${canonicalizeJsonForHash(obj[key])}`);
  return `{${pairs.join(",")}}`;
}

/** 옷장 바이블·착장 프리셋·감사 결과 객체의 결정론적 FIPS 180-4 SHA-256 지문을 계산한다. */
export function computeWardrobeBibleSha256Hex(payload: unknown): string {
  return computeFips1804Sha256Hex(canonicalizeJsonForHash(payload));
}
