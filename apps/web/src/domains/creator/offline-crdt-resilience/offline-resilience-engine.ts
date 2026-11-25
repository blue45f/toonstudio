/**
 * 오프라인-퍼스트 CRDT 벡터시계 인과 비교·델타 압축 + OPFS 16K 원고 청크 무결성(CRC32/SHA-256)·XOR 패리티 무손실 복구 +
 * 멀티탭 단일 쓰기 소유 잠금(Single-Writer Lease · 단조 증가 펜싱 토큰) 결정론 엔진 (Wave 42D).
 * 외부 브라우저 스토리지·비결정론 난수·BigInt 리터럴 0건으로 온디바이스에서 100% 재현 가능하다.
 */

// 1. 순수 32-bit CRC32 (IEEE 802.3) & SHA-256 (FIPS 180-4)

const CRC32_TABLE: Uint32Array = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let c = i;
    for (let bit = 0; bit < 8; bit += 1) {
      c = (c & 1) !== 0 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c >>> 0;
  }
  return table;
})();

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

const SHA256_INIT: readonly number[] = [
  0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
  0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
];

const rotr32 = (v: number, s: number): number => ((v >>> s) | (v << (32 - s))) >>> 0;
const toHex32 = (v: number): string => (v >>> 0).toString(16).padStart(8, "0");

