/**
 * 시맨틱 버전(vMajor.Minor.Patch) + 컷/레이어 LOD 티어 기반 동적 리소스 스트리밍 · OPFS LRU 캐시 엔진 (Wave 41A).
 * - 순수 32비트 정수 연산 기반 결정론적 SHA-256(FIPS 180-4) 청크 무결성 검증 (BigInt 리터럴 미사용)
 * - 뷰포트 거리·스크롤 방향·줌 배율 기반 프리페치 우선순위 큐
 * - OPFS LRU 메모리 예산 초과 시 자동 축출(eviction) 및 시맨틱 버전 차등 무효화
 * - 100% 인메모리 불변 상태 모델 (브라우저 스토리지 및 private Map store 미사용)
 */

export type ResourceLodTier = "thumb" | "working" | "print-4k";
export type ScrollDirection = "down" | "up" | "idle";
export type SemVerBumpKind = "major" | "minor" | "patch";
export type PrefetchReason = "viewport-visible" | "scroll-lookahead" | "zoom-upgrade" | "version-refresh" | "background-warm";
export type CacheChunkStatus = "valid" | "stale-patch" | "stale-minor";
export type CacheFetchRejectReason = "sha256-mismatch" | "exceeds-total-budget";

export interface SemanticVersion {
  readonly major: number;
  readonly minor: number;
  readonly patch: number;
}

export interface LodTierSpec {
  readonly tier: ResourceLodTier;
  readonly resolutionScale: number;
  readonly minZoom: number;
  readonly maxZoom: number;
  readonly defaultBytes: number;
  readonly labelKo: string;
  readonly labelEn: string;
}

export interface SemanticResourceAsset {
  readonly resourceId: string;
  readonly cutIndex: number;
  readonly cutTitle: string;
  readonly layerId: string;
  readonly layerName: string;
  readonly yOffsetPx: number;
  readonly heightPx: number;
  readonly version: SemanticVersion;
  readonly lodByteSizes: Readonly<Record<ResourceLodTier, number>>;
  readonly lodHashes: Readonly<Record<ResourceLodTier, string>>;
}

export interface ViewportScrollState {
  readonly scrollY: number;
  readonly viewportHeight: number;
  readonly scrollVelocityPxPerSec: number;
  readonly direction: ScrollDirection;
  readonly zoomLevel: number;
  readonly preferredLodOverride?: ResourceLodTier;
}

export interface PrefetchQueueEntry {
  readonly chunkKey: string;
  readonly resourceId: string;
  readonly cutIndex: number;
  readonly cutTitle: string;
  readonly layerName: string;
  readonly tier: ResourceLodTier;
  readonly targetVersion: SemanticVersion;
  readonly byteSize: number;
  readonly priorityScore: number;
  readonly distancePx: number;
  readonly isVisible: boolean;
  readonly isInScrollDirection: boolean;
  readonly reason: PrefetchReason;
}

export interface CachedResourceChunk {
  readonly chunkKey: string;
  readonly resourceId: string;
  readonly tier: ResourceLodTier;
  readonly version: SemanticVersion;
  readonly byteSize: number;
  readonly sha256: string;
  readonly opfsPath: string;
  readonly insertedAtTick: number;
  readonly lastAccessedTick: number;
  readonly pinned: boolean;
  readonly status: CacheChunkStatus;
}

export interface EvictionEvent {
  readonly tick: number;
  readonly evictedKey: string;
  readonly resourceId: string;
  readonly tier: ResourceLodTier;
  readonly freedBytes: number;
  readonly reason: "lru-budget-exceeded" | "semver-major-invalidation" | "semver-minor-invalidation";
}

export interface OpfsLruCacheState {
  readonly budgetBytes: number;
  readonly usedBytes: number;
  readonly entries: readonly CachedResourceChunk[];
  readonly evictionLog: readonly EvictionEvent[];
  readonly accessTick: number;
  readonly hits: number;
  readonly misses: number;
  readonly verifiedWrites: number;
  readonly corruptionsBlocked: number;
  readonly versionInvalidations: number;
}

export interface ChunkCacheWriteResult {
  readonly ok: boolean;
  readonly rejectReason: CacheFetchRejectReason | null;
  readonly computedHash: string;
  readonly expectedHash: string;
  readonly evictedEvents: readonly EvictionEvent[];
  readonly cache: OpfsLruCacheState;
}

