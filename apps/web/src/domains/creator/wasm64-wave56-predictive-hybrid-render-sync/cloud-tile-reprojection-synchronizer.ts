/**
 * Wave-56: 온디바이스-클라우드 하이브리드 타일 재투영 동기화 엔진 (`HybridRenderTileSynchronizer`).
 *
 * 무거운 3D 배경·이펙트 클라우드 타일(또는 오프스크린 워커 타일)을 로컬 프레임 타임스탬프에 맞춰
 * 2D 호모그래피·깊이 시차(Depth-Aware Timewarp)로 즉시 재투영한다. 최신 타일 도착 시 단조 증가
 * 세대 원장(Seams-Free Tile Generation Ledger)으로 구버전 역전을 차단하고 Smoothstep 알파
 * 크로스페이드 수렴, 인접 타일 페더링, 지연 급증 시 로컬 프록시 강등(LOD Fallback)을 수행한다.
 */

import {
  computeReprojectionHomography2D,
  type Matrix3x3,
  type ReprojectionHomography2DResult,
  type ViewportCameraPose2D,
} from "./hybrid-camera-motion-predictor";

export type RenderFallbackTier =
  | "cloud-hq"
  | "cloud-balanced"
  | "hybrid-proxy-blend"
  | "local-proxy-only";

export const FALLBACK_TIER_LOD_LEVEL: Readonly<Record<RenderFallbackTier, number>> = {
  "cloud-hq": 0,
  "cloud-balanced": 1,
  "hybrid-proxy-blend": 2,
  "local-proxy-only": 3,
};

