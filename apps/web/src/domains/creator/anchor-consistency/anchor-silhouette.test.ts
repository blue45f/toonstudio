import { describe, expect, it } from "vitest";

import {
  ANCHOR_SILHOUETTE_ASPECT_FLOOR,
  ANCHOR_SILHOUETTE_GRID,
  ANCHOR_SILHOUETTE_WEIGHTS,
  compareAnchorSilhouettes,
  computeAnchorSilhouette,
} from "./anchor-silhouette";

function maskOf(width: number, height: number, rects: ReadonlyArray<readonly [number, number, number, number]>): Uint8Array {
  const mask = new Uint8Array(width * height);
  for (const [x0, y0, w, h] of rects) {
    for (let y = y0; y < y0 + h; y += 1) for (let x = x0; x < x0 + w; x += 1) mask[y * width + x] = 1;
  }
  return mask;
}

describe("실루엣 특징", () => {
  it("꽉 찬 직사각형의 바깥 상자·비율·질량을 정확히 센다", () => {
    const silhouette = computeAnchorSilhouette(maskOf(100, 100, [[20, 10, 40, 60]]), 100, 100);
    expect(silhouette).not.toBeNull();
    expect(silhouette?.bbox).toEqual({ x0: 20, y0: 10, x1: 59, y1: 69 });
    expect(silhouette?.widthFrac).toBe(0.4);
    expect(silhouette?.heightFrac).toBe(0.6);
    expect(silhouette?.centerX).toBe(0.4);
    expect(silhouette?.centerY).toBe(0.4);
    expect(silhouette?.aspect).toBeCloseTo(0.667, 3);
    expect(silhouette?.fill).toBe(1);
    expect(silhouette?.thirds).toEqual([0.333, 0.333, 0.333]);
    expect(silhouette?.grid).toHaveLength(ANCHOR_SILHOUETTE_GRID.cols * ANCHOR_SILHOUETTE_GRID.rows);
    expect(silhouette?.grid.every((cell) => cell === 1)).toBe(true);
  });

  it("비어 있는 마스크는 null 이다", () => {
    expect(computeAnchorSilhouette(new Uint8Array(100), 10, 10)).toBeNull();
  });

  it("위가 무거운 모양은 상중하 질량이 위로 치우친다", () => {
    const silhouette = computeAnchorSilhouette(maskOf(60, 90, [[10, 0, 40, 30], [25, 30, 10, 60]]), 60, 90);
    expect(silhouette?.thirds[0]).toBeGreaterThan(silhouette?.thirds[1] ?? 1);
    expect(silhouette?.thirds[0]).toBeGreaterThan(silhouette?.thirds[2] ?? 1);
    expect(silhouette?.fill).toBeLessThan(1);
  });

  it("같은 모양은 위치·크기가 달라도 점수 1 에 가깝다(바깥 상자 기준)", () => {
    const small = computeAnchorSilhouette(maskOf(100, 100, [[10, 10, 20, 40], [15, 50, 10, 30]]), 100, 100);
    const large = computeAnchorSilhouette(maskOf(200, 200, [[80, 40, 40, 80], [90, 120, 20, 60]]), 200, 200);
    expect(small && large ? compareAnchorSilhouettes(small, large).score : 0).toBeGreaterThan(0.95);
  });

  it("좌우를 뒤집은 모양은 mirrored 로 같은 모양으로 본다", () => {
    const left = computeAnchorSilhouette(maskOf(60, 60, [[10, 10, 10, 40], [20, 40, 30, 10]]), 60, 60);
    const right = computeAnchorSilhouette(maskOf(60, 60, [[40, 10, 10, 40], [10, 40, 30, 10]]), 60, 60);
    const result = left && right ? compareAnchorSilhouettes(left, right) : null;
    expect(result?.mirrored).toBe(true);
    expect(result?.gridOverlap).toBeGreaterThan(0.9);
  });

  it("가로세로 비가 크게 다른 모양은 낮은 점수를 받는다", () => {
    const tall = computeAnchorSilhouette(maskOf(100, 100, [[40, 5, 15, 90]]), 100, 100);
    const wide = computeAnchorSilhouette(maskOf(100, 100, [[5, 40, 90, 15]]), 100, 100);
    const result = tall && wide ? compareAnchorSilhouettes(tall, wide) : null;
    expect(result?.aspect).toBe(0);
    expect(result?.score).toBeLessThan(0.6);
  });

  it("가중치 합은 1 이고 가로세로 비 계수는 0~1 이다", () => {
    const total = Object.values(ANCHOR_SILHOUETTE_WEIGHTS).reduce((sum, value) => sum + value, 0);
    expect(total).toBeCloseTo(1, 10);
    expect(ANCHOR_SILHOUETTE_ASPECT_FLOOR).toBeGreaterThan(0);
    expect(ANCHOR_SILHOUETTE_ASPECT_FLOOR).toBeLessThanOrEqual(1);
  });
});
