import { describe, expect, it } from "vitest";

import { SumiError } from "../core/errors";

import { evaluateFreehandPigmentRibbon, perfectFreehand } from "./perfect-freehand";

describe("Perfect Freehand 캘리그라피 리본 및 안료 농담 내재화", () => {
  const sampleStroke = [
    { x: 10, y: 10, pressure: 0.3, time: 0 },
    { x: 30, y: 10, pressure: 0.7, time: 16 },
    { x: 50, y: 10, pressure: 0.95, time: 32 },
    { x: 50, y: 40, pressure: 0.8, time: 48 },
    { x: 70, y: 40, pressure: 0.2, time: 64 },
  ] as const;

  it("양끝 테이퍼와 중간 고압 폭 확장을 리본 단면으로 계산한다", () => {
    const slices = evaluateFreehandPigmentRibbon(
      sampleStroke,
      [0.05, 0.1, 0.8],
      [1, 1, 1],
      { size: 12, taper: true, thinning: 0.4, smoothing: 0 },
    );

    expect(slices).toHaveLength(sampleStroke.length);
    // 양끝 테이퍼 단면은 중간 단면보다 폭이 작아야 한다
    expect(slices[0].halfWidth).toBeLessThan(slices[2].halfWidth);
    expect(slices[slices.length - 1].halfWidth).toBeLessThan(slices[2].halfWidth);
    // 90도 꺾이는 지점(index 2, 3)은 날카로운 모서리(isSharpCorner)로 감지된다
    expect(slices.some((s) => s.isSharpCorner)).toBe(true);
  });

  it("Kubelka-Munk(K/S) 공간에서 리본 중심색과 가장자리 희석 색을 결정적으로 산출한다", () => {
    const a = evaluateFreehandPigmentRibbon(sampleStroke, [0.1, 0.2, 0.9], [0.95, 0.9, 0.1], {
      size: 10,
      edgePigmentBlend: 0.5,
    });
    const b = evaluateFreehandPigmentRibbon(sampleStroke, [0.1, 0.2, 0.9], [0.95, 0.9, 0.1], {
      size: 10,
      edgePigmentBlend: 0.5,
    });

    expect(a).toEqual(b);
    expect(a[1].edgeColor).not.toEqual(a[1].coreColor);
  });

  it("perfectFreehand 재내보내기와 옵션 검증이 정상 동작한다", () => {
    expect(perfectFreehand(sampleStroke, { size: 8 }).length).toBeGreaterThan(4);
    expect(() =>
      evaluateFreehandPigmentRibbon(sampleStroke, [0, 0, 0], [1, 1, 1], { size: 0 }),
    ).toThrow(SumiError);
  });
});
