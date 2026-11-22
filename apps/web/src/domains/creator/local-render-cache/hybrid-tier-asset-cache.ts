/**
 * 3계층 하이브리드 에셋 캐시 컨트롤러 (L1 RAM LRU → L2 OPFS/IndexedDB → L3 R2 해시 URL).
 *
 * SHA-256 콘텐츠 해시를 불변 키로 사용하여 동일 에셋의 중복 전송과 서버 비용을 제거한다.
 * 계층별 바이트 예산 자동 LRU 축출, L2→L1 자동 승격, 오프라인 L2 폴백,
 * 동시 요청 병합(single-flight), 무결성 검증 및 계층별 히트율 텔레메트리를 제공한다.
 */

import {
  HybridCacheFetchError,
  HybridCacheValidationError,
  buildR2ImmutableAssetUrl,
  computeAssetSha256Hex,
  createIndexedDbCacheAdapter,
  createMemoryPersistentCacheAdapter,
  createOpfsCacheAdapter,
  createR2FetchAdapter,
  normalizeSha256Hex,
  sha256PureHex,
  type CachedAssetRecord,
  type PersistentCacheEntryMetadata,
  type PersistentCacheTierAdapter,
  type RemoteHashAssetFetcher,
  type RemoteHashFetchRequest,
  type RemoteHashFetchResponse,
} from "./hybrid-tier-cache-adapters";

export {
  HybridCacheFetchError,
  HybridCacheValidationError,
  buildR2ImmutableAssetUrl,
  computeAssetSha256Hex,
  createIndexedDbCacheAdapter,
  createMemoryPersistentCacheAdapter,
  createOpfsCacheAdapter,
  createR2FetchAdapter,
  normalizeSha256Hex,
  sha256PureHex,
};

export type {
  CachedAssetRecord,
  PersistentCacheEntryMetadata,
  PersistentCacheTierAdapter,
  RemoteHashAssetFetcher,
  RemoteHashFetchRequest,
  RemoteHashFetchResponse,
};

export type CacheTierSource = "l1" | "l2" | "l3";

export interface HybridTierAssetCacheOptions {
  readonly r2BaseUrl: string;
  readonly l2Adapter?: PersistentCacheTierAdapter;
  readonly l3Fetcher?: RemoteHashAssetFetcher;
  /** L1 메모리 LRU 바이트 상한. 기본 64 MiB. */
  readonly maxL1Bytes?: number;
  /** L1 메모리 엔트리 상한. 기본 256건. */
  readonly maxL1Entries?: number;
  /** L2 OPFS/IndexedDB 바이트 상한. 기본 512 MiB. */
  readonly maxL2Bytes?: number;
  /** L3 응답의 SHA-256 해시 일치 여부 검증. 기본 true. */
  readonly verifyIntegrity?: boolean;
  /** 온라인 상태 판별 함수. 기본 navigator.onLine ?? true. */
  readonly isOnline?: () => boolean;
  /** 테스트·결정론적 시간 측정 시계(ms). */
  readonly now?: () => number;
}

export interface HybridCacheGetOptions {
  readonly extension?: string;
  readonly signal?: AbortSignal;
}

export interface HybridCacheGetResult {
  readonly sha256: string;
  readonly bytes: Uint8Array;
  readonly mimeType: string;
  readonly byteLength: number;
  readonly tier: CacheTierSource;
  readonly promotedToL1: boolean;
  readonly offlineFallback: boolean;
  readonly coalesced: boolean;
}

export interface HybridCachePutOptions {
  readonly mimeType?: string;
  readonly expectedSha256?: string;
}

export interface HybridCachePutResult {
  readonly sha256: string;
  readonly byteLength: number;
  readonly storedInL1: boolean;
  readonly storedInL2: boolean;
}