/** IEEE 802.3 32-bit CRC32 체크섬을 unsigned 정수로 계산한다. */
export function computeCrc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i += 1) {
    crc = ((CRC32_TABLE[(crc ^ (bytes[i] ?? 0)) & 0xff] ?? 0) ^ (crc >>> 8)) >>> 0;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/** CRC32 값을 8자리 소문자 16진수 문자열로 반환한다. */
export function computeCrc32Hex(bytes: Uint8Array): string {
  return toHex32(computeCrc32(bytes));
}

/** 순수 32-bit 연산 기반 FIPS 180-4 SHA-256 해시(64자리 소문자 hex)를 계산한다. */
export function computeSha256Hex(bytes: Uint8Array): string {
  const len = bytes.length;
  const paddedLen = Math.ceil((len + 9) / 64) * 64;
  const padded = new Uint8Array(paddedLen);
  padded.set(bytes, 0);
  padded[len] = 0x80;

  const totalBits = len * 8;
  const view = new DataView(padded.buffer);
  view.setUint32(paddedLen - 8, Math.floor(totalBits / 0x100000000) >>> 0, false);
  view.setUint32(paddedLen - 4, totalBits >>> 0, false);

  const hash = new Uint32Array(SHA256_INIT);
  const w = new Uint32Array(64);

  for (let offset = 0; offset < paddedLen; offset += 64) {
    for (let i = 0; i < 16; i += 1) w[i] = view.getUint32(offset + i * 4, false);
    for (let i = 16; i < 64; i += 1) {
      const w15 = w[i - 15] ?? 0;
      const w2 = w[i - 2] ?? 0;
      const s0 = (rotr32(w15, 7) ^ rotr32(w15, 18) ^ (w15 >>> 3)) >>> 0;
      const s1 = (rotr32(w2, 17) ^ rotr32(w2, 19) ^ (w2 >>> 10)) >>> 0;
      w[i] = ((w[i - 16] ?? 0) + s0 + (w[i - 7] ?? 0) + s1) >>> 0;
    }

    let a = hash[0] ?? 0, b = hash[1] ?? 0, c = hash[2] ?? 0, d = hash[3] ?? 0;
    let e = hash[4] ?? 0, f = hash[5] ?? 0, g = hash[6] ?? 0, h = hash[7] ?? 0;

    for (let i = 0; i < 64; i += 1) {
      const bigS1 = (rotr32(e, 6) ^ rotr32(e, 11) ^ rotr32(e, 25)) >>> 0;
      const ch = ((e & f) ^ (~e & g)) >>> 0;
      const t1 = (h + bigS1 + ch + (SHA256_K[i] ?? 0) + (w[i] ?? 0)) >>> 0;
      const bigS0 = (rotr32(a, 2) ^ rotr32(a, 13) ^ rotr32(a, 22)) >>> 0;
      const t2 = (bigS0 + (((a & b) ^ (a & c) ^ (b & c)) >>> 0)) >>> 0;
      h = g; g = f; f = e; e = (d + t1) >>> 0;
      d = c; c = b; b = a; a = (t1 + t2) >>> 0;
    }

    const delta = [a, b, c, d, e, f, g, h];
    for (let j = 0; j < 8; j += 1) hash[j] = ((hash[j] ?? 0) + (delta[j] ?? 0)) >>> 0;
  }

  return Array.from(hash, (word) => toHex32(word)).join("");
}

// 2. 벡터 시계(Vector Clock) 인과 비교 & CRDT 델타 압축기

export type VectorClock = Readonly<Record<string, number>>;
export type VectorClockRelation = "before" | "after" | "equal" | "concurrent";
export type CrdtOpKind = "stroke-commit" | "layer-opacity" | "balloon-text" | "panel-layout" | "tombstone";
export type LwwTieBreakerField = "lamport" | "actorId" | "opId";

export interface CrdtOperation {
  readonly opId: string;
  readonly entityKey: string;
  readonly cutId: string;
  readonly kind: CrdtOpKind;
  readonly actorId: string;
  readonly lamport: number;
  readonly clock: VectorClock;
  readonly payloadSummary: string;
  readonly payloadBytes: number;
  readonly tombstone?: boolean;
}

export interface CrdtConflictRecord {
  readonly entityKey: string;
  readonly winnerOpId: string;
  readonly loserOpId: string;
  readonly winnerActorId: string;
  readonly loserActorId: string;
  readonly winnerLamport: number;
  readonly loserLamport: number;
  readonly relation: "concurrent";
  readonly tieBreaker: LwwTieBreakerField;
}

export interface CrdtCompactionResult {
  readonly compactedOps: readonly CrdtOperation[];
  readonly droppedOpIds: readonly string[];
  readonly conflicts: readonly CrdtConflictRecord[];
  readonly mergedClock: VectorClock;
  readonly originalCount: number;
  readonly compactedCount: number;
  readonly originalBytes: number;
  readonly compactedBytes: number;
  readonly savedBytes: number;
  readonly reductionPct: number;
  readonly deterministicDigest: string;
}

const sanitizeTick = (v: number | undefined): number =>
  typeof v === "number" && Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0;

/** 두 벡터 시계의 인과 관계(before / after / equal / concurrent)를 판정한다. */
export function compareVectorClocks(a: VectorClock, b: VectorClock): VectorClockRelation {
  const actorIds = new Set<string>([...Object.keys(a), ...Object.keys(b)]);
  let aLess = false;
  let aGreater = false;
  for (const actorId of actorIds) {
    const va = sanitizeTick(a[actorId]);
    const vb = sanitizeTick(b[actorId]);
    if (va < vb) aLess = true;
    if (va > vb) aGreater = true;
    if (aLess && aGreater) return "concurrent";
  }
  if (!aLess && !aGreater) return "equal";
  return aLess ? "before" : "after";
}

/** 두 벡터 시계의 요소별 최댓값(join)을 정렬된 키 순서로 병합한다. */
export function mergeVectorClocks(a: VectorClock, b: VectorClock): VectorClock {
  const merged: Record<string, number> = {};
  for (const key of Array.from(new Set<string>([...Object.keys(a), ...Object.keys(b)])).sort()) {
    merged[key] = Math.max(sanitizeTick(a[key]), sanitizeTick(b[key]));
  }
  return merged;
}

/** 지정 행위자(actorId)의 벡터 시계 논리 시각을 1 증가시킨다. */
export function incrementVectorClock(clock: VectorClock, actorId: string): VectorClock {
  const next: Record<string, number> = {};
  for (const key of Array.from(new Set<string>([...Object.keys(clock), actorId])).sort()) {
    next[key] = sanitizeTick(clock[key]) + (key === actorId ? 1 : 0);
  }
  return next;
}

function compareLwwDesc(a: CrdtOperation, b: CrdtOperation): { readonly order: number; readonly tieBreaker: LwwTieBreakerField } {
  if (a.lamport !== b.lamport) return { order: b.lamport - a.lamport, tieBreaker: "lamport" };
  if (a.actorId !== b.actorId) return { order: a.actorId > b.actorId ? -1 : 1, tieBreaker: "actorId" };
  if (a.opId !== b.opId) return { order: a.opId > b.opId ? -1 : 1, tieBreaker: "opId" };
  return { order: 0, tieBreaker: "opId" };
}

/**
 * 오프라인 CRDT 연산 로그에서 인과적으로 덮어써진 중복 연산을 안전 병합해 큐 크기를 절감하고,
 * 동시 편집 충돌은 결정론적 LWW 타이브레이커 (lamport, actorId, opId)로 해결한다.
 */
export function compactCrdtOpLog(ops: readonly CrdtOperation[]): CrdtCompactionResult {
  const byEntity = new Map<string, CrdtOperation[]>();
  let mergedClock: VectorClock = {};
  let originalBytes = 0;

  for (const op of ops) {
    originalBytes += Math.max(0, Math.floor(op.payloadBytes));
    mergedClock = mergeVectorClocks(mergedClock, op.clock);
    const list = byEntity.get(op.entityKey);
    if (list) list.push(op);
    else byEntity.set(op.entityKey, [op]);
  }

  const winners: CrdtOperation[] = [];
  const droppedOpIds: string[] = [];
  const conflicts: CrdtConflictRecord[] = [];

  for (const entityKey of Array.from(byEntity.keys()).sort()) {
    const unique = new Map<string, CrdtOperation>();
    for (const op of byEntity.get(entityKey) ?? []) {
      if (unique.has(op.opId)) droppedOpIds.push(op.opId);
      else unique.set(op.opId, op);
    }
    const deduped = Array.from(unique.values());
    const frontier: CrdtOperation[] = [];
    for (const candidate of deduped) {
      const superseded = deduped.some(
        (other) => other.opId !== candidate.opId && compareVectorClocks(candidate.clock, other.clock) === "before",
      );
      if (superseded) droppedOpIds.push(candidate.opId);
      else frontier.push(candidate);
    }

    const sortedFrontier = [...frontier].sort((a, b) => compareLwwDesc(a, b).order);
    const winner = sortedFrontier[0];
    if (!winner) continue;

    let entityClock: VectorClock = winner.clock;
    for (let i = 1; i < sortedFrontier.length; i += 1) {
      const loser = sortedFrontier[i];
      if (!loser) continue;
      entityClock = mergeVectorClocks(entityClock, loser.clock);
      droppedOpIds.push(loser.opId);
      if (compareVectorClocks(winner.clock, loser.clock) === "concurrent") {
        conflicts.push({
          entityKey,
          winnerOpId: winner.opId, loserOpId: loser.opId,
          winnerActorId: winner.actorId, loserActorId: loser.actorId,
          winnerLamport: winner.lamport, loserLamport: loser.lamport,
          relation: "concurrent", tieBreaker: compareLwwDesc(winner, loser).tieBreaker,
        });
      }
    }
    winners.push({ ...winner, clock: entityClock });
  }

  winners.sort((a, b) =>
    a.lamport !== b.lamport ? a.lamport - b.lamport
      : a.entityKey !== b.entityKey ? (a.entityKey < b.entityKey ? -1 : 1)
        : a.actorId !== b.actorId ? (a.actorId < b.actorId ? -1 : 1)
          : a.opId < b.opId ? -1 : a.opId > b.opId ? 1 : 0,
  );
  droppedOpIds.sort();

  const compactedBytes = winners.reduce((sum, op) => sum + Math.max(0, Math.floor(op.payloadBytes)), 0);
  const savedBytes = Math.max(0, originalBytes - compactedBytes);
  const reductionPct = originalBytes > 0 ? Math.round((savedBytes / originalBytes) * 1000) / 10 : 0;
  const canonical = JSON.stringify({
    mergedClock,
    winners: winners.map((w) => [w.opId, w.entityKey, w.actorId, w.lamport, w.payloadSummary, w.tombstone ?? false]),
    conflicts: conflicts.map((c) => [c.entityKey, c.winnerOpId, c.loserOpId, c.tieBreaker]),
  });

  return {
    compactedOps: winners, droppedOpIds, conflicts, mergedClock,
    originalCount: ops.length, compactedCount: winners.length,
    originalBytes, compactedBytes, savedBytes, reductionPct,
    deterministicDigest: computeSha256Hex(new TextEncoder().encode(canonical)),
  };
}

/** 오프라인 다중 디바이스 시나리오 기본 CRDT 연산 큐를 생성한다. */
export function createDefaultCrdtOpLog(): readonly CrdtOperation[] {
  return [
    { opId: "op-01", entityKey: "cut-01:layer-ink:stroke", cutId: "cut-01", kind: "stroke-commit", actorId: "ipad-main", lamport: 1, clock: { "ipad-main": 1, "desktop-studio": 0, "assist-pen": 0 }, payloadSummary: "컷 1 펜선 초안 스트로크 142획", payloadBytes: 18400 },
    { opId: "op-02", entityKey: "cut-01:layer-ink:stroke", cutId: "cut-01", kind: "stroke-commit", actorId: "ipad-main", lamport: 2, clock: { "ipad-main": 2, "desktop-studio": 0, "assist-pen": 0 }, payloadSummary: "컷 1 펜선 필압 보정(중복 덮어쓰기 #1)", payloadBytes: 19200 },
    { opId: "op-03", entityKey: "cut-01:layer-ink:stroke", cutId: "cut-01", kind: "stroke-commit", actorId: "ipad-main", lamport: 3, clock: { "ipad-main": 3, "desktop-studio": 0, "assist-pen": 0 }, payloadSummary: "컷 1 펜선 최종 클린업(인과 최신)", payloadBytes: 20100 },
    { opId: "op-04", entityKey: "cut-02:balloon-lead:text", cutId: "cut-02", kind: "balloon-text", actorId: "desktop-studio", lamport: 4, clock: { "ipad-main": 2, "desktop-studio": 1, "assist-pen": 0 }, payloadSummary: "컷 2 대사: 비가 그치기 전에 출발해야 해.", payloadBytes: 2400 },
    { opId: "op-05", entityKey: "cut-02:balloon-lead:text", cutId: "cut-02", kind: "balloon-text", actorId: "ipad-main", lamport: 4, clock: { "ipad-main": 4, "desktop-studio": 0, "assist-pen": 0 }, payloadSummary: "컷 2 대사: 폭우가 몰아치기 전에 열쇠를 찾아야 해.", payloadBytes: 2650 },
    { opId: "op-06", entityKey: "cut-03:layer-shade:opacity", cutId: "cut-03", kind: "layer-opacity", actorId: "assist-pen", lamport: 5, clock: { "ipad-main": 3, "desktop-studio": 0, "assist-pen": 1 }, payloadSummary: "컷 3 그림자 레이어 불투명도 45%", payloadBytes: 1280 },
    { opId: "op-07", entityKey: "cut-03:layer-shade:opacity", cutId: "cut-03", kind: "layer-opacity", actorId: "assist-pen", lamport: 6, clock: { "ipad-main": 3, "desktop-studio": 0, "assist-pen": 2 }, payloadSummary: "컷 3 그림자 레이어 불투명도 62%(최종)", payloadBytes: 1320 },
  ];
}

// 3. OPFS 대용량 16K 원고 청크 무결성(CRC32/SHA-256) · XOR 패리티 복구 엔진

export interface ManuscriptChunk {
  readonly chunkId: string;
  readonly index: number;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly opfsPath: string;
  readonly canvasBandPx: string;
  readonly data: Uint8Array;
  readonly expectedCrc32: string;
  readonly expectedSha256: string;
}

export interface ManuscriptParityStripe {
  readonly stripeId: string;
  readonly manuscriptTitleKo: string;
  readonly manuscriptTitleEn: string;
  readonly chunkByteSize: number;
  readonly chunks: readonly ManuscriptChunk[];
  readonly parityData: Uint8Array;
  readonly expectedParityCrc32: string;
  readonly expectedParitySha256: string;
}

export type ChunkIntegrityStatus = "healthy" | "repaired" | "unrecoverable";
export type StripeRecoveryOverallStatus = "healthy" | "repaired" | "parity-rebuilt" | "degraded-unrecoverable";

export interface ChunkVerificationItem {
  readonly chunkId: string;
  readonly index: number;
  readonly opfsPath: string;
  readonly actualCrc32: string;
  readonly expectedCrc32: string;
  readonly actualSha256: string;
  readonly expectedSha256: string;
  readonly crc32Valid: boolean;
  readonly sha256Valid: boolean;
  readonly status: ChunkIntegrityStatus;
  readonly repairedByteDiffCount: number;
}

export interface ManuscriptRecoveryReport {
  readonly stripeId: string;
  readonly overallStatus: StripeRecoveryOverallStatus;
  readonly parityValidBefore: boolean;
  readonly parityValidAfter: boolean;
  readonly corruptedChunkIds: readonly string[];
  readonly repairedChunkIds: readonly string[];
  readonly unrecoverableChunkIds: readonly string[];
  readonly chunkResults: readonly ChunkVerificationItem[];
  readonly repairedStripe: ManuscriptParityStripe;
  readonly losslessVerified: boolean;
  readonly summaryKo: string;
  readonly summaryEn: string;
}

function xorChunkBuffers(buffers: readonly Uint8Array[], byteSize: number): Uint8Array {
  const result = new Uint8Array(byteSize);
  for (const buf of buffers) {
    for (let i = 0; i < byteSize; i += 1) result[i] = (result[i] ?? 0) ^ (buf[i] ?? 0);
  }
  return result;
}

function generateTileBytes(seed: number, byteSize: number): Uint8Array {
  const buf = new Uint8Array(byteSize);
  let state = (seed ^ 0x9e3779b9) >>> 0;
  for (let i = 0; i < byteSize; i += 1) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    buf[i] = (state >>> 24) & 0xff;
  }
  return buf;
}

