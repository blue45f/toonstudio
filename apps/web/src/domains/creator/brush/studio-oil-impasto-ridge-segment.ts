import type { ImpastoReliefGrid } from "./studio-oil-ribbon-impasto-relief";

/** 기존 높이를 넘을 수 없는 도포는 거리 계산 전에 제외한다. */
export function stampStudioImpastoRidgeSegment(
  ridge: Float32Array,
  grid: Pick<ImpastoReliefGrid, "cell" | "originX" | "originY" | "gridWidth" | "gridHeight">,
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  fromLoad: number,
  toLoad: number,
  ridgeReach: number,
  heightScale: number,
): void {
  const { cell, originX, originY, gridWidth, gridHeight } = grid;
  const segmentX = toX - fromX;
  const segmentY = toY - fromY;
  const ridgeReachSquared = ridgeReach * ridgeReach;
  const lengthSquared = segmentX * segmentX + segmentY * segmentY;
  const inverseLengthSquared =
    lengthSquared > 1e-6 ? 1 / lengthSquared : 0;
  const loadSpan = toLoad - fromLoad;
  // t는 [0,1], 거리 감쇠는 [0,1]이다. 부동소수점 보간 오차까지 상한에 포함한다.
  const maximumLevel = heightScale * (0.25 + 0.75 * (Math.max(fromLoad, toLoad) + 4 * Number.EPSILON));
  const minCellX = Math.max(
    0,
    Math.floor((Math.min(fromX, toX) - ridgeReach - originX) / cell)
  );
  const maxCellX = Math.min(
    gridWidth - 1,
    Math.ceil((Math.max(fromX, toX) + ridgeReach - originX) / cell)
  );
  const minCellY = Math.max(
    0,
    Math.floor((Math.min(fromY, toY) - ridgeReach - originY) / cell)
  );
  const maxCellY = Math.min(
    gridHeight - 1,
    Math.ceil((Math.max(fromY, toY) + ridgeReach - originY) / cell)
  );
  for (let cellY = minCellY; cellY <= maxCellY; cellY += 1) {
    const pointY = originY + (cellY + 0.5) * cell - fromY;
    for (let cellX = minCellX; cellX <= maxCellX; cellX += 1) {
      const at = cellY * gridWidth + cellX;
      if (ridge[at]! >= maximumLevel) continue;
      const pointX = originX + (cellX + 0.5) * cell - fromX;
      const t = Math.min(1, Math.max(0,
        (pointX * segmentX + pointY * segmentY) * inverseLengthSquared
      ));
      const deltaX = pointX - segmentX * t;
      const deltaY = pointY - segmentY * t;
      const distanceSquared = deltaX * deltaX + deltaY * deltaY;
      if (distanceSquared >= ridgeReachSquared) continue;
      const level =
        heightScale *
        (0.25 + 0.75 * (fromLoad + loadSpan * t));
      const value = level * (1 - Math.sqrt(distanceSquared) / ridgeReach);
      if (value > ridge[at]!) ridge[at] = value;
    }
  }
}
