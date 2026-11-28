/**
 * Wave 146 — Gear 롤링 해시 기반 정규화 FastCDC 청커 & 순수 ES2017 FIPS 180-4 SHA-256.
 *
 * - 외부 암호 API나 BigInt 리터럴 없이 32비트 부호 없는 산술(`>>> 0`)만 사용한다.
 * - 결정론적 256-엔트리 32비트 Gear 테이블로 콘텐츠 경계를 계산해, 원고 앞단에 바이트가
 *   삽입·삭제되어도 뒤따르는 청크 경계를 빠르게 재동기화(Shift-Resistance)한다.
 * - 고정 크기 청킹과 FastCDC의 시프트 내성 중복제거 효율을 정량 비교한다.
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

const SHA256_INIT = new Uint32Array([
  0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
  0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
]);

export const DEFAULT_FASTCDC_MIN_CHUNK_BYTES = 1024;
export const DEFAULT_FASTCDC_AVG_CHUNK_BYTES = 4096;
export const DEFAULT_FASTCDC_MAX_CHUNK_BYTES = 16384;
export const DEFAULT_FASTCDC_NORMALIZATION_LEVEL = 2;

export interface FastCdcChunkingOptions {
  readonly minChunkBytes?: number;
  readonly avgChunkBytes?: number;
  readonly maxChunkBytes?: number;
  readonly normalizationLevel?: number;
}

export interface ResolvedFastCdcOptions {
  readonly minChunkBytes: number;
  readonly avgChunkBytes: number;
  readonly maxChunkBytes: number;
  readonly normalizationLevel: number;
  readonly avgMaskBits: number;
  readonly maskS: number;
  readonly maskL: number;
}

export interface ContentAddressedChunk {
  readonly index: number;
  readonly offset: number;
  readonly byteLength: number;
  readonly sha256Hex: string;
  readonly bytes: Uint8Array;
}

export interface FastCdcChunkingResult {
  readonly options: ResolvedFastCdcOptions;
  readonly totalBytes: number;
  readonly chunkCount: number;
  readonly uniqueChunkCount: number;
  readonly uniqueBytes: number;
  readonly intraDedupSavedBytes: number;
  readonly minObservedChunkBytes: number;
  readonly maxObservedChunkBytes: number;
  readonly averageObservedChunkBytes: number;
  readonly payloadSha256Hex: string;
  readonly chunks: readonly ContentAddressedChunk[];
}

export interface ChunkingStrategyDedupMetrics {
  readonly strategy: "fixed-size" | "fastcdc";
  readonly targetAvgChunkBytes: number;
  readonly baseTotalBytes: number;
  readonly modifiedTotalBytes: number;
  readonly logicalCombinedBytes: number;
  readonly baseChunkCount: number;
  readonly modifiedChunkCount: number;
  readonly reusedModifiedChunkCount: number;
  readonly reusedModifiedBytes: number;
  readonly storedUniqueChunkCount: number;
  readonly storedUniqueBytes: number;
  readonly dedupSavedBytes: number;
  readonly dedupSavingsPercent: number;
  readonly incrementalReusePercent: number;
}

export interface FixedVsFastCdcComparisonReport {
  readonly fixed: ChunkingStrategyDedupMetrics;
  readonly fastCdc: ChunkingStrategyDedupMetrics;
  readonly fastCdcSavedMoreBytes: number;
  readonly fastCdcAdvantageSavingsPoints: number;
  readonly fastCdcAdvantageReusePoints: number;
  readonly reportSha256Hex: string;
}

function rotr32(value: number, bits: number): number {
  return ((value >>> bits) | (value << (32 - bits))) >>> 0;
}

function toHex32(value: number): string {
  const raw = (value >>> 0).toString(16);
  return raw.length >= 8 ? raw : "00000000".slice(raw.length) + raw;
}

function roundPercent(value: number): number {
  if (!Number.isFinite(value)) return 0;
  const rounded = Math.round(value * 100) / 100;
  return Object.is(rounded, -0) ? 0 : rounded;
}

/** UTF-16 문자열을 표준 UTF-8 바이트 배열로 결정론적 인코딩한다. */
export function encodeVaultUtf8Bytes(text: string): Uint8Array {
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

function sha256Words(data: Uint8Array): Uint32Array {
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

  let h0 = SHA256_INIT[0] ?? 0;
  let h1 = SHA256_INIT[1] ?? 0;
  let h2 = SHA256_INIT[2] ?? 0;
  let h3 = SHA256_INIT[3] ?? 0;
  let h4 = SHA256_INIT[4] ?? 0;
  let h5 = SHA256_INIT[5] ?? 0;
  let h6 = SHA256_INIT[6] ?? 0;
  let h7 = SHA256_INIT[7] ?? 0;

  const w = new Uint32Array(64);

  for (let offset = 0; offset < totalLen; offset += 64) {
    for (let i = 0; i < 16; i += 1) {
      const idx = offset + i * 4;
      w[i] =
        (((padded[idx] ?? 0) << 24) |
          ((padded[idx + 1] ?? 0) << 16) |
          ((padded[idx + 2] ?? 0) << 8) |
          (padded[idx + 3] ?? 0)) >>>
        0;
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
      const s1 = (rotr32(e, 6) ^ rotr32(e, 11) ^ rotr32(e, 25)) >>> 0;
      const ch = ((e & f) ^ (~e & g)) >>> 0;
      const temp1 = (h + s1 + ch + (SHA256_K[i] ?? 0) + (w[i] ?? 0)) >>> 0;
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

  return new Uint32Array([h0, h1, h2, h3, h4, h5, h6, h7]);
}

/** FIPS 180-4 SHA-256 해시를 64자리 소문자 16진수 문자열로 반환한다. */
export function sha256VaultBytesHex(data: Uint8Array): string {
  const words = sha256Words(data);
  return (
    toHex32(words[0] ?? 0) +
    toHex32(words[1] ?? 0) +
    toHex32(words[2] ?? 0) +
    toHex32(words[3] ?? 0) +
    toHex32(words[4] ?? 0) +
    toHex32(words[5] ?? 0) +
    toHex32(words[6] ?? 0) +
    toHex32(words[7] ?? 0)
  );
}

/** UTF-8 문자열의 FIPS 180-4 SHA-256 해시를 반환한다. */
export function sha256VaultUtf8Hex(input: string): string {
  return sha256VaultBytesHex(encodeVaultUtf8Bytes(input));
}

function normalizeNumberForCanonical(value: number): number | null {
  if (!Number.isFinite(value)) return null;
  const rounded = Math.round(value * 10000) / 10000;
  return Object.is(rounded, -0) ? 0 : rounded;
}

/** 키 순서에 무관한 정규 JSON 직렬화를 수행한다. */
export function canonicalizeVaultJson(value: unknown): string {
  if (value === null || value === undefined) return "null";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") {
    const normalized = normalizeNumberForCanonical(value);
    return normalized === null ? "null" : String(normalized);
  }
  if (typeof value === "string") return JSON.stringify(value);
  if (Array.isArray(value)) {
    const parts: string[] = [];
    for (let i = 0; i < value.length; i += 1) {
      parts.push(canonicalizeVaultJson(value[i]));
    }
    return `[${parts.join(",")}]`;
  }
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    const keys = Object.keys(record).sort();
    const entries: string[] = [];
    for (let i = 0; i < keys.length; i += 1) {
      const key = keys[i];
      if (key === undefined) continue;
      const entryValue = record[key];
      if (entryValue === undefined) continue;
      entries.push(`${JSON.stringify(key)}:${canonicalizeVaultJson(entryValue)}`);
    }
    return `{${entries.join(",")}}`;
  }
  return JSON.stringify(String(value));
}

/** 임의 매니페스트 객체의 키 순서 무관 FIPS 180-4 SHA-256 지문을 계산한다. */
export function computeVaultManifestSha256Hex(payload: unknown): string {
  return sha256VaultUtf8Hex(canonicalizeVaultJson(payload));
}

/**
 * 32개의 도메인 분리 SHA-256 블록에서 파생한 결정론적 256-엔트리 32비트 Gear 테이블.
 * 모든 비트 위치에서 0/1 분포가 균일해 FastCDC 경계 분포의 편향을 방지한다.
 */
function buildDeterministicGearTable(): Uint32Array {
  const table = new Uint32Array(256);
  for (let block = 0; block < 32; block += 1) {
    const words = sha256Words(encodeVaultUtf8Bytes(`toonstudio:wave146:fastcdc:gear:v1:${block}`));
    for (let w = 0; w < 8; w += 1) {
      table[block * 8 + w] = words[w] ?? 0;
    }
  }
  return table;
}

const FASTCDC_GEAR_TABLE_INTERNAL = buildDeterministicGearTable();

/** 256-엔트리 32비트 Gear 테이블의 방어 사본을 반환한다. */
export function getFastCdcGearTable(): Uint32Array {
  return new Uint32Array(FASTCDC_GEAR_TABLE_INTERNAL);
}

function buildHighBitMask(bitCount: number): number {
  const clamped = Math.max(1, Math.min(31, Math.floor(bitCount)));
  return (0xffffffff << (32 - clamped)) >>> 0;
}

/** FastCDC 청킹 옵션을 검증하고 정규화 마스크(`maskS`, `maskL`)를 산출한다. */
export function resolveFastCdcOptions(options?: FastCdcChunkingOptions): ResolvedFastCdcOptions {
  const avgRaw = options?.avgChunkBytes ?? DEFAULT_FASTCDC_AVG_CHUNK_BYTES;
  const minRaw = options?.minChunkBytes ?? Math.max(64, Math.floor(avgRaw / 4));
  const maxRaw = options?.maxChunkBytes ?? avgRaw * 4;
  const normRaw = options?.normalizationLevel ?? DEFAULT_FASTCDC_NORMALIZATION_LEVEL;

  if (!Number.isInteger(minRaw) || minRaw < 16) {
    throw new RangeError(`minChunkBytes는 16 이상의 정수여야 합니다(입력: ${minRaw}).`);
  }
  if (!Number.isInteger(avgRaw) || avgRaw < minRaw) {
    throw new RangeError(`avgChunkBytes(${avgRaw})는 minChunkBytes(${minRaw}) 이상이어야 합니다.`);
  }
  if (!Number.isInteger(maxRaw) || maxRaw < avgRaw) {
    throw new RangeError(`maxChunkBytes(${maxRaw})는 avgChunkBytes(${avgRaw}) 이상이어야 합니다.`);
  }
  if (!Number.isInteger(normRaw) || normRaw < 0 || normRaw > 3) {
    throw new RangeError(`normalizationLevel은 0~3 사이의 정수여야 합니다(입력: ${normRaw}).`);
  }

  const avgMaskBits = Math.max(4, Math.min(26, Math.round(Math.log2(avgRaw))));
  const effectiveNorm = Math.min(normRaw, avgMaskBits - 1, 30 - avgMaskBits);
  const maskS = buildHighBitMask(avgMaskBits + effectiveNorm);
  const maskL = buildHighBitMask(avgMaskBits - effectiveNorm);

  return {
    minChunkBytes: minRaw,
    avgChunkBytes: avgRaw,
    maxChunkBytes: maxRaw,
    normalizationLevel: effectiveNorm,
    avgMaskBits,
    maskS,
    maskL,
  };
}

/**
 * Gear 롤링 해시 기반 정규화 FastCDC 청커.
 *
 * - Gear 갱신식 `fp = ((fp << 1) + gear[byte]) >>> 0`은 정확히 최근 32바이트 창에만 의존한다.
 * - `minChunkBytes` 직전 32바이트로 롤링 해시를 예열해 삽입·삭제 직후에도 콘텐츠 경계를 즉시
 *   재동기화한다.
 * - 마지막 청크를 제외한 모든 청크는 `minChunkBytes <= len <= maxChunkBytes` 제약을 엄수한다.
 */
export function chunkBufferFastCdc(
  payload: Uint8Array,
  options?: FastCdcChunkingOptions,
): FastCdcChunkingResult {
  const resolved = resolveFastCdcOptions(options);
  const totalBytes = payload.length;
  const payloadSha256Hex = sha256VaultBytesHex(payload);

  if (totalBytes === 0) {
    return {
      options: resolved,
      totalBytes: 0,
      chunkCount: 0,
      uniqueChunkCount: 0,
      uniqueBytes: 0,
      intraDedupSavedBytes: 0,
      minObservedChunkBytes: 0,
      maxObservedChunkBytes: 0,
      averageObservedChunkBytes: 0,
      payloadSha256Hex,
      chunks: [],
    };
  }

  const { minChunkBytes, avgChunkBytes, maxChunkBytes, maskS, maskL } = resolved;
  const gear = FASTCDC_GEAR_TABLE_INTERNAL;
  const chunks: ContentAddressedChunk[] = [];
  const uniqueSizes = new Map<string, number>();

  let offset = 0;
  let chunkIndex = 0;
  let minObserved = Number.POSITIVE_INFINITY;
  let maxObserved = 0;

  while (offset < totalBytes) {
    const remaining = totalBytes - offset;
    let chunkLen: number;

    if (remaining <= minChunkBytes) {
      chunkLen = remaining;
    } else {
      const normalSize = Math.min(avgChunkBytes, remaining);
      const maxEnd = Math.min(maxChunkBytes, remaining);

      let fp = 0;
      const primeStart = Math.max(0, minChunkBytes - 32);
      for (let p = primeStart; p < minChunkBytes; p += 1) {
        const byteVal = payload[offset + p] ?? 0;
        fp = (((fp << 1) >>> 0) + (gear[byteVal] ?? 0)) >>> 0;
      }

      chunkLen = maxEnd;
      for (let len = minChunkBytes; len < maxEnd; len += 1) {
        const mask = len < normalSize ? maskS : maskL;
        if ((fp & mask) === 0) {
          chunkLen = len;
          break;
        }
        const nextByte = payload[offset + len] ?? 0;
        fp = (((fp << 1) >>> 0) + (gear[nextByte] ?? 0)) >>> 0;
      }
    }

    const sliceCopy = payload.slice(offset, offset + chunkLen);
    const chunkSha = sha256VaultBytesHex(sliceCopy);
    chunks.push({
      index: chunkIndex,
      offset,
      byteLength: chunkLen,
      sha256Hex: chunkSha,
      bytes: sliceCopy,
    });
    if (!uniqueSizes.has(chunkSha)) {
      uniqueSizes.set(chunkSha, chunkLen);
    }
    if (chunkLen < minObserved) minObserved = chunkLen;
    if (chunkLen > maxObserved) maxObserved = chunkLen;

    offset += chunkLen;
    chunkIndex += 1;
  }

  let uniqueBytes = 0;
  uniqueSizes.forEach((size) => {
    uniqueBytes += size;
  });

  return {
    options: resolved,
    totalBytes,
    chunkCount: chunks.length,
    uniqueChunkCount: uniqueSizes.size,
    uniqueBytes,
    intraDedupSavedBytes: totalBytes - uniqueBytes,
    minObservedChunkBytes: Number.isFinite(minObserved) ? minObserved : 0,
    maxObservedChunkBytes: maxObserved,
    averageObservedChunkBytes: roundPercent(totalBytes / chunks.length),
    payloadSha256Hex,
    chunks,
  };
}

/** 비교 기준용 고정 크기(Fixed-Size) 청킹을 수행한다. */
export function chunkBufferFixedSize(
  payload: Uint8Array,
  fixedChunkBytes: number = DEFAULT_FASTCDC_AVG_CHUNK_BYTES,
): readonly ContentAddressedChunk[] {
  if (!Number.isInteger(fixedChunkBytes) || fixedChunkBytes < 16) {
    throw new RangeError(`fixedChunkBytes는 16 이상의 정수여야 합니다(입력: ${fixedChunkBytes}).`);
  }
  const chunks: ContentAddressedChunk[] = [];
  let offset = 0;
  let index = 0;
  while (offset < payload.length) {
    const end = Math.min(payload.length, offset + fixedChunkBytes);
    const bytes = payload.slice(offset, end);
    chunks.push({
      index,
      offset,
      byteLength: bytes.length,
      sha256Hex: sha256VaultBytesHex(bytes),
      bytes,
    });
    offset = end;
    index += 1;
  }
  return chunks;
}

/** 청크 목록을 원본 순서대로 이어 붙여 단일 버퍼로 재조립한다. */
export function reassembleChunks(chunks: readonly ContentAddressedChunk[]): Uint8Array {
  let total = 0;
  for (let i = 0; i < chunks.length; i += 1) {
    total += chunks[i]?.byteLength ?? 0;
  }
  const output = new Uint8Array(total);
  let cursor = 0;
  for (let i = 0; i < chunks.length; i += 1) {
    const chunk = chunks[i];
    if (!chunk) continue;
    output.set(chunk.bytes, cursor);
    cursor += chunk.byteLength;
  }
  return output;
}

function measureStrategyDedup(
  strategy: "fixed-size" | "fastcdc",
  targetAvgChunkBytes: number,
  baseChunks: readonly ContentAddressedChunk[],
  modifiedChunks: readonly ContentAddressedChunk[],
  baseTotalBytes: number,
  modifiedTotalBytes: number,
): ChunkingStrategyDedupMetrics {
  const baseHashes = new Set<string>();
  const combinedUnique = new Map<string, number>();

  for (let i = 0; i < baseChunks.length; i += 1) {
    const c = baseChunks[i];
    if (!c) continue;
    baseHashes.add(c.sha256Hex);
    if (!combinedUnique.has(c.sha256Hex)) {
      combinedUnique.set(c.sha256Hex, c.byteLength);
    }
  }

  let reusedModifiedChunkCount = 0;
  let reusedModifiedBytes = 0;
  for (let i = 0; i < modifiedChunks.length; i += 1) {
    const c = modifiedChunks[i];
    if (!c) continue;
    if (baseHashes.has(c.sha256Hex)) {
      reusedModifiedChunkCount += 1;
      reusedModifiedBytes += c.byteLength;
    }
    if (!combinedUnique.has(c.sha256Hex)) {
      combinedUnique.set(c.sha256Hex, c.byteLength);
    }
  }

  let storedUniqueBytes = 0;
  combinedUnique.forEach((size) => {
    storedUniqueBytes += size;
  });

  const logicalCombinedBytes = baseTotalBytes + modifiedTotalBytes;
  const dedupSavedBytes = Math.max(0, logicalCombinedBytes - storedUniqueBytes);
  const dedupSavingsPercent =
    logicalCombinedBytes > 0 ? roundPercent((dedupSavedBytes / logicalCombinedBytes) * 100) : 0;
  const incrementalReusePercent =
    modifiedTotalBytes > 0 ? roundPercent((reusedModifiedBytes / modifiedTotalBytes) * 100) : 0;

  return {
    strategy,
    targetAvgChunkBytes,
    baseTotalBytes,
    modifiedTotalBytes,
    logicalCombinedBytes,
    baseChunkCount: baseChunks.length,
    modifiedChunkCount: modifiedChunks.length,
    reusedModifiedChunkCount,
    reusedModifiedBytes,
    storedUniqueChunkCount: combinedUnique.size,
    storedUniqueBytes,
    dedupSavedBytes,
    dedupSavingsPercent,
    incrementalReusePercent,
  };
}

/**
 * 기준 원고와 수정 원고(예: 앞단 37바이트 삽입)에 대해 고정 크기 청킹과 FastCDC의
 * 중복제거율 및 시프트 내성(Shift-Resistance) 차이를 정량 비교한다.
 */
export function compareFixedVsFastCdcDedup(
  basePayload: Uint8Array,
  modifiedPayload: Uint8Array,
  options?: FastCdcChunkingOptions,
): FixedVsFastCdcComparisonReport {
  const resolved = resolveFastCdcOptions(options);
  const fixedBase = chunkBufferFixedSize(basePayload, resolved.avgChunkBytes);
  const fixedMod = chunkBufferFixedSize(modifiedPayload, resolved.avgChunkBytes);
  const fastBase = chunkBufferFastCdc(basePayload, resolved);
  const fastMod = chunkBufferFastCdc(modifiedPayload, resolved);

  const fixed = measureStrategyDedup(
    "fixed-size",
    resolved.avgChunkBytes,
    fixedBase,
    fixedMod,
    basePayload.length,
    modifiedPayload.length,
  );
  const fastCdc = measureStrategyDedup(
    "fastcdc",
    resolved.avgChunkBytes,
    fastBase.chunks,
    fastMod.chunks,
    basePayload.length,
    modifiedPayload.length,
  );

  const fastCdcSavedMoreBytes = fixed.storedUniqueBytes - fastCdc.storedUniqueBytes;
  const fastCdcAdvantageSavingsPoints = roundPercent(
    fastCdc.dedupSavingsPercent - fixed.dedupSavingsPercent,
  );
  const fastCdcAdvantageReusePoints = roundPercent(
    fastCdc.incrementalReusePercent - fixed.incrementalReusePercent,
  );

  const reportSha256Hex = computeVaultManifestSha256Hex({
    fixed,
    fastCdc,
    fastCdcSavedMoreBytes,
    fastCdcAdvantageSavingsPoints,
    fastCdcAdvantageReusePoints,
  });

  return {
    fixed,
    fastCdc,
    fastCdcSavedMoreBytes,
    fastCdcAdvantageSavingsPoints,
    fastCdcAdvantageReusePoints,
    reportSha256Hex,
  };
}
