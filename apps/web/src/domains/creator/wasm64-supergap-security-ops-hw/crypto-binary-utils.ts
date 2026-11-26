/**
 * Super-Gap Security · Ops · Hardware 공용 암호·바이너리 유틸리티(₩0 로컬).
 *
 * - FIPS 180-4 SHA-256 순수 동기 구현(WOTS+ 1,000+ 해시 체인 연산을 마이크로태스크 지연 없이 처리)
 * - WebCrypto AES-GCM-256 암복호화 및 결정론적 캐노니컬 JSON 직렬화
 * - 외부 서버·Node 전용 Buffer 의존성 없이 ES2017 브라우저/워커/테스트 환경에서 동일 동작
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

const BASE64URL_ALPHABET =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

const TEXT_ENCODER = new TextEncoder();
const TEXT_DECODER = new TextDecoder();

/** 32비트 우회전 연산. */
function rotr32(value: number, bits: number): number {
  return ((value >>> bits) | (value << (32 - bits))) >>> 0;
}

/** FIPS 180-4 SHA-256 다이제스트(32바이트) 동기 계산. */
export function sha256Bytes(message: Uint8Array): Uint8Array {
  const msgLen = message.byteLength;
  const paddedLen = Math.ceil((msgLen + 9) / 64) * 64;
  const padded = new Uint8Array(paddedLen);
  padded.set(message, 0);
  padded[msgLen] = 0x80;

  const view = new DataView(padded.buffer);
  const bitLenHigh = Math.floor(msgLen / 0x20000000) >>> 0;
  const bitLenLow = (msgLen << 3) >>> 0;
  view.setUint32(paddedLen - 8, bitLenHigh, false);
  view.setUint32(paddedLen - 4, bitLenLow, false);

  let h0 = 0x6a09e667;
  let h1 = 0xbb67ae85;
  let h2 = 0x3c6ef372;
  let h3 = 0xa54ff53a;
  let h4 = 0x510e527f;
  let h5 = 0x9b05688c;
  let h6 = 0x1f83d9ab;
  let h7 = 0x5be0cd19;

  const w = new Uint32Array(64);

  for (let offset = 0; offset < paddedLen; offset += 64) {
    for (let i = 0; i < 16; i += 1) {
      w[i] = view.getUint32(offset + i * 4, false);
    }
    for (let i = 16; i < 64; i += 1) {
      const w15 = w[i - 15];
      const w2 = w[i - 2];
      const s0 = (rotr32(w15, 7) ^ rotr32(w15, 18) ^ (w15 >>> 3)) >>> 0;
      const s1 = (rotr32(w2, 17) ^ rotr32(w2, 19) ^ (w2 >>> 10)) >>> 0;
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
      const ch = ((e & f) ^ (~e & g)) >>> 0;
      const temp1 = (h + s1 + ch + SHA256_K[i] + w[i]) >>> 0;
      const s0 = (rotr32(a, 2) ^ rotr32(a, 13) ^ rotr32(a, 22)) >>> 0;
      const maj = ((a & b) ^ (a & c) ^ (b & c)) >>> 0;
      const temp2 = (s0 + maj) >>> 0;

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

/** SHA-256 소문자 16진수 문자열 반환. */
export function sha256Hex(message: Uint8Array): string {
  return bytesToHex(sha256Bytes(message));
}

/** 바이트 배열을 소문자 16진수 문자열로 변환. */
export function bytesToHex(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.byteLength; i += 1) {
    const byte = bytes[i];
    out += (byte < 16 ? "0" : "") + byte.toString(16);
  }
  return out;
}

/** 16진수 문자열을 바이트 배열로 복원. */
export function hexToBytes(hex: string): Uint8Array {
  const normalized = hex.trim();
  if (normalized.length % 2 !== 0) {
    throw new Error("유효하지 않은 16진수 문자열 길이입니다.");
  }
  const out = new Uint8Array(normalized.length / 2);
  for (let i = 0; i < out.byteLength; i += 1) {
    const parsed = Number.parseInt(normalized.slice(i * 2, i * 2 + 2), 16);
    if (Number.isNaN(parsed)) {
      throw new Error(`유효하지 않은 16진수 바이트가 포함되어 있습니다(위치 ${i * 2}).`);
    }
    out[i] = parsed;
  }
  return out;
}

/** RFC 4648 패딩 없는 Base64URL 인코딩. */
export function bytesToBase64Url(bytes: Uint8Array): string {
  let out = "";
  let i = 0;
  while (i < bytes.byteLength) {
    const b0 = bytes[i];
    const hasB1 = i + 1 < bytes.byteLength;
    const hasB2 = i + 2 < bytes.byteLength;
    const b1 = hasB1 ? bytes[i + 1] : 0;
    const b2 = hasB2 ? bytes[i + 2] : 0;
    const triple = (b0 << 16) | (b1 << 8) | b2;

    out += BASE64URL_ALPHABET[(triple >>> 18) & 0x3f];
    out += BASE64URL_ALPHABET[(triple >>> 12) & 0x3f];
    if (hasB1) {
      out += BASE64URL_ALPHABET[(triple >>> 6) & 0x3f];
    }
    if (hasB2) {
      out += BASE64URL_ALPHABET[triple & 0x3f];
    }
    i += 3;
  }
  return out;
}

/** RFC 4648 패딩 없는 Base64URL 디코딩. */
export function base64UrlToBytes(encoded: string): Uint8Array {
  const clean = encoded.replace(/=+$/u, "");
  if (clean.length % 4 === 1) {
    throw new Error("유효하지 않은 Base64URL 문자열 길이입니다.");
  }
  const outputLen = Math.floor((clean.length * 3) / 4);
  const out = new Uint8Array(outputLen);
  let outIdx = 0;

  for (let i = 0; i < clean.length; i += 4) {
    const c0 = BASE64URL_ALPHABET.indexOf(clean[i]);
    const c1 = BASE64URL_ALPHABET.indexOf(clean[i + 1]);
    const c2 = i + 2 < clean.length ? BASE64URL_ALPHABET.indexOf(clean[i + 2]) : 0;
    const c3 = i + 3 < clean.length ? BASE64URL_ALPHABET.indexOf(clean[i + 3]) : 0;
    if (c0 < 0 || c1 < 0 || c2 < 0 || c3 < 0) {
      throw new Error("유효하지 않은 Base64URL 문자가 포함되어 있습니다.");
    }
    const triple = (c0 << 18) | (c1 << 12) | (c2 << 6) | c3;
    if (outIdx < outputLen) {
      out[outIdx] = (triple >>> 16) & 0xff;
      outIdx += 1;
    }
    if (outIdx < outputLen) {
      out[outIdx] = (triple >>> 8) & 0xff;
      outIdx += 1;
    }
    if (outIdx < outputLen) {
      out[outIdx] = triple & 0xff;
      outIdx += 1;
    }
  }
  return out;
}

/** 여러 Uint8Array 조각을 하나로 연결. */
export function concatBytes(parts: readonly Uint8Array[]): Uint8Array {
  let total = 0;
  for (let i = 0; i < parts.length; i += 1) {
    total += parts[i].byteLength;
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (let i = 0; i < parts.length; i += 1) {
    out.set(parts[i], offset);
    offset += parts[i].byteLength;
  }
  return out;
}

/** 상수 시간 바이트 동등성 비교(타이밍 부채널 완화). */
export function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.byteLength !== b.byteLength) {
    return false;
  }
  let diff = 0;
  for (let i = 0; i < a.byteLength; i += 1) {
    diff |= a[i] ^ b[i];
  }
  return diff === 0;
}

/** UTF-8 인코딩. */
export function utf8Encode(text: string): Uint8Array {
  return TEXT_ENCODER.encode(text);
}

/** UTF-8 디코딩. */
export function utf8Decode(bytes: Uint8Array): string {
  return TEXT_DECODER.decode(bytes);
}

/** WebCrypto BufferSource 호환을 위한 순수 ArrayBuffer 사본 생성. */
export function toStrictArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(copy).set(bytes);
  return copy;
}