export interface ChunkCacheAccessResult {
  readonly hit: boolean;
  readonly stale: boolean;
  readonly entry: CachedResourceChunk | null;
  readonly cache: OpfsLruCacheState;
}

export interface PrefetchStepReport {
  readonly fetchedKeys: readonly string[];
  readonly evictedCount: number;
  readonly remainingQueueLength: number;
  readonly cache: OpfsLruCacheState;
  readonly nextQueue: readonly PrefetchQueueEntry[];
}

export interface SemVerInvalidationResult {
  readonly assets: readonly SemanticResourceAsset[];
  readonly cache: OpfsLruCacheState;
  readonly previousVersion: SemanticVersion | null;
  readonly nextVersion: SemanticVersion | null;
  readonly evictedKeys: readonly string[];
  readonly markedStaleKeys: readonly string[];
}

export interface StreamCacheTelemetry {
  readonly usedBytes: number;
  readonly budgetBytes: number;
  readonly utilizationPct: number;
  readonly cachedChunkCount: number;
  readonly totalEvictions: number;
  readonly hitRatePct: number;
  readonly verifiedWrites: number;
  readonly corruptionsBlocked: number;
  readonly versionInvalidations: number;
}

export const LOD_TIER_SPECS: Readonly<Record<ResourceLodTier, LodTierSpec>> = {
  thumb: { tier: "thumb", resolutionScale: 0.25, minZoom: 0.1, maxZoom: 0.65, defaultBytes: 32 * 1024, labelKo: "썸네일 0.25x", labelEn: "Thumb 0.25x" },
  working: { tier: "working", resolutionScale: 1.0, minZoom: 0.65, maxZoom: 1.65, defaultBytes: 96 * 1024, labelKo: "작업용 1.0x", labelEn: "Working 1.0x" },
  "print-4k": { tier: "print-4k", resolutionScale: 2.0, minZoom: 1.65, maxZoom: 8.0, defaultBytes: 224 * 1024, labelKo: "인쇄 4K 2.0x", labelEn: "Print 4K 2.0x" },
};

export const RESOURCE_LOD_TIERS: readonly ResourceLodTier[] = ["thumb", "working", "print-4k"];

export const DEFAULT_VIEWPORT_SCROLL_STATE: ViewportScrollState = {
  scrollY: 0,
  viewportHeight: 1600,
  scrollVelocityPxPerSec: 640,
  direction: "down",
  zoomLevel: 1.0,
};

// FIPS 180-4 SHA-256 초기 해시값 · 64라운드 상수 (순수 32비트 정수)
const SHA256_H0 = new Uint32Array([
  0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
]);
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

function rotr32(value: number, bits: number): number {
  return ((value >>> bits) | (value << (32 - bits))) >>> 0;
}

/** 순수 32비트 정수 연산 기반 결정론적 SHA-256 해시(64자리 소문자 hex, BigInt 미사용). */
export function computeSha256Hex(bytes: Uint8Array): string {
  const byteLength = bytes.length;
  const totalLen = Math.ceil((byteLength + 9) / 64) * 64;
  const padded = new Uint8Array(totalLen);
  padded.set(bytes, 0);
  padded[byteLength] = 0x80;

  const bitLenLow = (byteLength << 3) >>> 0;
  const bitLenHigh = Math.floor(byteLength / 0x20000000) >>> 0;
  const lenOff = totalLen - 8;
  padded[lenOff] = (bitLenHigh >>> 24) & 0xff;
  padded[lenOff + 1] = (bitLenHigh >>> 16) & 0xff;
  padded[lenOff + 2] = (bitLenHigh >>> 8) & 0xff;
  padded[lenOff + 3] = bitLenHigh & 0xff;
  padded[lenOff + 4] = (bitLenLow >>> 24) & 0xff;
  padded[lenOff + 5] = (bitLenLow >>> 16) & 0xff;
  padded[lenOff + 6] = (bitLenLow >>> 8) & 0xff;
  padded[lenOff + 7] = bitLenLow & 0xff;

  let h0 = SHA256_H0[0] ?? 0;
  let h1 = SHA256_H0[1] ?? 0;
  let h2 = SHA256_H0[2] ?? 0;
  let h3 = SHA256_H0[3] ?? 0;
  let h4 = SHA256_H0[4] ?? 0;
  let h5 = SHA256_H0[5] ?? 0;
  let h6 = SHA256_H0[6] ?? 0;
  let h7 = SHA256_H0[7] ?? 0;
  const w = new Uint32Array(64);

  for (let offset = 0; offset < totalLen; offset += 64) {
    for (let i = 0; i < 16; i += 1) {
      const idx = offset + i * 4;
      w[i] = (((padded[idx] ?? 0) << 24) | ((padded[idx + 1] ?? 0) << 16) | ((padded[idx + 2] ?? 0) << 8) | (padded[idx + 3] ?? 0)) >>> 0;
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
      const S1 = (rotr32(e, 6) ^ rotr32(e, 11) ^ rotr32(e, 25)) >>> 0;
      const ch = ((e & f) ^ ((~e >>> 0) & g)) >>> 0;
      const temp1 = (h + S1 + ch + (SHA256_K[i] ?? 0) + (w[i] ?? 0)) >>> 0;
      const S0 = (rotr32(a, 2) ^ rotr32(a, 13) ^ rotr32(a, 22)) >>> 0;
      const maj = ((a & b) ^ (a & c) ^ (b & c)) >>> 0;
      const temp2 = (S0 + maj) >>> 0;
      h = g; g = f; f = e; e = (d + temp1) >>> 0;
      d = c; c = b; b = a; a = (temp1 + temp2) >>> 0;
    }

    h0 = (h0 + a) >>> 0; h1 = (h1 + b) >>> 0; h2 = (h2 + c) >>> 0; h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0; h5 = (h5 + f) >>> 0; h6 = (h6 + g) >>> 0; h7 = (h7 + h) >>> 0;
  }

  return [h0, h1, h2, h3, h4, h5, h6, h7].map((word) => word.toString(16).padStart(8, "0")).join("");
}

