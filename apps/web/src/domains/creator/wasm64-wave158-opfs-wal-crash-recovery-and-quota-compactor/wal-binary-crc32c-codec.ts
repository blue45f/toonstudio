/**
 * Wave 158 — Castagnoli CRC-32C(`0x82f63b78`) 바이너리 WAL 프레임 코덱 및
 * 순수 TypeScript FIPS 180-4 SHA-256 무결성 증명 엔진.
 *
 * - 외부 비동기 WebCrypto 의존 없이 브라우저·워커·Vitest 어디서나 동기 결정론 동작
 * - 헤더 32B(매직·버전·연산코드·64비트 LSN·txId·64비트 타임스탬프·페이로드 길이)
 *   + 페이로드 + 4B Castagnoli CRC-32C 푸터 구조로 단일 비트 변조와 끝단 잘림을 즉시 검출
 */

import {
  WAL_CODE_TO_OP_TYPE,
  WAL_CRC_FOOTER_BYTES,
  WAL_FORMAT_VERSION,
  WAL_FRAME_MAGIC,
  WAL_FRAME_OVERHEAD_BYTES,
  WAL_HEADER_BYTES,
  WAL_MAX_PAYLOAD_BYTES,
  WAL_OP_TYPE_TO_CODE,
  type WalFrameDecodeResult,
  type WalFrameInput,
  type WalFrameRecord,
  type WalStreamScanResult,
} from "./wal-recovery-types";

const CRC32C_REFLECTED_POLY = 0x82f63b78;
const UINT32_MODULO = 4294967296;

const CRC32C_TABLE: Uint32Array = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let crc = i;
    for (let bit = 0; bit < 8; bit += 1) {
      if ((crc & 1) !== 0) {
        crc = (crc >>> 1) ^ CRC32C_REFLECTED_POLY;
      } else {
        crc = crc >>> 1;
      }
    }
    table[i] = crc >>> 0;
  }
  return table;
})();

const SHA256_K: Uint32Array = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

const SHA256_H0: readonly number[] = [
  0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
  0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
];

const TEXT_ENCODER = new TextEncoder();
const TEXT_DECODER = new TextDecoder("utf-8", { fatal: true });

function rotr32(value: number, bits: number): number {
  return ((value >>> bits) | (value << (32 - bits))) >>> 0;
}

