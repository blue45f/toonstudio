/**
 * Wave 43: 120Hz/240Hz 초저지연 Wet-Ink 칼만 속도 추정 및 구심 Catmull-Rom 예측 엔진.
 *
 * - 2차원 정속도 칼만 필터로 스타일러스 노이즈를 억제하면서 순시 속도를 추정한다.
 * - 구심 Catmull-Rom(`alpha = 0.5`) 보간으로 자가 교차 없이 다음 1프레임(`4~8ms`) 예측 꼬리를 생성한다.
 * - 후속 샘플 도착 시 직전 예측 구간을 확정(Committed) 세그먼트로 `0px` 이음새 없이 교체하며,
 *   급회전(`> 65°`)이나 펜 리프트(`pressure < 0.03`) 구간에서는 예측 거리를 자동 감쇠해 오버슈트를 막는다.
 */

/** 구심 Catmull-Rom 매듭 간격 지수(`alpha = 0.5`). */
export const CENTRIPETAL_CATMULL_ROM_ALPHA = 0.5 as const;
/** 1프레임 예측 최소 시간 지평(`4ms`, 240Hz 대응). */
export const MIN_PREDICTION_HORIZON_MS = 4 as const;
/** 1프레임 예측 최대 시간 지평(`8ms`, 120Hz 대응). */
export const MAX_PREDICTION_HORIZON_MS = 8 as const;
/** 기본 예측 시간 지평(`6ms`). */
export const DEFAULT_PREDICTION_HORIZON_MS = 6 as const;
/** 오버슈트 방지를 위해 예측 감쇠를 작동시키는 급회전 임계 각도(`65°`). */
export const SHARP_TURN_ANGLE_THRESHOLD_DEG = 65 as const;
/** 펜 리프트로 판정해 예측 꼬리를 즉시 차단하는 필압 임계값(`0.03`). */
export const PEN_LIFT_PRESSURE_THRESHOLD = 0.03 as const;
/** 스플라인 구간당 기본 분할 수(`4`). */
export const DEFAULT_SPLINE_SUBDIVISIONS = 4 as const;
/** 고속 이동 중 비정상 점프를 막는 최대 예측 연장 거리(`28px`). */
export const DEFAULT_MAX_PREDICTION_DISTANCE_PX = 28 as const;

export interface StylusInputSample {
  readonly x: number;
  readonly y: number;
  readonly pressure: number;
  readonly tiltX: number;
  readonly tiltY: number;
  readonly timestampMs: number;
}

export interface WetInkPoint extends StylusInputSample {
  readonly speedPxPerMs: number;
  readonly isPredicted: boolean;
}

export interface WetInkSegment {
  readonly start: WetInkPoint;
  readonly end: WetInkPoint;
  readonly isPredicted: boolean;
  readonly anchorIndex: number;
}

export type HorizonClampReason = "none" | "pen-lift" | "sharp-turn" | "max-distance" | "insufficient-samples";

export interface WetInkPredictorConfig {
  readonly horizonMs?: number;
  readonly subdivisions?: number;
  readonly sharpTurnThresholdDeg?: number;
  readonly penLiftPressureThreshold?: number;
  readonly maxPredictionDistancePx?: number;
  readonly kalmanProcessAccelVariance?: number;
  readonly kalmanMeasurementVariancePx2?: number;
}

export interface WetInkStepDiagnostics {
  readonly turnAngleDeg: number;
  readonly dampingFactor: number;
  readonly effectiveHorizonMs: number;
  readonly predictedDistancePx: number;
  readonly kalmanVelocityX: number;
  readonly kalmanVelocityY: number;
  readonly kalmanSpeedPxPerMs: number;
  readonly horizonClamped: boolean;
  readonly clampReason: HorizonClampReason;
  readonly clampMessageKo: string;
  readonly seamErrorPx: number;
}

export interface WetInkPredictionFrame {
  readonly newlyCommittedSegments: readonly WetInkSegment[];
  readonly allCommittedSegments: readonly WetInkSegment[];
  readonly wetInkOverlaySegments: readonly WetInkSegment[];
  readonly predictedTailSegments: readonly WetInkSegment[];
  readonly predictedTip: WetInkPoint | null;
  readonly lastCommittedPoint: WetInkPoint;
  readonly diagnostics: WetInkStepDiagnostics;
}

