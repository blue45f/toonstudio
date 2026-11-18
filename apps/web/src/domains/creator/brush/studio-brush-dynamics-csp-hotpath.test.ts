import { describe, expect, it } from "vitest";

import { planStudioDynamicBrush } from "./studio-brush-dynamics-plan";
import { DEFAULT_STUDIO_CSP_BRUSH_EXTENSIONS } from "./studio-brush-stroke-color-dynamics";

describe("planStudioDynamicBrush — cspBrushExtensions live hotpath", () => {
  it("cspBrushExtensions가 활성화되면 모서리 뾰족화·괘선·들어가기/빼기·체류 농도·패턴·보조색을 실제 실행한다", () => {
    const baseline = planStudioDynamicBrush({
      points: [0, 0, 60, 0, 60, 60],
      pressures: [0.4, 0.8, 0.3],
      speeds: [0.2, 0.5, 1.2],
      baseWidth: 10,
      baseOpacity: 1,
    });
    expect(baseline.dabs[0]?.rgbTint).toBeUndefined();
    expect(baseline.patternMotifId).toBeUndefined();

    // 1) 뾰족한 모서리 + 시작/끝 감쇠 + 체류 농도 + 보조색 혼합 + 리본 패턴 동시 실행 검증
    const enriched = planStudioDynamicBrush({
      points: [0, 0, 60, 0, 60, 60],
      pressures: [0.25, 0.85, 0.9],
      speeds: [0.2, 0.5, 1.1],
      baseWidth: 10,
      baseOpacity: 1,
      seed: 77,
      settings: {
        cspBrushExtensions: {
          ...DEFAULT_STUDIO_CSP_BRUSH_EXTENSIONS,
          inOutTaper: {
            ...DEFAULT_STUDIO_CSP_BRUSH_EXTENSIONS.inOutTaper,
            useIn: true,
            inLength: 24,
            useOut: true,
            outLength: 24,
          },
          sharpCorner: {
            ...DEFAULT_STUDIO_CSP_BRUSH_EXTENSIONS.sharpCorner,
            enabled: true,
          },
          dwellBuildup: {
            ...DEFAULT_STUDIO_CSP_BRUSH_EXTENSIONS.dwellBuildup,
            enabled: true,
            intervalMs: 20,
          },
          ruledLine: {
            ...DEFAULT_STUDIO_CSP_BRUSH_EXTENSIONS.ruledLine,
            mode: "waved",
            wavelengthPx: 24,
            amplitudePx: 4,
          },
          patternBrush: {
            ...DEFAULT_STUDIO_CSP_BRUSH_EXTENSIONS.patternBrush,
            motif: "lace",
            ribbon: true,
          },
          strokeColorAndScale: {
            ...DEFAULT_STUDIO_CSP_BRUSH_EXTENSIONS.strokeColorAndScale,
            subColorMixSource: "pressure",
            subColorMaxMix: 0.8,
            perStrokeColorJitter: true,
            strokeHueJitterDeg: 20,
          },
        },
      },
    });

    // 모서리 보강 + 물결 괘선으로 전체 호길이가 직각 기준(120px)보다 증가한다.
    expect(enriched.totalLength).toBeGreaterThan(baseline.totalLength);
    expect(enriched.patternMotifId).toBe("lace");
    expect(enriched.patternRibbonQuadCount).toBeGreaterThan(0);
    expect(enriched.dabs.length).toBeGreaterThan(2);
    expect(enriched.dabs[0]?.rgbTint).toHaveLength(3);
    // 들어가기 감쇠로 첫 댑의 크기가 기본 계획보다 작아진다.
    expect(enriched.dabs[0]!.size).toBeLessThan(baseline.dabs[0]!.size);

    // 2) 비리본 패턴 스탬프 및 파선(dashed) 여백 제거 검증
    const stamped = planStudioDynamicBrush({
      points: [0, 0, 120, 0],
      baseWidth: 12,
      baseOpacity: 1,
      settings: {
        cspBrushExtensions: {
          ...DEFAULT_STUDIO_CSP_BRUSH_EXTENSIONS,
          patternBrush: {
            ...DEFAULT_STUDIO_CSP_BRUSH_EXTENSIONS.patternBrush,
            motif: "sparkle",
            ribbon: false,
            spacingPx: 20,
            widthPx: 14,
          },
        },
      },
    });
    expect(stamped.patternMotifId).toBe("sparkle");
    expect(stamped.dabs.every((d) => d.patternMotifId === "sparkle")).toBe(true);
    expect(stamped.dabs[0]?.size).toBe(14);
  });
});