/** OPFS 16K 원고 청크 4개와 단일 XOR 패리티 스트라이프를 결정론적으로 구성한다. */
export function createDefaultManuscriptParityStripe(chunkByteSize = 256): ManuscriptParityStripe {
  const safeSize = Math.max(16, Math.floor(chunkByteSize));
  const specs = [
    ["chunk-00", "16K 타일 #0 (선화·말풍선 상단)", "16K Tile #0 (Lineart & Top Balloons)", "/opfs/manuscripts/ep-42/16k-tile-00.bin", "y: 0–4096 px", 0x4200101],
    ["chunk-01", "16K 타일 #1 (주인공 클로즈업·밑색)", "16K Tile #1 (Lead Close-up & Flats)", "/opfs/manuscripts/ep-42/16k-tile-01.bin", "y: 4096–8192 px", 0x4200202],
    ["chunk-02", "16K 타일 #2 (빗속 액션·림라이트)", "16K Tile #2 (Rain Action & Rim Light)", "/opfs/manuscripts/ep-42/16k-tile-02.bin", "y: 8192–12288 px", 0x4200303],
    ["chunk-03", "16K 타일 #3 (엔딩 연출·효과음 식자)", "16K Tile #3 (Ending Cut & SFX Lettering)", "/opfs/manuscripts/ep-42/16k-tile-03.bin", "y: 12288–16384 px", 0x4200404],
  ] as const;

  const chunks: ManuscriptChunk[] = specs.map(([chunkId, labelKo, labelEn, opfsPath, canvasBandPx, seed], index) => {
    const data = generateTileBytes(seed, safeSize);
    return {
      chunkId, index, labelKo, labelEn, opfsPath, canvasBandPx, data,
      expectedCrc32: computeCrc32Hex(data), expectedSha256: computeSha256Hex(data),
    };
  });

  const parityData = xorChunkBuffers(chunks.map((c) => c.data), safeSize);
  return {
    stripeId: "opfs-ep42-16k-stripe-01",
    manuscriptTitleKo: "42화 비 오는 옥상 (16K OPFS 원고 스트라이프)",
    manuscriptTitleEn: "Ep.42 Rainy Rooftop (16K OPFS Manuscript Stripe)",
    chunkByteSize: safeSize,
    chunks,
    parityData,
    expectedParityCrc32: computeCrc32Hex(parityData),
    expectedParitySha256: computeSha256Hex(parityData),
  };
}

