/**
 * 50화 연재 시리즈용 내용 주소화(CAS) 에셋 중복 제거기 및 참조 카운트 Mark-and-Sweep GC 검증기.
 *
 * - 반복 등장하는 연재 스튜디오 에셋(3D 소품 `prop-3d`, VRM 의상 `vrm-outfit`, 커스텀 브러시 `custom-brush`,
 *   색보정 `.cube` LUT `color-lut-cube`, 스크린톤 `screentone`)에 대해 2단계 순수 TS 지문 판별을 수행한다:
 *   1단계 고속 32비트 FNV-1a(`byteLength + fnv1a32Hex`) 사전 필터 → 2단계 FIPS 180-4 표준 SHA-256 및 바이트 대조.
 * - 연재 통합 팩 매니페스트(`physicalBytes` 대 `logicalBytes`, 절감률 `savingsRatio` `0..1`)를 산출한다.
 * - 참조 카운트 원장과 루트 기반 Mark-and-Sweep 가비지 컬렉션 플래너를 결합해 고아 블롭만 회수하고,
 *   현역 연재 회차의 끊어진 참조가 항상 0건(`danglingRefCount === 0`)임을 수학적으로 검증한다.
 */

export const SERIES_ASSET_KINDS = Object.freeze([
  "prop-3d", "vrm-outfit", "custom-brush", "color-lut-cube", "screentone",
] as const);
export type SeriesAssetKind = (typeof SERIES_ASSET_KINDS)[number];

export const EPISODE_LIFECYCLE_STATES = Object.freeze(["live", "draft-scrapped"] as const);
export type EpisodeLifecycleState = (typeof EPISODE_LIFECYCLE_STATES)[number];

export interface EpisodeAssetInput {
  readonly slotId: string;
  readonly labelKo: string;
  readonly kind: SeriesAssetKind;
  readonly payload: Uint8Array | string;
}

export interface SeriesEpisodeInput {
  readonly episodeId: string;
  readonly episodeNumber: number;
  readonly titleKo: string;
  readonly state?: EpisodeLifecycleState;
  readonly assets: readonly EpisodeAssetInput[];
}

export interface DeduplicatedBlobDescriptor {
  readonly contentHash: string;
  readonly fnv1a32Hex: string;
  readonly byteLength: number;
  readonly primaryKind: SeriesAssetKind;
  readonly observedKinds: readonly SeriesAssetKind[];
  readonly liveRefCount: number;
  readonly referencingLiveEpisodeIds: readonly string[];
}

export interface EpisodeAssetBinding {
  readonly slotId: string;
  readonly labelKo: string;
  readonly kind: SeriesAssetKind;
  readonly contentHash: string;
  readonly byteLength: number;
}

export interface EpisodeManifestEntry {
  readonly episodeId: string;
  readonly episodeNumber: number;
  readonly titleKo: string;
  readonly state: EpisodeLifecycleState;
  readonly logicalBytes: number;
  readonly bindings: readonly EpisodeAssetBinding[];
}

export interface AssetKindDedupSummary {
  readonly kind: SeriesAssetKind;
  readonly slotReferenceCount: number;
  readonly uniqueBlobCount: number;
  readonly logicalBytes: number;
  readonly physicalBytes: number;
  readonly savedBytes: number;
  readonly savingsRatio: number;
}

export interface TwoStageFingerprintStats {
  readonly totalIngestedSlots: number;
  readonly stage1UniqueFastPathCount: number;
  readonly stage1PreFilterHitCount: number;
  readonly stage2Sha256VerifiedDedupCount: number;
  readonly stage1CollisionSeparatedCount: number;
}

export interface SeriesPackManifest {
  readonly seriesId: string;
  readonly liveEpisodeCount: number;
  readonly totalLiveAssetSlots: number;
  readonly uniqueLiveBlobCount: number;
  readonly residentBlobCount: number;
  readonly logicalBytes: number;
  readonly physicalBytes: number;
  readonly residentOrphanBytes: number;
  readonly savedBytes: number;
  readonly savingsRatio: number;
  readonly danglingRefCount: number;
  readonly fingerprintStats: TwoStageFingerprintStats;
  readonly kindSummaries: Readonly<Record<SeriesAssetKind, AssetKindDedupSummary>>;
  readonly blobs: readonly DeduplicatedBlobDescriptor[];
  readonly episodes: readonly EpisodeManifestEntry[];
  readonly summaryKo: string;
}

