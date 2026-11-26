/**
 * 서버리스 콘텐츠 정의 청킹(Gear / Rabin-Karp 롤링 해시) 회차 델타 패키저.
 *
 * - 대용량 웹툰 회차 번들을 내용 경계 기반 가변 크기 청크(`4 KiB .. 64 KiB`)로 분할해
 *   앞쪽 컷 일부만 수정해도 뒤쪽 모든 청크 경계가 밀리지 않고 즉시 재동기화된다.
 * - 순수 클라이언트 연산(서버 비용 `₩0`)으로 FIPS 180-4 SHA-256 및 64비트 FNV-1a 매니페스트를
 *   생성하고, 변경된 청크만 담는 소형 바이너리 델타 패치(`TCDC` 포맷)를 방출한다.
 * - 패치 적용 시 원본 SHA-256, 개별 청크 해시, 최종 복원 바이트 전체 SHA-256을 3중 검증해
 *   비트 단위로 완전히 일치하는 회차 바이트열을 복원한다.
 */

export const CDC_DEFAULT_MIN_CHUNK_BYTES = 4 * 1024;
export const CDC_DEFAULT_AVG_CHUNK_BYTES = 16 * 1024;
export const CDC_DEFAULT_MAX_CHUNK_BYTES = 64 * 1024;

export type RollingHashAlgorithm = "gear" | "rabin-karp";

export interface CdcChunkerOptions {
  readonly minChunkBytes?: number;
  readonly avgChunkBytes?: number;
  readonly maxChunkBytes?: number;
  readonly algorithm?: RollingHashAlgorithm;
}

export interface EpisodeChunkDescriptor {
  readonly chunkIndex: number;
  readonly offset: number;
  readonly byteLength: number;
  readonly sha256Hex: string;
  readonly fnv1a64Hex: string;
}

export interface EpisodeChunkManifest {
  readonly algorithm: RollingHashAlgorithm;
  readonly totalBytes: number;
  readonly wholeFileSha256Hex: string;
  readonly wholeFileFnv1a64Hex: string;
  readonly uniqueChunkCount: number;
  readonly chunks: readonly EpisodeChunkDescriptor[];
  readonly serverCostKrw: 0;
}

export interface EpisodeDeltaPatchResult {
  readonly patchBytes: Uint8Array;
  readonly baseBytesCount: number;
  readonly targetBytesCount: number;
  readonly patchBytesCount: number;
  readonly reusedBaseBytes: number;
  readonly deduplicatedTargetBytes: number;
  readonly transmittedLiteralBytes: number;
  readonly reusedChunkCount: number;
  readonly literalChunkCount: number;
  readonly bandwidthSavingsRatio: number;
  readonly targetManifest: EpisodeChunkManifest;
  readonly serverCostKrw: 0;
}

export interface ReconstructedEpisodeResult {
  readonly targetBytes: Uint8Array;
  readonly verified: true;
  readonly wholeFileSha256Hex: string;
  readonly wholeFileFnv1a64Hex: string;
  readonly appliedInstructionCount: number;
  readonly serverCostKrw: 0;
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

const SHA256_INIT = new Uint32Array([
  0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
  0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
]);

const HEX_TABLE: readonly string[] = Array.from({ length: 256 }, (_, i) =>
  i.toString(16).padStart(2, "0"),
);

const GEAR_TABLE: Uint32Array = (() => {
  const table = new Uint32Array(256);
  let state = 0x243f6a88;
  for (let i = 0; i < 256; i += 1) {
    state = (state + 0x9e3779b9) >>> 0;
    let z = state;
    z = Math.imul(z ^ (z >>> 16), 0x85ebca6b) >>> 0;
    z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35) >>> 0;
    table[i] = (z ^ (z >>> 16)) >>> 0;
  }
  return table;
})();

const RABIN_KARP_WINDOW = 48;
const RABIN_KARP_BASE = 257;
const RABIN_KARP_HIGH_POW: number = (() => {
  let p = 1;
  for (let i = 0; i < RABIN_KARP_WINDOW - 1; i += 1) {
    p = Math.imul(p, RABIN_KARP_BASE) >>> 0;
  }
  return p;
})();

const PATCH_MAGIC_0 = 0x54; // 'T'
const PATCH_MAGIC_1 = 0x43; // 'C'
const PATCH_MAGIC_2 = 0x44; // 'D'
const PATCH_MAGIC_3 = 0x43; // 'C'
const PATCH_FORMAT_VERSION = 0x01;
const PATCH_HEADER_BYTES = 81;