/** 지정 청크 또는 패리티 블록에 결정론적 비트 손상(bit-rot)을 주입한 새 스트라이프를 반환한다. */
export function corruptManuscriptChunk(
  stripe: ManuscriptParityStripe,
  target: string | "parity",
  byteOffset = 12,
  xorMask = 0xa5,
): ManuscriptParityStripe {
  const mask = (xorMask & 0xff) === 0 ? 0xff : xorMask & 0xff;
  if (target === "parity") {
    const mutated = new Uint8Array(stripe.parityData);
    const idx = Math.abs(Math.floor(byteOffset)) % Math.max(1, mutated.length);
    mutated[idx] = (mutated[idx] ?? 0) ^ mask;
    return { ...stripe, parityData: mutated };
  }
  return {
    ...stripe,
    chunks: stripe.chunks.map((chunk) => {
      if (chunk.chunkId !== target) return chunk;
      const mutated = new Uint8Array(chunk.data);
      const span = Math.min(4, mutated.length);
      for (let k = 0; k < span; k += 1) {
        const idx = (Math.abs(Math.floor(byteOffset)) + k) % Math.max(1, mutated.length);
        mutated[idx] = (mutated[idx] ?? 0) ^ ((mask + k * 17) & 0xff);
      }
      return { ...chunk, data: mutated };
    }),
  };
}