function assertNonNegativeSafeInteger(value: number, fieldName: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${fieldName} 값은 0 이상의 안전한 정수여야 합니다: ${String(value)}`);
  }
}

function writeUint64SafeBE(view: DataView, offset: number, value: number): void {
  assertNonNegativeSafeInteger(value, "uint64");
  const hi = Math.floor(value / UINT32_MODULO) >>> 0;
  const lo = (value - hi * UINT32_MODULO) >>> 0;
  view.setUint32(offset, hi, false);
  view.setUint32(offset + 4, lo, false);
}

function readUint64SafeBE(view: DataView, offset: number): number {
  const hi = view.getUint32(offset, false);
  const lo = view.getUint32(offset + 4, false);
  return hi * UINT32_MODULO + lo;
}

/**
 * Castagnoli CRC-32C (`0x82f63b78`) 체크섬을 계산한다.
 * `seed`를 전달하면 이전 청크의 CRC에 이어 스트리밍 누산할 수 있다.
 */
export function computeCrc32c(bytes: Uint8Array, seed = 0): number {
  let crc = (~(seed >>> 0)) >>> 0;
  for (let i = 0; i < bytes.length; i += 1) {
    const idx = (crc ^ bytes[i]) & 0xff;
    crc = ((crc >>> 8) ^ CRC32C_TABLE[idx]) >>> 0;
  }
  return (~crc) >>> 0;
}

/**
 * 순수 TypeScript FIPS 180-4 SHA-256 해시(소문자 64자 16진수)를 계산한다.
 */
export function computeSha256Hex(bytes: Uint8Array): string {
  const msgLen = bytes.length;
  const bitLenHi = Math.floor(msgLen / 0x20000000) >>> 0;
  const bitLenLo = ((msgLen << 3) >>> 0);

  const paddedLen = Math.ceil((msgLen + 9) / 64) * 64;
  const padded = new Uint8Array(paddedLen);
  padded.set(bytes, 0);
  padded[msgLen] = 0x80;

  const padView = new DataView(padded.buffer, padded.byteOffset, padded.byteLength);
  padView.setUint32(paddedLen - 8, bitLenHi, false);
  padView.setUint32(paddedLen - 4, bitLenLo, false);

  let h0 = SHA256_H0[0];
  let h1 = SHA256_H0[1];
  let h2 = SHA256_H0[2];
  let h3 = SHA256_H0[3];
  let h4 = SHA256_H0[4];
  let h5 = SHA256_H0[5];
  let h6 = SHA256_H0[6];
  let h7 = SHA256_H0[7];

  const w = new Uint32Array(64);

  for (let offset = 0; offset < paddedLen; offset += 64) {
    for (let i = 0; i < 16; i += 1) {
      w[i] = padView.getUint32(offset + i * 4, false);
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

  const words = [h0, h1, h2, h3, h4, h5, h6, h7];
  let hex = "";
  for (let i = 0; i < words.length; i += 1) {
    hex += words[i].toString(16).padStart(8, "0");
  }
  return hex;
}

/** UTF-8 문자열의 FIPS 180-4 SHA-256 16진수 다이제스트를 계산한다. */
export function computeSha256Utf8Hex(text: string): string {
  return computeSha256Hex(TEXT_ENCODER.encode(text));
}

function normalizeForCanonicalJson(value: unknown): unknown {
  if (value === null || typeof value !== "object") {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => normalizeForCanonicalJson(item));
  }
  const source = value as Record<string, unknown>;
  const sortedKeys = Object.keys(source).sort();
  const normalized: Record<string, unknown> = {};
  for (let i = 0; i < sortedKeys.length; i += 1) {
    const key = sortedKeys[i];
    const entry = source[key];
    if (entry !== undefined) {
      normalized[key] = normalizeForCanonicalJson(entry);
    }
  }
  return normalized;
}

/** 키 정렬이 보장되는 결정론적 정규 JSON 직렬화 문자열을 만든다. */
export function canonicalJsonStringify(value: unknown): string {
  return JSON.stringify(normalizeForCanonicalJson(value));
}

/** 구조화된 페이로드 객체를 UTF-8 정규 JSON 바이트로 인코딩한다. */
export function encodeJsonPayload(value: unknown): Uint8Array {
  return TEXT_ENCODER.encode(canonicalJsonStringify(value));
}

/** UTF-8 JSON 페이로드 바이트를 안전하게 파싱한다. */
export function decodeJsonPayload(payload: Uint8Array): unknown {
  if (payload.length === 0) {
    return {};
  }
  const text = TEXT_DECODER.decode(payload);
  return JSON.parse(text) as unknown;
}

/**
 * 단일 WAL 레코드를 고정 헤더 + 페이로드 + Castagnoli CRC-32C 푸터 바이너리 프레임으로 인코딩한다.
 */
export function encodeWalFrame(input: WalFrameInput): Uint8Array {
  const version = input.version ?? WAL_FORMAT_VERSION;
  if (!Number.isInteger(version) || version < 0 || version > 0xffff) {
    throw new RangeError(`WAL 버전은 0~65535 범위의 정수여야 합니다: ${String(version)}`);
  }
  assertNonNegativeSafeInteger(input.lsn, "lsn");
  assertNonNegativeSafeInteger(input.timestampMs, "timestampMs");
  if (!Number.isInteger(input.txId) || input.txId < 0 || input.txId > 0xffffffff) {
    throw new RangeError(`txId는 부호 없는 32비트 정수여야 합니다: ${String(input.txId)}`);
  }
  const payloadLength = input.payload.length;
  if (payloadLength > WAL_MAX_PAYLOAD_BYTES) {
    throw new RangeError(
      `페이로드 크기(${String(payloadLength)}B)가 상한(${String(WAL_MAX_PAYLOAD_BYTES)}B)을 넘었습니다.`
    );
  }

  const opCode = WAL_OP_TYPE_TO_CODE[input.opType];
  const totalBytes = WAL_FRAME_OVERHEAD_BYTES + payloadLength;
  const frame = new Uint8Array(totalBytes);
  const view = new DataView(frame.buffer, frame.byteOffset, frame.byteLength);

  view.setUint32(0, WAL_FRAME_MAGIC, false);
  view.setUint16(4, version, false);
  view.setUint16(6, opCode, false);
  writeUint64SafeBE(view, 8, input.lsn);
  view.setUint32(16, input.txId >>> 0, false);
  writeUint64SafeBE(view, 20, input.timestampMs);
  view.setUint32(28, payloadLength >>> 0, false);

  frame.set(input.payload, WAL_HEADER_BYTES);

  const crcOffset = WAL_HEADER_BYTES + payloadLength;
  const crc = computeCrc32c(frame.subarray(0, crcOffset));
  view.setUint32(crcOffset, crc, false);

  return frame;
}

/** 여러 WAL 프레임 입력을 하나의 연속 바이너리 스트림으로 연결 인코딩한다. */
export function encodeWalStream(inputs: readonly WalFrameInput[]): Uint8Array {
  const encodedFrames: Uint8Array[] = [];
  let totalBytes = 0;
  for (let i = 0; i < inputs.length; i += 1) {
    const frame = encodeWalFrame(inputs[i]);
    encodedFrames.push(frame);
    totalBytes += frame.length;
  }

  const stream = new Uint8Array(totalBytes);
  let cursor = 0;
  for (let i = 0; i < encodedFrames.length; i += 1) {
    stream.set(encodedFrames[i], cursor);
    cursor += encodedFrames[i].length;
  }
  return stream;
}

/**
 * 바이너리 WAL 스트림의 지정 오프셋에서 단일 프레임을 디코딩하고 CRC-32C를 검증한다.
 */
export function decodeWalFrameAt(
  stream: Uint8Array,
  byteOffset: number
): WalFrameDecodeResult {
  const remaining = stream.length - byteOffset;
  if (remaining < WAL_HEADER_BYTES) {
    return {
      ok: false,
      reason: "truncated_header",
      byteOffset,
      detail: `헤더가 불완전하게 끝났습니다(잔여 ${String(remaining)}B / 필요 ${String(WAL_HEADER_BYTES)}B).`,
    };
  }

  const view = new DataView(stream.buffer, stream.byteOffset + byteOffset, remaining);
  const magic = view.getUint32(0, false);
  if (magic !== WAL_FRAME_MAGIC) {
    return {
      ok: false,
      reason: "magic_mismatch",
      byteOffset,
      detail: `WAL 매직 불일치(기대 0x${WAL_FRAME_MAGIC.toString(16)}, 실제 0x${magic.toString(16)}).`,
    };
  }

  const version = view.getUint16(4, false);
  if (version !== WAL_FORMAT_VERSION) {
    return {
      ok: false,
      reason: "unsupported_version",
      byteOffset,
      detail: `지원하지 않는 WAL 포맷 버전입니다(버전 ${String(version)}).`,
    };
  }

  const opCode = view.getUint16(6, false);
  const lsn = readUint64SafeBE(view, 8);
  const txId = view.getUint32(16, false);
  const timestampMs = readUint64SafeBE(view, 20);
  const payloadLength = view.getUint32(28, false);

  if (payloadLength > WAL_MAX_PAYLOAD_BYTES) {
    return {
      ok: false,
      reason: "crc_mismatch",
      byteOffset,
      detail: `페이로드 길이 필드(${String(payloadLength)}B)가 허용 상한을 초과해 헤더 손상으로 판정했습니다.`,
    };
  }

  const payloadEndRelative = WAL_HEADER_BYTES + payloadLength;
  if (remaining < payloadEndRelative) {
    return {
      ok: false,
      reason: "truncated_payload",
      byteOffset,
      detail: `페이로드가 중간에 끊겼습니다(잔여 ${String(remaining - WAL_HEADER_BYTES)}B / 기대 ${String(payloadLength)}B).`,
    };
  }

  const frameTotalBytes = payloadEndRelative + WAL_CRC_FOOTER_BYTES;
  if (remaining < frameTotalBytes) {
    return {
      ok: false,
      reason: "truncated_crc",
      byteOffset,
      detail: `CRC-32C 푸터가 불완전합니다(잔여 ${String(remaining - payloadEndRelative)}B / 필요 ${String(WAL_CRC_FOOTER_BYTES)}B).`,
    };
  }

  const storedCrc = view.getUint32(payloadEndRelative, false);
  const computedCrc = computeCrc32c(
    stream.subarray(byteOffset, byteOffset + payloadEndRelative)
  );
  if (storedCrc !== computedCrc) {
    return {
      ok: false,
      reason: "crc_mismatch",
      byteOffset,
      expectedCrc32c: storedCrc,
      actualCrc32c: computedCrc,
      detail: `CRC-32C 불일치(기록 0x${storedCrc.toString(16).padStart(8, "0")}, 계산 0x${computedCrc.toString(16).padStart(8, "0")}).`,
    };
  }

  const opType = WAL_CODE_TO_OP_TYPE[opCode];
  if (!opType) {
    return {
      ok: false,
      reason: "invalid_op_type",
      byteOffset,
      detail: `알 수 없는 WAL 연산 코드입니다(code=${String(opCode)}).`,
    };
  }

  const payloadCopy = stream.slice(
    byteOffset + WAL_HEADER_BYTES,
    byteOffset + payloadEndRelative
  );

  const record: WalFrameRecord = {
    version,
    lsn,
    txId,
    opType,
    timestampMs,
    payload: payloadCopy,
    byteOffset,
    byteLength: frameTotalBytes,
    crc32c: storedCrc,
  };

  return {
    ok: true,
    record,
    nextOffset: byteOffset + frameTotalBytes,
  };
}

/**
 * 바이너리 WAL 스트림 전체를 앞에서부터 순차 스캔한다.
 * - EOF 끝단 잘림(torn write)은 마지막 정상 바이트 오프셋으로 안전 절단한다.
 * - 중간 프레임 손상(CRC 불일치·매직 불일치·버전 불일치)은 즉시 Fail-Closed 중단한다.
 */
export function scanWalStream(stream: Uint8Array): WalStreamScanResult {
  const records: WalFrameRecord[] = [];
  let offset = 0;
  let lastValidLsn = 0;

  while (offset < stream.length) {
    const decoded = decodeWalFrameAt(stream, offset);
    if (decoded.ok) {
      records.push(decoded.record);
      lastValidLsn = decoded.record.lsn;
      offset = decoded.nextOffset;
      continue;
    }

    if (
      decoded.reason === "truncated_header" ||
      decoded.reason === "truncated_payload" ||
      decoded.reason === "truncated_crc"
    ) {
      return {
        records,
        totalInputBytes: stream.length,
        validByteEndOffset: offset,
        truncatedTailBytes: stream.length - offset,
        tornWriteDetected: true,
        tornWriteReason: decoded.reason,
        corruptionStop: null,
      };
    }

    return {
      records,
      totalInputBytes: stream.length,
      validByteEndOffset: offset,
      truncatedTailBytes: 0,
      tornWriteDetected: false,
      tornWriteReason: null,
      corruptionStop: {
        reason: decoded.reason,
        byteOffset: decoded.byteOffset,
        lsnBeforeCorruption: lastValidLsn,
        detail: decoded.detail,
        expectedCrc32c: decoded.expectedCrc32c,
        actualCrc32c: decoded.actualCrc32c,
      },
    };
  }

  return {
    records,
    totalInputBytes: stream.length,
    validByteEndOffset: offset,
    truncatedTailBytes: 0,
    tornWriteDetected: false,
    tornWriteReason: null,
    corruptionStop: null,
  };
}
