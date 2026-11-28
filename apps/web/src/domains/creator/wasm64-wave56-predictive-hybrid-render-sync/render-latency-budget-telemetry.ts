/**
 * Wave-56: 온디바이스-클라우드 하이브리드 렌더링 지연 예산 텔레메트리 및 리드타임 자동 보정기
 * (`HybridRenderLatencyMonitor`).
 *
 * 120/240Hz 드로잉 루프에서 로컬 프레임 지연과 원격 클라우드 타일 지연의 백분위수(p50/p95/p99),
 * 재투영 픽셀 오차(RMSE)를 고정 크기 슬라이딩 윈도우로 집계한다. 집계된 오차와 지연 꼬리를
 * 바탕으로 예측 리드타임(8~45ms)을 폐루프(Closed-Loop) 자동 보정하며, 창작자가 즉시 이해할 수
 * 있는 평이한 한국어 상태 요약을 생성한다.
 */

import type { RenderFallbackTier } from "./cloud-tile-reprojection-synchronizer";

/** 프레임별 하이브리드 렌더 텔레메트리 샘플. */
export interface RenderTelemetrySample {
  readonly timestampMs: number;
  /** 온디바이스 입력→합성 로컬 프레임 지연(ms). */
  readonly localFrameLatencyMs: number;
  /** 원격/워커 클라우드 타일 왕복·디코드 지연(ms). 로컬 전용 프레임이면 `null`. */
  readonly remoteTileLatencyMs: number | null;
  /** 현재 프레임의 대표 재투영 오차(px). `reprojectionResidualsPx`가 있으면 RMS를 자동 계산한다. */
  readonly reprojectionErrorPx: number;
  /** 선택적 타일/포인트별 개별 재투영 오차(px) 배열. */
  readonly reprojectionResidualsPx?: readonly number[];
  /** 이 프레임에 실제 적용된 예측 리드타임(ms). */
  readonly appliedLeadTimeMs: number;
  /** 예측기 신뢰도 (`0..1`). */
  readonly predictionConfidence: number;
  /** 현재 타일 동기화 강등 티어. */
  readonly fallbackTier: RenderFallbackTier;
  readonly reprojectedTileCount?: number;
  readonly droppedOrStaleTileCount?: number;
}

/** 지연 백분위수 분포 통계(ms). */
export interface LatencyPercentileStats {
  readonly sampleCount: number;
  readonly p50Ms: number;
  readonly p95Ms: number;
  readonly p99Ms: number;
  readonly meanMs: number;
  readonly maxMs: number;
}

/** 재투영 정밀도 통계(px). */
export interface ReprojectionAccuracyStats {
  readonly sampleCount: number;
  readonly rmsePx: number;
  readonly p95ErrorPx: number;
  readonly maxErrorPx: number;
}

/** 창작자 UI에 노출할 하이브리드 동기화 건강도 등급. */
export type HybridRenderHealthLevel =
  | "optimal"
  | "adaptive"
  | "degraded"
  | "local-fallback";

/** 사용자 친화적 한국어 상태 요약(기술 약어 비노출). */
export interface KoreanRenderStatusSummary {
  readonly level: HybridRenderHealthLevel;
  /** 상단 상태 배지 문구. */
  readonly badgeLabel: string;
  /** 창작자 시점의 현재 동작 설명. */
  readonly headline: string;
  /** 회복·조치 안내 문구(쾌적 상태에서는 `null`). */
  readonly actionHint: string | null;
  /** 상세 드로어용 숫자 요약 줄. */
  readonly metricsLine: string;
}

/** 리드타임 자동 보정 결과. */
export interface LeadTimeCalibrationResult {
  readonly previousLeadTimeMs: number;
  readonly recommendedLeadTimeMs: number;
  readonly adjustmentDeltaMs: number;
  readonly reason:
    | "steady"
    | "overshoot-damped"
    | "latency-compensated"
    | "low-confidence-pulled-back";
}