const OP_COPY_BASE = 0x01;
const OP_INSERT_LITERAL = 0x02;
const OP_COPY_TARGET = 0x03;

function rotr32(x: number, n: number): number {
  return ((x >>> n) | (x << (32 - n))) >>> 0;
}

function bytesToHex(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i += 1) {
    out += HEX_TABLE[bytes[i]!]!;
  }
  return out;
}

/**
 * FIPS 180-4 표준 SHA-256 다이제스트(32바이트)를 동기 계산한다.
 */
export function computeSha256Bytes(
  data: Uint8Array,
  byteOffset = 0,
  byteLength = data.byteLength - byteOffset,
): Uint8Array {
  let h0 = SHA256_INIT[0]!;
  let h1 = SHA256_INIT[1]!;
  let h2 = SHA256_INIT[2]!;
  let h3 = SHA256_INIT[3]!;
  let h4 = SHA256_INIT[4]!;
  let h5 = SHA256_INIT[5]!;
  let h6 = SHA256_INIT[6]!;
  let h7 = SHA256_INIT[7]!;

  const rem = byteLength % 64;
  const padZeroCount = rem < 56 ? 55 - rem : 119 - rem;
  const paddedLen = byteLength + 1 + padZeroCount + 8;
  const fullBlocksEnd = byteLength - rem;
  const w = new Uint32Array(64);

  const processBlock = (buf: Uint8Array, base: number): void => {
    for (let i = 0; i < 16; i += 1) {
      const idx = base + i * 4;
      w[i] =
        (((buf[idx]! << 24) |
          (buf[idx + 1]! << 16) |
          (buf[idx + 2]! << 8) |
          buf[idx + 3]!) >>>
          0);
    }
    for (let i = 16; i < 64; i += 1) {
      const w15 = w[i - 15]!;
      const w2 = w[i - 2]!;
      const s0 = (rotr32(w15, 7) ^ rotr32(w15, 18) ^ (w15 >>> 3)) >>> 0;
      const s1 = (rotr32(w2, 17) ^ rotr32(w2, 19) ^ (w2 >>> 10)) >>> 0;
      w[i] = (w[i - 16]! + s0 + w[i - 7]! + s1) >>> 0;
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
      const temp1 = (h + s1 + ch + SHA256_K[i]! + w[i]!) >>> 0;
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
  };

  for (let pos = 0; pos < fullBlocksEnd; pos += 64) {
    processBlock(data, byteOffset + pos);
  }

  const tailLen = paddedLen - fullBlocksEnd;
  const tail = new Uint8Array(tailLen);
  for (let i = 0; i < rem; i += 1) {
    tail[i] = data[byteOffset + fullBlocksEnd + i]!;
  }
  tail[rem] = 0x80;

  const bitLenHi = Math.floor(byteLength / 0x20000000) >>> 0;
  const bitLenLo = (byteLength << 3) >>> 0;
  const tailView = new DataView(tail.buffer);
  tailView.setUint32(tailLen - 8, bitLenHi, false);
  tailView.setUint32(tailLen - 4, bitLenLo, false);

  for (let pos = 0; pos < tailLen; pos += 64) {
    processBlock(tail, pos);
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

export function computeSha256Hex(
  data: Uint8Array,
  byteOffset = 0,
  byteLength = data.byteLength - byteOffset,
): string {
  return bytesToHex(computeSha256Bytes(data, byteOffset, byteLength));
}

/**
 * 4×16비트 림(limb) 정수 연산으로 구현한 공식 64비트 FNV-1a 해시(ES2017 호환, BigInt 리터럴 불사용).
 */
export function computeFnv1a64Hex(
  data: Uint8Array,
  byteOffset = 0,
  byteLength = data.byteLength - byteOffset,
): string {
  let a3 = 0xcbf2;
  let a2 = 0x9ce4;
  let a1 = 0x8422;
  let a0 = 0x2325;

  const end = byteOffset + byteLength;
  for (let i = byteOffset; i < end; i += 1) {
    a0 ^= data[i]!;
    const p0 = a0 * 0x01b3;
    const p1 = a1 * 0x01b3 + (p0 >>> 16);
    const p2 = a2 * 0x01b3 + (a0 << 8) + (p1 >>> 16);
    const p3 = a3 * 0x01b3 + (a1 << 8) + (p2 >>> 16);

    a0 = p0 & 0xffff;
    a1 = p1 & 0xffff;
    a2 = p2 & 0xffff;
    a3 = p3 & 0xffff;
  }

  return (
    a3.toString(16).padStart(4, "0") +
    a2.toString(16).padStart(4, "0") +
    a1.toString(16).padStart(4, "0") +
    a0.toString(16).padStart(4, "0")
  );
}

function findNextCutGear(
  data: Uint8Array,
  start: number,
  minChunk: number,
  avgChunk: number,
  maxChunk: number,
): number {
  const totalLen = data.byteLength;
  const remaining = totalLen - start;
  if (remaining <= minChunk) {
    return totalLen;
  }

  const hardLimit = Math.min(totalLen, start + maxChunk);
  const normalPivot = Math.min(hardLimit, start + avgChunk);
  const bits = Math.max(6, Math.min(20, Math.round(Math.log2(Math.max(64, avgChunk)))));
  const maskStrict = ((0xffffffff << (32 - (bits + 1))) >>> 0);
  const maskLoose = ((0xffffffff << (32 - Math.max(4, bits - 1))) >>> 0);

  const evalStart = start + minChunk;
  const warmupStart = Math.max(start, evalStart - 32);
  let fp = 0;
  for (let p = warmupStart; p < evalStart; p += 1) {
    fp = (((fp << 1) + GEAR_TABLE[data[p]!]!) >>> 0);
  }

  for (let pos = evalStart; pos < normalPivot; pos += 1) {
    fp = (((fp << 1) + GEAR_TABLE[data[pos]!]!) >>> 0);
    if ((fp & maskStrict) === 0) {
      return pos + 1;
    }
  }

  for (let pos = normalPivot; pos < hardLimit; pos += 1) {
    fp = (((fp << 1) + GEAR_TABLE[data[pos]!]!) >>> 0);
    if ((fp & maskLoose) === 0) {
      return pos + 1;
    }
  }

  return hardLimit;
}

function findNextCutRabinKarp(
  data: Uint8Array,
  start: number,
  minChunk: number,
  avgChunk: number,
  maxChunk: number,
): number {
  const totalLen = data.byteLength;
  const remaining = totalLen - start;
  if (remaining <= minChunk) {
    return totalLen;
  }

  const hardLimit = Math.min(totalLen, start + maxChunk);
  const bits = Math.max(6, Math.min(20, Math.round(Math.log2(Math.max(64, avgChunk)))));
  const mask = ((1 << bits) - 1) >>> 0;
  const targetPattern = 0x5a3c & mask;

  const evalStart = start + minChunk;
  if (evalStart - start < RABIN_KARP_WINDOW) {
    let fpShort = 0;
    for (let pos = start; pos < hardLimit; pos += 1) {
      fpShort = (Math.imul(fpShort, RABIN_KARP_BASE) + data[pos]!) >>> 0;
      if (pos >= evalStart && (fpShort & mask) === targetPattern) {
        return pos + 1;
      }
    }
    return hardLimit;
  }

  let fp = 0;
  const warmupStart = evalStart - RABIN_KARP_WINDOW;
  for (let p = warmupStart; p < evalStart; p += 1) {
    fp = (Math.imul(fp, RABIN_KARP_BASE) + data[p]!) >>> 0;
  }

  for (let pos = evalStart; pos < hardLimit; pos += 1) {
    const outByte = data[pos - RABIN_KARP_WINDOW]!;
    const removed = (fp - Math.imul(outByte, RABIN_KARP_HIGH_POW)) >>> 0;
    fp = (Math.imul(removed, RABIN_KARP_BASE) + data[pos]!) >>> 0;
    if ((fp & mask) === targetPattern) {
      return pos + 1;
    }
  }

  return hardLimit;
}

/**
 * 회차 바이트 번들을 콘텐츠 정의 가변 청크(`4 KiB..64 KiB` 기본값)로 분할하고 매니페스트를 생성한다.
 */
export function buildEpisodeChunkManifest(
  bundle: Uint8Array,
  options?: CdcChunkerOptions,
): EpisodeChunkManifest {
  const minChunk = Math.max(64, Math.floor(options?.minChunkBytes ?? CDC_DEFAULT_MIN_CHUNK_BYTES));
  const maxChunk = Math.max(
    minChunk * 2,
    Math.floor(options?.maxChunkBytes ?? CDC_DEFAULT_MAX_CHUNK_BYTES),
  );
  const avgChunk = Math.min(
    maxChunk,
    Math.max(minChunk, Math.floor(options?.avgChunkBytes ?? CDC_DEFAULT_AVG_CHUNK_BYTES)),
  );
  const algorithm = options?.algorithm ?? "gear";

  const chunks: EpisodeChunkDescriptor[] = [];
  const uniqueHashes = new Set<string>();
  let cursor = 0;

  while (cursor < bundle.byteLength) {
    const nextCut =
      algorithm === "gear"
        ? findNextCutGear(bundle, cursor, minChunk, avgChunk, maxChunk)
        : findNextCutRabinKarp(bundle, cursor, minChunk, avgChunk, maxChunk);
    const len = nextCut - cursor;
    const sha256Hex = computeSha256Hex(bundle, cursor, len);
    const fnv1a64Hex = computeFnv1a64Hex(bundle, cursor, len);
    uniqueHashes.add(sha256Hex);

    chunks.push({
      chunkIndex: chunks.length,
      offset: cursor,
      byteLength: len,
      sha256Hex,
      fnv1a64Hex,
    });
    cursor = nextCut;
  }

  return {
    algorithm,
    totalBytes: bundle.byteLength,
    wholeFileSha256Hex: computeSha256Hex(bundle),
    wholeFileFnv1a64Hex: computeFnv1a64Hex(bundle),
    uniqueChunkCount: uniqueHashes.size,
    chunks,
    serverCostKrw: 0,
  };
}

function bytesEqualSlice(
  a: Uint8Array,
  aOffset: number,
  b: Uint8Array,
  bOffset: number,
  len: number,
): boolean {
  for (let i = 0; i < len; i += 1) {
    if (a[aOffset + i] !== b[bOffset + i]) return false;
  }
  return true;
}

/**
 * 이전 회차 번들(`baseBundle`) 대비 신규 회차 번들(`targetBundle`)의 변경 청크만 직렬화한
 * 소형 바이너리 델타 패치(`TCDC` v1)를 생성한다.
 */
export function createEpisodeDeltaPatch(
  baseBundle: Uint8Array,
  targetBundle: Uint8Array,
  options?: CdcChunkerOptions,
): EpisodeDeltaPatchResult {
  const baseManifest = buildEpisodeChunkManifest(baseBundle, options);
  const targetManifest = buildEpisodeChunkManifest(targetBundle, options);

  const baseLookup = new Map<string, EpisodeChunkDescriptor>();
  for (const ch of baseManifest.chunks) {
    if (!baseLookup.has(ch.sha256Hex)) {
      baseLookup.set(ch.sha256Hex, ch);
    }
  }

  type EncodedOp =
    | { readonly kind: "copy-base"; readonly baseOffset: number; readonly length: number }
    | { readonly kind: "copy-target"; readonly targetOffset: number; readonly length: number }
    | {
        readonly kind: "literal";
        readonly targetOffset: number;
        readonly length: number;
        readonly sha256Bytes: Uint8Array;
      };

  const ops: EncodedOp[] = [];
  const seenTargetChunkOffsets = new Map<string, { offset: number; length: number }>();

  let reusedBaseBytes = 0;
  let deduplicatedTargetBytes = 0;
  let transmittedLiteralBytes = 0;
  let reusedChunkCount = 0;
  let literalChunkCount = 0;
  let bodyByteLength = 0;

  for (const targetChunk of targetManifest.chunks) {
    const baseMatch = baseLookup.get(targetChunk.sha256Hex);
    if (
      baseMatch !== undefined &&
      baseMatch.byteLength === targetChunk.byteLength &&
      bytesEqualSlice(
        baseBundle,
        baseMatch.offset,
        targetBundle,
        targetChunk.offset,
        targetChunk.byteLength,
      )
    ) {
      ops.push({
        kind: "copy-base",
        baseOffset: baseMatch.offset,
        length: targetChunk.byteLength,
      });
      reusedBaseBytes += targetChunk.byteLength;
      reusedChunkCount += 1;
      bodyByteLength += 9;
      continue;
    }

    const intraMatch = seenTargetChunkOffsets.get(targetChunk.sha256Hex);
    if (
      intraMatch !== undefined &&
      intraMatch.length === targetChunk.byteLength &&
      bytesEqualSlice(
        targetBundle,
        intraMatch.offset,
        targetBundle,
        targetChunk.offset,
        targetChunk.byteLength,
      )
    ) {
      ops.push({
        kind: "copy-target",
        targetOffset: intraMatch.offset,
        length: targetChunk.byteLength,
      });
      deduplicatedTargetBytes += targetChunk.byteLength;
      reusedChunkCount += 1;
      bodyByteLength += 9;
      continue;
    }

    const chunkDigest = computeSha256Bytes(targetBundle, targetChunk.offset, targetChunk.byteLength);
    ops.push({
      kind: "literal",
      targetOffset: targetChunk.offset,
      length: targetChunk.byteLength,
      sha256Bytes: chunkDigest,
    });
    seenTargetChunkOffsets.set(targetChunk.sha256Hex, {
      offset: targetChunk.offset,
      length: targetChunk.byteLength,
    });
    transmittedLiteralBytes += targetChunk.byteLength;
    literalChunkCount += 1;
    bodyByteLength += 1 + 4 + 32 + targetChunk.byteLength;
  }

  const patchBytes = new Uint8Array(PATCH_HEADER_BYTES + bodyByteLength);
  const view = new DataView(patchBytes.buffer);
  patchBytes[0] = PATCH_MAGIC_0;
  patchBytes[1] = PATCH_MAGIC_1;
  patchBytes[2] = PATCH_MAGIC_2;
  patchBytes[3] = PATCH_MAGIC_3;
  patchBytes[4] = PATCH_FORMAT_VERSION;
  view.setUint32(5, baseBundle.byteLength, false);
  view.setUint32(9, targetBundle.byteLength, false);
  patchBytes.set(computeSha256Bytes(baseBundle), 13);
  patchBytes.set(computeSha256Bytes(targetBundle), 45);
  view.setUint32(77, ops.length, false);

  let pos = PATCH_HEADER_BYTES;
  for (const op of ops) {
    if (op.kind === "copy-base") {
      patchBytes[pos] = OP_COPY_BASE;
      view.setUint32(pos + 1, op.baseOffset, false);
      view.setUint32(pos + 5, op.length, false);
      pos += 9;
    } else if (op.kind === "copy-target") {
      patchBytes[pos] = OP_COPY_TARGET;
      view.setUint32(pos + 1, op.targetOffset, false);
      view.setUint32(pos + 5, op.length, false);
      pos += 9;
    } else {
      patchBytes[pos] = OP_INSERT_LITERAL;
      view.setUint32(pos + 1, op.length, false);
      patchBytes.set(op.sha256Bytes, pos + 5);
      patchBytes.set(
        targetBundle.subarray(op.targetOffset, op.targetOffset + op.length),
        pos + 37,
      );
      pos += 37 + op.length;
    }
  }

  const bandwidthSavingsRatio =
    targetBundle.byteLength === 0
      ? 0
      : Math.max(0, 1 - patchBytes.byteLength / targetBundle.byteLength);

  return {
    patchBytes,
    baseBytesCount: baseBundle.byteLength,
    targetBytesCount: targetBundle.byteLength,
    patchBytesCount: patchBytes.byteLength,
    reusedBaseBytes,
    deduplicatedTargetBytes,
    transmittedLiteralBytes,
    reusedChunkCount,
    literalChunkCount,
    bandwidthSavingsRatio,
    targetManifest,
    serverCostKrw: 0,
  };
}

/**
 * 바이너리 델타 패치(`TCDC` v1)를 원본 번들에 적용하고 전체/청크 SHA-256 무결성을 검증해
 * 비트 단위로 동일한 목표 회차 바이트열을 복원한다.
 */
export function applyEpisodeDeltaPatch(
  baseBundle: Uint8Array,
  patchBytes: Uint8Array,
): ReconstructedEpisodeResult {
  if (patchBytes.byteLength < PATCH_HEADER_BYTES) {
    throw new Error("손상된 델타 패치입니다: 헤더 길이가 81바이트 미만입니다.");
  }
  if (
    patchBytes[0] !== PATCH_MAGIC_0 ||
    patchBytes[1] !== PATCH_MAGIC_1 ||
    patchBytes[2] !== PATCH_MAGIC_2 ||
    patchBytes[3] !== PATCH_MAGIC_3
  ) {
    throw new Error("지원하지 않는 델타 패치 매직 시그니처입니다.");
  }
  if (patchBytes[4] !== PATCH_FORMAT_VERSION) {
    throw new Error(`지원하지 않는 TCDC 패치 버전입니다: v${patchBytes[4]}`);
  }

  const view = new DataView(patchBytes.buffer, patchBytes.byteOffset, patchBytes.byteLength);
  const expectedBaseLen = view.getUint32(5, false);
  const expectedTargetLen = view.getUint32(9, false);
  const instructionCount = view.getUint32(77, false);

  if (baseBundle.byteLength !== expectedBaseLen) {
    throw new Error(
      `원본 회차 크기가 패치 기준(${expectedBaseLen}B)과 다릅니다(실제 ${baseBundle.byteLength}B).`,
    );
  }

  const actualBaseDigest = computeSha256Bytes(baseBundle);
  if (!bytesEqualSlice(actualBaseDigest, 0, patchBytes, 13, 32)) {
    throw new Error("원본 회차 SHA-256 해시가 패치 기준과 일치하지 않습니다.");
  }

  const out = new Uint8Array(expectedTargetLen);
  let readPos = PATCH_HEADER_BYTES;
  let writePos = 0;

  for (let i = 0; i < instructionCount; i += 1) {
    if (readPos >= patchBytes.byteLength) {
      throw new Error("손상된 델타 패치입니다: 명령 스트림이 조기 종료되었습니다.");
    }
    const opcode = patchBytes[readPos]!;

    if (opcode === OP_COPY_BASE) {
      if (readPos + 9 > patchBytes.byteLength) {
        throw new Error("손상된 COPY_BASE 명령입니다.");
      }
      const baseOffset = view.getUint32(readPos + 1, false);
      const length = view.getUint32(readPos + 5, false);
      if (baseOffset + length > baseBundle.byteLength || writePos + length > expectedTargetLen) {
        throw new Error("COPY_BASE 범위가 버퍼 경계를 벗어났습니다.");
      }
      out.set(baseBundle.subarray(baseOffset, baseOffset + length), writePos);
      writePos += length;
      readPos += 9;
    } else if (opcode === OP_COPY_TARGET) {
      if (readPos + 9 > patchBytes.byteLength) {
        throw new Error("손상된 COPY_TARGET 명령입니다.");
      }
      const targetOffset = view.getUint32(readPos + 1, false);
      const length = view.getUint32(readPos + 5, false);
      if (targetOffset + length > writePos || writePos + length > expectedTargetLen) {
        throw new Error("COPY_TARGET 참조 범위가 아직 복원되지 않았거나 경계를 벗어났습니다.");
      }
      out.set(out.subarray(targetOffset, targetOffset + length), writePos);
      writePos += length;
      readPos += 9;
    } else if (opcode === OP_INSERT_LITERAL) {
      if (readPos + 37 > patchBytes.byteLength) {
        throw new Error("손상된 INSERT_LITERAL 헤더입니다.");
      }
      const length = view.getUint32(readPos + 1, false);
      const literalStart = readPos + 37;
      if (literalStart + length > patchBytes.byteLength || writePos + length > expectedTargetLen) {
        throw new Error("INSERT_LITERAL 바이트 길이가 버퍼 경계를 벗어났습니다.");
      }
      const chunkDigest = computeSha256Bytes(patchBytes, literalStart, length);
      if (!bytesEqualSlice(chunkDigest, 0, patchBytes, readPos + 5, 32)) {
        throw new Error(`델타 리터럴 청크 #${i}의 SHA-256 무결성 검증에 실패했습니다.`);
      }
      out.set(patchBytes.subarray(literalStart, literalStart + length), writePos);
      writePos += length;
      readPos = literalStart + length;
    } else {
      throw new Error(`알 수 없는 델타 패치 명령 코드입니다: 0x${opcode.toString(16)}`);
    }
  }

  if (readPos !== patchBytes.byteLength || writePos !== expectedTargetLen) {
    throw new Error("패치 명령 적용 후 복원 길이가 목표 바이트 수와 일치하지 않습니다.");
  }

  const finalDigest = computeSha256Bytes(out);
  if (!bytesEqualSlice(finalDigest, 0, patchBytes, 45, 32)) {
    throw new Error("복원된 회차 전체 SHA-256 해시가 목표 매니페스트와 일치하지 않습니다.");
  }

  return {
    targetBytes: out,
    verified: true,
    wholeFileSha256Hex: bytesToHex(finalDigest),
    wholeFileFnv1a64Hex: computeFnv1a64Hex(out),
    appliedInstructionCount: instructionCount,
    serverCostKrw: 0,
  };
}
