/**
 * Wave 99 — 1축 등가속도(CWJ) 칼만 필터, 필압 칼만 필터, CTRA 호 적분 순수 수치 커널.
 */

export interface AxisState3 {
  p: number;
  v: number;
  a: number;
  c00: number;
  c01: number;
  c02: number;
  c11: number;
  c12: number;
  c22: number;
}

export interface PressureState2 {
  p: number;
  dp: number;
  c00: number;
  c01: number;
  c11: number;
}

export interface CtraKinematicsInput {
  readonly x: number;
  readonly y: number;
  readonly vx: number;
  readonly vy: number;
  readonly ax: number;
  readonly ay: number;
  readonly speedPxPerSec: number;
  readonly headingRad: number;
  readonly omegaRadPerSec: number;
  readonly isStationary: boolean;
}

export function clampNumber(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return value < min ? min : value > max ? max : value;
}

export function wrapAngleRad(angle: number): number {
  let a = angle;
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

export function computeNibWidthPx(pressure: number, baseNibWidthPx: number, minRatio: number): number {
  const ratio = minRatio + (1 - minRatio) * clampNumber(pressure, 0, 1);
  return Math.max(0.25, baseNibWidthPx * ratio);
}

export function createInitialAxis3(pos: number, rVar: number): AxisState3 {
  return { p: pos, v: 0, a: 0, c00: rVar, c01: 0, c02: 0, c11: 4e4, c12: 0, c22: 4e6 };
}

export function createInitialPressure2(pressure: number): PressureState2 {
  return { p: clampNumber(pressure, 0, 1), dp: 0, c00: 0.01, c01: 0, c11: 4.0 };
}

/** 1축 등가속도(CWJ) 칼만 예측 + Joseph 형태 공분산 갱신(대칭·양정치성 보존). */
export function stepAxisKalman3(
  axis: AxisState3,
  measurement: number,
  dt: number,
  qJerk: number,
  rVar: number,
): { readonly innovation: number; readonly innovationVar: number } {
  const dt2 = dt * dt;
  const dt3 = dt2 * dt;
  const dt4 = dt3 * dt;
  const dt5 = dt4 * dt;
  const h2 = 0.5 * dt2;

  const pPred = axis.p + axis.v * dt + axis.a * h2;
  const vPred = axis.v + axis.a * dt;
  const fp00 = axis.c00 + axis.c01 * dt + axis.c02 * h2;
  const fp01 = axis.c01 + axis.c11 * dt + axis.c12 * h2;
  const fp02 = axis.c02 + axis.c12 * dt + axis.c22 * h2;
  const fp11 = axis.c11 + axis.c12 * dt;
  const fp12 = axis.c12 + axis.c22 * dt;

  const p00 = Math.max(1e-9, fp00 + fp01 * dt + fp02 * h2 + (qJerk * dt5) / 20);
  const p01 = fp01 + fp02 * dt + (qJerk * dt4) / 8;
  const p02 = fp02 + (qJerk * dt3) / 6;
  const p11 = Math.max(1e-9, fp11 + fp12 * dt + (qJerk * dt3) / 3);
  const p12 = fp12 + (qJerk * dt2) / 2;
  const p22 = Math.max(1e-9, axis.c22 + qJerk * dt);

  const innovation = measurement - pPred;
  const sVar = Math.max(1e-9, p00 + rVar);
  const invS = 1 / sVar;
  const k0 = p00 * invS;
  const k1 = p01 * invS;
  const k2 = p02 * invS;

  axis.p = pPred + k0 * innovation;
  axis.v = vPred + k1 * innovation;
  axis.a = axis.a + k2 * innovation;

  const omk0 = 1 - k0;
  axis.c00 = Math.max(1e-9, omk0 * omk0 * p00 + k0 * k0 * rVar);
  axis.c01 = omk0 * (p01 - k1 * p00) + k0 * k1 * rVar;
  axis.c02 = omk0 * (p02 - k2 * p00) + k0 * k2 * rVar;
  axis.c11 = Math.max(1e-9, p11 - 2 * k1 * p01 + k1 * k1 * sVar);
  axis.c12 = p12 - k1 * p02 - k2 * p01 + k1 * k2 * sVar;
  axis.c22 = Math.max(1e-9, p22 - 2 * k2 * p02 + k2 * k2 * sVar);

  return { innovation, innovationVar: sVar };
}

export function stepPressureKalman2(state: PressureState2, measuredPressure: number, dt: number): void {
  const dt2 = dt * dt;
  const qP = 45.0;
  const rP = 0.0025;
  const pPred = clampNumber(state.p + state.dp * dt, 0, 1);
  const dpPred = state.dp * Math.exp(-dt * 4);
  const p00 = Math.max(1e-9, state.c00 + 2 * state.c01 * dt + state.c11 * dt2 + (qP * dt2 * dt) / 3);
  const p01 = state.c01 + state.c11 * dt + (qP * dt2) / 2;
  const p11 = Math.max(1e-9, state.c11 + qP * dt);
  const sVar = p00 + rP;
  const k0 = p00 / sVar;
  const k1 = p01 / sVar;
  const innov = measuredPressure - pPred;

  state.p = clampNumber(pPred + k0 * innov, 0, 1);
  state.dp = clampNumber(dpPred + k1 * innov, -18, 18);
  const omk0 = 1 - k0;
  state.c00 = Math.max(1e-9, omk0 * omk0 * p00 + k0 * k0 * rP);
  state.c01 = omk0 * (p01 - k1 * p00) + k0 * k1 * rP;
  state.c11 = Math.max(1e-9, p11 - 2 * k1 * p01 + k1 * k1 * sVar);
}

export function projectAxisPositionVariance(axis: AxisState3, hSec: number, qJerk: number): number {
  const h2 = hSec * hSec;
  const halfH2 = 0.5 * h2;
  return Math.max(
    0,
    axis.c00 +
      2 * hSec * axis.c01 +
      2 * halfH2 * axis.c02 +
      h2 * axis.c11 +
      2 * hSec * halfH2 * axis.c12 +
      halfH2 * halfH2 * axis.c22 +
      (qJerk * h2 * h2 * hSec) / 20,
  );
}

/** CTRA(Constant Turn Rate & Tangential Acceleration) 해석적 호 적분 (감속 역주행 금지). */
export function integrateCtraPoint(
  kin: CtraKinematicsInput,
  hSec: number,
  omegaReliability: number,
): { readonly x: number; readonly y: number } {
  if (hSec <= 0 || kin.isStationary || kin.speedPxPerSec <= 1e-6) {
    return { x: kin.x, y: kin.y };
  }
  const speed = kin.speedPxPerSec;
  const ux = kin.vx / speed;
  const uy = kin.vy / speed;
  const tangentialAccel = clampNumber(kin.ax * ux + kin.ay * uy, -18000, 12000);
  const tEff = tangentialAccel < -1e-3 ? Math.min(hSec, speed / -tangentialAccel) : hSec;
  const omegaEff = kin.omegaRadPerSec * omegaReliability;
  const dTheta = omegaEff * tEff;

  if (Math.abs(dTheta) < 1e-4) {
    const dist = speed * tEff + 0.5 * tangentialAccel * tEff * tEff;
    return { x: kin.x + ux * dist, y: kin.y + uy * dist };
  }

  const theta0 = kin.headingRad;
  const theta1 = theta0 + dTheta;
  const invOmega = 1 / omegaEff;
  const invOmega2 = invOmega * invOmega;
  const speedEnd = Math.max(0, speed + tangentialAccel * tEff);
  return {
    x: kin.x + (speedEnd * Math.sin(theta1) - speed * Math.sin(theta0)) * invOmega + tangentialAccel * (Math.cos(theta1) - Math.cos(theta0)) * invOmega2,
    y: kin.y + (-speedEnd * Math.cos(theta1) + speed * Math.cos(theta0)) * invOmega + tangentialAccel * (Math.sin(theta1) - Math.sin(theta0)) * invOmega2,
  };
}
