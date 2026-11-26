/**
 * 인터랙티브 웹캠/AR 시선(Gaze) 및 두부 포즈(Head-Pose) → 3D 키/림/필 라이트 방향 컨트롤러.
 *
 * - 반경 지터 데드존(Radial Jitter Deadzone)으로 미세 랜드마크 떨림 차단
 * - tanh 소프트 클램핑으로 극단 시선 각도 부드럽게 포화
 * - 해석적 임계 감쇠 2차 스프링($\zeta = 1$)으로 임의의 $\Delta t$에서 무-오버슈트 안정 수렴
 */

import type { Vec3 } from "./mesh-qem-decimator-retargeter";

export interface GazeHeadPoseSample {
  /** 두부 좌우 회전(라디안, 양수 = 우측 회전). */
  readonly headYawRad: number;
  /** 두부 상하 기울기(라디안, 양수 = 위쪽 응시). */
  readonly headPitchRad: number;
  /** 선택적 두부 롤(라디안). */
  readonly headRollRad?: number;
  /** 정규화 안구 시선 수평 성분 `[-1..1]`. */
  readonly gazeX: number;
  /** 정규화 안구 시선 수직 성분 `[-1..1]`. */
  readonly gazeY: number;
  /** 웹캠/AR 트래커 신뢰도 `[0..1]` (기본 `1`). */
  readonly confidence?: number;
}

export interface GazePoseLightConfig {
  readonly neutralAzimuthRad?: number;
  readonly neutralElevationRad?: number;
  readonly headYawGain?: number;
  readonly headPitchGain?: number;
  readonly gazeYawGainRad?: number;
  readonly gazePitchGainRad?: number;
  readonly deadzoneRad?: number;
  readonly maxAzimuthRad?: number;
  readonly minElevationRad?: number;
  readonly maxElevationRad?: number;
  readonly naturalFrequencyHz?: number;
  readonly minConfidence?: number;
  readonly decayToNeutralOnLowConfidence?: boolean;
  readonly rimAzimuthOffsetRad?: number;
  readonly rimElevationBoostRad?: number;
}

export interface GazePoseLightState {
  readonly keyLightDirection: Vec3;
  readonly rimLightDirection: Vec3;
  readonly fillLightDirection: Vec3;
  readonly azimuthRad: number;
  readonly elevationRad: number;
  readonly targetAzimuthRad: number;
  readonly targetElevationRad: number;
  readonly azimuthVelocityRadPerSec: number;
  readonly elevationVelocityRadPerSec: number;
  readonly isInDeadzone: boolean;
  readonly isSettled: boolean;
  readonly confidenceAccepted: boolean;
}

function clampNum(v: number, min: number, max: number): number {
  return Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : min;
}

function softClampRange(value: number, min: number, max: number): number {
  const center = (min + max) * 0.5;
  const halfSpan = Math.max(1e-4, (max - min) * 0.5);
  return center + Math.tanh((value - center) / halfSpan) * halfSpan;
}

function sphericalToUnitVec3(azimuthRad: number, elevationRad: number): Vec3 {
  const cosEl = Math.cos(elevationRad);
  const x = cosEl * Math.sin(azimuthRad);
  const y = Math.sin(elevationRad);
  const z = cosEl * Math.cos(azimuthRad);
  const len = Math.hypot(x, y, z) || 1;
  return [x / len, y / len, z / len];
}

function stepCriticallyDampedSpring(
  x: number,
  v: number,
  target: number,
  omega: number,
  dt: number,
): { readonly position: number; readonly velocity: number } {
  const diff = x - target;
  const expTerm = Math.exp(-omega * dt);
  return {
    position: target + expTerm * (diff * (1 + omega * dt) + v * dt),
    velocity: expTerm * (v * (1 - omega * dt) - omega * omega * diff * dt),
  };
}

/**
 * 웹캠/AR 시선 및 두부 포즈 입력을 지터 데드존·소프트 클램프·임계 감쇠 스프링으로 필터링해
 * 실시간 3D 키·림·필 라이트 방향 벡터를 산출하는 컨트롤러.
 */
export class GazePoseLightController {
  private readonly neutralAz: number;
  private readonly neutralEl: number;
  private readonly headYawGain: number;
  private readonly headPitchGain: number;
  private readonly gazeYawGainRad: number;
  private readonly gazePitchGainRad: number;
  private readonly deadzoneRad: number;
  private readonly maxAzimuthRad: number;
  private readonly minElevationRad: number;
  private readonly maxElevationRad: number;
  private readonly omega: number;
  private readonly minConfidence: number;
  private readonly decayToNeutral: boolean;
  private readonly rimAzimuthOffsetRad: number;
  private readonly rimElevationBoostRad: number;

  private az: number;
  private el: number;
  private velAz = 0;
  private velEl = 0;
  private lockedTargetAz: number;
  private lockedTargetEl: number;