/** UTF-8 문자열의 결정론적 SHA-256 해시를 계산한다. */
export function computeSha256HexFromText(text: string): string {
  const bytes = new Uint8Array(text.length * 3);
  let pos = 0;
  for (let i = 0; i < text.length; i += 1) {
    const code = text.charCodeAt(i);
    if (code < 0x80) {
      bytes[pos++] = code;
    } else if (code < 0x800) {
      bytes[pos++] = 0xc0 | (code >>> 6);
      bytes[pos++] = 0x80 | (code & 0x3f);
    } else if (code >= 0xd800 && code <= 0xdbff && i + 1 < text.length) {
      const cp = 0x10000 + (((code - 0xd800) << 10) | (text.charCodeAt(++i) - 0xdc00));
      bytes[pos++] = 0xf0 | (cp >>> 18);
      bytes[pos++] = 0x80 | ((cp >>> 12) & 0x3f);
      bytes[pos++] = 0x80 | ((cp >>> 6) & 0x3f);
      bytes[pos++] = 0x80 | (cp & 0x3f);
    } else {
      bytes[pos++] = 0xe0 | (code >>> 12);
      bytes[pos++] = 0x80 | ((code >>> 6) & 0x3f);
      bytes[pos++] = 0x80 | (code & 0x3f);
    }
  }
  return computeSha256Hex(bytes.subarray(0, pos));
}

export function parseSemanticVersion(raw: string): SemanticVersion | null {
  const match = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(raw.trim());
  if (!match) return null;
  const major = Number(match[1]);
  const minor = Number(match[2]);
  const patch = Number(match[3]);
  return Number.isInteger(major) && Number.isInteger(minor) && Number.isInteger(patch) ? { major, minor, patch } : null;
}

export function formatSemanticVersion(version: SemanticVersion): string {
  return `v${version.major}.${version.minor}.${version.patch}`;
}

export function compareSemanticVersions(a: SemanticVersion, b: SemanticVersion): -1 | 0 | 1 {
  if (a.major !== b.major) return a.major < b.major ? -1 : 1;
  if (a.minor !== b.minor) return a.minor < b.minor ? -1 : 1;
  if (a.patch !== b.patch) return a.patch < b.patch ? -1 : 1;
  return 0;
}

export function bumpSemanticVersion(version: SemanticVersion, kind: SemVerBumpKind): SemanticVersion {
  if (kind === "major") return { major: version.major + 1, minor: 0, patch: 0 };
  if (kind === "minor") return { major: version.major, minor: version.minor + 1, patch: 0 };
  return { major: version.major, minor: version.minor, patch: version.patch + 1 };
}

export function makeResourceChunkKey(resourceId: string, tier: ResourceLodTier): string {
  return `${resourceId}@${tier}`;
}

