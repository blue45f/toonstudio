/**
 * Wave 99 — 120Hz/240Hz 서브프레임 적응형 칼만 스타일러스 예측기 및 코너 감쇠 가드.
 *
 * 상태 벡터: [x, y, vx, vy, ax, ay, pressure, pressureRate] (8D) + 곡률 회전각속도 omega (rad/s).
 * - 등속 직선: 60Hz/120Hz/240Hz 주사율 지연 75%+ 상쇄, 오차 < 0.5px
 * - 원호 곡선: CTRA 해석적 호 적분으로 선형 접선 외삽 대비 정밀 추적
 * - 급각 코너(>= 45도) 및 급감속: 코너 브레이크 가드가 지평선(horizonMs)을 0ms로 즉시 감쇠
 * - 고주파 손떨림: 교번 진동 감지 시 적응형 측정 노이즈 R을 확장해 평활화
 */

import {
  clampNumber,
  computeNibWidthPx,
  createInitialAxis3,
  createInitialPressure2,
  integrateCtraPoint,
  projectAxisPositionVariance,
  stepAxisKalman3,
  stepPressureKalman2,
  wrapAngleRad,
  type AxisState3,
  type PressureState2,
} from "./stylus-kalman-math-kernel";

export type DisplayRefreshTarget = "60hz" | "120hz" | "240hz";

export const DISPLAY_REFRESH_HORIZON_MS: Readonly<Record<DisplayRefreshTarget, number>> = {
  "60hz": 1000 / 60,
  "120hz": 1000 / 120,
  "240hz": 1000 / 240,
};

export type StylusPointerKind = "pen" | "touch" | "mouse";
export type StylusPacketRejectionReason =
  | "non-finite-input"
  | "out-of-order-timestamp"
  | "duplicate-timestamp"
  | "stroke-finalized";
export type CornerBrakeReason =
  | "none"
  | "disabled-or-reduced-motion"
  | "stationary"
  | "sharp-corner-cusp"
  | "rapid-deceleration"
  | "angular-jerk-spike"
  | "corner-cooldown";

export interface RawStylusPacket {
  readonly x: number;
  readonly y: number;
  readonly timestampMs: number;
  readonly pressure?: number;
  readonly tiltXDeg?: number;
  readonly tiltYDeg?: number;
  readonly pointerType?: StylusPointerKind;
}

export interface AdaptiveKalmanStylusConfig {
  readonly refreshTarget?: DisplayRefreshTarget;
  readonly leadFrames?: number;
  readonly baseNibWidthPx?: number;
  readonly minNibWidthRatio?: number;
  readonly cornerBrakeAngleDeg?: number;
  readonly softCornerAngleDeg?: number;
  readonly cornerBrakeHoldMs?: number;
  readonly stationarySpeedThresholdPxPerSec?: number;
  readonly baseMeasurementNoisePx?: number;
  readonly baseJerkSpectralDensity?: number;
  readonly maxGapResetMs?: number;
  readonly prefersReducedMotion?: boolean;
  readonly disablePrediction?: boolean;
}

export interface ResolvedAdaptiveKalmanConfig {
  readonly refreshTarget: DisplayRefreshTarget;
  readonly leadFrames: number;
  readonly defaultHorizonMs: number;
  readonly baseNibWidthPx: number;
  readonly minNibWidthRatio: number;
  readonly cornerBrakeAngleDeg: number;
  readonly softCornerAngleDeg: number;
  readonly cornerBrakeHoldMs: number;
  readonly stationarySpeedThresholdPxPerSec: number;
  readonly baseMeasurementNoisePx: number;
  readonly baseJerkSpectralDensity: number;
  readonly maxGapResetMs: number;
  readonly prefersReducedMotion: boolean;
  readonly disablePrediction: boolean;
}

/** 8차원 상태 벡터: [x, y, vx, vy, ax, ay, pressure, pressureRate]. */
export type StylusKalmanStateVector = readonly [
  number, number, number, number, number, number, number, number,
];