interface RawChunkCheck {
  readonly chunk: ManuscriptChunk;
  readonly actualCrc32: string;
  readonly actualSha256: string;
  readonly healthy: boolean;
}

function toChunkResult(
  item: RawChunkCheck,
  status: ChunkIntegrityStatus,
  patch?: { readonly crc32?: string; readonly sha256?: string; readonly diffBytes?: number },
): ChunkVerificationItem {
  const actualCrc32 = patch?.crc32 ?? item.actualCrc32;
  const actualSha256 = patch?.sha256 ?? item.actualSha256;
  return {
    chunkId: item.chunk.chunkId, index: item.chunk.index, opfsPath: item.chunk.opfsPath,
    actualCrc32, expectedCrc32: item.chunk.expectedCrc32,
    actualSha256, expectedSha256: item.chunk.expectedSha256,
    crc32Valid: actualCrc32 === item.chunk.expectedCrc32,
    sha256Valid: actualSha256 === item.chunk.expectedSha256,
    status, repairedByteDiffCount: patch?.diffBytes ?? 0,
  };
}

/**
 * OPFS 16K 원고 청크 전체의 CRC32·SHA-256 무결성을 검사하고,
 * 단일 손상 청크(또는 손상 패리티)를 XOR 패리티로 비트 단위 무손실 복구한다.
 */
export function verifyAndRepairManuscriptChunks(stripe: ManuscriptParityStripe): ManuscriptRecoveryReport {
  const checks: RawChunkCheck[] = stripe.chunks.map((chunk) => {
    const actualCrc32 = computeCrc32Hex(chunk.data);
    const actualSha256 = computeSha256Hex(chunk.data);
    const healthy =
      actualCrc32 === chunk.expectedCrc32 &&
      actualSha256 === chunk.expectedSha256 &&
      chunk.data.length === stripe.chunkByteSize;
    return { chunk, actualCrc32, actualSha256, healthy };
  });

  const parityValidBefore =
    computeCrc32Hex(stripe.parityData) === stripe.expectedParityCrc32 &&
    computeSha256Hex(stripe.parityData) === stripe.expectedParitySha256 &&
    stripe.parityData.length === stripe.chunkByteSize;

  const corrupted = checks.filter((item) => !item.healthy);
  const corruptedChunkIds = corrupted.map((item) => item.chunk.chunkId);
  const makeReport = (
    overallStatus: StripeRecoveryOverallStatus,
    parityValidAfter: boolean,
    repairedChunkIds: readonly string[],
    unrecoverableChunkIds: readonly string[],
    chunkResults: readonly ChunkVerificationItem[],
    repairedStripe: ManuscriptParityStripe,
    losslessVerified: boolean,
    summaryKo: string,
    summaryEn: string,
  ): ManuscriptRecoveryReport => ({
    stripeId: stripe.stripeId, overallStatus, parityValidBefore, parityValidAfter,
    corruptedChunkIds, repairedChunkIds, unrecoverableChunkIds, chunkResults,
    repairedStripe, losslessVerified, summaryKo, summaryEn,
  });

  if (corrupted.length === 0 && parityValidBefore) {
    return makeReport(
      "healthy", true, [], [], checks.map((c) => toChunkResult(c, "healthy")), stripe, true,
      `전체 ${stripe.chunks.length}개 16K 청크와 XOR 패리티 블록의 CRC32·SHA-256 무결성이 100% 정상입니다.`,
      `All ${stripe.chunks.length} 16K chunks and XOR parity block passed CRC32 & SHA-256 verification.`,
    );
  }

  if (corrupted.length === 0 && !parityValidBefore) {
    const rebuilt = xorChunkBuffers(stripe.chunks.map((c) => c.data), stripe.chunkByteSize);
    const rebuiltOk = computeCrc32Hex(rebuilt) === stripe.expectedParityCrc32 && computeSha256Hex(rebuilt) === stripe.expectedParitySha256;
    return makeReport(
      rebuiltOk ? "parity-rebuilt" : "degraded-unrecoverable", rebuiltOk, [], [],
      checks.map((c) => toChunkResult(c, "healthy")), { ...stripe, parityData: rebuilt }, rebuiltOk,
      rebuiltOk ? "손상된 XOR 패리티 블록을 정상 청크 XOR 합산으로 무손실 재구축했습니다." : "패리티 블록 재구축 후 기대 해시와 불일치해 복구를 중단했습니다.",
      rebuiltOk ? "Rebuilt corrupted XOR parity block losslessly from healthy data chunks." : "Rebuilt parity block failed expected digest verification.",
    );
  }

  if (corrupted.length === 1 && parityValidBefore) {
    const target = corrupted[0];
    if (target) {
      const others = stripe.chunks.filter((c) => c.chunkId !== target.chunk.chunkId).map((c) => c.data);
      const recovered = xorChunkBuffers([...others, stripe.parityData], stripe.chunkByteSize);
      const recCrc = computeCrc32Hex(recovered);
      const recSha = computeSha256Hex(recovered);
      let diffBytes = 0;
      for (let i = 0; i < stripe.chunkByteSize; i += 1) {
        if ((target.chunk.data[i] ?? -1) !== (recovered[i] ?? -1)) diffBytes += 1;
      }
      if (recCrc === target.chunk.expectedCrc32 && recSha === target.chunk.expectedSha256) {
        const nextStripe: ManuscriptParityStripe = {
          ...stripe,
          chunks: stripe.chunks.map((c) => (c.chunkId === target.chunk.chunkId ? { ...c, data: recovered } : c)),
        };
        return makeReport(
          "repaired", true, [target.chunk.chunkId], [],
          checks.map((c) =>
            c.chunk.chunkId === target.chunk.chunkId
              ? toChunkResult(c, "repaired", { crc32: recCrc, sha256: recSha, diffBytes })
              : toChunkResult(c, "healthy"),
          ),
          nextStripe, true,
          `${target.chunk.chunkId} 손상(${diffBytes}B)을 XOR 패리티로 무손실 복구하고 CRC32·SHA-256 일치 검증을 마쳤습니다.`,
          `Losslessly repaired ${target.chunk.chunkId} (${diffBytes}B) via XOR parity and verified CRC32 & SHA-256.`,
        );
      }
    }
  }

  return makeReport(
    "degraded-unrecoverable", parityValidBefore, [], corruptedChunkIds,
    checks.map((c) => toChunkResult(c, c.healthy ? "healthy" : "unrecoverable")), stripe, false,
    !parityValidBefore
      ? `데이터 청크(${corruptedChunkIds.join(", ")})와 패리티 블록이 동시 손상되어 단일 XOR 복구가 불가합니다. 원격 체크포인트 복원이 필요합니다.`
      : `손상 청크 ${corruptedChunkIds.length}개(${corruptedChunkIds.join(", ")})가 동시 발생해 단일 XOR 패리티 복구 한계를 초과했습니다.`,
    !parityValidBefore
      ? `Data chunk(s) (${corruptedChunkIds.join(", ")}) and parity block are both corrupted; restore from checkpoint.`
      : `${corruptedChunkIds.length} corrupted chunks (${corruptedChunkIds.join(", ")}) exceed single-XOR parity capacity.`,
  );
}