export interface HybridCacheTelemetry {
  readonly totalRequests: number;
  readonly l1Hits: number;
  readonly l2Hits: number;
  readonly l3Hits: number;
  readonly misses: number;
  readonly offlineFallbackHits: number;
  readonly integrityFailures: number;
  readonly coalescedHits: number;
  readonly l1HitRate: number;
  readonly l2HitRate: number;
  readonly l3HitRate: number;
  readonly localHitRate: number;
  readonly overallHitRate: number;
  readonly l1BytesUsed: number;
  readonly l1BytesBudget: number;
  readonly l1EntryCount: number;
  readonly l1Evictions: number;
  readonly l2BytesUsed: number;
  readonly l2BytesBudget: number;
  readonly l2EntryCount: number;
  readonly l2Evictions: number;
  readonly l2BackendKind: PersistentCacheTierAdapter["kind"];
  readonly estimatedR2EgressSavedBytes: number;
}

export class HybridCacheOfflineMissError extends Error {
  readonly sha256: string;

  constructor(sha256: string) {
    super(`오프라인 상태이며 로컬 L1/L2 캐시에 에셋(${sha256.slice(0, 12)})이 없습니다.`);
    this.name = "HybridCacheOfflineMissError";
    this.sha256 = sha256;
  }
}

export class HybridCacheIntegrityError extends Error {
  readonly expectedSha256: string;
  readonly actualSha256: string;

  constructor(expectedSha256: string, actualSha256: string) {
    super(
      `원격 에셋 SHA-256 무결성 불일치: 기대=${expectedSha256.slice(0, 12)}, 실제=${actualSha256.slice(0, 12)}`,
    );
    this.name = "HybridCacheIntegrityError";
    this.expectedSha256 = expectedSha256;
    this.actualSha256 = actualSha256;
  }
}

const MIB = 1024 * 1024;

export const DEFAULT_HYBRID_CACHE_POLICY = {
  maxL1Bytes: 64 * MIB,
  maxL1Entries: 256,
  maxL2Bytes: 512 * MIB,
  immutableCacheControl: "public, max-age=31536000, immutable",
} as const;

interface InternalResolvedFetch {
  readonly record: CachedAssetRecord;
  readonly tier: "l2" | "l3";
  readonly promotedToL1: boolean;
  readonly offlineFallback: boolean;
}

export class HybridTierAssetCache {
  private readonly r2BaseUrl: string;
  private readonly l2Adapter: PersistentCacheTierAdapter;
  private readonly l3Fetcher: RemoteHashAssetFetcher;
  private readonly maxL1Bytes: number;
  private readonly maxL1Entries: number;
  private readonly maxL2Bytes: number;
  private readonly verifyIntegrity: boolean;
  private readonly isOnline: () => boolean;
  private readonly now: () => number;

  private readonly l1Map = new Map<string, CachedAssetRecord>();
  private readonly inFlightFetches = new Map<string, Promise<InternalResolvedFetch>>();

  private l1BytesUsed = 0;
  private l2BytesUsed = 0;
  private l2EntryCount = 0;
  private l2Synced = false;

  private totalRequests = 0;
  private l1Hits = 0;
  private l2Hits = 0;
  private l3Hits = 0;
  private misses = 0;
  private offlineFallbackHits = 0;
  private integrityFailures = 0;
  private coalescedHits = 0;
  private l1Evictions = 0;
  private l2Evictions = 0;
  private estimatedR2EgressSavedBytes = 0;