export interface TileRect2D {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface TileGridAddress {
  readonly layerId: string;
  readonly tileX: number;
  readonly tileY: number;
}

export interface CloudRenderTilePacket extends TileGridAddress {
  readonly sceneRevision: number;
  readonly generation: number;
  readonly lodLevel: number;
  readonly sourcePose: ViewportCameraPose2D;
  readonly boundsPx: TileRect2D;
  readonly renderedAtMs: number;
  readonly depthMeters?: number;
  readonly depthNormalized?: number;
  readonly skirtPaddingPx: number;
  readonly contentHash: string;
}

export interface LocalProxyTileDescriptor extends TileGridAddress {
  readonly boundsPx: TileRect2D;
  readonly sourcePose: ViewportCameraPose2D;
  readonly depthMeters?: number;
  readonly depthNormalized?: number;
  readonly updatedAtMs: number;
  readonly proxyAssetKey: string;
}

export type TileIngestStatus =
  | "accepted-initial"
  | "accepted-crossfade"
  | "rejected-stale-revision"
  | "rejected-stale-generation"
  | "rejected-duplicate";

export interface TileIngestDecision {
  readonly tileKey: string;
  readonly status: TileIngestStatus;
  readonly acceptedGeneration: number;
  readonly acceptedSceneRevision: number;
  readonly incomingGeneration: number;
  readonly incomingSceneRevision: number;
  readonly crossFadeStarted: boolean;
}

export interface TileGenerationLedgerEntry extends TileGridAddress {
  readonly tileKey: string;
  readonly activeSceneRevision: number;
  readonly activeGeneration: number;
  readonly activeLodLevel: number;
  readonly activeContentHash: string;
  readonly renderedAtMs: number;
  readonly receivedAtMs: number;
  readonly isCrossFading: boolean;
  readonly rejectedStaleCount: number;
}

export interface RenderHealthInput {
  readonly cloudLatencyMs: number;
  readonly localFrameTimeMs: number;
  readonly networkOffline?: boolean;
  readonly timestampMs: number;
}

export interface RenderFallbackState {
  readonly tier: RenderFallbackTier;
  readonly targetLodLevel: number;
  readonly localProxyBlendWeight: number;
  readonly reason:
    | "healthy"
    | "cloud-latency-elevated"
    | "cloud-latency-spike"
    | "frame-budget-pressure"
    | "network-offline"
    | "all-tiles-expired";
  readonly consecutiveHealthyFrames: number;
  readonly lastCloudLatencyMs: number;
  readonly lastLocalFrameTimeMs: number;
  readonly updatedAtMs: number;
}

export interface HybridTileSynchronizerConfig {
  readonly crossFadeDurationMs: number;
  readonly focusDepthMeters: number;
  readonly frameBudgetMs: number;
  readonly balancedLatencyThresholdMs: number;
  readonly hybridBlendLatencyThresholdMs: number;
  readonly localProxyLatencyThresholdMs: number;
  readonly maxCloudTileAgeMs: number;
  readonly recoveryHysteresisFrames: number;
  readonly seamFeatherMarginPx: number;
  readonly maxRefreshRequestsPerFrame: number;
}

export const DEFAULT_TILE_SYNCHRONIZER_CONFIG: HybridTileSynchronizerConfig = {
  crossFadeDurationMs: 120,
  focusDepthMeters: 2.5,
  frameBudgetMs: 1000 / 120,
  balancedLatencyThresholdMs: 95,
  hybridBlendLatencyThresholdMs: 180,
  localProxyLatencyThresholdMs: 300,
  maxCloudTileAgeMs: 320,
  recoveryHysteresisFrames: 4,
  seamFeatherMarginPx: 12,
  maxRefreshRequestsPerFrame: 8,
};

export interface SynchronizeFrameInput {
  readonly targetPose: ViewportCameraPose2D;
  readonly nowMs: number;
  readonly viewportWidth: number;
  readonly viewportHeight: number;
  readonly pivotX?: number;
  readonly pivotY?: number;
  readonly perspectiveTiltX?: number;
  readonly perspectiveTiltY?: number;
  readonly layerIds?: readonly string[];
}

export interface ReprojectedTileLayerDraw {
  readonly contentHash: string;
  readonly generation: number;
  readonly sceneRevision: number;
  readonly lodLevel: number;
  readonly alpha: number;
  readonly homography: Matrix3x3;
  readonly parallaxGain: number;
  readonly scaleRatio: number;
  readonly maxCornerDisplacementPx: number;
  readonly ageMs: number;
}

export interface SynchronizedTileDrawCommand extends TileGridAddress {
  readonly tileKey: string;
  readonly mode: "cloud-reprojected" | "cloud-crossfade" | "hybrid-proxy-blend" | "local-proxy";
  readonly primaryLayer: ReprojectedTileLayerDraw | null;
  readonly previousLayer: ReprojectedTileLayerDraw | null;
  readonly localProxyLayer: {
    readonly proxyAssetKey: string;
    readonly alpha: number;
    readonly homography: Matrix3x3;
  } | null;
  readonly convergenceProgress: number;
  readonly estimatedErrorPx: number;
  readonly skirtExhausted: boolean;
  readonly edgeBlendMarginPx: number;
  readonly seamRiskScore: number;
}

export interface TileRefreshRequest extends TileGridAddress {
  readonly tileKey: string;
  readonly requestedLodLevel: number;
  readonly priorityScore: number;
  readonly reason: "skirt-exhausted" | "stale-age" | "seam-reconcile" | "lod-upgrade";
}

export interface SynchronizedFramePlan {
  readonly timestampMs: number;
  readonly fallbackState: RenderFallbackState;
  readonly drawCommands: readonly SynchronizedTileDrawCommand[];
  readonly refreshRequests: readonly TileRefreshRequest[];
  readonly summary: {
    readonly totalTiles: number;
    readonly crossFadingTiles: number;
    readonly proxyFallbackTiles: number;
    readonly skirtExhaustedTiles: number;
    readonly meanEstimatedErrorPx: number;
    readonly maxEstimatedErrorPx: number;
    readonly maxSeamRiskScore: number;
  };
}

interface InternalTileSlot {
  readonly tileKey: string;
  readonly layerId: string;
  readonly tileX: number;
  readonly tileY: number;
  active: CloudRenderTilePacket;
  receivedAtMs: number;
  previous: CloudRenderTilePacket | null;
  transitionStartMs: number;
  transitionDurationMs: number;
  rejectedStaleCount: number;
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return value < min ? min : value > max ? max : value;
}

function smoothstep01(t: number): number {
  const x = clamp(t, 0, 1);
  return x * x * (3 - 2 * x);
}

/** 타일 주소로부터 결정론적 고유 키를 생성한다. */
export function buildTileSlotKey(address: TileGridAddress): string {
  return `${address.layerId}:${address.tileX}:${address.tileY}`;
}

function createInitialFallbackState(): RenderFallbackState {
  return {
    tier: "cloud-hq",
    targetLodLevel: 0,
    localProxyBlendWeight: 0,
    reason: "healthy",
    consecutiveHealthyFrames: 0,
    lastCloudLatencyMs: 0,
    lastLocalFrameTimeMs: 0,
    updatedAtMs: 0,
  };
}

function rankToTier(rank: number): RenderFallbackTier {
  if (rank <= 0) return "cloud-hq";
  if (rank === 1) return "cloud-balanced";
  if (rank === 2) return "hybrid-proxy-blend";
  return "local-proxy-only";
}

function proxyWeightForTier(tier: RenderFallbackTier): number {
  if (tier === "hybrid-proxy-blend") return 0.45;
  if (tier === "local-proxy-only") return 1;
  return 0;
}

function makeDecision(
  tileKey: string,
  status: TileIngestStatus,
  accepted: CloudRenderTilePacket,
  incoming: CloudRenderTilePacket,
  crossFadeStarted: boolean,
): TileIngestDecision {
  return {
    tileKey,
    status,
    acceptedGeneration: accepted.generation,
    acceptedSceneRevision: accepted.sceneRevision,
    incomingGeneration: incoming.generation,
    incomingSceneRevision: incoming.sceneRevision,
    crossFadeStarted,
  };
}

function buildLayerDraw(
  packet: CloudRenderTilePacket,
  reproj: ReprojectionHomography2DResult,
  alpha: number,
  nowMs: number,
): ReprojectedTileLayerDraw {
  return {
    contentHash: packet.contentHash,
    generation: packet.generation,
    sceneRevision: packet.sceneRevision,
    lodLevel: packet.lodLevel,
    alpha,
    homography: reproj.matrix,
    parallaxGain: reproj.parallaxGain,
    scaleRatio: reproj.scaleRatio,
    maxCornerDisplacementPx: reproj.maxCornerDisplacementPx,
    ageMs: Math.max(0, nowMs - packet.renderedAtMs),
  };
}

/** 온디바이스-클라우드 하이브리드 타일 재투영·델타 수렴·LOD 강등 동기화 엔진. */
export class HybridRenderTileSynchronizer {
  private readonly config: HybridTileSynchronizerConfig;
  private readonly slots = new Map<string, InternalTileSlot>();
  private readonly localProxies = new Map<string, LocalProxyTileDescriptor>();
  private fallbackState: RenderFallbackState = createInitialFallbackState();