interface AxisKalmanState {
  pos: number;
  vel: number;
  p00: number;
  p01: number;
  p10: number;
  p11: number;
}

const clamp = (value: number, min: number, max: number): number =>
  Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : min;
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
const pointDistance = (a: { readonly x: number; readonly y: number }, b: { readonly x: number; readonly y: number }): number =>
  Math.hypot(b.x - a.x, b.y - a.y);

const makePoint = (x: number, y: number, pressure: number, tiltX: number, tiltY: number, timestampMs: number, speedPxPerMs: number, isPredicted: boolean): WetInkPoint => ({
  x, y, pressure, tiltX, tiltY, timestampMs, speedPxPerMs, isPredicted,
});

function interpolateAttributes(x: number, y: number, p1: WetInkPoint, p2: WetInkPoint, t: number, isPredicted: boolean): WetInkPoint {
  return makePoint(
    x, y,
    clamp(lerp(p1.pressure, p2.pressure, t), 0, 1),
    clamp(lerp(p1.tiltX, p2.tiltX, t), -90, 90),
    clamp(lerp(p1.tiltY, p2.tiltY, t), -90, 90),
    lerp(p1.timestampMs, p2.timestampMs, t),
    Math.max(0, lerp(p1.speedPxPerMs, p2.speedPxPerMs, t)),
    isPredicted,
  );
}

function updateAxisKalman(state: AxisKalmanState, measurement: number, dtMs: number, accelVar: number, measVar: number): void {
  const dt2 = dtMs * dtMs;
  const predPos = state.pos + state.vel * dtMs;
  const q00 = 0.25 * dt2 * dt2 * accelVar;
  const q01 = 0.5 * dt2 * dtMs * accelVar;
  const q11 = dt2 * accelVar;
  const m00 = state.p00 + dtMs * (state.p10 + state.p01) + dt2 * state.p11 + q00;
  const m01 = state.p01 + dtMs * state.p11 + q01;
  const m10 = state.p10 + dtMs * state.p11 + q01;
  const m11 = state.p11 + q11;
  const innovation = measurement - predPos;
  const denom = Math.max(1e-9, m00 + measVar);
  const gainPos = m00 / denom;
  const gainVel = m10 / denom;
  state.pos = predPos + gainPos * innovation;
  state.vel += gainVel * innovation;
  state.p00 = (1 - gainPos) * m00;
  state.p01 = (1 - gainPos) * m01;
  state.p10 = state.p01;
  state.p11 = Math.max(1e-6, m11 - gainVel * m01);
}

/** 구심 Catmull-Rom(`alpha = 0.5`) Barry-Goldman 보간. 양 끝점(`0 -> p1`, `1 -> p2`)을 정확히 통과한다. */
export function evaluateCentripetalCatmullRom(p0: WetInkPoint, p1: WetInkPoint, p2: WetInkPoint, p3: WetInkPoint, uNormalized: number, isPredictedSegment = false): WetInkPoint {
  if (uNormalized <= 0) return isPredictedSegment === p1.isPredicted ? p1 : { ...p1, isPredicted: isPredictedSegment };
  if (uNormalized >= 1) return isPredictedSegment === p2.isPredicted ? p2 : { ...p2, isPredicted: isPredictedSegment };
  const t = clamp(uNormalized, 0, 1);
  const spanDist = pointDistance(p1, p2);
  if (spanDist < 1e-6) return interpolateAttributes(p1.x, p1.y, p1, p2, t, isPredictedSegment);

  const t1 = Math.max(1e-3, Math.pow(pointDistance(p0, p1), CENTRIPETAL_CATMULL_ROM_ALPHA));
  const t2 = t1 + Math.max(1e-3, Math.pow(spanDist, CENTRIPETAL_CATMULL_ROM_ALPHA));
  const t3 = t2 + Math.max(1e-3, Math.pow(pointDistance(p2, p3), CENTRIPETAL_CATMULL_ROM_ALPHA));
  const u = t1 + (t2 - t1) * t;

  const a1x = ((t1 - u) / t1) * p0.x + (u / t1) * p1.x;
  const a1y = ((t1 - u) / t1) * p0.y + (u / t1) * p1.y;
  const a2x = ((t2 - u) / (t2 - t1)) * p1.x + ((u - t1) / (t2 - t1)) * p2.x;
  const a2y = ((t2 - u) / (t2 - t1)) * p1.y + ((u - t1) / (t2 - t1)) * p2.y;
  const a3x = ((t3 - u) / (t3 - t2)) * p2.x + ((u - t2) / (t3 - t2)) * p3.x;
  const a3y = ((t3 - u) / (t3 - t2)) * p2.y + ((u - t2) / (t3 - t2)) * p3.y;

  const b1x = ((t2 - u) / t2) * a1x + (u / t2) * a2x;
  const b1y = ((t2 - u) / t2) * a1y + (u / t2) * a2y;
  const b2x = ((t3 - u) / (t3 - t1)) * a2x + ((u - t1) / (t3 - t1)) * a3x;
  const b2y = ((t3 - u) / (t3 - t1)) * a2y + ((u - t1) / (t3 - t1)) * a3y;

  const x = ((t2 - u) / (t2 - t1)) * b1x + ((u - t1) / (t2 - t1)) * b2x;
  const y = ((t2 - u) / (t2 - t1)) * b1y + ((u - t1) / (t2 - t1)) * b2y;
  return interpolateAttributes(x, y, p1, p2, t, isPredictedSegment);
}