export function makeOpfsChunkPath(resourceId: string, tier: ResourceLodTier, version: SemanticVersion): string {
  return `/opfs/toonstudio/chunks/${resourceId}/${tier}/${formatSemanticVersion(version)}.bin`;
}

export function selectLodTierForZoom(zoomLevel: number, override?: ResourceLodTier): ResourceLodTier {
  if (override) return override;
  if (zoomLevel < LOD_TIER_SPECS.working.minZoom) return "thumb";
  return zoomLevel >= LOD_TIER_SPECS["print-4k"].minZoom ? "print-4k" : "working";
}

/** 리소스·버전·LOD 조합에 대한 결정론적 청크 바이너리 페이로드를 합성한다. */
export function synthesizeDeterministicChunkPayload(
  resourceId: string,
  tier: ResourceLodTier,
  version: SemanticVersion,
  byteLength: number,
): Uint8Array {
  const safeLength = Math.max(64, Math.floor(byteLength));
  const payload = new Uint8Array(safeLength);
  const seedHex = computeSha256HexFromText(`${resourceId}|${tier}|${formatSemanticVersion(version)}|${safeLength}`);
  let state = (Number.parseInt(seedHex.slice(0, 8), 16) >>> 0) || 0x9e3779b9;
  for (let i = 0; i < safeLength; i += 1) {
    state ^= (state << 13) >>> 0;
    state ^= state >>> 17;
    state ^= (state << 5) >>> 0;
    payload[i] = state & 0xff;
  }
  return payload;
}

function computeAssetLodHashes(
  resourceId: string,
  version: SemanticVersion,
  lodByteSizes: Readonly<Record<ResourceLodTier, number>>,
): Readonly<Record<ResourceLodTier, string>> {
  return {
    thumb: computeSha256Hex(synthesizeDeterministicChunkPayload(resourceId, "thumb", version, lodByteSizes.thumb)),
    working: computeSha256Hex(synthesizeDeterministicChunkPayload(resourceId, "working", version, lodByteSizes.working)),
    "print-4k": computeSha256Hex(synthesizeDeterministicChunkPayload(resourceId, "print-4k", version, lodByteSizes["print-4k"])),
  };
}

/** 기본 8컷 웹툰 에피소드 스트리밍 카탈로그를 생성한다. */
export function createDefaultEpisodeStreamCatalog(): readonly SemanticResourceAsset[] {
  const specs = [
    { id: "ep12-cut-01", cutIndex: 1, title: "컷 01 · 빗속 옥상 도입", layerId: "lyr-ink-01", layerName: "선화+빗줄기", heightPx: 920, version: { major: 1, minor: 2, patch: 0 }, scaleFactor: 1.0 },
    { id: "ep12-cut-02", cutIndex: 2, title: "컷 02 · 주인공 클로즈업", layerId: "lyr-shade-02", layerName: "음영+눈 하이라이트", heightPx: 860, version: { major: 1, minor: 2, patch: 1 }, scaleFactor: 0.9 },
    { id: "ep12-cut-03", cutIndex: 3, title: "컷 03 · 골목 추격 롱샷", layerId: "lyr-bg-03", layerName: "배경 3D 투시선", heightPx: 1080, version: { major: 1, minor: 3, patch: 0 }, scaleFactor: 1.15 },
    { id: "ep12-cut-04", cutIndex: 4, title: "컷 04 · 검격 이펙트 패닝", layerId: "lyr-fx-04", layerName: "속도선+광원 VFX", heightPx: 960, version: { major: 1, minor: 3, patch: 2 }, scaleFactor: 1.05 },
    { id: "ep12-cut-05", cutIndex: 5, title: "컷 05 · 대치 투샷", layerId: "lyr-color-05", layerName: "채색+역광 림라이트", heightPx: 880, version: { major: 2, minor: 0, patch: 0 }, scaleFactor: 0.95 },
    { id: "ep12-cut-06", cutIndex: 6, title: "컷 06 · 회상 파스텔 워시", layerId: "lyr-wash-06", layerName: "수채 텍스처 레이어", heightPx: 940, version: { major: 2, minor: 0, patch: 1 }, scaleFactor: 1.0 },
    { id: "ep12-cut-07", cutIndex: 7, title: "컷 07 · 폭발 파편 풀블리드", layerId: "lyr-fx-07", layerName: "파편+블룸 합성", heightPx: 1120, version: { major: 2, minor: 1, patch: 0 }, scaleFactor: 1.2 },
    { id: "ep12-cut-08", cutIndex: 8, title: "컷 08 · 엔딩 클리프행어", layerId: "lyr-final-08", layerName: "식자+최종 그레이딩", heightPx: 900, version: { major: 2, minor: 1, patch: 3 }, scaleFactor: 0.95 },
  ] as const;

  let yCursor = 0;
  return specs.map((spec) => {
    const lodByteSizes: Readonly<Record<ResourceLodTier, number>> = {
      thumb: Math.round(LOD_TIER_SPECS.thumb.defaultBytes * spec.scaleFactor),
      working: Math.round(LOD_TIER_SPECS.working.defaultBytes * spec.scaleFactor),
      "print-4k": Math.round(LOD_TIER_SPECS["print-4k"].defaultBytes * spec.scaleFactor),
    };
    const asset: SemanticResourceAsset = {
      resourceId: spec.id,
      cutIndex: spec.cutIndex,
      cutTitle: spec.title,
      layerId: spec.layerId,
      layerName: spec.layerName,
      yOffsetPx: yCursor,
      heightPx: spec.heightPx,
      version: spec.version,
      lodByteSizes,
      lodHashes: computeAssetLodHashes(spec.id, spec.version, lodByteSizes),
    };
    yCursor += spec.heightPx + 80;
    return asset;
  });
}