  constructor(overrides?: Partial<HybridTileSynchronizerConfig>) {
    const d = DEFAULT_TILE_SYNCHRONIZER_CONFIG;
    this.config = {
      crossFadeDurationMs: Math.max(1, overrides?.crossFadeDurationMs ?? d.crossFadeDurationMs),
      focusDepthMeters: Math.max(0.1, overrides?.focusDepthMeters ?? d.focusDepthMeters),
      frameBudgetMs: Math.max(1, overrides?.frameBudgetMs ?? d.frameBudgetMs),
      balancedLatencyThresholdMs: Math.max(10, overrides?.balancedLatencyThresholdMs ?? d.balancedLatencyThresholdMs),
      hybridBlendLatencyThresholdMs: Math.max(20, overrides?.hybridBlendLatencyThresholdMs ?? d.hybridBlendLatencyThresholdMs),
      localProxyLatencyThresholdMs: Math.max(40, overrides?.localProxyLatencyThresholdMs ?? d.localProxyLatencyThresholdMs),
      maxCloudTileAgeMs: Math.max(50, overrides?.maxCloudTileAgeMs ?? d.maxCloudTileAgeMs),
      recoveryHysteresisFrames: Math.max(1, Math.floor(overrides?.recoveryHysteresisFrames ?? d.recoveryHysteresisFrames)),
      seamFeatherMarginPx: Math.max(0, overrides?.seamFeatherMarginPx ?? d.seamFeatherMarginPx),
      maxRefreshRequestsPerFrame: Math.max(1, Math.floor(overrides?.maxRefreshRequestsPerFrame ?? d.maxRefreshRequestsPerFrame)),
    };
  }