// 4. 멀티탭 단일 쓰기 소유 잠금(Single-Writer Lease · Fencing Token) 상태기계

export type TabLeaseRole = "writer" | "read-only" | "disconnected";
export type LeaseAuditEventKind =
  | "acquired" | "renewed" | "heartbeat-expired" | "handoff"
  | "write-accepted" | "write-fenced" | "read-only-fallback" | "tab-released";

export interface TabSessionState {
  readonly tabId: string;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly role: TabLeaseRole;
  readonly knownFencingEpoch: number;
  readonly lastHeartbeatMs: number;
  readonly pendingReadOnlyDraftCount: number;
  readonly blockedWriteAttempts: number;
  readonly acceptedWrites: number;
}

export interface LeaseAuditEvent {
  readonly eventId: string;
  readonly atMs: number;
  readonly tabId: string;
  readonly kind: LeaseAuditEventKind;
  readonly fencingEpoch: number;
  readonly detailKo: string;
  readonly detailEn: string;
}

export interface TabWriterLeaseState {
  readonly documentId: string;
  readonly nowMs: number;
  readonly leaseTtlMs: number;
  readonly activeWriterTabId: string | null;
  readonly fencingEpoch: number;
  readonly leaseExpiresAtMs: number;
  readonly tabs: readonly TabSessionState[];
  readonly committedWriteSequence: number;
  readonly auditSequence: number;
  readonly auditLog: readonly LeaseAuditEvent[];
}

export type TabWriterLeaseAction =
  | { readonly type: "tick"; readonly deltaMs: number }
  | { readonly type: "heartbeat"; readonly tabId: string }
  | { readonly type: "request-write-lease"; readonly tabId: string; readonly forceTakeover?: boolean }
  | { readonly type: "attempt-write"; readonly tabId: string; readonly submittedEpoch: number; readonly payloadLabel: string }
  | { readonly type: "release-lease"; readonly tabId: string }
  | { readonly type: "register-tab"; readonly tabId: string; readonly labelKo: string; readonly labelEn: string };

const MAX_AUDIT_LOG = 24;

