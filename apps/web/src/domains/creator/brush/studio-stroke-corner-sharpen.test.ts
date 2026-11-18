import { describe, expect, it } from "vitest";

import {
  DEFAULT_STUDIO_SHARP_CORNER_CONFIG,
  detectSharpStrokeCorners,
  normalizeStudioSharpCornerConfig,
  sharpenStrokeCornerSamples,
} from "./studio-stroke-corner-sharpen";

describe("studio-stroke-corner-sharpen", () => {
  const vShape = [
    { x: 0, y: 0, width: 10 },
    { x: 40, y: 0, width: 10 },
    { x: 10, y: 30, width: 10 },
  ];

  it("비활성 상태에서는 모서리를 검출하지 않고 원본 샘플을 그대로 반환한다", () => {
    expect(detectSharpStrokeCorners(vShape, DEFAULT_STUDIO_SHARP_CORNER_CONFIG)).toEqual([]);
    expect(sharpenStrokeCornerSamples(vShape, DEFAULT_STUDIO_SHARP_CORNER_CONFIG)).toEqual(vShape);
  });

  it("예각 V자 꺾임에서 바깥쪽 마이터 꼭짓점과 연장 길이를 정확히 계산한다", () => {
    const config = normalizeStudioSharpCornerConfig({
      enabled: true,
      minTurnAngleDeg: 55,
      miterLimitRatio: 2.8,
    });
    const corners = detectSharpStrokeCorners(vShape, config);
    expect(corners).toHaveLength(1);
    expect(corners[0]!.vertexIndex).toBe(1);
    expect(corners[0]!.turnAngleDeg).toBeCloseTo(135, 3);
    expect(corners[0]!.extensionPx).toBeGreaterThan(2);
    expect(corners[0]!.apexX).toBeGreaterThan(40);

    const sharpened = sharpenStrokeCornerSamples(vShape, config);
    expect(sharpened.length).toBeGreaterThan(vShape.length);
    const minTipWidth = Math.min(...sharpened.map((pt) => pt.width));
    expect(minTipWidth).toBeLessThan(3);
  });

  it("완만한 곡선은 임계값 미만으로 유지하여 불필요한 가시 정점을 만들지 않는다", () => {
    const gentleArc = Array.from({ length: 8 }, (_, idx) => {
      const angle = (idx / 7) * (Math.PI / 4);
      return { x: Math.cos(angle) * 100, y: Math.sin(angle) * 100, width: 8 };
    });
    const config = normalizeStudioSharpCornerConfig({
      enabled: true,
      minTurnAngleDeg: 55,
    });
    expect(detectSharpStrokeCorners(gentleArc, config)).toEqual([]);
    expect(sharpenStrokeCornerSamples(gentleArc, config)).toEqual(gentleArc);
  });
});