export interface AssetDedupProbeResult {
  readonly byteLength: number;
  readonly fnv1a32Hex: string;
  readonly stage1BucketMatched: boolean;
  readonly stage2Sha256Computed: boolean;
  readonly matchedContentHash: string | null;
}

export interface OrphanBlobCandidate {
  readonly contentHash: string;
  readonly fnv1a32Hex: string;
  readonly byteLength: number;
  readonly primaryKind: SeriesAssetKind;
}

export interface GcPlannerOptions {
  readonly pinnedContentHashes?: readonly string[];
  readonly purgeScrappedEpisodeRecords?: boolean;
}

export interface MarkAndSweepGcPlan {
  readonly liveRootEpisodeIds: readonly string[];
  readonly pinnedContentHashes: readonly string[];
  readonly markedReachableBlobCount: number;
  readonly orphanBlobs: readonly OrphanBlobCandidate[];
  readonly reclaimableBytes: number;
  readonly refCountLedgerConsistent: boolean;
  readonly projectedDanglingRefCount: number;
}

export interface GcExecutionReport {
  readonly reclaimedBlobCount: number;
  readonly reclaimedBytes: number;
  readonly remainingPhysicalBlobCount: number;
  readonly remainingPhysicalBytes: number;
  readonly purgedScrappedEpisodeCount: number;
  readonly verifiedLiveEpisodeCount: number;
  readonly verifiedLiveSlotCount: number;
  readonly danglingRefCount: number;
  readonly refCountMismatchCount: number;
  readonly summaryKo: string;
}

export interface IntegrityVerificationReport {
  readonly isHealthy: boolean;
  readonly verifiedLiveEpisodeCount: number;
  readonly verifiedLiveSlotCount: number;
  readonly danglingRefCount: number;
  readonly refCountMismatchCount: number;
  readonly hashMismatchCount: number;
}

const UTF8_ENCODER = new TextEncoder();

const SHA256_H0 = new Uint32Array([
  0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
]);

const SHA256_ROUND_K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

function rotr32(value: number, shift: number): number {
  return ((value >>> shift) | (value << (32 - shift))) >>> 0;
}