function withAudit(
  state: TabWriterLeaseState,
  patch: Partial<Omit<TabWriterLeaseState, "auditSequence" | "auditLog">>,
  event: Omit<LeaseAuditEvent, "eventId" | "atMs">,
): TabWriterLeaseState {
  const nextSeq = state.auditSequence + 1;
  const entry: LeaseAuditEvent = {
    ...event,
    atMs: patch.nowMs ?? state.nowMs,
    eventId: `evt-${String(nextSeq).padStart(3, "0")}-${event.kind}`,
  };
  return { ...state, ...patch, auditSequence: nextSeq, auditLog: [entry, ...state.auditLog].slice(0, MAX_AUDIT_LOG) };
}

function expireLeaseIfDue(state: TabWriterLeaseState): TabWriterLeaseState {
  if (state.activeWriterTabId === null || state.nowMs < state.leaseExpiresAtMs) return state;
  const expiredTabId = state.activeWriterTabId;
  return withAudit(
    state,
    {
      activeWriterTabId: null,
      tabs: state.tabs.map((t) => (t.tabId === expiredTabId ? { ...t, role: "read-only" as const } : t)),
    },
    {
      tabId: expiredTabId, kind: "heartbeat-expired", fencingEpoch: state.fencingEpoch,
      detailKo: `${expiredTabId} 하트비트 TTL(${state.leaseTtlMs}ms) 만료 — 비파괴 읽기 전용으로 강등`,
      detailEn: `${expiredTabId} heartbeat TTL (${state.leaseTtlMs}ms) expired — demoted to non-destructive read-only`,
    },
  );
}

/** 3개 브라우저 탭이 열린 초기 멀티탭 단일 쓰기 잠금 상태를 생성한다. */
export function createInitialTabWriterLeaseState(leaseTtlMs = 5000): TabWriterLeaseState {
  const safeTtl = Math.max(1000, Math.floor(leaseTtlMs));
  const mk = (tabId: string, labelKo: string, labelEn: string, role: TabLeaseRole): TabSessionState => ({
    tabId, labelKo, labelEn, role, knownFencingEpoch: 1, lastHeartbeatMs: 1000,
    pendingReadOnlyDraftCount: 0, blockedWriteAttempts: 0, acceptedWrites: 0,
  });
  return {
    documentId: "manuscript-ep-042", nowMs: 1000, leaseTtlMs: safeTtl,
    activeWriterTabId: "tab-main", fencingEpoch: 1, leaseExpiresAtMs: 1000 + safeTtl,
    committedWriteSequence: 0, auditSequence: 1,
    tabs: [
      mk("tab-main", "탭 A · 메인 작화 캔버스", "Tab A · Main Drawing Canvas", "writer"),
      mk("tab-ref", "탭 B · 대사·레퍼런스 뷰어", "Tab B · Script & Reference Viewer", "read-only"),
      mk("tab-review", "탭 C · 어시스턴트 검수 창", "Tab C · Assistant Review Window", "read-only"),
    ],
    auditLog: [{
      eventId: "evt-001-acquired", atMs: 1000, tabId: "tab-main", kind: "acquired", fencingEpoch: 1,
      detailKo: "tab-main 단일 쓰기 잠금 획득 (Epoch #1)",
      detailEn: "tab-main acquired single-writer lease (Epoch #1)",
    }],
  };
}

/**
 * 멀티탭 단일 쓰기 소유 잠금 상태기계를 한 단계 전이한다.
 * - 하트비트 TTL 만료 감지 시 구 쓰기 탭을 비파괴 읽기 전용으로 강등
 * - 새 쓰기 소유권 부여·강제 인계 시 펜싱 토큰(fencingEpoch)을 단조 증가
 * - 구 에폭/비소유 탭 쓰기는 차단(write-fenced)하되 입력 초안을 읽기 전용 임시 버퍼에 보존
 */
