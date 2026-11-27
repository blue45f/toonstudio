/**
 * Wave-56: 초저지연 하이브리드 뷰포트 카메라 운동학 예측기 및 2D 재투영 호모그래피 커널.
 *
 * 120/240Hz 펜 입력과 뷰포트 팬·줌·회전 제스처 시계열에 시간 간격 보정형 이중 지수 평활
 * (Holt-Kinematic α-β-γ 필터)을 적용해 8~45ms 적응형 리드타임으로 다음 스캔아웃 시점의
 * 카메라 자세를 외삽한다. 줌은 로그 공간, 회전은 ±π 연속 언래핑 공간에서 처리해 발산을 막는다.
 */

export interface ViewportCameraPose2D {
  readonly panX: number;
  readonly panY: number;
  readonly zoom: number;
  readonly rotationRad: number;
  readonly timestampMs: number;
}

export interface PenKinematicsSample {
  readonly x: number;
  readonly y: number;
  readonly pressure: number;
  readonly tiltXDeg?: number;
  readonly tiltYDeg?: number;
  readonly timestampMs: number;
  readonly isStrokeActive: boolean;
}

export interface MotionKinematicsSample {
  readonly pose: ViewportCameraPose2D;
  readonly pen?: PenKinematicsSample;
  readonly samplingRateHz?: number;
}

export interface ViewportKinematicsState {
  readonly smoothedPanX: number;
  readonly smoothedPanY: number;
  readonly smoothedLogZoom: number;
  readonly smoothedRotationRad: number;
  readonly vxPxPerSec: number;
  readonly vyPxPerSec: number;
  readonly vLogZoomPerSec: number;
  readonly angularVelRadPerSec: number;
  readonly axPxPerSec2: number;
  readonly ayPxPerSec2: number;
  readonly aLogZoomPerSec2: number;
  readonly angularAccRadPerSec2: number;
  readonly lastInnovationPx: number;
  readonly jerkNorm: number;
  readonly penSpeedPxPerSec: number;
  readonly penAccelPxPerSec2: number;
  readonly penVxPxPerSec: number;
  readonly penVyPxPerSec: number;
  readonly penLastX: number | null;
  readonly penLastY: number | null;
  readonly penActive: boolean;
  readonly inferredSampleRateHz: number;
  readonly maxSampleGapMs: number;
  readonly sampleCount: number;
  readonly lastTimestampMs: number;
}

export interface MotionPredictorConfig {
  readonly minLeadTimeMs: number;
  readonly maxLeadTimeMs: number;
  readonly baseLeadTimeMs: number;
  readonly alpha: number;
  readonly beta: number;
  readonly gammaAccel: number;
  readonly accelerationDamping: number;
  readonly maxLinearSpeedPxPerSec: number;
  readonly maxLogZoomSpeedPerSec: number;
  readonly maxAngularSpeedRadPerSec: number;
  readonly minZoom: number;
  readonly maxZoom: number;
}

/** 기본 운동학 예측기 설정 (`8~45ms` 적응형 리드타임, 120/240Hz 최적화). */
export const DEFAULT_MOTION_PREDICTOR_CONFIG: MotionPredictorConfig = {
  minLeadTimeMs: 8,
  maxLeadTimeMs: 45,
  baseLeadTimeMs: 16,
  alpha: 0.58,
  beta: 0.28,
  gammaAccel: 0.045,
  accelerationDamping: 0.85,
  maxLinearSpeedPxPerSec: 18000,
  maxLogZoomSpeedPerSec: 6.0,
  maxAngularSpeedRadPerSec: 12.0,
  minZoom: 0.05,
  maxZoom: 64.0,
};

export type ViewportMotionRegime =
  | "stationary"
  | "steady-pan"
  | "ballistic-gesture"
  | "turning-or-jerky"
  | "pen-precision";

export interface PredictionConfidenceReport {
  readonly confidence: number;
  readonly recommendedLeadTimeMs: number;
  readonly motionRegime: ViewportMotionRegime;
  readonly factors: {
    readonly sampleContinuity: number;
    readonly jerkStability: number;
    readonly innovationConsistency: number;
    readonly samplingRateScore: number;
    readonly penPrecisionFactor: number;
  };
}

export interface PredictViewportMotionOptions extends Partial<MotionPredictorConfig> {
  readonly targetLeadTimeMs?: number;
  readonly observedLatencyMs?: number;
}

export interface PredictedPenPoint2D {
  readonly x: number;
  readonly y: number;
  readonly speedPxPerSec: number;
}

export interface PredictedViewportPoseResult {
  readonly predictedPose: ViewportCameraPose2D;
  readonly sourcePose: ViewportCameraPose2D;
  readonly leadTimeMs: number;
  readonly kinematics: ViewportKinematicsState;
  readonly confidence: PredictionConfidenceReport;
  readonly predictedPenPoint?: PredictedPenPoint2D;
  readonly extrapolationDelta: {
    readonly dx: number;
    readonly dy: number;
    readonly zoomRatio: number;
    readonly dRotationRad: number;
  };
}