  /** 모든 타일 원장과 강등 상태를 초기화한다. */
  public reset(): void {
    this.slots.clear();
    this.localProxies.clear();
    this.fallbackState = createInitialFallbackState();
  }

  /** 로컬 경량 프록시 타일을 등록하거나 갱신한다. */
  public registerLocalProxyTile(tile: LocalProxyTileDescriptor): void {
    this.localProxies.set(buildTileSlotKey(tile), tile);
  }

  /** 원격/워커 클라우드 타일을 세대 원장에 수집하며 구버전 역전을 결정론적으로 차단한다. */
  public ingestCloudTile(packet: CloudRenderTilePacket, receivedAtMs?: number): TileIngestDecision {
    const tileKey = buildTileSlotKey(packet);
    const arrivalMs = receivedAtMs ?? packet.renderedAtMs;
    const existing = this.slots.get(tileKey);

    if (!existing) {
      this.slots.set(tileKey, {
        tileKey,
        layerId: packet.layerId,
        tileX: packet.tileX,
        tileY: packet.tileY,
        active: packet,
        receivedAtMs: arrivalMs,
        previous: null,
        transitionStartMs: arrivalMs,
        transitionDurationMs: this.config.crossFadeDurationMs,
        rejectedStaleCount: 0,
      });
      return makeDecision(tileKey, "accepted-initial", packet, packet, false);
    }

    if (packet.sceneRevision < existing.active.sceneRevision) {
      existing.rejectedStaleCount += 1;
      return makeDecision(tileKey, "rejected-stale-revision", existing.active, packet, false);
    }
    if (packet.sceneRevision === existing.active.sceneRevision) {
      if (packet.generation < existing.active.generation) {
        existing.rejectedStaleCount += 1;
        return makeDecision(tileKey, "rejected-stale-generation", existing.active, packet, false);
      }
      if (packet.generation === existing.active.generation) {
        existing.rejectedStaleCount += 1;
        return makeDecision(tileKey, "rejected-duplicate", existing.active, packet, false);
      }
    }

    const fadeDurationMs =
      this.fallbackState.tier !== "cloud-hq"
        ? Math.max(40, Math.round(this.config.crossFadeDurationMs * 0.65))
        : this.config.crossFadeDurationMs;
    existing.previous = existing.active;
    existing.active = packet;
    existing.receivedAtMs = arrivalMs;
    existing.transitionStartMs = arrivalMs;
    existing.transitionDurationMs = fadeDurationMs;
    return makeDecision(tileKey, "accepted-crossfade", packet, packet, true);
  }

