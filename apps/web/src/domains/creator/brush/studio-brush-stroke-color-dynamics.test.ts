import { describe, expect, it } from "vitest";

import {
  DEFAULT_STUDIO_CSP_BRUSH_EXTENSIONS,
  evaluateStudioStrokeAndSubColorRgb,
  isStudioCspBrushExtensionsIdentity,
  normalizeStudioCspBrushExtensions,
  normalizeStudioStrokeColorAndScaleConfig,
  resolveViewScaleSyncedBrushSize,
} from "./studio-brush-stroke-color-dynamics";

describe("studio-brush-stroke-color-dynamics", () => {
  it("기본 확장 설정은 항등원으로 판정되어 기존 직렬화에 영향을 주지 않는다", () => {
    expect(isStudioCspBrushExtensionsIdentity(DEFAULT_STUDIO_CSP_BRUSH_EXTENSIONS)).toBe(true);
    const modified = normalizeStudioCspBrushExtensions({
      sharpCorner: { enabled: true },
    });
    expect(isStudioCspBrushExtensionsIdentity(modified)).toBe(false);
  });

  it("획 단위 색 변화는 한 획 내 모든 댑에서 동일하고 다른 시드의 획에서는 달라진다", () => {
    const cfg = normalizeStudioStrokeColorAndScaleConfig({
      perStrokeColorJitter: true,
      strokeHueJitterDeg: 90,
      strokeSaturationJitter: 0.2,
      strokeValueJitter: 0.15,
    });
    const fg: [number, number, number] = [200, 60, 60];
    const sub: [number, number, number] = [40, 40, 200];

    const dab1 = evaluateStudioStrokeAndSubColorRgb(fg, sub, cfg, {
      strokeSeed: 101,
      pressure: 0.3,
    });
    const dab2 = evaluateStudioStrokeAndSubColorRgb(fg, sub, cfg, {
      strokeSeed: 101,
      pressure: 0.9,
    });
    const nextStroke = evaluateStudioStrokeAndSubColorRgb(fg, sub, cfg, {
      strokeSeed: 999,
      pressure: 0.9,
    });

    expect(dab1).toEqual(dab2);
    expect(nextStroke).not.toEqual(dab1);
  });

  it("보조색 필압 혼합은 필압 증가에 따라 전경색에서 보조색으로 단조 보간된다", () => {
    const cfg = normalizeStudioStrokeColorAndScaleConfig({
      subColorMixSource: "pressure",
      subColorMaxMix: 1,
      subColorCurve: 1,
    });
    const low = evaluateStudioStrokeAndSubColorRgb([0, 0, 0], [200, 100, 50], cfg, {
      strokeSeed: 1,
      pressure: 0,
    });
    const mid = evaluateStudioStrokeAndSubColorRgb([0, 0, 0], [200, 100, 50], cfg, {
      strokeSeed: 1,
      pressure: 0.5,
    });
    const high = evaluateStudioStrokeAndSubColorRgb([0, 0, 0], [200, 100, 50], cfg, {
      strokeSeed: 1,
      pressure: 1,
    });

    expect(low).toEqual([0, 0, 0]);
    expect(mid).toEqual([100, 50, 25]);
    expect(high).toEqual([200, 100, 50]);
  });

  it("화면 배율 연동 브러시 크기가 2배 확대 시 캔버스 지름을 절반으로 역보정한다", () => {
    expect(resolveViewScaleSyncedBrushSize(20, 2, false)).toBe(20);
    expect(resolveViewScaleSyncedBrushSize(20, 2, true)).toBeCloseTo(10, 5);
    expect(resolveViewScaleSyncedBrushSize(20, 0.5, true)).toBeCloseTo(40, 5);
  });
});