/** 행 우선(Row-Major) 3×3 2D 사영 호모그래피 행렬. */
export type Matrix3x3 = readonly [
  number, number, number,
  number, number, number,
  number, number, number,
];

export interface Point2D {
  readonly x: number;
  readonly y: number;
}

export interface ProjectedPoint2D {
  readonly x: number;
  readonly y: number;
  readonly w: number;
}

export interface ReprojectionHomographyOptions {
  readonly pivotX?: number;
  readonly pivotY?: number;
  readonly viewportWidth?: number;
  readonly viewportHeight?: number;
  /** 레이어의 물리 깊이(m). `focusDepthMeters`와 함께 깊이 시차(Depth-Aware Timewarp)를 계산한다. */
  readonly depthMeters?: number;
  readonly focusDepthMeters?: number;
  /** 정규화 깊이 힌트 (`0` = 최전경, `0.5` = 초점 평면, `1` = 원경). */
  readonly depthNormalized?: number;
  readonly parallaxScale?: number;
  readonly maxParallaxGain?: number;
  readonly perspectiveTiltX?: number;
  readonly perspectiveTiltY?: number;
}

export interface ReprojectionHomography2DResult {
  readonly matrix: Matrix3x3;
  readonly inverseMatrix: Matrix3x3;
  readonly scaleRatio: number;
  readonly rotationDeltaRad: number;
  readonly translationDeltaPx: Point2D;
  readonly parallaxGain: number;
  readonly isProjective: boolean;
  readonly determinant: number;
  readonly maxCornerDisplacementPx: number;
}

export interface HomographyDecompositionMetrics {
  readonly scaleX: number;
  readonly scaleY: number;
  readonly rotationRad: number;
  readonly translationPx: Point2D;
  readonly projectiveWarpMagnitude: number;
  readonly determinant: number;
}

const REFERENCE_DT_SEC = 1 / 120;
const MIN_DT_SEC = 0.00025;
const MAX_DT_SEC = 0.25;
const DEFAULT_FOCUS_DEPTH_METERS = 2.5;
const EPSILON = 1e-12;

export const IDENTITY_MATRIX_3X3: Matrix3x3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return value < min ? min : value > max ? max : value;
}

function sanitizeFinite(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback;
}

/** 두 각도의 최단 부호 있는 차이 `[-π, π]`를 반환한다. */
export function wrapAngleDeltaRad(deltaRad: number): number {
  const twoPi = Math.PI * 2;
  let wrapped = (((deltaRad + Math.PI) % twoPi) + twoPi) % twoPi - Math.PI;
  if (wrapped <= -Math.PI) wrapped += twoPi;
  return wrapped;
}

function resolvePredictorConfig(overrides?: Partial<MotionPredictorConfig>): MotionPredictorConfig {
  const d = DEFAULT_MOTION_PREDICTOR_CONFIG;
  const minLead = clamp(overrides?.minLeadTimeMs ?? d.minLeadTimeMs, 8, 45);
  const maxLead = clamp(overrides?.maxLeadTimeMs ?? d.maxLeadTimeMs, minLead, 45);
  const baseLead = clamp(overrides?.baseLeadTimeMs ?? d.baseLeadTimeMs, minLead, maxLead);
  const alpha = clamp(overrides?.alpha ?? d.alpha, 0.08, 0.95);
  const beta = clamp(overrides?.beta ?? d.beta, 0.02, 0.9);
  const maxStableGamma = (0.45 * alpha * beta) / Math.max(0.15, 2 - alpha);
  const minZoom = Math.max(0.005, overrides?.minZoom ?? d.minZoom);

  return {
    minLeadTimeMs: minLead,
    maxLeadTimeMs: maxLead,
    baseLeadTimeMs: baseLead,
    alpha,
    beta,
    gammaAccel: clamp(overrides?.gammaAccel ?? d.gammaAccel, 0, maxStableGamma),
    accelerationDamping: clamp(overrides?.accelerationDamping ?? d.accelerationDamping, 0, 1),
    maxLinearSpeedPxPerSec: Math.max(100, overrides?.maxLinearSpeedPxPerSec ?? d.maxLinearSpeedPxPerSec),
    maxLogZoomSpeedPerSec: Math.max(0.5, overrides?.maxLogZoomSpeedPerSec ?? d.maxLogZoomSpeedPerSec),
    maxAngularSpeedRadPerSec: Math.max(0.5, overrides?.maxAngularSpeedRadPerSec ?? d.maxAngularSpeedRadPerSec),
    minZoom,
    maxZoom: Math.max(minZoom, overrides?.maxZoom ?? d.maxZoom),
  };
}

function adaptSmoothingGain(baseGain: number, dtSec: number): number {
  const ratio = clamp(dtSec / REFERENCE_DT_SEC, 0.15, 6.0);
  return clamp(1 - Math.pow(1 - baseGain, ratio), 0.02, 0.96);
}