function reflectControlPoint(pivot: WetInkPoint, neighbor: WetInkPoint): WetInkPoint {
  return { ...pivot, x: 2 * pivot.x - neighbor.x, y: 2 * pivot.y - neighbor.y, timestampMs: Math.max(0, 2 * pivot.timestampMs - neighbor.timestampMs) };
}

function subdivideSplineSpan(p0: WetInkPoint, p1: WetInkPoint, p2: WetInkPoint, p3: WetInkPoint, subdivisions: number, isPredicted: boolean, anchorIndex: number): WetInkSegment[] {
  const steps = Math.max(1, Math.min(16, Math.trunc(subdivisions)));
  const segments: WetInkSegment[] = [];
  let prev = isPredicted === p1.isPredicted ? p1 : { ...p1, isPredicted };
  for (let i = 1; i <= steps; i += 1) {
    const endPoint = isPredicted === p2.isPredicted ? p2 : { ...p2, isPredicted };
    const next = i === steps ? endPoint : evaluateCentripetalCatmullRom(p0, p1, p2, p3, i / steps, isPredicted);
    segments.push({ start: prev, end: next, isPredicted, anchorIndex });
    prev = next;
  }
  return segments;
}

function computeTurnAngleDeg(a: WetInkPoint, b: WetInkPoint, c: WetInkPoint): number {
  const ux = b.x - a.x;
  const uy = b.y - a.y;
  const vx = c.x - b.x;
  const vy = c.y - b.y;
  const denom = Math.hypot(ux, uy) * Math.hypot(vx, vy);
  return denom < 1e-8 ? 0 : (Math.acos(clamp((ux * vx + uy * vy) / denom, -1, 1)) * 180) / Math.PI;
}

const createZeroDiagnostics = (clampReason: HorizonClampReason, clampMessageKo: string, seamErrorPx = 0): WetInkStepDiagnostics => ({
  turnAngleDeg: 0, dampingFactor: 0, effectiveHorizonMs: 0, predictedDistancePx: 0,
  kalmanVelocityX: 0, kalmanVelocityY: 0, kalmanSpeedPxPerMs: 0,
  horizonClamped: true, clampReason, clampMessageKo, seamErrorPx,
});

export class WetInkCatmullKalmanPredictor {
  private readonly explicitHorizonMs: number | undefined;
  private readonly subdivisions: number;
  private readonly sharpTurnThresholdDeg: number;
  private readonly penLiftThreshold: number;
  private readonly maxPredictionDistancePx: number;
  private readonly accelVariance: number;
  private readonly measVariancePx2: number;

  private anchors: WetInkPoint[] = [];
  private committedSegments: WetInkSegment[] = [];
  private committedAnchorIndex = 0;
  private kalmanX: AxisKalmanState | null = null;
  private kalmanY: AxisKalmanState | null = null;

