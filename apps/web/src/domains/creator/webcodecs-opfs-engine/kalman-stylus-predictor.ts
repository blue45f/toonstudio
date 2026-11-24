/**
 * 스타일러스 `PointerEvent.getPredictedEvents()` 대응 2D 칼만 필터 잉크 지연 예측기.
 *
 * - 2D 등속 칼만 필터(x, y, vx, vy)로 입력 지터를 억제하면서 `leadTimeMs` 만큼 선행 좌표를 외삽한다.
 * - 직전 속도 벡터 대비 급회전(`>= sharpTurnAngleDeg`)이 감지되면 선행 리드를 강하게 감쇠하고
 *   `maxOvershootPx` 이내로 클램핑해 날카로운 꺾임 코너의 잉크 오버슈트를 방지한다.
 */

export interface StylusPoint2D {
  readonly x: number;
  readonly y: number;
}

export interface PredictedStylusEventPoint {
  readonly x: number;
  readonly y: number;
  readonly timestampMs: number;
}

export interface StylusSample {
  readonly x: number;
  readonly y: number;
  readonly timestampMs: number;
  readonly pressure?: number;
  readonly predictedEvents?: readonly PredictedStylusEventPoint[];
}

export interface KalmanStylusConfig {
  readonly processNoisePos: number;
  readonly processNoiseVel: number;
  readonly measurementNoise: number;
  readonly leadTimeMs: number;
  readonly maxOvershootPx: number;
  readonly sharpTurnAngleDeg: number;
  readonly sharpTurnDamping: number;
  readonly predictedEventBlend: number;
}

export interface KalmanStylusState {
  readonly initialized: boolean;
  readonly x: number;
  readonly y: number;
  readonly vx: number;
  readonly vy: number;
  readonly prevVx: number;
  readonly prevVy: number;
  readonly lastRawX: number;
  readonly lastRawY: number;
  readonly prevRawDx: number;
  readonly prevRawDy: number;
  readonly p00: number;
  readonly p01: number;
  readonly p11: number;
  readonly lastTimestampMs: number;
  readonly sampleCount: number;
}

export interface StylusLeadPrediction {
  readonly rawPoint: StylusPoint2D;
  readonly filteredPoint: StylusPoint2D;
  readonly predictedPoint: StylusPoint2D;
  readonly velocityPxPerSec: number;
  readonly turnAngleDeg: number;
  readonly overshootClamped: boolean;
  readonly clampedLeadDistancePx: number;
  readonly effectiveLeadMs: number;
  readonly usedPredictedEventCount: number;
  readonly nextState: KalmanStylusState;
}

export interface StylusTrajectoryBenchmark {
  readonly steps: readonly StylusLeadPrediction[];
  readonly rmsTrackingErrorPx: number;
  readonly maxLeadDistancePx: number;
  readonly clampedCornerCount: number;
  readonly averageVelocityPxPerSec: number;
}

export const DEFAULT_KALMAN_STYLUS_CONFIG: KalmanStylusConfig = {
  processNoisePos: 0.8,
  processNoiseVel: 850_000,
  measurementNoise: 0.9,
  leadTimeMs: 12,
  maxOvershootPx: 12,
  sharpTurnAngleDeg: 45,
  sharpTurnDamping: 0.14,
  predictedEventBlend: 0.45,
};

function clampNum(v: number, min: number, max: number): number {
  if (!Number.isFinite(v)) return min;
  return v < min ? min : v > max ? max : v;
}

function roundTo(v: number, decimals: number): number {
  const f = 10 ** decimals;
  return Math.round(v * f) / f;
}

/** 초기 2D 칼만 스타일러스 상태를 생성한다. */
export function createKalmanStylusState(): KalmanStylusState {
  return {
    initialized: false,
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    prevVx: 0,
    prevVy: 0,
    lastRawX: 0,
    lastRawY: 0,
    prevRawDx: 0,
    prevRawDy: 0,
    p00: 10,
    p01: 0,
    p11: 250_000,
    lastTimestampMs: 0,
    sampleCount: 0,
  };
}

/**
 * 스타일러스 샘플 1개를 입력받아 2D 칼만 필터 갱신 및 오버슈트 클램핑 선행 좌표를 반환한다.
 */