  constructor(options: HybridTierAssetCacheOptions) {
    const trimmedBase = options.r2BaseUrl.trim();
    if (!trimmedBase) {
      throw new HybridCacheValidationError("r2BaseUrl은 필수입니다.");
    }
    this.r2BaseUrl = trimmedBase;
    this.l2Adapter = options.l2Adapter ?? createMemoryPersistentCacheAdapter();
    this.l3Fetcher = options.l3Fetcher ?? createR2FetchAdapter();
    this.maxL1Bytes = Math.max(1, Math.floor(options.maxL1Bytes ?? DEFAULT_HYBRID_CACHE_POLICY.maxL1Bytes));
    this.maxL1Entries = Math.max(1, Math.floor(options.maxL1Entries ?? DEFAULT_HYBRID_CACHE_POLICY.maxL1Entries));
    this.maxL2Bytes = Math.max(1, Math.floor(options.maxL2Bytes ?? DEFAULT_HYBRID_CACHE_POLICY.maxL2Bytes));
    this.verifyIntegrity = options.verifyIntegrity ?? true;
    this.isOnline =
      options.isOnline
      ?? (() => (typeof navigator !== "undefined" && typeof navigator.onLine === "boolean" ? navigator.onLine : true));
    this.now = options.now ?? (() => Date.now());
  }

  /** L1 → L2 → L3 순서로 불변 에셋을 조회한다. */
  async get(sha256Input: string, options: HybridCacheGetOptions = {}): Promise<HybridCacheGetResult> {
    const sha256 = normalizeSha256Hex(sha256Input);
    this.totalRequests += 1;

    const l1Hit = this.l1Map.get(sha256);
    if (l1Hit) {
      this.touchL1(sha256, l1Hit);
      this.l1Hits += 1;
      this.estimatedR2EgressSavedBytes += l1Hit.byteLength;
      return {
        sha256,
        bytes: new Uint8Array(l1Hit.bytes),
        mimeType: l1Hit.mimeType,
        byteLength: l1Hit.byteLength,
        tier: "l1",
        promotedToL1: false,
        offlineFallback: !this.isOnline(),
        coalesced: false,
      };
    }

    const existingFlight = this.inFlightFetches.get(sha256);
    if (existingFlight) {
      return this.awaitFlight(sha256, existingFlight, true);
    }

    const flight = this.resolveFromL2OrL3(sha256, options);
    this.inFlightFetches.set(sha256, flight);
    try {
      return await this.awaitFlight(sha256, flight, false);
    } finally {
      if (this.inFlightFetches.get(sha256) === flight) {
        this.inFlightFetches.delete(sha256);
      }
    }
  }

  /** 로컬 생성 에셋을 SHA-256 해시 키로 L2와 L1에 불변 저장한다. */
  async put(bytes: Uint8Array, options: HybridCachePutOptions = {}): Promise<HybridCachePutResult> {
    const computed = await computeAssetSha256Hex(bytes);
    if (options.expectedSha256 !== undefined) {
      const expected = normalizeSha256Hex(options.expectedSha256);
      if (expected !== computed) {
        this.integrityFailures += 1;
        throw new HybridCacheIntegrityError(expected, computed);
      }
    }

    const timestamp = this.now();
    const record: CachedAssetRecord = {
      sha256: computed,
      bytes: new Uint8Array(bytes),
      mimeType: options.mimeType ?? "application/octet-stream",
      byteLength: bytes.byteLength,
      createdAtMs: timestamp,
      lastAccessedAtMs: timestamp,
    };

    const storedInL2 = await this.storeInL2(record);
    const storedInL1 = this.promoteToL1(record);
    return { sha256: computed, byteLength: record.byteLength, storedInL1, storedInL2 };
  }

  async evict(sha256Input: string): Promise<boolean> {
    const sha256 = normalizeSha256Hex(sha256Input);
    const existingL1 = this.l1Map.get(sha256);
    if (existingL1) {
      this.l1Map.delete(sha256);
      this.l1BytesUsed = Math.max(0, this.l1BytesUsed - existingL1.byteLength);
    }
    const deletedL2 = await this.l2Adapter.delete(sha256);
    if (deletedL2) await this.syncL2Usage(true);
    return Boolean(existingL1) || deletedL2;
  }

  /** 메모리 압박 시 L2 지속 캐시는 보존하고 L1 RAM 계층만 즉시 비운다. */
  clearL1(): void {
    this.l1Map.clear();
    this.l1BytesUsed = 0;
  }