  constructor(config: GazePoseLightConfig = {}) {
    this.neutralAz = clampNum(config.neutralAzimuthRad ?? 0.42, -Math.PI, Math.PI);
    this.neutralEl = clampNum(config.neutralElevationRad ?? 0.58, -1.2, 1.4);
    this.headYawGain = clampNum(config.headYawGain ?? 0.85, 0, 3);
    this.headPitchGain = clampNum(config.headPitchGain ?? 0.7, 0, 3);
    this.gazeYawGainRad = clampNum(config.gazeYawGainRad ?? 0.38, 0, 1.5);
    this.gazePitchGainRad = clampNum(config.gazePitchGainRad ?? 0.26, 0, 1.2);
    this.deadzoneRad = clampNum(config.deadzoneRad ?? 0.035, 0, 0.35);
    this.maxAzimuthRad = clampNum(config.maxAzimuthRad ?? 1.35, 0.2, Math.PI * 0.92);
    this.minElevationRad = clampNum(config.minElevationRad ?? -0.25, -1.3, 0.8);
    this.maxElevationRad = clampNum(config.maxElevationRad ?? 1.22, this.minElevationRad + 0.1, 1.48);
    this.omega = Math.PI * 2 * clampNum(config.naturalFrequencyHz ?? 2.2, 0.25, 12);
    this.minConfidence = clampNum(config.minConfidence ?? 0.4, 0, 1);
    this.decayToNeutral = config.decayToNeutralOnLowConfidence ?? false;
    this.rimAzimuthOffsetRad = config.rimAzimuthOffsetRad ?? Math.PI * 0.82;
    this.rimElevationBoostRad = config.rimElevationBoostRad ?? 0.18;

    this.az = this.neutralAz;
    this.el = this.neutralEl;
    this.lockedTargetAz = this.neutralAz;
    this.lockedTargetEl = this.neutralEl;
  }

  resetToNeutral(): GazePoseLightState {
    this.az = this.neutralAz;
    this.el = this.neutralEl;
    this.velAz = 0;
    this.velEl = 0;
    this.lockedTargetAz = this.neutralAz;
    this.lockedTargetEl = this.neutralEl;
    return this.buildState(true, true);
  }

  update(sample: GazeHeadPoseSample, dtSec: number): GazePoseLightState {
    const dt = clampNum(dtSec, 1 / 480, 0.25);
    const conf = sample.confidence === undefined ? 1 : clampNum(sample.confidence, 0, 1);
    const confidenceAccepted = conf >= this.minConfidence;

    let isInDeadzone = false;
    if (confidenceAccepted) {
      const yaw = clampNum(sample.headYawRad, -Math.PI, Math.PI);
      const pitch = clampNum(sample.headPitchRad, -Math.PI * 0.5, Math.PI * 0.5);
      const gx = clampNum(sample.gazeX, -1, 1);
      const gy = clampNum(sample.gazeY, -1, 1);

      const clampedAz = softClampRange(
        this.neutralAz + yaw * this.headYawGain + gx * this.gazeYawGainRad,
        -this.maxAzimuthRad,
        this.maxAzimuthRad,
      );
      const clampedEl = softClampRange(
        this.neutralEl + pitch * this.headPitchGain + gy * this.gazePitchGainRad,
        this.minElevationRad,
        this.maxElevationRad,
      );

      const dAz = clampedAz - this.lockedTargetAz;
      const dEl = clampedEl - this.lockedTargetEl;
      const radial = Math.hypot(dAz, dEl);
      if (radial <= this.deadzoneRad) {
        isInDeadzone = true;
      } else {
        const moveScale = (radial - this.deadzoneRad) / radial;
        this.lockedTargetAz += dAz * moveScale;
        this.lockedTargetEl += dEl * moveScale;
      }
    } else if (this.decayToNeutral) {
      this.lockedTargetAz = this.neutralAz;
      this.lockedTargetEl = this.neutralEl;
    }

    const nextAz = stepCriticallyDampedSpring(this.az, this.velAz, this.lockedTargetAz, this.omega, dt);
    const nextEl = stepCriticallyDampedSpring(this.el, this.velEl, this.lockedTargetEl, this.omega, dt);
    this.az = nextAz.position;
    this.velAz = nextAz.velocity;
    this.el = nextEl.position;
    this.velEl = nextEl.velocity;

    return this.buildState(isInDeadzone, confidenceAccepted);
  }

  private buildState(isInDeadzone: boolean, confidenceAccepted: boolean): GazePoseLightState {
    const keyLightDirection = sphericalToUnitVec3(this.az, this.el);
    const rimAz = this.az + (this.az >= 0 ? -this.rimAzimuthOffsetRad : this.rimAzimuthOffsetRad);
    const rimEl = clampNum(this.el + this.rimElevationBoostRad, 0.15, 1.38);
    const rimLightDirection = sphericalToUnitVec3(rimAz, rimEl);
    const fillLightDirection = sphericalToUnitVec3(-this.az * 0.65, clampNum(this.el * 0.45, -0.2, 0.8));

    return {
      keyLightDirection,
      rimLightDirection,
      fillLightDirection,
      azimuthRad: this.az,
      elevationRad: this.el,
      targetAzimuthRad: this.lockedTargetAz,
      targetElevationRad: this.lockedTargetEl,
      azimuthVelocityRadPerSec: this.velAz,
      elevationVelocityRadPerSec: this.velEl,
      isInDeadzone,
      isSettled:
        Math.hypot(this.az - this.lockedTargetAz, this.el - this.lockedTargetEl) < 1e-3 &&
        Math.hypot(this.velAz, this.velEl) < 1e-2,
      confidenceAccepted,
    };
  }
}
