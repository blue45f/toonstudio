/**
 * Wave 98 — 순수 ES2017 암호·직렬화·Merkle 기본 연산(외부 라이브러리 및 Node `crypto` 비의존).
 */

export type CentennialArchiveErrorCode =
  | "INVALID_MAGIC"
  | "UNSUPPORTED_VERSION"
  | "TRUNCATED_ARCHIVE"
  | "TRAILING_BYTES"
  | "HEADER_CRC_MISMATCH"
  | "BODY_CRC_MISMATCH"
  | "INVALID_CHUNK_KIND"
  | "INVALID_CHUNK_ENCODING"
  | "INVALID_CHUNK_OFFSET"
  | "DUPLICATE_CHUNK_ID"
  | "CHUNK_HASH_MISMATCH"
  | "MERKLE_ROOT_MISMATCH"
  | "MISSING_MANDATORY_ASSET"
  | "EXTERNAL_URL_FORBIDDEN"
  | "EMPTY_ARCHIVE"
  | "NON_FINITE_NUMBER"
  | "INVALID_MERKLE_INDEX"
  | "INVALID_UTF8";

export class CentennialArchiveError extends Error {
  readonly code: CentennialArchiveErrorCode;
  readonly offset: number | undefined;

  constructor(code: CentennialArchiveErrorCode, message: string, offset?: number) {
    super(message);
    this.name = "CentennialArchiveError";
    this.code = code;
    this.offset = offset;
  }
}

export interface CentennialMerkleProofStep {
  readonly position: "left" | "right";
  readonly siblingHashHex: string;
}

export interface CentennialMerkleTree {
  readonly leafCount: number;
  readonly rootHex: string;
  readonly rootBytes: Uint8Array;
  readonly levels: readonly (readonly string[])[];
}

export interface CentennialMerkleProof {
  readonly leafIndex: number;
  readonly leafCount: number;
  readonly leafHashHex: string;
  readonly rootHex: string;
  readonly steps: readonly CentennialMerkleProofStep[];
}

const HEX_CHARS = "0123456789abcdef";

/** 순수 UTF-8 인코더(서로게이트 쌍 포함, 호스트 TextEncoder 비의존). */
export function encodeUtf8Centennial(text: string): Uint8Array {
  const out: number[] = [];
  for (let i = 0; i < text.length; i += 1) {
    let code = text.charCodeAt(i);
    if (code >= 0xd800 && code <= 0xdbff && i + 1 < text.length) {
      const next = text.charCodeAt(i + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        code = ((code - 0xd800) << 10) + (next - 0xdc00) + 0x10000;
        i += 1;
      }
    }
    if (code <= 0x7f) {
      out.push(code);
    } else if (code <= 0x7ff) {
      out.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f));
    } else if (code <= 0xffff) {
      out.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
    } else {
      out.push(
        0xf0 | (code >> 18),
        0x80 | ((code >> 12) & 0x3f),
        0x80 | ((code >> 6) & 0x3f),
        0x80 | (code & 0x3f),
      );
    }
  }
  return new Uint8Array(out);
}