/** 텔레메트리 모니터 전체 스냅샷. */
export interface HybridRenderTelemetrySnapshot {
  readonly windowSampleCount: number;
  readonly totalObservedFrames: number;
  readonly targetFps: number;
  readonly frameBudgetMs: number;
  readonly localLatency: LatencyPercentileStats;
  readonly remoteLatency: LatencyPercentileStats;
  readonly reprojectionAccuracy: ReprojectionAccuracyStats;
  readonly localBudgetComplianceRatio: number;
  readonly droppedOrStaleTileTotal: number;
  readonly latestFallbackTier: RenderFallbackTier;
  readonly leadTimeCalibration: LeadTimeCalibrationResult;
  readonly koreanSummary: KoreanRenderStatusSummary;
}

/** `HybridRenderLatencyMonitor` 구성 옵션. */
export interface HybridRenderLatencyMonitorConfig {
  /** 슬라이딩 윈도우 최대 샘플 수(기본 `120`). */
  readonly windowSize: number;
  /** 목표 로컬 주사율(Hz, 기본 `120`). */
  readonly targetFps: number;
  /** 예측 리드타임 하한(ms, 기본 `8`). */
  readonly minLeadTimeMs: number;
  /** 예측 리드타임 상한(ms, 기본 `45`). */
  readonly maxLeadTimeMs: number;
  /** 초기 리드타임(ms, 기본 `16`). */
  readonly initialLeadTimeMs: number;
  /** 리드타임 보정 시 허용하는 최대 재투영 RMSE 목표(px, 기본 `2.5`). */
  readonly targetMaxRmsePx: number;
  /** 1회 보정 스텝당 최대 리드타임 변동폭(ms, 기본 `3.0`). */
  readonly maxCalibrationStepMs: number;
}

/** 기본 지연 예산 텔레메트리 설정. */
export const DEFAULT_LATENCY_MONITOR_CONFIG: HybridRenderLatencyMonitorConfig = {
  windowSize: 120,
  targetFps: 120,
  minLeadTimeMs: 8,
  maxLeadTimeMs: 45,
  initialLeadTimeMs: 16,
  targetMaxRmsePx: 2.5,
  maxCalibrationStepMs: 3.0,
};

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

function roundTo(value: number, digits: number): number {
  const factor = Math.pow(10, digits);
  return Math.round(value * factor) / factor;
}

/**
 * 수치 배열의 지정 백분위수(`percentile` ∈ `[0, 100]`)를 선형 보간(R-7)으로 정확히 계산한다.
 */
export function computePercentile(values: readonly number[], percentile: number): number {
  const finite: number[] = [];
  for (let i = 0; i < values.length; i += 1) {
    const v = values[i];
    if (v !== undefined && Number.isFinite(v)) {
      finite.push(v);
    }
  }
  if (finite.length === 0) return 0;
  finite.sort((a, b) => a - b);
  if (finite.length === 1) return finite[0] ?? 0;

  const p = clamp(percentile, 0, 100) / 100;
  const rank = p * (finite.length - 1);
  const lowerIdx = Math.floor(rank);
  const upperIdx = Math.ceil(rank);
  const lowerVal = finite[lowerIdx] ?? 0;
  const upperVal = finite[upperIdx] ?? lowerVal;
  if (lowerIdx === upperIdx) return lowerVal;
  const frac = rank - lowerIdx;
  return lowerVal + (upperVal - lowerVal) * frac;
}

/**
 * 픽셀 오차 배열의 제곱평균제곱근(RMSE)을 계산한다.
 */
export function computePixelRmse(errorsPx: readonly number[]): number {
  let sumSq = 0;
  let count = 0;
  for (let i = 0; i < errorsPx.length; i += 1) {
    const err = errorsPx[i];
    if (err !== undefined && Number.isFinite(err)) {
      sumSq += err * err;
      count += 1;
    }
  }
  if (count === 0) return 0;
  return Math.sqrt(sumSq / count);
}

/** 지연 분포 배열에서 p50/p95/p99/mean/max 통계를 산출한다. */
export function summarizeLatencyStats(values: readonly number[]): LatencyPercentileStats {
  const finite: number[] = [];
  let sum = 0;
  let maxVal = 0;
  for (let i = 0; i < values.length; i += 1) {
    const v = values[i];
    if (v !== undefined && Number.isFinite(v) && v >= 0) {
      finite.push(v);
      sum += v;
      if (v > maxVal) maxVal = v;
    }
  }
  if (finite.length === 0) {
    return { sampleCount: 0, p50Ms: 0, p95Ms: 0, p99Ms: 0, meanMs: 0, maxMs: 0 };
  }
  return {
    sampleCount: finite.length,
    p50Ms: computePercentile(finite, 50),
    p95Ms: computePercentile(finite, 95),
    p99Ms: computePercentile(finite, 99),
    meanMs: sum / finite.length,
    maxMs: maxVal,
  };
}