  async clearAll(): Promise<void> {
    this.clearL1();
    await this.l2Adapter.clear();
    this.l2BytesUsed = 0;
    this.l2EntryCount = 0;
    this.l2Synced = true;
  }

  getTelemetry(): HybridCacheTelemetry {
    const denom = this.totalRequests > 0 ? this.totalRequests : 1;
    const totalHits = this.l1Hits + this.l2Hits + this.l3Hits;
    const localHits = this.l1Hits + this.l2Hits;
    return {
      totalRequests: this.totalRequests,
      l1Hits: this.l1Hits,
      l2Hits: this.l2Hits,
      l3Hits: this.l3Hits,
      misses: this.misses,
      offlineFallbackHits: this.offlineFallbackHits,
      integrityFailures: this.integrityFailures,
      coalescedHits: this.coalescedHits,
      l1HitRate: this.totalRequests > 0 ? this.l1Hits / denom : 0,
      l2HitRate: this.totalRequests > 0 ? this.l2Hits / denom : 0,
      l3HitRate: this.totalRequests > 0 ? this.l3Hits / denom : 0,
      localHitRate: this.totalRequests > 0 ? localHits / denom : 0,
      overallHitRate: this.totalRequests > 0 ? totalHits / denom : 0,
      l1BytesUsed: this.l1BytesUsed,
      l1BytesBudget: this.maxL1Bytes,
      l1EntryCount: this.l1Map.size,
      l1Evictions: this.l1Evictions,
      l2BytesUsed: this.l2BytesUsed,
      l2BytesBudget: this.maxL2Bytes,
      l2EntryCount: this.l2EntryCount,
      l2Evictions: this.l2Evictions,
      l2BackendKind: this.l2Adapter.kind,
      estimatedR2EgressSavedBytes: this.estimatedR2EgressSavedBytes,
    };
  }

  private async awaitFlight(
    sha256: string,
    flight: Promise<InternalResolvedFetch>,
    coalesced: boolean,
  ): Promise<HybridCacheGetResult> {
    try {
      const resolved = await flight;
      if (coalesced) this.coalescedHits += 1;
      if (resolved.tier === "l2") {
        this.l2Hits += 1;
        this.estimatedR2EgressSavedBytes += resolved.record.byteLength;
        if (resolved.offlineFallback) this.offlineFallbackHits += 1;
      } else {
        this.l3Hits += 1;
      }
      return {
        sha256,
        bytes: new Uint8Array(resolved.record.bytes),
        mimeType: resolved.record.mimeType,
        byteLength: resolved.record.byteLength,
        tier: resolved.tier,
        promotedToL1: resolved.promotedToL1,
        offlineFallback: resolved.offlineFallback,
        coalesced,
      };
    } catch (error: unknown) {
      this.misses += 1;
      throw error;
    }
  }

  private async resolveFromL2OrL3(
    sha256: string,
    options: HybridCacheGetOptions,
  ): Promise<InternalResolvedFetch> {
    await this.syncL2Usage(false);
    const l2Hit = await this.l2Adapter.get(sha256);
    if (l2Hit) {
      const accessedAtMs = this.now();
      await this.l2Adapter.touch(sha256, accessedAtMs);
      const updatedRecord: CachedAssetRecord = { ...l2Hit, lastAccessedAtMs: accessedAtMs };
      return {
        record: updatedRecord,
        tier: "l2",
        promotedToL1: this.promoteToL1(updatedRecord),
        offlineFallback: !this.isOnline(),
      };
    }

    if (!this.isOnline()) {
      throw new HybridCacheOfflineMissError(sha256);
    }

    const url = buildR2ImmutableAssetUrl(this.r2BaseUrl, sha256, options.extension);
    let remote: RemoteHashFetchResponse;
    try {
      remote = await this.l3Fetcher.fetchByHash({ sha256, url, signal: options.signal });
    } catch (error: unknown) {
      if (error instanceof HybridCacheFetchError) throw error;
      throw new HybridCacheFetchError(sha256, url, error instanceof Error ? error.message : String(error));
    }

    if (this.verifyIntegrity) {
      const actualSha256 = await computeAssetSha256Hex(remote.bytes);
      if (actualSha256 !== sha256) {
        this.integrityFailures += 1;
        throw new HybridCacheIntegrityError(sha256, actualSha256);
      }
    }

    const timestamp = this.now();
    const record: CachedAssetRecord = {
      sha256,
      bytes: new Uint8Array(remote.bytes),
      mimeType: remote.mimeType,
      byteLength: remote.bytes.byteLength,
      createdAtMs: timestamp,
      lastAccessedAtMs: timestamp,
    };

    await this.storeInL2(record);
    return { record, tier: "l3", promotedToL1: this.promoteToL1(record), offlineFallback: false };
  }

