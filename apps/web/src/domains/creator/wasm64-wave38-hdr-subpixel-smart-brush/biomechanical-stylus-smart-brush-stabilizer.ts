/**
 * Wave 38: 속도·곡률 적응형 생체역학 스타일러스 스마트 브러시 보정기 및 펜촉 먹 맺힘 동역학 엔진.
 *
 * - 1-Euro 속도 적응형 저역통과 필터에 3점 이산 멩거(Menger) 곡률 변조를 결합해,
 *   느린 외곽선 곡선에서는 미세 손떨림을 강하게 억제하고 빠른 해칭 플릭에서는 지연을 최소화한다.
 * - 펜 기울기(tiltX/tiltY 또는 고도각·방위각)로부터 펜촉 타원 종횡비와 방위각을 투영한다.
 * - 스트로크 시작·끝 체류 시간에 따른 모세관 먹 맺힘(포화 상한 보장)과 필압 해제 시 바늘 끝 빼기를 계산한다.
 */

/** 저속 구간 기본 최소 차단 주파수 (`Hz`). */
export const DEFAULT_MIN_CUTOFF_HZ = 3.6 as const;
/** 속도에 비례해 차단 주파수를 높이는 기본 기울기 계수 (`beta`). */
export const DEFAULT_SPEED_BETA = 0.042 as const;
/** 저속 곡선 구간에서 곡률에 따라 안정화를 강화하는 기본 이득. */
export const DEFAULT_CURVATURE_STABILIZATION_GAIN = 1.6 as const;
/** 펜촉 체류로 판정하는 기본 속도 임계값 (`px/s`). */
export const DEFAULT_DWELL_SPEED_THRESHOLD_PX_PER_SEC = 45 as const;
/** 장시간 체류 시 기본 최대 먹 맺힘 반경 증가분 (`+42%`). */
export const DEFAULT_MAX_INK_POOL_BOOST = 0.42 as const;
/** 어떤 설정에서도 초과할 수 없는 물리적 먹 맺힘 배율 절대 상한 (`1.85x`). */
export const MAX_INK_POOL_MULTIPLIER_HARD_CAP = 1.85 as const;

export interface RawStylusSample {
  readonly x: number;
  readonly y: number;
  /** 명시적 입력 시각 (`ms`, 테스트 결정성을 위해 외부에서 주입). */
  readonly timestampMs: number;
  readonly pressure?: number;
  readonly tiltXDeg?: number;
  readonly tiltYDeg?: number;
  readonly altitudeDeg?: number;
  readonly azimuthDeg?: number;
}

export interface StylusTiltProjectionInput {
  readonly tiltXDeg?: number;
  readonly tiltYDeg?: number;
  readonly altitudeDeg?: number;
  readonly azimuthDeg?: number;
  readonly baseNibAspectRatio?: number;
  readonly maxTiltElongation?: number;
  readonly maxAspectRatio?: number;
}

export interface ProjectedNibFootprint {
  readonly aspectRatio: number;
  readonly azimuthRad: number;
  readonly zenithTiltDeg: number;
}

export interface AdaptiveSmartBrushStabilizerConfig {
  readonly minCutoffHz?: number;
  readonly speedBeta?: number;
  readonly derivativeCutoffHz?: number;
  readonly curvatureStabilizationGain?: number;
  readonly referenceCurvaturePerPx?: number;
  readonly flickSpeedThresholdPxPerSec?: number;
  readonly baseNibAspectRatio?: number;
  readonly dwellSpeedThresholdPxPerSec?: number;
  readonly maxPoolRadiusBoost?: number;
  readonly poolTimeConstantMs?: number;
}

export interface StabilizedStylusSample {
  readonly x: number;
  readonly y: number;
  readonly rawX: number;
  readonly rawY: number;
  readonly pressure: number;
  readonly timestampMs: number;
  readonly speedPxPerSec: number;
  readonly discreteCurvaturePerPx: number;
  readonly adaptiveCutoffHz: number;
  readonly smoothingAlpha: number;
  readonly stabilizationWeight: number;
  readonly lagDistancePx: number;
  readonly nibAspectRatio: number;
  readonly nibAzimuthRad: number;
  readonly zenithTiltDeg: number;
  readonly dwellMs: number;
  readonly inkPoolMultiplier: number;
}