/**
 * 폐루프(Closed-Loop) 예측 리드타임 자동 보정기.
 *
 * 재투영 오차(RMSE)가 목표치를 초과하면 오버슈트를 막기 위해 리드타임을 즉시 줄이고,
 * 오차가 안정적인 범위에서 로컬/원격 지연이 커지면 프레임 스캔아웃 여유를 확보하도록
 * 스텝 제한(rate-limited) 범위 내에서 부드럽게 늘린다.
 */
export function calibrateAdaptiveLeadTimeMs(params: {
  readonly currentLeadTimeMs: number;
  readonly localP95Ms: number;
  readonly remoteP50Ms: number;
  readonly reprojectionRmsePx: number;
  readonly meanConfidence: number;
  readonly config?: Partial<HybridRenderLatencyMonitorConfig>;
}): LeadTimeCalibrationResult {
  const minLead = clamp(
    params.config?.minLeadTimeMs ?? DEFAULT_LATENCY_MONITOR_CONFIG.minLeadTimeMs,
    8,
    45,
  );
  const maxLead = clamp(
    params.config?.maxLeadTimeMs ?? DEFAULT_LATENCY_MONITOR_CONFIG.maxLeadTimeMs,
    minLead,
    45,
  );
  const targetMaxRmse = Math.max(
    0.2,
    params.config?.targetMaxRmsePx ?? DEFAULT_LATENCY_MONITOR_CONFIG.targetMaxRmsePx,
  );
  const maxStep = Math.max(
    0.5,
    params.config?.maxCalibrationStepMs ?? DEFAULT_LATENCY_MONITOR_CONFIG.maxCalibrationStepMs,
  );

  const prevLead = clamp(params.currentLeadTimeMs, minLead, maxLead);
  const confidence = clamp(params.meanConfidence, 0, 1);

  // 기준 목표 리드타임: 로컬 p95 + 디스플레이 스캔아웃 여유(4ms) + 원격 지연의 제한된 가중치
  const remoteContribution = clamp(params.remoteP50Ms * 0.16, 0, 18);
  const baseTarget = clamp(params.localP95Ms + 4.0 + remoteContribution, minLead, maxLead);

  let desiredLead: number;
  let reason: LeadTimeCalibrationResult["reason"];

  if (params.reprojectionRmsePx > targetMaxRmse) {
    // 오버슈트 감지: RMSE 초과 비율에 따라 리드타임을 능동적으로 축소
    const excessRatio = clamp(
      (params.reprojectionRmsePx - targetMaxRmse) / targetMaxRmse,
      0,
      2.0,
    );
    const dampingFactor = clamp(1 - 0.35 * excessRatio, 0.35, 0.92);
    desiredLead = clamp(prevLead * dampingFactor, minLead, maxLead);
    reason = "overshoot-damped";
  } else if (confidence < 0.55) {
    // 신뢰도가 낮은 급변 제스처 구간: 하한 쪽으로 안전 후퇴
    desiredLead = clamp(minLead + (baseTarget - minLead) * confidence, minLead, maxLead);
    reason = "low-confidence-pulled-back";
  } else if (baseTarget > prevLead + 0.75 && params.reprojectionRmsePx <= targetMaxRmse * 0.75) {
    desiredLead = baseTarget;
    reason = "latency-compensated";
  } else if (Math.abs(baseTarget - prevLead) > 0.75) {
    desiredLead = baseTarget;
    reason = "latency-compensated";
  } else {
    desiredLead = prevLead;
    reason = "steady";
  }

  // 급격한 화면 흔들림을 막기 위한 1스텝 변동폭 제한
  const rawDelta = desiredLead - prevLead;
  const clampedDelta = clamp(rawDelta, -maxStep, maxStep);
  const recommended = clamp(roundTo(prevLead + clampedDelta, 2), minLead, maxLead);

  return {
    previousLeadTimeMs: roundTo(prevLead, 2),
    recommendedLeadTimeMs: recommended,
    adjustmentDeltaMs: roundTo(recommended - prevLead, 2),
    reason,
  };
}

