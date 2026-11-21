import { describe, expect, it } from "vitest";

import {
  applyBarrelTwistChiselNibToDabs,
  applyCentrifugalBristleTurnSplayToDabs,
  applyDipPenRailroadingToDabs,
  applyDynamicDualTip8ModeToDabs,
  resampleFlatStrokeWithCentripetalV2,
  resolveNaturalMediaDipPenNibId,
  resolveStrokeRgbTuple,
} from "./studio-brush-natural-media-dab-bridge";
import { planStudioDynamicBrush } from "./studio-brush-dynamics-plan";
import { DEFAULT_STUDIO_CSP_BRUSH_EXTENSIONS } from "./studio-brush-stroke-color-dynamics";

describe("studio-brush-natural-media-dab-bridge", () => {
  it("활성 전경/보조 hex·RGB를 파싱해 rgbTint 하드코딩 버그를 해소한다", () => {
    expect(resolveStrokeRgbTuple(null, "#102030", [0, 0, 0])).toEqual([16, 32, 48]);
    expect(resolveStrokeRgbTuple([250, 120, 40], null, [0, 0, 0])).toEqual([250, 120, 40]);

    const plan = planStudioDynamicBrush({
      points: [0, 0, 30, 10, 60, 0],
      pressures: [0.2, 0.6, 0.95],
      baseWidth: 10,
      baseOpacity: 1,
      foregroundHex: "#123456",
      secondaryHex: "#fedcba",
      settings: {
        cspBrushExtensions: {
          ...DEFAULT_STUDIO_CSP_BRUSH_EXTENSIONS,
          strokeColorAndScale: {
            perStrokeColorJitter: false,
            strokeHueJitterDeg: 0,
            strokeSaturationJitter: 0,
            strokeValueJitter: 0,
            subColorMixSource: "pressure",
            subColorMaxMix: 1,
            subColorCurve: 1,
            subColorInvert: false,
            syncSizeWithViewScale: false,
          },
        },
      },
    });
    expect(plan.dabs.length).toBeGreaterThan(2);
    const lastTint = plan.dabs.at(-1)?.rgbTint;
    expect(lastTint).toBeDefined();
    // 고필압(0.95)이므로 보조색 #fedcba (254, 220, 186)에 매우 근접해야 함 (이전 하드코딩 [220,96,64]가 아님)
    expect(lastTint![0]).toBeGreaterThan(230);
    expect(lastTint![1]).toBeGreaterThan(195);
    expect(lastTint![2]).toBeGreaterThan(165);
  });

  it("구심 Catmull-Rom V2 리샘플러와 딥펜 레일로딩·8모드 듀얼팁·원심 스플레이·3D 치즐 투영이 실구동한다", () => {
    const resampled = resampleFlatStrokeWithCentripetalV2({
      points: [0, 40, 30, 5, 60, 45, 95, 10],
      pressures: [0.3, 0.7, 0.9, 0.4],
      spacingPx: 4,
    });
    expect(resampled).not.toBeNull();
    expect(resampled!.points.length).toBeGreaterThan(16);

    expect(resolveNaturalMediaDipPenNibId("kaburapen")).toBe("kabura-pen");
    expect(resolveNaturalMediaDipPenNibId("school-pen")).toBe("school-pen");

    const basePlan = planStudioDynamicBrush({
      points: [0, 0, 40, 0, 80, 35, 120, 10],
      pressures: [0.95, 0.95, 0.95, 0.95],
      speeds: [1.8, 2.2, 2.5, 2.5],
      baseWidth: 12,
      baseOpacity: 1,
      curveResampler: "centripetal-v2",
    });

    const dipDabs = applyDipPenRailroadingToDabs(basePlan.dabs, "g-pen", {
      pressures: [0.95, 0.95, 0.95, 0.95],
      speeds: [2.5, 2.5, 2.5, 2.5],
      baseWidthPx: 12,
    });
    expect(dipDabs.length).toBeGreaterThan(0);

    const dualDabs = applyDynamicDualTip8ModeToDabs(basePlan.dabs, {
      enabled: true,
      mode: "linear-height-subtract",
      depth01: 0.8,
      seed: 99,
    });
    expect(dualDabs.some((d) => (d.dualTipAlphaScale ?? 1) < 0.98)).toBe(true);

    const splayed = applyCentrifugalBristleTurnSplayToDabs(basePlan.dabs, 0.4, [1.5, 1.5, 1.5, 1.5]);
    expect(splayed.some((d) => (d.centrifugalSplayRatio ?? 1) > 1.05)).toBe(true);

    const broad = applyBarrelTwistChiselNibToDabs(
      [{ ...basePlan.dabs[0]!, direction: 0, size: 24 }],
      { enabled: true, nibThicknessRatio01: 0.14 },
      { twists: [90] },
    );
    const edge = applyBarrelTwistChiselNibToDabs(
      [{ ...basePlan.dabs[0]!, direction: 0, size: 24 }],
      { enabled: true, nibThicknessRatio01: 0.14 },
      { twists: [0] },
    );
    expect((broad[0]!.chiselProjectedWidthPx ?? 0) / Math.max(0.1, edge[0]!.chiselProjectedWidthPx ?? 1)).toBeGreaterThan(4);
  });
});
