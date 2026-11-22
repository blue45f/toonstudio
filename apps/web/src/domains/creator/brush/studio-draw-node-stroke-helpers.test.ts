import { describe, expect, it } from "vitest";

import type { DrawEl } from "../studio-element-model";

import {
  computeStudioDrawPointSpan,
  computeStudioOutlineErrorBounds,
  planStudioLuminousBrushRender,
  resolveStudioDrawFreehandContext,
} from "./studio-draw-node-stroke-helpers";
import {
  buildSpringEdges,
  deterministicUnit,
  sampleFlowVector,
} from "./studio-physics-particle-kernel";

function makeDrawEl(overrides: Partial<DrawEl> = {}): DrawEl {
  return {
    id: "draw-test-1",
    type: "draw",
    kind: "freehand",
    mode: "pen",
    brush: "pen",
    points: [0, 0, 10, 0, 20, 0],
    stroke: "#112233",
    strokeWidth: 8,
    opacity: 1,
    ...overrides,
  };
}

describe("studio-draw-node-stroke-helpers 순수 분리 모듈", () => {
  it("computeStudioDrawPointSpan이 바운딩 스팬과 점 개수를 정확히 계산한다", () => {
    expect(computeStudioDrawPointSpan([0, 0, 3, 4], true)).toEqual({
      pointCount: 2,
      strokeDistance: 5,
    });
    expect(computeStudioDrawPointSpan([0, 0, 30, 40], false)).toEqual({
      pointCount: 2,
      strokeDistance: 0,
    });
  });

  it("computeStudioOutlineErrorBounds가 비유한 좌표를 걸러내고 최소 16px 상자를 보장한다", () => {
    expect(computeStudioOutlineErrorBounds([Number.NaN, 0, 10, 20])).toEqual({
      minX: 10,
      minY: 20,
      width: 16,
      height: 16,
    });
    expect(computeStudioOutlineErrorBounds([5, 10, 45, 70])).toEqual({
      minX: 5,
      minY: 10,
      width: 40,
      height: 60,
    });
  });

  it("planStudioLuminousBrushRender가 neon과 glow 패스 구성을 일관되게 생성한다", () => {
    const neonPlan = planStudioLuminousBrushRender({
      family: "neon",
      el: makeDrawEl({ brush: "neon" }),
      points: [0, 0, 40, 0],
      stroke: "#00aaff",
      strokeWidth: 10,
      renderSampleDistance: 1,
      activeDraft: false,
      symmetryVariationCount: 1,
    });
    expect(neonPlan.brushId).toBe("neon");
    expect(neonPlan.passes.some((pass) => pass.luminousCore)).toBe(true);

    const glowPlan = planStudioLuminousBrushRender({
      family: "glow",
      el: makeDrawEl({ brush: "soft-glow" }),
      points: [0, 0, 40, 0],
      stroke: "#ffaa00",
      strokeWidth: 12,
      renderSampleDistance: 1,
      activeDraft: true,
      symmetryVariationCount: 1,
    });
    expect(glowPlan.brushId).toBe("soft-glow");
    expect(glowPlan.passes[glowPlan.passes.length - 1]?.luminousCore).toBe(true);
  });

  it("resolveStudioDrawFreehandContext가 compact perfect dot 경로를 판별한다", () => {
    const ctx = resolveStudioDrawFreehandContext({
      el: makeDrawEl({ brush: "perfect-ink" }),
      points: [10, 10, 14, 13],
      strokeWidth: 6,
      hasPerfectProfile: true,
    });
    expect(ctx.isPerfectAliasBrush).toBe(true);
    expect(ctx.pointCount).toBe(2);
    expect(ctx.strokeDistance).toBeCloseTo(5, 6);
    expect(ctx.isCompactPerfectDotRoute).toBe(true);
  });
});

describe("studio-physics-particle-kernel 순수 커널", () => {
  it("deterministicUnit은 동일 시드·인덱스에서 결정론 값을 반환한다", () => {
    const a = deterministicUnit(42, 3, 2, 5, 1);
    const b = deterministicUnit(42, 3, 2, 5, 1);
    const c = deterministicUnit(42, 3, 2, 6, 1);
    expect(a).toBe(b);
    expect(a).toBeGreaterThanOrEqual(0);
    expect(a).toBeLessThan(1);
    expect(c).not.toBe(a);
  });

  it("buildSpringEdges가 radial/chain/ring 토폴로지 엣지를 정확히 생성한다", () => {
    expect(buildSpringEdges(4, "radial")).toEqual([
      [0, 1],
      [0, 2],
      [0, 3],
    ]);
    expect(buildSpringEdges(4, "chain")).toEqual([
      [0, 1],
      [1, 2],
      [2, 3],
    ]);
    expect(buildSpringEdges(3, "ring")).toEqual([
      [0, 1],
      [1, 2],
      [2, 0],
    ]);
  });

  it("sampleFlowVector가 선형 경사 높이장 기울기를 정확히 샘플링한다", () => {
    // h(x, y) = 2x + 3y (cellSize = 1, 3x3 grid)
    const heights = new Float32Array([
      0, 2, 4,
      3, 5, 7,
      6, 8, 10,
    ]);
    const sampled = sampleFlowVector(
      { width: 3, height: 3, originX: 0, originY: 0, cellSize: 1, heights },
      1,
      1,
    );
    expect(sampled.height).toBeCloseTo(5, 6);
    expect(sampled.gradientX).toBeCloseTo(2, 6);
    expect(sampled.gradientY).toBeCloseTo(3, 6);
  });
});