export function createOpfsLruCacheState(budgetBytes = 512 * 1024): OpfsLruCacheState {
  return {
    budgetBytes: Math.max(64 * 1024, Math.floor(budgetBytes)),
    usedBytes: 0,
    entries: [],
    evictionLog: [],
    accessTick: 0,
    hits: 0,
    misses: 0,
    verifiedWrites: 0,
    corruptionsBlocked: 0,
    versionInvalidations: 0,
  };
}

function findLruVictimIndex(entries: readonly CachedResourceChunk[]): number {
  let bestIdx = -1;
  let bestEntry: CachedResourceChunk | null = null;
  for (let i = 0; i < entries.length; i += 1) {
    const candidate = entries[i];
    if (!candidate || candidate.pinned) continue;
    if (
      !bestEntry ||
      candidate.lastAccessedTick < bestEntry.lastAccessedTick ||
      (candidate.lastAccessedTick === bestEntry.lastAccessedTick && candidate.chunkKey < bestEntry.chunkKey)
    ) {
      bestIdx = i;
      bestEntry = candidate;
    }
  }
  return bestIdx;
}

function evictUntilUnderLimit(
  initialEntries: readonly CachedResourceChunk[],
  initialUsedBytes: number,
  initialTick: number,
  maxAllowedBytes: number,
): { readonly entries: CachedResourceChunk[]; readonly usedBytes: number; readonly accessTick: number; readonly evicted: EvictionEvent[]; readonly ok: boolean } {
  let entries = [...initialEntries];
  let usedBytes = initialUsedBytes;
  let accessTick = initialTick;
  const evicted: EvictionEvent[] = [];

  while (usedBytes > maxAllowedBytes) {
    const victimIdx = findLruVictimIndex(entries);
    if (victimIdx < 0) return { entries, usedBytes, accessTick, evicted, ok: false };
    const victim = entries[victimIdx];
    if (!victim) break;
    entries = entries.filter((_, idx) => idx !== victimIdx);
    usedBytes -= victim.byteSize;
    accessTick += 1;
    evicted.push({
      tick: accessTick,
      evictedKey: victim.chunkKey,
      resourceId: victim.resourceId,
      tier: victim.tier,
      freedBytes: victim.byteSize,
      reason: "lru-budget-exceeded",
    });
  }
  return { entries, usedBytes, accessTick, evicted, ok: true };
}

/** 캐시 예산을 변경하고 초과분을 LRU 순서로 즉시 자동 축출한다. */
export function resizeOpfsLruBudget(cache: OpfsLruCacheState, nextBudgetBytes: number): OpfsLruCacheState {
  const clampedBudget = Math.max(64 * 1024, Math.floor(nextBudgetBytes));
  const trimmed = evictUntilUnderLimit(cache.entries, cache.usedBytes, cache.accessTick, clampedBudget);
  return {
    ...cache,
    budgetBytes: clampedBudget,
    usedBytes: trimmed.usedBytes,
    entries: trimmed.entries,
    accessTick: trimmed.accessTick,
    evictionLog: [...cache.evictionLog, ...trimmed.evicted],
  };
}