interface ScalarChannelState {
  level: number;
  velocity: number;
  acceleration: number;
  prevDtSec: number;
  lastResidual: number;
  lastJerk: number;
}

function createScalarChannel(initialLevel: number): ScalarChannelState {
  return { level: initialLevel, velocity: 0, acceleration: 0, prevDtSec: REFERENCE_DT_SEC, lastResidual: 0, lastJerk: 0 };
}

function updateScalarChannel(
  ch: ScalarChannelState,
  observed: number,
  dtSec: number,
  sampleIndex: number,
  alphaEff: number,
  betaEff: number,
  gammaEff: number,
  maxVelocity: number,
): void {
  if (sampleIndex === 1) {
    ch.velocity = clamp((observed - ch.level) / dtSec, -maxVelocity, maxVelocity);
    ch.level = observed;
    ch.acceleration = 0;
    ch.prevDtSec = dtSec;
    ch.lastResidual = 0;
    ch.lastJerk = 0;
    return;
  }

  if (sampleIndex === 2) {
    const segVel = clamp((observed - ch.level) / dtSec, -maxVelocity, maxVelocity);
    const meanDt = Math.max(MIN_DT_SEC, 0.5 * (ch.prevDtSec + dtSec));
    const maxAccel = maxVelocity * 20;
    const estAccel = clamp((segVel - ch.velocity) / meanDt, -maxAccel, maxAccel);
    ch.level = observed;
    ch.velocity = clamp(segVel + 0.5 * estAccel * dtSec, -maxVelocity, maxVelocity);
    ch.acceleration = estAccel;
    ch.prevDtSec = dtSec;
    ch.lastResidual = 0;
    ch.lastJerk = 0;
    return;
  }

  const predLevel = ch.level + ch.velocity * dtSec + 0.5 * ch.acceleration * dtSec * dtSec;
  const predVel = ch.velocity + ch.acceleration * dtSec;
  const prevAccel = ch.acceleration;
  const residual = observed - predLevel;
  const maxAccel = maxVelocity * 25;

  ch.level = predLevel + alphaEff * residual;
  ch.velocity = clamp(predVel + (betaEff / dtSec) * residual, -maxVelocity, maxVelocity);
  ch.acceleration = clamp(prevAccel + ((2 * gammaEff) / (dtSec * dtSec)) * residual, -maxAccel, maxAccel);
  ch.prevDtSec = dtSec;
  ch.lastResidual = residual;
  ch.lastJerk = (ch.acceleration - prevAccel) / dtSec;
}

interface PredictorRuntimeState {
  panX: ScalarChannelState | null;
  panY: ScalarChannelState | null;
  logZoom: ScalarChannelState | null;
  rot: ScalarChannelState | null;
  unwrappedRotationRad: number;
  lastRawPose: ViewportCameraPose2D | null;
  sampleCount: number;
  dtAccumSec: number;
  dtIntervalCount: number;
  maxSampleGapMs: number;
  reportedRateHz: number | null;
  lastPenSample: PenKinematicsSample | null;
  penVxPxPerSec: number;
  penVyPxPerSec: number;
  penAccelPxPerSec2: number;
  recentDirectionFlipPenalty: number;
}

function createEmptyRuntimeState(): PredictorRuntimeState {
  return {
    panX: null, panY: null, logZoom: null, rot: null,
    unwrappedRotationRad: 0, lastRawPose: null, sampleCount: 0,
    dtAccumSec: 0, dtIntervalCount: 0, maxSampleGapMs: 0, reportedRateHz: null,
    lastPenSample: null, penVxPxPerSec: 0, penVyPxPerSec: 0, penAccelPxPerSec2: 0, recentDirectionFlipPenalty: 0,
  };
}

/** 실시간 120/240Hz 뷰포트·펜 스트림을 증분 추적하는 결정론적 운동학 예측기. */
export class HybridCameraMotionPredictor {
  private readonly config: MotionPredictorConfig;
  private rt: PredictorRuntimeState = createEmptyRuntimeState();

  constructor(overrides?: Partial<MotionPredictorConfig>) {
    this.config = resolvePredictorConfig(overrides);
  }

  /** 내부 필터 상태를 초기화한다. */
  public reset(): void {
    this.rt = createEmptyRuntimeState();
  }

