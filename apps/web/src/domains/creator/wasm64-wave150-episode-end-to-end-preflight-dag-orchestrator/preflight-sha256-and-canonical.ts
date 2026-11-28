/**
 * Wave 150 마일스톤 — 순수 ES2017 동기 FIPS 180-4 SHA-256 및 키 순서 무관 정규 직렬화.
 *
 * - 브라우저·Node·WebWorker 런타임 차이나 비동기 SubtleCrypto에 의존하지 않고 결정론적 해시를 산출한다.
 * - BigInt 리터럴 없이 32비트 부호 없는 정수 산술(`>>> 0`)만 사용한다.
 * - 객체 속성 삽입 순서가 달라도 동일한 정규 문자열과 SHA-256 지문을 보장한다.
 */

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

const SHA256_INITIAL_STATE = new Uint32Array([
  0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
  0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
]);

function rotr32(value: number, bits: number): number {
  return ((value >>> bits) | (value << (32 - bits))) >>> 0;
}

function wordToHex8(word: number): string {
  const hex = (word >>> 0).toString(16);
  return hex.length >= 8 ? hex : "00000000".slice(hex.length) + hex;
}

/**
 * UTF-16 자바스크립트 문자열을 표준 UTF-8 바이트 배열로 결정론적 변환한다.
 */