/** 청크의 SHA-256 무결성을 검증한 뒤 OPFS LRU 캐시에 기록한다(예산 초과 시 자동 LRU 축출). */
export function fetchAndCacheChunk(
  cache: OpfsLruCacheState,
  asset: SemanticResourceAsset,
  tier: ResourceLodTier,
  payloadBytes: Uint8Array,
  options?: { readonly expectedHash?: string; readonly pinned?: boolean },
): ChunkCacheWriteResult {
  const expectedHash = (options?.expectedHash ?? asset.lodHashes[tier]).toLowerCase();
  const computedHash = computeSha256Hex(payloadBytes);

  if (computedHash !== expectedHash) {
    return {
      ok: false,
      rejectReason: "sha256-mismatch",
      computedHash,
      expectedHash,
      evictedEvents: [],
      cache: { ...cache, corruptionsBlocked: cache.corruptionsBlocked + 1 },
    };
  }

  const chunkBytes = payloadBytes.byteLength;
  if (chunkBytes > cache.budgetBytes) {
    return { ok: false, rejectReason: "exceeds-total-budget", computedHash, expectedHash, evictedEvents: [], cache };
  }

  const chunkKey = makeResourceChunkKey(asset.resourceId, tier);
  const existing = cache.entries.find((entry) => entry.chunkKey === chunkKey);
  const withoutExisting = existing ? cache.entries.filter((entry) => entry.chunkKey !== chunkKey) : cache.entries;
  const baseUsedBytes = existing ? cache.usedBytes - existing.byteSize : cache.usedBytes;
  const versionInvalidations =
    existing && compareSemanticVersions(existing.version, asset.version) !== 0
      ? cache.versionInvalidations + 1
      : cache.versionInvalidations;

  const trimmed = evictUntilUnderLimit(withoutExisting, baseUsedBytes, cache.accessTick, cache.budgetBytes - chunkBytes);
  if (!trimmed.ok) {
    return { ok: false, rejectReason: "exceeds-total-budget", computedHash, expectedHash, evictedEvents: [], cache };
  }

  const nextTick = trimmed.accessTick + 1;
  const inserted: CachedResourceChunk = {
    chunkKey,
    resourceId: asset.resourceId,
    tier,
    version: asset.version,
    byteSize: chunkBytes,
    sha256: computedHash,
    opfsPath: makeOpfsChunkPath(asset.resourceId, tier, asset.version),
    insertedAtTick: nextTick,
    lastAccessedTick: nextTick,
    pinned: options?.pinned ?? false,
    status: "valid",
  };

  return {
    ok: true,
    rejectReason: null,
    computedHash,
    expectedHash,
    evictedEvents: trimmed.evicted,
    cache: {
      ...cache,
      usedBytes: trimmed.usedBytes + chunkBytes,
      entries: [...trimmed.entries, inserted],
      accessTick: nextTick,
      verifiedWrites: cache.verifiedWrites + 1,
      versionInvalidations,
      evictionLog: [...cache.evictionLog, ...trimmed.evicted],
    },
  };
}

/** 캐시된 청크를 조회하고 적중 시 LRU 최근 사용 시각을 갱신한다. */
export function accessCachedChunk(
  cache: OpfsLruCacheState,
  resourceId: string,
  tier: ResourceLodTier,
  requiredVersion?: SemanticVersion,
): ChunkCacheAccessResult {
  const key = makeResourceChunkKey(resourceId, tier);
  const foundIdx = cache.entries.findIndex((entry) => entry.chunkKey === key);
  const found = foundIdx >= 0 ? cache.entries[foundIdx] : undefined;
  if (!found) {
    return { hit: false, stale: false, entry: null, cache: { ...cache, misses: cache.misses + 1 } };
  }

  const versionStale = requiredVersion !== undefined && compareSemanticVersions(found.version, requiredVersion) !== 0;
  const nextTick = cache.accessTick + 1;
  const promoted: CachedResourceChunk = { ...found, lastAccessedTick: nextTick };
  return {
    hit: true,
    stale: versionStale || found.status !== "valid",
    entry: promoted,
    cache: {
      ...cache,
      accessTick: nextTick,
      hits: cache.hits + 1,
      entries: cache.entries.map((entry, idx) => (idx === foundIdx ? promoted : entry)),
    },
  };
}