  /** 새 뷰포트·펜 운동학 샘플을 필터에 반영하고 갱신된 상태를 반환한다. */
  public pushSample(sample: MotionKinematicsSample): ViewportKinematicsState {
    const rt = this.rt;
    const safePose: ViewportCameraPose2D = {
      panX: sanitizeFinite(sample.pose.panX, 0),
      panY: sanitizeFinite(sample.pose.panY, 0),
      zoom: clamp(sanitizeFinite(sample.pose.zoom, 1), this.config.minZoom, this.config.maxZoom),
      rotationRad: sanitizeFinite(sample.pose.rotationRad, 0),
      timestampMs: sanitizeFinite(sample.pose.timestampMs, 0),
    };
    if (sample.samplingRateHz !== undefined && Number.isFinite(sample.samplingRateHz) && sample.samplingRateHz > 0) {
      rt.reportedRateHz = sample.samplingRateHz;
    }

    if (rt.sampleCount === 0 || rt.lastRawPose === null) {
      rt.panX = createScalarChannel(safePose.panX);
      rt.panY = createScalarChannel(safePose.panY);
      rt.logZoom = createScalarChannel(Math.log(safePose.zoom));
      rt.unwrappedRotationRad = safePose.rotationRad;
      rt.rot = createScalarChannel(rt.unwrappedRotationRad);
      rt.lastRawPose = safePose;
      rt.sampleCount = 1;
      this.updatePenKinematics(sample.pen, REFERENCE_DT_SEC);
      return this.getKinematicsState();
    }

    const rawDtMs = safePose.timestampMs - rt.lastRawPose.timestampMs;
    if (rawDtMs <= 0) {
      rt.lastRawPose = safePose;
      this.updatePenKinematics(sample.pen, REFERENCE_DT_SEC);
      return this.getKinematicsState();
    }

    rt.maxSampleGapMs = Math.max(rt.maxSampleGapMs, rawDtMs);
    const dtSec = clamp(rawDtMs / 1000, MIN_DT_SEC, MAX_DT_SEC);
    rt.dtAccumSec += dtSec;
    rt.dtIntervalCount += 1;

    const prevVx = rt.panX ? rt.panX.velocity : 0;
    const prevVy = rt.panY ? rt.panY.velocity : 0;
    const instVx = (safePose.panX - rt.lastRawPose.panX) / dtSec;
    const instVy = (safePose.panY - rt.lastRawPose.panY) / dtSec;
    const prevSpeed = Math.hypot(prevVx, prevVy);
    const instSpeed = Math.hypot(instVx, instVy);

    if (prevSpeed > 40 && instSpeed > 40) {
      const cosTheta = (prevVx * instVx + prevVy * instVy) / (prevSpeed * instSpeed);
      rt.recentDirectionFlipPenalty =
        cosTheta < 0.25
          ? clamp(Math.max(rt.recentDirectionFlipPenalty * 0.72, clamp((0.25 - cosTheta) / 1.25, 0, 1)), 0, 1)
          : rt.recentDirectionFlipPenalty * 0.65;
    } else {
      rt.recentDirectionFlipPenalty *= 0.75;
    }

    const alphaEff = adaptSmoothingGain(this.config.alpha, dtSec);
    const betaEff = adaptSmoothingGain(this.config.beta, dtSec);
    const gammaEff = clamp(
      adaptSmoothingGain(this.config.gammaAccel, dtSec),
      0,
      (0.45 * alphaEff * betaEff) / Math.max(0.15, 2 - alphaEff),
    );
    rt.unwrappedRotationRad += wrapAngleDeltaRad(safePose.rotationRad - rt.lastRawPose.rotationRad);

    const idx = rt.sampleCount;
    if (rt.panX && rt.panY && rt.logZoom && rt.rot) {
      updateScalarChannel(rt.panX, safePose.panX, dtSec, idx, alphaEff, betaEff, gammaEff, this.config.maxLinearSpeedPxPerSec);
      updateScalarChannel(rt.panY, safePose.panY, dtSec, idx, alphaEff, betaEff, gammaEff, this.config.maxLinearSpeedPxPerSec);
      updateScalarChannel(rt.logZoom, Math.log(safePose.zoom), dtSec, idx, alphaEff, betaEff, gammaEff, this.config.maxLogZoomSpeedPerSec);
      updateScalarChannel(rt.rot, rt.unwrappedRotationRad, dtSec, idx, alphaEff, betaEff, gammaEff, this.config.maxAngularSpeedRadPerSec);
    }

    rt.lastRawPose = safePose;
    rt.sampleCount += 1;
    this.updatePenKinematics(sample.pen, dtSec);
    return this.getKinematicsState();
  }

  private updatePenKinematics(pen: PenKinematicsSample | undefined, fallbackDtSec: number): void {
    if (!pen) return;
    const rt = this.rt;
    const safePen: PenKinematicsSample = {
      x: sanitizeFinite(pen.x, 0),
      y: sanitizeFinite(pen.y, 0),
      pressure: clamp(sanitizeFinite(pen.pressure, 0), 0, 1),
      tiltXDeg: pen.tiltXDeg,
      tiltYDeg: pen.tiltYDeg,
      timestampMs: sanitizeFinite(pen.timestampMs, 0),
      isStrokeActive: pen.isStrokeActive,
    };
    if (rt.lastPenSample !== null) {
      const dtMs = safePen.timestampMs - rt.lastPenSample.timestampMs;
      const dtSec = dtMs > 0 ? clamp(dtMs / 1000, MIN_DT_SEC, MAX_DT_SEC) : fallbackDtSec;
      const limit = this.config.maxLinearSpeedPxPerSec;
      const smooth = adaptSmoothingGain(0.55, dtSec);
      const nextVx = rt.penVxPxPerSec + smooth * (clamp((safePen.x - rt.lastPenSample.x) / dtSec, -limit, limit) - rt.penVxPxPerSec);
      const nextVy = rt.penVyPxPerSec + smooth * (clamp((safePen.y - rt.lastPenSample.y) / dtSec, -limit, limit) - rt.penVyPxPerSec);
      rt.penAccelPxPerSec2 = (Math.hypot(nextVx, nextVy) - Math.hypot(rt.penVxPxPerSec, rt.penVyPxPerSec)) / dtSec;
      rt.penVxPxPerSec = nextVx;
      rt.penVyPxPerSec = nextVy;
    }
    rt.lastPenSample = safePen;
  }

