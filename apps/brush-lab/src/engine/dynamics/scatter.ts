import type { Pcg32 } from "../core/rng";

/** 산포 스펙. 모두 0이면 산포 없음. */
export interface ScatterSpec {
  /** 위치 산포 반경(px). */
  positionPx: number;
  /** 각도 산포 ±rad. */
  angleRad: number;
  /** 크기 산포 ±비율(0.2 = ±20%). */
  scale: number;
  /** dab 개수 지터 0..1(spray 등에서 추가 dab 확률). */
  countJitter: number;
}

export const NO_SCATTER: ScatterSpec = { positionPx: 0, angleRad: 0, scale: 0, countJitter: 0 };

/**
 * 산포 오프셋. 스펙 값과 무관하게 항상 난수 4개를 소비해 수열 위치가 고정된다
 * (산포 on/off가 다른 dab의 난수를 바꾸지 않는다).
 */
export function scatterOffset(
  rng: Pcg32,
  spec: ScatterSpec,
): { dx: number; dy: number; dAngle: number; dScale: number } {
  const u1 = rng.nextF32();
  const u2 = rng.nextF32();
  const u3 = rng.nextF32();
  const u4 = rng.nextF32();
  const theta = u1 * Math.PI * 2;
  const radius = spec.positionPx * Math.sqrt(u2);
  return {
    dx: Math.cos(theta) * radius,
    dy: Math.sin(theta) * radius,
    dAngle: (u3 * 2 - 1) * spec.angleRad,
    dScale: Math.max(0.05, 1 + (u4 * 2 - 1) * spec.scale),
  };
}

/**
 * Magma Studio 역공학 기반 이방성(Anisotropic) 법선·접선 분리 산포 스펙.
 */
export interface AnisotropicScatterSpec {
  /** 스트로크 진행 법선(수직) 방향 최대 분산 폭(px). */
  normalSpreadPx: number;
  /** 스트로크 진행 접선(수평) 방향 최대 분산 폭(px). */
  tangentSpreadPx: number;
  /** true이면 법선·접선 분산을 독립 적용, false이면 normalSpreadPx를 양축에 동일 적용. */
  separateSpread: boolean;
  /** 각도 산포 ±rad. */
  angleRad: number;
  /** 크기 산포 ±비율. */
  scale: number;
}

/**
 * Magma Studio 스타일 이방성 산포 오프셋.
 * 항상 난수 4개를 소비하여 결정론적 수열 위치를 유지한다.
 */
export function anisotropicScatterOffset(
  rng: Pcg32,
  spec: AnisotropicScatterSpec,
  directionRad: number,
): {
  dx: number;
  dy: number;
  normalOffsetPx: number;
  tangentOffsetPx: number;
  dAngle: number;
  dScale: number;
} {
  const u1 = rng.nextF32();
  const u2 = rng.nextF32();
  const u3 = rng.nextF32();
  const u4 = rng.nextF32();

  const safeDir = Number.isFinite(directionRad) ? directionRad : 0;
  const normalSpan = Math.max(0, spec.normalSpreadPx);
  const tangentSpan = spec.separateSpread
    ? Math.max(0, spec.tangentSpreadPx)
    : normalSpan;

  const normalOffsetPx = (u1 - 0.5) * normalSpan;
  const tangentOffsetPx = (u2 - 0.5) * tangentSpan;

  const cosT = Math.cos(safeDir);
  const sinT = Math.sin(safeDir);
  const normalX = -sinT;
  const normalY = cosT;

  return {
    dx: normalX * normalOffsetPx + cosT * tangentOffsetPx,
    dy: normalY * normalOffsetPx + sinT * tangentOffsetPx,
    normalOffsetPx,
    tangentOffsetPx,
    dAngle: (u3 * 2 - 1) * spec.angleRad,
    dScale: Math.max(0.05, 1 + (u4 * 2 - 1) * spec.scale),
  };
}