/** 뷰포트 거리·스크롤 방향·줌 배율 기반 시맨틱 LOD 프리페치 우선순위 큐를 산출한다. */
export function buildPrefetchPriorityQueue(
  assets: readonly SemanticResourceAsset[],
  viewport: ViewportScrollState,
  cache: OpfsLruCacheState,
  options?: { readonly includeFallbackThumb?: boolean },
): readonly PrefetchQueueEntry[] {
  const viewTop = viewport.scrollY;
  const viewBottom = viewport.scrollY + Math.max(200, viewport.viewportHeight);
  const viewCenter = (viewTop + viewBottom) * 0.5;
  const targetTier = selectLodTierForZoom(viewport.zoomLevel, viewport.preferredLodOverride);
  const includeFallbackThumb = options?.includeFallbackThumb ?? true;
  const cacheByKey = new Map(cache.entries.map((entry) => [entry.chunkKey, entry]));
  const velocityBoost = Math.min(240, Math.abs(viewport.scrollVelocityPxPerSec) * 0.15);
  const items: PrefetchQueueEntry[] = [];

  for (const asset of assets) {
    const cutTop = asset.yOffsetPx;
    const cutBottom = asset.yOffsetPx + asset.heightPx;
    const isVisible = cutBottom > viewTop && cutTop < viewBottom;
    const distancePx = cutBottom <= viewTop ? viewTop - cutBottom : cutTop >= viewBottom ? cutTop - viewBottom : 0;
    const cutCenter = (cutTop + cutBottom) * 0.5;
    const isAheadDown = viewport.direction === "down" && cutCenter >= viewCenter;
    const isAheadUp = viewport.direction === "up" && cutCenter <= viewCenter;
    const isInScrollDirection = isVisible || viewport.direction === "idle" || isAheadDown || isAheadUp;

    const candidateTiers: ResourceLodTier[] = [targetTier];
    if (includeFallbackThumb && targetTier !== "thumb" && (isVisible || distancePx <= viewport.viewportHeight)) {
      candidateTiers.push("thumb");
    }

    for (const tier of candidateTiers) {
      const chunkKey = makeResourceChunkKey(asset.resourceId, tier);
      const cached = cacheByKey.get(chunkKey);
      if (cached && cached.status === "valid" && compareSemanticVersions(cached.version, asset.version) === 0) {
        continue;
      }

      const distanceFactor = 1 / (1 + distancePx / Math.max(400, viewport.viewportHeight));
      let baseScore = distanceFactor * 500;
      let reason: PrefetchReason = "background-warm";

      if (cached && (cached.status !== "valid" || compareSemanticVersions(cached.version, asset.version) !== 0)) {
        baseScore += 180;
        reason = "version-refresh";
      }
      if (isVisible) {
        baseScore += tier === targetTier ? 1000 : 620;
        reason = tier === targetTier && viewport.zoomLevel >= 1.65 ? "zoom-upgrade" : "viewport-visible";
      } else if (isInScrollDirection && viewport.direction !== "idle") {
        baseScore += (tier === targetTier ? 420 : 210) + velocityBoost * distanceFactor;
        if (reason === "background-warm") reason = "scroll-lookahead";
      } else if (viewport.direction !== "idle") {
        baseScore *= 0.45;
      }
      if (tier === "thumb" && targetTier !== "thumb") baseScore -= 80;

      items.push({
        chunkKey,
        resourceId: asset.resourceId,
        cutIndex: asset.cutIndex,
        cutTitle: asset.cutTitle,
        layerName: asset.layerName,
        tier,
        targetVersion: asset.version,
        byteSize: asset.lodByteSizes[tier],
        priorityScore: Number(baseScore.toFixed(2)),
        distancePx: Math.round(distancePx),
        isVisible,
        isInScrollDirection,
        reason,
      });
    }
  }

  return items.sort((a, b) =>
    b.priorityScore !== a.priorityScore
      ? b.priorityScore - a.priorityScore
      : a.distancePx !== b.distancePx
        ? a.distancePx - b.distancePx
        : a.chunkKey.localeCompare(b.chunkKey),
  );
}