  /** 현재 추적 중인 운동학 상태 스냅샷을 반환한다. */
  public getKinematicsState(): ViewportKinematicsState {
    const { panX, panY, logZoom, rot } = this.rt;
    const meanDtSec = this.rt.dtIntervalCount > 0 ? this.rt.dtAccumSec / this.rt.dtIntervalCount : REFERENCE_DT_SEC;
    const inferredSampleRateHz =
      this.rt.dtIntervalCount > 0 ? clamp(1 / Math.max(MIN_DT_SEC, meanDtSec), 15, 480) : (this.rt.reportedRateHz ?? 120);
    const jerkNorm =
      (panX && panY ? Math.hypot(panX.lastJerk, panY.lastJerk) / 25000 : 0) +
      (rot ? Math.abs(rot.lastJerk) / 80 : 0) +
      (logZoom ? Math.abs(logZoom.lastJerk) / 40 : 0) +
      this.rt.recentDirectionFlipPenalty * 3.5;

    return {
      smoothedPanX: panX ? panX.level : 0, smoothedPanY: panY ? panY.level : 0,
      smoothedLogZoom: logZoom ? logZoom.level : 0, smoothedRotationRad: rot ? rot.level : 0,
      vxPxPerSec: panX ? panX.velocity : 0, vyPxPerSec: panY ? panY.velocity : 0,
      vLogZoomPerSec: logZoom ? logZoom.velocity : 0, angularVelRadPerSec: rot ? rot.velocity : 0,
      axPxPerSec2: panX ? panX.acceleration : 0, ayPxPerSec2: panY ? panY.acceleration : 0,
      aLogZoomPerSec2: logZoom ? logZoom.acceleration : 0, angularAccRadPerSec2: rot ? rot.acceleration : 0,
      lastInnovationPx: panX && panY ? Math.hypot(panX.lastResidual, panY.lastResidual) : 0,
      jerkNorm,
      penSpeedPxPerSec: Math.hypot(this.rt.penVxPxPerSec, this.rt.penVyPxPerSec),
      penAccelPxPerSec2: this.rt.penAccelPxPerSec2,
      penVxPxPerSec: this.rt.penVxPxPerSec, penVyPxPerSec: this.rt.penVyPxPerSec,
      penLastX: this.rt.lastPenSample ? this.rt.lastPenSample.x : null,
      penLastY: this.rt.lastPenSample ? this.rt.lastPenSample.y : null,
      penActive: this.rt.lastPenSample ? this.rt.lastPenSample.isStrokeActive : false,
      inferredSampleRateHz, maxSampleGapMs: this.rt.maxSampleGapMs,
      sampleCount: this.rt.sampleCount,
      lastTimestampMs: this.rt.lastRawPose ? this.rt.lastRawPose.timestampMs : 0,
    };
  }