  public constructor(config: WetInkPredictorConfig = {}) {
    this.explicitHorizonMs = config.horizonMs === undefined ? undefined : clamp(config.horizonMs, MIN_PREDICTION_HORIZON_MS, MAX_PREDICTION_HORIZON_MS);
    this.subdivisions = Math.max(1, Math.min(16, Math.trunc(config.subdivisions ?? DEFAULT_SPLINE_SUBDIVISIONS)));
    this.sharpTurnThresholdDeg = clamp(config.sharpTurnThresholdDeg ?? SHARP_TURN_ANGLE_THRESHOLD_DEG, 20, 170);
    this.penLiftThreshold = clamp(config.penLiftPressureThreshold ?? PEN_LIFT_PRESSURE_THRESHOLD, 0.005, 0.25);
    this.maxPredictionDistancePx = Math.max(2, config.maxPredictionDistancePx ?? DEFAULT_MAX_PREDICTION_DISTANCE_PX);
    this.accelVariance = Math.max(1e-4, config.kalmanProcessAccelVariance ?? 0.08);
    this.measVariancePx2 = Math.max(1e-4, config.kalmanMeasurementVariancePx2 ?? 0.35);
  }

  public reset(): void {
    this.anchors = [];
    this.committedSegments = [];
    this.committedAnchorIndex = 0;
    this.kalmanX = null;
    this.kalmanY = null;
  }

