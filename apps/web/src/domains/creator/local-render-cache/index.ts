/**
 * ₩0 브라우저 로컬 타일 렌더 풀 · 3계층 하이브리드 캐시 · 64-bit dHash 저작권 핑거프린트 ·
 * 팬 펀딩 마일스톤 BEP 플래너 통합 진입점.
 */

import {
  DEFAULT_FAN_FUNDING_FEE_POLICY,
  planFanFundingMilestones,
} from "./fan-funding-milestone-planner";
import { DEFAULT_HYBRID_CACHE_POLICY } from "./hybrid-tier-asset-cache";
import {
  computeAutoWorkerConcurrency,
  computeDefaultMemoryBudgetBytes,
} from "./local-render-worker-pool";
import { DHASH_SIMILARITY_THRESHOLDS } from "./perceptual-copyright-fingerprint";

export {
  DEFAULT_LOCAL_RENDER_MEMORY_BUDGET_BYTES,
  LocalRenderAbortError,
  LocalRenderMemoryLimitError,
  LocalRenderWorkerPool,
  computeAutoWorkerConcurrency,
  computeDefaultMemoryBudgetBytes,
  createInlineLocalTileRuntime,
  createLocalRenderWorkerPool,
  createWebWorkerTileRuntime,
} from "./local-render-worker-pool";

export type {
  AutoConcurrencyOptions,
  LocalRenderPoolSnapshot,
  LocalRenderWorkerPoolOptions,
  MemoryBackpressureState,
  TileExecutionContext,
  TileRenderPriority,
  TileRenderTaskRequest,
  TileWorkerRuntime,
  WebWorkerLike,
  WebWorkerTileInboundMessage,
  WebWorkerTileOutboundMessage,
} from "./local-render-worker-pool";

export {
  DEFAULT_HYBRID_CACHE_POLICY,
  HybridCacheFetchError,
  HybridCacheIntegrityError,
  HybridCacheOfflineMissError,
  HybridCacheValidationError,
  HybridTierAssetCache,
  buildR2ImmutableAssetUrl,
  computeAssetSha256Hex,
  createHybridTierAssetCache,
  createIndexedDbCacheAdapter,
  createMemoryPersistentCacheAdapter,
  createOpfsCacheAdapter,
  createR2FetchAdapter,
  normalizeSha256Hex,
  sha256PureHex,
} from "./hybrid-tier-asset-cache";

export type {
  CacheTierSource,
  CachedAssetRecord,
  HybridCacheGetOptions,
  HybridCacheGetResult,
  HybridCachePutOptions,
  HybridCachePutResult,
  HybridCacheTelemetry,
  HybridTierAssetCacheOptions,
  PersistentCacheEntryMetadata,
  PersistentCacheTierAdapter,
  RemoteHashAssetFetcher,
  RemoteHashFetchRequest,
  RemoteHashFetchResponse,
} from "./hybrid-tier-asset-cache";

export {
  ALL_FINGERPRINT_ORIENTATIONS,
  DHASH_GRID_HEIGHT,
  DHASH_GRID_WIDTH,
  DHASH_SIMILARITY_THRESHOLDS,
  compareCopyrightFingerprints,
  computeCopyrightFingerprint,
  computeDHash64,
  createCopyrightTrackingRecord,
  createDHash64FromWords,
  dHashSimilarityScore,
  hammingDistance64,
  parseDHash64Hex,
  scanManuscriptAgainstReferences,
  transformPixelSurface,
} from "./perceptual-copyright-fingerprint";

export type {
  CopyrightFingerprint,
  CopyrightTrackingRecord,
  CopyrightTrackingRecordInput,
  DHash64,
  FingerprintComparisonOptions,
  FingerprintComparisonResult,
  FingerprintOrientation,
  ManuscriptSimilarityScanReport,
  PixelSurfaceInput,
  ReferenceFingerprintEntry,
  ReferenceSimilarityMatch,
  SimilarityThresholdPolicy,
  SimilarityVerdict,
} from "./perceptual-copyright-fingerprint";

export {
  DEFAULT_FAN_FUNDING_FEE_POLICY,
  allocateIntegerProportionally,
  multiplyKrwByBps,
  planFanFundingMilestones,
} from "./fan-funding-milestone-planner";

export type {
  BreakEvenAnalysis,
  CampaignIntegerSettlement,
  FanFundingMilestonePlanResult,
  FanFundingPlanInput,
  FundingFeePolicyBps,
  FundingMilestoneInput,
  FundingRewardTierInput,
  MilestoneEvaluation,
  TierSettlementBreakdown,
} from "./fan-funding-milestone-planner";

export interface LocalRenderCacheRuntimeReadiness {
  readonly autoWorkerCount: number;
  readonly renderMemoryBudgetMb: number;
  readonly l1CacheBudgetMb: number;
  readonly l2CacheBudgetMb: number;
  readonly dHashWarningThreshold: number;
  readonly sampleBepBackers: number | null;
  readonly sampleReconciliationErrorKrw: number;
  readonly zeroCloudCostKrw: 0;
}

/**
 * 스튜디오 패널에서 ₩0 로컬 타일 렌더 풀·3계층 캐시·dHash 지문·펀딩 BEP 준비 상태를
 * 부작용 없이 즉시 요약해 표시하기 위한 경량 스냅샷 생성기.
 */
export function inspectLocalRenderCacheReadiness(): LocalRenderCacheRuntimeReadiness {
  const autoWorkerCount = computeAutoWorkerConcurrency();
  const renderMemoryBudgetMb = Math.round(computeDefaultMemoryBudgetBytes() / (1024 * 1024));
  const l1CacheBudgetMb = Math.round(DEFAULT_HYBRID_CACHE_POLICY.maxL1Bytes / (1024 * 1024));
  const l2CacheBudgetMb = Math.round(DEFAULT_HYBRID_CACHE_POLICY.maxL2Bytes / (1024 * 1024));

  const samplePlan = planFanFundingMilestones({
    projectTitle: "단행본 표준 기준",
    targetFundingKrw: 3_000_000,
    fixedCostKrw: 1_200_000,
    feePolicy: DEFAULT_FAN_FUNDING_FEE_POLICY,
    tiers: [
      {
        id: "book-standard",
        name: "단행본 기본 세트",
        priceKrw: 24_000,
        unitProductionCostKrw: 7_500,
        unitShippingCostKrw: 3_500,
        plannedBackerCount: 150,
      },
    ],
  });

  return {
    autoWorkerCount,
    renderMemoryBudgetMb,
    l1CacheBudgetMb,
    l2CacheBudgetMb,
    dHashWarningThreshold: DHASH_SIMILARITY_THRESHOLDS.highSimilarityWarningMaxDistance,
    sampleBepBackers: samplePlan.breakEven.breakEvenBackers,
    sampleReconciliationErrorKrw: samplePlan.plannedSettlement.reconciliationErrorKrw,
    zeroCloudCostKrw: 0,
  };
}