  /** 현재 상태로부터 적응형 리드타임과 예측 카메라 자세를 산출한다. */
  public predict(options?: { readonly targetLeadTimeMs?: number; readonly observedLatencyMs?: number }): PredictedViewportPoseResult {
    const state = this.getKinematicsState();
    const sourcePose: ViewportCameraPose2D = this.rt.lastRawPose ?? { panX: 0, panY: 0, zoom: 1, rotationRad: 0, timestampMs: 0 };
    const confidence = estimatePredictionConfidence(state, {
      minLeadTimeMs: this.config.minLeadTimeMs, maxLeadTimeMs: this.config.maxLeadTimeMs,
      baseLeadTimeMs: this.config.baseLeadTimeMs, observedLatencyMs: options?.observedLatencyMs,
    });
    const leadTimeMs =
      options?.targetLeadTimeMs !== undefined
        ? clamp(options.targetLeadTimeMs, this.config.minLeadTimeMs, this.config.maxLeadTimeMs)
        : confidence.recommendedLeadTimeMs;

    const tau = leadTimeMs / 1000;
    const isJerky = confidence.motionRegime === "turning-or-jerky";
    const accelScale = this.config.accelerationDamping * (isJerky ? 0.15 : clamp(confidence.confidence, 0.25, 1.0));
    const velScale = isJerky ? clamp(0.45 + 0.55 * confidence.confidence, 0.45, 0.9) : 1.0;

    const predictedPose: ViewportCameraPose2D = {
      panX: state.smoothedPanX + state.vxPxPerSec * velScale * tau + 0.5 * state.axPxPerSec2 * accelScale * tau * tau,
      panY: state.smoothedPanY + state.vyPxPerSec * velScale * tau + 0.5 * state.ayPxPerSec2 * accelScale * tau * tau,
      zoom: clamp(
        Math.exp(state.smoothedLogZoom + state.vLogZoomPerSec * velScale * tau + 0.5 * state.aLogZoomPerSec2 * accelScale * tau * tau),
        this.config.minZoom,
        this.config.maxZoom,
      ),
      rotationRad: state.smoothedRotationRad + state.angularVelRadPerSec * velScale * tau + 0.5 * state.angularAccRadPerSec2 * accelScale * tau * tau,
      timestampMs: sourcePose.timestampMs + leadTimeMs,
    };

    const penTau = Math.min(tau, 0.025);
    const predictedPenPoint: PredictedPenPoint2D | undefined =
      state.penLastX !== null && state.penLastY !== null
        ? {
            x: state.penLastX + state.penVxPxPerSec * velScale * penTau,
            y: state.penLastY + state.penVyPxPerSec * velScale * penTau,
            speedPxPerSec: state.penSpeedPxPerSec,
          }
        : undefined;

    return {
      predictedPose, sourcePose, leadTimeMs, kinematics: state, confidence, predictedPenPoint,
      extrapolationDelta: {
        dx: predictedPose.panX - sourcePose.panX,
        dy: predictedPose.panY - sourcePose.panY,
        zoomRatio: predictedPose.zoom / Math.max(EPSILON, sourcePose.zoom),
        dRotationRad: wrapAngleDeltaRad(predictedPose.rotationRad - sourcePose.rotationRad),
      },
    };
  }
}

/** 현재 운동학 상태의 예측 신뢰도(`0..1`)와 적응형 리드타임(`8..45ms`)을 계산한다. */
export function estimatePredictionConfidence(
  state: ViewportKinematicsState,
  options?: { readonly minLeadTimeMs?: number; readonly maxLeadTimeMs?: number; readonly baseLeadTimeMs?: number; readonly observedLatencyMs?: number },
): PredictionConfidenceReport {
  const minLead = clamp(options?.minLeadTimeMs ?? DEFAULT_MOTION_PREDICTOR_CONFIG.minLeadTimeMs, 8, 45);
  const maxLead = clamp(options?.maxLeadTimeMs ?? DEFAULT_MOTION_PREDICTOR_CONFIG.maxLeadTimeMs, minLead, 45);
  const baseLead = clamp(options?.baseLeadTimeMs ?? DEFAULT_MOTION_PREDICTOR_CONFIG.baseLeadTimeMs, minLead, maxLead);

  let sampleContinuity = state.sampleCount <= 1 ? 0.35 : state.sampleCount === 2 ? 0.72 : 1.0;
  if (state.maxSampleGapMs > 35) sampleContinuity *= 1 - clamp((state.maxSampleGapMs - 35) / 160, 0, 0.65);

  const samplingRateScore = clamp(0.55 + 0.45 * (state.inferredSampleRateHz / 240), 0.55, 1.0);
  const jerkStability = Math.exp(-0.55 * Math.max(0, state.jerkNorm));
  const linearSpeed = Math.hypot(state.vxPxPerSec, state.vyPxPerSec);
  const normalizedInnovation = state.lastInnovationPx / Math.max(6, linearSpeed / Math.max(30, state.inferredSampleRateHz));
  const innovationConsistency = Math.exp(-0.85 * Math.max(0, normalizedInnovation));
  const isPrecisionPen = state.penActive && state.penSpeedPxPerSec < 550 && linearSpeed < 200;
  const penPrecisionFactor = isPrecisionPen ? 0.65 : 1.0;

  const confidence = clamp(sampleContinuity * (0.38 * jerkStability + 0.34 * innovationConsistency + 0.28 * samplingRateScore), 0.05, 1.0);
  const angularSpeed = Math.abs(state.angularVelRadPerSec);
  const zoomSpeed = Math.abs(state.vLogZoomPerSec);
  const motionRegime: ViewportMotionRegime =
    jerkStability < 0.52 || normalizedInnovation > 1.25
      ? "turning-or-jerky"
      : isPrecisionPen
        ? "pen-precision"
        : linearSpeed < 15 && angularSpeed < 0.04 && zoomSpeed < 0.04
          ? "stationary"
          : linearSpeed > 900 || angularSpeed > 1.2 || zoomSpeed > 1.0
            ? "ballistic-gesture"
            : "steady-pan";

  const observed = options?.observedLatencyMs;
  const latencyDemandMs = observed !== undefined && Number.isFinite(observed) ? clamp(observed * 0.72, minLead, maxLead) : baseLead;
  const regimeMultiplier =
    motionRegime === "turning-or-jerky" ? 0.42
      : motionRegime === "pen-precision" ? 0.62
        : motionRegime === "ballistic-gesture" ? 1.22
          : motionRegime === "stationary" ? 0.75 : 1.0;

  const recommendedLeadTimeMs = clamp(
    minLead + (latencyDemandMs * regimeMultiplier * penPrecisionFactor - minLead) * (0.35 + 0.65 * confidence),
    minLead,
    maxLead,
  );
  return {
    confidence,
    recommendedLeadTimeMs,
    motionRegime,
    factors: { sampleContinuity, jerkStability, innovationConsistency, samplingRateScore, penPrecisionFactor },
  };
}