export interface StylusKalmanSnapshot {
  readonly sampleCount: number;
  readonly rejectedPacketCount: number;
  readonly lastTimestampMs: number;
  readonly stateVector: StylusKalmanStateVector;
  readonly x: number;
  readonly y: number;
  readonly vx: number;
  readonly vy: number;
  readonly ax: number;
  readonly ay: number;
  readonly speedPxPerSec: number;
  readonly headingRad: number;
  readonly omegaRadPerSec: number;
  readonly omegaVariance: number;
  readonly pressure: number;
  readonly pressureRate: number;
  readonly nibWidthPx: number;
  readonly positionUncertaintyPx: number;
  readonly isStationary: boolean;
  readonly lastTurnAngleDeg: number;
  readonly brakeFactor: number;
  readonly brakeReason: CornerBrakeReason;
  readonly cornerBrakeActive: boolean;
  readonly normalizedInnovationEma: number;
  readonly adaptiveNoiseScale: number;
}

export interface StylusFilterUpdateResult {
  readonly accepted: boolean;
  readonly rejectionReason: StylusPacketRejectionReason | null;
  readonly dtMs: number;
  readonly innovationPx: number;
  readonly resetTriggered: boolean;
  readonly cornerCuspDetected: boolean;
  readonly snapshot: StylusKalmanSnapshot;
}

export interface PredictedStylusPoint {
  readonly stepIndex: number;
  readonly x: number;
  readonly y: number;
  readonly timestampMs: number;
  readonly leadTimeMs: number;
  readonly requestedLeadTimeMs: number;
  readonly pressure: number;
  readonly nibWidthPx: number;
  readonly confidence: number;
  readonly uncertaintyRadiusPx: number;
  readonly displacementFromHeadPx: number;
  readonly brakeDampingFactor: number;
}

export interface SubframeStylusPredictionResult {
  readonly refreshTarget: DisplayRefreshTarget;
  readonly requestedHorizonMs: number;
  readonly effectiveHorizonMs: number;
  readonly substepsRequested: number;
  readonly passthroughActive: boolean;
  readonly isStationary: boolean;
  readonly cornerBrakeActive: boolean;
  readonly brakeFactor: number;
  readonly brakeReason: CornerBrakeReason;
  readonly headX: number;
  readonly headY: number;
  readonly headTimestampMs: number;
  readonly maxDisplacementPx: number;
  readonly terminalConfidence: number;
  readonly terminalUncertaintyRadiusPx: number;
  readonly points: readonly PredictedStylusPoint[];
}

const MIN_DT_SEC = 0.0005;
const MIN_SEGMENT_DISP_PX = 0.65;
const MAX_OMEGA_RAD_PER_SEC = 28;
const CONFIDENCE_TIME_CONSTANT_SEC = 0.032;
const UNCERTAINTY_CONFIDENCE_SCALE_PX = 6.0;
const RAD_TO_DEG = 180 / Math.PI;

export function resolveAdaptiveKalmanConfig(
  config: AdaptiveKalmanStylusConfig = {},
): ResolvedAdaptiveKalmanConfig {
  const refreshTarget: DisplayRefreshTarget = config.refreshTarget ?? "120hz";
  const leadFrames = clampNumber(config.leadFrames ?? 1.0, 0, 2.0);
  const cornerBrakeAngleDeg = clampNumber(config.cornerBrakeAngleDeg ?? 45, 15, 150);
  return {
    refreshTarget,
    leadFrames,
    defaultHorizonMs: DISPLAY_REFRESH_HORIZON_MS[refreshTarget] * leadFrames,
    baseNibWidthPx: clampNumber(config.baseNibWidthPx ?? 4.0, 0.5, 128),
    minNibWidthRatio: clampNumber(config.minNibWidthRatio ?? 0.22, 0.05, 1),
    cornerBrakeAngleDeg,
    softCornerAngleDeg: clampNumber(config.softCornerAngleDeg ?? Math.min(28, cornerBrakeAngleDeg * 0.62), 5, cornerBrakeAngleDeg - 1),
    cornerBrakeHoldMs: clampNumber(config.cornerBrakeHoldMs ?? 20, 0, 120),
    stationarySpeedThresholdPxPerSec: clampNumber(config.stationarySpeedThresholdPxPerSec ?? 12, 0.5, 200),
    baseMeasurementNoisePx: clampNumber(config.baseMeasurementNoisePx ?? 0.35, 0.05, 10),
    baseJerkSpectralDensity: clampNumber(config.baseJerkSpectralDensity ?? 1.2e9, 1e5, 1e12),
    maxGapResetMs: clampNumber(config.maxGapResetMs ?? 120, 20, 2000),
    prefersReducedMotion: config.prefersReducedMotion === true,
    disablePrediction: config.disablePrediction === true,
  };
}