  public pushSample(sample: StylusInputSample): WetInkPredictionFrame {
    const cleanPressure = clamp(sample.pressure, 0, 1);
    const cleanTiltX = clamp(sample.tiltX, -90, 90);
    const cleanTiltY = clamp(sample.tiltY, -90, 90);
    const prevAnchor = this.anchors[this.anchors.length - 1];

    if (prevAnchor === undefined || this.kalmanX === null || this.kalmanY === null) {
      this.kalmanX = { pos: sample.x, vel: 0, p00: 1, p01: 0, p10: 0, p11: 4 };
      this.kalmanY = { pos: sample.y, vel: 0, p00: 1, p01: 0, p10: 0, p11: 4 };
      const firstAnchor = makePoint(sample.x, sample.y, cleanPressure, cleanTiltX, cleanTiltY, sample.timestampMs, 0, false);
      this.anchors.push(firstAnchor);
      return {
        newlyCommittedSegments: [], allCommittedSegments: [], wetInkOverlaySegments: [], predictedTailSegments: [],
        predictedTip: null, lastCommittedPoint: firstAnchor,
        diagnostics: createZeroDiagnostics("insufficient-samples", "첫 입력 샘플 수집 단계로 속도 추정 대기 중"),
      };
    }

    const rawDtMs = sample.timestampMs - prevAnchor.timestampMs;
    const dtMs = clamp(rawDtMs > 0 ? rawDtMs : DEFAULT_PREDICTION_HORIZON_MS, 0.5, 50);
    updateAxisKalman(this.kalmanX, sample.x, dtMs, this.accelVariance, this.measVariancePx2);
    updateAxisKalman(this.kalmanY, sample.y, dtMs, this.accelVariance, this.measVariancePx2);

    let velX = this.kalmanX.vel;
    let velY = this.kalmanY.vel;
    let speed = Math.hypot(velX, velY);
    const currentAnchor = makePoint(sample.x, sample.y, cleanPressure, cleanTiltX, cleanTiltY, Math.max(prevAnchor.timestampMs + 0.01, sample.timestampMs), speed, false);
    this.anchors.push(currentAnchor);

    const prevCommittedHead = this.getLastCommittedPoint(currentAnchor);
    const newlyCommitted: WetInkSegment[] = [];
    const n = this.anchors.length;

    if (n >= 3) {
      const idx = n - 3;
      const p1 = this.anchors[idx];
      const p2 = this.anchors[idx + 1];
      const p3 = this.anchors[idx + 2];
      if (p1 !== undefined && p2 !== undefined && p3 !== undefined) {
        const p0 = (idx > 0 ? this.anchors[idx - 1] : undefined) ?? reflectControlPoint(p1, p2);
        const spanSegments = subdivideSplineSpan(p0, p1, p2, p3, this.subdivisions, false, idx);
        newlyCommitted.push(...spanSegments);
        this.committedSegments.push(...spanSegments);
        this.committedAnchorIndex = idx + 1;
      }
    }

    const turnA = n >= 3 ? this.anchors[n - 3] : undefined;
    const turnB = n >= 3 ? this.anchors[n - 2] : undefined;
    const turnAngleDeg = turnA !== undefined && turnB !== undefined ? computeTurnAngleDeg(turnA, turnB, currentAnchor) : 0;
    const nominalHorizonMs = this.explicitHorizonMs ?? clamp(dtMs, MIN_PREDICTION_HORIZON_MS, MAX_PREDICTION_HORIZON_MS);

    let dampingFactor = 1;
    let horizonClamped = false;
    let clampReason: HorizonClampReason = "none";
    let clampMessageKo = "정상 1프레임 예측 가동 중";

    if (cleanPressure < this.penLiftThreshold) {
      dampingFactor = 0;
      horizonClamped = true;
      clampReason = "pen-lift";
      clampMessageKo = "펜 리프트 임계 필압 미만으로 예측 꼬리 즉시 차단";
    } else if (turnAngleDeg > this.sharpTurnThresholdDeg) {
      const excessRatio = clamp((turnAngleDeg - this.sharpTurnThresholdDeg) / (125 - this.sharpTurnThresholdDeg), 0, 1);
      dampingFactor = 0.16 * (1 - excessRatio) * (1 - excessRatio);
      horizonClamped = true;
      clampReason = "sharp-turn";
      clampMessageKo = "급격한 방향 전환 감지: 모서리 오버슈트 방지를 위해 예측 지평 감쇠";

      const chordDx = currentAnchor.x - prevAnchor.x;
      const chordDy = currentAnchor.y - prevAnchor.y;
      const chordLen = Math.hypot(chordDx, chordDy);
      if (chordLen > 1e-4) {
        const alignedSpeed = Math.min(speed, chordLen / dtMs);
        velX = (chordDx / chordLen) * alignedSpeed;
        velY = (chordDy / chordLen) * alignedSpeed;
        this.kalmanX.vel = velX;
        this.kalmanY.vel = velY;
        speed = Math.hypot(velX, velY);
      }
    }

    let effectiveHorizonMs = nominalHorizonMs * dampingFactor;
    let predDx = velX * effectiveHorizonMs;
    let predDy = velY * effectiveHorizonMs;
    let predictedDistancePx = Math.hypot(predDx, predDy);

    if (predictedDistancePx > this.maxPredictionDistancePx && predictedDistancePx > 1e-6) {
      const ratio = this.maxPredictionDistancePx / predictedDistancePx;
      predDx *= ratio;
      predDy *= ratio;
      effectiveHorizonMs *= ratio;
      predictedDistancePx = this.maxPredictionDistancePx;
      horizonClamped = true;
      if (clampReason === "none") {
        clampReason = "max-distance";
        clampMessageKo = "고속 이동 상한 도달로 최대 예측 거리 클램핑 적용";
      }
    }

    const predictedTip =
      effectiveHorizonMs > 0.05 && predictedDistancePx > 1e-3
        ? makePoint(currentAnchor.x + predDx, currentAnchor.y + predDy, clamp(cleanPressure * 0.92, this.penLiftThreshold, 1), cleanTiltX, cleanTiltY, currentAnchor.timestampMs + effectiveHorizonMs, speed, true)
        : null;

    const bridgeStartIdx = this.committedAnchorIndex;
    const bridgeStart = this.anchors[bridgeStartIdx] ?? currentAnchor;
    const bridgePrev = (bridgeStartIdx > 0 ? this.anchors[bridgeStartIdx - 1] : undefined) ?? reflectControlPoint(bridgeStart, currentAnchor);
    const bridgeNext = predictedTip ?? reflectControlPoint(currentAnchor, bridgeStart);
    const provisionalBridge = subdivideSplineSpan(bridgePrev, bridgeStart, currentAnchor, bridgeNext, this.subdivisions, true, bridgeStartIdx);
    const predictedTailSegments =
      predictedTip === null
        ? []
        : subdivideSplineSpan(bridgeStart, currentAnchor, predictedTip, reflectControlPoint(predictedTip, currentAnchor), Math.max(1, Math.ceil(this.subdivisions * 0.5)), true, n - 1);

    const wetInkOverlaySegments = [...provisionalBridge, ...predictedTailSegments];
    const lastCommittedPoint = this.getLastCommittedPoint(currentAnchor);
    const seamErrorPx = this.measureSeamError(prevCommittedHead, newlyCommitted, lastCommittedPoint, wetInkOverlaySegments);

    return {
      newlyCommittedSegments: newlyCommitted,
      allCommittedSegments: [...this.committedSegments],
      wetInkOverlaySegments,
      predictedTailSegments,
      predictedTip,
      lastCommittedPoint,
      diagnostics: {
        turnAngleDeg, dampingFactor, effectiveHorizonMs,
        predictedDistancePx: predictedTip === null ? 0 : predictedDistancePx,
        kalmanVelocityX: velX, kalmanVelocityY: velY, kalmanSpeedPxPerMs: speed,
        horizonClamped, clampReason, clampMessageKo, seamErrorPx,
      },
    };
  }