  /** 네트워크 지연과 로컬 프레임 시간을 반영해 강등(LOD Fallback) 상태를 갱신한다. */
  public reportNetworkAndFrameHealth(sample: RenderHealthInput): RenderFallbackState {
    const cloudMs = Math.max(0, Number.isFinite(sample.cloudLatencyMs) ? sample.cloudLatencyMs : 0);
    const localMs = Math.max(0, Number.isFinite(sample.localFrameTimeMs) ? sample.localFrameTimeMs : 0);

    let desiredTier: RenderFallbackTier = "cloud-hq";
    let reason: RenderFallbackState["reason"] = "healthy";

    if (sample.networkOffline === true) {
      desiredTier = "local-proxy-only";
      reason = "network-offline";
    } else if (cloudMs >= this.config.localProxyLatencyThresholdMs) {
      desiredTier = "local-proxy-only";
      reason = "cloud-latency-spike";
    } else if (cloudMs >= this.config.hybridBlendLatencyThresholdMs) {
      desiredTier = "hybrid-proxy-blend";
      reason = "cloud-latency-spike";
    } else if (cloudMs >= this.config.balancedLatencyThresholdMs) {
      desiredTier = "cloud-balanced";
      reason = "cloud-latency-elevated";
    }

    if (localMs > this.config.frameBudgetMs * 1.45 && FALLBACK_TIER_LOD_LEVEL[desiredTier] < 2) {
      desiredTier = "hybrid-proxy-blend";
      reason = "frame-budget-pressure";
    } else if (localMs > this.config.frameBudgetMs * 1.15 && FALLBACK_TIER_LOD_LEVEL[desiredTier] < 1) {
      desiredTier = "cloud-balanced";
      reason = "frame-budget-pressure";
    }

    const currentRank = FALLBACK_TIER_LOD_LEVEL[this.fallbackState.tier];
    const desiredRank = FALLBACK_TIER_LOD_LEVEL[desiredTier];
    let nextTier = this.fallbackState.tier;
    let nextHealthyStreak = this.fallbackState.consecutiveHealthyFrames;
    let nextReason = reason;

    if (desiredRank > currentRank) {
      nextTier = desiredTier;
      nextHealthyStreak = 0;
    } else if (desiredRank < currentRank) {
      nextHealthyStreak += 1;
      if (nextHealthyStreak >= this.config.recoveryHysteresisFrames) {
        nextTier = rankToTier(currentRank - 1);
        nextHealthyStreak = 0;
        nextReason = nextTier === "cloud-hq" ? "healthy" : this.fallbackState.reason;
      } else {
        nextReason = this.fallbackState.reason;
      }
    } else {
      nextHealthyStreak = desiredRank === 0 ? nextHealthyStreak + 1 : 0;
    }

    this.fallbackState = {
      tier: nextTier,
      targetLodLevel: FALLBACK_TIER_LOD_LEVEL[nextTier],
      localProxyBlendWeight: proxyWeightForTier(nextTier),
      reason: nextReason,
      consecutiveHealthyFrames: nextHealthyStreak,
      lastCloudLatencyMs: cloudMs,
      lastLocalFrameTimeMs: localMs,
      updatedAtMs: sample.timestampMs,
    };
    return this.fallbackState;
  }

  /** 현재 강등 상태 스냅샷을 반환한다. */
  public getFallbackState(): RenderFallbackState {
    return this.fallbackState;
  }

  private reprojectPose(
    sourcePose: ViewportCameraPose2D,
    input: SynchronizeFrameInput,
    pivotX: number,
    pivotY: number,
    depthMeters: number | undefined,
    depthNormalized: number | undefined,
  ): ReprojectionHomography2DResult {
    return computeReprojectionHomography2D(sourcePose, input.targetPose, {
      pivotX,
      pivotY,
      viewportWidth: input.viewportWidth,
      viewportHeight: input.viewportHeight,
      depthMeters,
      focusDepthMeters: this.config.focusDepthMeters,
      depthNormalized,
      perspectiveTiltX: input.perspectiveTiltX,
      perspectiveTiltY: input.perspectiveTiltY,
    });
  }