export function encodePreflightUtf8Bytes(text: string): Uint8Array {
  const bytes: number[] = [];
  for (let i = 0; i < text.length; i += 1) {
    let codePoint = text.charCodeAt(i);
    if (codePoint >= 0xd800 && codePoint <= 0xdbff && i + 1 < text.length) {
      const low = text.charCodeAt(i + 1);
      if (low >= 0xdc00 && low <= 0xdfff) {
        codePoint = 0x10000 + ((codePoint - 0xd800) << 10) + (low - 0xdc00);
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
 * FIPS 180-4 SHA-256 해시를 64자리 소문자 16진수 문자열로 계산한다.
 */
export function sha256PreflightBytesHex(data: Uint8Array): string {
  const byteLen = data.length;
  const totalLen = Math.ceil((byteLen + 9) / 64) * 64;
  const padded = new Uint8Array(totalLen);
  padded.set(data, 0);
  padded[byteLen] = 0x80;

  const bitLen = byteLen * 8;
  const bitLenHi = Math.floor(bitLen / 4294967296) >>> 0;
  const bitLenLo = bitLen >>> 0;

  padded[totalLen - 8] = (bitLenHi >>> 24) & 0xff;
  padded[totalLen - 7] = (bitLenHi >>> 16) & 0xff;
  padded[totalLen - 6] = (bitLenHi >>> 8) & 0xff;
  padded[totalLen - 5] = bitLenHi & 0xff;
  padded[totalLen - 4] = (bitLenLo >>> 24) & 0xff;
  padded[totalLen - 3] = (bitLenLo >>> 16) & 0xff;
  padded[totalLen - 2] = (bitLenLo >>> 8) & 0xff;
  padded[totalLen - 1] = bitLenLo & 0xff;

  let h0 = SHA256_INITIAL_STATE[0] ?? 0;
  let h1 = SHA256_INITIAL_STATE[1] ?? 0;
  let h2 = SHA256_INITIAL_STATE[2] ?? 0;
  let h3 = SHA256_INITIAL_STATE[3] ?? 0;
  let h4 = SHA256_INITIAL_STATE[4] ?? 0;
  let h5 = SHA256_INITIAL_STATE[5] ?? 0;
  let h6 = SHA256_INITIAL_STATE[6] ?? 0;
  let h7 = SHA256_INITIAL_STATE[7] ?? 0;

  const schedule = new Uint32Array(64);

  for (let offset = 0; offset < totalLen; offset += 64) {
    for (let i = 0; i < 16; i += 1) {
      const idx = offset + i * 4;
      schedule[i] =
        (((padded[idx] ?? 0) << 24) |
          ((padded[idx + 1] ?? 0) << 16) |
          ((padded[idx + 2] ?? 0) << 8) |
          (padded[idx + 3] ?? 0)) >>>
        0;
    }

    for (let i = 16; i < 64; i += 1) {
      const w15 = schedule[i - 15] ?? 0;
      const w2 = schedule[i - 2] ?? 0;
      const sigma0 = (rotr32(w15, 7) ^ rotr32(w15, 18) ^ (w15 >>> 3)) >>> 0;
      const sigma1 = (rotr32(w2, 17) ^ rotr32(w2, 19) ^ (w2 >>> 10)) >>> 0;
      schedule[i] = ((schedule[i - 16] ?? 0) + sigma0 + (schedule[i - 7] ?? 0) + sigma1) >>> 0;
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
      const capSigma1 = (rotr32(e, 6) ^ rotr32(e, 11) ^ rotr32(e, 25)) >>> 0;
      const choice = ((e & f) ^ (~e & g)) >>> 0;
      const temp1 =
        (h + capSigma1 + choice + (SHA256_ROUND_CONSTANTS[i] ?? 0) + (schedule[i] ?? 0)) >>> 0;
      const capSigma0 = (rotr32(a, 2) ^ rotr32(a, 13) ^ rotr32(a, 22)) >>> 0;
      const majority = ((a & b) ^ (a & c) ^ (b & c)) >>> 0;
      const temp2 = (capSigma0 + majority) >>> 0;

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

  return (
    wordToHex8(h0) +
    wordToHex8(h1) +
    wordToHex8(h2) +
    wordToHex8(h3) +
    wordToHex8(h4) +
    wordToHex8(h5) +
    wordToHex8(h6) +
    wordToHex8(h7)
  );
}

/**
 * UTF-8 문자열의 FIPS 180-4 SHA-256 64자리 16진수 해시를 계산한다.
 */
export function sha256PreflightUtf8Hex(text: string): string {
  return sha256PreflightBytesHex(encodePreflightUtf8Bytes(text));
}

/**
 * 임의의 직렬화 가능 값을 키 정렬 정규 JSON 문자열로 변환한다.
 */
export function canonicalizePreflightValue(value: unknown): string {
  if (value === null || value === undefined) {
    return "null";
  }
  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return "null";
    const normalized = Object.is(value, -0) ? 0 : value;
    return String(normalized);
  }
  if (typeof value === "string") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    const serialized: string[] = [];
    for (let i = 0; i < value.length; i += 1) {
      serialized.push(canonicalizePreflightValue(value[i]));
    }
    return `[${serialized.join(",")}]`;
  }
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    const keys = Object.keys(record).sort();
    const pairs: string[] = [];
    for (let i = 0; i < keys.length; i += 1) {
      const key = keys[i];
      if (key === undefined) continue;
      const entry = record[key];
      if (entry === undefined) continue;
      pairs.push(`${JSON.stringify(key)}:${canonicalizePreflightValue(entry)}`);
    }
    return `{${pairs.join(",")}}`;
  }
  return JSON.stringify(String(value));
}

/**
 * 임의의 정규 객체 페이로드에 대한 결정론적 SHA-256 해시를 산출한다.
 */
export function sha256CanonicalPreflightPayload(payload: unknown): string {
  return sha256PreflightUtf8Hex(canonicalizePreflightValue(payload));
}

/**
 * 64자리 소문자 SHA-256 16진수 형식인지 검증한다.
 */
export function isValidSha256Hex(candidate: string): boolean {
  return /^[0-9a-f]{64}$/.test(candidate);
}

/**
 * 타이밍 편차를 줄이는 상수 시간 문자열 비교를 수행한다.
 */
export function constantTimeHexEquals(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let diff = 0;
  for (let i = 0; i < left.length; i += 1) {
    diff |= left.charCodeAt(i) ^ right.charCodeAt(i);
  }
  return diff === 0;
}