/** 순수 UTF-8 디코더(잘못된 시퀀스는 fail-closed 거부). */
export function decodeUtf8Centennial(bytes: Uint8Array): string {
  const parts: string[] = [];
  let i = 0;
  while (i < bytes.length) {
    const b0 = bytes[i];
    if (b0 < 0x80) {
      parts.push(String.fromCharCode(b0));
      i += 1;
    } else if ((b0 & 0xe0) === 0xc0) {
      if (i + 1 >= bytes.length || (bytes[i + 1] & 0xc0) !== 0x80) {
        throw new CentennialArchiveError("INVALID_UTF8", "잘못된 UTF-8 2바이트 시퀀스입니다.", i);
      }
      const cp = ((b0 & 0x1f) << 6) | (bytes[i + 1] & 0x3f);
      if (cp < 0x80) {
        throw new CentennialArchiveError("INVALID_UTF8", "비정규(overlong) UTF-8 시퀀스입니다.", i);
      }
      parts.push(String.fromCharCode(cp));
      i += 2;
    } else if ((b0 & 0xf0) === 0xe0) {
      if (i + 2 >= bytes.length || (bytes[i + 1] & 0xc0) !== 0x80 || (bytes[i + 2] & 0xc0) !== 0x80) {
        throw new CentennialArchiveError("INVALID_UTF8", "잘못된 UTF-8 3바이트 시퀀스입니다.", i);
      }
      const cp = ((b0 & 0x0f) << 12) | ((bytes[i + 1] & 0x3f) << 6) | (bytes[i + 2] & 0x3f);
      if (cp < 0x800 || (cp >= 0xd800 && cp <= 0xdfff)) {
        throw new CentennialArchiveError("INVALID_UTF8", "유효하지 않은 UTF-8 코드포인트입니다.", i);
      }
      parts.push(String.fromCharCode(cp));
      i += 3;
    } else if ((b0 & 0xf8) === 0xf0) {
      if (
        i + 3 >= bytes.length ||
        (bytes[i + 1] & 0xc0) !== 0x80 ||
        (bytes[i + 2] & 0xc0) !== 0x80 ||
        (bytes[i + 3] & 0xc0) !== 0x80
      ) {
        throw new CentennialArchiveError("INVALID_UTF8", "잘못된 UTF-8 4바이트 시퀀스입니다.", i);
      }
      const cp =
        ((b0 & 0x07) << 18) |
        ((bytes[i + 1] & 0x3f) << 12) |
        ((bytes[i + 2] & 0x3f) << 6) |
        (bytes[i + 3] & 0x3f);
      if (cp < 0x10000 || cp > 0x10ffff) {
        throw new CentennialArchiveError("INVALID_UTF8", "유효 범위를 벗어난 UTF-8 코드포인트입니다.", i);
      }
      const offset = cp - 0x10000;
      parts.push(String.fromCharCode(0xd800 + (offset >> 10), 0xdc00 + (offset & 0x3ff)));
      i += 4;
    } else {
      throw new CentennialArchiveError("INVALID_UTF8", "유효하지 않은 UTF-8 선행 바이트입니다.", i);
    }
  }
  return parts.join("");
}

export function bytesToHexCentennial(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i += 1) {
    const b = bytes[i];
    out += HEX_CHARS[b >>> 4] + HEX_CHARS[b & 0x0f];
  }
  return out;
}

export function hexToBytesCentennial(hex: string): Uint8Array {
  const clean = hex.toLowerCase();
  if (clean.length % 2 !== 0 || !/^[0-9a-f]*$/.test(clean)) {
    throw new CentennialArchiveError("CHUNK_HASH_MISMATCH", "유효하지 않은 16진수 문자열입니다.");
  }
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i += 1) {
    out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

export function constantTimeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

function toBytes(input: Uint8Array | string): Uint8Array {
  return typeof input === "string" ? encodeUtf8Centennial(input) : input;
}

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

/** FIPS 180-4 SHA-256(32바이트 출력). */
export function sha256CentennialBytes(input: Uint8Array | string): Uint8Array {
  const data = toBytes(input);
  const len = data.length;
  const totalLen = Math.ceil((len + 9) / 64) * 64;
  const padded = new Uint8Array(totalLen);
  padded.set(data, 0);
  padded[len] = 0x80;

  const view = new DataView(padded.buffer);
  view.setUint32(totalLen - 8, Math.floor((len * 8) / 0x100000000), false);
  view.setUint32(totalLen - 4, (len * 8) >>> 0, false);

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

    let [a, b, c, d, e, f, g, h] = [h0, h1, h2, h3, h4, h5, h6, h7];
    for (let i = 0; i < 64; i += 1) {
      const S1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7));
      const ch = (e & f) ^ (~e & g);
      const temp1 = (h + S1 + ch + SHA256_K[i] + w[i]) >>> 0;
      const S0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10));
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (S0 + maj) >>> 0;
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

  const out = new Uint8Array(32);
  const outView = new DataView(out.buffer);
  const words = [h0, h1, h2, h3, h4, h5, h6, h7];
  for (let i = 0; i < 8; i += 1) {
    outView.setUint32(i * 4, words[i], false);
  }
  return out;
}