  /** 현재 로컬 프레임 자세에 맞춰 모든 활성 타일의 재투영·크로스페이드·강등 합성 계획을 산출한다. */
  public evaluateFrame(input: SynchronizeFrameInput): SynchronizedFramePlan {
    const pivotX = input.pivotX ?? input.viewportWidth * 0.5;
    const pivotY = input.pivotY ?? input.viewportHeight * 0.5;
    const allowedLayers = input.layerIds !== undefined ? new Set<string>(input.layerIds) : null;
    const allKeys = new Set<string>();
    this.slots.forEach((slot, key) => {
      if (allowedLayers === null || allowedLayers.has(slot.layerId)) allKeys.add(key);
    });
    this.localProxies.forEach((proxy, key) => {
      if (allowedLayers === null || allowedLayers.has(proxy.layerId)) allKeys.add(key);
    });

    const sortedKeys = Array.from(allKeys).sort();
    const drawCommands: SynchronizedTileDrawCommand[] = [];
    const refreshCandidates: TileRefreshRequest[] = [];
    let crossFadingTiles = 0;
    let proxyFallbackTiles = 0;
    let skirtExhaustedTiles = 0;
    let errorSum = 0;
    let maxError = 0;
    let maxSeamRisk = 0;
    let expiredCloudCount = 0;
    let cloudSlotCount = 0;

    for (let i = 0; i < sortedKeys.length; i += 1) {
      const tileKey = sortedKeys[i];
      if (tileKey === undefined) continue;
      const slot = this.slots.get(tileKey);
      const proxy = this.localProxies.get(tileKey);
      const proxyReproj = proxy
        ? this.reprojectPose(proxy.sourcePose, input, pivotX, pivotY, proxy.depthMeters, proxy.depthNormalized)
        : null;

      if (!slot) {
        if (proxy && proxyReproj) {
          proxyFallbackTiles += 1;
          drawCommands.push({
            tileKey, layerId: proxy.layerId, tileX: proxy.tileX, tileY: proxy.tileY, mode: "local-proxy",
            primaryLayer: null, previousLayer: null,
            localProxyLayer: { proxyAssetKey: proxy.proxyAssetKey, alpha: 1, homography: proxyReproj.matrix },
            convergenceProgress: 1, estimatedErrorPx: 0, skirtExhausted: false, edgeBlendMarginPx: 0, seamRiskScore: 0,
          });
        }
        continue;
      }

      cloudSlotCount += 1;
      const activeAgeMs = Math.max(0, input.nowMs - slot.active.renderedAtMs);
      if (activeAgeMs > this.config.maxCloudTileAgeMs) expiredCloudCount += 1;

      let convergenceProgress = 1;
      let activeAlpha = 1;
      let previousAlpha = 0;
      if (slot.previous !== null) {
        const elapsedMs = input.nowMs - slot.transitionStartMs;
        if (elapsedMs >= slot.transitionDurationMs) {
          slot.previous = null;
        } else {
          convergenceProgress = smoothstep01(elapsedMs / slot.transitionDurationMs);
          activeAlpha = convergenceProgress;
          previousAlpha = 1 - convergenceProgress;
          crossFadingTiles += 1;
        }
      }

      const activeReproj = this.reprojectPose(slot.active.sourcePose, input, pivotX, pivotY, slot.active.depthMeters, slot.active.depthNormalized);
      const primaryBase = buildLayerDraw(slot.active, activeReproj, activeAlpha, input.nowMs);
      const previousBase =
        slot.previous !== null && previousAlpha > 0
          ? buildLayerDraw(
              slot.previous,
              this.reprojectPose(slot.previous.sourcePose, input, pivotX, pivotY, slot.previous.depthMeters, slot.previous.depthNormalized),
              previousAlpha,
              input.nowMs,
            )
          : null;

      const panShiftPx = Math.hypot(activeReproj.translationDeltaPx.x, activeReproj.translationDeltaPx.y);
      const scaleStrainPx = Math.abs(Math.log(Math.max(0.05, activeReproj.scaleRatio))) * Math.max(slot.active.boundsPx.width, slot.active.boundsPx.height) * 0.18;
      const rotStrainPx = Math.abs(activeReproj.rotationDeltaRad) * Math.hypot(slot.active.boundsPx.width, slot.active.boundsPx.height) * 0.12;
      const parallaxDisoccPx = Math.abs(activeReproj.parallaxGain - 1) * panShiftPx * 0.35;
      const skirtOverflowPx = Math.max(0, Math.max(panShiftPx * 0.25, parallaxDisoccPx) + scaleStrainPx + rotStrainPx - slot.active.skirtPaddingPx);
      const skirtExhausted = skirtOverflowPx > 0;
      if (skirtExhausted) skirtExhaustedTiles += 1;

      const agePenalty = activeAgeMs > this.config.maxCloudTileAgeMs ? ((activeAgeMs - this.config.maxCloudTileAgeMs) / 100) * 0.6 : 0;
      const estimatedErrorPx = skirtOverflowPx * 0.85 + scaleStrainPx * 0.08 + rotStrainPx * 0.06 + agePenalty;
      errorSum += estimatedErrorPx;
      if (estimatedErrorPx > maxError) maxError = estimatedErrorPx;

      const seamRiskScore = this.computeNeighborSeamRisk(slot);
      if (seamRiskScore > maxSeamRisk) maxSeamRisk = seamRiskScore;
      const edgeBlendMarginPx = seamRiskScore > 0 ? Math.round(this.config.seamFeatherMarginPx * clamp(seamRiskScore, 0.25, 1) * 100) / 100 : 0;

      const forceLocalProxy = this.fallbackState.tier === "local-proxy-only" || (activeAgeMs > this.config.maxCloudTileAgeMs * 2 && proxy !== undefined);
      let mode: SynchronizedTileDrawCommand["mode"];
      let primaryLayer: ReprojectedTileLayerDraw | null = primaryBase;
      let previousLayer: ReprojectedTileLayerDraw | null = previousBase;
      let localProxyLayer: SynchronizedTileDrawCommand["localProxyLayer"] = null;

      if (forceLocalProxy && proxy && proxyReproj) {
        mode = "local-proxy";
        primaryLayer = null;
        previousLayer = null;
        localProxyLayer = { proxyAssetKey: proxy.proxyAssetKey, alpha: 1, homography: proxyReproj.matrix };
        proxyFallbackTiles += 1;
      } else if ((this.fallbackState.tier === "hybrid-proxy-blend" || skirtExhausted) && proxy && proxyReproj) {
        const proxyWeight = clamp(Math.max(this.fallbackState.localProxyBlendWeight, skirtExhausted ? 0.5 : 0), 0.2, 0.85);
        const cloudScale = 1 - proxyWeight;
        mode = "hybrid-proxy-blend";
        primaryLayer = { ...primaryBase, alpha: primaryBase.alpha * cloudScale };
        previousLayer = previousBase ? { ...previousBase, alpha: previousBase.alpha * cloudScale } : null;
        localProxyLayer = { proxyAssetKey: proxy.proxyAssetKey, alpha: proxyWeight, homography: proxyReproj.matrix };
        proxyFallbackTiles += 1;
      } else {
        mode = previousBase !== null ? "cloud-crossfade" : "cloud-reprojected";
      }

      drawCommands.push({
        tileKey, layerId: slot.layerId, tileX: slot.tileX, tileY: slot.tileY, mode,
        primaryLayer, previousLayer, localProxyLayer, convergenceProgress,
        estimatedErrorPx, skirtExhausted, edgeBlendMarginPx, seamRiskScore,
      });

      const targetLod = this.fallbackState.targetLodLevel;
      if (targetLod < 3) {
        let refreshReason: TileRefreshRequest["reason"] | null = null;
        let priority = 0;
        if (skirtExhausted) { refreshReason = "skirt-exhausted"; priority = 100 + skirtOverflowPx * 4; }
        else if (activeAgeMs > this.config.maxCloudTileAgeMs) { refreshReason = "stale-age"; priority = 70 + (activeAgeMs - this.config.maxCloudTileAgeMs) / 20; }
        else if (seamRiskScore >= 0.5) { refreshReason = "seam-reconcile"; priority = 55 + seamRiskScore * 20; }
        else if (slot.active.lodLevel > targetLod) { refreshReason = "lod-upgrade"; priority = 35 + (slot.active.lodLevel - targetLod) * 10; }

        if (refreshReason !== null) {
          const dist = Math.hypot(slot.active.boundsPx.x + slot.active.boundsPx.width * 0.5 - pivotX, slot.active.boundsPx.y + slot.active.boundsPx.height * 0.5 - pivotY);
          const centerBonus = 25 / (1 + dist / Math.max(128, input.viewportWidth * 0.5));
          refreshCandidates.push({
            tileKey, layerId: slot.layerId, tileX: slot.tileX, tileY: slot.tileY,
            requestedLodLevel: targetLod, priorityScore: Math.round((priority + centerBonus) * 100) / 100, reason: refreshReason,
          });
        }
      }
    }

    let effectiveFallbackState = this.fallbackState;
    if (cloudSlotCount > 0 && expiredCloudCount === cloudSlotCount && this.fallbackState.tier !== "local-proxy-only") {
      effectiveFallbackState = { ...this.fallbackState, tier: "local-proxy-only", targetLodLevel: 3, localProxyBlendWeight: 1, reason: "all-tiles-expired", updatedAtMs: input.nowMs };
      this.fallbackState = effectiveFallbackState;
    }

    refreshCandidates.sort((a, b) => (b.priorityScore !== a.priorityScore ? b.priorityScore - a.priorityScore : a.tileKey.localeCompare(b.tileKey)));
    const totalTiles = drawCommands.length;
    return {
      timestampMs: input.nowMs,
      fallbackState: effectiveFallbackState,
      drawCommands,
      refreshRequests: refreshCandidates.slice(0, this.config.maxRefreshRequestsPerFrame),
      summary: {
        totalTiles, crossFadingTiles, proxyFallbackTiles, skirtExhaustedTiles,
        meanEstimatedErrorPx: totalTiles > 0 ? errorSum / totalTiles : 0, maxEstimatedErrorPx: maxError, maxSeamRiskScore: maxSeamRisk,
      },
    };
  }