export function predictStylusLeadPoint(
  state: KalmanStylusState,
  sample: StylusSample,
  partialConfig?: Partial<KalmanStylusConfig>,
): StylusLeadPrediction {
  const cfg: KalmanStylusConfig = { ...DEFAULT_KALMAN_STYLUS_CONFIG, ...partialConfig };
  const rawPoint: StylusPoint2D = { x: sample.x, y: sample.y };

  if (!state.initialized) {
    const nextState: KalmanStylusState = {
      initialized: true,
      x: sample.x,
      y: sample.y,
      vx: 0,
      vy: 0,
      prevVx: 0,
      prevVy: 0,
      lastRawX: sample.x,
      lastRawY: sample.y,
      prevRawDx: 0,
      prevRawDy: 0,
      p00: cfg.measurementNoise,
      p01: 0,
      p11: 250_000,
      lastTimestampMs: sample.timestampMs,
      sampleCount: 1,
    };
    return {
      rawPoint,
      filteredPoint: rawPoint,
      predictedPoint: rawPoint,
      velocityPxPerSec: 0,
      turnAngleDeg: 0,
      overshootClamped: false,
      clampedLeadDistancePx: 0,
      effectiveLeadMs: 0,
      usedPredictedEventCount: 0,
      nextState,
    };
  }

  const dtMs = clampNum(sample.timestampMs - state.lastTimestampMs, 1, 100);
  const dt = dtMs / 1000;
  const rawDx = sample.x - state.lastRawX;
  const rawDy = sample.y - state.lastRawY;
  const instVx = rawDx / dt;
  const instVy = rawDy / dt;

  // 1. 연속 백색 가속도(CWNA) 공분산 전파 기반 칼만 예측 단계(Predict)
  const baseVx = state.sampleCount === 1 ? instVx : state.vx;
  const baseVy = state.sampleCount === 1 ? instVy : state.vy;
  const predX = state.x + baseVx * dt;
  const predY = state.y + baseVy * dt;
  const q = Math.max(100, cfg.processNoiseVel);
  const q00 = (dt * dt * dt * q) / 3 + cfg.processNoisePos;
  const q01 = (dt * dt * q) / 2;
  const q11 = dt * q;

  const p00Pred = state.p00 + 2 * dt * state.p01 + dt * dt * state.p11 + q00;
  const p01Pred = state.p01 + dt * state.p11 + q01;
  const p11Pred = state.p11 + q11;

  // 2. 칼만 갱신 단계(Update)
  const innovX = sample.x - predX;
  const innovY = sample.y - predY;
  const s = p00Pred + cfg.measurementNoise;
  const k0 = p00Pred / s;
  const k1 = p01Pred / s;

  const nextX = predX + k0 * innovX;
  const nextY = predY + k0 * innovY;
  const nextVx = baseVx + k1 * innovX;
  const nextVy = baseVy + k1 * innovY;
  const nextP00 = (1 - k0) * p00Pred;
  const nextP01 = (1 - k0) * p01Pred;
  const nextP11 = Math.max(1, p11Pred - k1 * p01Pred);

  // 3. 직전 스트로크 진행 벡터 대비 회전각 산출(위상 지연 없이 급회전 코너 정확 탐지)
  const prevStepMag = Math.hypot(state.prevRawDx, state.prevRawDy);
  const currStepMag = Math.hypot(rawDx, rawDy);
  let turnAngleDeg = 0;
  if (prevStepMag > 1 && currStepMag > 1) {
    const dot = clampNum(
      (state.prevRawDx * rawDx + state.prevRawDy * rawDy) / (prevStepMag * currStepMag),
      -1,
      1,
    );
    turnAngleDeg = (Math.acos(dot) * 180) / Math.PI;
  }

  const isSharpTurn = turnAngleDeg >= cfg.sharpTurnAngleDeg;
  const alignedVx = isSharpTurn ? instVx * 0.8 + nextVx * 0.2 : nextVx;
  const alignedVy = isSharpTurn ? instVy * 0.8 + nextVy * 0.2 : nextVy;

  // 4. 리드 벡터 계산 + getPredictedEvents 융합 + 오버슈트 클램핑
  const leadSec = clampNum(cfg.leadTimeMs, 0, 50) / 1000;
  let leadDx = alignedVx * leadSec;
  let leadDy = alignedVy * leadSec;

  const predictedEvents = sample.predictedEvents ?? [];
  if (predictedEvents.length > 0) {
    const tail = predictedEvents[predictedEvents.length - 1];
    if (tail) {
      const osDx = tail.x - nextX;
      const osDy = tail.y - nextY;
      const blend = clampNum(cfg.predictedEventBlend, 0, 0.85);
      leadDx = leadDx * (1 - blend) + osDx * blend;
      leadDy = leadDy * (1 - blend) + osDy * blend;
    }
  }

  let overshootClamped = false;
  let effectiveLeadMs = cfg.leadTimeMs;

  if (isSharpTurn) {
    const damping = clampNum(cfg.sharpTurnDamping, 0.02, 0.6);
    leadDx *= damping;
    leadDy *= damping;
    effectiveLeadMs = cfg.leadTimeMs * damping;
    overshootClamped = true;
  }

  const dynamicCap = isSharpTurn
    ? Math.min(cfg.maxOvershootPx, Math.max(1.5, currStepMag * 0.35))
    : cfg.maxOvershootPx;
  const leadMag = Math.hypot(leadDx, leadDy);
  if (leadMag > dynamicCap && leadMag > 1e-6) {
    const ratio = dynamicCap / leadMag;
    leadDx *= ratio;
    leadDy *= ratio;
    effectiveLeadMs = effectiveLeadMs * ratio;
    overshootClamped = true;
  }

  const finalLeadMag = Math.hypot(leadDx, leadDy);
  const filteredPoint: StylusPoint2D = { x: roundTo(nextX, 3), y: roundTo(nextY, 3) };
  const predictedPoint: StylusPoint2D = { x: roundTo(nextX + leadDx, 3), y: roundTo(nextY + leadDy, 3) };

  const nextState: KalmanStylusState = {
    initialized: true,
    x: nextX,
    y: nextY,
    vx: alignedVx,
    vy: alignedVy,
    prevVx: state.vx,
    prevVy: state.vy,
    lastRawX: sample.x,
    lastRawY: sample.y,
    prevRawDx: rawDx,
    prevRawDy: rawDy,
    p00: nextP00,
    p01: nextP01,
    p11: nextP11,
    lastTimestampMs: sample.timestampMs,
    sampleCount: state.sampleCount + 1,
  };

  return {
    rawPoint,
    filteredPoint,
    predictedPoint,
    velocityPxPerSec: roundTo(Math.hypot(alignedVx, alignedVy), 2),
    turnAngleDeg: roundTo(turnAngleDeg, 2),
    overshootClamped,
    clampedLeadDistancePx: roundTo(finalLeadMag, 3),
    effectiveLeadMs: roundTo(effectiveLeadMs, 2),
    usedPredictedEventCount: predictedEvents.length,
    nextState,
  };
}

