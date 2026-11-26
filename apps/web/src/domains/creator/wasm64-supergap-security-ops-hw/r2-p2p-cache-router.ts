/**
 * #17 R2 + P2P 하이브리드 ₩0 에셋 캐시 라우터(HybridR2P2pAssetCacheRouter).
 *
 * - 콘텐츠 주소 지정(SHA-256 해시 검증) CC0 브러시·3D 소품·톤 텍스처·폰트 에셋을
 *   `로컬 LRU 캐시 → P2P 피어 메시 → Cloudflare R2 엣지 폴백` 순으로 라우팅한다.
 * - 변조/손상 청크를 응답한 악성·불량 피어는 SHA-256 대조 즉시 격리(quarantine)하고
 *   다음 정상 피어 또는 R2 오리진으로 자동 페일오버한다.
 * - 피어 웜 메시 환경에서 R2 오리진 오프로드율 `>= 85%`를 실측 텔레메트리로 추적한다.
 */

import { sha256Hex } from "./crypto-binary-utils";

export type CacheableAssetCategory = "cc0-brush" | "3d-prop" | "tone-texture" | "font";

export interface ContentAddressedAssetRequest {
  readonly assetId: string;
  readonly expectedSha256Hex: string;
  readonly category: CacheableAssetCategory;
  readonly byteSizeHint?: number;
}

export interface P2pAssetPeerAdapter {
  readonly peerId: string;
  readonly rttMs: number;
  readonly fetchAsset: (
    assetId: string,
    expectedSha256Hex: string,
  ) => Promise<Uint8Array | null>;
}

export interface R2EdgeOriginAdapter {
  readonly fetchFromR2Edge: (assetId: string) => Promise<Uint8Array | null>;
}

export type AssetFetchSource = "local-cache" | "p2p-peer" | "r2-origin";

export interface RoutedAssetFetchResult {
  readonly assetId: string;
  readonly expectedSha256Hex: string;
  readonly verifiedSha256Hex: string;
  readonly source: AssetFetchSource;
  readonly peerId?: string;
  readonly bytes: Uint8Array;
  readonly r2OriginHit: boolean;
  readonly rejectedCorruptedPeers: readonly string[];
}

export interface HybridCacheRouterOptions {
  /** 로컬 LRU 캐시 최대 바이트 한도(기본 64 MiB). */
  readonly maxLocalCacheBytes?: number;
  /** 피어 조회 시 최대 시도 피어 수(기본 4). */
  readonly maxPeerAttempts?: number;
  readonly peers?: readonly P2pAssetPeerAdapter[];
  readonly r2Origin: R2EdgeOriginAdapter;
}

export interface HybridCacheRouterMetrics {
  readonly totalRequests: number;
  readonly localCacheHits: number;
  readonly p2pPeerHits: number;
  readonly r2OriginFetches: number;
  readonly corruptedPeerRejections: number;
  readonly totalBytesServed: number;
  readonly localCacheBytesServed: number;
  readonly p2pBytesServed: number;
  readonly r2OriginBytesServed: number;
  /** 요청 기준 R2 오리진 오프로드율(0~1). 웜 메시 목표 >= 0.85. */
  readonly r2OffloadRate: number;
  /** 바이트 기준 R2 오리진 오프로드율(0~1). */
  readonly r2ByteOffloadRate: number;
  readonly localCacheUsedBytes: number;
  readonly localCacheEntryCount: number;
  readonly healthyPeerCount: number;
  readonly quarantinedPeerIds: readonly string[];
}

interface LocalCacheEntry {
  readonly assetId: string;
  readonly sha256Hex: string;
  readonly category: CacheableAssetCategory;
  readonly bytes: Uint8Array;
}

/**
 * 로컬 LRU → P2P 피어 메시 → R2 엣지 폴백 콘텐츠 검증 라우터.
 */
export class HybridR2P2pAssetCacheRouter {
  private readonly maxLocalCacheBytes: number;
  private readonly maxPeerAttempts: number;
  private readonly r2Origin: R2EdgeOriginAdapter;
  private readonly peers = new Map<string, P2pAssetPeerAdapter>();
  private readonly quarantinedPeers = new Set<string>();
  /** 삽입 순서를 LRU 순서로 사용하는 Map(최신 접근 항목을 뒤로 재삽입). */
  private readonly localCache = new Map<string, LocalCacheEntry>();