/** 키 정렬을 보장하는 캐노니컬 JSON 직렬화 문자열 생성. */
export function canonicalJsonString(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalJsonString(item)).join(",")}]`;
  }
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record)
    .filter((key) => record[key] !== undefined)
    .sort();
  const pairs = keys.map((key) => `${JSON.stringify(key)}:${canonicalJsonString(record[key])}`);
  return `{${pairs.join(",")}}`;
}

/** 캐노니컬 JSON을 UTF-8 바이트로 변환. */
export function canonicalJsonBytes(value: unknown): Uint8Array {
  return utf8Encode(canonicalJsonString(value));
}

/** 전역 WebCrypto 인스턴스 반환. */
export function getCryptoApi(): Crypto {
  const cryptoApi = globalThis.crypto;
  if (!cryptoApi || !cryptoApi.subtle) {
    throw new Error("WebCrypto API(crypto.subtle)를 사용할 수 없는 환경입니다.");
  }
  return cryptoApi;
}

/** 암호학적으로 안전한 난수 바이트 생성. */
export function randomBytes(length: number): Uint8Array {
  const out = new Uint8Array(length);
  getCryptoApi().getRandomValues(out);
  return out;
}

export interface AesGcmCipherEnvelope {
  readonly algorithm: "AES-GCM-256";
  readonly ivBase64Url: string;
  readonly ciphertextBase64Url: string;
  readonly aadUtf8: string;
}

/** 32바이트 원시 키로 AES-GCM-256 암호화 수행. */
export async function encryptAesGcm256(
  plaintext: Uint8Array,
  rawKey32: Uint8Array,
  aadUtf8: string,
): Promise<AesGcmCipherEnvelope> {
  if (rawKey32.byteLength !== 32) {
    throw new Error("AES-GCM-256 키는 정확히 32바이트여야 합니다.");
  }
  const cryptoApi = getCryptoApi();
  const key = await cryptoApi.subtle.importKey(
    "raw",
    toStrictArrayBuffer(rawKey32),
    { name: "AES-GCM" },
    false,
    ["encrypt"],
  );
  const iv = randomBytes(12);
  const aadBytes = utf8Encode(aadUtf8);
  const encrypted = await cryptoApi.subtle.encrypt(
    {
      name: "AES-GCM",
      iv: toStrictArrayBuffer(iv),
      additionalData: toStrictArrayBuffer(aadBytes),
      tagLength: 128,
    },
    key,
    toStrictArrayBuffer(plaintext),
  );
  return {
    algorithm: "AES-GCM-256",
    ivBase64Url: bytesToBase64Url(iv),
    ciphertextBase64Url: bytesToBase64Url(new Uint8Array(encrypted)),
    aadUtf8,
  };
}

/** 32바이트 원시 키로 AES-GCM-256 복호화 및 AAD 무결성 검증 수행. */
export async function decryptAesGcm256(
  envelope: AesGcmCipherEnvelope,
  rawKey32: Uint8Array,
  expectedAadUtf8: string,
): Promise<Uint8Array> {
  if (rawKey32.byteLength !== 32) {
    throw new Error("AES-GCM-256 키는 정확히 32바이트여야 합니다.");
  }
  if (envelope.aadUtf8 !== expectedAadUtf8) {
    throw new Error("AES-GCM AAD 컨텍스트가 일치하지 않습니다.");
  }
  const cryptoApi = getCryptoApi();
  const key = await cryptoApi.subtle.importKey(
    "raw",
    toStrictArrayBuffer(rawKey32),
    { name: "AES-GCM" },
    false,
    ["decrypt"],
  );
  const iv = base64UrlToBytes(envelope.ivBase64Url);
  const ciphertext = base64UrlToBytes(envelope.ciphertextBase64Url);
  const aadBytes = utf8Encode(expectedAadUtf8);
  const plainBuffer = await cryptoApi.subtle.decrypt(
    {
      name: "AES-GCM",
      iv: toStrictArrayBuffer(iv),
      additionalData: toStrictArrayBuffer(aadBytes),
      tagLength: 128,
    },
    key,
    toStrictArrayBuffer(ciphertext),
  );
  return new Uint8Array(plainBuffer);
}