/** 뷰포트·펜 운동학 샘플 시퀀스로부터 다음 프레임 예측 카메라 자세를 산출하는 순수 함수형 진입점. */
export function predictViewportMotionPose(
  samples: readonly MotionKinematicsSample[],
  options?: PredictViewportMotionOptions,
): PredictedViewportPoseResult {
  const predictor = new HybridCameraMotionPredictor(options);
  for (let i = 0; i < samples.length; i += 1) {
    const sample = samples[i];
    if (sample !== undefined) predictor.pushSample(sample);
  }
  return predictor.predict({ targetLeadTimeMs: options?.targetLeadTimeMs, observedLatencyMs: options?.observedLatencyMs });
}

function det3x3(m: Matrix3x3): number {
  return (
    m[0] * (m[4] * m[8] - m[5] * m[7]) -
    m[1] * (m[3] * m[8] - m[5] * m[6]) +
    m[2] * (m[3] * m[7] - m[4] * m[6])
  );
}

/** 두 3×3 행렬의 곱 `A * B`를 계산한다. */
export function multiplyHomography2D(a: Matrix3x3, b: Matrix3x3): Matrix3x3 {
  return [
    a[0] * b[0] + a[1] * b[3] + a[2] * b[6], a[0] * b[1] + a[1] * b[4] + a[2] * b[7], a[0] * b[2] + a[1] * b[5] + a[2] * b[8],
    a[3] * b[0] + a[4] * b[3] + a[5] * b[6], a[3] * b[1] + a[4] * b[4] + a[5] * b[7], a[3] * b[2] + a[4] * b[5] + a[5] * b[8],
    a[6] * b[0] + a[7] * b[3] + a[8] * b[6], a[6] * b[1] + a[7] * b[4] + a[8] * b[7], a[6] * b[2] + a[7] * b[5] + a[8] * b[8],
  ];
}

/** 3×3 사영 호모그래피 행렬의 해석적 역행렬을 반환한다. 특이 행렬이면 단위 행렬을 반환한다. */
export function invertHomography2D(m: Matrix3x3): Matrix3x3 {
  const c00 = m[4] * m[8] - m[5] * m[7];
  const c01 = -(m[3] * m[8] - m[5] * m[6]);
  const c02 = m[3] * m[7] - m[4] * m[6];
  const det = m[0] * c00 + m[1] * c01 + m[2] * c02;
  if (!Number.isFinite(det) || Math.abs(det) < EPSILON) return IDENTITY_MATRIX_3X3;
  const inv = 1 / det;
  return [
    c00 * inv, -(m[1] * m[8] - m[2] * m[7]) * inv, (m[1] * m[5] - m[2] * m[4]) * inv,
    c01 * inv, (m[0] * m[8] - m[2] * m[6]) * inv, -(m[0] * m[5] - m[2] * m[3]) * inv,
    c02 * inv, -(m[0] * m[7] - m[1] * m[6]) * inv, (m[0] * m[4] - m[1] * m[3]) * inv,
  ];
}

/** 2D 점에 3×3 호모그래피 변환을 적용해 동차 투영 좌표를 반환한다. */
export function applyHomographyPoint2D(m: Matrix3x3, point: Point2D): ProjectedPoint2D {
  const x = m[0] * point.x + m[1] * point.y + m[2];
  const y = m[3] * point.x + m[4] * point.y + m[5];
  const w = m[6] * point.x + m[7] * point.y + m[8];
  return Math.abs(w) < EPSILON ? { x, y, w: 0 } : { x: x / w, y: y / w, w };
}

/** 호모그래피 행렬에서 배율, 회전각, 이동량, 사영 왜곡 크기 및 행렬식을 분해한다. */
export function decomposeHomographyMetrics(m: Matrix3x3): HomographyDecompositionMetrics {
  const norm = Math.abs(m[8]) > EPSILON ? m[8] : 1;
  const h00 = m[0] / norm;
  const h10 = m[3] / norm;
  return {
    scaleX: Math.hypot(h00, h10),
    scaleY: Math.hypot(m[1] / norm, m[4] / norm),
    rotationRad: Math.atan2(h10, h00),
    translationPx: { x: m[2] / norm, y: m[5] / norm },
    projectiveWarpMagnitude: Math.hypot(m[6] / norm, m[7] / norm),
    determinant: det3x3(m),
  };
}