/** 1단계 고속 사전 필터용 32비트 FNV-1a 해시(8자리 소문자 16진수)를 계산한다. */
export function computeAssetFnv1a32Hex(bytes: Uint8Array): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < bytes.length; i += 1) {
    hash ^= bytes[i] ?? 0;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

/** 2단계 암호학적 확정 검증용 FIPS 180-4 표준 SHA-256 해시(64자리 소문자 16진수)를 순수 32비트 연산으로 계산한다. */
export function computeAssetSha256Hex(bytes: Uint8Array): string {
  const bitLenLow = (bytes.byteLength << 3) >>> 0;
  const bitLenHigh = Math.floor(bytes.byteLength / 0x20000000) >>> 0;
  const paddedLen = Math.ceil((bytes.byteLength + 9) / 64) * 64;
  const padded = new Uint8Array(paddedLen);
  padded.set(bytes, 0);
  padded[bytes.byteLength] = 0x80;

  const view = new DataView(padded.buffer, padded.byteOffset, padded.byteLength);
  view.setUint32(paddedLen - 8, bitLenHigh, false);
  view.setUint32(paddedLen - 4, bitLenLow, false);

  const state = new Uint32Array(SHA256_H0);
  const schedule = new Uint32Array(64);

  for (let blockOffset = 0; blockOffset < paddedLen; blockOffset += 64) {
    for (let i = 0; i < 16; i += 1) schedule[i] = view.getUint32(blockOffset + i * 4, false);
    for (let i = 16; i < 64; i += 1) {
      const w15 = schedule[i - 15] ?? 0;
      const w2 = schedule[i - 2] ?? 0;
      const s0 = (rotr32(w15, 7) ^ rotr32(w15, 18) ^ (w15 >>> 3)) >>> 0;
      const s1 = (rotr32(w2, 17) ^ rotr32(w2, 19) ^ (w2 >>> 10)) >>> 0;
      schedule[i] = ((schedule[i - 16] ?? 0) + s0 + (schedule[i - 7] ?? 0) + s1) >>> 0;
    }

    let [a, b, c, d, e, f, g, h] = state;
    a = a ?? 0; b = b ?? 0; c = c ?? 0; d = d ?? 0; e = e ?? 0; f = f ?? 0; g = g ?? 0; h = h ?? 0;

    for (let i = 0; i < 64; i += 1) {
      const sigma1 = (rotr32(e, 6) ^ rotr32(e, 11) ^ rotr32(e, 25)) >>> 0;
      const ch = ((e & f) ^ (~e & g)) >>> 0;
      const temp1 = (h + sigma1 + ch + (SHA256_ROUND_K[i] ?? 0) + (schedule[i] ?? 0)) >>> 0;
      const sigma0 = (rotr32(a, 2) ^ rotr32(a, 13) ^ rotr32(a, 22)) >>> 0;
      const maj = ((a & b) ^ (a & c) ^ (b & c)) >>> 0;
      const temp2 = (sigma0 + maj) >>> 0;
      h = g; g = f; f = e; e = (d + temp1) >>> 0; d = c; c = b; b = a; a = (temp1 + temp2) >>> 0;
    }

    const deltas = [a, b, c, d, e, f, g, h];
    for (let j = 0; j < 8; j += 1) state[j] = ((state[j] ?? 0) + (deltas[j] ?? 0)) >>> 0;
  }

  let digestHex = "";
  for (let i = 0; i < 8; i += 1) digestHex += (state[i] ?? 0).toString(16).padStart(8, "0");
  return digestHex;
}

function toOwnedBytes(payload: Uint8Array | string): Uint8Array {
  if (typeof payload === "string") return UTF8_ENCODER.encode(payload);
  const clone = new Uint8Array(payload.byteLength);
  clone.set(payload);
  return clone;
}

function areByteArraysEqual(left: Uint8Array, right: Uint8Array): boolean {
  if (left.byteLength !== right.byteLength) return false;
  for (let i = 0; i < left.byteLength; i += 1) {
    if (left[i] !== right[i]) return false;
  }
  return true;
}

function makeStage1BucketKey(byteLength: number, fnv1a32Hex: string): string {
  return `${byteLength}:${fnv1a32Hex}`;
}

interface InternalStoredBlob {
  readonly contentHash: string;
  readonly fnv1a32Hex: string;
  readonly byteLength: number;
  readonly bytes: Uint8Array;
  readonly primaryKind: SeriesAssetKind;
  readonly observedKinds: Set<SeriesAssetKind>;
  liveRefCount: number;
  readonly liveEpisodeSlotCounts: Map<string, number>;
}

interface InternalEpisodeRecord {
  readonly episodeId: string;
  readonly episodeNumber: number;
  readonly titleKo: string;
  state: EpisodeLifecycleState;
  bindings: readonly EpisodeAssetBinding[];
}

/** 연재 회차 전반의 스튜디오 에셋을 내용 주소화 방식으로 중복 제거하고 참조 카운트 GC를 수행하는 엔진. */
export class CrossEpisodeAssetDeduplicator {
  private readonly blobsByHash = new Map<string, InternalStoredBlob>();
  private readonly stage1Buckets = new Map<string, string[]>();
  private readonly episodesById = new Map<string, InternalEpisodeRecord>();

  private totalIngestedSlots = 0;
  private stage1UniqueFastPathCount = 0;
  private stage1PreFilterHitCount = 0;
  private stage2Sha256VerifiedDedupCount = 0;
  private stage1CollisionSeparatedCount = 0;

  /** 1단계(FNV-1a 사전 필터)가 비어 있으면 2단계 SHA-256 연산을 생략하고 즉시 미일치를 반환한다. */
  public probeAssetDeduplication(payload: Uint8Array | string): AssetDedupProbeResult {
    const bytes = typeof payload === "string" ? UTF8_ENCODER.encode(payload) : payload;
    const fnv1a32Hex = computeAssetFnv1a32Hex(bytes);
    const candidates = this.stage1Buckets.get(makeStage1BucketKey(bytes.byteLength, fnv1a32Hex));

    if (candidates === undefined || candidates.length === 0) {
      return {
        byteLength: bytes.byteLength, fnv1a32Hex,
        stage1BucketMatched: false, stage2Sha256Computed: false, matchedContentHash: null,
      };
    }

    const sha256Hex = computeAssetSha256Hex(bytes);
    for (const candidateHash of candidates) {
      const stored = candidateHash === sha256Hex ? this.blobsByHash.get(candidateHash) : undefined;
      if (stored !== undefined && areByteArraysEqual(stored.bytes, bytes)) {
        return {
          byteLength: bytes.byteLength, fnv1a32Hex,
          stage1BucketMatched: true, stage2Sha256Computed: true, matchedContentHash: candidateHash,
        };
      }
    }

    return {
      byteLength: bytes.byteLength, fnv1a32Hex,
      stage1BucketMatched: true, stage2Sha256Computed: true, matchedContentHash: null,
    };
  }

  private createBlobEntry(
    contentHash: string, fnv1a32Hex: string, bytes: Uint8Array, kind: SeriesAssetKind,
  ): InternalStoredBlob {
    return {
      contentHash, fnv1a32Hex, byteLength: bytes.byteLength, bytes, primaryKind: kind,
      observedKinds: new Set<SeriesAssetKind>([kind]), liveRefCount: 0,
      liveEpisodeSlotCounts: new Map<string, number>(),
    };
  }

  private ingestSingleAssetBlob(kind: SeriesAssetKind, rawPayload: Uint8Array | string): InternalStoredBlob {
    this.totalIngestedSlots += 1;
    const bytes = toOwnedBytes(rawPayload);
    const fnv1a32Hex = computeAssetFnv1a32Hex(bytes);
    const bucketKey = makeStage1BucketKey(bytes.byteLength, fnv1a32Hex);
    const existingBucket = this.stage1Buckets.get(bucketKey);

    if (existingBucket === undefined || existingBucket.length === 0) {
      this.stage1UniqueFastPathCount += 1;
      const contentHash = computeAssetSha256Hex(bytes);
      const existing = this.blobsByHash.get(contentHash);
      if (existing !== undefined) {
        existing.observedKinds.add(kind);
        this.stage1Buckets.set(bucketKey, [contentHash]);
        return existing;
      }
      const created = this.createBlobEntry(contentHash, fnv1a32Hex, bytes, kind);
      this.blobsByHash.set(contentHash, created);
      this.stage1Buckets.set(bucketKey, [contentHash]);
      return created;
    }

    this.stage1PreFilterHitCount += 1;
    const contentHash = computeAssetSha256Hex(bytes);
    for (const candidateHash of existingBucket) {
      const candidateBlob = candidateHash === contentHash ? this.blobsByHash.get(candidateHash) : undefined;
      if (candidateBlob !== undefined && areByteArraysEqual(candidateBlob.bytes, bytes)) {
        this.stage2Sha256VerifiedDedupCount += 1;
        candidateBlob.observedKinds.add(kind);
        return candidateBlob;
      }
    }

    this.stage1CollisionSeparatedCount += 1;
    const separated = this.createBlobEntry(contentHash, fnv1a32Hex, bytes, kind);
    this.blobsByHash.set(contentHash, separated);
    existingBucket.push(contentHash);
    return separated;
  }

  private adjustEpisodeLiveRefs(episode: InternalEpisodeRecord, delta: 1 | -1): void {
    if (episode.state !== "live") return;
    for (const binding of episode.bindings) {
      const blob = this.blobsByHash.get(binding.contentHash);
      if (blob === undefined) continue;
      blob.liveRefCount = Math.max(0, blob.liveRefCount + delta);
      const nextSlots = (blob.liveEpisodeSlotCounts.get(episode.episodeId) ?? 0) + delta;
      if (nextSlots <= 0) blob.liveEpisodeSlotCounts.delete(episode.episodeId);
      else blob.liveEpisodeSlotCounts.set(episode.episodeId, nextSlots);
    }
  }

  /** 회차 에셋 목록을 등록하거나 갱신하고 구버전 참조 차감을 즉시 반영한다. */
  public ingestEpisode(input: SeriesEpisodeInput): EpisodeManifestEntry {
    const previous = this.episodesById.get(input.episodeId);
    if (previous !== undefined) this.adjustEpisodeLiveRefs(previous, -1);

    const state: EpisodeLifecycleState = input.state ?? "live";
    let logicalBytes = 0;
    const bindings: EpisodeAssetBinding[] = input.assets.map((asset) => {
      const blob = this.ingestSingleAssetBlob(asset.kind, asset.payload);
      logicalBytes += blob.byteLength;
      return {
        slotId: asset.slotId, labelKo: asset.labelKo, kind: asset.kind,
        contentHash: blob.contentHash, byteLength: blob.byteLength,
      };
    });

    const record: InternalEpisodeRecord = {
      episodeId: input.episodeId, episodeNumber: input.episodeNumber,
      titleKo: input.titleKo, state, bindings,
    };
    this.episodesById.set(input.episodeId, record);
    this.adjustEpisodeLiveRefs(record, 1);

    return {
      episodeId: record.episodeId, episodeNumber: record.episodeNumber,
      titleKo: record.titleKo, state: record.state, logicalBytes, bindings,
    };
  }

  /** 특정 회차를 폐기 초안(`draft-scrapped`) 상태로 전환해 현역 참조 루트에서 제외한다. */
  public markEpisodeScrapped(episodeId: string): boolean {
    const record = this.episodesById.get(episodeId);
    if (record === undefined) return false;
    if (record.state === "live") {
      this.adjustEpisodeLiveRefs(record, -1);
      record.state = "draft-scrapped";
    }
    return true;
  }

  /** 현역(`live`) 회차 루트에서 도달 가능한 모든 블롭을 마킹하고 고아 블롭 회수 계획을 수립한다. */
  public planMarkAndSweepGc(options: GcPlannerOptions = {}): MarkAndSweepGcPlan {
    const pinnedSet = new Set<string>(options.pinnedContentHashes ?? []);
    const markedSlotCounts = new Map<string, number>();
    const liveRootEpisodeIds: string[] = [];

    const sortedEpisodes = [...this.episodesById.values()].sort(
      (a, b) => a.episodeNumber - b.episodeNumber || a.episodeId.localeCompare(b.episodeId),
    );
    for (const episode of sortedEpisodes) {
      if (episode.state !== "live") continue;
      liveRootEpisodeIds.push(episode.episodeId);
      for (const binding of episode.bindings) {
        markedSlotCounts.set(binding.contentHash, (markedSlotCounts.get(binding.contentHash) ?? 0) + 1);
      }
    }

    let refCountLedgerConsistent = true;
    const orphanBlobs: OrphanBlobCandidate[] = [];
    let reclaimableBytes = 0;
    const retainedHashes = new Set<string>();

    for (const [hash, blob] of this.blobsByHash.entries()) {
      const markedCount = markedSlotCounts.get(hash) ?? 0;
      if (markedCount !== blob.liveRefCount) refCountLedgerConsistent = false;
      if (markedCount > 0 || pinnedSet.has(hash)) {
        retainedHashes.add(hash);
      } else {
        orphanBlobs.push({
          contentHash: blob.contentHash, fnv1a32Hex: blob.fnv1a32Hex,
          byteLength: blob.byteLength, primaryKind: blob.primaryKind,
        });
        reclaimableBytes += blob.byteLength;
      }
    }

    let projectedDanglingRefCount = 0;
    for (const episode of sortedEpisodes) {
      if (episode.state !== "live") continue;
      for (const binding of episode.bindings) {
        if (!retainedHashes.has(binding.contentHash) || !this.blobsByHash.has(binding.contentHash)) {
          projectedDanglingRefCount += 1;
        }
      }
    }

    return {
      liveRootEpisodeIds, pinnedContentHashes: [...pinnedSet],
      markedReachableBlobCount: retainedHashes.size, orphanBlobs,
      reclaimableBytes, refCountLedgerConsistent, projectedDanglingRefCount,
    };
  }

  /** Mark-and-Sweep GC를 실행해 고아 블롭을 회수하고 현역 회차의 `danglingRefCount === 0` 불변식을 전수 검증한다. */
  public executeMarkAndSweepGc(options: GcPlannerOptions = {}): GcExecutionReport {
    const plan = this.planMarkAndSweepGc(options);
    if (plan.projectedDanglingRefCount > 0) {
      throw new Error(`GC 안전성 차단: 현역 회차 참조 ${plan.projectedDanglingRefCount}건 손실 위험이 감지되었습니다.`);
    }

    const orphanHashSet = new Set<string>(plan.orphanBlobs.map((item) => item.contentHash));
    for (const orphan of plan.orphanBlobs) {
      this.blobsByHash.delete(orphan.contentHash);
      const bucketKey = makeStage1BucketKey(orphan.byteLength, orphan.fnv1a32Hex);
      const bucket = this.stage1Buckets.get(bucketKey);
      if (bucket !== undefined) {
        const filtered = bucket.filter((hash) => !orphanHashSet.has(hash));
        if (filtered.length === 0) this.stage1Buckets.delete(bucketKey);
        else this.stage1Buckets.set(bucketKey, filtered);
      }
    }

    let purgedScrappedEpisodeCount = 0;
    if (options.purgeScrappedEpisodeRecords !== false) {
      for (const [epId, ep] of this.episodesById.entries()) {
        if (ep.state === "draft-scrapped") {
          this.episodesById.delete(epId);
          purgedScrappedEpisodeCount += 1;
        }
      }
    }

    const verification = this.verifySeriesPackIntegrity();
    let remainingPhysicalBytes = 0;
    for (const blob of this.blobsByHash.values()) remainingPhysicalBytes += blob.byteLength;

    return {
      reclaimedBlobCount: plan.orphanBlobs.length, reclaimedBytes: plan.reclaimableBytes,
      remainingPhysicalBlobCount: this.blobsByHash.size, remainingPhysicalBytes,
      purgedScrappedEpisodeCount, verifiedLiveEpisodeCount: verification.verifiedLiveEpisodeCount,
      verifiedLiveSlotCount: verification.verifiedLiveSlotCount,
      danglingRefCount: verification.danglingRefCount,
      refCountMismatchCount: verification.refCountMismatchCount,
      summaryKo: `고아 블롭 ${plan.orphanBlobs.length}개(${plan.reclaimableBytes.toLocaleString("en-US")}B) 회수 완료 · 현역 ${verification.verifiedLiveEpisodeCount}화 참조 무결성 확인(끊어진 참조 ${verification.danglingRefCount}건).`,
    };
  }

  /** 모든 현역(`live`) 회차의 에셋 슬롯이 실재 물리 블롭과 일치하는지 검증한다. */
  public verifySeriesPackIntegrity(): IntegrityVerificationReport {
    let verifiedLiveEpisodeCount = 0;
    let verifiedLiveSlotCount = 0;
    let danglingRefCount = 0;
    const countedSlotRefs = new Map<string, number>();

    for (const episode of this.episodesById.values()) {
      if (episode.state !== "live") continue;
      verifiedLiveEpisodeCount += 1;
      for (const binding of episode.bindings) {
        verifiedLiveSlotCount += 1;
        const blob = this.blobsByHash.get(binding.contentHash);
        if (blob === undefined || blob.byteLength !== binding.byteLength) {
          danglingRefCount += 1;
          continue;
        }
        countedSlotRefs.set(binding.contentHash, (countedSlotRefs.get(binding.contentHash) ?? 0) + 1);
      }
    }

    let refCountMismatchCount = 0;
    let hashMismatchCount = 0;
    for (const [hash, blob] of this.blobsByHash.entries()) {
      if (blob.liveRefCount !== (countedSlotRefs.get(hash) ?? 0)) refCountMismatchCount += 1;
      if (computeAssetSha256Hex(blob.bytes) !== hash) hashMismatchCount += 1;
    }

    return {
      isHealthy: danglingRefCount === 0 && refCountMismatchCount === 0 && hashMismatchCount === 0,
      verifiedLiveEpisodeCount, verifiedLiveSlotCount,
      danglingRefCount, refCountMismatchCount, hashMismatchCount,
    };
  }

  /** 연재 전체 현역 회차를 아우르는 중복 제거 통합 팩 매니페스트(`physicalBytes` 대 `logicalBytes`)를 생성한다. */
  public buildSeriesPackManifest(seriesId: string): SeriesPackManifest {
    const sortedEpisodes = [...this.episodesById.values()].sort(
      (a, b) => a.episodeNumber - b.episodeNumber || a.episodeId.localeCompare(b.episodeId),
    );
    const kindTrackers = new Map<
      SeriesAssetKind, { slots: number; logicalBytes: number; uniqueHashes: Set<string>; physicalBytes: number }
    >();
    for (const kind of SERIES_ASSET_KINDS) {
      kindTrackers.set(kind, { slots: 0, logicalBytes: 0, uniqueHashes: new Set<string>(), physicalBytes: 0 });
    }

    const liveReachableHashes = new Set<string>();
    const episodeEntries: EpisodeManifestEntry[] = [];
    let liveEpisodeCount = 0;
    let totalLiveAssetSlots = 0;
    let logicalBytes = 0;
    let danglingRefCount = 0;

    for (const ep of sortedEpisodes) {
      let epLogical = 0;
      for (const b of ep.bindings) {
        epLogical += b.byteLength;
        if (ep.state !== "live") continue;
        totalLiveAssetSlots += 1;
        logicalBytes += b.byteLength;
        const blob = this.blobsByHash.get(b.contentHash);
        if (blob === undefined) {
          danglingRefCount += 1;
          continue;
        }
        liveReachableHashes.add(b.contentHash);
        const tracker = kindTrackers.get(b.kind);
        if (tracker !== undefined) {
          tracker.slots += 1;
          tracker.logicalBytes += b.byteLength;
          if (!tracker.uniqueHashes.has(b.contentHash)) {
            tracker.uniqueHashes.add(b.contentHash);
            tracker.physicalBytes += blob.byteLength;
          }
        }
      }
      if (ep.state === "live") liveEpisodeCount += 1;
      episodeEntries.push({
        episodeId: ep.episodeId, episodeNumber: ep.episodeNumber,
        titleKo: ep.titleKo, state: ep.state, logicalBytes: epLogical, bindings: ep.bindings,
      });
    }

    let physicalBytes = 0;
    let residentOrphanBytes = 0;
    const blobDescriptors: DeduplicatedBlobDescriptor[] = [];
    const sortedBlobs = [...this.blobsByHash.values()].sort((a, b) => a.contentHash.localeCompare(b.contentHash));
    for (const blob of sortedBlobs) {
      if (liveReachableHashes.has(blob.contentHash)) {
        physicalBytes += blob.byteLength;
        blobDescriptors.push({
          contentHash: blob.contentHash, fnv1a32Hex: blob.fnv1a32Hex, byteLength: blob.byteLength,
          primaryKind: blob.primaryKind, observedKinds: [...blob.observedKinds],
          liveRefCount: blob.liveRefCount, referencingLiveEpisodeIds: [...blob.liveEpisodeSlotCounts.keys()].sort(),
        });
      } else {
        residentOrphanBytes += blob.byteLength;
      }
    }

    const savedBytes = Math.max(0, logicalBytes - physicalBytes);
    const savingsRatio = logicalBytes > 0 ? savedBytes / logicalBytes : 0;

    const buildKindSummary = (kind: SeriesAssetKind): AssetKindDedupSummary => {
      const t = kindTrackers.get(kind);
      const kLogical = t?.logicalBytes ?? 0;
      const kPhysical = t?.physicalBytes ?? 0;
      const kSaved = Math.max(0, kLogical - kPhysical);
      return {
        kind, slotReferenceCount: t?.slots ?? 0, uniqueBlobCount: t?.uniqueHashes.size ?? 0,
        logicalBytes: kLogical, physicalBytes: kPhysical, savedBytes: kSaved,
        savingsRatio: kLogical > 0 ? kSaved / kLogical : 0,
      };
    };

    return {
      seriesId, liveEpisodeCount, totalLiveAssetSlots, uniqueLiveBlobCount: blobDescriptors.length,
      residentBlobCount: this.blobsByHash.size, logicalBytes, physicalBytes, residentOrphanBytes,
      savedBytes, savingsRatio, danglingRefCount,
      fingerprintStats: {
        totalIngestedSlots: this.totalIngestedSlots,
        stage1UniqueFastPathCount: this.stage1UniqueFastPathCount,
        stage1PreFilterHitCount: this.stage1PreFilterHitCount,
        stage2Sha256VerifiedDedupCount: this.stage2Sha256VerifiedDedupCount,
        stage1CollisionSeparatedCount: this.stage1CollisionSeparatedCount,
      },
      kindSummaries: {
        "prop-3d": buildKindSummary("prop-3d"),
        "vrm-outfit": buildKindSummary("vrm-outfit"),
        "custom-brush": buildKindSummary("custom-brush"),
        "color-lut-cube": buildKindSummary("color-lut-cube"),
        screentone: buildKindSummary("screentone"),
      },
      blobs: blobDescriptors,
      episodes: episodeEntries,
      summaryKo: `${seriesId} (${liveEpisodeCount}화): 논리 용량 ${logicalBytes.toLocaleString("en-US")}B → 물리 용량 ${physicalBytes.toLocaleString("en-US")}B (${(savingsRatio * 100).toFixed(1)}% 절감, 끊어진 참조 ${danglingRefCount}건).`,
    };
  }
}
