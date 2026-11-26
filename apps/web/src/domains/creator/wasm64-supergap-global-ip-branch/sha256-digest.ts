/**
 * 순수 ES2017 결정적 FIPS 180-4 SHA-256 다이제스트 및 정규화 JSON 직렬화기 (₩0 로컬).
 *
 * - 브라우저·Web Worker·Node 런타임 어디서나 외부 암호화 의존성 없이 동기적으로 동작한다.
 * - BigInt 리터럴(`0n`)을 전혀 사용하지 않고 32비트 무부호 비트 연산(`>>> 0`)만 사용해
 *   ES2017 엄격 컴파일 환경에서도 오류 없이 빌드된다.
 */

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

const SHA256_INIT_H = new Uint32Array([
  0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
  0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
]);

function rotr32(value: number, bits: number): number {
  return ((value >>> bits) | (value << (32 - bits))) >>> 0;
}

/**
 * UTF-16 JS 문자열을 RFC 3629 표준 UTF-8 바이트 배열로 결정적 인코딩한다.
 */
export function encodeUtf8(text: string): Uint8Array {
  const bytes: number[] = [];
  for (let i = 0; i < text.length; i += 1) {
    let codePoint = text.charCodeAt(i);
    if (codePoint >= 0xd800 && codePoint <= 0xdbff && i + 1 < text.length) {
      const next = text.charCodeAt(i + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        codePoint = 0x10000 + ((codePoint - 0xd800) << 10) + (next - 0xdc00);
        i += 1;
      }
    }
    if (codePoint <= 0x7f) {
      bytes.push(codePoint);
    } else if (codePoint <= 0x7ff) {
      bytes.push(0xc0 | (codePoint >> 6), 0x80 | (codePoint & 0x3f));
    } else if (codePoint <= 0xffff) {
      bytes.push(
        0xe0 | (codePoint >> 12),
        0x80 | ((codePoint >> 6) & 0x3f),
        0x80 | (codePoint & 0x3f),
      );
    } else {
      bytes.push(
        0xf0 | (codePoint >> 18),
        0x80 | ((codePoint >> 12) & 0x3f),
        0x80 | ((codePoint >> 6) & 0x3f),
        0x80 | (codePoint & 0x3f),
      );
    }
  }
  return new Uint8Array(bytes);
}

/**
 * 임의 바이트 버퍼의 FIPS 180-4 SHA-256 64자리 소문자 16진수 해시를 계산한다.
 */
export function sha256HexFromBytes(data: Uint8Array): string {
  const byteLen = data.length;
  const totalPaddedLen = Math.ceil((byteLen + 9) / 64) * 64;
  const padded = new Uint8Array(totalPaddedLen);
  padded.set(data, 0);
  padded[byteLen] = 0x80;

  const bitLenLow = (byteLen * 8) >>> 0;
  const bitLenHigh = Math.floor((byteLen * 8) / 0x100000000) >>> 0;
  const view = new DataView(padded.buffer);
  view.setUint32(totalPaddedLen - 8, bitLenHigh, false);
  view.setUint32(totalPaddedLen - 4, bitLenLow, false);

  const h = new Uint32Array(SHA256_INIT_H);
  const w = new Uint32Array(64);

  for (let offset = 0; offset < totalPaddedLen; offset += 64) {
    for (let i = 0; i < 16; i += 1) {
      w[i] = view.getUint32(offset + i * 4, false);
    }
    for (let i = 16; i < 64; i += 1) {
      const s0 = (rotr32(w[i - 15], 7) ^ rotr32(w[i - 15], 18) ^ (w[i - 15] >>> 3)) >>> 0;
      const s1 = (rotr32(w[i - 2], 17) ^ rotr32(w[i - 2], 19) ^ (w[i - 2] >>> 10)) >>> 0;
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
    }

    let a = h[0];
    let b = h[1];
    let c = h[2];
    let d = h[3];
    let e = h[4];
    let f = h[5];
    let g = h[6];
    let hh = h[7];

    for (let i = 0; i < 64; i += 1) {
      const s1 = (rotr32(e, 6) ^ rotr32(e, 11) ^ rotr32(e, 25)) >>> 0;
      const ch = ((e & f) ^ (~e & g)) >>> 0;
      const temp1 = (hh + s1 + ch + SHA256_K[i] + w[i]) >>> 0;
      const s0 = (rotr32(a, 2) ^ rotr32(a, 13) ^ rotr32(a, 22)) >>> 0;
      const maj = ((a & b) ^ (a & c) ^ (b & c)) >>> 0;
      const temp2 = (s0 + maj) >>> 0;

      hh = g;
      g = f;
      f = e;
      e = (d + temp1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) >>> 0;
    }

    h[0] = (h[0] + a) >>> 0;
    h[1] = (h[1] + b) >>> 0;
    h[2] = (h[2] + c) >>> 0;
    h[3] = (h[3] + d) >>> 0;
    h[4] = (h[4] + e) >>> 0;
    h[5] = (h[5] + f) >>> 0;
    h[6] = (h[6] + g) >>> 0;
    h[7] = (h[7] + hh) >>> 0;
  }

  let hex = "";
  for (let i = 0; i < 8; i += 1) {
    const part = h[i].toString(16);
    hex += part.length < 8 ? "0".repeat(8 - part.length) + part : part;
  }
  return hex;
}

/**
 * UTF-8 문자열의 FIPS 180-4 SHA-256 16진수 해시를 계산한다.
 */
export function sha256HexFromText(text: string): string {
  return sha256HexFromBytes(encodeUtf8(text));
}

/**
 * 키 순서를 사전순으로 정규화해 항상 동일한 JSON 문자열을 생성한다(해시 봉인용).
 */
export function canonicalJsonStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    const items: string[] = [];
    for (let i = 0; i < value.length; i += 1) {
      items.push(canonicalJsonStringify(value[i]));
    }
    return `[${items.join(",")}]`;
  }
  if (value instanceof Uint8Array) {
    return JSON.stringify(`Uint8Array:${sha256HexFromBytes(value)}`);
  }
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  const entries: string[] = [];
  for (let i = 0; i < keys.length; i += 1) {
    const key = keys[i];
    const entryVal = record[key];
    if (entryVal === undefined) {
      continue;
    }
    entries.push(`${JSON.stringify(key)}:${canonicalJsonStringify(entryVal)}`);
  }
  return `{${entries.join(",")}}`;
}