export function stepTabWriterLease(state: TabWriterLeaseState, action: TabWriterLeaseAction): TabWriterLeaseState {
  if (action.type === "tick") {
    return expireLeaseIfDue({ ...state, nowMs: state.nowMs + Math.max(0, Math.floor(action.deltaMs)) });
  }
  const cur = expireLeaseIfDue(state);

  if (action.type === "register-tab") {
    if (cur.tabs.some((t) => t.tabId === action.tabId)) return cur;
    const joined: TabSessionState = {
      tabId: action.tabId, labelKo: action.labelKo, labelEn: action.labelEn, role: "read-only",
      knownFencingEpoch: cur.fencingEpoch, lastHeartbeatMs: cur.nowMs,
      pendingReadOnlyDraftCount: 0, blockedWriteAttempts: 0, acceptedWrites: 0,
    };
    return withAudit(cur, { tabs: [...cur.tabs, joined] }, {
      tabId: action.tabId, kind: "read-only-fallback", fencingEpoch: cur.fencingEpoch,
      detailKo: `${action.tabId} 합류 — 기존 쓰기 잠금 보호를 위해 읽기 전용 모드로 시작`,
      detailEn: `${action.tabId} joined in read-only mode to preserve active writer lock`,
    });
  }
  if (!cur.tabs.some((t) => t.tabId === action.tabId)) return cur;

  if (action.type === "heartbeat") {
    if (cur.activeWriterTabId !== action.tabId) return cur;
    return withAudit(cur, {
      leaseExpiresAtMs: cur.nowMs + cur.leaseTtlMs,
      tabs: cur.tabs.map((t) => (t.tabId === action.tabId ? { ...t, lastHeartbeatMs: cur.nowMs } : t)),
    }, {
      tabId: action.tabId, kind: "renewed", fencingEpoch: cur.fencingEpoch,
      detailKo: `${action.tabId} 하트비트 갱신 (Epoch #${cur.fencingEpoch}, TTL +${cur.leaseTtlMs}ms)`,
      detailEn: `${action.tabId} renewed heartbeat (Epoch #${cur.fencingEpoch}, TTL +${cur.leaseTtlMs}ms)`,
    });
  }

  if (action.type === "release-lease") {
    if (cur.activeWriterTabId !== action.tabId) return cur;
    return withAudit(cur, {
      activeWriterTabId: null, leaseExpiresAtMs: cur.nowMs,
      tabs: cur.tabs.map((t) => (t.tabId === action.tabId ? { ...t, role: "read-only" as const } : t)),
    }, {
      tabId: action.tabId, kind: "tab-released", fencingEpoch: cur.fencingEpoch,
      detailKo: `${action.tabId} 단일 쓰기 잠금 자진 반납 — 읽기 전용 대기 전환`,
      detailEn: `${action.tabId} released writer lease voluntarily — switched to read-only`,
    });
  }

  if (action.type === "request-write-lease") {
    if (cur.activeWriterTabId === action.tabId) return stepTabWriterLease(cur, { type: "heartbeat", tabId: action.tabId });
    if (cur.activeWriterTabId === null || action.forceTakeover === true) {
      const prev = cur.activeWriterTabId;
      const nextEpoch = cur.fencingEpoch + 1;
      const isHandoff = prev !== null;
      return withAudit(cur, {
        activeWriterTabId: action.tabId, fencingEpoch: nextEpoch, leaseExpiresAtMs: cur.nowMs + cur.leaseTtlMs,
        tabs: cur.tabs.map((t) =>
          t.tabId === action.tabId
            ? { ...t, role: "writer" as const, knownFencingEpoch: nextEpoch, lastHeartbeatMs: cur.nowMs }
            : { ...t, role: t.role === "disconnected" ? ("disconnected" as const) : ("read-only" as const) },
        ),
      }, {
        tabId: action.tabId, kind: isHandoff ? "handoff" : "acquired", fencingEpoch: nextEpoch,
        detailKo: isHandoff
          ? `${action.tabId} 강제 쓰기 인계 (${prev} → 읽기 전용 강등, 새 펜싱 Epoch #${nextEpoch})`
          : `${action.tabId} 만료/유휴 잠금 획득 (새 펜싱 Epoch #${nextEpoch})`,
        detailEn: isHandoff
          ? `${action.tabId} took over writer lease (${prev} demoted to read-only, new Epoch #${nextEpoch})`
          : `${action.tabId} acquired vacant/expired lease (new Epoch #${nextEpoch})`,
      });
    }
    return withAudit(cur, {
      tabs: cur.tabs.map((t) => (t.tabId === action.tabId ? { ...t, role: "read-only" as const } : t)),
    }, {
      tabId: action.tabId, kind: "read-only-fallback", fencingEpoch: cur.fencingEpoch,
      detailKo: `${cur.activeWriterTabId} 잠금 활성 중 — ${action.tabId} 비파괴 읽기 전용 폴백 유지`,
      detailEn: `${cur.activeWriterTabId} holds active lease — ${action.tabId} stays in non-destructive read-only fallback`,
    });
  }

  const authorized =
    cur.activeWriterTabId === action.tabId &&
    action.submittedEpoch === cur.fencingEpoch &&
    cur.nowMs < cur.leaseExpiresAtMs;

  if (authorized) {
    const nextCommit = cur.committedWriteSequence + 1;
    return withAudit(cur, {
      committedWriteSequence: nextCommit,
      tabs: cur.tabs.map((t) => (t.tabId === action.tabId ? { ...t, acceptedWrites: t.acceptedWrites + 1, lastHeartbeatMs: cur.nowMs } : t)),
    }, {
      tabId: action.tabId, kind: "write-accepted", fencingEpoch: cur.fencingEpoch,
      detailKo: `${action.tabId} OPFS 쓰기 커밋 #${nextCommit} 승인 (Epoch #${action.submittedEpoch}: ${action.payloadLabel})`,
      detailEn: `${action.tabId} OPFS write #${nextCommit} accepted (Epoch #${action.submittedEpoch}: ${action.payloadLabel})`,
    });
  }

  return withAudit(cur, {
    tabs: cur.tabs.map((t) =>
      t.tabId === action.tabId
        ? {
            ...t,
            role: t.role === "disconnected" ? ("disconnected" as const) : ("read-only" as const),
            blockedWriteAttempts: t.blockedWriteAttempts + 1,
            pendingReadOnlyDraftCount: t.pendingReadOnlyDraftCount + 1,
          }
        : t,
    ),
  }, {
    tabId: action.tabId, kind: "write-fenced", fencingEpoch: cur.fencingEpoch,
    detailKo: `${action.tabId} 쓰기 차단(제출 Epoch #${action.submittedEpoch} ≠ 현재 #${cur.fencingEpoch}) — 초안을 읽기 전용 버퍼에 무손실 격리`,
    detailEn: `${action.tabId} write fenced (submitted Epoch #${action.submittedEpoch} != current #${cur.fencingEpoch}) — draft safely buffered`,
  });
}