export interface StrokeEndpointPoolingConfig {
  readonly baseRadiusPx?: number;
  readonly baseOpacity?: number;
  readonly dwellSpeedThresholdPxPerSec?: number;
  readonly maxPoolRadiusBoost?: number;
  readonly poolTimeConstantMs?: number;
  readonly startTaperLengthPx?: number;
  readonly releaseTaperLengthPx?: number;
  readonly minTipRadiusRatio?: number;
  readonly releaseSpeedThresholdPxPerSec?: number;
}

export interface StrokePooledSample {
  readonly x: number;
  readonly y: number;
  readonly timestampMs: number;
  readonly arcLengthPx: number;
  readonly speedPxPerSec: number;
  readonly dwellDurationMs: number;
  readonly poolingMultiplier: number;
  readonly taperMultiplier: number;
  readonly effectiveRadiusPx: number;
  readonly effectiveOpacity: number;
}

export interface StrokeEndpointPoolingResult {
  readonly samples: readonly StrokePooledSample[];
  readonly totalArcLengthPx: number;
  readonly startPoolingMultiplier: number;
  readonly endPoolingMultiplier: number;
  readonly endTaperMultiplier: number;
  readonly minRadiusPx: number;
  readonly maxRadiusPx: number;
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function normalizeZero(value: number): number {
  return value === 0 ? 0 : value;
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  if (edge1 <= edge0) return x >= edge1 ? 1 : 0;
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

function computeOneEuroAlpha(cutoffHz: number, dtSec: number): number {
  const tau = 1 / (2 * Math.PI * Math.max(0.05, cutoffHz));
  return 1 / (1 + tau / Math.max(1e-4, dtSec));
}

/** 연속된 세 점 `(x0, y0)`, `(x1, y1)`, `(x2, y2)`의 3점 이산 멩거 곡률(`1/px`)을 계산한다. */
export function computeDiscreteMengerCurvature(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): number {
  const a = Math.hypot(x1 - x0, y1 - y0);
  const b = Math.hypot(x2 - x1, y2 - y1);
  const c = Math.hypot(x2 - x0, y2 - y0);
  if (a < 1e-4 || b < 1e-4 || c < 1e-4) return 0;
  const twiceArea = Math.abs((x1 - x0) * (y2 - y0) - (y1 - y0) * (x2 - x0));
  const denom = a * b * c;
  return denom > 1e-9 ? normalizeZero((2 * twiceArea) / denom) : 0;
}

/** 스타일러스 기울기 입력으로부터 투영된 펜촉 타원 종횡비와 장축 방위각을 계산한다. */
export function projectStylusNibFootprint(
  input: StylusTiltProjectionInput,
): ProjectedNibFootprint {
  const baseAspect = clamp(input.baseNibAspectRatio ?? 1, 1, 6);
  const maxElongation = clamp(input.maxTiltElongation ?? 2.4, 0, 6);
  const maxAspect = clamp(input.maxAspectRatio ?? 5, baseAspect, 8);

  let zenithTiltDeg: number;
  let azimuthRad: number;
  if (input.altitudeDeg !== undefined && Number.isFinite(input.altitudeDeg)) {
    zenithTiltDeg = 90 - clamp(input.altitudeDeg, 5, 90);
    const azDeg = Number.isFinite(input.azimuthDeg) ? (input.azimuthDeg ?? 0) : 0;
    const wrapped = ((((azDeg + 180) % 360) + 360) % 360) - 180;
    azimuthRad = (wrapped * Math.PI) / 180;
  } else {
    const tanX = Math.tan((clamp(input.tiltXDeg ?? 0, -85, 85) * Math.PI) / 180);
    const tanY = Math.tan((clamp(input.tiltYDeg ?? 0, -85, 85) * Math.PI) / 180);
    const tiltTan = Math.hypot(tanX, tanY);
    zenithTiltDeg = (Math.atan(tiltTan) * 180) / Math.PI;
    azimuthRad = tiltTan > 1e-6 ? Math.atan2(tanY, tanX) : 0;
  }

  const sinZenith = Math.sin((zenithTiltDeg * Math.PI) / 180);
  const aspectRatio = clamp(baseAspect * (1 + maxElongation * sinZenith ** 1.35), 1, maxAspect);
  return {
    aspectRatio,
    azimuthRad: normalizeZero(azimuthRad),
    zenithTiltDeg: normalizeZero(zenithTiltDeg),
  };
}

/** 1-Euro 속도 적응형 필터와 3점 이산 곡률 변조를 결합한 생체역학 스타일러스 보정기. */
export class AdaptiveSmartBrushStabilizer {
  private readonly minCutoffHz: number;
  private readonly speedBeta: number;
  private readonly derivativeCutoffHz: number;
  private readonly curvatureGain: number;
  private readonly referenceCurvaturePerPx: number;
  private readonly flickSpeedThresholdPxPerSec: number;
  private readonly baseNibAspectRatio: number;
  private readonly dwellSpeedThresholdPxPerSec: number;
  private readonly maxPoolBoost: number;
  private readonly poolTimeConstantMs: number;

  private initialized = false;
  private prevRawX = 0;
  private prevRawY = 0;
  private prevPrevRawX = 0;
  private prevPrevRawY = 0;
  private hasTwoHistoryPoints = false;
  private filteredX = 0;
  private filteredY = 0;
  private filteredPressure = 0.5;
  private hatVx = 0;
  private hatVy = 0;
  private prevTimestampMs = 0;
  private accumulatedDwellMs = 0;

  public constructor(config: AdaptiveSmartBrushStabilizerConfig = {}) {
    this.minCutoffHz = clamp(config.minCutoffHz ?? DEFAULT_MIN_CUTOFF_HZ, 0.3, 30);
    this.speedBeta = clamp(config.speedBeta ?? DEFAULT_SPEED_BETA, 0, 0.5);
    this.derivativeCutoffHz = clamp(config.derivativeCutoffHz ?? 1.2, 0.2, 20);
    this.curvatureGain = clamp(
      config.curvatureStabilizationGain ?? DEFAULT_CURVATURE_STABILIZATION_GAIN,
      0,
      8,
    );
    this.referenceCurvaturePerPx = clamp(config.referenceCurvaturePerPx ?? 0.03, 0.002, 1);
    this.flickSpeedThresholdPxPerSec = clamp(config.flickSpeedThresholdPxPerSec ?? 850, 150, 5000);
    this.baseNibAspectRatio = clamp(config.baseNibAspectRatio ?? 1, 1, 6);
    this.dwellSpeedThresholdPxPerSec = clamp(
      config.dwellSpeedThresholdPxPerSec ?? DEFAULT_DWELL_SPEED_THRESHOLD_PX_PER_SEC,
      5,
      300,
    );
    this.maxPoolBoost = clamp(
      config.maxPoolRadiusBoost ?? DEFAULT_MAX_INK_POOL_BOOST,
      0,
      MAX_INK_POOL_MULTIPLIER_HARD_CAP - 1,
    );
    this.poolTimeConstantMs = clamp(config.poolTimeConstantMs ?? 140, 20, 2000);
  }

  /** 새 스트로크 시작을 위해 내부 필터 상태를 초기화한다. */
  public reset(): void {
    this.initialized = false;
    this.hasTwoHistoryPoints = false;
    this.hatVx = 0;
    this.hatVy = 0;
    this.accumulatedDwellMs = 0;
  }

  /** 단일 스타일러스 샘플을 보정해 안정화된 좌표·속도·곡률·펜촉 투영 결과를 반환한다. */
  public pushSample(sample: RawStylusSample): StabilizedStylusSample {
    const rawP = clamp(sample.pressure ?? 0.5, 0, 1);
    const nib = projectStylusNibFootprint({
      tiltXDeg: sample.tiltXDeg,
      tiltYDeg: sample.tiltYDeg,
      altitudeDeg: sample.altitudeDeg,
      azimuthDeg: sample.azimuthDeg,
      baseNibAspectRatio: this.baseNibAspectRatio,
    });

    if (!this.initialized) {
      this.initialized = true;
      this.prevRawX = sample.x;
      this.prevRawY = sample.y;
      this.filteredX = sample.x;
      this.filteredY = sample.y;
      this.filteredPressure = rawP;
      this.prevTimestampMs = sample.timestampMs;
      this.accumulatedDwellMs = 0;

      return {
        x: sample.x,
        y: sample.y,
        rawX: sample.x,
        rawY: sample.y,
        pressure: rawP,
        timestampMs: sample.timestampMs,
        speedPxPerSec: 0,
        discreteCurvaturePerPx: 0,
        adaptiveCutoffHz: this.minCutoffHz,
        smoothingAlpha: 1,
        stabilizationWeight: 0,
        lagDistancePx: 0,
        nibAspectRatio: nib.aspectRatio,
        nibAzimuthRad: nib.azimuthRad,
        zenithTiltDeg: nib.zenithTiltDeg,
        dwellMs: 0,
        inkPoolMultiplier: 1,
      };
    }

    const dtMs = clamp(sample.timestampMs - this.prevTimestampMs, 1, 250);
    const dtSec = dtMs * 0.001;
    const dAlpha = computeOneEuroAlpha(this.derivativeCutoffHz, dtSec);
    this.hatVx += dAlpha * ((sample.x - this.prevRawX) / dtSec - this.hatVx);
    this.hatVy += dAlpha * ((sample.y - this.prevRawY) / dtSec - this.hatVy);
    const speedPxPerSec = Math.hypot(this.hatVx, this.hatVy);

    const curvature = this.hasTwoHistoryPoints
      ? computeDiscreteMengerCurvature(
          this.prevPrevRawX,
          this.prevPrevRawY,
          this.prevRawX,
          this.prevRawY,
          sample.x,
          sample.y,
        )
      : 0;

    const curvatureNorm = clamp(curvature / this.referenceCurvaturePerPx, 0, 1);
    const flickBlend = smoothstep(
      this.flickSpeedThresholdPxPerSec * 0.4,
      this.flickSpeedThresholdPxPerSec,
      speedPxPerSec,
    );
    const baseCutoffHz = this.minCutoffHz + this.speedBeta * speedPxPerSec;
    const curvatureDamping = 1 / (1 + this.curvatureGain * curvatureNorm * (1 - flickBlend));
    const adaptiveCutoffHz = Math.max(0.45, baseCutoffHz * curvatureDamping);

    const alpha = computeOneEuroAlpha(adaptiveCutoffHz, dtSec);
    this.filteredX += alpha * (sample.x - this.filteredX);
    this.filteredY += alpha * (sample.y - this.filteredY);
    const pressureAlpha = computeOneEuroAlpha(Math.max(6, adaptiveCutoffHz), dtSec);
    this.filteredPressure += pressureAlpha * (rawP - this.filteredPressure);

    if (speedPxPerSec < this.dwellSpeedThresholdPxPerSec && this.filteredPressure > 0.05) {
      const slowRatio = 1 - speedPxPerSec / this.dwellSpeedThresholdPxPerSec;
      this.accumulatedDwellMs = Math.min(5000, this.accumulatedDwellMs + dtMs * slowRatio);
    } else {
      this.accumulatedDwellMs = Math.max(0, this.accumulatedDwellMs - dtMs * 2.5);
    }

    const saturation = 1 - Math.exp(-this.accumulatedDwellMs / this.poolTimeConstantMs);
    const inkPoolMultiplier = clamp(
      1 + this.maxPoolBoost * saturation * this.filteredPressure,
      1,
      Math.min(1 + this.maxPoolBoost, MAX_INK_POOL_MULTIPLIER_HARD_CAP),
    );
    const lagDistancePx = Math.hypot(sample.x - this.filteredX, sample.y - this.filteredY);

    this.prevPrevRawX = this.prevRawX;
    this.prevPrevRawY = this.prevRawY;
    this.hasTwoHistoryPoints = true;
    this.prevRawX = sample.x;
    this.prevRawY = sample.y;
    this.prevTimestampMs = sample.timestampMs;

    return {
      x: this.filteredX,
      y: this.filteredY,
      rawX: sample.x,
      rawY: sample.y,
      pressure: clamp(this.filteredPressure, 0, 1),
      timestampMs: sample.timestampMs,
      speedPxPerSec: normalizeZero(speedPxPerSec),
      discreteCurvaturePerPx: curvature,
      adaptiveCutoffHz,
      smoothingAlpha: alpha,
      stabilizationWeight: normalizeZero(1 - alpha),
      lagDistancePx: normalizeZero(lagDistancePx),
      nibAspectRatio: nib.aspectRatio,
      nibAzimuthRad: nib.azimuthRad,
      zenithTiltDeg: nib.zenithTiltDeg,
      dwellMs: normalizeZero(this.accumulatedDwellMs),
      inkPoolMultiplier,
    };
  }

  /** 전체 스트로크 샘플 배열을 초기 상태부터 순차 보정한다. */
  public processStroke(samples: readonly RawStylusSample[]): readonly StabilizedStylusSample[] {
    this.reset();
    return samples.map((sample) => this.pushSample(sample));
  }
}

/**
 * 스트로크 시작·끝 체류 구간의 모세관 먹 맺힘(포화 상한 보장)과
 * 빠른 필압 해제 시의 바늘 끝 빼기(Taper) 반지름·농도 프로파일을 시뮬레이션한다.
 */
export function simulateStrokeEndpointInkPooling(
  samples: readonly RawStylusSample[],
  config: StrokeEndpointPoolingConfig = {},
): StrokeEndpointPoolingResult {
  if (samples.length === 0) {
    return {
      samples: [],
      totalArcLengthPx: 0,
      startPoolingMultiplier: 1,
      endPoolingMultiplier: 1,
      endTaperMultiplier: 1,
      minRadiusPx: 0,
      maxRadiusPx: 0,
    };
  }

  const baseRadiusPx = Math.max(0.1, config.baseRadiusPx ?? 2.0);
  const baseOpacity = clamp(config.baseOpacity ?? 0.92, 0, 1);
  const dwellSpeedThreshold = clamp(
    config.dwellSpeedThresholdPxPerSec ?? DEFAULT_DWELL_SPEED_THRESHOLD_PX_PER_SEC,
    5,
    300,
  );
  const maxPoolBoost = clamp(
    config.maxPoolRadiusBoost ?? DEFAULT_MAX_INK_POOL_BOOST,
    0,
    MAX_INK_POOL_MULTIPLIER_HARD_CAP - 1,
  );
  const poolUpperCap = Math.min(1 + maxPoolBoost, MAX_INK_POOL_MULTIPLIER_HARD_CAP);
  const poolTauMs = clamp(config.poolTimeConstantMs ?? 130, 20, 2000);
  const startTaperLengthPx = Math.max(0, config.startTaperLengthPx ?? 14);
  const releaseTaperLengthPx = Math.max(0, config.releaseTaperLengthPx ?? 32);
  const minTipRatio = clamp(config.minTipRadiusRatio ?? 0.08, 0.01, 1);
  const releaseSpeedThreshold = Math.max(
    dwellSpeedThreshold * 2,
    config.releaseSpeedThresholdPxPerSec ?? 320,
  );

  const arcLengths: number[] = [0];
  const speeds: number[] = [0];
  for (let i = 1; i < samples.length; i += 1) {
    const prev = samples[i - 1];
    const curr = samples[i];
    if (!prev || !curr) continue;
    const segDist = Math.hypot(curr.x - prev.x, curr.y - prev.y);
    const dtSec = Math.max(1e-3, (curr.timestampMs - prev.timestampMs) * 0.001);
    arcLengths.push((arcLengths[i - 1] ?? 0) + segDist);
    speeds.push(segDist / dtSec);
  }
  if (samples.length >= 2) speeds[0] = speeds[1] ?? 0;

  const totalArcLengthPx = arcLengths[arcLengths.length - 1] ?? 0;
  const tailSpeed = speeds[speeds.length - 1] ?? 0;
  const firstPressure = clamp(samples[0]?.pressure ?? 0.5, 0, 1);
  const lastPressure = clamp(samples[samples.length - 1]?.pressure ?? 0.5, 0, 1);
  const prevTailPressure = clamp(
    samples[Math.max(0, samples.length - 2)]?.pressure ?? lastPressure,
    0,
    1,
  );
  const releasingFast =
    tailSpeed >= releaseSpeedThreshold || lastPressure < prevTailPressure - 0.06;

  let dwellMs = 0;
  let minRadiusPx = Number.POSITIVE_INFINITY;
  let maxRadiusPx = 0;
  const pooledSamples: StrokePooledSample[] = [];

  for (let i = 0; i < samples.length; i += 1) {
    const curr = samples[i];
    if (!curr) continue;
    const prev = i > 0 ? (samples[i - 1] ?? curr) : curr;
    const dtMs = i > 0 ? clamp(curr.timestampMs - prev.timestampMs, 0, 500) : 0;
    const speed = speeds[i] ?? 0;
    const pressure = clamp(curr.pressure ?? 0.5, 0, 1);
    const arc = arcLengths[i] ?? 0;
    const distToEnd = Math.max(0, totalArcLengthPx - arc);

    if (speed < dwellSpeedThreshold && pressure > 0.04) {
      dwellMs += dtMs * (1 - speed / dwellSpeedThreshold);
    } else {
      dwellMs = Math.max(0, dwellMs - dtMs * 2.2);
    }

    const saturation = 1 - Math.exp(-dwellMs / poolTauMs);
    const poolingMultiplier = clamp(
      1 + maxPoolBoost * saturation * Math.max(0.25, pressure),
      1,
      poolUpperCap,
    );

    let taperMultiplier = 1;
    if (
      startTaperLengthPx > 0 &&
      totalArcLengthPx > startTaperLengthPx * 1.5 &&
      firstPressure < 0.35 &&
      (speeds[0] ?? 0) > dwellSpeedThreshold * 2 &&
      arc < startTaperLengthPx
    ) {
      const u = clamp(arc / startTaperLengthPx, 0, 1);
      taperMultiplier = Math.min(taperMultiplier, minTipRatio + (1 - minTipRatio) * Math.sqrt(u));
    }

    if (releasingFast && releaseTaperLengthPx > 0 && totalArcLengthPx > 4 && distToEnd < releaseTaperLengthPx) {
      const u = clamp(distToEnd / releaseTaperLengthPx, 0, 1);
      const flickFactor = smoothstep(dwellSpeedThreshold, releaseSpeedThreshold, tailSpeed);
      const releaseTarget = minTipRatio + (1 - minTipRatio) * u ** (0.65 + 0.55 * flickFactor);
      taperMultiplier = Math.min(taperMultiplier, clamp(releaseTarget, minTipRatio, 1));
    }

    const effectiveRadiusPx = Math.max(
      baseRadiusPx * minTipRatio * 0.35,
      baseRadiusPx * (0.35 + 0.65 * pressure) * poolingMultiplier * taperMultiplier,
    );
    const effectiveOpacity = clamp(
      baseOpacity * (1 + 0.18 * saturation) * (0.3 + 0.7 * taperMultiplier),
      0,
      1,
    );

    if (effectiveRadiusPx < minRadiusPx) minRadiusPx = effectiveRadiusPx;
    if (effectiveRadiusPx > maxRadiusPx) maxRadiusPx = effectiveRadiusPx;

    pooledSamples.push({
      x: curr.x,
      y: curr.y,
      timestampMs: curr.timestampMs,
      arcLengthPx: normalizeZero(arc),
      speedPxPerSec: normalizeZero(speed),
      dwellDurationMs: normalizeZero(dwellMs),
      poolingMultiplier,
      taperMultiplier,
      effectiveRadiusPx,
      effectiveOpacity,
    });
  }

  return {
    samples: pooledSamples,
    totalArcLengthPx: normalizeZero(totalArcLengthPx),
    startPoolingMultiplier: pooledSamples[0]?.poolingMultiplier ?? 1,
    endPoolingMultiplier: pooledSamples[pooledSamples.length - 1]?.poolingMultiplier ?? 1,
    endTaperMultiplier: pooledSamples[pooledSamples.length - 1]?.taperMultiplier ?? 1,
    minRadiusPx: Number.isFinite(minRadiusPx) ? minRadiusPx : 0,
    maxRadiusPx,
  };
}