/** FIPS 180-4 SHA-256 소문자 64자리 16진수 다이제스트. */
export function sha256CentennialHex(input: Uint8Array | string): string {
  return bytesToHexCentennial(sha256CentennialBytes(input));
}

/** RFC 2104 HMAC-SHA256(32바이트 출력). */
export function hmacSha256CentennialBytes(
  key: Uint8Array | string,
  message: Uint8Array | string,
): Uint8Array {
  const blockSize = 64;
  const rawKey = toBytes(key);
  const keyBlock = new Uint8Array(blockSize);
  keyBlock.set(rawKey.length > blockSize ? sha256CentennialBytes(rawKey) : rawKey, 0);

  const msgBytes = toBytes(message);
  const inner = new Uint8Array(blockSize + msgBytes.length);
  const outer = new Uint8Array(blockSize + 32);
  for (let i = 0; i < blockSize; i += 1) {
    inner[i] = keyBlock[i] ^ 0x36;
    outer[i] = keyBlock[i] ^ 0x5c;
  }
  inner.set(msgBytes, blockSize);
  outer.set(sha256CentennialBytes(inner), blockSize);
  return sha256CentennialBytes(outer);
}

/** RFC 2104 HMAC-SHA256 소문자 64자리 16진수 MAC. */
export function hmacSha256CentennialHex(
  key: Uint8Array | string,
  message: Uint8Array | string,
): string {
  return bytesToHexCentennial(hmacSha256CentennialBytes(key, message));
}

const CRC32_TABLE = ((): Uint32Array => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let c = i;
    for (let bit = 0; bit < 8; bit += 1) {
      c = (c & 1) !== 0 ? (0xedb88320 ^ (c >>> 1)) >>> 0 : c >>> 1;
    }
    table[i] = c >>> 0;
  }
  return table;
})();

/** IEEE 802.3 CRC-32(부호 없는 32비트 정수). */
export function crc32Centennial(input: Uint8Array | string): number {
  const data = toBytes(input);
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i += 1) {
    crc = CRC32_TABLE[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/** 키 정렬 정규 JSON 직렬화(비유한 수치 거부, -0 정규화). */
export function canonicalSerializeCentennial(value: unknown): string {
  if (value === null) {
    return "null";
  }
  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new CentennialArchiveError("NON_FINITE_NUMBER", "NaN 또는 Infinity는 직렬화할 수 없습니다.");
    }
    return Object.is(value, -0) ? "0" : String(value);
  }
  if (typeof value === "string") {
    return JSON.stringify(value);
  }
  if (value instanceof Uint8Array) {
    return JSON.stringify(bytesToHexCentennial(value));
  }
  if (Array.isArray(value)) {
    return `[${value.map((v) => (v === undefined ? "null" : canonicalSerializeCentennial(v))).join(",")}]`;
  }
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    const keys = Object.keys(record).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
    const entries: string[] = [];
    for (let i = 0; i < keys.length; i += 1) {
      const k = keys[i];
      if (record[k] !== undefined) {
        entries.push(`${JSON.stringify(k)}:${canonicalSerializeCentennial(record[k])}`);
      }
    }
    return `{${entries.join(",")}}`;
  }
  throw new CentennialArchiveError("NON_FINITE_NUMBER", `지원하지 않는 직렬화 형식: ${typeof value}`);
}

function hashMerkleLeafBytes(leafData: Uint8Array): Uint8Array {
  const buf = new Uint8Array(1 + leafData.length);
  buf[0] = 0x00;
  buf.set(leafData, 1);
  return sha256CentennialBytes(buf);
}

function hashMerkleInternalBytes(left: Uint8Array, right: Uint8Array): Uint8Array {
  const buf = new Uint8Array(65);
  buf[0] = 0x01;
  buf.set(left, 1);
  buf.set(right, 33);
  return sha256CentennialBytes(buf);
}