  private localCacheUsedBytes = 0;
  private totalRequests = 0;
  private localCacheHits = 0;
  private p2pPeerHits = 0;
  private r2OriginFetches = 0;
  private corruptedPeerRejections = 0;
  private localCacheBytesServed = 0;
  private p2pBytesServed = 0;
  private r2OriginBytesServed = 0;

  constructor(options: HybridCacheRouterOptions) {
    this.maxLocalCacheBytes = Math.max(1024, options.maxLocalCacheBytes ?? 64 * 1024 * 1024);
    this.maxPeerAttempts = Math.max(1, options.maxPeerAttempts ?? 4);
    this.r2Origin = options.r2Origin;
    const initialPeers = options.peers ?? [];
    for (let i = 0; i < initialPeers.length; i += 1) {
      this.peers.set(initialPeers[i].peerId, initialPeers[i]);
    }
  }

  /** P2P 피어 등록 또는 RTT 갱신. */
  registerPeer(peer: P2pAssetPeerAdapter): void {
    this.peers.set(peer.peerId, peer);
  }

  /** P2P 피어 연결 해제. */
  unregisterPeer(peerId: string): void {
    this.peers.delete(peerId);
    this.quarantinedPeers.delete(peerId);
  }

  /** 검증된 에셋을 로컬 LRU 캐시에 사전 시드. */
  seedLocalCache(
    assetId: string,
    category: CacheableAssetCategory,
    bytes: Uint8Array,
  ): string {
    const digest = sha256Hex(bytes);
    this.putLocalCache({
      assetId,
      sha256Hex: digest,
      category,
      bytes: new Uint8Array(bytes),
    });
    return digest;
  }

  /** 콘텐츠 주소 지정 에셋 조회: 로컬 캐시 → 건강한 P2P 피어 → R2 엣지 폴백. */
  async fetchAsset(request: ContentAddressedAssetRequest): Promise<RoutedAssetFetchResult> {
    const normalizedHash = request.expectedSha256Hex.trim().toLowerCase();
    this.totalRequests += 1;

    // 1) 로컬 LRU 캐시 히트(네트워크 0B)
    const cached = this.localCache.get(normalizedHash);
    if (cached) {
      this.touchLocalCache(normalizedHash, cached);
      this.localCacheHits += 1;
      this.localCacheBytesServed += cached.bytes.byteLength;
      return {
        assetId: request.assetId,
        expectedSha256Hex: normalizedHash,
        verifiedSha256Hex: cached.sha256Hex,
        source: "local-cache",
        bytes: new Uint8Array(cached.bytes),
        r2OriginHit: false,
        rejectedCorruptedPeers: [],
      };
    }

    // 2) 건강한 P2P 피어 RTT 오름차순 조회 + SHA-256 무결성 검증
    const rejectedCorruptedPeers: string[] = [];
    const candidatePeers = this.listHealthyPeersByRtt();
    let tried = 0;

    for (let i = 0; i < candidatePeers.length && tried < this.maxPeerAttempts; i += 1) {
      const peer = candidatePeers[i];
      tried += 1;
      let peerBytes: Uint8Array | null;
      try {
        peerBytes = await peer.fetchAsset(request.assetId, normalizedHash);
      } catch {
        continue;
      }
      if (!peerBytes) {
        continue;
      }

      const actualDigest = sha256Hex(peerBytes);
      if (actualDigest !== normalizedHash) {
        this.corruptedPeerRejections += 1;
        this.quarantinedPeers.add(peer.peerId);
        rejectedCorruptedPeers.push(peer.peerId);
        continue;
      }

      const safeCopy = new Uint8Array(peerBytes);
      this.putLocalCache({
        assetId: request.assetId,
        sha256Hex: actualDigest,
        category: request.category,
        bytes: safeCopy,
      });
      this.p2pPeerHits += 1;
      this.p2pBytesServed += safeCopy.byteLength;

      return {
        assetId: request.assetId,
        expectedSha256Hex: normalizedHash,
        verifiedSha256Hex: actualDigest,
        source: "p2p-peer",
        peerId: peer.peerId,
        bytes: new Uint8Array(safeCopy),
        r2OriginHit: false,
        rejectedCorruptedPeers,
      };
    }

    // 3) Cloudflare R2 엣지 폴백 + SHA-256 검증
    const r2Bytes = await this.r2Origin.fetchFromR2Edge(request.assetId);
    if (!r2Bytes) {
      throw new Error(`로컬·P2P·R2 어디에서도 에셋을 찾을 수 없습니다(${request.assetId}).`);
    }
    const r2Digest = sha256Hex(r2Bytes);
    if (r2Digest !== normalizedHash) {
      throw new Error(
        `R2 오리진 응답 해시 불일치(${request.assetId}): expected=${normalizedHash}, actual=${r2Digest}`,
      );
    }

    const safeCopy = new Uint8Array(r2Bytes);
    this.putLocalCache({
      assetId: request.assetId,
      sha256Hex: r2Digest,
      category: request.category,
      bytes: safeCopy,
    });
    this.r2OriginFetches += 1;
    this.r2OriginBytesServed += safeCopy.byteLength;

    return {
      assetId: request.assetId,
      expectedSha256Hex: normalizedHash,
      verifiedSha256Hex: r2Digest,
      source: "r2-origin",
      bytes: new Uint8Array(safeCopy),
      r2OriginHit: true,
      rejectedCorruptedPeers,
    };
  }