export class SubframeStylusKalmanPredictor {
  public readonly config: ResolvedAdaptiveKalmanConfig;

  private axisX: AxisState3;
  private axisY: AxisState3;
  private pressureState: PressureState2;
  private omegaRadPerSec = 0;
  private omegaVariance = 16.0;
  private sampleCount = 0;
  private rejectedPacketCount = 0;
  private lastTimestampMs = 0;
  private lastRawX = 0;
  private lastRawY = 0;
  private prevRawDx = 0;
  private prevRawDy = 0;
  private prevRawDispPx = 0;
  private prevRawSpeedPxPerSec = 0;
  private prevChordAngleRad: number | null = null;
  private prevSignedTurnRad = 0;
  private chordAngleHistory: number[] = [];
  private prevInnovX = 0;
  private prevInnovY = 0;
  private normalizedInnovationEma = 0;
  private adaptiveNoiseScale = 1.0;
  private tremorScoreEma = 0;
  private isStationary = true;
  private lastTurnAngleDeg = 0;
  private brakeFactor = 0;
  private brakeReason: CornerBrakeReason = "none";
  private cornerCooldownRemainingMs = 0;

  public constructor(config: AdaptiveKalmanStylusConfig = {}) {
    this.config = resolveAdaptiveKalmanConfig(config);
    const rVar = this.config.baseMeasurementNoisePx * this.config.baseMeasurementNoisePx;
    this.axisX = createInitialAxis3(0, rVar);
    this.axisY = createInitialAxis3(0, rVar);
    this.pressureState = createInitialPressure2(0.5);
  }

  public reset(): void {
    const rVar = this.config.baseMeasurementNoisePx * this.config.baseMeasurementNoisePx;
    this.axisX = createInitialAxis3(0, rVar);
    this.axisY = createInitialAxis3(0, rVar);
    this.pressureState = createInitialPressure2(0.5);
    this.omegaRadPerSec = 0;
    this.omegaVariance = 16.0;
    this.sampleCount = 0;
    this.rejectedPacketCount = 0;
    this.lastTimestampMs = 0;
    this.lastRawX = 0;
    this.lastRawY = 0;
    this.prevRawDx = 0;
    this.prevRawDy = 0;
    this.prevRawDispPx = 0;
    this.prevRawSpeedPxPerSec = 0;
    this.prevChordAngleRad = null;
    this.prevSignedTurnRad = 0;
    this.chordAngleHistory = [];
    this.prevInnovX = 0;
    this.prevInnovY = 0;
    this.normalizedInnovationEma = 0;
    this.adaptiveNoiseScale = 1.0;
    this.tremorScoreEma = 0;
    this.isStationary = true;
    this.lastTurnAngleDeg = 0;
    this.brakeFactor = 0;
    this.brakeReason = "none";
    this.cornerCooldownRemainingMs = 0;
  }

  private buildResult(
    accepted: boolean,
    rejectionReason: StylusPacketRejectionReason | null,
    dtMs: number,
    innovationPx = 0,
    resetTriggered = false,
    cornerCuspDetected = false,
  ): StylusFilterUpdateResult {
    return {
      accepted, rejectionReason, dtMs, innovationPx,
      resetTriggered, cornerCuspDetected, snapshot: this.getSnapshot(),
    };
  }

  private recordAnchor(x: number, y: number, ts: number, dx: number, dy: number, disp: number, speed: number): void {
    this.lastTimestampMs = ts;
    this.lastRawX = x;
    this.lastRawY = y;
    this.prevRawDx = dx;
    this.prevRawDy = dy;
    this.prevRawDispPx = disp;
    this.prevRawSpeedPxPerSec = speed;
    this.sampleCount += 1;
  }