/**
 * 텔레메트리 지표를 창작자 친화적 자연스러운 한국어 상태 요약으로 변환한다.
 *
 * 주 문구(`badgeLabel`, `headline`, `actionHint`)에는 내부 기술 용어를 노출하지 않는다.
 */
export function formatKoreanRenderStatusSummary(params: {
  readonly localLatency: LatencyPercentileStats;
  readonly remoteLatency: LatencyPercentileStats;
  readonly reprojectionRmsePx: number;
  readonly fallbackTier: RenderFallbackTier;
  readonly recommendedLeadTimeMs: number;
  readonly localBudgetComplianceRatio: number;
  readonly targetMaxRmsePx: number;
}): KoreanRenderStatusSummary {
  const localMsText = `${roundTo(params.localLatency.p95Ms, 1).toFixed(1)}ms`;
  const remoteMsText =
    params.remoteLatency.sampleCount > 0
      ? `${Math.round(params.remoteLatency.p95Ms)}ms`
      : "대기 없음";
  const leadMsText = `${roundTo(params.recommendedLeadTimeMs, 1).toFixed(1)}ms`;
  const metricsLine = `로컬 반응 ${localMsText} · 클라우드 응답 ${remoteMsText} · 예측 간격 ${leadMsText}`;

  if (params.fallbackTier === "local-proxy-only") {
    return {
      level: "local-fallback",
      badgeLabel: "로컬 우선 모드로 전환됨",
      headline:
        "네트워크 응답이 크게 늦어져 로컬 경량 배경으로 전환했습니다. 드로잉 반응 속도는 그대로 유지됩니다.",
      actionHint: "연결 상태가 안정되면 원래 고화질 배경으로 자동 복구됩니다.",
      metricsLine,
    };
  }

  if (
    params.fallbackTier === "hybrid-proxy-blend" ||
    params.fallbackTier === "cloud-balanced" ||
    params.localBudgetComplianceRatio < 0.8
  ) {
    return {
      level: "degraded",
      badgeLabel: "원격 지연 감지 · 화질 자동 조절",
      headline:
        "클라우드 응답이 평소보다 느려져 작업 끊김을 막기 위해 배경 해상도를 잠시 낮췄습니다.",
      actionHint: "화면 이동을 멈추면 선명한 고화질 배경이 순차적으로 채워집니다.",
      metricsLine,
    };
  }

  if (params.reprojectionRmsePx > params.targetMaxRmsePx * 0.75) {
    return {
      level: "adaptive",
      badgeLabel: "예측 보정 자동 조절 중",
      headline: "빠른 화면 이동에 맞춰 미리 그리기 간격을 자동으로 다듬고 있습니다.",
      actionHint: "잠시만 유지하면 화면 흔들림 없이 부드럽게 수렴합니다.",
      metricsLine,
    };
  }

  return {
    level: "optimal",
    badgeLabel: "실시간 동기화 쾌적",
    headline: "펜과 화면 움직임에 맞춰 고화질 배경이 끊김 없이 따라오고 있습니다.",
    actionHint: null,
    metricsLine,
  };
}

interface StoredTelemetryEntry {
  readonly localFrameLatencyMs: number;
  readonly remoteTileLatencyMs: number | null;
  readonly frameErrorPx: number;
  readonly predictionConfidence: number;
  readonly fallbackTier: RenderFallbackTier;
}

/**
 * 로컬·원격 렌더링 지연(p50/p95/p99), 재투영 RMSE, 적응형 리드타임 자동 보정 및
 * 한국어 상태 요약을 제공하는 고정 메모리 슬라이딩 윈도우 텔레메트리 모니터.
 */
export class HybridRenderLatencyMonitor {
  private readonly config: HybridRenderLatencyMonitorConfig;
  private readonly ring: StoredTelemetryEntry[] = [];
  private writeIndex = 0;
  private totalObservedFrames = 0;
  private droppedOrStaleTileTotal = 0;
  private currentLeadTimeMs: number;
  private latestFallbackTier: RenderFallbackTier = "cloud-hq";
  private lastCalibration: LeadTimeCalibrationResult;

