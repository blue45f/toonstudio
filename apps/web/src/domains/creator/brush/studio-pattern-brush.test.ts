import { describe, expect, it } from "vitest";

import {
  buildProceduralMotifSvgPath,
  normalizeStudioPatternBrushConfig,
  planStudioPatternRibbonQuads,
  planStudioPatternStamps,
  recolorPatternPixelLuminancePreserving,
  resolveStudioPatternTipIndex,
} from "./studio-pattern-brush";

describe("studio-pattern-brush", () => {
  it("4가지 패턴 순서 모드(repeat, ping-pong, per-stroke, seeded-random)가 결정론적으로 동작한다", () => {
    expect([0, 1, 2, 3, 4, 5].map((i) => resolveStudioPatternTipIndex(3, "repeat", i, 10))).toEqual([
      0, 1, 2, 0, 1, 2,
    ]);
    expect(
      [0, 1, 2, 3, 4, 5].map((i) => resolveStudioPatternTipIndex(3, "ping-pong", i, 10)),
    ).toEqual([0, 1, 2, 1, 0, 1]);

    const strokeFixed = [0, 1, 2, 3].map((i) => resolveStudioPatternTipIndex(4, "per-stroke", i, 99));
    expect(new Set(strokeFixed).size).toBe(1);

    const rndA = [0, 1, 2, 3, 4].map((i) => resolveStudioPatternTipIndex(5, "seeded-random", i, 42));
    const rndB = [0, 1, 2, 3, 4].map((i) => resolveStudioPatternTipIndex(5, "seeded-random", i, 42));
    expect(rndA).toEqual(rndB);
  });

  it("리본 쿼드 스트립이 곡선을 따라 인접 정점을 끊김 없이 공유한다", () => {
    const curve = Array.from({ length: 10 }, (_, idx) => ({
      x: idx * 12,
      y: Math.sin(idx * 0.4) * 20,
    }));
    const cfg = normalizeStudioPatternBrushConfig({
      motif: "lace",
      ribbon: true,
      spacingPx: 24,
      widthPx: 16,
    });
    const quads = planStudioPatternRibbonQuads(curve, cfg);
    expect(quads.length).toBeGreaterThan(4);

    for (let i = 1; i < quads.length; i += 1) {
      const prev = quads[i - 1]!.quadVertices;
      const curr = quads[i]!.quadVertices;
      expect(curr[0]).toBeCloseTo(prev[2], 6);
      expect(curr[1]).toBeCloseTo(prev[3], 6);
      expect(curr[6]).toBeCloseTo(prev[4], 6);
      expect(curr[7]).toBeCloseTo(prev[5], 6);
    }
  });

  it("스탬프 배치와 휘도 보존 전경색 재채색 및 절차적 모티프 경로가 정상 동작한다", () => {
    const stamps = planStudioPatternStamps(
      [
        { x: 0, y: 0 },
        { x: 60, y: 0 },
      ],
      normalizeStudioPatternBrushConfig({ motif: "chain", spacingPx: 20, widthPx: 14 }),
    );
    expect(stamps).toHaveLength(4);
    expect(buildProceduralMotifSvgPath("lace", 0).length).toBeGreaterThan(10);

    const darkInk = recolorPatternPixelLuminancePreserving(
      { r: 0, g: 0, b: 0, a: 200 },
      { r: 30, g: 80, b: 210, a: 255 },
      { r: 255, g: 240, b: 240, a: 255 },
    );
    expect(darkInk).toEqual({ r: 30, g: 80, b: 210, a: 200 });
  });
});