  private computeNeighborSeamRisk(slot: InternalTileSlot): number {
    const offsets: readonly (readonly [number, number])[] = [[-1, 0], [1, 0], [0, -1], [0, 1]];
    let worstRisk = 0;
    for (let i = 0; i < offsets.length; i += 1) {
      const offset = offsets[i];
      if (!offset) continue;
      const neighbor = this.slots.get(
        buildTileSlotKey({ layerId: slot.layerId, tileX: slot.tileX + offset[0], tileY: slot.tileY + offset[1] }),
      );
      if (!neighbor) continue;
      let risk = 0;
      if (neighbor.active.sceneRevision !== slot.active.sceneRevision) risk += 0.65;
      if (neighbor.active.lodLevel !== slot.active.lodLevel) {
        risk += 0.45 * Math.min(2, Math.abs(neighbor.active.lodLevel - slot.active.lodLevel));
      }
      if (neighbor.active.generation !== slot.active.generation) risk += 0.35;
      if (risk > worstRisk) worstRisk = risk;
    }
    return clamp(worstRisk, 0, 1);
  }

  /** 현재 세대 원장 스냅샷을 정렬된 불변 배열로 반환한다. */
  public getLedgerSnapshot(): readonly TileGenerationLedgerEntry[] {
    const entries: TileGenerationLedgerEntry[] = [];
    this.slots.forEach((slot) => {
      entries.push({
        tileKey: slot.tileKey,
        layerId: slot.layerId,
        tileX: slot.tileX,
        tileY: slot.tileY,
        activeSceneRevision: slot.active.sceneRevision,
        activeGeneration: slot.active.generation,
        activeLodLevel: slot.active.lodLevel,
        activeContentHash: slot.active.contentHash,
        renderedAtMs: slot.active.renderedAtMs,
        receivedAtMs: slot.receivedAtMs,
        isCrossFading: slot.previous !== null,
        rejectedStaleCount: slot.rejectedStaleCount,
      });
    });
    entries.sort((a, b) => a.tileKey.localeCompare(b.tileKey));
    return entries;
  }

  /** 보존 한도를 초과한 오래된 클라우드 타일 슬롯을 정리하고 제거 개수를 반환한다. */
  public purgeStaleTiles(nowMs: number, maxRetentionMs?: number): number {
    const limitMs = Math.max(this.config.maxCloudTileAgeMs, maxRetentionMs ?? this.config.maxCloudTileAgeMs * 4);
    const toDelete: string[] = [];
    this.slots.forEach((slot, key) => {
      if (nowMs - slot.receivedAtMs > limitMs) toDelete.push(key);
    });
    for (let i = 0; i < toDelete.length; i += 1) {
      const key = toDelete[i];
      if (key !== undefined) this.slots.delete(key);
    }
    return toDelete.length;
  }
}