  constructor(overrides?: Partial<HybridRenderLatencyMonitorConfig>) {
    const minLead = clamp(
      overrides?.minLeadTimeMs ?? DEFAULT_LATENCY_MONITOR_CONFIG.minLeadTimeMs,
      8,
      45,
    );
    const maxLead = clamp(
      overrides?.maxLeadTimeMs ?? DEFAULT_LATENCY_MONITOR_CONFIG.maxLeadTimeMs,
      minLead,
      45,
    );
    const initialLead = clamp(
      overrides?.initialLeadTimeMs ?? DEFAULT_LATENCY_MONITOR_CONFIG.initialLeadTimeMs,
      minLead,
      maxLead,
    );

    this.config = {
      windowSize: Math.max(4, Math.floor(overrides?.windowSize ?? DEFAULT_LATENCY_MONITOR_CONFIG.windowSize)),
      targetFps: Math.max(30, overrides?.targetFps ?? DEFAULT_LATENCY_MONITOR_CONFIG.targetFps),
      minLeadTimeMs: minLead,
      maxLeadTimeMs: maxLead,
      initialLeadTimeMs: initialLead,
      targetMaxRmsePx: Math.max(
        0.2,
        overrides?.targetMaxRmsePx ?? DEFAULT_LATENCY_MONITOR_CONFIG.targetMaxRmsePx,
      ),
      maxCalibrationStepMs: Math.max(
        0.5,
        overrides?.maxCalibrationStepMs ?? DEFAULT_LATENCY_MONITOR_CONFIG.maxCalibrationStepMs,
      ),
    };
    this.currentLeadTimeMs = initialLead;
    this.lastCalibration = {
      previousLeadTimeMs: initialLead,
      recommendedLeadTimeMs: initialLead,
      adjustmentDeltaMs: 0,
      reason: "steady",
    };
  }

  /** 수집된 텔레메트리 윈도우와 보정기를 초기 상태로 되돌린다. */
  public reset(): void {
    this.ring.length = 0;
    this.writeIndex = 0;
    this.totalObservedFrames = 0;
    this.droppedOrStaleTileTotal = 0;
    this.currentLeadTimeMs = this.config.initialLeadTimeMs;
    this.latestFallbackTier = "cloud-hq";
    this.lastCalibration = {
      previousLeadTimeMs: this.currentLeadTimeMs,
      recommendedLeadTimeMs: this.currentLeadTimeMs,
      adjustmentDeltaMs: 0,
      reason: "steady",
    };
  }

  /**
   * 프레임 텔레메트리 샘플을 기록하고, 폐루프 리드타임 보정 결과를 즉시 갱신한다.
   */
  public recordFrame(sample: RenderTelemetrySample): LeadTimeCalibrationResult {
    const frameErrorPx =
      sample.reprojectionResidualsPx !== undefined && sample.reprojectionResidualsPx.length > 0
        ? computePixelRmse(sample.reprojectionResidualsPx)
        : Math.max(0, Number.isFinite(sample.reprojectionErrorPx) ? sample.reprojectionErrorPx : 0);

    const entry: StoredTelemetryEntry = {
      localFrameLatencyMs: Math.max(
        0,
        Number.isFinite(sample.localFrameLatencyMs) ? sample.localFrameLatencyMs : 0,
      ),
      remoteTileLatencyMs:
        sample.remoteTileLatencyMs !== null && Number.isFinite(sample.remoteTileLatencyMs)
          ? Math.max(0, sample.remoteTileLatencyMs)
          : null,
      frameErrorPx,
      predictionConfidence: clamp(sample.predictionConfidence, 0, 1),
      fallbackTier: sample.fallbackTier,
    };

    if (this.ring.length < this.config.windowSize) {
      this.ring.push(entry);
    } else {
      this.ring[this.writeIndex] = entry;
    }
    this.writeIndex = (this.writeIndex + 1) % this.config.windowSize;
    this.totalObservedFrames += 1;
    this.droppedOrStaleTileTotal += Math.max(0, Math.floor(sample.droppedOrStaleTileCount ?? 0));
    this.latestFallbackTier = sample.fallbackTier;

    const localValues: number[] = [];
    const remoteValues: number[] = [];
    const errorValues: number[] = [];
    let confidenceSum = 0;

    for (let i = 0; i < this.ring.length; i += 1) {
      const item = this.ring[i];
      if (!item) continue;
      localValues.push(item.localFrameLatencyMs);
      if (item.remoteTileLatencyMs !== null) {
        remoteValues.push(item.remoteTileLatencyMs);
      }
      errorValues.push(item.frameErrorPx);
      confidenceSum += item.predictionConfidence;
    }

    const localStats = summarizeLatencyStats(localValues);
    const remoteStats = summarizeLatencyStats(remoteValues);
    const rmsePx = computePixelRmse(errorValues);
    const meanConfidence = this.ring.length > 0 ? confidenceSum / this.ring.length : 1;

    const calibration = calibrateAdaptiveLeadTimeMs({
      currentLeadTimeMs: this.currentLeadTimeMs,
      localP95Ms: localStats.p95Ms,
      remoteP50Ms: remoteStats.p50Ms,
      reprojectionRmsePx: rmsePx,
      meanConfidence,
      config: this.config,
    });
    this.currentLeadTimeMs = calibration.recommendedLeadTimeMs;
    this.lastCalibration = calibration;
    return calibration;
  }