/** 샘플 시퀀스에 대해 2D 칼만 예측 벤치마크(오차·클램핑 횟수)를 실행한다. */
export function simulateStylusTrajectoryPrediction(
  samples: readonly StylusSample[],
  partialConfig?: Partial<KalmanStylusConfig>,
): StylusTrajectoryBenchmark {
  let state = createKalmanStylusState();
  const steps: StylusLeadPrediction[] = [];
  let sqErrSum = 0;
  let errCount = 0;
  let maxLeadDistancePx = 0;
  let clampedCornerCount = 0;
  let velSum = 0;

  for (let i = 0; i < samples.length; i += 1) {
    const sample = samples[i];
    if (!sample) continue;
    const pred = predictStylusLeadPoint(state, sample, partialConfig);
    state = pred.nextState;
    steps.push(pred);
    velSum += pred.velocityPxPerSec;
    if (pred.clampedLeadDistancePx > maxLeadDistancePx) {
      maxLeadDistancePx = pred.clampedLeadDistancePx;
    }
    if (pred.overshootClamped) clampedCornerCount += 1;

    const nextSample = samples[i + 1];
    if (nextSample && i >= 2) {
      const dx = pred.predictedPoint.x - nextSample.x;
      const dy = pred.predictedPoint.y - nextSample.y;
      sqErrSum += dx * dx + dy * dy;
      errCount += 1;
    }
  }

  return {
    steps,
    rmsTrackingErrorPx: errCount > 0 ? roundTo(Math.sqrt(sqErrSum / errCount), 3) : 0,
    maxLeadDistancePx: roundTo(maxLeadDistancePx, 3),
    clampedCornerCount,
    averageVelocityPxPerSec: steps.length > 0 ? roundTo(velSum / steps.length, 2) : 0,
  };
}

/** UI·테스트 검증용 부드러운 곡선 및 90° 급회전 코너 스타일러스 샘플을 생성한다. */
export function buildDemoStylusSamples(mode: "smooth-curve" | "sharp-corner"): readonly StylusSample[] {
  const samples: StylusSample[] = [];
  if (mode === "smooth-curve") {
    for (let i = 0; i < 16; i += 1) {
      const t = i / 15;
      const x = roundTo(40 + t * 280, 2);
      const y = roundTo(110 + Math.sin(t * Math.PI * 1.4) * 58, 2);
      const nextT = Math.min(1, (i + 1) / 15);
      samples.push({
        x,
        y,
        timestampMs: i * 8,
        pressure: 0.75,
        predictedEvents: [
          {
            x: roundTo(40 + nextT * 280, 2),
            y: roundTo(110 + Math.sin(nextT * Math.PI * 1.4) * 58, 2),
            timestampMs: (i + 1) * 8,
          },
        ],
      });
    }
    return samples;
  }

  // 고속 수평 이동 직후 90도 하강 꺾임 코너(오버슈트 클램핑 테스트)
  for (let i = 0; i < 8; i += 1) {
    samples.push({ x: 40 + i * 24, y: 60, timestampMs: i * 8, pressure: 0.8 });
  }
  const cornerX = 40 + 7 * 24;
  for (let j = 1; j <= 8; j += 1) {
    samples.push({ x: cornerX, y: 60 + j * 24, timestampMs: (7 + j) * 8, pressure: 0.85 });
  }
  return samples;
}