  private touchL1(sha256: string, entry: CachedAssetRecord): void {
    this.l1Map.delete(sha256);
    this.l1Map.set(sha256, { ...entry, lastAccessedAtMs: this.now() });
  }

  private promoteToL1(record: CachedAssetRecord): boolean {
    if (record.byteLength > this.maxL1Bytes) return false;
    const existing = this.l1Map.get(record.sha256);
    if (existing) {
      this.l1Map.delete(record.sha256);
      this.l1BytesUsed = Math.max(0, this.l1BytesUsed - existing.byteLength);
    }
    while (
      this.l1Map.size > 0
      && (this.l1BytesUsed + record.byteLength > this.maxL1Bytes || this.l1Map.size >= this.maxL1Entries)
    ) {
      const oldestKey = this.l1Map.keys().next().value;
      if (oldestKey === undefined) break;
      const oldest = this.l1Map.get(oldestKey);
      this.l1Map.delete(oldestKey);
      if (oldest) this.l1BytesUsed = Math.max(0, this.l1BytesUsed - oldest.byteLength);
      this.l1Evictions += 1;
    }
    this.l1Map.set(record.sha256, { ...record, bytes: new Uint8Array(record.bytes) });
    this.l1BytesUsed += record.byteLength;
    return true;
  }

  private async storeInL2(record: CachedAssetRecord): Promise<boolean> {
    if (record.byteLength > this.maxL2Bytes) return false;
    await this.syncL2Usage(true);
    const entries = [...(await this.l2Adapter.listMetadata())];
    const existingIndex = entries.findIndex((item) => item.sha256 === record.sha256);
    let projectedBytes = this.l2BytesUsed;
    if (existingIndex >= 0) {
      projectedBytes = Math.max(0, projectedBytes - (entries[existingIndex]?.byteLength ?? 0));
      entries.splice(existingIndex, 1);
    }

    entries.sort((left, right) =>
      left.lastAccessedAtMs !== right.lastAccessedAtMs
        ? left.lastAccessedAtMs - right.lastAccessedAtMs
        : left.createdAtMs - right.createdAtMs,
    );

    while (entries.length > 0 && projectedBytes + record.byteLength > this.maxL2Bytes) {
      const victim = entries.shift();
      if (!victim) break;
      if (await this.l2Adapter.delete(victim.sha256)) {
        projectedBytes = Math.max(0, projectedBytes - victim.byteLength);
        this.l2Evictions += 1;
      }
    }

    await this.l2Adapter.put(record);
    this.l2BytesUsed = projectedBytes + record.byteLength;
    this.l2EntryCount = entries.length + 1;
    this.l2Synced = true;
    return true;
  }

  private async syncL2Usage(force: boolean): Promise<void> {
    if (this.l2Synced && !force) return;
    const entries = await this.l2Adapter.listMetadata();
    let total = 0;
    for (const entry of entries) total += entry.byteLength;
    this.l2BytesUsed = total;
    this.l2EntryCount = entries.length;
    this.l2Synced = true;
  }
}

export function createHybridTierAssetCache(options: HybridTierAssetCacheOptions): HybridTierAssetCache {
  return new HybridTierAssetCache(options);
}
