import { describe, expect, it } from "vitest";
import { stampStudioImpastoRidgeSegment } from "./studio-oil-impasto-ridge-segment";

type Grid = Parameters<typeof stampStudioImpastoRidgeSegment>[1];
type Segment = readonly [number, number, number, number, number, number, number, number];

/** 가지치기 없이 모든 셀에 원래 캡슐 거리와 max 도포를 적용하는 비교 기준. */
function reference(ridge: Float32Array, grid: Grid, segment: Segment): void {
  const [fromX, fromY, toX, toY, fromLoad, toLoad, reach, heightScale] = segment;
  const segmentX = toX - fromX;
  const segmentY = toY - fromY;
  const lengthSquared = segmentX * segmentX + segmentY * segmentY;
  const inverseLengthSquared = lengthSquared > 1e-6 ? 1 / lengthSquared : 0;
  for (let y = 0; y < grid.gridHeight; y++) {
    for (let x = 0; x < grid.gridWidth; x++) {
      const pointX = grid.originX + (x + 0.5) * grid.cell - fromX;
      const pointY = grid.originY + (y + 0.5) * grid.cell - fromY;
      const t = Math.min(1, Math.max(0, (pointX * segmentX + pointY * segmentY) * inverseLengthSquared));
      const dx = pointX - segmentX * t;
      const dy = pointY - segmentY * t;
      const distanceSquared = dx * dx + dy * dy;
      if (distanceSquared >= reach * reach) continue;
      const level = heightScale * (0.25 + 0.75 * (fromLoad + (toLoad - fromLoad) * t));
      const value = level * (1 - Math.sqrt(distanceSquared) / reach);
      const index = y * grid.gridWidth + x;
      if (value > ridge[index]!) ridge[index] = value;
    }
  }
}

describe("임파스토 높이 상한 가지치기", () => {
  it.each([0.75, 1.5, 4])("셀 크기 %s의 교차·반전·경계 밖 도포가 Float32 단위로 동일하다", (cell) => {
    const grid = { cell, originX: -12, originY: -8, gridWidth: 32, gridHeight: 28 };
    const expected = new Float32Array(grid.gridWidth * grid.gridHeight);
    const actual = expected.slice();
    let seed = 913;
    const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 2 ** 32; };
    for (let index = 0; index < 192; index++) {
      const segment: Segment = [random() * 100 - 25, random() * 90 - 20,
        random() * 100 - 25, random() * 90 - 20, random(), random(), 0.5 + random() * 15, 0.55];
      reference(expected, grid, segment);
      stampStudioImpastoRidgeSegment(actual, grid, ...segment);
      expect(actual).toEqual(expected);
    }
  });

  it("정지 탭·최대 로드·이미 높은 교차점에서도 도포를 바꾸지 않는다", () => {
    const grid = { cell: 1, originX: 0, originY: 0, gridWidth: 8, gridHeight: 8 };
    for (const fill of [0, 0.2, Math.fround(0.55), 1]) {
      const expected = new Float32Array(64).fill(fill);
      const actual = expected.slice();
      const segment: Segment = [3.5, 3.5, 3.5, 3.5, 1, 0, 4, 0.55];
      reference(expected, grid, segment);
      stampStudioImpastoRidgeSegment(actual, grid, ...segment);
      expect(actual).toEqual(expected);
    }
  });
});