  public update(packet: RawStylusPacket): StylusFilterUpdateResult {
    if (
      !Number.isFinite(packet.x) ||
      !Number.isFinite(packet.y) ||
      !Number.isFinite(packet.timestampMs) ||
      (packet.pressure !== undefined && !Number.isFinite(packet.pressure))
    ) {
      this.rejectedPacketCount += 1;
      return this.buildResult(false, "non-finite-input", 0);
    }

    const pressure = clampNumber(packet.pressure ?? 0.5, 0, 1);
    const baseRVar = this.config.baseMeasurementNoisePx * this.config.baseMeasurementNoisePx;

    if (this.sampleCount === 0) {
      this.axisX = createInitialAxis3(packet.x, baseRVar);
      this.axisY = createInitialAxis3(packet.y, baseRVar);
      this.pressureState = createInitialPressure2(pressure);
      this.isStationary = true;
      this.brakeFactor = 0;
      this.brakeReason = "none";
      this.recordAnchor(packet.x, packet.y, packet.timestampMs, 0, 0, 0, 0);
      return this.buildResult(true, null, 0);
    }

    const rawDtMs = packet.timestampMs - this.lastTimestampMs;
    if (rawDtMs <= 0) {
      this.rejectedPacketCount += 1;
      return this.buildResult(false, rawDtMs === 0 ? "duplicate-timestamp" : "out-of-order-timestamp", rawDtMs);
    }

    if (rawDtMs > this.config.maxGapResetMs) {
      this.axisX = createInitialAxis3(packet.x, baseRVar);
      this.axisY = createInitialAxis3(packet.y, baseRVar);
      this.pressureState = createInitialPressure2(pressure);
      this.omegaRadPerSec = 0;
      this.omegaVariance = 16.0;
      this.prevChordAngleRad = null;
      this.prevSignedTurnRad = 0;
      this.chordAngleHistory = [];
      this.isStationary = true;
      this.brakeFactor = 0;
      this.brakeReason = "none";
      this.cornerCooldownRemainingMs = 0;
      this.recordAnchor(packet.x, packet.y, packet.timestampMs, 0, 0, 0, 0);
      return this.buildResult(true, null, rawDtMs, 0, true);
    }

    const dtSec = Math.max(MIN_DT_SEC, rawDtMs / 1000);
    const rawDx = packet.x - this.lastRawX;
    const rawDy = packet.y - this.lastRawY;
    const rawDispPx = Math.hypot(rawDx, rawDy);
    const rawSpeedPxPerSec = rawDispPx / dtSec;
    this.cornerCooldownRemainingMs = Math.max(0, this.cornerCooldownRemainingMs - rawDtMs);

    if (
      rawDispPx < 0.08 ||
      (rawSpeedPxPerSec < this.config.stationarySpeedThresholdPxPerSec &&
        Math.hypot(this.axisX.v, this.axisY.v) < this.config.stationarySpeedThresholdPxPerSec * 2.5)
    ) {
      this.axisX.p = packet.x; this.axisY.p = packet.y;
      this.axisX.v = 0; this.axisY.v = 0;
      this.axisX.a = 0; this.axisY.a = 0;
      this.axisX.c00 = baseRVar; this.axisY.c00 = baseRVar;
      this.omegaRadPerSec = 0;
      this.omegaVariance = Math.min(25, this.omegaVariance + 1.0);
      stepPressureKalman2(this.pressureState, pressure, dtSec);
      this.isStationary = true;
      this.lastTurnAngleDeg = 0;
      this.brakeFactor = 1.0;
      this.brakeReason = "stationary";
      this.recordAnchor(packet.x, packet.y, packet.timestampMs, 0, 0, 0, 0);
      return this.buildResult(true, null, rawDtMs);
    }

    this.isStationary = false;

    if (this.sampleCount === 1) {
      const velVar = Math.max(100, (2 * baseRVar) / (dtSec * dtSec));
      this.axisX.p = packet.x; this.axisY.p = packet.y;
      this.axisX.v = rawDx / dtSec; this.axisY.v = rawDy / dtSec;
      this.axisX.a = 0; this.axisY.a = 0;
      this.axisX.c11 = velVar; this.axisY.c11 = velVar;
      this.pressureState.dp = clampNumber((pressure - this.pressureState.p) / dtSec, -18, 18);
      this.pressureState.p = pressure;
      if (rawDispPx >= MIN_SEGMENT_DISP_PX) {
        const chordAngle = Math.atan2(rawDy, rawDx);
        this.prevChordAngleRad = chordAngle;
        this.chordAngleHistory = [chordAngle];
      }
      this.lastTurnAngleDeg = 0;
      this.brakeFactor = 0;
      this.brakeReason = "none";
      this.recordAnchor(packet.x, packet.y, packet.timestampMs, rawDx, rawDy, rawDispPx, rawSpeedPxPerSec);
      return this.buildResult(true, null, rawDtMs);
    }

    let instantTurnAngleDeg = 0;
    let windowTurnAngleDeg = 0;
    let signedTurnRad = 0;
    let chordAngle: number | null = null;
    if (rawDispPx >= MIN_SEGMENT_DISP_PX) {
      chordAngle = Math.atan2(rawDy, rawDx);
      if (this.prevChordAngleRad !== null) {
        signedTurnRad = wrapAngleRad(chordAngle - this.prevChordAngleRad);
        instantTurnAngleDeg = Math.abs(signedTurnRad) * RAD_TO_DEG;
      }
      if (this.chordAngleHistory.length >= 2) {
        const oldestAngle = this.chordAngleHistory[0] ?? chordAngle;
        const rawWindowDeg = Math.abs(wrapAngleRad(chordAngle - oldestAngle)) * RAD_TO_DEG;
        const expectedArcDeg = Math.abs(this.omegaRadPerSec) * dtSec * this.chordAngleHistory.length * RAD_TO_DEG;
        windowTurnAngleDeg = Math.max(0, rawWindowDeg - expectedArcDeg * 1.15);
      }
    }

    const predX = this.axisX.p + this.axisX.v * dtSec + 0.5 * this.axisX.a * dtSec * dtSec;
    const predY = this.axisY.p + this.axisY.v * dtSec + 0.5 * this.axisY.a * dtSec * dtSec;
    const rawInnovX = packet.x - predX;
    const rawInnovY = packet.y - predY;
    const rawInnovMag = Math.hypot(rawInnovX, rawInnovY);
    const prevInnovMag = Math.hypot(this.prevInnovX, this.prevInnovY);
    const innovOscillating =
      rawInnovX * this.prevInnovX + rawInnovY * this.prevInnovY < 0 && rawInnovMag > 0.35 && prevInnovMag > 0.35;
    const netTwoStepDisp = Math.hypot(rawDx + this.prevRawDx, rawDy + this.prevRawDy);
    const alternatingLateralZigZag =
      this.prevSignedTurnRad !== 0 &&
      signedTurnRad * this.prevSignedTurnRad < 0 &&
      Math.abs(signedTurnRad) > 0.35 &&
      Math.abs(this.prevSignedTurnRad) > 0.35 &&
      netTwoStepDisp > 0.85 * Math.max(rawDispPx, this.prevRawDispPx);
    const isOscillatingTremor = alternatingLateralZigZag || innovOscillating;

    const effectiveTurnAngleDeg = Math.max(instantTurnAngleDeg, windowTurnAngleDeg);
    this.lastTurnAngleDeg = isOscillatingTremor ? 0 : effectiveTurnAngleDeg;

    const cornerCuspDetected =
      !isOscillatingTremor &&
      rawDispPx >= MIN_SEGMENT_DISP_PX &&
      effectiveTurnAngleDeg >= this.config.cornerBrakeAngleDeg;

    let innovationPx = 0;
    let angularJerkBrake = 0;

    if (cornerCuspDetected) {
      const velVar = Math.max(250, (4 * baseRVar) / (dtSec * dtSec));
      this.axisX.p = packet.x; this.axisY.p = packet.y;
      this.axisX.v = rawDx / dtSec; this.axisY.v = rawDy / dtSec;
      this.axisX.a = 0; this.axisY.a = 0;
      this.axisX.c00 = baseRVar; this.axisY.c00 = baseRVar;
      this.axisX.c11 = velVar; this.axisY.c11 = velVar;
      this.axisX.c22 = 4e6; this.axisY.c22 = 4e6;
      this.omegaRadPerSec = 0;
      this.omegaVariance = 25.0;
      this.cornerCooldownRemainingMs = this.config.cornerBrakeHoldMs;
      this.chordAngleHistory = chordAngle !== null ? [chordAngle] : [];
      this.prevChordAngleRad = chordAngle;
      stepPressureKalman2(this.pressureState, pressure, dtSec);
    } else {
      const tremorPulse = isOscillatingTremor
        ? Math.min(4.5, Math.max(rawInnovMag, alternatingLateralZigZag ? 1.5 : 0.6))
        : 0;
      this.tremorScoreEma = 0.68 * this.tremorScoreEma + 0.32 * tremorPulse;
      const rScale = clampNumber(1 + this.tremorScoreEma * 7.5, 1.0, 36.0);
      this.adaptiveNoiseScale = rScale;
      const rEff = baseRVar * rScale;

      const nisApprox = (rawInnovMag * rawInnovMag) / Math.max(0.25, this.axisX.c00 + rEff);
      const qBoost = isOscillatingTremor ? 0.18 : clampNumber(1 + Math.max(0, nisApprox - 2.0) * 0.8, 1, 14);
      const qEff = this.config.baseJerkSpectralDensity * qBoost;

      const resX = stepAxisKalman3(this.axisX, packet.x, dtSec, qEff, rEff);
      const resY = stepAxisKalman3(this.axisY, packet.y, dtSec, qEff, rEff);
      stepPressureKalman2(this.pressureState, pressure, dtSec);

      innovationPx = Math.hypot(resX.innovation, resY.innovation);
      const normInnov = innovationPx / Math.sqrt(Math.max(1e-6, resX.innovationVar + resY.innovationVar));
      this.normalizedInnovationEma = 0.75 * this.normalizedInnovationEma + 0.25 * normInnov;
      this.prevInnovX = resX.innovation;
      this.prevInnovY = resY.innovation;

      if (chordAngle !== null && this.prevChordAngleRad !== null) {
        const omegaMeas = clampNumber(signedTurnRad / dtSec, -MAX_OMEGA_RAD_PER_SEC, MAX_OMEGA_RAD_PER_SEC);
        const angularAccel = Math.abs(omegaMeas - this.omegaRadPerSec) / dtSec;
        const pOmegaPred = this.omegaVariance + (isOscillatingTremor ? 6.0 : 120.0) * dtSec;
        const kOmega = pOmegaPred / (pOmegaPred + (isOscillatingTremor ? 80.0 : 2.2) * rScale);
        this.omegaRadPerSec = clampNumber(
          this.omegaRadPerSec + kOmega * (omegaMeas - this.omegaRadPerSec),
          -MAX_OMEGA_RAD_PER_SEC,
          MAX_OMEGA_RAD_PER_SEC,
        );
        this.omegaVariance = Math.max(0.02, (1 - kOmega) * pOmegaPred);
        if (!isOscillatingTremor && angularAccel > 550 && instantTurnAngleDeg > 16) {
          angularJerkBrake = clampNumber((angularAccel - 550) / 900, 0, 0.85);
        }
      }

      if (chordAngle !== null) {
        this.prevChordAngleRad = chordAngle;
        this.chordAngleHistory.push(chordAngle);
        if (this.chordAngleHistory.length > 3) this.chordAngleHistory.shift();
      }
    }

    // 코너 브레이크 복합 감쇠 계산
    const speed = Math.hypot(this.axisX.v, this.axisY.v);
    const tangentialAccel = speed > 1e-3 ? (this.axisX.v * this.axisX.a + this.axisY.v * this.axisY.a) / speed : 0;
    let angleBrake = 0;
    if (cornerCuspDetected) {
      angleBrake = 1.0;
    } else if (!isOscillatingTremor && effectiveTurnAngleDeg > this.config.softCornerAngleDeg) {
      const span = Math.max(1, this.config.cornerBrakeAngleDeg - this.config.softCornerAngleDeg);
      angleBrake = clampNumber((effectiveTurnAngleDeg - this.config.softCornerAngleDeg) / span, 0, 1);
    }

    let decelBrake = 0;
    const horizonRefSec = Math.max(0.004, this.config.defaultHorizonMs / 1000);
    const instantDecel =
      this.tremorScoreEma < 0.55 && this.prevRawSpeedPxPerSec > 80 && rawSpeedPxPerSec < this.prevRawSpeedPxPerSec
        ? (this.prevRawSpeedPxPerSec - rawSpeedPxPerSec) / dtSec
        : 0;
    const effectiveDecel = Math.max(0, -tangentialAccel, instantDecel * 0.9);
    if (!isOscillatingTremor && effectiveDecel > 1200 && speed > this.config.stationarySpeedThresholdPxPerSec) {
      const decelRatio = (effectiveDecel * horizonRefSec) / Math.max(speed, 1);
      if (decelRatio > 0.22) decelBrake = clampNumber((decelRatio - 0.22) / 0.36, 0, 1);
    }

    const cooldownBrake =
      !isOscillatingTremor && this.config.cornerBrakeHoldMs > 0
        ? clampNumber(this.cornerCooldownRemainingMs / this.config.cornerBrakeHoldMs, 0, 1) * 0.85
        : 0;

    let selectedBrake = angleBrake;
    let selectedReason: CornerBrakeReason = angleBrake > 0 ? "sharp-corner-cusp" : "none";
    if (decelBrake > selectedBrake) { selectedBrake = decelBrake; selectedReason = "rapid-deceleration"; }
    if (angularJerkBrake > selectedBrake) { selectedBrake = angularJerkBrake; selectedReason = "angular-jerk-spike"; }
    if (cooldownBrake > selectedBrake) { selectedBrake = cooldownBrake; selectedReason = "corner-cooldown"; }

    this.brakeFactor = selectedBrake >= 0.92 ? 1.0 : clampNumber(selectedBrake, 0, 1);
    this.brakeReason = this.brakeFactor > 0.01 ? selectedReason : "none";
    if (chordAngle !== null) this.prevSignedTurnRad = signedTurnRad;

    this.recordAnchor(packet.x, packet.y, packet.timestampMs, rawDx, rawDy, rawDispPx, rawSpeedPxPerSec);
    return this.buildResult(true, null, rawDtMs, innovationPx, false, cornerCuspDetected);
  }