/** 깊이 인자(물리 깊이 또는 정규화 깊이)로부터 시차 증폭 배율(`parallaxGain`)을 산출한다. */
export function resolveDepthParallaxGain(options?: ReprojectionHomographyOptions): number {
  const maxGain = clamp(options?.maxParallaxGain ?? 2.5, 1.0, 5.0);
  if (options?.parallaxScale !== undefined && Number.isFinite(options.parallaxScale)) {
    return clamp(options.parallaxScale, 0, maxGain);
  }
  if (options?.depthMeters !== undefined && Number.isFinite(options.depthMeters)) {
    const focus = Math.max(0.1, sanitizeFinite(options.focusDepthMeters ?? DEFAULT_FOCUS_DEPTH_METERS, DEFAULT_FOCUS_DEPTH_METERS));
    return clamp(focus / Math.max(0.15, options.depthMeters), 0.05, maxGain);
  }
  if (options?.depthNormalized !== undefined && Number.isFinite(options.depthNormalized)) {
    const d = clamp(options.depthNormalized, 0, 1);
    return clamp(d <= 0.5 ? 1.55 - 1.1 * d : 1.0 - 1.5 * (d - 0.5), 0.05, maxGain);
  }
  return 1.0;
}

/** 원본 렌더 자세(`sourcePose`) 픽셀을 목표(예측) 뷰포트 자세(`targetPose`)로 매핑하는 3×3 2D 재투영 호모그래피. */
export function computeReprojectionHomography2D(
  sourcePose: ViewportCameraPose2D,
  targetPose: ViewportCameraPose2D,
  options?: ReprojectionHomographyOptions,
): ReprojectionHomography2DResult {
  const pivotX = sanitizeFinite(options?.pivotX ?? 0, 0);
  const pivotY = sanitizeFinite(options?.pivotY ?? 0, 0);
  const zSrc = Math.max(0.005, sanitizeFinite(sourcePose.zoom, 1));
  const zDst = Math.max(0.005, sanitizeFinite(targetPose.zoom, 1));
  const scaleRatio = zDst / zSrc;
  const rotationDeltaRad = wrapAngleDeltaRad(sanitizeFinite(targetPose.rotationRad, 0) - sanitizeFinite(sourcePose.rotationRad, 0));
  const parallaxGain = resolveDepthParallaxGain(options);

  const cosDelta = Math.cos(rotationDeltaRad);
  const sinDelta = Math.sin(rotationDeltaRad);
  const panDeltaX = parallaxGain * (sanitizeFinite(sourcePose.panX, 0) - sanitizeFinite(targetPose.panX, 0));
  const panDeltaY = parallaxGain * (sanitizeFinite(sourcePose.panY, 0) - sanitizeFinite(targetPose.panY, 0));
  const targetRot = sanitizeFinite(targetPose.rotationRad, 0);
  const shiftScreenX = zDst * (Math.cos(targetRot) * panDeltaX - Math.sin(targetRot) * panDeltaY);
  const shiftScreenY = zDst * (Math.sin(targetRot) * panDeltaX + Math.cos(targetRot) * panDeltaY);

  const affineCentered: Matrix3x3 = [
    scaleRatio * cosDelta, -scaleRatio * sinDelta, shiftScreenX,
    scaleRatio * sinDelta, scaleRatio * cosDelta, shiftScreenY,
    0, 0, 1,
  ];
  const tiltX = sanitizeFinite(options?.perspectiveTiltX ?? 0, 0);
  const tiltY = sanitizeFinite(options?.perspectiveTiltY ?? 0, 0);
  const isProjective = Math.abs(tiltX) > EPSILON || Math.abs(tiltY) > EPSILON;
  const centered = isProjective ? multiplyHomography2D([1, 0, 0, 0, 1, 0, tiltX, tiltY, 1], affineCentered) : affineCentered;
  const matrix = multiplyHomography2D(
    [1, 0, pivotX, 0, 1, pivotY, 0, 0, 1],
    multiplyHomography2D(centered, [1, 0, -pivotX, 0, 1, -pivotY, 0, 0, 1]),
  );

  let maxCornerDisplacementPx = Math.hypot(shiftScreenX, shiftScreenY);
  const vw = options?.viewportWidth;
  const vh = options?.viewportHeight;
  if (vw !== undefined && vh !== undefined && vw > 0 && vh > 0) {
    const corners: readonly Point2D[] = [{ x: 0, y: 0 }, { x: vw, y: 0 }, { x: vw, y: vh }, { x: 0, y: vh }];
    let worst = 0;
    for (let i = 0; i < corners.length; i += 1) {
      const corner = corners[i];
      if (!corner) continue;
      const mapped = applyHomographyPoint2D(matrix, corner);
      const disp = Math.hypot(mapped.x - corner.x, mapped.y - corner.y);
      if (disp > worst) worst = disp;
    }
    maxCornerDisplacementPx = worst;
  }

  return {
    matrix,
    inverseMatrix: invertHomography2D(matrix),
    scaleRatio,
    rotationDeltaRad,
    translationDeltaPx: { x: shiftScreenX, y: shiftScreenY },
    parallaxGain,
    isProjective,
    determinant: det3x3(matrix),
    maxCornerDisplacementPx,
  };
}
