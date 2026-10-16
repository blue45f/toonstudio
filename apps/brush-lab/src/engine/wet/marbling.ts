/**
 * 수미나가시(먹물 방울) 해석 워프.
 *
 * 물 위에 떨어진 잉크 방울이 주변 무늬를 밀어내는 변환을 닫힌형으로 계산한다
 * (Lu·Jaffer 등 2012 Mathematical Marbling의 면적보존 원리, Ghassaei 2022
 * 하이브리드 마블링이 쓰는 Jaffer 방울 수학의 개념 재구현 — 외부 코드 복제 없음).
 *
 * 반경 a인 방울이 중심 c에 떨어지면 기존 무늬의 동심원 띠가 넓어진다:
 * 반경 r인 점은 r' = √(r² + a²)로 이동한다. 띠(r₁..r₂)의 넓이
 * π(r₂² − r₁²)는 변환 뒤 π((r₂²+a²) − (r₁²+a²))로 같으므로 면적이 보존된다.
 * 여러 방울은 떨어진 순서대로 합성한다. 솔버 없이 O(방울 수)라 실시간이다.
 *
 * 순수 함수이며 난수·시계·외부 상태를 쓰지 않는다. 같은 입력은 같은 출력이다.
 */

/** 물에 떨어뜨린 잉크 방울 하나. */
export interface MarbleDrop {
  /** 중심(px). */
  x: number;
  /** 중심(px). */
  y: number;
  /** 방울 반경(px, > 0). */
  radiusPx: number;
}

/** 워프된 점. */
export interface WarpedPoint {
  x: number;
  y: number;
}

/**
 * 점 (x, y)에 방울들을 순서대로 적용한 워프 위치.
 * 반경이 0이 아니면 반경·방울 반경이 유한해야 한다(아니면 RangeError).
 */
export function marbleDropWarp(x: number, y: number, drops: readonly MarbleDrop[]): WarpedPoint {
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    throw new RangeError(`marbleDropWarp: 점이 유한하지 않다(${x}, ${y})`);
  }
  let px = x;
  let py = y;
  for (const drop of drops) {
    if (!Number.isFinite(drop.x) || !Number.isFinite(drop.y) || !Number.isFinite(drop.radiusPx) || drop.radiusPx <= 0) {
      throw new RangeError(`marbleDropWarp: 방울이 유효하지 않다(${drop.x}, ${drop.y}, r=${drop.radiusPx})`);
    }
    const dx = px - drop.x;
    const dy = py - drop.y;
    const r2 = dx * dx + dy * dy;
    if (r2 === 0) {
      px = drop.x + drop.radiusPx;
      py = drop.y;
      continue;
    }
    const a2 = drop.radiusPx * drop.radiusPx;
    const scale = Math.sqrt((r2 + a2) / r2);
    px = drop.x + dx * scale;
    py = drop.y + dy * scale;
  }
  return { x: px, y: py };
}

/**
 * 워프의 수치 야코비 행렬식 |(∂x'/∂x)(∂y'/∂y) − (∂x'/∂y)(∂y'/∂x)|.
 * 면적보존이면 1이다(중앙 특이점 제외). 시험·진단용이다.
 */
export function marbleWarpJacobianDet(x: number, y: number, drops: readonly MarbleDrop[], h = 1e-3): number {
  const axx = marbleDropWarp(x + h, y, drops);
  const ax0 = marbleDropWarp(x - h, y, drops);
  const axy = marbleDropWarp(x, y + h, drops);
  const ax1 = marbleDropWarp(x, y - h, drops);
  const dxdx = (axx.x - ax0.x) / (2 * h);
  const dydx = (axx.y - ax0.y) / (2 * h);
  const dxdy = (axy.x - ax1.x) / (2 * h);
  const dydy = (axy.y - ax1.y) / (2 * h);
  return Math.abs(dxdx * dydy - dxdy * dydx);
}