/** 도메인 분리(0x00 리프 / 0x01 내부 노드) 이진 Merkle 트리 생성. */
export function buildCentennialMerkleTree(leaves: readonly Uint8Array[]): CentennialMerkleTree {
  if (leaves.length === 0) {
    throw new CentennialArchiveError("EMPTY_ARCHIVE", "Merkle 트리를 생성할 리프 데이터가 비어 있습니다.");
  }
  let currentLevel: Uint8Array[] = leaves.map((leaf) => hashMerkleLeafBytes(leaf));
  const levels: string[][] = [currentLevel.map((b) => bytesToHexCentennial(b))];

  while (currentLevel.length > 1) {
    const nextLevel: Uint8Array[] = [];
    for (let i = 0; i < currentLevel.length; i += 2) {
      nextLevel.push(
        i + 1 < currentLevel.length
          ? hashMerkleInternalBytes(currentLevel[i], currentLevel[i + 1])
          : currentLevel[i],
      );
    }
    currentLevel = nextLevel;
    levels.push(currentLevel.map((b) => bytesToHexCentennial(b)));
  }

  const rootBytes = currentLevel[0];
  return { leafCount: leaves.length, rootHex: bytesToHexCentennial(rootBytes), rootBytes, levels };
}

/** 특정 리프 인덱스에 대한 Merkle 포함 증명 생성. */
export function generateCentennialMerkleProof(
  tree: CentennialMerkleTree,
  leafIndex: number,
): CentennialMerkleProof {
  if (!Number.isInteger(leafIndex) || leafIndex < 0 || leafIndex >= tree.leafCount) {
    throw new CentennialArchiveError("INVALID_MERKLE_INDEX", `유효하지 않은 리프 인덱스: ${leafIndex}`);
  }
  const steps: CentennialMerkleProofStep[] = [];
  let idx = leafIndex;
  for (let levelIdx = 0; levelIdx < tree.levels.length - 1; levelIdx += 1) {
    const level = tree.levels[levelIdx];
    const isRightNode = idx % 2 === 1;
    const siblingIdx = isRightNode ? idx - 1 : idx + 1;
    if (siblingIdx < level.length) {
      steps.push({ position: isRightNode ? "left" : "right", siblingHashHex: level[siblingIdx] });
    }
    idx = Math.floor(idx / 2);
  }
  return {
    leafIndex,
    leafCount: tree.leafCount,
    leafHashHex: tree.levels[0][leafIndex],
    rootHex: tree.rootHex,
    steps,
  };
}

/** Merkle 포함 증명 검증(리프·형제 해시 1바이트 변조 즉시 거부). */
export function verifyCentennialMerkleProof(
  leafData: Uint8Array,
  proof: CentennialMerkleProof,
  expectedRootHex?: string,
): boolean {
  if (proof.leafCount <= 0 || proof.leafIndex < 0 || proof.leafIndex >= proof.leafCount) {
    return false;
  }
  let current = hashMerkleLeafBytes(leafData);
  if (!constantTimeEqualHex(bytesToHexCentennial(current), proof.leafHashHex)) {
    return false;
  }
  for (let i = 0; i < proof.steps.length; i += 1) {
    const step = proof.steps[i];
    if (step.siblingHashHex.length !== 64 || !/^[0-9a-f]{64}$/.test(step.siblingHashHex)) {
      return false;
    }
    const siblingBytes = hexToBytesCentennial(step.siblingHashHex);
    current =
      step.position === "left"
        ? hashMerkleInternalBytes(siblingBytes, current)
        : hashMerkleInternalBytes(current, siblingBytes);
  }
  const computedRoot = bytesToHexCentennial(current);
  if (!constantTimeEqualHex(computedRoot, proof.rootHex)) {
    return false;
  }
  return expectedRootHex === undefined || constantTimeEqualHex(computedRoot, expectedRootHex);
}