  public finishStroke(): WetInkPredictionFrame | null {
    const tailFallback = this.anchors[this.anchors.length - 1];
    if (tailFallback === undefined) return null;
    const prevCommittedHead = this.getLastCommittedPoint(tailFallback);
    const newlyCommitted: WetInkSegment[] = [];

    while (this.committedAnchorIndex < this.anchors.length - 1) {
      const idx = this.committedAnchorIndex;
      const p1 = this.anchors[idx];
      const p2 = this.anchors[idx + 1];
      if (p1 === undefined || p2 === undefined) break;
      const p0 = (idx > 0 ? this.anchors[idx - 1] : undefined) ?? reflectControlPoint(p1, p2);
      const p3 = this.anchors[idx + 2] ?? reflectControlPoint(p2, p1);
      const span = subdivideSplineSpan(p0, p1, p2, p3, this.subdivisions, false, idx);
      newlyCommitted.push(...span);
      this.committedSegments.push(...span);
      this.committedAnchorIndex += 1;
    }

    const lastCommittedPoint = this.getLastCommittedPoint(tailFallback);
    const seamErrorPx = this.measureSeamError(prevCommittedHead, newlyCommitted, lastCommittedPoint, []);
    return {
      newlyCommittedSegments: newlyCommitted, allCommittedSegments: [...this.committedSegments],
      wetInkOverlaySegments: [], predictedTailSegments: [], predictedTip: null, lastCommittedPoint,
      diagnostics: createZeroDiagnostics("pen-lift", "획 종료로 미확정 구간 최종 확정 및 예측 오버레이 비움 완료", seamErrorPx),
    };
  }

  private getLastCommittedPoint(fallback: WetInkPoint): WetInkPoint {
    const lastSeg = this.committedSegments[this.committedSegments.length - 1];
    return lastSeg !== undefined ? lastSeg.end : (this.anchors[this.committedAnchorIndex] ?? fallback);
  }

  private measureSeamError(prevCommittedHead: WetInkPoint, newlyCommitted: readonly WetInkSegment[], currentCommittedHead: WetInkPoint, overlaySegments: readonly WetInkSegment[]): number {
    let maxGap = 0;
    const checkChain = (head: WetInkPoint, chain: readonly WetInkSegment[]): void => {
      const first = chain[0];
      if (first === undefined) return;
      maxGap = Math.max(maxGap, pointDistance(head, first.start));
      for (let i = 0; i + 1 < chain.length; i += 1) {
        const curr = chain[i];
        const next = chain[i + 1];
        if (curr !== undefined && next !== undefined) maxGap = Math.max(maxGap, pointDistance(curr.end, next.start));
      }
    };
    checkChain(prevCommittedHead, newlyCommitted);
    checkChain(currentCommittedHead, overlaySegments);
    return maxGap;
  }
}

export function createWetInkPredictor(config?: WetInkPredictorConfig): WetInkCatmullKalmanPredictor {
  return new WetInkCatmullKalmanPredictor(config);
}