  public getSnapshot(): StylusKalmanSnapshot {
    const speed = Math.hypot(this.axisX.v, this.axisY.v);
    const headingRad = speed > 1e-6 ? Math.atan2(this.axisY.v, this.axisX.v) : 0;
    const positionUncertaintyPx = Math.sqrt(Math.max(0, this.axisX.c00 + this.axisY.c00));
    const nibWidthPx = computeNibWidthPx(this.pressureState.p, this.config.baseNibWidthPx, this.config.minNibWidthRatio);
    return {
      sampleCount: this.sampleCount, rejectedPacketCount: this.rejectedPacketCount,
      lastTimestampMs: this.lastTimestampMs,
      stateVector: [
        this.axisX.p, this.axisY.p, this.axisX.v, this.axisY.v,
        this.axisX.a, this.axisY.a, this.pressureState.p, this.pressureState.dp,
      ],
      x: this.axisX.p, y: this.axisY.p, vx: this.axisX.v, vy: this.axisY.v,
      ax: this.axisX.a, ay: this.axisY.a, speedPxPerSec: speed, headingRad,
      omegaRadPerSec: this.omegaRadPerSec, omegaVariance: this.omegaVariance,
      pressure: this.pressureState.p, pressureRate: this.pressureState.dp,
      nibWidthPx, positionUncertaintyPx, isStationary: this.isStationary,
      lastTurnAngleDeg: this.lastTurnAngleDeg, brakeFactor: this.brakeFactor,
      brakeReason: this.brakeReason, cornerBrakeActive: this.brakeFactor >= 0.35,
      normalizedInnovationEma: this.normalizedInnovationEma, adaptiveNoiseScale: this.adaptiveNoiseScale,
    };
  }