  /** 누적 R2 오프로드율 및 캐시·피어 건강 상태 텔레메트리 반환. */
  getMetrics(): HybridCacheRouterMetrics {
    const totalBytesServed =
      this.localCacheBytesServed + this.p2pBytesServed + this.r2OriginBytesServed;
    const offloadedRequests = this.localCacheHits + this.p2pPeerHits;
    const offloadedBytes = this.localCacheBytesServed + this.p2pBytesServed;
    const r2OffloadRate =
      this.totalRequests > 0 ? Number((offloadedRequests / this.totalRequests).toFixed(4)) : 1;
    const r2ByteOffloadRate =
      totalBytesServed > 0 ? Number((offloadedBytes / totalBytesServed).toFixed(4)) : 1;

    return {
      totalRequests: this.totalRequests,
      localCacheHits: this.localCacheHits,
      p2pPeerHits: this.p2pPeerHits,
      r2OriginFetches: this.r2OriginFetches,
      corruptedPeerRejections: this.corruptedPeerRejections,
      totalBytesServed,
      localCacheBytesServed: this.localCacheBytesServed,
      p2pBytesServed: this.p2pBytesServed,
      r2OriginBytesServed: this.r2OriginBytesServed,
      r2OffloadRate,
      r2ByteOffloadRate,
      localCacheUsedBytes: this.localCacheUsedBytes,
      localCacheEntryCount: this.localCache.size,
      healthyPeerCount: this.listHealthyPeersByRtt().length,
      quarantinedPeerIds: [...this.quarantinedPeers].sort(),
    };
  }

  private listHealthyPeersByRtt(): P2pAssetPeerAdapter[] {
    const healthy: P2pAssetPeerAdapter[] = [];
    this.peers.forEach((peer) => {
      if (!this.quarantinedPeers.has(peer.peerId)) {
        healthy.push(peer);
      }
    });
    healthy.sort((a, b) => a.rttMs - b.rttMs);
    return healthy;
  }

  private touchLocalCache(hash: string, entry: LocalCacheEntry): void {
    this.localCache.delete(hash);
    this.localCache.set(hash, entry);
  }

  private putLocalCache(entry: LocalCacheEntry): void {
    if (entry.bytes.byteLength > this.maxLocalCacheBytes) {
      return;
    }
    const existing = this.localCache.get(entry.sha256Hex);
    if (existing) {
      this.localCacheUsedBytes -= existing.bytes.byteLength;
      this.localCache.delete(entry.sha256Hex);
    }
    while (
      this.localCacheUsedBytes + entry.bytes.byteLength > this.maxLocalCacheBytes &&
      this.localCache.size > 0
    ) {
      const oldestKey = this.localCache.keys().next().value;
      if (oldestKey === undefined) break;
      const oldest = this.localCache.get(oldestKey);
      this.localCache.delete(oldestKey);
      if (oldest) {
        this.localCacheUsedBytes -= oldest.bytes.byteLength;
      }
    }
    this.localCache.set(entry.sha256Hex, entry);
    this.localCacheUsedBytes += entry.bytes.byteLength;
  }
}