/** 우선순위 큐 상위 청크를 스트리밍·SHA-256 검증·OPFS LRU 캐싱까지 1스텝 실행한다. */
export function stepPrefetchStream(
  cache: OpfsLruCacheState,
  assets: readonly SemanticResourceAsset[],
  viewport: ViewportScrollState,
  options?: { readonly maxChunksPerStep?: number },
): PrefetchStepReport {
  const maxChunks = Math.max(1, options?.maxChunksPerStep ?? 3);
  const queue = buildPrefetchPriorityQueue(assets, viewport, cache);
  const assetById = new Map(assets.map((asset) => [asset.resourceId, asset]));
  let nextCache = cache;
  const fetchedKeys: string[] = [];
  let evictedCount = 0;

  for (const item of queue) {
    if (fetchedKeys.length >= maxChunks) break;
    const asset = assetById.get(item.resourceId);
    if (!asset) continue;
    const payload = synthesizeDeterministicChunkPayload(asset.resourceId, item.tier, asset.version, item.byteSize);
    const result = fetchAndCacheChunk(nextCache, asset, item.tier, payload);
    nextCache = result.cache;
    if (result.ok) {
      fetchedKeys.push(item.chunkKey);
      evictedCount += result.evictedEvents.length;
    }
  }

  const nextQueue = buildPrefetchPriorityQueue(assets, viewport, nextCache);
  return { fetchedKeys, evictedCount, remainingQueueLength: nextQueue.length, cache: nextCache, nextQueue };
}

/** 리소스의 시맨틱 버전을 올리고 semver 차등 무효화 정책(major 전량·minor 고해상도·patch 스테일)을 적용한다. */
export function bumpAssetSemanticVersion(
  assets: readonly SemanticResourceAsset[],
  cache: OpfsLruCacheState,
  resourceId: string,
  bumpKind: SemVerBumpKind,
): SemVerInvalidationResult {
  const target = assets.find((asset) => asset.resourceId === resourceId);
  if (!target) {
    return { assets, cache, previousVersion: null, nextVersion: null, evictedKeys: [], markedStaleKeys: [] };
  }

  const nextVersion = bumpSemanticVersion(target.version, bumpKind);
  const updatedAsset: SemanticResourceAsset = {
    ...target,
    version: nextVersion,
    lodHashes: computeAssetLodHashes(target.resourceId, nextVersion, target.lodByteSizes),
  };
  const nextAssets = assets.map((asset) => (asset.resourceId === resourceId ? updatedAsset : asset));

  const nextEntries: CachedResourceChunk[] = [];
  const newEvictions: EvictionEvent[] = [];
  const evictedKeys: string[] = [];
  const markedStaleKeys: string[] = [];
  let usedBytes = cache.usedBytes;
  let accessTick = cache.accessTick;
  let versionInvalidations = cache.versionInvalidations;

  for (const entry of cache.entries) {
    if (entry.resourceId !== resourceId) {
      nextEntries.push(entry);
      continue;
    }
    if (bumpKind === "major" || (bumpKind === "minor" && entry.tier !== "thumb")) {
      usedBytes -= entry.byteSize;
      accessTick += 1;
      versionInvalidations += 1;
      evictedKeys.push(entry.chunkKey);
      newEvictions.push({
        tick: accessTick,
        evictedKey: entry.chunkKey,
        resourceId: entry.resourceId,
        tier: entry.tier,
        freedBytes: entry.byteSize,
        reason: bumpKind === "major" ? "semver-major-invalidation" : "semver-minor-invalidation",
      });
    } else {
      versionInvalidations += 1;
      markedStaleKeys.push(entry.chunkKey);
      nextEntries.push({ ...entry, status: bumpKind === "minor" ? "stale-minor" : "stale-patch" });
    }
  }

  return {
    assets: nextAssets,
    cache: {
      ...cache,
      usedBytes,
      accessTick,
      entries: nextEntries,
      versionInvalidations,
      evictionLog: [...cache.evictionLog, ...newEvictions],
    },
    previousVersion: target.version,
    nextVersion,
    evictedKeys,
    markedStaleKeys,
  };
}

/** OPFS LRU 스트리밍 캐시의 핵심 텔레메트리를 계산한다. */
export function computeStreamCacheTelemetry(cache: OpfsLruCacheState): StreamCacheTelemetry {
  const totalLookups = cache.hits + cache.misses;
  return {
    usedBytes: cache.usedBytes,
    budgetBytes: cache.budgetBytes,
    utilizationPct: cache.budgetBytes <= 0 ? 0 : Number(((cache.usedBytes / cache.budgetBytes) * 100).toFixed(1)),
    cachedChunkCount: cache.entries.length,
    totalEvictions: cache.evictionLog.length,
    hitRatePct: totalLookups === 0 ? 100 : Number(((cache.hits / totalLookups) * 100).toFixed(1)),
    verifiedWrites: cache.verifiedWrites,
    corruptionsBlocked: cache.corruptionsBlocked,
    versionInvalidations: cache.versionInvalidations,
  };
}