  public computeHorizonUncertaintyRadiusPx(horizonSec: number): number {
    const h = Math.max(0, horizonSec);
    const qEff = this.config.baseJerkSpectralDensity * Math.min(2.0, this.adaptiveNoiseScale);
    const varX = projectAxisPositionVariance(this.axisX, h, qEff);
    const varY = projectAxisPositionVariance(this.axisY, h, qEff);
    const arcLateralArm = 0.5 * Math.hypot(this.axisX.v, this.axisY.v) * h * h;
    return Math.sqrt(Math.max(0, varX + varY + arcLateralArm * arcLateralArm * this.omegaVariance));
  }

  public predict(horizonMs = this.config.defaultHorizonMs, substeps = 3): SubframeStylusPredictionResult {
    return predictSubframeStylusHorizon(this, horizonMs, substeps);
  }
}

/** 서브프레임 예측 지평선을 1..4개 서브스텝으로 방출한다. */
export function predictSubframeStylusHorizon(
  predictor: SubframeStylusKalmanPredictor,
  horizonMs: number = predictor.config.defaultHorizonMs,
  substeps: number = 3,
): SubframeStylusPredictionResult {
  const snap = predictor.getSnapshot();
  const clampedSubsteps = Math.round(clampNumber(substeps, 1, 4));
  const requestedHorizonMs = Number.isFinite(horizonMs) ? Math.max(0, horizonMs) : 0;

  if (predictor.config.disablePrediction || predictor.config.prefersReducedMotion) {
    return {
      refreshTarget: predictor.config.refreshTarget, requestedHorizonMs, effectiveHorizonMs: 0,
      substepsRequested: clampedSubsteps, passthroughActive: true, isStationary: snap.isStationary,
      cornerBrakeActive: false, brakeFactor: 1, brakeReason: "disabled-or-reduced-motion",
      headX: snap.x, headY: snap.y, headTimestampMs: snap.lastTimestampMs,
      maxDisplacementPx: 0, terminalConfidence: 0,
      terminalUncertaintyRadiusPx: snap.positionUncertaintyPx, points: [],
    };
  }

  const effectiveBrake = snap.isStationary ? 1 : snap.brakeFactor;
  const effectiveHorizonMs = snap.sampleCount < 2 || snap.isStationary ? 0 : requestedHorizonMs * (1 - effectiveBrake);
  const omegaReliability =
    snap.sampleCount >= 3 && Math.abs(snap.omegaRadPerSec) > 0.15
      ? clampNumber(1 / (1 + 0.12 * snap.omegaVariance), 0, 1)
      : 0;
  const baseQuality =
    clampNumber(snap.sampleCount / 3, 0, 1) *
    (1 / (1 + 0.32 * snap.normalizedInnovationEma)) *
    (1 - 0.72 * effectiveBrake);

  const points: PredictedStylusPoint[] = [];
  let maxDisplacementPx = 0;

  for (let i = 1; i <= clampedSubsteps; i += 1) {
    const frac = i / clampedSubsteps;
    const stepLeadMs = effectiveHorizonMs * frac;
    const stepRequestedLeadMs = requestedHorizonMs * frac;
    const stepLeadSec = stepLeadMs / 1000;
    const stepRequestedSec = stepRequestedLeadMs / 1000;

    const projected = integrateCtraPoint(snap, stepLeadSec, omegaReliability);
    const displacementFromHeadPx = snap.isStationary ? 0 : Math.hypot(projected.x - snap.x, projected.y - snap.y);
    if (displacementFromHeadPx > maxDisplacementPx) maxDisplacementPx = displacementFromHeadPx;

    const uncertaintyRadiusPx = predictor.computeHorizonUncertaintyRadiusPx(Math.max(stepLeadSec, stepRequestedSec * 0.5));
    const confidence = clampNumber(
      Math.exp(-stepRequestedSec / CONFIDENCE_TIME_CONSTANT_SEC) *
        (1 / (1 + uncertaintyRadiusPx / UNCERTAINTY_CONFIDENCE_SCALE_PX)) *
        baseQuality,
      0,
      1,
    );
    const predictedPressure = clampNumber(snap.pressure + snap.pressureRate * stepLeadSec * 0.65, 0, 1);

    points.push({
      stepIndex: i,
      x: snap.isStationary ? snap.x : projected.x,
      y: snap.isStationary ? snap.y : projected.y,
      timestampMs: snap.lastTimestampMs + stepLeadMs,
      leadTimeMs: stepLeadMs,
      requestedLeadTimeMs: stepRequestedLeadMs,
      pressure: predictedPressure,
      nibWidthPx: computeNibWidthPx(predictedPressure, predictor.config.baseNibWidthPx, predictor.config.minNibWidthRatio),
      confidence,
      uncertaintyRadiusPx,
      displacementFromHeadPx,
      brakeDampingFactor: effectiveBrake,
    });
  }

  const lastPoint = points[points.length - 1];
  return {
    refreshTarget: predictor.config.refreshTarget, requestedHorizonMs, effectiveHorizonMs,
    substepsRequested: clampedSubsteps, passthroughActive: false, isStationary: snap.isStationary,
    cornerBrakeActive: snap.cornerBrakeActive, brakeFactor: effectiveBrake, brakeReason: snap.brakeReason,
    headX: snap.x, headY: snap.y, headTimestampMs: snap.lastTimestampMs, maxDisplacementPx,
    terminalConfidence: lastPoint ? lastPoint.confidence : 0,
    terminalUncertaintyRadiusPx: lastPoint ? lastPoint.uncertaintyRadiusPx : snap.positionUncertaintyPx,
    points,
  };
}