  /** 다음 예측 프레임에 권장되는 보정 리드타임(ms, `8..45`)을 반환한다. */
  public getRecommendedLeadTimeMs(): number {
    return this.currentLeadTimeMs;
  }

  /** 현재 윈도우의 지연 백분위수, 재투영 RMSE 및 한국어 상태 요약 스냅샷을 반환한다. */
  public getSnapshot(): HybridRenderTelemetrySnapshot {
    const frameBudgetMs = 1000 / this.config.targetFps;
    const localValues: number[] = [];
    const remoteValues: number[] = [];
    const errorValues: number[] = [];
    let withinBudgetCount = 0;
    let maxErrorPx = 0;

    for (let i = 0; i < this.ring.length; i += 1) {
      const item = this.ring[i];
      if (!item) continue;
      localValues.push(item.localFrameLatencyMs);
      if (item.localFrameLatencyMs <= frameBudgetMs) {
        withinBudgetCount += 1;
      }
      if (item.remoteTileLatencyMs !== null) {
        remoteValues.push(item.remoteTileLatencyMs);
      }
      errorValues.push(item.frameErrorPx);
      if (item.frameErrorPx > maxErrorPx) {
        maxErrorPx = item.frameErrorPx;
      }
    }

    const localLatency = summarizeLatencyStats(localValues);
    const remoteLatency = summarizeLatencyStats(remoteValues);
    const rmsePx = computePixelRmse(errorValues);
    const p95ErrorPx = computePercentile(errorValues, 95);
    const localBudgetComplianceRatio =
      this.ring.length > 0 ? withinBudgetCount / this.ring.length : 1;

    const koreanSummary = formatKoreanRenderStatusSummary({
      localLatency,
      remoteLatency,
      reprojectionRmsePx: rmsePx,
      fallbackTier: this.latestFallbackTier,
      recommendedLeadTimeMs: this.currentLeadTimeMs,
      localBudgetComplianceRatio,
      targetMaxRmsePx: this.config.targetMaxRmsePx,
    });

    return {
      windowSampleCount: this.ring.length,
      totalObservedFrames: this.totalObservedFrames,
      targetFps: this.config.targetFps,
      frameBudgetMs: roundTo(frameBudgetMs, 3),
      localLatency,
      remoteLatency,
      reprojectionAccuracy: {
        sampleCount: errorValues.length,
        rmsePx: roundTo(rmsePx, 4),
        p95ErrorPx: roundTo(p95ErrorPx, 4),
        maxErrorPx: roundTo(maxErrorPx, 4),
      },
      localBudgetComplianceRatio: roundTo(localBudgetComplianceRatio, 4),
      droppedOrStaleTileTotal: this.droppedOrStaleTileTotal,
      latestFallbackTier: this.latestFallbackTier,
      leadTimeCalibration: this.lastCalibration,
      koreanSummary,
    };
  }
}
